/**
 * Animates RoofScene. Two uses:
 *   hero  - on load the sun climbs to late afternoon, panels light row by row,
 *           power runs down the conduit; scrolling away slides it toward sunset.
 *   day   - a pinned, scroll-scrubbed day from 7 AM to 9 PM that shows why the
 *           4 to 9 PM PG&E peak is a battery's job.
 */
import type { gsap as GSAP } from 'gsap';
import type { ScrollTrigger as ST } from 'gsap/ScrollTrigger';

const at = (t: number) => {
  const th = Math.PI * (1 - t);
  return [600 + 510 * Math.cos(th), 470 - 400 * Math.sin(th)];
};

const SKY = {
  hero: ['#131315', '#3a2224', '#d9693a'],
  dawn: ['#2b2632', '#7a4b4a', '#e8915a'],
  noon: ['#6d9dbf', '#b7cad3', '#f4e3c3'],
  four: ['#557896', '#c3a588', '#f2b66c'],
  dusk: ['#241f2c', '#6a3330', '#e0673a'],
  night: ['#0f1013', '#17161b', '#2b1d22'],
};

function parts(svg: SVGSVGElement) {
  const q = <T extends Element>(s: string) => svg.querySelector<T>(s)!;
  return {
    sun: q<SVGGElement>('[data-sun]'),
    stops: ['top', 'mid', 'low'].map((k) => q<SVGStopElement>(`[data-sky="${k}"]`)),
    lit: svg.querySelectorAll('[data-lit]'),
    glow: svg.querySelectorAll('[data-glow]'),
    solar: q('[data-flow="solar"]'),
    house: q('[data-flow="house"]'),
    ev: q('[data-flow="ev"]'),
    charge: q('[data-charge]'),
    stars: q('[data-stars]'),
    peak: q('[data-peak]'),
  };
}

function skyTo(stops: SVGStopElement[], colors: string[]) {
  return stops.map((s, n) => ({ el: s, color: colors[n] }));
}

export function initHeroScene(svg: SVGSVGElement, gsap: typeof GSAP, ScrollTrigger: typeof ST) {
  const p = parts(svg);
  const s = { base: 0.02, drift: 0 };
  const place = () => {
    const [x, y] = at(s.base + s.drift);
    p.sun.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  };
  place();
  gsap.set(p.lit, { opacity: 0 });
  gsap.set([p.solar, p.house, p.ev], { opacity: 0 });
  gsap.set(p.charge, { scaleY: 0.15, transformOrigin: '50% 100%' });

  const flow = gsap.to([p.solar, p.house, p.ev], {
    strokeDashoffset: -36,
    duration: 1.1,
    ease: 'none',
    repeat: -1,
    paused: true,
  });
  const tl = gsap.timeline({ delay: 0.2, onStart: () => flow.play() });
  tl.to(s, { base: 0.64, duration: 2.6, ease: 'power3.out', onUpdate: place }, 0)
    .to(p.lit, { opacity: 0.55, duration: 0.4, stagger: { each: 0.04, from: 'start' } }, 0.7)
    .to(p.solar, { opacity: 1, duration: 0.5 }, 1.3)
    .to(p.charge, { scaleY: 0.72, duration: 1.4, ease: 'power2.out' }, 1.4)
    .to([p.house, p.ev], { opacity: 1, duration: 0.5 }, 1.8);

  gsap.to(s, {
    drift: 0.2,
    ease: 'none',
    onUpdate: place,
    scrollTrigger: { trigger: svg, start: 'top 30%', end: 'bottom top', scrub: 0.4 },
  });
  ScrollTrigger.create({
    trigger: svg,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => (self.isActive ? flow.play() : flow.pause()),
  });
}

