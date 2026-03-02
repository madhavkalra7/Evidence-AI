'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image as ImageIcon,
  FileText,
  Folder,
  Clock,
  Hash,
  Eye,
  Trash2,
  X,
  ChevronLeft,
  Search,
  LayoutGrid,
  List,
} from 'lucide-react';

/* ============================================================
   REPORTS GALLERY — Album-style evidence showcase
   
   Shows saved images & PDFs as a beautiful gallery on the
   home screen. Clicking an image opens the Scene Analysis Modal.
   Clicking a PDF opens a detail panel with info.
   ============================================================ */

export interface SavedReport {
  id: string;
  fileName: string;
  fileType: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  chunks: number;
  caseId: string | null;
  analysis: any | null;
  createdAt: string;
}

interface ReportsGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenScene: (report: SavedReport) => void;
  theme: 'light' | 'dark';
  localReports?: SavedReport[];
}

export default function ReportsGallery({ isOpen, onClose, onOpenScene, theme, localReports = [] }: ReportsGalleryProps) {
  const [dbReports, setDbReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'scene_image' | 'evidence_image' | 'pdf'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<SavedReport | null>(null);

  // ── Fetch reports from DB, merge with in-memory local reports ──
  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setDbReports(data);
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchReports();
  }, [isOpen, fetchReports]);

  // Merge DB + local reports, dedup by fileName
  const reports = useMemo(() => {
    const map = new Map<string, SavedReport>();
    for (const r of localReports) map.set(r.fileName, r);
    for (const r of dbReports) map.set(r.fileName, r); // DB wins on conflict
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [dbReports, localReports]);

  // ── Delete report ──
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/reports?id=${id}`, { method: 'DELETE' });
      setDbReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  };

  // ── Filtered reports ──
  const filtered = useMemo(() => {
    let items = reports;
    if (filter !== 'all') items = items.filter((r) => r.fileType === filter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (r) =>
          r.fileName.toLowerCase().includes(q) ||
          (r.caption && r.caption.toLowerCase().includes(q)) ||
          (r.caseId && r.caseId.toLowerCase().includes(q))
      );
    }
    return items;
  }, [reports, filter, searchQuery]);

  // ── Stats ──
  const stats = useMemo(() => ({
    total: reports.length,
    images: reports.filter((r) => r.fileType !== 'pdf').length,
    pdfs: reports.filter((r) => r.fileType === 'pdf').length,
    analyzed: reports.filter((r) => r.analysis).length,
  }), [reports]);

  // ── Group by case ──
  const groupedByCase = useMemo(() => {
    const groups: Record<string, SavedReport[]> = {};
    filtered.forEach((r) => {
      const key = r.caseId || 'Uncategorized';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [filtered]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(30px)' }}
        >
          {/* ── HEADER ── */}
          <div className="reports-gallery-header">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="reports-back-btn"
              >
                <ChevronLeft size={18} />
              </button>
              <div>
                <h2 className="reports-gallery-title">My Reports</h2>
                <p className="reports-gallery-subtitle">
                  {stats.total} items · {stats.images} images · {stats.pdfs} documents · {stats.analyzed} analyzed
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="reports-search-box">
                <Search size={14} className="text-white/30" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search reports..."
                  className="reports-search-input"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-white/30 hover:text-white/60">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filter pills */}
              <div className="reports-filter-pills">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'scene_image', label: 'Scenes' },
                  { key: 'evidence_image', label: 'Evidence' },
                  { key: 'pdf', label: 'PDFs' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`reports-filter-pill ${filter === key ? 'active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* View toggle */}
              <div className="reports-view-toggle">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`reports-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`reports-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                >
                  <List size={14} />
                </button>
              </div>

              {/* Close */}
              <button onClick={onClose} className="reports-close-btn">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ── CONTENT ── */}
          <div className="flex-1 overflow-y-auto reports-gallery-scroll">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="reports-loader" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="w-20 h-20 rounded-3xl bg-white/[0.04] flex items-center justify-center">
                  <Folder size={32} className="text-white/15" />
                </div>
                <p className="text-white/25 text-sm">
                  {reports.length === 0 ? 'No reports yet. Upload evidence to get started.' : 'No items match your filter.'}
                </p>
              </div>
            ) : (
              <div className="px-4 sm:px-8 py-4 sm:py-6">
                {Object.entries(groupedByCase).map(([caseId, items]) => (
                  <div key={caseId} className="mb-8">
                    {/* Case header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="reports-case-dot" />
                      <h3 className="text-white/60 text-sm font-semibold tracking-wide uppercase">
                        {caseId === 'Uncategorized' ? 'Uncategorized' : caseId}
                      </h3>
                      <span className="text-white/20 text-xs">({items.length})</span>
                      <div className="flex-1 h-px bg-white/[0.06]" />
                    </div>

                    {/* Grid / List */}
                    {viewMode === 'grid' ? (
                      <div className="reports-grid">
                        {items.map((report, idx) => (
                          <motion.div
                            key={report.id}
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: idx * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                            className="reports-card"
                            onMouseEnter={() => setHoveredId(report.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={() => report.fileType === 'pdf' ? setSelectedPdf(report) : onOpenScene(report)}
                          >
                            {/* Image / Preview */}
                            <div className="reports-card-image">
                              {report.imageUrl ? (
                                <img
                                  src={report.imageUrl}
                                  alt={report.fileName}
                                  className="reports-card-img"
                                />
                              ) : (
                                <div className="reports-card-placeholder">
                                  {report.fileType === 'pdf' ? (
                                    <FileText size={32} className="text-white/15" />
                                  ) : (
                                    <ImageIcon size={32} className="text-white/15" />
                                  )}
                                </div>
                              )}

                              {/* Hover overlay */}
                              <AnimatePresence>
                                {hoveredId === report.id && (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="reports-card-overlay"
                                  >
                                    <Eye size={24} className="text-white/80" />
                                    <span className="text-white/70 text-xs font-medium mt-1">
                                      {report.fileType === 'pdf' ? 'View Details' : 'Open Scene'}
                                    </span>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* Type badge */}
                              <div className="reports-type-badge">
                                {report.fileType === 'pdf' ? 'PDF' : report.fileType === 'scene_image' ? 'SCENE' : 'EVIDENCE'}
                              </div>

                              {/* Analysis indicator */}
                              {report.analysis && (
                                <div className="reports-analyzed-badge">
                                  <span className="reports-analyzed-dot" />
                                  Analyzed
                                </div>
                              )}

                              {/* Delete button */}
                              <button
                                className="reports-delete-btn"
                                onClick={(e) => handleDelete(report.id, e)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>

                            {/* Info */}
                            <div className="reports-card-info">
                              <p className="reports-card-name">{report.fileName}</p>
                              {report.caption && (
                                <p className="reports-card-caption">
                                  {report.caption.slice(0, 80)}...
                                </p>
                              )}
                              <div className="reports-card-meta">
                                <span className="reports-card-meta-item">
                                  <Clock size={10} />
                                  {new Date(report.createdAt).toLocaleDateString()}
                                </span>
                                <span className="reports-card-meta-item">
                                  <Hash size={10} />
                                  {report.chunks} chunks
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      /* List view */
                      <div className="reports-list">
                        {items.map((report, idx) => (
                          <motion.div
                            key={report.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className="reports-list-item"
                            onClick={() => report.fileType === 'pdf' ? setSelectedPdf(report) : onOpenScene(report)}
                          >
                            {/* Thumbnail */}
                            <div className="reports-list-thumb">
                              {report.imageUrl ? (
                                <img src={report.imageUrl} alt={report.fileName} className="reports-list-img" />
                              ) : (
                                <div className="reports-list-placeholder">
                                  <FileText size={18} className="text-white/20" />
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-white/70 text-sm font-medium truncate">{report.fileName}</p>
                              {report.caption && (
                                <p className="text-white/30 text-xs truncate mt-0.5">{report.caption.slice(0, 100)}</p>
                              )}
                            </div>

                            {/* Badges */}
                            <div className="flex items-center gap-3">
                              <span className="reports-type-badge-sm">
                                {report.fileType === 'pdf' ? 'PDF' : report.fileType === 'scene_image' ? 'SCENE' : 'EVIDENCE'}
                              </span>
                              {report.analysis && (
                                <span className="reports-analyzed-badge-sm">
                                  <span className="reports-analyzed-dot" /> Analyzed
                                </span>
                              )}
                              <span className="text-white/20 text-[10px]">
                                {new Date(report.createdAt).toLocaleDateString()}
                              </span>
                              <button
                                className="reports-list-delete"
                                onClick={(e) => handleDelete(report.id, e)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── DETAIL PANEL (PDF text / Image scene) ── */}
          <AnimatePresence>
            {selectedPdf && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)' }}
                onClick={() => setSelectedPdf(null)}
              >
                <motion.div
                  initial={{ scale: 0.9, y: 30 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 30 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: 'linear-gradient(135deg, #141420 0%, #0d0d15 100%)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '20px',
                    width: '90%',
                    maxWidth: '620px',
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column' as const,
                    position: 'relative' as const,
                  }}
                >
                  {/* Header */}
                  <div style={{ padding: '24px 32px 16px', flexShrink: 0 }}>
                    {/* Close */}
                    <button
                      onClick={() => setSelectedPdf(null)}
                      style={{
                        position: 'absolute', top: '16px', right: '16px',
                        background: 'rgba(255,255,255,0.06)', border: 'none',
                        borderRadius: '10px', width: '32px', height: '32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
                      }}
                    >
                      <X size={16} />
                    </button>

                    {/* Icon */}
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '14px',
                      background: 'rgba(255,68,102,0.1)', border: '1px solid rgba(255,68,102,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 14px',
                    }}>
                      <FileText size={26} style={{ color: '#ff4466' }} />
                    </div>

                    {/* Title */}
                    <h3 style={{
                      color: 'rgba(255,255,255,0.85)', fontSize: '15px', fontWeight: 600,
                      textAlign: 'center', marginBottom: '4px', wordBreak: 'break-all',
                    }}>
                      {selectedPdf.fileName}
                    </h3>
                    <p style={{
                      color: 'rgba(255,255,255,0.3)', fontSize: '11px',
                      textAlign: 'center', letterSpacing: '1.5px', textTransform: 'uppercase',
                      marginBottom: '12px',
                    }}>
                      PDF Document
                    </p>

                    {/* Meta row */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' as const }}>
                      {[
                        { label: 'Chunks', value: `${selectedPdf.chunks}` },
                        { label: 'Uploaded', value: new Date(selectedPdf.createdAt).toLocaleDateString() },
                        { label: 'Case', value: selectedPdf.caseId || 'N/A' },
                        { label: 'Status', value: selectedPdf.analysis ? 'Analyzed' : 'Indexed' },
                      ].map(({ label, value }) => (
                        <div key={label} style={{
                          padding: '6px 12px', borderRadius: '8px',
                          background: 'rgba(255,255,255,0.03)',
                          display: 'flex', gap: '6px', alignItems: 'center',
                        }}>
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', textTransform: 'uppercase' }}>{label}</span>
                          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 500 }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scrollable content area */}
                  <div style={{
                    flex: 1, overflow: 'auto', padding: '0 32px 24px',
                    minHeight: 0,
                  }}>
                    {/* Extracted text / Analysis */}
                    {(selectedPdf.analysis || selectedPdf.caption) && (
                      <div style={{
                        padding: '16px', borderRadius: '12px',
                        background: 'rgba(255,68,102,0.04)',
                        border: '1px solid rgba(255,68,102,0.08)',
                      }}>
                        <p style={{
                          color: 'rgba(255,255,255,0.35)', fontSize: '10px', marginBottom: '10px',
                          textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600,
                        }}>
                          {selectedPdf.analysis ? 'Extracted Text' : 'Summary'}
                        </p>
                        <p style={{
                          color: 'rgba(255,255,255,0.6)', fontSize: '12px', lineHeight: 1.7,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          {typeof selectedPdf.analysis === 'string'
                            ? selectedPdf.analysis
                            : selectedPdf.caption || ''}
                        </p>
                      </div>
                    )}

                    {/* Tip */}
                    <p style={{
                      marginTop: '16px', textAlign: 'center',
                      color: 'rgba(255,255,255,0.2)', fontSize: '11px',
                    }}>
                      Ask questions about this document in the chat
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
