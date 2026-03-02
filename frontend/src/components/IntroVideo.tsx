'use client';

import { useRef, useEffect, useState } from 'react';

interface IntroVideoProps {
  onComplete: () => void;
}

export default function IntroVideo({ onComplete }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);
  const calledRef = useRef(false);

  const done = () => {
    if (calledRef.current) return;
    calledRef.current = true;
    setFading(true);
    setTimeout(onComplete, 600);
  };

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) { done(); return; }

    // Try to play
    const playPromise = vid.play();
    if (playPromise) {
      playPromise.catch(() => done()); // autoplay blocked → skip
    }

    // Safety net: if video never ends, force complete after 6s
    const timer = setTimeout(done, 6000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.5s ease',
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        preload="auto"
        onEnded={done}
        onError={done}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      >
        <source src="/animation.mp4" type="video/mp4" />
      </video>

      <button
        onClick={done}
        style={{
          position: 'absolute',
          bottom: 40,
          right: 40,
          padding: '10px 24px',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(0,0,0,0.6)',
          color: 'rgba(255,255,255,0.7)',
          fontSize: 13,
          cursor: 'pointer',
          zIndex: 10,
        }}
      >
        Skip →
      </button>
    </div>
  );
}
