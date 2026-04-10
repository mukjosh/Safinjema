/* ─────────────────────────────────────────────────────────────
   middleware/auth.js  –  JWT authentication middleware
   ───────────────────────────────────────────────────────────── */
   const jwt = require('jsonwebtoken');
   const { db } = require('../db');
   
   const SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';
   
   /**
    * Verifies Bearer token and attaches req.user
    */
   function authenticate(req, res, next) {
     const authHeader = req.headers.authorization;
     if (!authHeader || !authHeader.startsWith('Bearer ')) {
       return res.status(401).json({ success: false, message: 'No token provided.' });
     }
     const token = authHeader.slice(7);
     try {
       const decoded = jwt.verify(token, SECRET);
       // Confirm user still exists
       const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(decoded.id);
       if (!user) return res.status(401).json({ success: false, message: 'User not found.' });
       req.user = user;
       next();
     } catch (err) {
       return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
     }
   }
   
   /**
    * Requires admin role
    */
   function requireAdmin(req, res, next) {
     if (!req.user || req.user.role !== 'admin') {
       return res.status(403).json({ success: false, message: 'Admin access required.' });
     }
     next();
   }
   
   /**
    * Optional auth – doesn't fail if no token
    */
   function optionalAuth(req, res, next) {
     const authHeader = req.headers.authorization;
     if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
     try {
       const token   = authHeader.slice(7);
       const decoded = jwt.verify(token, SECRET);
       const user    = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(decoded.id);
       if (user) req.user = user;
     } catch (_) { /* ignore */ }
     next();
   }
   
   /** Sign a JWT for a user */
   function signToken(user) {
     return jwt.sign(
       { id: user.id, email: user.email, role: user.role },
       SECRET,
       { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
     );
   }
   
   module.exports = { authenticate, requireAdmin, optionalAuth, signToken };

   /* ─────────────────────────────────────────────────────────────
   routes/auth.js  –  Authentication routes
   POST /api/auth/register
   POST /api/auth/login
   GET  /api/auth/me
   PUT  /api/auth/profile
   POST /api/auth/forgot-password
   POST /api/auth/reset-password
   ───────────────────────────────────────────────────────────── */
const express   = require('express');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const validator = require('validator');
const router    = express.Router();

const { db, audit }       = require('../db');
const { authenticate, signToken } = require('../middleware/auth');
const mailer              = require('../mailer');

/* ── REGISTER ── */
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validation
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

    // Check duplicate
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (existing)
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });

    const hash = await bcrypt.hash(password, 12);
    const stmt = db.prepare(
      'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(name.trim(), email.trim().toLowerCase(), phone?.trim() || null, hash);
    const user   = db.prepare('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    const token = signToken(user);
    audit(user.email, 'REGISTER', 'users', user.id, null, req.ip);

    // Send welcome email (async – don't block response)
    mailer.send(mailer.welcomeEmail(user));

    res.status(201).json({ success: true, message: 'Account created successfully.', token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

/* ── LOGIN ── */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password required.' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user)
      return res.status(401).json({ success: false, message: 'Incorrect email or password.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ success: false, message: 'Incorrect email or password.' });

    const token = signToken(user);
    audit(user.email, 'LOGIN', 'users', user.id, null, req.ip);

    const { password: _, ...safeUser } = user;
    res.json({ success: true, message: 'Signed in successfully.', token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── GET CURRENT USER ── */
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(
    'SELECT id, name, email, phone, role, verified, created_at FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json({ success: true, user });
});

/* ── UPDATE PROFILE ── */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required.' });

    db.prepare(
      `UPDATE users SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(name.trim(), phone?.trim() || null, req.user.id);

    const updated = db.prepare('SELECT id, name, email, phone, role FROM users WHERE id = ?').get(req.user.id);
    audit(req.user.email, 'UPDATE_PROFILE', 'users', req.user.id, null, req.ip);
    res.json({ success: true, message: 'Profile updated.', user: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── CHANGE PASSWORD ── */
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: 'Both fields are required.' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });

    const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match)
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare(`UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, user.id);
    audit(user.email, 'CHANGE_PASSWORD', 'users', user.id, null, req.ip);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── FORGOT PASSWORD ── */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validator.isEmail(email))
      return res.status(400).json({ success: false, message: 'Valid email required.' });

    const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email.toLowerCase());
    // Always respond OK so we don't leak whether email exists
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

    const token    = crypto.randomBytes(32).toString('hex');
    const expires  = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Invalidate old tokens
    db.prepare('UPDATE reset_tokens SET used = 1 WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expires);

    mailer.send(mailer.passwordResetEmail(user, token));
    audit(email, 'FORGOT_PASSWORD', 'users', user.id, null, req.ip);

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── RESET PASSWORD ── */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword)
      return res.status(400).json({ success: false, message: 'Token and new password required.' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

    const row = db.prepare(
      `SELECT rt.*, u.name, u.email FROM reset_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token = ? AND rt.used = 0 AND rt.expires_at > datetime('now')`
    ).get(token);

    if (!row)
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link.' });

    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare(`UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, row.user_id);
    db.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(row.id);

    audit(row.email, 'RESET_PASSWORD', 'users', row.user_id, null, req.ip);
    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;