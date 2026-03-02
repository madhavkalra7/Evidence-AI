'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Crosshair, Fingerprint, Loader2 } from 'lucide-react';
import type {
  SceneAnalysis,
  SceneFinding,
  SceneHoverWord,
} from '@/lib/api';

/* ============================================================
   SCENE ANALYSIS MODAL — Labeled-diagram style
   ============================================================
   Full-screen forensic viewer:
   - Image pinned in center with push-pin
   - Red animated lines coming OUT of the image to label annotations
     (exactly like a labeled diagram in a biology textbook)
   - Each label = one LLM finding
   - Floating forensic words appear on the image automatically
   - All properly animated
   ============================================================ */

interface SceneAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  fileName: string;
  imageType: 'scene_image' | 'evidence_image';
  analysis: SceneAnalysis | null;
  isAnalyzing: boolean;
}

const severityColors: Record<string, string> = {
  high: '#ff2244',
  medium: '#ffaa22',
  low: '#44aaff',
};

const categoryIcons: Record<string, string> = {
  object: '📦',
  damage: '💥',
  evidence: '🔬',
  anomaly: '⚠️',
  entry_point: '🚪',
  surface: '🔍',
};

/* ── Labeled Diagram Line + Label ──
   Draws a red animated line FROM a point inside the image
   TO a label box positioned outside/around the image edge.  */
function LabeledLine({
  startX,
  startY,
  endX,
  endY,
  label,
  description,
  severity,
  category,
  index,
  isActive,
  onHover,
  onLeave,
  findingId,
}: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  label: string;
  description: string;
  severity: string;
  category: string;
  index: number;
  isActive: boolean;
  onHover: (id: number) => void;
  onLeave: () => void;
  findingId: number;
}) {
  const color = severityColors[severity] || '#ff2244';
  const icon = categoryIcons[category] || '🔍';
  const labelWidth = Math.max(label.length * 7 + 40, 110);
  const isRight = endX > startX;

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 + index * 0.18, duration: 0.5 }}
      style={{ cursor: 'pointer', pointerEvents: 'all' }}
      onMouseEnter={() => onHover(findingId)}
      onMouseLeave={() => onLeave()}
    >
      {/* Glow behind line */}
      <motion.line
        x1={startX} y1={startY} x2={endX} y2={endY}
        stroke={color}
        strokeWidth={isActive ? 4 : 2}
        opacity={isActive ? 0.2 : 0.08}
        filter="url(#glow)"
      />

      {/* Main animated line */}
      <motion.line
        x1={startX} y1={startY}
        x2={startX} y2={startY}
        stroke={color}
        strokeWidth={isActive ? 2 : 1.2}
        strokeDasharray="6 3"
        opacity={isActive ? 1 : 0.6}
        animate={{ x2: endX, y2: endY }}
        transition={{
          delay: 0.5 + index * 0.18,
          duration: 0.8,
          ease: 'easeOut',
        }}
      />

      {/* Pulsing dot at start (on image) */}
      <motion.circle
        cx={startX} cy={startY}
        r={isActive ? 6 : 4}
        fill={color}
        opacity={isActive ? 1 : 0.8}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.4 + index * 0.18, type: 'spring', stiffness: 400 }}
      >
        <animate
          attributeName="r"
          values={isActive ? '5;8;5' : '3;5;3'}
          dur="2s"
          repeatCount="indefinite"
        />
      </motion.circle>

      {/* Outer pulse ring at start */}
      <circle cx={startX} cy={startY} r="8" fill="none" stroke={color} strokeWidth="1" opacity="0.2">
        <animate attributeName="r" values="6;14;6" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0;0.3" dur="2.5s" repeatCount="indefinite" />
      </circle>

      {/* Label box at end of line */}
      <motion.g
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          delay: 0.8 + index * 0.18,
          type: 'spring',
          stiffness: 300,
          damping: 22,
        }}
      >
        {/* Label background */}
        <rect
          x={isRight ? endX : endX - labelWidth}
          y={endY - 14}
          width={labelWidth}
          height={isActive ? 44 : 28}
          rx="6"
          fill={isActive ? 'rgba(10,14,26,0.95)' : 'rgba(10,14,26,0.85)'}
          stroke={color}
          strokeWidth={isActive ? 1.5 : 0.8}
          strokeOpacity={isActive ? 0.8 : 0.4}
        />

        {/* Small connector dot on label box */}
        <circle
          cx={isRight ? endX + 4 : endX - 4}
          cy={endY}
          r="3"
          fill={color}
          opacity={isActive ? 1 : 0.6}
        />

        {/* Label text */}
        <text
          x={isRight ? endX + 16 : endX - labelWidth + 16}
          y={endY + 4}
          fill="white"
          fontSize="11"
          fontWeight="700"
          fontFamily="Inter, system-ui, sans-serif"
          opacity={isActive ? 1 : 0.85}
        >
          {icon} {label}
        </text>

        {/* Description text (only when hovered) */}
        {isActive && (
          <text
            x={isRight ? endX + 16 : endX - labelWidth + 16}
            y={endY + 22}
            fill="white"
            fontSize="9"
            fontWeight="400"
            fontFamily="Inter, system-ui, sans-serif"
            opacity={0.5}
          >
            {description.slice(0, 55)}{description.length > 55 ? '…' : ''}
          </text>
        )}
      </motion.g>
    </motion.g>
  );
}

