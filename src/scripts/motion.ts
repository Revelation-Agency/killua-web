/**
 * Main-site motion: Lenis smooth scroll wired into GSAP's ticker, SplitText
 * headline reveals, scroll reveals, and the roof scenes. The /go/ ad pages do
 * not load this file; they get CSS-only motion so the form is ready sooner.
 *
 * Reduced motion: no smooth scroll, no reveals, scenes stay on their finished
 * frame and the day scene lays its captions out as a plain list.
 */
import 'lenis/dist/lenis.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initDayScene, initHeroScene } from './scene';

gsap.registerPlugin(ScrollTrigger, SplitText);

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function smoothScroll() {
  const lenis = new Lenis({ autoRaf: false, lerp: 0.11 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href*="#"]');
    if (!a || a.origin !== location.origin || a.pathname !== location.pathname) return;
    const target = a.hash && document.getElementById(a.hash.slice(1));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -84, duration: 1.1 });
    history.replaceState(null, '', a.hash);
  });
  // Typing into the form should never fight the smooth scroller.
  document.addEventListener('focusin', (e) => {
    if ((e.target as HTMLElement).matches('input, textarea, select')) lenis.stop();
  });
  document.addEventListener('focusout', () => lenis.start());
  (window as any).__lenis = lenis;
}

function headlines() {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'split-line',
      autoSplit: true,
      onSplit(self) {
        return gsap.from(self.lines, {
          yPercent: 108,
          duration: 0.95,
          ease: 'expo.out',
          stagger: 0.09,
          scrollTrigger: { trigger: el, start: 'top 86%', once: true },
        });
      },
    });
  });
}

function reveals() {
  // Only animate what starts below the fold, so nothing on screen blinks out.
  const els = gsap.utils
    .toArray<HTMLElement>('[data-reveal]')
    .filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.92);
  if (!els.length) return;
  gsap.set(els, { y: 26, autoAlpha: 0 });
  ScrollTrigger.batch(els, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, { y: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out', stagger: 0.08 }),
  });
}

export function initMotion() {
  const hero = document.querySelector<SVGSVGElement>('[data-scene="hero"]');
  const day = document.querySelector<HTMLElement>('[data-day]');
  if (reduce) {
    day?.classList.add('day-static');
    return;
  }
  smoothScroll();
  if (hero) initHeroScene(hero, gsap, ScrollTrigger);
  if (day) initDayScene(day, gsap);
  // Splitting before the web font lands would measure lines in the fallback.
  document.fonts.ready.then(() => {
    headlines();
    reveals();
    ScrollTrigger.refresh();
  });
}
