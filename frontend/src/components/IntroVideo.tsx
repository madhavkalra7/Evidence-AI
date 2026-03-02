'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

/*
 * IntroVideo — Pure CSS animation, zero framer-motion.
 * Why: framer-motion causes React re-renders on every animation frame,
 * whereas CSS animations run on the compositor thread (GPU) with zero JS cost.
 *
 * Flow: loading → playing → exiting → (removed from DOM)
 * Fallbacks: 5s buffer timeout, 15s hard timeout, onError skip
 */

interface IntroVideoProps {
  onComplete: () => void;
}

export default function IntroVideo({ onComplete }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const [phase, setPhase] = useState<'loading' | 'playing' | 'exiting' | 'done'>('loading');

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase('done');
    // Small delay so the fade-out CSS completes before unmount
    setTimeout(() => onComplete(), 400);
  }, [onComplete]);

  const triggerExit = useCallback(() => {
    if (doneRef.current) return;
    if (videoRef.current) videoRef.current.pause();
    setPhase('exiting');
    // Exit animation takes ~1.8s (0.9s delay + 0.7s curtain + 0.2s buffer)
    setTimeout(() => finish(), 2000);
  }, [finish]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) { finish(); return; }

    let cancelled = false;

    // 5s — if video hasn't started playing, skip
    const bufferTimer = setTimeout(() => {
      if (!cancelled && phase === 'loading') triggerExit();
    }, 5000);

    // 15s — absolute hard limit
    const hardTimer = setTimeout(() => {
      if (!cancelled) finish();
    }, 15000);

    const onReady = () => {
      if (cancelled) return;
      clearTimeout(bufferTimer);
      setPhase('playing');
      vid.play().catch(() => triggerExit());
    };

    if (vid.readyState >= 3) {
      onReady();
    } else {
      vid.addEventListener('canplay', onReady, { once: true });
    }

    return () => {
      cancelled = true;
      clearTimeout(bufferTimer);
      clearTimeout(hardTimer);
      vid.removeEventListener('canplay', onReady);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'done') return null;

  return (
    <>
      {/* Scoped keyframes — removed with component */}
      <style>{`
        @keyframes iv-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes iv-flash {
          0%   { opacity: 0; }
          30%  { opacity: 0.85; }
          100% { opacity: 0; }
        }
        @keyframes iv-brand-in {
          0%   { transform: scale(0.5); opacity: 0; }
          40%  { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes iv-curtain-up {
          to { transform: translateY(-100%); }
        }
        @keyframes iv-curtain-down {
          to { transform: translateY(100%); }
        }
        @keyframes iv-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes iv-fade-out {
          to { opacity: 0; pointer-events: none; }
        }
      `}</style>

      <div
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
        {/* ── LOADING SPINNER ── */}
        {phase === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, zIndex: 20 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.1)',
                borderTopColor: 'rgba(100,160,255,0.8)',
                animation: 'iv-spin 0.8s linear infinite',
              }}
            />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, letterSpacing: 2 }}>
              LOADING
            </span>
          </div>
        )}

        {/* ── VIDEO — always in DOM for instant buffering, opacity toggled ── */}
        <video
          ref={videoRef}
          src="/animation.mp4"
          muted
          playsInline
          preload="auto"
          onEnded={() => triggerExit()}
          onError={() => triggerExit()}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: phase === 'playing' ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />

        {/* ── SKIP BUTTON ── */}
        {phase === 'playing' && (
          <button
            onClick={() => triggerExit()}
            style={{
              position: 'absolute',
              bottom: 40,
              right: 40,
              padding: '10px 24px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(12px)',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 0.5,
              cursor: 'pointer',
              zIndex: 10,
              animation: 'iv-fade-in 0.4s ease 1s both',
            }}
          >
            Skip Intro →
          </button>
        )}

        {/* ── EXIT ANIMATIONS (pure CSS, GPU compositor thread) ── */}
        {phase === 'exiting' && (
          <>
            {/* White flash */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: '#fff',
                zIndex: 10,
                animation: 'iv-flash 0.6s ease-out forwards',
              }}
            />

            {/* Brand text */}
            <div
              style={{
                position: 'absolute',
                zIndex: 11,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                animation: 'iv-brand-in 1.0s ease-out 0.1s both',
              }}
            >
              <span
                style={{
                  fontSize: 48,
                  fontWeight: 700,
                  color: '#1a1a2e',
                  letterSpacing: -1,
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                Evidence<span style={{ color: 'rgba(26,26,46,0.3)' }}>.AI</span>
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 300,
                  color: 'rgba(26,26,46,0.5)',
                  letterSpacing: 3,
                  textTransform: 'uppercase' as const,
                }}
              >
                Forensic Intelligence
              </span>
            </div>

            {/* Curtain top half */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '50%',
                background: '#000',
                zIndex: 12,
                animation: 'iv-curtain-up 0.7s cubic-bezier(0.7,0,0.3,1) 0.9s forwards',
              }}
            />

            {/* Curtain bottom half */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '50%',
                background: '#000',
                zIndex: 12,
                animation: 'iv-curtain-down 0.7s cubic-bezier(0.7,0,0.3,1) 0.9s forwards',
              }}
            />
          </>
        )}
      </div>
    </>
  );
}
