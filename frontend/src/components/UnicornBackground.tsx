'use client';

import { useEffect, useRef, useCallback } from 'react';

/* ================================================================
   Custom Animated Background — Evidence.AI (Theme-Aware)
   ================================================================ */

// ─── CONFIG ───
const LIGHT_COLORS = {
  orb1: { r: 100, g: 130, b: 220 },
  orb2: { r: 160, g: 110, b: 210 },
  orb3: { r: 80,  g: 190, b: 180 },
  orb4: { r: 210, g: 140, b: 180 },
  particles: 'rgba(26,26,60,0.18)',
  base: '#f5f5f7',
  orbOpacity: 0.18,
  secondaryOrb1: { r: 120, g: 160, b: 240 },
  secondaryOrb2: { r: 200, g: 150, b: 220 },
};

const DARK_COLORS = {
  orb1: { r: 20, g: 20, b: 40 },
  orb2: { r: 15, g: 15, b: 30 },
  orb3: { r: 10, g: 25, b: 30 },
  orb4: { r: 25, g: 15, b: 20 },
  particles: 'rgba(255,255,255,0.10)',
  base: '#000000',
  orbOpacity: 0.06,
  secondaryOrb1: { r: 15, g: 20, b: 35 },
  secondaryOrb2: { r: 20, g: 15, b: 30 },
};

const PARTICLE_COUNT = 55;
const PARTICLE_SPEED = 0.12;
const PARTICLE_MAX_SIZE = 1.6;

interface UnicornBackgroundProps {
  theme?: 'light' | 'dark';
}

export default function UnicornBackground({ theme = 'light' }: UnicornBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const colors = theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  // ── Particle system ──
  const initParticles = useCallback((w: number, h: number) => {
    return Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * PARTICLE_MAX_SIZE + 0.3,
      dx: (Math.random() - 0.5) * PARTICLE_SPEED,
      dy: (Math.random() - 0.5) * PARTICLE_SPEED,
      opacity: Math.random() * 0.5 + 0.1,
      pulse: Math.random() * Math.PI * 2,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    let particles = initParticles(w, h);

    const handleResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      particles = initParticles(w, h);
    };
    window.addEventListener('resize', handleResize);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.dx;
        p.y += p.dy;
        p.pulse += 0.008;

        // wrap around edges
        if (p.x < -5) p.x = w + 5;
        if (p.x > w + 5) p.x = -5;
        if (p.y < -5) p.y = h + 5;
        if (p.y > h + 5) p.y = -5;

        const flicker = p.opacity + Math.sin(p.pulse) * 0.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = colors.particles.replace('0.18', flicker.toFixed(2)).replace('0.15', flicker.toFixed(2));
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [initParticles, colors.particles]);

  // Build radial gradients from config
  const orb = (c: { r: number; g: number; b: number }, pos: string, size: string) =>
    `radial-gradient(ellipse ${size} at ${pos}, rgba(${c.r},${c.g},${c.b},${colors.orbOpacity}) 0%, transparent 70%)`;

  return (
    <div className="anim-bg fixed inset-0 z-0" style={{ transition: 'background 0.5s ease' }}>
      {/* Layer 1 — base gradient */}
      <div className="absolute inset-0" style={{ background: colors.base, transition: 'background 0.5s ease' }} />

      {/* Layer 2 — mesh gradient orbs */}
      <div
        className="anim-orb-layer absolute inset-0"
        style={{
          backgroundImage: [
            orb(colors.orb1, '25% 30%', '60% 60%'),
            orb(colors.orb2, '70% 60%', '50% 55%'),
            orb(colors.orb3, '50% 80%', '55% 50%'),
            orb(colors.orb4, '80% 20%', '45% 45%'),
          ].join(', '),
          transition: 'background-image 0.5s ease',
        }}
      />

      {/* Layer 3 — secondary drifting orbs */}
      <div
        className="anim-orb-layer-2 absolute inset-0"
        style={{
          backgroundImage: [
            orb(colors.secondaryOrb1, '60% 20%', '40% 40%'),
            orb(colors.secondaryOrb2, '30% 70%', '45% 50%'),
          ].join(', '),
        }}
      />

      {/* Layer 4 — noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />

      {/* Layer 5 — canvas particles */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ mixBlendMode: theme === 'dark' ? 'screen' : 'multiply', transition: 'opacity 0.5s ease' }}
      />
    </div>
  );
}
