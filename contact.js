/* ─────────────────────────────────────────────────────────────
   routes/contact.js  –  Contact & quote form
   POST /api/contact
   ───────────────────────────────────────────────────────────── */
   const express   = require('express');
   const validator = require('validator');
   const router    = express.Router();
   
   const { db, audit } = require('../db');
   const mailer        = require('../mailer');
   
   router.post('/', async (req, res) => {
     try {
       const { name, email, phone, service, message } = req.body;
       if (!name || !email || !message)
         return res.status(400).json({ success: false, message: 'Name, email and message are required.' });
       if (!validator.isEmail(email))
         return res.status(400).json({ success: false, message: 'Invalid email address.' });
       if (message.trim().length < 5)
         return res.status(400).json({ success: false, message: 'Message is too short.' });
   
       const result = db.prepare(
         'INSERT INTO messages (name, email, phone, service, message) VALUES (?, ?, ?, ?, ?)'
       ).run(name.trim(), email.trim().toLowerCase(), phone?.trim() || null,
             service?.trim() || null, message.trim());
   
       audit(email, 'CONTACT_FORM', 'messages', result.lastInsertRowid, null, req.ip);
   
       // Emails
       mailer.send(mailer.contactAutoReply({ name, email, message }));
       mailer.send(mailer.adminContactAlert({ name, email, phone, service, message }));
   
       res.status(201).json({
         success: true,
         message: "Message received! We'll reply within 24 hours.",
       });
     } catch (err) {
       console.error('Contact form error:', err);
       res.status(500).json({ success: false, message: 'Server error.' });
     }
   });
   
   module.exports = router;