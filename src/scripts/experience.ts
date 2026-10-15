const explorer = document.querySelector<HTMLElement>('[data-energy]');
const phases = {
  day: { time:'12:00', tag:'Solar generation', kicker:'CAPTURE + STORE', title:'Let the roof do the work.', copy:'Your panels supply the home while the sun is up. With a compatible battery, extra solar can be stored for later.', from:'SUN', to:'HOME + BATTERY' },
  evening: { time:'6:00', tag:'Stored energy', kicker:'SHIFT YOUR ENERGY', title:'Keep the day going.', copy:'As solar output falls, stored energy can cover more of your evening use. On many PG&E plans, this is when grid electricity costs more.', from:'BATTERY', to:'YOUR HOME' },
  night: { time:'9:00', tag:'Ready for tomorrow', kicker:'A SYSTEM THAT WORKS TOGETHER', title:'Settle in. Plug in.', copy:'Your system draws on remaining storage or the grid. Schedule EV charging around your rate plan, and let tomorrow’s sun begin the cycle again.', from:'STORAGE / GRID', to:'HOME + EV' },
} as const;
explorer?.querySelectorAll<HTMLButtonElement>('[data-energy-choice]').forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.energyChoice as keyof typeof phases;
    const phase = phases[key];
    if (!phase) return;
    explorer.dataset.phase = key;
    explorer.querySelectorAll('[data-energy-choice]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    for (const field of ['tag','kicker','title','copy','from','to'] as const) {
      const node = explorer.querySelector(`[data-energy-${field}]`);
      if (node) node.textContent = phase[field];
    }
    const time = explorer.querySelector('[data-energy-time]');
    if (time) { time.replaceChildren(document.createTextNode(phase.time+' ')); const suffix = document.createElement('small'); suffix.textContent='PM'; time.append(suffix); }
  });
});
const progress = document.querySelector<HTMLElement>('.scroll-progress');
let queued = false;
const updateProgress = () => {
  const distance = document.documentElement.scrollHeight - innerHeight;
  if (progress) progress.style.transform = `scaleX(${distance > 0 ? Math.min(1,scrollY/distance) : 0})`;
  queued = false;
};
addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(updateProgress)}},{passive:true});
addEventListener('resize',updateProgress);
updateProgress();

// Run ambient effects only on screen. Background tabs and an open menu pause them.
const ambientSections = Array.from(document.querySelectorAll<HTMLElement>('[data-ambient]'));
const visibleSections = new Set<HTMLElement>();
const syncAmbient = () => {
  const canMove = !document.hidden && !document.querySelector('[data-drawer][data-open]');
  ambientSections.forEach(section => section.toggleAttribute('data-visible', canMove && visibleSections.has(section)));
};
const ambientObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => entry.isIntersecting ? visibleSections.add(entry.target as HTMLElement) : visibleSections.delete(entry.target as HTMLElement));
  syncAmbient();
}, { threshold: 0 });
ambientSections.forEach(section => ambientObserver.observe(section));
document.addEventListener('visibilitychange', syncAmbient);
const menu = document.querySelector('[data-drawer]');
if (menu) new MutationObserver(syncAmbient).observe(menu, { attributes: true, attributeFilter: ['data-open'] });

const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let userPaused = false;
const motionButtons = document.querySelectorAll<HTMLButtonElement>('[data-motion-control]');
function syncMotion() {
  const paused = motionPreference.matches || userPaused;
  document.documentElement.dataset.motion = paused ? 'paused' : 'active';
  motionButtons.forEach(button => {
    button.hidden = motionPreference.matches;
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Play animations' : 'Pause animations');
    button.title = paused ? 'Play animations' : 'Pause animations';
  });
  document.dispatchEvent(new Event('killua:motionchange'));
}
motionButtons.forEach(button => button.addEventListener('click', () => { userPaused = !userPaused; syncMotion(); }));
motionPreference.addEventListener('change', syncMotion);
syncMotion();

document.querySelectorAll<HTMLElement>('[data-system]').forEach(system => {
  system.querySelectorAll<HTMLButtonElement>('[data-system-choice]').forEach(button => {
    button.addEventListener('click', () => {
      const choice = button.dataset.systemChoice;
      system.dataset.system = choice;
      system.querySelectorAll('[data-system-choice]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      system.querySelectorAll<HTMLElement>('[data-system-panel]').forEach(panel => { panel.hidden = panel.dataset.systemPanel !== choice; });
    });
  });
});

if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.querySelectorAll<HTMLElement>('.photo-service').forEach(card => {
    card.addEventListener('pointermove', event => {
      if (document.documentElement.dataset.motion === 'paused') return;
      const box = card.getBoundingClientRect();
      card.style.setProperty('--pointer-x', `${event.clientX - box.left}px`);
      card.style.setProperty('--pointer-y', `${event.clientY - box.top}px`);
    }, { passive: true });
  });
}
