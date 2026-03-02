'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  Image,
  AlertTriangle,
  Clock,
  Database,
  Eye,
  Layers,
  Fingerprint,
} from 'lucide-react';
import type { EvidenceItem } from './EvidenceBoard3D';

/* ============================================================
   DETAIL PANEL — Evidence Item Inspector
   ============================================================
   Glass morphism overlay that opens when clicking an evidence
   item on the 3D board. Shows full details with forensic styling.
   ============================================================ */

interface DetailPanelProps {
  item: EvidenceItem | null;
  onClose: () => void;
  theme: 'light' | 'dark';
}

export default function DetailPanel({ item, onClose, theme }: DetailPanelProps) {
  if (!item) return null;

  const typeConfig = {
    pdf: {
      icon: FileText,
      label: 'Incident Report',
      color: '#4488ff',
      bgGlow: 'rgba(68, 136, 255, 0.08)',
      borderGlow: 'rgba(68, 136, 255, 0.15)',
    },
    scene_image: {
      icon: Image,
      label: 'Crime Scene Photo',
      color: '#ff4466',
      bgGlow: 'rgba(255, 68, 102, 0.08)',
      borderGlow: 'rgba(255, 68, 102, 0.15)',
    },
    evidence_image: {
      icon: Image,
      label: 'Evidence Photo',
      color: '#44ff88',
      bgGlow: 'rgba(68, 255, 136, 0.08)',
      borderGlow: 'rgba(68, 255, 136, 0.15)',
    },
  };

  const config = typeConfig[item.type];
  const Icon = config.icon;

  return (
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="detail-panel-backdrop"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="detail-panel"
          >
            {/* Glow border top */}
            <div
              className="detail-panel-glow-top"
              style={{ background: `linear-gradient(90deg, transparent, ${config.color}40, transparent)` }}
            />

            {/* Header */}
            <div className="detail-panel-header">
              <div className="detail-panel-header-left">
                <div
                  className="detail-panel-icon"
                  style={{ background: config.bgGlow, border: `1px solid ${config.borderGlow}` }}
                >
                  <Icon size={18} style={{ color: config.color }} />
                </div>
                <div>
                  <p className="detail-panel-type" style={{ color: config.color }}>
                    {config.label}
                  </p>
                  <p className="detail-panel-filename">{item.name}</p>
                </div>
              </div>
              <button onClick={onClose} className="detail-panel-close">
                <X size={16} />
              </button>
            </div>

            {/* Divider */}
            <div className="detail-panel-divider" />

            {/* Stats Grid */}
            <div className="detail-panel-stats">
              <div className="detail-panel-stat">
                <Database size={13} className="detail-panel-stat-icon" />
                <div>
                  <p className="detail-panel-stat-value">{item.chunks}</p>
                  <p className="detail-panel-stat-label">Chunks</p>
                </div>
              </div>

              <div className="detail-panel-stat">
                <Layers size={13} className="detail-panel-stat-icon" />
                <div>
                  <p className="detail-panel-stat-value">{item.pages || '—'}</p>
                  <p className="detail-panel-stat-label">Pages</p>
                </div>
              </div>

              <div className="detail-panel-stat">
                <Eye size={13} className="detail-panel-stat-icon" />
                <div>
                  <p className="detail-panel-stat-value">Indexed</p>
                  <p className="detail-panel-stat-label">Status</p>
                </div>
              </div>

              <div className="detail-panel-stat">
                <Fingerprint size={13} className="detail-panel-stat-icon" />
                <div>
                  <p className="detail-panel-stat-value">
                    {item.id.slice(-6)}
                  </p>
                  <p className="detail-panel-stat-label">Evidence ID</p>
                </div>
              </div>
            </div>

            {/* AI Analysis */}
            {item.caption && (
              <>
                <div className="detail-panel-divider" />
                <div className="detail-panel-section">
                  <div className="detail-panel-section-header">
                    <AlertTriangle size={12} style={{ color: config.color }} />
                    <span>AI Analysis</span>
                  </div>
                  <p className="detail-panel-analysis-text">
                    &ldquo;{item.caption}&rdquo;
                  </p>
                </div>
              </>
            )}

            {/* Quick Actions */}
            <div className="detail-panel-divider" />
            <div className="detail-panel-actions">
              <button className="detail-panel-action-btn" style={{ borderColor: config.borderGlow }}>
                <Eye size={13} />
                <span>View in Chat</span>
              </button>
              <button className="detail-panel-action-btn" style={{ borderColor: config.borderGlow }}>
                <Clock size={13} />
                <span>Timeline</span>
              </button>
            </div>

            {/* Footer */}
            <div className="detail-panel-footer">
              <p>Evidence.AI Forensic Analysis Platform</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
