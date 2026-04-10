/* ─────────────────────────────────────────────────────────────
   db.js  –  SQLite database setup for SaFi Njema backend
   ───────────────────────────────────────────────────────────── */
   const Database = require('better-sqlite3');
   const path     = require('path');
   
   const DB_PATH = path.join(__dirname, 'data', 'safinjema.db');
   
   // Create data directory if needed
   const fs = require('fs');
   const dataDir = path.join(__dirname, 'data');
   if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
   
   const db = new Database(DB_PATH);
   
   // Enable WAL for better concurrent performance
   db.pragma('journal_mode = WAL');
   db.pragma('foreign_keys = ON');
   
   /* ── SCHEMA ── */
   db.exec(`
     /* Users table */
     CREATE TABLE IF NOT EXISTS users (
       id          INTEGER PRIMARY KEY AUTOINCREMENT,
       name        TEXT    NOT NULL,
       email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
       phone       TEXT,
       password    TEXT    NOT NULL,
       role        TEXT    NOT NULL DEFAULT 'customer',  -- 'customer' | 'admin'
       verified    INTEGER NOT NULL DEFAULT 0,
       created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
       updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
     );
   
     /* Bookings table */
     CREATE TABLE IF NOT EXISTS bookings (
       id           INTEGER PRIMARY KEY AUTOINCREMENT,
       booking_ref  TEXT    NOT NULL UNIQUE,
       user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
       name         TEXT    NOT NULL,
       email        TEXT    NOT NULL,
       phone        TEXT    NOT NULL,
       service      TEXT    NOT NULL,
       date         TEXT    NOT NULL,
       time         TEXT    NOT NULL,
       area         TEXT,
       notes        TEXT,
       status       TEXT    NOT NULL DEFAULT 'pending',  -- pending | confirmed | in_progress | completed | cancelled
       assigned_to  TEXT,
       price        REAL,
       created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
       updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
     );
   
     /* Contact messages table */
     CREATE TABLE IF NOT EXISTS messages (
       id           INTEGER PRIMARY KEY AUTOINCREMENT,
       name         TEXT NOT NULL,
       email        TEXT NOT NULL,
       phone        TEXT,
       service      TEXT,
       message      TEXT NOT NULL,
       status       TEXT NOT NULL DEFAULT 'unread',  -- unread | read | replied
       created_at   TEXT NOT NULL DEFAULT (datetime('now'))
     );
   
     /* Password reset tokens */
     CREATE TABLE IF NOT EXISTS reset_tokens (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       token      TEXT    NOT NULL UNIQUE,
       expires_at TEXT    NOT NULL,
       used       INTEGER NOT NULL DEFAULT 0,
       created_at TEXT    NOT NULL DEFAULT (datetime('now'))
     );
   
     /* Audit log */
     CREATE TABLE IF NOT EXISTS audit_log (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       actor      TEXT,
       action     TEXT NOT NULL,
       entity     TEXT,
       entity_id  TEXT,
       detail     TEXT,
       ip         TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     );
   `);
   
   /* ── INDEXES ── */
   db.exec(`
     CREATE INDEX IF NOT EXISTS idx_bookings_email  ON bookings(email);
     CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
     CREATE INDEX IF NOT EXISTS idx_bookings_date   ON bookings(date);
     CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
     CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
   `);
   
   /* ── SEED: default admin user (created once) ── */
   const bcrypt  = require('bcryptjs');
   const adminRow = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
   if (!adminRow) {
     const adminPass = process.env.ADMIN_PASSWORD || 'SafiNjema@Admin2026';
     const hash      = bcrypt.hashSync(adminPass, 12);
     db.prepare(`
       INSERT INTO users (name, email, phone, password, role, verified)
       VALUES (?, ?, ?, ?, 'admin', 1)
     `).run(
       'SaFi Admin',
       process.env.ADMIN_EMAIL || 'safinjema@outlook.com',
       '+27713599995',
       hash
     );
     console.log('✅  Default admin user created.');
   }
   
   /* ── HELPERS ── */
   
   /** Generate a booking reference like SN-20260323-0042 */
   function generateBookingRef() {
     const date  = new Date().toISOString().slice(0,10).replace(/-/g,'');
     const count = (db.prepare('SELECT COUNT(*) as c FROM bookings').get().c + 1)
                   .toString().padStart(4,'0');
     return `SN-${date}-${count}`;
   }
   
   /** Log an audit event */
   function audit(actor, action, entity, entityId, detail, ip) {
     db.prepare(`
       INSERT INTO audit_log (actor, action, entity, entity_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?)
     `).run(actor || 'system', action, entity || null, entityId?.toString() || null,
            detail || null, ip || null);
   }
   
   module.exports = { db, generateBookingRef, audit };