/* ═══════════════════════════════════════════════════════════════
   server.js  –  SaFi Njema Cleaning Services · Backend API
   Node.js + Express + SQLite
   ═══════════════════════════════════════════════════════════════ */
   require('dotenv').config();

   const express    = require('express');
   const cors       = require('cors');
   const helmet     = require('helmet');
   const morgan     = require('morgan');
   const rateLimit  = require('express-rate-limit');
   const path       = require('path');
   
   /* ── Init DB first (creates tables + default admin) ── */
   require('./db');
   
   const app  = express();
   const PORT = process.env.PORT || 5000;
   
   /* ════════════════════════════════════════
      GLOBAL MIDDLEWARE
      ════════════════════════════════════════ */
   
   /** Security headers */
   app.use(helmet({
     crossOriginEmbedderPolicy: false,
     contentSecurityPolicy: false,
   }));
   
   /** CORS */
   const allowedOrigins = [
     process.env.FRONTEND_ORIGIN || 'http://localhost:5500',
     'http://localhost:3000',
     'http://127.0.0.1:5500',
     'http://127.0.0.1:3000',
   ];
   app.use(cors({
     origin: (origin, cb) => {
       // Allow requests with no origin (mobile apps, curl, Postman)
       if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
       cb(new Error(`CORS: Origin ${origin} not allowed.`));
     },
     credentials: true,
   }));
   
   /** Body parsing */
   app.use(express.json({ limit: '10kb' }));
   app.use(express.urlencoded({ extended: true, limit: '10kb' }));
   
   /** Logging */
   if (process.env.NODE_ENV !== 'test') {
     app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
   }
   
   /** Global rate limiting (100 requests per 15 min per IP) */
   app.use('/api/', rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 100,
     standardHeaders: true,
     legacyHeaders: false,
     message: { success: false, message: 'Too many requests. Please try again later.' },
   }));
   
   /** Stricter rate limit for auth routes (20 per 15 min) */
   app.use('/api/auth/', rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 20,
     message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' },
   }));
   
   /** Stricter rate limit for contact/booking forms (10 per hour) */
   app.use(['/api/bookings', '/api/contact'], rateLimit({
     windowMs: 60 * 60 * 1000,
     max: 10,
     message: { success: false, message: 'Too many submissions. Please try again later.' },
   }));
   
   /* ════════════════════════════════════════
      API ROUTES
      ════════════════════════════════════════ */
   app.use('/api/auth',     require('./routes/auth'));
   app.use('/api/bookings', require('./routes/bookings'));
   app.use('/api/contact',  require('./routes/contact'));
   app.use('/api/quotes',   require('./routes/quotes').router);
   app.use('/api/admin',    require('./routes/admin'));
   
   /* ════════════════════════════════════════
      SERVE STATIC FRONTEND (optional)
      Drop your HTML/CSS/JS files in /public
      ════════════════════════════════════════ */
   const publicPath = path.join(__dirname, 'public');
   app.use(express.static(publicPath));
   
   /* ════════════════════════════════════════
      HEALTH CHECK
      ════════════════════════════════════════ */
   app.get('/api/health', (req, res) => {
     res.json({
       success: true,
       service: 'SaFi Njema Backend API',
       version: '1.0.0',
       status:  'running',
       time:    new Date().toISOString(),
     });
   });
   
   /* ════════════════════════════════════════
      API ROUTE MAP (dev helper)
      ════════════════════════════════════════ */
   app.get('/api', (req, res) => {
     res.json({
       success: true,
       message: 'SaFi Njema Cleaning Services – Backend API v1.0.0',
       endpoints: {
         health:   'GET  /api/health',
         auth: {
           register:       'POST /api/auth/register',
           login:          'POST /api/auth/login',
           me:             'GET  /api/auth/me  🔒',
           profile:        'PUT  /api/auth/profile  🔒',
           changePassword: 'PUT  /api/auth/change-password  🔒',
           forgotPassword: 'POST /api/auth/forgot-password',
           resetPassword:  'POST /api/auth/reset-password',
         },
         bookings: {
           create:   'POST /api/bookings',
           myList:   'GET  /api/bookings/my  🔒',
           getByRef: 'GET  /api/bookings/:ref  🔒',
           cancel:   'PUT  /api/bookings/:ref/cancel  🔒',
         },
         contact: {
           send: 'POST /api/contact',
         },
         quotes: {
           services:  'GET  /api/quotes/services',
           service:   'GET  /api/quotes/services/:id',
           estimate:  'POST /api/quotes/estimate',
           submit:    'POST /api/quotes',
           myQuotes:  'GET  /api/quotes/my  🔒',
         },
         admin: {
           dashboard:     'GET    /api/admin/dashboard  🔒👑',
           allBookings:   'GET    /api/admin/bookings  🔒👑',
           updateBooking: 'PUT    /api/admin/bookings/:id  🔒👑',
           deleteBooking: 'DELETE /api/admin/bookings/:id  🔒👑',
           allMessages:   'GET    /api/admin/messages  🔒👑',
           allUsers:      'GET    /api/admin/users  🔒👑',
           auditLog:      'GET    /api/admin/audit  🔒👑',
         },
       },
       legend: { '🔒': 'requires JWT token', '👑': 'admin only' },
     });
   });
   
   /* ════════════════════════════════════════
      404 handler
      ════════════════════════════════════════ */
   app.use('/api/*', (req, res) => {
     res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found.` });
   });
   
   /* ════════════════════════════════════════
      SPA fallback (serve index.html for all non-API routes)
      ════════════════════════════════════════ */
   app.get('*', (req, res) => {
     const indexFile = path.join(publicPath, 'index.html');
     const fs = require('fs');
     if (fs.existsSync(indexFile)) {
       res.sendFile(indexFile);
     } else {
       res.status(404).send('Frontend not found. Place your HTML files in /public.');
     }
   });
   
   /* ════════════════════════════════════════
      GLOBAL ERROR HANDLER
      ════════════════════════════════════════ */
   app.use((err, req, res, _next) => {
     console.error('Unhandled error:', err);
     if (err.message?.startsWith('CORS')) {
       return res.status(403).json({ success: false, message: err.message });
     }
     res.status(500).json({ success: false, message: 'Internal server error.' });
   });
   
   /* ════════════════════════════════════════
      START SERVER
      ════════════════════════════════════════ */
   app.listen(PORT, () => {
     console.log('\n╔══════════════════════════════════════════╗');
     console.log('║   🌿  SaFi Njema Backend API  🌿         ║');
     console.log('╠══════════════════════════════════════════╣');
     console.log(`║  Server: http://localhost:${PORT}             ║`);
     console.log(`║  Routes: http://localhost:${PORT}/api          ║`);
     console.log(`║  Health: http://localhost:${PORT}/api/health   ║`);
     console.log(`║  Mode:   ${process.env.NODE_ENV || 'development'}                     ║`);
     console.log('╚══════════════════════════════════════════╝\n');
   });
   
   module.exports = app;