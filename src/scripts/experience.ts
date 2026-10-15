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