/* ── Floating Hover Words — show automatically, cycle in/out ── */
function FloatingWords({
  words,
}: {
  words: SceneHoverWord[];
}) {
  const positions = useMemo(
    () =>
      words.map((_, i) => ({
        x: 8 + Math.random() * 84,
        y: 8 + Math.random() * 84,
        delay: i * 0.4,
        duration: 3 + Math.random() * 4,
        size: 10 + Math.random() * 5,
      })),
    [words]
  );

  return (
    <>
      {words.map((w, i) => (
        <motion.div
          key={`fw-${i}`}
          className="scene-hover-word"
          style={{
            left: `${positions[i].x}%`,
            top: `${positions[i].y}%`,
            color: w.color,
            fontSize: `${positions[i].size}px`,
          }}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{
            opacity: [0, 0.85, 0.5, 0.8, 0],
            scale: [0.3, 1.1, 1, 1.05, 0.3],
            y: [15, -5, 0, -3, 10],
          }}
          transition={{
            delay: 1.5 + positions[i].delay,
            duration: positions[i].duration,
            repeat: Infinity,
            repeatDelay: 2 + Math.random() * 3,
            ease: 'easeInOut',
          }}
        >
          {w.word}
        </motion.div>
      ))}
    </>
  );
}

/* ── Main Modal ── */
export default function SceneAnalysisModal({
  isOpen,
  onClose,
  imageUrl,
  fileName,
  imageType,
  analysis,
  isAnalyzing,
}: SceneAnalysisModalProps) {
  const [hoveredFinding, setHoveredFinding] = useState<number | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [imgDimensions, setImgDimensions] = useState({ width: 500, height: 400 });

  // Calculate labeled-diagram line endpoints
  const labeledLines = useMemo(() => {
    if (!analysis || !analysis.findings.length) return [];
    const W = imgDimensions.width;
    const H = imgDimensions.height;
    const margin = 40;

    return analysis.findings.map((f, i) => {
      const startX = f.position.x * W;
      const startY = f.position.y * H;

      // Alternate left/right, distribute vertically
      const isRight = i % 2 === 0;
      const vertSpacing = H / (Math.ceil(analysis.findings.length / 2) + 1);
      const sideIndex = Math.floor(i / 2);
      const endX = isRight ? W + margin : -margin;
      const endY = vertSpacing * (sideIndex + 1);

      return { finding: f, startX, startY, endX, endY };
    });
  }, [analysis, imgDimensions]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const container = imageContainerRef.current;
    if (container) {
      const ratio = img.naturalWidth / img.naturalHeight;
      const maxW = container.clientWidth - 380; // leave room for labels
      const maxH = container.clientHeight - 120;
      let w = Math.min(maxW, 550);
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      setImgDimensions({ width: w, height: h });
    }
    setImageLoaded(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setImageLoaded(false);
      setHoveredFinding(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const accentColor = imageType === 'scene_image' ? '#ff4466' : '#44ff88';
  const svgPadding = 180;
  const svgW = imgDimensions.width + svgPadding * 2;
  const svgH = imgDimensions.height + 20;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="scene-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="scene-modal"
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 30 }}
            transition={{ type: 'spring', stiffness: 250, damping: 25 }}
          >
            {/* ── Header ── */}
            <div className="scene-modal-header">
              <div className="scene-modal-header-left">
                <div
                  className="scene-modal-header-dot"
                  style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}60` }}
                />
                <div>
                  <span className="scene-modal-header-type" style={{ color: accentColor }}>
                    {imageType === 'scene_image' ? 'CRIME SCENE ANALYSIS' : 'EVIDENCE ANALYSIS'}
                  </span>
                  <span className="scene-modal-header-file">{fileName}</span>
                </div>
              </div>

              {analysis && (
                <motion.div
                  className="scene-modal-summary"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  {analysis.summary}
                </motion.div>
              )}

              <button onClick={onClose} className="scene-modal-close">
                <X size={18} />
              </button>
            </div>

            {/* ── Main Content — Full-width labeled diagram ── */}
            <div className="scene-modal-body">
              <div
                className="scene-modal-image-area scene-modal-image-area-full"
                ref={imageContainerRef}
              >
                {/* Analyzing overlay */}
                {isAnalyzing && !analysis && (
                  <motion.div
                    className="scene-analyzing-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <Loader2 size={28} className="animate-spin" style={{ color: accentColor }} />
                    <p className="scene-analyzing-title">Analyzing Scene with LLM...</p>
                    <p className="scene-analyzing-sub">Extracting forensic findings, connections &amp; annotations</p>
                  </motion.div>
                )}

                {/* Pin at top center */}
                <div className="scene-modal-pin">
                  <div className="scene-modal-pin-head" />
                  <div className="scene-modal-pin-shadow" />
                </div>

                {/* Hanging string */}
                <svg className="scene-modal-string" viewBox="0 0 200 30" preserveAspectRatio="none">
                  <path d="M 20 0 Q 100 30 180 0" stroke="#666" strokeWidth="1.5" fill="none" opacity="0.4" />
                </svg>

                {/* The labeled diagram wrapper — contains image + SVG lines */}
                <div className="scene-labeled-wrapper" style={{ position: 'relative' }}>
                  {/* Image Frame */}
                  <motion.div
                    className="scene-modal-image-frame"
                    initial={{ rotate: -0.5 }}
                    animate={{ rotate: [0, -0.3, 0.3, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ width: imgDimensions.width + 20, maxWidth: '90%', position: 'relative', zIndex: 2 }}
                  >
                    <div className="scene-modal-image-wrapper">
                      <img
                        src={imageUrl}
                        alt={fileName}
                        onLoad={handleImageLoad}
                        className="scene-modal-image"
                        draggable={false}
                      />

                      {/* Floating words on image — show automatically */}
                      {analysis && analysis.hover_words.length > 0 && (
                        <FloatingWords words={analysis.hover_words} />
                      )}

                      {/* Scanline effect */}
                      <div className="scene-modal-scanline" />
                    </div>

                    <div className="scene-modal-frame-label">
                      <Fingerprint size={11} />
                      <span>{fileName}</span>
                      <span className="scene-modal-frame-type" style={{ color: accentColor }}>
                        {imageType === 'scene_image' ? 'CRIME SCENE' : 'EVIDENCE'}
                      </span>
                    </div>
                  </motion.div>

                  {/* SVG overlay — labeled diagram lines go from image points to label boxes on sides */}
                  {imageLoaded && analysis && analysis.findings.length > 0 && (
                    <svg
                      className="scene-labeled-diagram-svg"
                      viewBox={`${-svgPadding} -10 ${svgW} ${svgH}`}
                      style={{
                        width: svgW,
                        height: svgH,
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                        zIndex: 3,
                      }}
                    >
                      <defs>
                        <filter id="glow">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>

                      {/* Labeled lines from image → label boxes */}
                      {labeledLines.map((ll, i) => (
                        <LabeledLine
                          key={`ll-${ll.finding.id}`}
                          startX={ll.startX}
                          startY={ll.startY}
                          endX={ll.endX}
                          endY={ll.endY}
                          label={ll.finding.label}
                          description={ll.finding.description}
                          severity={ll.finding.severity}
                          category={ll.finding.category}
                          index={i}
                          isActive={hoveredFinding === ll.finding.id}
                          onHover={setHoveredFinding}
                          onLeave={() => setHoveredFinding(null)}
                          findingId={ll.finding.id}
                        />
                      ))}

                      {/* Inter-finding connection lines on the image */}
                      {analysis.connections.map((conn, ci) => {
                        const from = analysis.findings.find((f) => f.id === conn.from);
                        const to = analysis.findings.find((f) => f.id === conn.to);
                        if (!from || !to) return null;
                        const x1 = from.position.x * imgDimensions.width;
                        const y1 = from.position.y * imgDimensions.height;
                        const x2 = to.position.x * imgDimensions.width;
                        const y2 = to.position.y * imgDimensions.height;
                        const mx = (x1 + x2) / 2;
                        const my = (y1 + y2) / 2;
                        return (
                          <motion.g
                            key={`conn-${ci}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 2 + ci * 0.15 }}
                          >
                            <line
                              x1={x1} y1={y1} x2={x2} y2={y2}
                              stroke="#ff2244"
                              strokeWidth="1"
                              strokeDasharray="4 3"
                              opacity="0.3"
                            />
                            <rect
                              x={mx - conn.label.length * 2.8 - 6}
                              y={my - 8}
                              width={conn.label.length * 5.6 + 12}
                              height={16}
                              rx="4"
                              fill="rgba(10,14,26,0.85)"
                              stroke="rgba(255,34,68,0.2)"
                              strokeWidth="0.5"
                            />
                            <text
                              x={mx} y={my + 4}
                              textAnchor="middle"
                              fill="#ff8899"
                              fontSize="8"
                              fontFamily="Inter, system-ui, sans-serif"
                              fontWeight="500"
                            >
                              {conn.label}
                            </text>
                          </motion.g>
                        );
                      })}
                    </svg>
                  )}
                </div>

                {/* Stats bar at bottom */}
                {analysis && (
                  <motion.div
                    className="scene-stats-bar"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.5 }}
                  >
                    <div className="scene-stat">
                      <span className="scene-stat-num" style={{ color: '#ff4466' }}>
                        {analysis.findings.length}
                      </span>
                      <span className="scene-stat-label">Findings</span>
                    </div>
                    <div className="scene-stat-divider" />
                    <div className="scene-stat">
                      <span className="scene-stat-num" style={{ color: '#ffaa22' }}>
                        {analysis.connections.length}
                      </span>
                      <span className="scene-stat-label">Connections</span>
                    </div>
                    <div className="scene-stat-divider" />
                    <div className="scene-stat">
                      <span className="scene-stat-num" style={{ color: '#44aaff' }}>
                        {analysis.findings.filter((f) => f.severity === 'high').length}
                      </span>
                      <span className="scene-stat-label">High Severity</span>
                    </div>
                    <div className="scene-stat-divider" />
                    <div className="scene-stat">
                      <span className="scene-stat-num" style={{ color: '#44ff88' }}>
                        {analysis.hover_words.length}
                      </span>
                      <span className="scene-stat-label">Keywords</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
