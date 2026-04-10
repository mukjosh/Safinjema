/* ─────────────────────────────────────────────────────────────
   mailer.js  –  Nodemailer transporter + email templates
   ───────────────────────────────────────────────────────────── */
   const nodemailer = require('nodemailer');

   /* ── Transporter ── */
   const transporter = nodemailer.createTransport({
     host:   process.env.SMTP_HOST   || 'smtp.office365.com',
     port:   parseInt(process.env.SMTP_PORT || '587'),
     secure: process.env.SMTP_SECURE === 'true',
     auth: {
       user: process.env.SMTP_USER || 'safinjema@outlook.com',
       pass: process.env.SMTP_PASS || '',
     },
     tls: { rejectUnauthorized: false },
   });
   
   const FROM = `"SaFi Njema Cleaning" <${process.env.SMTP_USER || 'safinjema@outlook.com'}>`;
   
   /* ── Shared HTML wrapper ── */
   function wrap(content) {
     return `
   <!DOCTYPE html>
   <html>
   <head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width,initial-scale=1">
   <style>
     body{margin:0;padding:0;background:#f0f4f0;font-family:'Outfit',Arial,sans-serif;}
     .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}
     .hdr{background:linear-gradient(135deg,#1a6b3c,#2d9e60);padding:32px 36px;text-align:center;}
     .hdr h1{color:#fff;font-size:22px;margin:8px 0 0;font-weight:600;}
     .hdr p{color:rgba(255,255,255,.8);font-size:13px;margin:6px 0 0;}
     .body{padding:32px 36px;}
     .row{display:flex;gap:8px;margin-bottom:8px;}
     .label{font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.5px;min-width:110px;}
     .value{font-size:14px;color:#1a1a1a;}
     .badge{display:inline-block;padding:4px 14px;border-radius:50px;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
     .badge-pending{background:#fff3cd;color:#856404;}
     .badge-confirmed{background:#d1e7dd;color:#0f5132;}
     .divider{border:none;border-top:1px solid #eee;margin:24px 0;}
     .btn{display:inline-block;background:linear-gradient(135deg,#1a6b3c,#2d9e60);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px;}
     .footer{background:#f8faf8;padding:20px 36px;text-align:center;font-size:12px;color:#888;}
     .green{color:#2d9e60;font-weight:600;}
     table{width:100%;border-collapse:collapse;}
     td{padding:10px 12px;font-size:14px;border-bottom:1px solid #f0f0f0;}
     td:first-child{font-weight:600;color:#555;width:38%;background:#fafafa;}
     .highlight{background:#f0faf4;border-left:4px solid #2d9e60;padding:16px 20px;border-radius:0 8px 8px 0;margin:16px 0;}
   </style>
   </head>
   <body>
   <div class="wrap">
     <div class="hdr">
       <div style="font-size:28px;">🌿</div>
       <h1>SaFi Njema Cleaning Services</h1>
       <p>Professional Eco-Friendly Cleaning · Cape Town</p>
     </div>
     <div class="body">${content}</div>
     <div class="footer">
       <p>📞 +27 71 359 9995 &nbsp;|&nbsp; ✉️ safinjema@outlook.com &nbsp;|&nbsp; 📍 Cape Town, South Africa</p>
       <p style="margin-top:8px;">© 2026 SaFi Njema Cleaning Services &nbsp;·&nbsp; Eco-Friendly Solutions 🌿</p>
     </div>
   </div>
   </body>
   </html>`;
   }
   
   /* ════════════════════════════════════════
      EMAIL TEMPLATES
      ════════════════════════════════════════ */
   
   /** 1. Customer booking confirmation */
   function bookingConfirmationEmail(booking) {
     const html = wrap(`
       <h2 style="color:#1a6b3c;margin-top:0;">Booking Confirmed! 🎉</h2>
       <p>Hi <strong>${booking.name}</strong>, we've received your booking request. Our team will confirm within <strong>30 minutes</strong>.</p>
       <div class="highlight">
         <strong>Booking Reference: <span class="green">${booking.booking_ref}</span></strong><br>
         <span style="font-size:13px;color:#666;">Please keep this for your records.</span>
       </div>
       <hr class="divider">
       <h3 style="color:#333;font-size:16px;margin-bottom:16px;">Booking Details</h3>
       <table>
         <tr><td>Service</td><td>${booking.service}</td></tr>
         <tr><td>Date</td><td>${booking.date}</td></tr>
         <tr><td>Time</td><td>${booking.time}</td></tr>
         <tr><td>Area</td><td>${booking.area || 'To be confirmed'}</td></tr>
         <tr><td>Status</td><td><span class="badge badge-pending">Pending Confirmation</span></td></tr>
       </table>
       <hr class="divider">
       <p style="font-size:14px;color:#555;">Need to make changes or have questions?</p>
       <a href="https://wa.me/27713599995?text=Hi%20SaFi%20Njema!%20My%20booking%20ref%20is%20${booking.booking_ref}" class="btn">
         💬 Chat on WhatsApp
       </a>
       <p style="font-size:12px;color:#999;margin-top:20px;">You'll receive another email once your booking is confirmed by our team.</p>
     `);
     return {
       from: FROM,
       to:   booking.email,
       subject: `✅ Booking Request Received – ${booking.booking_ref} | SaFi Njema`,
       html,
       text: `Hi ${booking.name}, your SaFi Njema booking (${booking.booking_ref}) for ${booking.service} on ${booking.date} at ${booking.time} has been received. We'll confirm within 30 minutes.`
     };
   }
   
   /** 2. Admin new booking alert */
   function adminBookingAlert(booking) {
     const html = wrap(`
       <h2 style="color:#1a6b3c;margin-top:0;">🔔 New Booking Request</h2>
       <table>
         <tr><td>Reference</td><td><strong class="green">${booking.booking_ref}</strong></td></tr>
         <tr><td>Client Name</td><td>${booking.name}</td></tr>
         <tr><td>Phone</td><td><a href="tel:${booking.phone}">${booking.phone}</a></td></tr>
         <tr><td>Email</td><td><a href="mailto:${booking.email}">${booking.email}</a></td></tr>
         <tr><td>Service</td><td><strong>${booking.service}</strong></td></tr>
         <tr><td>Date</td><td>${booking.date}</td></tr>
         <tr><td>Time</td><td>${booking.time}</td></tr>
         <tr><td>Area</td><td>${booking.area || '—'}</td></tr>
         <tr><td>Notes</td><td>${booking.notes || '—'}</td></tr>
         <tr><td>Submitted</td><td>${new Date().toLocaleString('en-ZA')}</td></tr>
       </table>
       <hr class="divider">
       <a href="https://wa.me/${booking.phone?.replace(/\D/g,'')}?text=Hi%20${encodeURIComponent(booking.name)}!%20This%20is%20SaFi%20Njema.%20We've%20received%20your%20booking%20request%20(${booking.booking_ref})%20and%20are%20confirming%20your%20${encodeURIComponent(booking.service)}%20appointment." class="btn">
         💬 WhatsApp Client
       </a>
     `);
     return {
       from:    FROM,
       to:      process.env.ADMIN_EMAIL || 'safinjema@outlook.com',
       subject: `🔔 NEW BOOKING: ${booking.service} – ${booking.name} (${booking.booking_ref})`,
       html,
       text: `New booking from ${booking.name} (${booking.phone}) for ${booking.service} on ${booking.date} @ ${booking.time}. Ref: ${booking.booking_ref}`
     };
   }
   
   /** 3. Booking status update to customer */
   function bookingStatusEmail(booking) {
     const statusMap = {
       confirmed:   { label: '✅ Confirmed',   color: '#0f5132', bg: '#d1e7dd', msg: 'Great news! Your booking has been confirmed by our team.' },
       in_progress: { label: '🔄 In Progress', color: '#055160', bg: '#cff4fc', msg: 'Our team is currently on their way to your location.' },
       completed:   { label: '🏆 Completed',   color: '#1a6b3c', bg: '#d1e7dd', msg: 'Your cleaning is complete. We hope you love the results!' },
       cancelled:   { label: '❌ Cancelled',   color: '#842029', bg: '#f8d7da', msg: 'Your booking has been cancelled. Please contact us if this was an error.' },
     };
     const s = statusMap[booking.status] || { label: booking.status, color: '#333', bg: '#eee', msg: 'Your booking status has been updated.' };
     const html = wrap(`
       <h2 style="color:#1a6b3c;margin-top:0;">Booking Update</h2>
       <p>Hi <strong>${booking.name}</strong>, ${s.msg}</p>
       <div class="highlight">
         <strong>Ref: <span class="green">${booking.booking_ref}</span></strong> &nbsp;
         <span class="badge" style="background:${s.bg};color:${s.color};">${s.label}</span>
       </div>
       <table>
         <tr><td>Service</td><td>${booking.service}</td></tr>
         <tr><td>Date</td><td>${booking.date}</td></tr>
         <tr><td>Time</td><td>${booking.time}</td></tr>
         ${booking.assigned_to ? `<tr><td>Assigned To</td><td>${booking.assigned_to}</td></tr>` : ''}
       </table>
       <hr class="divider">
       <a href="https://wa.me/27713599995" class="btn">💬 Contact Us</a>
     `);
     return {
       from:    FROM,
       to:      booking.email,
       subject: `Booking ${s.label} – ${booking.booking_ref} | SaFi Njema`,
       html,
       text: `Hi ${booking.name}, your booking ${booking.booking_ref} is now ${booking.status}.`
     };
   }
   
   /** 4. Contact form auto-reply */
   function contactAutoReply(contact) {
     const html = wrap(`
       <h2 style="color:#1a6b3c;margin-top:0;">Thanks for reaching out! 👋</h2>
       <p>Hi <strong>${contact.name}</strong>, we've received your message and will get back to you within <strong>24 hours</strong> (usually much sooner).</p>
       <div class="highlight">
         <strong>Your message:</strong><br>
         <span style="font-size:14px;color:#444;font-style:italic;">"${contact.message}"</span>
       </div>
       <hr class="divider">
       <p style="font-size:14px;color:#555;">For faster support, chat with us on WhatsApp:</p>
       <a href="https://wa.me/27713599995" class="btn">💬 Open WhatsApp</a>
     `);
     return {
       from:    FROM,
       to:      contact.email,
       subject: 'We received your message | SaFi Njema',
       html,
       text: `Hi ${contact.name}, thanks for your message. We'll reply within 24 hours. Phone: +27 71 359 9995`
     };
   }
   
   /** 5. Contact form alert to admin */
   function adminContactAlert(contact) {
     const html = wrap(`
       <h2 style="color:#1a6b3c;margin-top:0;">📩 New Website Enquiry</h2>
       <table>
         <tr><td>Name</td><td>${contact.name}</td></tr>
         <tr><td>Email</td><td><a href="mailto:${contact.email}">${contact.email}</a></td></tr>
         <tr><td>Phone</td><td>${contact.phone || '—'}</td></tr>
         <tr><td>Service</td><td>${contact.service || '—'}</td></tr>
         <tr><td>Message</td><td>${contact.message}</td></tr>
       </table>
       <hr class="divider">
       <a href="mailto:${contact.email}?subject=Re: Your SaFi Njema Enquiry" class="btn">📧 Reply by Email</a>
     `);
     return {
       from:    FROM,
       to:      process.env.ADMIN_EMAIL || 'safinjema@outlook.com',
       subject: `📩 Website Enquiry from ${contact.name}`,
       html,
       text: `New enquiry from ${contact.name} (${contact.email}): ${contact.message}`
     };
   }
   
   /** 6. Password reset email */
   function passwordResetEmail(user, token) {
     const resetUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5000'}/reset-password.html?token=${token}`;
     const html = wrap(`
       <h2 style="color:#1a6b3c;margin-top:0;">Password Reset Request 🔐</h2>
       <p>Hi <strong>${user.name}</strong>, we received a request to reset your SaFi Njema password.</p>
       <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
       <a href="${resetUrl}" class="btn">🔑 Reset My Password</a>
       <p style="font-size:12px;color:#999;margin-top:20px;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
     `);
     return {
       from:    FROM,
       to:      user.email,
       subject: 'Reset your SaFi Njema password',
       html,
       text: `Hi ${user.name}, reset your password here: ${resetUrl} (expires in 1 hour)`
     };
   }
   
   /** 7. Welcome email on registration */
   function welcomeEmail(user) {
     const html = wrap(`
       <h2 style="color:#1a6b3c;margin-top:0;">Welcome to SaFi Njema! 🌿</h2>
       <p>Hi <strong>${user.name}</strong>, your account has been created successfully.</p>
       <div class="highlight">
         You can now book cleaning services, track your appointments, and manage everything from your account dashboard.
       </div>
       <hr class="divider">
       <a href="${process.env.FRONTEND_ORIGIN || 'http://localhost:5000'}/Book.html" class="btn">📅 Book Your First Clean</a>
       <p style="font-size:14px;color:#888;margin-top:20px;">Questions? Reply to this email or WhatsApp us at +27 71 359 9995.</p>
     `);
     return {
       from:    FROM,
       to:      user.email,
       subject: 'Welcome to SaFi Njema Cleaning Services 🌿',
       html,
       text: `Welcome ${user.name}! Your SaFi Njema account is ready. Book at safinjema.co.za`
     };
   }
   
   /* ── Send helper (won't crash if SMTP isn't configured) ── */
   async function send(mailOptions) {
     try {
       const info = await transporter.sendMail(mailOptions);
       console.log(`📧 Email sent to ${mailOptions.to} — ${info.messageId}`);
       return { ok: true, messageId: info.messageId };
     } catch (err) {
       console.error(`❌ Email failed to ${mailOptions.to}:`, err.message);
       return { ok: false, error: err.message };
     }
   }
   
   module.exports = {
     send,
     bookingConfirmationEmail,
     adminBookingAlert,
     bookingStatusEmail,
     contactAutoReply,
     adminContactAlert,
     passwordResetEmail,
     welcomeEmail,
   };