export function initDayScene(section: HTMLElement, gsap: typeof GSAP) {
  const svg = section.querySelector<SVGSVGElement>('svg')!;
  const stage = section.querySelector<HTMLElement>('.day-stage')!;
  const caps = [...section.querySelectorAll<HTMLElement>('.day-cap')];
  const ticks = svg.querySelector('[data-ticks]');
  const p = parts(svg);
  const s = { t: 0 };
  const place = () => {
    const [x, y] = at(s.t);
    p.sun.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  };
  const sky = (key: keyof typeof SKY, at: number, dur = 1) =>
    skyTo(p.stops, SKY[key]).forEach(({ el, color }) =>
      tl.to(el, { attr: { 'stop-color': color }, duration: dur }, at)
    );
  const swap = (from: number, to: number, at: number) => {
    tl.to(caps[from], { autoAlpha: 0, y: -14, duration: 0.18 }, at);
    tl.fromTo(caps[to], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.18 }, at + 0.2);
  };

  gsap.set(caps.slice(1), { autoAlpha: 0 });
  p.stops.forEach((el, n) => el.setAttribute('stop-color', SKY.dawn[n]));
  gsap.set(p.lit, { opacity: 0 });
  gsap.set([p.solar, p.house, p.ev], { opacity: 0 });
  gsap.set(p.charge, { scaleY: 0.12, transformOrigin: '50% 100%' });
  gsap.set(p.peak, { opacity: 0.35 });
  place();

  gsap.to([p.solar, p.house, p.ev], { strokeDashoffset: -36, duration: 1.1, ease: 'none', repeat: -1 });

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: stage, start: 'top top', end: '+=340%', pin: true, scrub: 0.6, anticipatePin: 1 },
  });

  // 7 AM -> 1 PM
  tl.to(s, { t: 0.5, duration: 1, onUpdate: place }, 0);
  sky('noon', 0);
  if (ticks) tl.to(ticks, { attr: { fill: '#19181a' }, duration: 0.6 }, 0.2);
  tl.to(p.lit, { opacity: 0.6, duration: 0.5, stagger: 0.02 }, 0.1);
  tl.to(p.solar, { opacity: 1, duration: 0.3 }, 0.3);
  tl.to(p.charge, { scaleY: 0.95, duration: 1.2 }, 0.4);
  swap(0, 1, 0.75);

  // 1 PM -> 4 PM
  tl.to(s, { t: 0.75, duration: 1, onUpdate: place }, 1);
  sky('four', 1);
  tl.to(p.peak, { opacity: 1, attr: { 'stroke-width': 9 }, duration: 0.5 }, 1.5);
  swap(1, 2, 1.75);

  // 4 PM -> 7 PM
  tl.to(s, { t: 1, duration: 1, onUpdate: place }, 2);
  sky('dusk', 2);
  if (ticks) tl.to(ticks, { attr: { fill: '#f4eee4' }, duration: 0.5 }, 2.1);
  tl.to(p.lit, { opacity: 0, duration: 0.6, stagger: { each: 0.02, from: 'end' } }, 2.2);
  tl.to(p.solar, { opacity: 0, duration: 0.3 }, 2.5);
  tl.to([p.house, p.ev], { opacity: 1, duration: 0.3 }, 2.6);
  tl.to(p.glow, { opacity: 0.85, duration: 0.4 }, 2.6);
  tl.to(p.charge, { scaleY: 0.55, duration: 1 }, 2.6);
  swap(2, 3, 2.75);

  // 7 PM -> 9 PM
  tl.to(s, { t: 1.25, duration: 1, onUpdate: place }, 3);
  sky('night', 3);
  tl.to(p.stars, { opacity: 1, duration: 0.6 }, 3.2);
  tl.to(p.charge, { scaleY: 0.3, duration: 0.8 }, 3.2);
  tl.to(p.peak, { opacity: 0.25, attr: { 'stroke-width': 5 }, duration: 0.4 }, 3.6);
  tl.to(p.ev, { opacity: 0, duration: 0.3 }, 3.6);
  swap(3, 4, 3.75);
  tl.to({}, { duration: 0.3 });
}
