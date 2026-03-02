'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Fingerprint,
  Pencil,
  Check,
} from 'lucide-react';

/* ============================================================
   SIDEBAR — ChatGPT-style sidebar with chat history
   ============================================================ */

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  messageCount: number;
}

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession?: (id: string, newTitle: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onGoHome?: () => void;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  isOpen,
  onToggle,
  onGoHome,
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  return (
    <>
      {/* Toggle button when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed top-4 left-4 z-50 w-9 h-9 rounded-xl sidebar-glass
            flex items-center justify-center text-white/40 hover:text-white/70
            transition-all duration-300 hover:scale-105"
        >
          <PanelLeft size={18} />
        </button>
      )}

      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop — click outside to close */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="sidebar-backdrop"
              onClick={onToggle}
            />
            <motion.aside
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 z-40 w-[270px] max-w-[85vw] flex flex-col sidebar-glass"
            >
            {/* Logo + Close */}
            <div className="flex items-center justify-between p-4 pb-3">
              <div 
                className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={onGoHome}
                title="Back to Home Screen"
              >
                <div className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center">
                  <Fingerprint size={16} className="text-white/50" />
                </div>
                <div>
                  <h1 className="text-[15px] font-bold tracking-tight text-white/90">
                    Evidence<span className="text-white/40">.AI</span>
                  </h1>
                </div>
              </div>
              <button
                onClick={onToggle}
                className="w-8 h-8 rounded-xl flex items-center justify-center
                  text-white/30 hover:text-white/60 hover:bg-white/[0.06]
                  transition-all duration-200"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>

            {/* New Chat Button */}
            <div className="px-3 pb-3">
              <button
                onClick={onNewChat}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl
                  sidebar-btn-new text-[13px] font-medium text-white/70
                  hover:text-white transition-all duration-300"
              >
                <Plus size={16} className="text-white/40" />
                New Analysis
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/[0.06] mx-3" />

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 sidebar-scroll">
              {sessions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquare size={20} className="text-white/10 mb-2" />
                  <p className="text-[11px] text-white/20">No conversations yet</p>
                </div>
              )}

              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const isHovered = session.id === hoveredId;
                const isEditing = session.id === editingId;

                return (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onMouseEnter={() => setHoveredId(session.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => { if (!isEditing) onSelectSession(session.id); }}
                    className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer
                      transition-all duration-200
                      ${isActive
                        ? 'bg-white/[0.08] text-white/90'
                        : 'text-white/45 hover:bg-white/[0.04] hover:text-white/70'
                      }`}
                  >
                    <MessageSquare size={14} className="flex-shrink-0 opacity-50" />
                    
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const trimmed = editTitle.trim();
                            if (trimmed && onRenameSession) onRenameSession(session.id, trimmed);
                            setEditingId(null);
                          }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => {
                          const trimmed = editTitle.trim();
                          if (trimmed && onRenameSession) onRenameSession(session.id, trimmed);
                          setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-white/10 text-white/90 text-[13px] px-1.5 py-0.5 rounded-md
                          outline-none border border-white/20 focus:border-white/40"
                      />
                    ) : (
                      <span className="flex-1 text-[13px] truncate">{session.title}</span>
                    )}
                    
                    {/* Action buttons */}
                    {(isHovered || isActive) && !isEditing && (
                      <div className="flex items-center gap-0.5">
                        {/* Rename button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(session.id);
                            setEditTitle(session.title);
                          }}
                          className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center
                            text-white/20 hover:text-blue-400 hover:bg-blue-500/10
                            transition-all duration-200"
                        >
                          <Pencil size={11} />
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                          className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center
                            text-white/20 hover:text-red-400 hover:bg-red-500/10
                            transition-all duration-200"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}

                    {isEditing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const trimmed = editTitle.trim();
                          if (trimmed && onRenameSession) onRenameSession(session.id, trimmed);
                          setEditingId(null);
                        }}
                        className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center
                          text-emerald-400 hover:bg-emerald-500/10
                          transition-all duration-200"
                      >
                        <Check size={13} />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Bottom info */}
            <div className="p-3 border-t border-white/[0.05]">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="flex gap-1">
                  {['HuggingFace', 'FAISS', 'Groq'].map((name) => (
                    <div
                      key={name}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md
                        bg-white/[0.03] text-[9px] text-white/25 font-medium"
                    >
                      <div className="w-1 h-1 rounded-full bg-emerald-500/60" />
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
