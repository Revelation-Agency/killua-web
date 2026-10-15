/**
 * Main-site motion: Lenis smooth scroll wired into GSAP's ticker, SplitText
 * headline reveals, photographic depth, and the home-energy illustration. The /go/ ad pages do
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

gsap.registerPlugin(ScrollTrigger, SplitText);

function smoothScroll() {
  const lenis = new Lenis({ autoRaf: false, lerp: 0.11 });
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (t: number) => lenis.raf(t * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  const anchorClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href*="#"]');
    if (!a || a.origin !== location.origin || a.pathname !== location.pathname) return;
    const target = a.hash && document.getElementById(a.hash.slice(1));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -84, duration: 1.1 });
    history.replaceState(null, '', a.hash);
  };
  document.addEventListener('click', anchorClick);
  // Typing into the form should never fight the smooth scroller.
  const focusIn = (e: FocusEvent) => {
    if ((e.target as HTMLElement).matches('input, textarea, select')) lenis.stop();
  };
  const focusOut = () => { if (!document.querySelector('[data-drawer][data-open]')) lenis.start(); };
  document.addEventListener('focusin', focusIn);
  document.addEventListener('focusout', focusOut);
  (window as any).__lenis = lenis;
  return () => {
    gsap.ticker.remove(tick);
    document.removeEventListener('click', anchorClick);
    document.removeEventListener('focusin', focusIn);
    document.removeEventListener('focusout', focusOut);
    lenis.destroy();
    delete (window as any).__lenis;
  };
}

function headlines() {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    if (el.getBoundingClientRect().top <= window.innerHeight * .92) return;
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
  let context: gsap.Context | undefined;
  let stopScroll: (() => void) | undefined;
  let fontsReady = false;
  const refresh = () => {
    context?.revert();
    context = undefined;
    stopScroll?.();
    stopScroll = undefined;
    if (!fontsReady || document.documentElement.hasAttribute('data-menu-open') || document.documentElement.dataset.motion === 'paused' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Phones retain native scrolling, including momentum inside the menu.
    if (matchMedia('(min-width: 64rem) and (hover: hover)').matches) stopScroll = smoothScroll();
    context = gsap.context(() => {
      headlines();
      reveals();
      const desktop = matchMedia('(min-width: 64rem) and (hover: hover)').matches;
      if (desktop) document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        gsap.fromTo(el, { yPercent: -3, scale: 1.08 }, { yPercent: 3, ease:'none', scrollTrigger: {trigger:el.parentElement,start:'top bottom',end:'bottom top',scrub:1} });
      });
      document.querySelectorAll<HTMLElement>('.service-image, .craft-photo picture, .page-hero .photo picture').forEach(el => {
        gsap.fromTo(el, { scale: 1.08 }, { scale: 1, ease:'none', scrollTrigger: { trigger:el.parentElement,start:'top bottom',end:'bottom 25%',scrub:1.2 } });
      });
      const house = document.querySelector('.system-house');
      if (house) gsap.fromTo(house, { y:15 }, { y:-8,ease:'none',scrollTrigger:{trigger:'.system-drawing',start:'top bottom',end:'bottom top',scrub:1.5} });
      const track = document.querySelector('.process-track');
      if (track) {
        gsap.to(track, { '--process-progress':1,ease:'none',scrollTrigger:{trigger:track,start:'top 85%',end:'bottom 45%',scrub:.7} });
        track.querySelectorAll('li').forEach(el => ScrollTrigger.create({trigger:el,start:'top 75%',end:'bottom 25%',toggleClass:'is-current'}));
      }
      const wordmark = document.querySelector('.footer-wordmark');
      if (wordmark) gsap.fromTo(wordmark, { xPercent:-3 }, { xPercent:0,ease:'none',scrollTrigger:{trigger:wordmark,start:'top bottom',end:'bottom bottom',scrub:1} });
    });
    ScrollTrigger.refresh();
  };
  document.addEventListener('killua:motionchange', refresh);
  matchMedia('(min-width: 64rem) and (hover: hover)').addEventListener('change', refresh);
  document.addEventListener('killua:menuchange', event => {
    const open = (event as CustomEvent).detail.open;
    if (!open && !context) { refresh(); return; }
    ScrollTrigger.getAll().forEach(trigger => open ? trigger.disable(false) : trigger.enable(false, false));
    if (!open) ScrollTrigger.update();
  });
  document.fonts.ready.then(() => {
    fontsReady = true;
    refresh();
  });
}
