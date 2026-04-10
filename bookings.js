/* ─────────────────────────────────────────────────────────────
   routes/bookings.js  –  Booking CRUD
   POST   /api/bookings           – create booking
   GET    /api/bookings/my        – customer's own bookings
   GET    /api/bookings/:ref      – booking by reference
   PUT    /api/bookings/:ref/cancel  – customer cancel
   ───────────────────────────────────────────────────────────── */
   const express   = require('express');
   const validator = require('validator');
   const router    = express.Router();
   
   const { db, generateBookingRef, audit } = require('../db');
   const { authenticate, optionalAuth }    = require('../middleware/auth');
   const mailer = require('../mailer');
   
   const VALID_SERVICES = [
     'Carpet Cleaning','Couch / Upholstery Cleaning','Mattress Cleaning',
     'Window Cleaning','Deep Home Cleaning','Post-Construction Cleaning',
     'Commercial / Office Cleaning','Industrial Cleaning','Events Cleaning',
     'Pest Control','Solar Panel Cleaning','Bin Cleaning',
   ];
   
   const VALID_TIMES = [
     '7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM',
     '1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM',
   ];
   
   /* ── CREATE BOOKING ── */
   router.post('/', optionalAuth, async (req, res) => {
     try {
       const { name, email, phone, service, date, time, area, notes } = req.body;
   
       // Required field validation
       if (!name || !email || !phone || !service || !date || !time)
         return res.status(400).json({ success: false, message: 'Name, email, phone, service, date and time are required.' });
       if (!validator.isEmail(email))
         return res.status(400).json({ success: false, message: 'Invalid email address.' });
       if (!VALID_SERVICES.includes(service))
         return res.status(400).json({ success: false, message: 'Invalid service selected.' });
       if (!VALID_TIMES.includes(time))
         return res.status(400).json({ success: false, message: 'Invalid time selected.' });
   
       // Date must be today or future
       const bookingDate = new Date(date);
       const today       = new Date(); today.setHours(0,0,0,0);
       if (isNaN(bookingDate) || bookingDate < today)
         return res.status(400).json({ success: false, message: 'Please select a valid future date.' });
   
       const booking_ref = generateBookingRef();
       const userId      = req.user?.id || null;
   
       db.prepare(`
         INSERT INTO bookings (booking_ref, user_id, name, email, phone, service, date, time, area, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       `).run(booking_ref, userId,
              name.trim(), email.trim().toLowerCase(), phone.trim(),
              service, date, time,
              area?.trim() || null, notes?.trim() || null);
   
       const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref = ?').get(booking_ref);
       audit(email, 'CREATE_BOOKING', 'bookings', booking.id, booking_ref, req.ip);
   
       // Send emails (async – don't block)
       mailer.send(mailer.bookingConfirmationEmail(booking));
       mailer.send(mailer.adminBookingAlert(booking));
   
       res.status(201).json({
         success: true,
         message: 'Booking submitted! You will receive a confirmation email shortly.',
         booking_ref,
         booking,
       });
     } catch (err) {
       console.error('Create booking error:', err);
       res.status(500).json({ success: false, message: 'Server error. Please try again.' });
     }
   });
   
   /* ── GET MY BOOKINGS (logged-in customer) ── */
   router.get('/my', authenticate, (req, res) => {
     const bookings = db.prepare(
       `SELECT * FROM bookings WHERE user_id = ? OR email = ? ORDER BY created_at DESC`
     ).all(req.user.id, req.user.email);
     res.json({ success: true, bookings });
   });
   
   /* ── GET BOOKING BY REFERENCE ── */
   router.get('/:ref', optionalAuth, (req, res) => {
     const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref = ?').get(req.params.ref);
     if (!booking)
       return res.status(404).json({ success: false, message: 'Booking not found.' });
   
     // Only owner or admin can view
     if (req.user?.role !== 'admin' && booking.email !== req.user?.email)
       return res.status(403).json({ success: false, message: 'Access denied.' });
   
     res.json({ success: true, booking });
   });
   
   /* ── CUSTOMER CANCEL ── */
   router.put('/:ref/cancel', authenticate, (req, res) => {
     const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref = ?').get(req.params.ref);
     if (!booking)
       return res.status(404).json({ success: false, message: 'Booking not found.' });
     if (booking.email !== req.user.email && req.user.role !== 'admin')
       return res.status(403).json({ success: false, message: 'Access denied.' });
     if (['completed','cancelled'].includes(booking.status))
       return res.status(400).json({ success: false, message: `Cannot cancel a ${booking.status} booking.` });
   
     db.prepare(`UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE booking_ref = ?`).run(req.params.ref);
     const updated = db.prepare('SELECT * FROM bookings WHERE booking_ref = ?').get(req.params.ref);
     audit(req.user.email, 'CANCEL_BOOKING', 'bookings', booking.id, booking.booking_ref, req.ip);
   
     mailer.send(mailer.bookingStatusEmail(updated));
     res.json({ success: true, message: 'Booking cancelled.', booking: updated });
   });
   
   module.exports = router;