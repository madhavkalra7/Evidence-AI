'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShaderAnimation } from '@/components/ui/shader-animation';

interface IntroVideoProps {
  onComplete: () => void;
}

export default function IntroVideo({ onComplete }: IntroVideoProps) {
  const [phase, setPhase] = useState<'playing' | 'exiting' | 'done'>('playing');

  // Auto-transition after 3 seconds of shader animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('exiting');
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Safety: if the whole intro hasn't completed after 7s, force it
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 7000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const handleSkip = () => {
    setPhase('exiting');
  };

  // After exit animation completes
  const handleExitComplete = () => {
    onComplete();
  };

  // Safety: when exiting starts, set a backup timer in case onAnimationComplete doesn't fire
  useEffect(() => {
    if (phase === 'exiting') {
      const timer = setTimeout(() => {
        setPhase('done');
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {phase !== 'done' && (
        <motion.div
          key="intro-overlay"
          className="intro-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Shader animation layer */}
          <AnimatePresence onExitComplete={() => setPhase('done')}>
            {phase === 'playing' && (
              <motion.div
                key="shader-container"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                }}
              >
                <ShaderAnimation />

                {/* Evidence AI text overlay */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 'clamp(48px, 8vw, 96px)',
                      fontWeight: 700,
                      color: '#fff',
                      letterSpacing: '-2px',
                      fontFamily: "'Inter', system-ui, sans-serif",
                      textShadow: '0 0 40px rgba(100,160,255,0.5), 0 0 80px rgba(100,160,255,0.2)',
                      lineHeight: 1,
                    }}
                  >
                    Evidence<span style={{ color: 'rgba(255,255,255,0.4)' }}>.AI</span>
                  </span>
                  <motion.span
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.8 }}
                    style={{
                      fontSize: '14px',
                      fontWeight: 300,
                      color: 'rgba(255,255,255,0.5)',
                      letterSpacing: '4px',
                      textTransform: 'uppercase',
                      marginTop: '12px',
                    }}
                  >
                    Forensic Intelligence
                  </motion.span>
                </motion.div>

                {/* Skip button */}
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1, duration: 0.4 }}
                  onClick={handleSkip}
                  style={{
                    position: 'absolute',
                    bottom: '40px',
                    right: '40px',
                    padding: '10px 24px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(12px)',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: '13px',
                    fontWeight: 500,
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    zIndex: 10,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.95)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.5)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                  }}
                >
                  Skip Intro →
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── EXIT ANIMATION — cinematic reveal ── */}
          <AnimatePresence>
            {phase === 'exiting' && (
              <>
                {/* Shockwave ring */}
                <motion.div
                  key="shockwave"
                  initial={{ scale: 0, opacity: 0.8 }}
                  animate={{ scale: 8, opacity: 0 }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    position: 'absolute',
                    width: '200px',
                    height: '200px',
                    borderRadius: '50%',
                    border: '3px solid rgba(255,255,255,0.4)',
                    zIndex: 5,
                  }}
                />

                {/* Center glow burst */}
                <motion.div
                  key="glow-burst"
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: 6, opacity: 0 }}
                  transition={{ duration: 1.0, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(100,140,255,0.6) 0%, rgba(160,100,255,0.3) 40%, transparent 70%)',
                    zIndex: 4,
                  }}
                />

                {/* Particle burst — 12 particles flying outward */}
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = (i / 12) * Math.PI * 2;
                  const distance = 600 + Math.random() * 400;
                  const tx = Math.cos(angle) * distance;
                  const ty = Math.sin(angle) * distance;
                  const size = 3 + Math.random() * 5;
                  return (
                    <motion.div
                      key={`particle-${i}`}
                      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                      animate={{ x: tx, y: ty, scale: 0, opacity: 0 }}
                      transition={{
                        duration: 0.8 + Math.random() * 0.4,
                        ease: [0.16, 1, 0.3, 1],
                        delay: 0.05 * i,
                      }}
                      style={{
                        position: 'absolute',
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        background: i % 3 === 0
                          ? 'rgba(100,160,255,0.9)'
                          : i % 3 === 1
                          ? 'rgba(180,120,255,0.9)'
                          : 'rgba(100,220,200,0.9)',
                        zIndex: 6,
                        boxShadow: `0 0 ${size * 3}px ${
                          i % 3 === 0
                            ? 'rgba(100,160,255,0.5)'
                            : i % 3 === 1
                            ? 'rgba(180,120,255,0.5)'
                            : 'rgba(100,220,200,0.5)'
                        }`,
                      }}
                    />
                  );
                })}

                {/* Light streak lines */}
                {Array.from({ length: 6 }).map((_, i) => {
                  const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
                  const length = 800;
                  return (
                    <motion.div
                      key={`streak-${i}`}
                      initial={{ scaleX: 0, opacity: 0.7 }}
                      animate={{ scaleX: 1, opacity: 0 }}
                      transition={{
                        duration: 0.7,
                        ease: [0.16, 1, 0.3, 1],
                        delay: 0.1 + 0.04 * i,
                      }}
                      style={{
                        position: 'absolute',
                        width: length,
                        height: '1.5px',
                        background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)`,
                        transformOrigin: 'left center',
                        transform: `rotate(${(angle * 180) / Math.PI}deg)`,
                        zIndex: 5,
                      }}
                    />
                  );
                })}

                {/* White flash overlay */}
                <motion.div
                  key="white-flash"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.9, 0] }}
                  transition={{ duration: 0.8, times: [0, 0.3, 1], delay: 0.15 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: '#fff',
                    zIndex: 10,
                  }}
                />

                {/* Brand text flash */}
                <motion.div
                  key="brand-flash"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: [0.5, 1.05, 1], opacity: [0, 1, 0] }}
                  transition={{ duration: 1.2, times: [0, 0.4, 1], delay: 0.2 }}
                  style={{
                    position: 'absolute',
                    zIndex: 11,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '48px',
                      fontWeight: 700,
                      color: '#1a1a2e',
                      letterSpacing: '-1px',
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    Evidence<span style={{ color: 'rgba(26,26,46,0.3)' }}>.AI</span>
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 300,
                      color: 'rgba(26,26,46,0.5)',
                      letterSpacing: '3px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Forensic Intelligence
                  </span>
                </motion.div>

                {/* Final — curtain split (two halves slide apart) */}
                <motion.div
                  key="curtain-top"
                  initial={{ y: 0 }}
                  animate={{ y: '-100%' }}
                  transition={{ duration: 0.7, ease: [0.7, 0, 0.3, 1], delay: 1.1 }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '50%',
                    background: '#000',
                    zIndex: 12,
                  }}
                />
                <motion.div
                  key="curtain-bottom"
                  initial={{ y: 0 }}
                  animate={{ y: '100%' }}
                  transition={{ duration: 0.7, ease: [0.7, 0, 0.3, 1], delay: 1.1 }}
                  onAnimationComplete={() => setPhase('done')}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '50%',
                    background: '#000',
                    zIndex: 12,
                  }}
                />
              </>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
