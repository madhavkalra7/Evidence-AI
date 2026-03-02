const fs = require('fs');
const path = 'e:/rabbit ai tasks/EvidenceAI/frontend/src/components/DetectiveBoard.tsx';

const code = `'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const redStrings = [
  { x1: 27, y1: 32, x2: 50, y2: 27 },   // DNA -> FIN
  { x1: 50, y1: 27, x2: 75, y2: 28 },   // FIN -> AUD
  { x1: 27, y1: 32, x2: 36, y2: 68 },   // DNA -> CCTV
  { x1: 50, y1: 27, x2: 36, y2: 68 },   // FIN -> CCTV
  { x1: 36, y1: 68, x2: 65, y2: 64 },   // CCTV -> PUZ
  { x1: 75, y1: 28, x2: 65, y2: 64 },   // AUD -> PUZ
  { x1: 27, y1: 32, x2: 75, y2: 28 },   // DNA -> AUD (long)
  { x1: 50, y1: 27, x2: 65, y2: 64 },   // FIN -> PUZ (diagonal)
];

const metalPins = [
  { top: '30%',  left: '38%' },
  { top: '27.5%', left: '62.5%' },
  { top: '50%', left: '31.5%' },
  { top: '47.5%',   left: '43%' },
  { top: '66%',   left: '50.5%' },
  { top: '46%',   left: '70%' },
  { top: '30%', left: '51%' },
  { top: '45.5%',   left: '57.5%' },
];

function useTilt(intensity = 15) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState({ transform: 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)' });
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setStyle({ transform: \`perspective(800px) rotateY(\${x * intensity}deg) rotateX(\${-y * intensity}deg) scale(1.04)\` });
  }, [intensity]);
  const handleMouseLeave = useCallback(() => {
    setStyle({ transform: 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)' });
  }, []);
  return { ref, style, handleMouseMove, handleMouseLeave };
}

function EvidenceCard({ className, children, pinType }: { className: string, children: React.ReactNode, pinType: 'top-left' | 'top-right' | 'top-center' }) {
  const { ref, style, handleMouseMove, handleMouseLeave } = useTilt(12);
  const pinStyle = pinType === 'top-left' ? { left: 24, top: -6 } : pinType === 'top-right' ? { right: 24, top: -6 } : { left: '50%', top: -6, transform: 'translateX(-50%)' };
  return (
    <div ref={ref} className={\`db-card \${className}\`} style={style} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <div className="db-pearl-pin" style={pinStyle}><div className="db-pearl-shadow"/></div>
      {children}
    </div>
  );
}

function DNAHelix() {
  return (
    <svg viewBox="0 0 220 110" className="db-dna-svg">
      <path d="M10,30 C35,10 60,50 90,30 C120,10 145,50 175,30 C195,20 210,35 220,30" stroke="#00bbff" strokeWidth="1.5" fill="none" opacity="0.6" />
      <path d="M10,80 C35,100 60,60 90,80 C120,100 145,60 175,80 C195,90 210,75 220,80" stroke="#00ddff" strokeWidth="1.5" fill="none" opacity="0.5" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const cx = 15 + i * 24;
        const phase = i * 0.78;
        const topY = 30 + Math.sin(phase) * 20;
        const botY = 80 - Math.sin(phase) * 20;
        return (
          <g key={i}>
            <line x1={cx} y1={topY} x2={cx} y2={botY} stroke="#00aaff" strokeWidth="1" opacity="0.3" />
            <circle cx={cx} cy={topY} r="3.5" fill="#00bbff" opacity="0.75">
              <animate attributeName="opacity" values="0.5;1;0.5" dur={\`\${2 + i * 0.2}s\`} repeatCount="indefinite" />
            </circle>
            <circle cx={cx} cy={botY} r="3.5" fill="#00ddff" opacity="0.75">
              <animate attributeName="opacity" values="0.5;1;0.5" dur={\`\${2.5 + i * 0.15}s\`} repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

function Waveform() {
  const bars = Array.from({ length: 45 }, (_, i) => {
    const seed = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    const rand = seed - Math.floor(seed);
    const h = 6 + Math.abs(Math.sin(i * 0.45)) * 30 + rand * 10;
    return { x: 1 + i * 4.3, h };
  });
  return (
    <svg viewBox="0 0 200 50" className="db-waveform-svg">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={25 - b.h / 2} width="2.5" height={b.h} rx="1.25" fill="#5a4e38" opacity="0.7">
          <animate attributeName="height" values={\`\${b.h};\${b.h * 0.4};\${b.h}\`} dur={\`\${1.2 + (i % 5) * 0.25}s\`} repeatCount="indefinite" />
          <animate attributeName="y" values={\`\${25 - b.h / 2};\${25 - b.h * 0.2};\${25 - b.h / 2}\`} dur={\`\${1.2 + (i % 5) * 0.25}s\`} repeatCount="indefinite" />
        </rect>
      ))}
    </svg>
  );
}

function CCTVScreen() {
  return (
    <div className="db-cctv-screen">
      <svg className="db-cctv-person-svg" viewBox="0 0 100 120" preserveAspectRatio="none">
        <path d="M50,15 C40,15 32,25 32,45 C32,55 35,62 38,68 C22,78 10,95 5,120 L95,120 C90,95 78,78 62,68 C65,62 68,55 68,45 C68,25 60,15 50,15 Z" fill="#111111" opacity="0.7" filter="blur(1.5px)" />
        <ellipse cx="50" cy="22" rx="14" ry="16" fill="#1a1a1a" opacity="0.8" filter="blur(1px)" />
      </svg>
      <div className="db-cctv-scanlines" />
      <div className="db-cctv-rec">
        <span className="db-cctv-rec-dot" />
        <span className="db-cctv-rec-text">REC</span>
      </div>
      <div className="db-cctv-ts-top">CAM-03</div>
      <div className="db-cctv-ts-bottom">2024-01-15 02:47:33</div>
    </div>
  );
}

export default function DetectiveBoard() {
  const [flickerPhase, setFlickerPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFlickerPhase((p) => p + 1), 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="db-wrapper">
      <img src="/bg.png" alt="" className="db-bg" draggable={false} />
      <div className="db-vignette" />

      {/* Torn note pinned on left side with KEY INSIGHTS and ANOMALY DETECTED */}
      <div className="db-torn-paper-note" style={{ top: '20%', left: '4%' }}>
        <div className="db-pearl-pin" style={{ top: 5, left: '50%', transform: 'translateX(-50%)' }}><div className="db-pearl-shadow"/></div>
        <div style={{ marginTop: 15, fontWeight: 'bold', fontSize: 13, borderBottom: '1px solid #ccc', paddingBottom: 4, marginBottom: 6 }}>INVESTIGATION LOG</div>
        <div style={{ background: 'rgba(255,255,100,0.5)', padding: 4, marginBottom: 5 }}>KEY INSIGHTS</div>
        <ul style={{ paddingLeft: 15, margin: '5px 0', fontSize: 10, opacity: 0.8 }}>
          <li>Location tracking mismatch</li>
          <li>Encrypted comms intercepted</li>
        </ul>
        <div style={{ background: 'rgba(255,100,100,0.3)', padding: 4, marginTop: 10, color: '#c22' }}><strong>ANOMALY DETECTED</strong></div>
      </div>

      <svg className="db-strings" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <filter id="glow"><feGaussianBlur stdDeviation="0.3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {redStrings.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} className="db-string-line" style={{ animationDelay: \`\${i * 0.4}s\`, opacity: 0.5 + Math.sin(flickerPhase * 0.7 + i * 1.1) * 0.15 }} filter="url(#glow)" />
        ))}
      </svg>

      {metalPins.map((p, i) => (<div key={i} className="db-metal-ball" style={{ top: p.top, left: p.left }} />))}

      <EvidenceCard className="db-card-dna" pinType="top-left">
        <div className="db-card-inner db-card-inner-dark">
          <h3 className="db-card-title db-card-title-light">DNA ANALYSIS</h3>
          <p className="db-card-sub db-card-sub-light">Sample: A1-4420 | Match: 98.7%</p>
          <div className="db-card-dna-helix"><DNAHelix /></div>
          <div className="db-card-detail-light">
            <p>Primary suspect DNA confirmed.</p>
            <p>Secondary trace &mdash; unknown contributor.</p>
          </div>
        </div>
      </EvidenceCard>

      <EvidenceCard className="db-card-financial" pinType="top-left">
        <div className="db-card-inner db-card-inner-paper">
          <h3 className="db-card-title db-card-title-dark">FINANCIAL RECORDS</h3>
          <p className="db-card-sub db-card-sub-dark">Offshore Account #45-9822</p>
          <div className="db-card-body-dark">
            <p><strong>$2.4M</strong> transferred 01/12</p>
            <p>Shell Corp &rarr; <em>Apex Holdings</em></p>
            <p>Wire ref: TXN-8847201</p>
          </div>
          <div className="db-card-highlight-red">FLAGGED &mdash; SUSPICIOUS ACTIVITY</div>
        </div>
      </EvidenceCard>

      <EvidenceCard className="db-card-audio" pinType="top-right">
        <div className="db-card-inner db-card-inner-aged">
          <h3 className="db-card-title db-card-title-dark">AUDIO RECORDING</h3>
          <p className="db-card-sub db-card-sub-dark">Encrypted Voicemail &mdash; DECRYPTED</p>
          <div className="db-card-waveform-wrap"><Waveform /></div>
          <div className="db-card-audio-info">
            <p><strong>Duration:</strong> 2:47</p>
            <p><strong>Speaker:</strong> Unidentified Male</p>
            <p><strong>Key phrase:</strong> <em>&ldquo;&hellip;at the warehouse&hellip;&rdquo;</em></p>
          </div>
        </div>
      </EvidenceCard>

      <EvidenceCard className="db-card-cctv" pinType="top-center">
        <div className="db-card-inner db-card-inner-dark">
          <h3 className="db-card-title db-card-title-light">CCTV FOOTAGE</h3>
          <p className="db-card-sub db-card-sub-light">Alleyway Cam &mdash; Partial Match</p>
          <div className="db-card-cctv-wrap"><CCTVScreen /></div>
          <div className="db-card-detail-light">
            <p>Subject spotted 02:47 AM</p>
            <p>Face partially obscured</p>
          </div>
        </div>
      </EvidenceCard>

      <EvidenceCard className="db-card-puzzle" pinType="top-center">
        <div className="db-card-inner db-card-inner-parchment">
          <h3 className="db-card-title db-card-title-dark db-card-title-serif">THE PUZZLE PIECE</h3>
          <p className="db-card-sub db-card-sub-dark">Witness Testimony Confirmed</p>
          <div className="db-card-body-dark">
            <p>Witness places suspect at 11:30 PM near the dock.</p>
            <p>Matches phone GPS data &plusmn; 200m.</p>
          </div>
          <div className="db-card-highlight-green">CORROBORATED</div>
        </div>
      </EvidenceCard>

      <div className="db-scanlines" />
    </div>
  );
}
`;

fs.writeFileSync(path, code);
console.log('DetectiveBoard.tsx overwritten successfully');
