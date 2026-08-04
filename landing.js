const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const header = document.getElementById('siteHeader');
const navToggle = document.getElementById('navToggle');
const primaryNav = document.getElementById('primaryNav');

function updateHeader() {
  header?.classList.toggle('scrolled', window.scrollY > 22);
}

navToggle?.addEventListener('click', () => {
  const open = navToggle.getAttribute('aria-expanded') !== 'true';
  navToggle.setAttribute('aria-expanded', String(open));
  primaryNav?.classList.toggle('open', open);
});

primaryNav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  navToggle?.setAttribute('aria-expanded', 'false');
  primaryNav.classList.remove('open');
}));

window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

const revealItems = document.querySelectorAll('.reveal:not(.visible)');
if ('IntersectionObserver' in window && !reducedMotion) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -45px' });
  revealItems.forEach(item => observer.observe(item));
} else {
  revealItems.forEach(item => item.classList.add('visible'));
}

if (!reducedMotion && window.matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll('.interactive-card').forEach(card => {
    card.addEventListener('pointermove', event => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * 2.4).toFixed(2)}deg) rotateY(${(x * 3.2).toFixed(2)}deg) translateY(-2px)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });

  const orbitalSystem = document.getElementById('orbitalSystem');
  const visual = document.querySelector('.mission-visual');
  visual?.addEventListener('pointermove', event => {
    const rect = visual.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    orbitalSystem.style.transform = `translate(${(x * 8).toFixed(1)}px, ${(y * 8).toFixed(1)}px)`;
  });
  visual?.addEventListener('pointerleave', () => { orbitalSystem.style.transform = ''; });
}

const missionClock = document.getElementById('missionClock');
function updateClock() {
  if (!missionClock) return;
  missionClock.textContent = `${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date())} UTC`;
}
updateClock();
setInterval(updateClock, 1000);
document.getElementById('year').textContent = String(new Date().getFullYear());

const canvas = document.getElementById('starfield');
const context = canvas?.getContext('2d');
let stars = [];
let width = 0;
let height = 0;
let pointerX = 0;
let pointerY = 0;

function seedStars() {
  if (!canvas || !context) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const count = Math.min(240, Math.max(90, Math.round((width * height) / 9500)));
  stars = Array.from({ length: count }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: index % 31 === 0 ? 1.35 : Math.random() * 0.9 + 0.15,
    a: Math.random() * 0.62 + 0.18,
    phase: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.18 + 0.03
  }));
}

function renderStars(time = 0) {
  if (!context) return;
  context.clearRect(0, 0, width, height);
  const parallaxX = pointerX * 5;
  const parallaxY = pointerY * 5;
  stars.forEach((star, index) => {
    const alpha = reducedMotion ? star.a : star.a * (0.72 + Math.sin(time * 0.0007 * star.speed + star.phase) * 0.28);
    const offset = index % 3 === 0 ? 1 : index % 3 === 1 ? 0.55 : 0.2;
    context.beginPath();
    context.arc(star.x + parallaxX * offset, star.y + parallaxY * offset, star.r, 0, Math.PI * 2);
    context.fillStyle = `rgba(${index % 13 === 0 ? '112,220,255' : '224,244,255'},${Math.max(0.08, alpha)})`;
    context.fill();
  });
  if (!reducedMotion) requestAnimationFrame(renderStars);
}

window.addEventListener('resize', seedStars, { passive: true });
window.addEventListener('pointermove', event => {
  pointerX = event.clientX / Math.max(1, width) - 0.5;
  pointerY = event.clientY / Math.max(1, height) - 0.5;
}, { passive: true });
seedStars();
renderStars();
