/* SaFi Njema – Main JavaScript  |  Java.js */

/* ── NAV ── */
function toggleMenu(){
  document.getElementById("navLinks").classList.toggle("show");
}

/* ── SCROLL REVEAL ── */
const revealObserver = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add('visible'); });
},{threshold:0.1});
document.querySelectorAll('.reveal').forEach(el=>revealObserver.observe(el));

/* ── SEARCH ── */
function doSearch(){
  const q = (document.getElementById('sSearch')||{value:''}).value.trim().toLowerCase();
  if(!q) return;
  const map = {
    'carpet':'residential.html','couch':'residential.html','sofa':'residential.html',
    'mattress':'residential.html','window':'residential.html','pest':'residential.html',
    'deep':'residential.html','construction':'residential.html',
    'office':'commercial.html','commercial':'commercial.html','contract':'commercial.html',
    'factory':'industrial.html','industrial':'industrial.html','warehouse':'industrial.html',
    'event':'events.html','party':'events.html','venue':'events.html',
    'book':'Book.html','booking':'Book.html',
    'contact':'contact.html','about':'About.html','gallery':'Galary.html',
  };
  for(const [k,v] of Object.entries(map)){
    if(q.includes(k)){ window.location.href=v; return; }
  }
  window.location.href='services.html';
}
const sInput = document.getElementById('sSearch');
if(sInput) sInput.addEventListener('keydown', e=>{ if(e.key==='Enter') doSearch(); });

/* ── ACCORDION ── */
document.querySelectorAll('.acc-trigger').forEach(btn=>{
  btn.addEventListener('click', function(){
    const item  = this.closest('.acc-item');
    const body  = item.querySelector('.acc-body');
    const isOpen = this.classList.contains('open');
    // close all
    document.querySelectorAll('.acc-trigger.open').forEach(b=>{
      b.classList.remove('open');
      b.closest('.acc-item').classList.remove('open');
      b.nextElementSibling.style.display='none';
    });
    if(!isOpen){
      this.classList.add('open');
      item.classList.add('open');
      body.style.display='block';
    }
  });
});

/* ── BOOKING FORM ── */
const bookForm = document.getElementById('bookingForm');
if(bookForm){
  const minDate = ()=>{
    const d=new Date(); d.setDate(d.getDate()+1);
    return d.toISOString().split('T')[0];
  };
  const dateInput = document.getElementById('bDate');
  if(dateInput) dateInput.min = minDate();

  bookForm.addEventListener('submit', function(e){
    e.preventDefault();
    const d = {
      name:     document.getElementById('bName').value.trim(),
      phone:    document.getElementById('bPhone').value.trim(),
      email:    document.getElementById('bEmail').value.trim(),
      service:  document.getElementById('bService').value,
      date:     document.getElementById('bDate').value,
      time:     document.getElementById('bTime').value,
      area:     document.getElementById('bArea').value.trim(),
      notes:    document.getElementById('bNotes').value.trim(),
      submitted:new Date().toLocaleString('en-ZA'),
    };
    const msg = document.getElementById('bookMsg');
    if(!d.name||!d.phone||!d.email||!d.service||!d.date||!d.time){
      msg.textContent='⚠️ Please fill in all required fields.';
      msg.className='alert err'; return;
    }
    // Email via mailto
    const TO = 'safinjema@outlook.com';
    const sub = encodeURIComponent(`New Booking – ${d.service} – ${d.name}`);
    const body = encodeURIComponent(
      `NEW BOOKING – SaFi Njema\n`+
      `──────────────────────────\n`+
      `Name:     ${d.name}\nPhone:    ${d.phone}\nEmail:    ${d.email}\n`+
      `Service:  ${d.service}\nDate:     ${d.date}\nTime:     ${d.time}\n`+
      `Area:     ${d.area||'N/A'}\nNotes:    ${d.notes||'None'}\n`+
      `Submitted:${d.submitted}\n──────────────────────────\n[SaFi Njema Booking System]`
    );
    window.open(`mailto:${TO}?subject=${sub}&body=${body}`,'_blank');

    // WhatsApp notification
    const waMsg = encodeURIComponent(
      `📋 *NEW BOOKING*\n👤 *${d.name}*\n📞 ${d.phone}\n🧹 ${d.service}\n📅 ${d.date} @ ${d.time}\n📍 ${d.area||'TBC'}`
    );
    window.open(`https://wa.me/27713599995?text=${waMsg}`,'_blank');

    msg.textContent='✅ Booking submitted! Check your email & WhatsApp for confirmation.';
    msg.className='alert ok';
    bookForm.reset();
  });
}

/* ── CONTACT FORM ── */
const contactForm = document.getElementById('contactForm');
if(contactForm){
  contactForm.addEventListener('submit',function(e){
    e.preventDefault();
    const name=document.getElementById('cName').value.trim();
    const email=document.getElementById('cEmail').value.trim();
    const message=document.getElementById('cMsg').value.trim();
    const phone=document.getElementById('cPhone')?document.getElementById('cPhone').value.trim():'';
    const msg=document.getElementById('contactMsg');
    if(!name||!email||!message){msg.textContent='Please fill in all required fields.';msg.className='alert err';return;}
    const sub=encodeURIComponent(`Website Enquiry from ${name}`);
    const body=encodeURIComponent(`From: ${name}\nEmail: ${email}\nPhone: ${phone}\n\n${message}`);
    window.open(`mailto:info@safinjema.co.za?subject=${sub}&body=${body}`,'_blank');
    msg.textContent='✅ Message sent! We\'ll reply within 24 hours.';
    msg.className='alert ok';
    contactForm.reset();
  });
}

/* ── GALLERY LIGHTBOX ── */
function openLightbox(src){
  const lb=document.getElementById('lightbox');
  document.getElementById('lbImg').src=src;
  lb.classList.add('open');
}
function closeLightbox(){
  document.getElementById('lightbox')?.classList.remove('open');
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeLightbox(); });

/* ── GALLERY FILTER ── */
function filterGallery(cat){
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.cat===cat));
  document.querySelectorAll('.gallery-item').forEach(item=>{
    item.style.display=(cat==='all'||item.dataset.cat===cat)?'block':'none';
  });
}
