#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   test-api.js  –  SaFi Njema Backend API Test Suite
   Run:  node test-api.js
   Requires server to be running on localhost:5000
   ═══════════════════════════════════════════════════════════════ */

   const BASE = 'http://localhost:5000/api';

   let passed = 0;
   let failed = 0;
   let token  = null;
   let adminToken = null;
   let bookingRef = null;
   
   /* ── Colour helpers ── */
   const g  = s => `\x1b[32m${s}\x1b[0m`;
   const r  = s => `\x1b[31m${s}\x1b[0m`;
   const y  = s => `\x1b[33m${s}\x1b[0m`;
   const b  = s => `\x1b[34m${s}\x1b[0m`;
   const dim = s => `\x1b[2m${s}\x1b[0m`;
   
   /* ── HTTP helper ── */
   async function req(method, path, body, authToken) {
     const headers = { 'Content-Type': 'application/json' };
     if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
     const res = await fetch(`${BASE}${path}`, {
       method,
       headers,
       body: body ? JSON.stringify(body) : undefined,
     });
     const data = await res.json().catch(() => ({}));
     return { status: res.status, ok: res.ok, data };
   }
   
   /* ── Test runner ── */
   async function test(name, fn) {
     try {
       await fn();
       console.log(`  ${g('✓')} ${name}`);
       passed++;
     } catch (err) {
       console.log(`  ${r('✗')} ${name}`);
       console.log(`    ${r(err.message)}`);
       failed++;
     }
   }
   
   function assert(condition, message) {
     if (!condition) throw new Error(message || 'Assertion failed');
   }
   
   /* ═══════════════════════════════════════════════════════════════
      TEST SUITES
      ═══════════════════════════════════════════════════════════════ */
   
   async function testHealth() {
     console.log(b('\n  🔹 Health & Root'));
     await test('GET /health returns 200', async () => {
       const { status, data } = await req('GET', '/health');
       assert(status === 200, `Expected 200, got ${status}`);
       assert(data.success === true, 'success should be true');
       assert(data.service === 'SaFi Njema Backend API', 'service name mismatch');
     });
     await test('GET / returns endpoint map', async () => {
       const { status, data } = await req('GET', '/');
       assert(status === 200);
       assert(data.endpoints, 'should have endpoints map');
     });
   }
   
   async function testAuth() {
     console.log(b('\n  🔹 Authentication'));
     const testEmail = `test_${Date.now()}@safinjema.test`;
     const testPass  = 'TestPass123!';
   
     await test('POST /auth/register – success', async () => {
       const { status, data } = await req('POST', '/auth/register', {
         name: 'Test User', email: testEmail, phone: '+27710000001', password: testPass,
       });
       assert(status === 201, `Expected 201, got ${status}: ${data.message}`);
       assert(data.token, 'should return JWT token');
       assert(data.user.email === testEmail, 'email mismatch');
       token = data.token;
     });
   
     await test('POST /auth/register – duplicate email rejected', async () => {
       const { status } = await req('POST', '/auth/register', {
         name: 'Dup', email: testEmail, password: testPass,
       });
       assert(status === 409, `Expected 409 conflict, got ${status}`);
     });
   
     await test('POST /auth/register – short password rejected', async () => {
       const { status } = await req('POST', '/auth/register', {
         name: 'X', email: `x${Date.now()}@test.com`, password: '123',
       });
       assert(status === 400, `Expected 400, got ${status}`);
     });
   
     await test('POST /auth/login – success', async () => {
       const { status, data } = await req('POST', '/auth/login', { email: testEmail, password: testPass });
       assert(status === 200, `Expected 200, got ${status}`);
       assert(data.token, 'should return token');
     });
   
     await test('POST /auth/login – wrong password rejected', async () => {
       const { status } = await req('POST', '/auth/login', { email: testEmail, password: 'wrongpass' });
       assert(status === 401, `Expected 401, got ${status}`);
     });
   
     await test('GET /auth/me – returns current user', async () => {
       const { status, data } = await req('GET', '/auth/me', null, token);
       assert(status === 200, `Expected 200, got ${status}`);
       assert(data.user.email === testEmail, 'email mismatch');
     });
   
     await test('GET /auth/me – rejected without token', async () => {
       const { status } = await req('GET', '/auth/me');
       assert(status === 401, `Expected 401, got ${status}`);
     });
   
     await test('PUT /auth/profile – updates name', async () => {
       const { status, data } = await req('PUT', '/auth/profile', { name: 'Updated User' }, token);
       assert(status === 200, `Expected 200, got ${status}`);
       assert(data.user.name === 'Updated User', 'name not updated');
     });
   
     await test('POST /auth/forgot-password – always responds 200', async () => {
       const { status } = await req('POST', '/auth/forgot-password', { email: testEmail });
       assert(status === 200, `Expected 200, got ${status}`);
     });
   
     await test('POST /auth/forgot-password – invalid email rejected', async () => {
       const { status } = await req('POST', '/auth/forgot-password', { email: 'notanemail' });
       assert(status === 400, `Expected 400, got ${status}`);
     });
   }
   
   async function testAdminAuth() {
     console.log(b('\n  🔹 Admin Login'));
     await test('Admin login with default credentials', async () => {
       const adminEmail = process.env.ADMIN_EMAIL || 'safinjema@outlook.com';
       const adminPass  = process.env.ADMIN_PASSWORD || 'SafiNjema@Admin2026';
       const { status, data } = await req('POST', '/auth/login', { email: adminEmail, password: adminPass });
       assert(status === 200, `Expected 200, got ${status}: ${data.message}`);
       assert(data.user.role === 'admin', `Expected role=admin, got ${data.user.role}`);
       adminToken = data.token;
     });
   }
   
   async function testBookings() {
     console.log(b('\n  🔹 Bookings'));
     const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
     const dateStr  = tomorrow.toISOString().split('T')[0];
   
     await test('POST /bookings – creates booking', async () => {
       const { status, data } = await req('POST', '/bookings', {
         name: 'Test Client', email: `client_${Date.now()}@test.com`,
         phone: '+27710000002', service: 'Carpet Cleaning',
         date: dateStr, time: '9:00 AM', area: 'Claremont',
       });
       assert(status === 201, `Expected 201, got ${status}: ${data.message}`);
       assert(data.booking_ref, 'should return booking_ref');
       assert(data.booking_ref.startsWith('SN-'), 'ref should start with SN-');
       bookingRef = data.booking_ref;
     });
   
     await test('POST /bookings – missing required fields rejected', async () => {
       const { status } = await req('POST', '/bookings', { name: 'Test' });
       assert(status === 400, `Expected 400, got ${status}`);
     });
   
     await test('POST /bookings – past date rejected', async () => {
       const { status } = await req('POST', '/bookings', {
         name: 'Test', email: 't@t.com', phone: '+27710000000',
         service: 'Carpet Cleaning', date: '2020-01-01', time: '9:00 AM',
       });
       assert(status === 400, `Expected 400, got ${status}`);
     });
   
     await test('POST /bookings – invalid service rejected', async () => {
       const { status } = await req('POST', '/bookings', {
         name: 'Test', email: 't@t.com', phone: '+27710000000',
         service: 'Fake Service', date: dateStr, time: '9:00 AM',
       });
       assert(status === 400, `Expected 400, got ${status}`);
     });
   
     await test('GET /bookings/my – returns auth user bookings', async () => {
       const { status, data } = await req('GET', '/bookings/my', null, token);
       assert(status === 200, `Expected 200, got ${status}`);
       assert(Array.isArray(data.bookings), 'bookings should be array');
     });
   
     await test('GET /bookings/my – rejected without auth', async () => {
       const { status } = await req('GET', '/bookings/my');
       assert(status === 401, `Expected 401, got ${status}`);
     });
   }
   
   async function testContact() {
     console.log(b('\n  🔹 Contact Form'));
     await test('POST /contact – success', async () => {
       const { status, data } = await req('POST', '/contact', {
         name: 'Contact Test', email: `contact_${Date.now()}@test.com`,
         message: 'I need a quote for office cleaning.',
       });
       assert(status === 201, `Expected 201, got ${status}: ${data.message}`);
       assert(data.success === true);
     });
   
     await test('POST /contact – missing message rejected', async () => {
       const { status } = await req('POST', '/contact', {
         name: 'Test', email: 'test@test.com',
       });
       assert(status === 400, `Expected 400, got ${status}`);
     });
   
     await test('POST /contact – invalid email rejected', async () => {
       const { status } = await req('POST', '/contact', {
         name: 'Test', email: 'notanemail', message: 'Hello',
       });
       assert(status === 400, `Expected 400, got ${status}`);
     });
   }
   
   async function testQuotes() {
     console.log(b('\n  🔹 Quotes / Pricing'));
     await test('GET /quotes/services – returns all services', async () => {
       const { status, data } = await req('GET', '/quotes/services');
       assert(status === 200, `Expected 200, got ${status}`);
       assert(Array.isArray(data.services), 'should return services array');
       assert(data.services.length > 0, 'should have at least 1 service');
     });
   
     await test('GET /quotes/services/:id – returns single service', async () => {
       const { status, data } = await req('GET', '/quotes/services/carpet');
       assert(status === 200, `Expected 200, got ${status}`);
       assert(data.service.id === 'carpet', 'service id mismatch');
     });
   
     await test('GET /quotes/services/:id – 404 for unknown', async () => {
       const { status } = await req('GET', '/quotes/services/unknown-service');
       assert(status === 404, `Expected 404, got ${status}`);
     });
   
     await test('POST /quotes – creates quote request', async () => {
       const { status, data } = await req('POST', '/quotes', {
         name: 'Quote Tester', email: `quote_${Date.now()}@test.com`,
         service: 'Carpet Cleaning', property_type: 'Apartment',
       });
       assert(status === 201, `Expected 201, got ${status}: ${data.message}`);
       assert(data.quote_id, 'should return quote_id');
     });
   }
   
   async function testAdmin() {
     if (!adminToken) { console.log(y('\n  ⚠️  Admin tests skipped (no admin token)')); return; }
     console.log(b('\n  🔹 Admin Endpoints'));
   
     await test('GET /admin/dashboard – returns stats', async () => {
       const { status, data } = await req('GET', '/admin/dashboard', null, adminToken);
       assert(status === 200, `Expected 200, got ${status}`);
       assert(data.stats, 'should return stats object');
       assert(typeof data.stats.bookings.total === 'number', 'should have bookings.total');
     });
   
     await test('GET /admin/bookings – returns paginated list', async () => {
       const { status, data } = await req('GET', '/admin/bookings?limit=5', null, adminToken);
       assert(status === 200, `Expected 200, got ${status}`);
       assert(Array.isArray(data.bookings), 'bookings should be array');
     });
   
     await test('GET /admin/bookings – search filter works', async () => {
       const { status, data } = await req('GET', '/admin/bookings?search=carpet', null, adminToken);
       assert(status === 200, `Expected 200, got ${status}`);
     });
   
     await test('GET /admin/messages – returns messages', async () => {
       const { status, data } = await req('GET', '/admin/messages', null, adminToken);
       assert(status === 200, `Expected 200, got ${status}`);
       assert(Array.isArray(data.messages), 'messages should be array');
     });
   
     await test('GET /admin/users – returns users', async () => {
       const { status, data } = await req('GET', '/admin/users', null, adminToken);
       assert(status === 200, `Expected 200, got ${status}`);
       assert(Array.isArray(data.users), 'users should be array');
     });
   
     await test('GET /admin/audit – returns audit log', async () => {
       const { status, data } = await req('GET', '/admin/audit', null, adminToken);
       assert(status === 200, `Expected 200, got ${status}`);
       assert(Array.isArray(data.logs), 'logs should be array');
     });
   
     await test('Admin endpoints blocked for non-admin', async () => {
       const { status } = await req('GET', '/admin/dashboard', null, token);
       assert(status === 403, `Expected 403, got ${status}`);
     });
   }
   
   async function testSecurity() {
     console.log(b('\n  🔹 Security'));
   
     await test('Invalid JWT returns 401', async () => {
       const { status } = await req('GET', '/auth/me', null, 'invalid.token.here');
       assert(status === 401, `Expected 401, got ${status}`);
     });
   
     await test('404 for unknown API route', async () => {
       const { status } = await req('GET', '/nonexistent');
       assert(status === 404, `Expected 404, got ${status}`);
     });
   
     await test('Missing body fields give 400 not 500', async () => {
       const { status } = await req('POST', '/auth/login', {});
       assert(status === 400, `Expected 400, got ${status}`);
     });
   }
   
   /* ═══════════════════════════════════════════════════════════════
      MAIN
      ═══════════════════════════════════════════════════════════════ */
   (async () => {
     console.log('\n╔══════════════════════════════════════════════╗');
     console.log('║  🌿  SaFi Njema API Test Suite               ║');
     console.log(`║  Target: ${BASE.padEnd(36)}║`);
     console.log('╚══════════════════════════════════════════════╝');
   
     // Check server is running
     try {
       const res = await fetch(`${BASE}/health`);
       if (!res.ok) throw new Error();
     } catch {
       console.log(r('\n❌  Server not reachable at ' + BASE));
       console.log(y('   Start the server with: npm start\n'));
       process.exit(1);
     }
   
     await testHealth();
     await testAuth();
     await testAdminAuth();
     await testBookings();
     await testContact();
     await testQuotes();
     await testAdmin();
     await testSecurity();
   
     /* ── Summary ── */
     const total = passed + failed;
     console.log('\n' + '─'.repeat(48));
     console.log(`  Tests:  ${total}`);
     console.log(`  ${g('Passed:')} ${g(passed)}`);
     if (failed > 0) console.log(`  ${r('Failed:')} ${r(failed)}`);
     console.log('─'.repeat(48));
   
     if (failed === 0) {
       console.log(g(`\n  ✅  All ${total} tests passed!\n`));
       process.exit(0);
     } else {
       console.log(r(`\n  ❌  ${failed} test(s) failed.\n`));
       process.exit(1);
     }
   })();