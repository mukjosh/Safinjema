/* ─────────────────────────────────────────────────────────────
   routes/quotes.js  –  Service pricing & quote requests
   GET  /api/quotes/services   – list services with base prices
   POST /api/quotes            – save a quote request
   GET  /api/quotes/my         – customer's quote requests (auth)
   ───────────────────────────────────────────────────────────── */
   const express = require('express');
   const router  = express.Router();
   const { db, audit }        = require('../db');
   const { optionalAuth, authenticate } = require('../middleware/auth');
   const mailer = require('../mailer');
   
   /* ── Ensure quotes table exists ── */
   db.exec(`
     CREATE TABLE IF NOT EXISTS quotes (
       id          INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
       name        TEXT NOT NULL,
       email       TEXT NOT NULL,
       phone       TEXT,
       service     TEXT NOT NULL,
       property_type TEXT,
       size_sqm    REAL,
       frequency   TEXT,
       notes       TEXT,
       estimated_price REAL,
       status      TEXT NOT NULL DEFAULT 'pending',
       created_at  TEXT NOT NULL DEFAULT (datetime('now'))
     );
   `);
   
   /* ── SERVICE PRICING MATRIX ── */
   const SERVICES = [
     {
       id: 'carpet',
       name: 'Carpet Cleaning',
       category: 'Residential',
       description: 'Hot-water extraction removes embedded dirt, stains and allergens.',
       pricing: [
         { label: 'Studio / 1-Bed (≤50m²)',    price: 450,  unit: 'per session' },
         { label: '2-Bed (51–100m²)',           price: 750,  unit: 'per session' },
         { label: '3-Bed (101–150m²)',          price: 1050, unit: 'per session' },
         { label: '4-Bed+ (151m²+)',            price: 1400, unit: 'per session' },
       ],
       notes: 'Price includes pre-treatment and hot-water extraction. Heavy stain removal may attract additional cost.',
     },
     {
       id: 'couch',
       name: 'Couch / Upholstery Cleaning',
       category: 'Residential',
       description: 'Deep cleaning restores fabric sofas, chairs and curtains.',
       pricing: [
         { label: '2-Seater Sofa',   price: 350,  unit: 'per piece' },
         { label: '3-Seater Sofa',   price: 450,  unit: 'per piece' },
         { label: 'L-Shape Sofa',    price: 750,  unit: 'per piece' },
         { label: 'Single Armchair', price: 250,  unit: 'per piece' },
       ],
       notes: 'Leather cleaning available. Drying time: 2–4 hours.',
     },
     {
       id: 'mattress',
       name: 'Mattress Sanitising',
       category: 'Residential',
       description: 'UV treatment + deep cleaning eliminates dust mites, bacteria and odours.',
       pricing: [
         { label: 'Single Mattress',  price: 280, unit: 'per mattress' },
         { label: 'Double Mattress',  price: 350, unit: 'per mattress' },
         { label: 'Queen Mattress',   price: 420, unit: 'per mattress' },
         { label: 'King Mattress',    price: 500, unit: 'per mattress' },
       ],
       notes: 'Includes UV sanitisation and odour treatment. Recommended every 6 months.',
     },
     {
       id: 'windows',
       name: 'Window Cleaning',
       category: 'Residential',
       description: 'Interior and exterior window cleaning for streak-free results.',
       pricing: [
         { label: 'Up to 10 windows',  price: 400, unit: 'per session' },
         { label: '11–20 windows',     price: 650, unit: 'per session' },
         { label: '21–30 windows',     price: 900, unit: 'per session' },
         { label: '30+ windows',       price: null, unit: 'custom quote' },
       ],
       notes: 'Both sides included. High-rise access attracts additional cost.',
     },
     {
       id: 'deep-home',
       name: 'Deep Home Cleaning',
       category: 'Residential',
       description: 'Full top-to-bottom deep clean of your entire home.',
       pricing: [
         { label: '1-Bed Apartment',   price: 950,  unit: 'per session' },
         { label: '2-Bed House',       price: 1400, unit: 'per session' },
         { label: '3-Bed House',       price: 1900, unit: 'per session' },
         { label: '4-Bed+ House',      price: null, unit: 'custom quote' },
       ],
       notes: 'Includes kitchen, bathrooms, bedrooms and living areas. Products included.',
     },
     {
       id: 'post-construction',
       name: 'Post-Construction Cleaning',
       category: 'Residential / Commercial',
       description: 'Complete cleanup after building or renovation work.',
       pricing: [
         { label: 'Small (≤80m²)',    price: 1500, unit: 'per session' },
         { label: 'Medium (81–200m²)', price: 2800, unit: 'per session' },
         { label: 'Large (200m²+)',   price: null, unit: 'custom quote' },
       ],
       notes: 'Includes dust, debris, paint splash removal. Site inspection recommended.',
     },
     {
       id: 'commercial-office',
       name: 'Commercial / Office Cleaning',
       category: 'Commercial',
       description: 'Regular office cleaning to maintain a hygienic workplace.',
       pricing: [
         { label: 'Small office (≤100m²)',   price: 800,  unit: 'per session' },
         { label: 'Medium (101–300m²)',       price: 1600, unit: 'per session' },
         { label: 'Large (300m²+)',           price: null, unit: 'custom quote' },
         { label: 'Monthly contract (3x/wk)', price: 3500, unit: 'per month' },
       ],
       notes: 'Discounts available for weekly/monthly contracts.',
     },
     {
       id: 'industrial',
       name: 'Industrial Cleaning',
       category: 'Industrial',
       description: 'Heavy-duty factory, warehouse and plant cleaning.',
       pricing: [
         { label: 'On-site assessment required', price: null, unit: 'custom quote' },
       ],
       notes: 'Custom pricing based on facility size, hazards and schedule.',
     },
     {
       id: 'events',
       name: 'Events Cleaning',
       category: 'Events',
       description: 'Pre, during and post-event cleaning for any venue.',
       pricing: [
         { label: 'Small venue (≤100 guests)',   price: 1200, unit: 'per event' },
         { label: 'Medium (101–300 guests)',      price: 2200, unit: 'per event' },
         { label: 'Large (300+ guests)',          price: null, unit: 'custom quote' },
       ],
       notes: 'Includes setup, during-event and teardown cleaning.',
     },
     {
       id: 'pest-control',
       name: 'Pest Control',
       category: 'Residential / Commercial',
       description: 'Safe, eco-friendly pest elimination and prevention.',
       pricing: [
         { label: 'Cockroaches / Ants',   price: 600,  unit: 'per session' },
         { label: 'Rodents',              price: 800,  unit: 'per session' },
         { label: 'Bedbugs',              price: 1200, unit: 'per session' },
         { label: 'Full property fumigation', price: null, unit: 'custom quote' },
       ],
       notes: 'Eco-safe products. Retreatment guarantee included.',
     },
     {
       id: 'solar-panels',
       name: 'Solar Panel Cleaning',
       category: 'Residential / Commercial',
       description: 'Increase panel efficiency with professional cleaning.',
       pricing: [
         { label: '1–8 panels',   price: 350, unit: 'per session' },
         { label: '9–16 panels',  price: 600, unit: 'per session' },
         { label: '17–24 panels', price: 850, unit: 'per session' },
         { label: '25+ panels',   price: null, unit: 'custom quote' },
       ],
       notes: 'Deionised water used. No harsh chemicals. Roof access required.',
     },
     {
       id: 'bin-cleaning',
       name: 'Bin Cleaning',
       category: 'Residential',
       description: 'Sanitise and deodorise your wheelie bins.',
       pricing: [
         { label: 'Single bin',      price: 150, unit: 'per clean' },
         { label: '2 bins',          price: 250, unit: 'per clean' },
         { label: 'Monthly (1 bin)', price: 120, unit: 'per month' },
       ],
       notes: 'Includes disinfection and deodorising spray.',
     },
   ];
   
   /* ── GET SERVICES + PRICING ── */
   router.get('/services', (req, res) => {
     const { category } = req.query;
     const filtered = category
       ? SERVICES.filter(s => s.category.toLowerCase().includes(category.toLowerCase()))
       : SERVICES;
     res.json({ success: true, services: filtered });
   });
   
   /* ── GET SINGLE SERVICE PRICING ── */
   router.get('/services/:id', (req, res) => {
     const service = SERVICES.find(s => s.id === req.params.id);
     if (!service) return res.status(404).json({ success: false, message: 'Service not found.' });
     res.json({ success: true, service });
   });
   
   /* ── ESTIMATE (quick price calculation) ── */
   router.post('/estimate', (req, res) => {
     const { serviceId, sizeOrCount } = req.body;
     const service = SERVICES.find(s => s.id === serviceId);
     if (!service) return res.status(404).json({ success: false, message: 'Service not found.' });
   
     // Return the pricing tiers — client chooses the applicable one
     res.json({
       success: true,
       service: service.name,
       pricing: service.pricing,
       notes:   service.notes,
     });
   });
   
   /* ── SAVE QUOTE REQUEST ── */
   router.post('/', optionalAuth, async (req, res) => {
     try {
       const { name, email, phone, service, property_type, size_sqm, frequency, notes } = req.body;
       if (!name || !email || !service)
         return res.status(400).json({ success: false, message: 'Name, email and service are required.' });
   
       // Simple auto-estimate
       const svc = SERVICES.find(s => s.name === service || s.id === service);
       let estimated_price = null;
       if (svc) {
         const firstFixed = svc.pricing.find(p => p.price !== null);
         if (firstFixed) estimated_price = firstFixed.price;
       }
   
       const result = db.prepare(`
         INSERT INTO quotes (user_id, name, email, phone, service, property_type, size_sqm, frequency, notes, estimated_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       `).run(req.user?.id || null, name.trim(), email.trim().toLowerCase(),
              phone?.trim() || null, service, property_type || null,
              size_sqm ? parseFloat(size_sqm) : null, frequency || null,
              notes?.trim() || null, estimated_price);
   
       audit(email, 'QUOTE_REQUEST', 'quotes', result.lastInsertRowid, service, req.ip);
   
       // Notify admin
       mailer.send({
         from:    `"SaFi Njema" <${process.env.SMTP_USER}>`,
         to:      process.env.ADMIN_EMAIL,
         subject: `💬 Quote Request: ${service} – ${name}`,
         text:    `Quote from ${name} (${email}${phone ? ', ' + phone : ''}) for: ${service}.\nProperty: ${property_type || 'N/A'}, Size: ${size_sqm || 'N/A'}m², Frequency: ${frequency || 'N/A'}.\nNotes: ${notes || 'None'}`,
       });
   
       res.status(201).json({
         success:   true,
         message:   'Quote request received! We\'ll be in touch within 2 hours.',
         quote_id:  result.lastInsertRowid,
         estimated: estimated_price ? `From R ${estimated_price}` : 'Custom pricing – we\'ll confirm shortly.',
       });
     } catch (err) {
       console.error('Quote error:', err);
       res.status(500).json({ success: false, message: 'Server error.' });
     }
   });
   
   /* ── MY QUOTES ── */
   router.get('/my', authenticate, (req, res) => {
     const quotes = db.prepare(
       'SELECT * FROM quotes WHERE user_id = ? OR email = ? ORDER BY created_at DESC'
     ).all(req.user.id, req.user.email);
     res.json({ success: true, quotes });
   });
   
   /* ── ADMIN: all quotes ── */
   router.get('/', (req, res) => {
     // Only allow admin (checked in server.js via admin router)
     const quotes = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 100').all();
     res.json({ success: true, quotes });
   });
   
   module.exports = { router, SERVICES };