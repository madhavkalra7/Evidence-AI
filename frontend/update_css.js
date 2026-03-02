const fs = require('fs');
const cssPath = 'e:/rabbit ai tasks/EvidenceAI/frontend/src/app/globals.css';
const cssToAdd = `
/* ── OVERRIDE NEW STYLES ── */

.db-pearl-pin {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ffffff 0%, #d4dbd9 30%, #8b9291 75%, #4a4e4d 95%);
  box-shadow: 
    inset -1px -1px 4px rgba(0,0,0,0.5),
    0 0 2px rgba(0,0,0,0.6),
    2px 3px 5px rgba(0,0,0,0.5);
  z-index: 20;
}

.db-pearl-shadow {
  position: absolute;
  top: 13px;
  left: 3px;
  width: 1px;
  height: 9px;
  background: rgba(0,0,0,0.6);
  transform: rotate(35deg);
  transform-origin: top center;
  filter: blur(0.5px);
}

.db-metal-ball {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ffffff 0%, #a0a0a0 40%, #555 80%, #222 100%);
  box-shadow: 
    inset -1px -1px 2px rgba(0,0,0,0.5),
    0 0 1px rgba(0,0,0,0.8),
    1px 2px 4px rgba(0,0,0,0.5);
  z-index: 10;
  transform: translate(-50%, -50%);
}

.db-neon-label {
  position: absolute;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #fff;
  background: rgba(0,0,0,0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 4px 8px;
  z-index: 4;
  text-shadow: 0 0 3px rgba(255,255,255,0.7), 0 0 6px rgba(255,255,255,0.4);
  box-shadow: 0 0 4px rgba(255,255,255,0.1) inset;
  letter-spacing: 1px;
  pointer-events: none;
}

.db-torn-paper-note {
  position: absolute;
  background: #fdfaf0;
  width: 130px;
  padding: 10px;
  transform: rotate(-3deg);
  box-shadow: 1px 2px 5px rgba(0,0,0,0.3);
  z-index: 4;
  clip-path: polygon(0% 0%, 100% 0%, 97% 95%, 85% 98%, 70% 95%, 55% 99%, 40% 95%, 25% 100%, 10% 96%, 0% 100%);
  font-family: 'Inter', sans-serif;
  color: #111;
  font-size: 11px;
}
.db-torn-paper-note::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(135deg, transparent 40%, rgba(0,0,0,0.02) 100%);
  pointer-events: none;
}

/* Push everything down and cluster together */
.db-card-dna {
  top: 30% !important;
  left: 20% !important;
}

.db-card-financial {
  top: 25% !important;
  left: 45% !important;
}

.db-card-audio {
  top: 25% !important;
  left: 70% !important;
}

.db-card-cctv {
  top: 66% !important;
  left: 31% !important;
}

.db-card-puzzle {
  top: 62% !important;
  left: 60% !important;
}

.db-cctv-person-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

@media (max-width: 1200px) {
  .db-card-dna { left: 10% !important; }
  .db-card-financial { left: 35% !important; }
  .db-card-audio { left: 65% !important; }
}
`;

let content = fs.readFileSync(cssPath, 'utf8');
if (!content.includes('OVERRIDE NEW STYLES')) {
  fs.writeFileSync(cssPath, content + cssToAdd, 'utf8');
  console.log("Appended styles successfully.");
} else {
  console.log("Styles already appended.");
}
