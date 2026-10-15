/**
 * React Bits LightRays as the one WebGL hero background (solar page only).
 * Skipped entirely for reduced motion and for small screens, where the GPU
 * time is better spent on scrolling.
 */
import { useEffect, useState } from 'react';
import LightRays from '../react-bits/LightRays';

export default function Rays() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wide = window.matchMedia('(min-width: 48rem)');
    const sync = () => setOn(!reduced.matches && wide.matches && !document.hidden && document.documentElement.dataset.motion !== 'paused' && !document.documentElement.hasAttribute('data-menu-open'));
    sync();
    reduced.addEventListener('change', sync);
    wide.addEventListener('change', sync);
    document.addEventListener('killua:motionchange', sync);
    document.addEventListener('visibilitychange', sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes:true, attributeFilter:['data-menu-open'] });
    return () => {
      reduced.removeEventListener('change', sync);
      wide.removeEventListener('change', sync);
      document.removeEventListener('killua:motionchange', sync);
      document.removeEventListener('visibilitychange', sync);
      observer.disconnect();
    };
  }, []);
  if (!on) return null;
  return (
    <LightRays
      raysOrigin="top-right"
      raysColor="#f9c56f"
      raysSpeed={0.6}
      lightSpread={0.9}
      rayLength={1.4}
      fadeDistance={1.1}
      saturation={0.9}
      followMouse={false}
      noiseAmount={0.05}
      distortion={0.04}
    />
  );
}
