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
    const ok =
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      window.matchMedia('(min-width: 48rem)').matches;
    setOn(ok);
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
