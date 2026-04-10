/* ─────────────────────────────────────────────────────────────
   routes/admin.js  –  Admin-only management routes
   All routes require: authenticate + requireAdmin middleware

   GET    /api/admin/dashboard        – stats overview
   GET    /api/admin/bookings         – all bookings (filterable)
   GET    /api/admin/bookings/:id     – single booking by ID
   PUT    /api/admin/bookings/:id     – update booking (status, assigned, price)
   DELETE /api/admin/bookings/:id     – delete booking

   GET    /api/admin/messages         – all contact messages
   PUT    /api/admin/messages/:id     – update message status
   DELETE /api/admin/messages/:id     – delete message

   GET    /api/admin/users            – all users
   GET    /api/admin/users/:id        – single user + their bookings
   PUT    /api/admin/users/:id/role   – change user role
   DELETE /api/admin/users/:id        – delete user

   GET    /api/admin/audit            – audit log
   ───────────────────────────────────────────────────────────── */
   const express = require('express');
   const router  = express.Router();
   
   const { db, audit }                    = require('../db');
   const { authenticate, requireAdmin }   = require('../middleware/auth');
   const mailer                           = require('../mailer');
   
   // All admin routes require auth + admin role
   router.use(authenticate, requireAdmin);
   
   /* ═══════════════════════════════════
      DASHBOARD STATISTICS
      ═══════════════════════════════════ */
   router.get('/dashboard', (req, res) => {
     const totalBookings    = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
     const pendingBookings  = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'pending'").get().c;
     const confirmedBookings= db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'confirmed'").get().c;
     const completedBookings= db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'completed'").get().c;
     const cancelledBookings= db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'cancelled'").get().c;
     const totalUsers       = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'customer'").get().c;
     const totalMessages    = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
     const unreadMessages   = db.prepare("SELECT COUNT(*) as c FROM messages WHERE status = 'unread'").get().c;
     const totalRevenue     = db.prepare("SELECT COALESCE(SUM(price),0) as r FROM bookings WHERE status = 'completed' AND price IS NOT NULL").get().r;
   
     // Bookings by service (top 5)
     const byService = db.prepare(
       'SELECT service, COUNT(*) as count FROM bookings GROUP BY service ORDER BY count DESC LIMIT 5'
     ).all();
   
     // Last 7 days booking counts
     const last7Days = db.prepare(`
       SELECT date(created_at) as day, COUNT(*) as count
       FROM bookings
       WHERE created_at >= date('now', '-6 days')
       GROUP BY day ORDER BY day
     `).all();
   
     // Recent bookings (last 10)
     const recentBookings = db.prepare(
       'SELECT booking_ref, name, service, date, time, status, created_at FROM bookings ORDER BY created_at DESC LIMIT 10'
     ).all();
   
     // Upcoming bookings (next 7 days, confirmed or pending)
     const upcomingBookings = db.prepare(`
       SELECT booking_ref, name, phone, service, date, time, area, status
       FROM bookings
       WHERE date >= date('now') AND date <= date('now', '+7 days')
       AND status IN ('pending','confirmed')
       ORDER BY date, time
     `).all();
   
     res.json({
       success: true,
       stats: {
         bookings: {
           total: totalBookings, pending: pendingBookings,
           confirmed: confirmedBookings, completed: completedBookings,
           cancelled: cancelledBookings,
         },
         customers: totalUsers,
         messages:  { total: totalMessages, unread: unreadMessages },
         revenue:   totalRevenue,
       },
       byService,
       last7Days,
       recentBookings,
       upcomingBookings,
     });
   });
   
   /* ═══════════════════════════════════
      BOOKINGS
      ═══════════════════════════════════ */
   
   /** GET all bookings with optional filters */
   router.get('/bookings', (req, res) => {
     const { status, service, date, search, page = 1, limit = 20 } = req.query;
     const offset = (parseInt(page) - 1) * parseInt(limit);
   
     let where = [];
     let params = [];
   
     if (status)  { where.push('b.status = ?');  params.push(status); }
     if (service) { where.push('b.service = ?'); params.push(service); }
     if (date)    { where.push('b.date = ?');    params.push(date); }
     if (search)  {
       where.push('(b.name LIKE ? OR b.email LIKE ? OR b.phone LIKE ? OR b.booking_ref LIKE ?)');
       const q = `%${search}%`;
       params.push(q, q, q, q);
     }
   
     const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
   
     const total = db.prepare(
       `SELECT COUNT(*) as c FROM bookings b ${whereClause}`
     ).get(...params).c;
   
     const bookings = db.prepare(
       `SELECT b.*, u.name as user_name FROM bookings b
        LEFT JOIN users u ON u.id = b.user_id
        ${whereClause} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`
     ).all(...params, parseInt(limit), offset);
   
     res.json({
       success: true, total,
       page: parseInt(page), limit: parseInt(limit),
       totalPages: Math.ceil(total / parseInt(limit)),
       bookings,
     });
   });
   
   /** GET single booking */
   router.get('/bookings/:id', (req, res) => {
     const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
     if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
     res.json({ success: true, booking });
   });
   
   /** UPDATE booking (status, assigned_to, price, notes) */
   router.put('/bookings/:id', (req, res) => {
     const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
     if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
   
     const VALID_STATUSES = ['pending','confirmed','in_progress','completed','cancelled'];
     const { status, assigned_to, price, notes, date, time, area } = req.body;
   
     if (status && !VALID_STATUSES.includes(status))
       return res.status(400).json({ success: false, message: 'Invalid status.' });
   
     db.prepare(`
       UPDATE bookings SET
         status      = COALESCE(?, status),
         assigned_to = COALESCE(?, assigned_to),
         price       = COALESCE(?, price),
         notes       = COALESCE(?, notes),
         date        = COALESCE(?, date),
         time        = COALESCE(?, time),
         area        = COALESCE(?, area),
         updated_at  = datetime('now')
       WHERE id = ?
     `).run(
       status ?? null, assigned_to ?? null,
       price != null ? parseFloat(price) : null,
       notes ?? null, date ?? null, time ?? null, area ?? null,
       req.params.id
     );
   
     const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
     audit(req.user.email, 'UPDATE_BOOKING', 'bookings', booking.id, `status→${status}`, req.ip);
   
     // Notify customer on status change
     if (status && status !== booking.status) {
       mailer.send(mailer.bookingStatusEmail(updated));
     }
   
     res.json({ success: true, message: 'Booking updated.', booking: updated });
   });
   
   /** DELETE booking */
   router.delete('/bookings/:id', (req, res) => {
     const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
     if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
     db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
     audit(req.user.email, 'DELETE_BOOKING', 'bookings', req.params.id, booking.booking_ref, req.ip);
     res.json({ success: true, message: 'Booking deleted.' });
   });
   
   /* ═══════════════════════════════════
      MESSAGES
      ═══════════════════════════════════ */
   
   router.get('/messages', (req, res) => {
     const { status, page = 1, limit = 20 } = req.query;
     const offset = (parseInt(page) - 1) * parseInt(limit);
     const where  = status ? 'WHERE status = ?' : '';
     const params = status ? [status] : [];
     const total  = db.prepare(`SELECT COUNT(*) as c FROM messages ${where}`).get(...params).c;
     const msgs   = db.prepare(`SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
     res.json({ success: true, total, messages: msgs });
   });
   
   router.put('/messages/:id', (req, res) => {
     const { status } = req.body;
     const VALID = ['unread','read','replied'];
     if (!VALID.includes(status))
       return res.status(400).json({ success: false, message: 'Invalid status.' });
     db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, req.params.id);
     res.json({ success: true, message: 'Message status updated.' });
   });
   
   router.delete('/messages/:id', (req, res) => {
     db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
     audit(req.user.email, 'DELETE_MESSAGE', 'messages', req.params.id, null, req.ip);
     res.json({ success: true, message: 'Message deleted.' });
   });
   
   /* ═══════════════════════════════════
      USERS
      ═══════════════════════════════════ */
   
   router.get('/users', (req, res) => {
     const { search, role, page = 1, limit = 20 } = req.query;
     const offset = (parseInt(page) - 1) * parseInt(limit);
     let where = []; let params = [];
     if (role)   { where.push('role = ?');  params.push(role); }
     if (search) {
       where.push('(name LIKE ? OR email LIKE ?)');
       params.push(`%${search}%`, `%${search}%`);
     }
     const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
     const total = db.prepare(`SELECT COUNT(*) as c FROM users ${w}`).get(...params).c;
     const users = db.prepare(
       `SELECT id, name, email, phone, role, verified, created_at FROM users ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`
     ).all(...params, parseInt(limit), offset);
     // Attach booking count per user
     const withBookings = users.map(u => ({
       ...u,
       booking_count: db.prepare('SELECT COUNT(*) as c FROM bookings WHERE user_id = ? OR email = ?').get(u.id, u.email).c
     }));
     res.json({ success: true, total, users: withBookings });
   });
   
   router.get('/users/:id', (req, res) => {
     const user = db.prepare('SELECT id, name, email, phone, role, verified, created_at FROM users WHERE id = ?').get(req.params.id);
     if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
     const bookings = db.prepare('SELECT * FROM bookings WHERE user_id = ? OR email = ? ORDER BY created_at DESC').all(user.id, user.email);
     res.json({ success: true, user, bookings });
   });
   
   router.put('/users/:id/role', (req, res) => {
     const { role } = req.body;
     if (!['customer','admin'].includes(role))
       return res.status(400).json({ success: false, message: 'Invalid role.' });
     if (parseInt(req.params.id) === req.user.id)
       return res.status(400).json({ success: false, message: "You can't change your own role." });
     db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, req.params.id);
     audit(req.user.email, 'CHANGE_ROLE', 'users', req.params.id, role, req.ip);
     res.json({ success: true, message: `Role updated to ${role}.` });
   });
   
   router.delete('/users/:id', (req, res) => {
     if (parseInt(req.params.id) === req.user.id)
       return res.status(400).json({ success: false, message: "You can't delete yourself." });
     db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
     audit(req.user.email, 'DELETE_USER', 'users', req.params.id, null, req.ip);
     res.json({ success: true, message: 'User deleted.' });
   });
   
   /* ═══════════════════════════════════
      AUDIT LOG
      ═══════════════════════════════════ */
   router.get('/audit', (req, res) => {
     const { page = 1, limit = 50 } = req.query;
     const offset = (parseInt(page) - 1) * parseInt(limit);
     const total  = db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
     const logs   = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(parseInt(limit), offset);
     res.json({ success: true, total, logs });
   });
   
   module.exports = router;