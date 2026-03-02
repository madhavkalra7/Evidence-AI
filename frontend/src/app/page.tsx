'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, Send, Bot, User, Loader2, Sparkles, ChevronDown, FileText, Image, Fingerprint, X, CheckCircle2, LayoutGrid, Eye, FolderOpen, ArrowLeft, Zap } from 'lucide-react';
import ReportsGallery, { type SavedReport } from '@/components/ReportsGallery';
import ReactMarkdown from 'react-markdown';
import { useDropzone } from 'react-dropzone';
import Sidebar, { type ChatSession } from '@/components/Sidebar';
import IntroVideo from '@/components/IntroVideo';
import ThemeToggle from '@/components/ThemeToggle';
import DetailPanel from '@/components/DetailPanel';
import DetectiveBoard from '@/components/DetectiveBoard';
import { getStatus, resetStore, sendMessage, sendHypothesisChat, uploadPDF, uploadImage, analyzeScene, type ChatResponse, type UploadResponse, type SceneAnalysis } from '@/lib/api';
import type { EvidenceItem } from '@/components/EvidenceBoard3D';

const UnicornBackground = dynamic(() => import('@/components/UnicornBackground'), {
  ssr: false,
});

const EvidenceBoard3D = dynamic(() => import('@/components/EvidenceBoard3D'), {
  ssr: false,
});

const SceneAnalysisModal = dynamic(() => import('@/components/SceneAnalysisModal'), {
  ssr: false,
});



/* ============================================================
   PAGE — Evidence.AI
   FullScreen Unicorn BG + ChatGPT-style sidebar + centered chat
   ============================================================ */

interface UploadedFile {
  id: string;
  name: string;
  type: 'pdf' | 'scene_image' | 'evidence_image';
  chunks: number;
  status: 'uploading' | 'done' | 'error';
  imageUrl?: string;
  caption?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  contextChunks?: { text: string; type: string; page: number; score: number }[];
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  isHypothesisMode?: boolean;
}

export default function Home() {
  const [showIntro, setShowIntro] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [totalChunks, setTotalChunks] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showContext, setShowContext] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<'pdf' | 'scene_image' | 'evidence_image'>('pdf');
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showEvidenceBoard, setShowEvidenceBoard] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);
  const [showReportsGallery, setShowReportsGallery] = useState(false);
  const [showBlast, setShowBlast] = useState(false);

  // Scene Analysis Modal state
  const [sceneModalOpen, setSceneModalOpen] = useState(false);
  const [sceneModalFile, setSceneModalFile] = useState<{ imageUrl: string; fileName: string; imageType: 'scene_image' | 'evidence_image' } | null>(null);
  const [sceneAnalyses, setSceneAnalyses] = useState<Record<string, SceneAnalysis | null>>({});
  const [analyzingFiles, setAnalyzingFiles] = useState<Record<string, boolean>>({});

  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const messages = activeChat?.messages || [];
  const isHome = !activeChatId;
  const isChatEmpty = messages.length === 0;
  const isHypothesisChat = activeChat?.isHypothesisMode || false;

  // Derive evidence items for the 3D board from uploaded files
  const evidenceItems: EvidenceItem[] = uploadedFiles
    .filter((f) => f.status === 'done')
    .map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      chunks: f.chunks,
      caption: f.caption,
    }));

  const handleSelectEvidence = useCallback((item: EvidenceItem) => {
    setSelectedEvidence(item);
  }, []);

  // Theme: persist + set data-theme on <html>
  useEffect(() => {
    const saved = localStorage.getItem('evidenceai-theme') as 'light' | 'dark' | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('evidenceai-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  // ── Browser back/forward navigation support ──
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.view === 'chat') {
        setActiveChatId(e.state.chatId || null);
      } else {
        setActiveChatId(null);
        setSidebarOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    // Replace initial state
    if (!window.history.state) {
      window.history.replaceState({ view: 'home' }, '', '/');
    }
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Push history when entering a chat
  const prevChatId = useRef<string | null>(null);
  useEffect(() => {
    if (activeChatId && activeChatId !== prevChatId.current) {
      window.history.pushState({ view: 'chat', chatId: activeChatId }, '', `/?chat=${activeChatId}`);
    } else if (!activeChatId && prevChatId.current) {
      // Going back to home — only push if not already on home state
      if (window.history.state?.view !== 'home') {
        window.history.pushState({ view: 'home' }, '', '/');
      }
    }
    prevChatId.current = activeChatId;
  }, [activeChatId]);

  // Fetch backend status
  const fetchStatus = useCallback(async () => {
    try {
      const s = await getStatus();
      setTotalChunks(s.vector_store.total_chunks);
    } catch { }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // ── Load saved chats from DB on mount ──
  const chatsLoadedFromDB = useRef(false);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/chats');
        if (res.ok) {
          const saved = await res.json();
          if (saved.length > 0) {
            setChats(saved.map((c: any) => ({
              id: c.id,
              title: c.title,
              messages: c.messages || [],
              isHypothesisMode: c.isHypothesisMode || false,
              createdAt: new Date(c.createdAt),
            })));
          }
        }
      } catch (e) {
        console.log('[DB] Could not load saved chats:', e);
      } finally {
        // Mark loaded so auto-save won't fire on the initial DB load
        setTimeout(() => { chatsLoadedFromDB.current = true; }, 3000);
      }
    })();
  }, []);

  // ── Auto-save chats to DB (debounced) ──
  const saveChatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (chats.length === 0) return;
    if (!chatsLoadedFromDB.current) return; // Skip save during initial load
    if (saveChatTimeoutRef.current) clearTimeout(saveChatTimeoutRef.current);
    saveChatTimeoutRef.current = setTimeout(async () => {
      for (const chat of chats) {
        try {
          await fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: chat.id,
              title: chat.title,
              messages: chat.messages,
              isHypothesisMode: chat.isHypothesisMode || false,
            }),
          });
        } catch (e) {
          console.error('[DB] Failed to save chat:', e);
        }
      }
    }, 2000);
    return () => { if (saveChatTimeoutRef.current) clearTimeout(saveChatTimeoutRef.current); };
  }, [chats]);

  // ── Save report to DB helper ──
  const saveReportToDB = useCallback(async (
    fileName: string,
    fileType: string,
    imageUrl: string | undefined,
    caption: string | undefined,
    chunks: number,
    caseId: string | undefined,
    analysis?: any
  ) => {
    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, fileType, imageUrl, caption, chunks, caseId, analysis }),
      });
    } catch (e) {
      console.log('[DB] Could not save report:', e);
    }
  }, []);

  // ── Chat management ──
  const createChat = (): Chat => {
    const chat: Chat = {
      id: Date.now().toString(),
      title: 'New Analysis',
      messages: [],
      createdAt: new Date(),
    };
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    return chat;
  };

  const handleNewChat = () => {
    // Clear previous uploads and analyses when starting a new chat
    setUploadedFiles([]);
    setSceneAnalyses({});
    setAnalyzingFiles({});
    createChat();
  };

  // ── AI Hypothesis Generator Mode ──
  const handleHypothesisMode = () => {
    setShowBlast(true);
    setTimeout(() => {
      setUploadedFiles([]);
      setSceneAnalyses({});
      setAnalyzingFiles({});
      const chat: Chat = {
        id: Date.now().toString(),
        title: '🕵️ AI Hypothesis Generator',
        messages: [],
        createdAt: new Date(),
        isHypothesisMode: true,
      };
      setChats((prev) => [chat, ...prev]);
      setActiveChatId(chat.id);
      setTimeout(() => setShowBlast(false), 600);
    }, 800);
  };

  const handleSelectSession = (id: string) => { setActiveChatId(id); };

  const handleDeleteSession = (id: string) => {
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
    // Delete from DB
    fetch(`/api/chats?id=${id}`, { method: 'DELETE' }).catch(() => {});
  };

  // ── Send message ──
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    let chat = activeChat;
    if (!chat) chat = createChat();

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    const isHypothesis = chat.isHypothesisMode || false;

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chat!.id) return c;
        const updated = { ...c, messages: [...c.messages, userMsg] };
        if (c.messages.length === 0) {
          updated.title = isHypothesis
            ? '🕵️ ' + input.trim().slice(0, 35)
            : input.trim().slice(0, 40);
        }
        return updated;
      })
    );
    setInput('');
    setIsLoading(true);

    try {
      let res: ChatResponse;
      if (isHypothesis) {
        // Build history from existing messages for context
        const history = [...(chat.messages || []), userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Collect ALL available evidence context for grounding
        const evidenceParts: string[] = [];

        // 1. Uploaded file captions
        uploadedFiles.filter((f) => f.status === 'done' && f.caption).forEach((f) => {
          evidenceParts.push(`[Uploaded Evidence: ${f.name} (${f.type})]\n${f.caption}`);
        });

        // 2. Scene analyses (detailed findings from image analysis)
        Object.entries(sceneAnalyses).forEach(([fileName, analysis]) => {
          if (!analysis) return;
          let sceneText = `[Scene Analysis: ${fileName}]\nSummary: ${analysis.summary}\n`;
          if (analysis.findings?.length) {
            sceneText += 'Findings:\n';
            analysis.findings.forEach((f) => {
              sceneText += `- ${f.label} (${f.category}, severity: ${f.severity}): ${f.description}\n`;
            });
          }
          if (analysis.connections?.length) {
            sceneText += 'Connections:\n';
            analysis.connections.forEach((c) => {
              sceneText += `- ${c.label}\n`;
            });
          }
          evidenceParts.push(sceneText);
        });

        // 3. Evidence-related assistant messages from ALL chats (upload confirmations, analysis results)
        chats.forEach((c) => {
          c.messages.forEach((m) => {
            if (m.role === 'assistant' && (m.content.includes('Evidence Uploaded') || m.content.includes('chunks indexed'))) {
              evidenceParts.push(`[Evidence Upload Record]\n${m.content.slice(0, 500)}`);
            }
          });
        });

        const evidenceContext = evidenceParts.length > 0
          ? evidenceParts.join('\n\n---\n\n')
          : '';

        res = await sendHypothesisChat(userMsg.content, history.slice(0, -1), evidenceContext);
      } else {
        res = await sendMessage(userMsg.content);
      }
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.answer,
        sources: res.sources,
        contextChunks: res.context_chunks,
      };
      setChats((prev) => prev.map((c) => c.id === chat!.id ? { ...c, messages: [...c.messages, aiMsg] } : c));
    } catch (err: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err?.response?.data?.detail || 'Failed to get response. Try again.',
      };
      setChats((prev) => prev.map((c) => c.id === chat!.id ? { ...c, messages: [...c.messages, errMsg] } : c));
    }
    setIsLoading(false);
  };

  const removeUploadedFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // ── Open Scene Modal handler ──
  const handleOpenScene = useCallback((fileName: string, imageType: 'scene_image' | 'evidence_image') => {
    const file = uploadedFiles.find((f) => f.name === fileName && f.imageUrl);
    if (file && file.imageUrl) {
      setSceneModalFile({ imageUrl: file.imageUrl, fileName, imageType });
      setSceneModalOpen(true);

      // If analysis not yet done, trigger it now on-demand
      if (!sceneAnalyses[fileName] && !analyzingFiles[fileName]) {
        const caption = file.caption || `Forensic ${imageType === 'scene_image' ? 'crime scene' : 'evidence'} image: ${fileName}`;
        console.log('[Scene] Triggering on-demand analysis for:', fileName);
        setAnalyzingFiles((prev) => ({ ...prev, [fileName]: true }));
        analyzeScene(caption, fileName, imageType)
          .then((result) => {
            console.log('[Scene] Analysis received:', result.analysis.findings.length, 'findings');
            setSceneAnalyses((prev) => ({ ...prev, [fileName]: result.analysis }));
          })
          .catch((err) => {
            console.error('[Scene] Analysis failed:', err);
          })
          .finally(() => {
            setAnalyzingFiles((prev) => ({ ...prev, [fileName]: false }));
          });
      }
    }
  }, [uploadedFiles, sceneAnalyses, analyzingFiles]);

  // ── File upload ──
  const onDrop = useCallback(async (files: File[]) => {
    setIsUploading(true);
    setShowUploadMenu(false);
    for (const file of files) {
      const fileId = Date.now().toString() + file.name;
      const fileType = file.type === 'application/pdf' ? 'pdf' as const : uploadType;
      // Create a local object URL for image thumbnail/preview
      const imageUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setUploadedFiles((prev) => [...prev, { id: fileId, name: file.name, type: fileType, chunks: 0, status: 'uploading', imageUrl }]);
      try {
        let res: UploadResponse;
        if (file.type === 'application/pdf') {
          res = await uploadPDF(file);
        } else {
          res = await uploadImage(file, uploadType);
        }
        setUploadedFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, chunks: res.chunks_created, status: 'done' as const, caption: res.caption } : f));
        fetchStatus();

        // Auto-inject upload confirmation into active chat
        const isImage = file.type.startsWith('image/');
        const uploadMsg: Message = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: !isImage
            ? `📄 **Evidence Uploaded:** \`${file.name}\`\n\n- **Pages Extracted:** ${res.pages_extracted || 'N/A'}\n- **Chunks Created:** ${res.chunks_created}\n\n_You can now ask questions about this document._`
            : `🖼️ **Evidence Uploaded:** \`${file.name}\`\n\n**${res.image_type === 'scene_image' ? 'Crime Scene Photo' : 'Evidence Photo'}** — ${res.chunks_created} chunks indexed\n\n${res.caption ? `> ${res.caption.slice(0, 150).trim()}…` : ''}\n\n_Click **Open Scene** to view full forensic analysis._`,
        };

        setChats((prev) => {
          const currentId = activeChatId;
          if (currentId) {
            return prev.map((c) => c.id === currentId ? { ...c, messages: [...c.messages, uploadMsg] } : c);
          }
          const newChat: Chat = {
            id: Date.now().toString(),
            title: `Evidence: ${file.name.slice(0, 30)}`,
            messages: [uploadMsg],
            createdAt: new Date(),
          };
          setActiveChatId(newChat.id);
          return [newChat, ...prev];
        });

        // Auto-trigger scene analysis for images (fire-and-forget)
        if (isImage) {
          const imgType = (res.image_type || uploadType) as 'scene_image' | 'evidence_image';
          const caption = res.caption || `Forensic ${imgType === 'scene_image' ? 'crime scene' : 'evidence'} image: ${res.filename}`;
          console.log('[Scene] Auto-triggering analysis for:', res.filename, 'caption length:', caption.length);
          setAnalyzingFiles((prev) => ({ ...prev, [file.name]: true }));

          // Convert image to base64 for DB persistence (blob URLs are ephemeral)
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Url = reader.result as string;
            saveReportToDB(file.name, imgType, base64Url, res.caption, res.chunks_created, (res as any).case_id);
          };
          reader.readAsDataURL(file);

          analyzeScene(caption, file.name, imgType)
            .then((result) => {
              console.log('[Scene] Auto-analysis complete:', result.analysis.findings.length, 'findings');
              setSceneAnalyses((prev) => ({ ...prev, [file.name]: result.analysis }));
              // Save analysis to DB
              saveReportToDB(file.name, imgType, undefined, res.caption, res.chunks_created, (res as any).case_id, result.analysis);
            })
            .catch((err) => {
              console.error('[Scene] Auto-analysis failed:', err);
            })
            .finally(() => {
              setAnalyzingFiles((prev) => ({ ...prev, [file.name]: false }));
            });
        } else {
          // Save PDF report to DB
          saveReportToDB(file.name, 'pdf', undefined, undefined, res.chunks_created, (res as any).case_id);
        }
      } catch {
        setUploadedFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, status: 'error' as const } : f));
      }
    }
    setIsUploading(false);
  }, [uploadType, fetchStatus, activeChatId, saveReportToDB]);

  const { getRootProps, getInputProps, open: openFilePicker } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: 50 * 1024 * 1024,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Session list for sidebar
  const sessions: ChatSession[] = chats.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    messageCount: c.messages.length,
  }));

  return (
    <>
      {/* Intro Video Overlay */}
      {showIntro && <IntroVideo onComplete={() => setShowIntro(false)} />}

      <main className="relative h-screen overflow-hidden" {...getRootProps()}>
        <input {...getInputProps()} />

        {/* ── HOME STATE — Detective Board ── */}
        {isHome ? (
          <>
            {/* Detective Evidence Wall Background */}
            <DetectiveBoard />

            {/* Top-right action buttons — overlaid on bg.png's Evidence.AI branding */}
            {!showIntro && (
              <div className="db-top-buttons">
                <button className="db-top-link" onClick={() => setShowReportsGallery(true)}>CASE FILES</button>
                <button className="db-top-link">ANALYSIS TOOLS</button>
                <button className="db-top-link">FORENSIC DATABASE</button>
                <button className="db-top-link">ABOUT</button>
                <button className="db-top-btn" onClick={() => handleNewChat()}>NEW CHAT</button>
                <button className="db-top-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>CHAT HISTORY</button>
                <button className="db-top-btn db-top-btn-login">LOGIN</button>
              </div>
            )}

            {/* AI Hypothesis Generator — circle button bottom-right */}
            {!showIntro && (
              <button
                onClick={handleHypothesisMode}
                className="hypothesis-orb"
                title="AI Hypothesis Generator"
              >
                <span className="hypothesis-orb-ring" />
                <span className="hypothesis-orb-ring hypothesis-orb-ring-2" />
                <Zap size={22} className="hypothesis-orb-icon" />
              </button>
            )}

            {/* Sidebar (hidden by default on home, toggleable) */}
            <Sidebar
              sessions={sessions}
              activeSessionId={activeChatId}
              onNewChat={handleNewChat}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              isOpen={sidebarOpen}
              onToggle={() => setSidebarOpen(!sidebarOpen)}
              onGoHome={() => setActiveChatId(null)}
            />
          </>
        ) : (
          /* ── CHAT STATE — Messages + bottom input ── */
          <>
            {/* Unicorn Background for chat */}
            <UnicornBackground theme={theme} />

            {/* Theme Toggle */}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />

            {/* Sidebar for chat */}
            <Sidebar
              sessions={sessions}
              activeSessionId={activeChatId}
              onNewChat={handleNewChat}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              isOpen={sidebarOpen}
              onToggle={() => setSidebarOpen(!sidebarOpen)}
              onGoHome={() => setActiveChatId(null)}
            />

            {/* Chat content area */}
            <div
              className="relative z-10 flex flex-col h-full transition-all duration-300"
              style={{ marginLeft: sidebarOpen ? 270 : 0 }}
            >
            {/* Back button — always visible at top of chat */}
            <div className="flex items-center gap-3 p-10 pb-0">
              <button
                onClick={() => setActiveChatId(null)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl
                  bg-white/[0.05] border border-white/[0.08] text-white/50
                  hover:text-white/80 hover:bg-white/[0.08]
                  transition-all duration-200 text-[13px]"
              >
                <ArrowLeft size={45} />
                <span>Back to Board</span>
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto">
              {isChatEmpty ? (
                <div className="h-full flex flex-col items-center justify-center space-y-6 max-w-3xl mx-auto px-4 text-center pb-20">
                  {isHypothesisChat ? (
                    <>
                      {/* Hypothesis mode empty state */}
                      <div className="w-20 h-20 rounded-[2rem] bg-blue-500/[0.08] border border-blue-400/[0.15] flex items-center justify-center mb-2">
                        <Zap size={36} className="text-white-400/70" />
                      </div>
                      <div className="mb-1">
                        <h1 className="text-[20px] font-bold tracking-tight text-white-400/80">
                          🕵️ AI Hypothesis Generator
                        </h1>
                        <p className="text-[11px] text-white/25 mt-1 tracking-widest uppercase">Level 3 — Investigator Mode</p>
                      </div>
                      <h2 className="text-2xl font-bold tracking-tight text-white/90">Describe the incident</h2>
                      <p className="text-white/50 text-[14px] max-w-lg mx-auto leading-relaxed">
                        Tell me what happened — describe the crime scene, the victim, the circumstances. 
                        I'll generate competing hypotheses with evidence strength ratings. 
                        You can also upload photos or reports for deeper analysis.
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center mt-2">
                        {['🔪 "A body was found in the kitchen with no forced entry"',
                          '🏦 "Bank vault breached, no alarms triggered"',
                          '🔥 "Warehouse fire, possible arson"'
                        ].map((hint) => (
                          <button
                            key={hint}
                            onClick={() => setInput(hint.replace(/^[^\s]+ "/, '').replace(/"$/, ''))}
                            className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06]
                              text-[12px] text-white/40 hover:text-white/70 hover:bg-white/[0.07]
                              transition-all duration-200"
                          >
                            {hint}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Normal chat empty state */}
                      <div className="w-20 h-20 rounded-[2rem] bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-2">
                        <Fingerprint size={36} className="text-white/40" />
                      </div>
                      <div className="mb-2">
                        <h1 className="text-[22px] font-bold tracking-tight text-white/80">
                          Evidence<span className="text-white/35">.AI</span>
                        </h1>
                      </div>
                      <h2 className="text-3xl font-bold tracking-tight text-white/90">How can I help with the case?</h2>
                      <p className="text-white/50 text-[15px] max-w-md mx-auto leading-relaxed">
                        Upload crime scene photos, forensic reports, or ask me to analyze existing suspects.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                <AnimatePresence>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-xl msg-avatar-ai flex items-center justify-center mt-0.5">
                          <Bot size={15} className="text-white/60" />
                        </div>
                      )}

                      <div className={`max-w-[75%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`px-4 py-3 rounded-2xl text-[14px] leading-[1.7]
                          ${msg.role === 'user'
                            ? 'msg-bubble-user text-white/90 rounded-br-md'
                            : 'msg-bubble-ai text-white/80 rounded-bl-md'
                          }`}
                        >
                          {msg.role === 'assistant' ? (
                            <div className="markdown-content"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                          ) : msg.content}
                        </div>

                        {/* Image thumbnail + Open Scene button */}
                        {msg.role === 'assistant' && msg.content.includes('🖼️') && (() => {
                          const fName = msg.content.match(/`([^`]+)`/)?.[1] || '';
                          const matchedFile = uploadedFiles.find((uf) => uf.name === fName);
                          const imgType = msg.content.includes('Crime Scene') ? 'scene_image' as const : 'evidence_image' as const;
                          const isAnalyzingThis = analyzingFiles[fName];
                          const hasAnalysis = !!sceneAnalyses[fName];
                          return (
                            <motion.div
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.15 }}
                              className="chat-image-row mt-3"
                            >
                              {matchedFile?.imageUrl && (
                                <img
                                  src={matchedFile.imageUrl}
                                  alt={fName}
                                  className="chat-image-thumbnail"
                                />
                              )}
                              <button
                                className="open-scene-btn"
                                onClick={() => handleOpenScene(fName, imgType)}
                                disabled={!matchedFile?.imageUrl}
                              >
                                <span className="open-scene-btn-dot" />
                                {isAnalyzingThis ? (
                                  <>
                                    <Loader2 size={15} className="animate-spin" />
                                    <span>Analyzing…</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye size={15} />
                                    <span>Open Scene</span>
                                  </>
                                )}
                                {hasAnalysis && (
                                  <span style={{ fontSize: '10px', opacity: 0.5 }}>
                                    ({sceneAnalyses[fName]?.findings.length} findings)
                                  </span>
                                )}
                              </button>
                            </motion.div>
                          );
                        })()}

                        {/* Sources */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.map((src, i) => (
                              <span key={i} className="source-tag inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium">
                                {src.includes('pdf') ? <FileText size={9} /> : <Image size={9} />}
                                {src}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* RAG Context toggle */}
                        {msg.contextChunks && msg.contextChunks.length > 0 && (
                          <div>
                            <button
                              onClick={() => setShowContext(showContext === msg.id ? null : msg.id)}
                              className="flex items-center gap-1 text-[10px] text-white/20 hover:text-white/40 transition-colors"
                            >
                              <ChevronDown size={12} className={`transition-transform duration-200 ${showContext === msg.id ? 'rotate-180' : ''}`} />
                              RAG Context ({msg.contextChunks.length} chunks)
                            </button>
                            <AnimatePresence>
                              {showContext === msg.id && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="mt-2 space-y-1.5 overflow-hidden"
                                >
                                  {msg.contextChunks.map((chunk, i) => (
                                    <div key={i} className="context-chunk p-2.5 rounded-xl text-[11px]">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-medium uppercase tracking-wider
                                          ${chunk.type === 'pdf' ? 'bg-blue-500/10 text-blue-400/60' : chunk.type === 'scene_image' ? 'bg-rose-500/10 text-rose-400/60' : 'bg-emerald-500/10 text-emerald-400/60'}`}>
                                          {chunk.type}
                                        </span>
                                        {chunk.page > 0 && <span className="text-white/15">p.{chunk.page}</span>}
                                        <span className="text-white/15 ml-auto font-mono text-[10px]">{chunk.score.toFixed(4)}</span>
                                      </div>
                                      <p className="text-white/30 leading-relaxed">{chunk.text}</p>
                                    </div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>

                      {msg.role === 'user' && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-xl msg-avatar-user flex items-center justify-center mt-0.5">
                          <User size={14} className="text-white/50" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Loading indicator */}
                {isLoading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                    <div className="w-8 h-8 rounded-xl msg-avatar-ai flex items-center justify-center">
                      <Bot size={15} className="text-white/60" />
                    </div>
                    <div className="msg-bubble-ai px-4 py-3 rounded-2xl rounded-bl-md">
                      <div className="flex items-center gap-2.5">
                        <Loader2 size={14} className="text-white/40 animate-spin" />
                        <span className="text-[12px] text-white/25">Analyzing evidence...</span>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <div className="typing-dot w-1.5 h-1.5 bg-white/20 rounded-full" />
                        <div className="typing-dot w-1.5 h-1.5 bg-white/20 rounded-full" />
                        <div className="typing-dot w-1.5 h-1.5 bg-white/20 rounded-full" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
              )}
            </div>

            {/* Uploaded files pills — chat state */}
            {uploadedFiles.length > 0 && (
              <div className="px-4">
                <div className="max-w-3xl mx-auto">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {uploadedFiles.map((f) => (
                      <div
                        key={f.id}
                        className="uploaded-file-pill flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px]"
                      >
                        {f.status === 'uploading' ? (
                          <Loader2 size={12} className="animate-spin text-white/40" />
                        ) : f.status === 'done' ? (
                          <CheckCircle2 size={12} className="text-emerald-400/70" />
                        ) : (
                          <X size={12} className="text-red-400/70" />
                        )}
                        {f.type === 'pdf' ? <FileText size={12} className="text-white/30" /> : <Image size={12} className="text-white/30" />}
                        <span className="text-white/50 max-w-[150px] truncate">{f.name}</span>
                        {f.status === 'done' && <span className="text-white/20 text-[10px]">{f.chunks} chunks</span>}
                        <button onClick={() => removeUploadedFile(f.id)} className="text-white/20 hover:text-white/50 transition-colors ml-1">
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Bottom input bar */}
            <div className="pb-5 px-4">
              <div className="max-w-3xl mx-auto">
                <div className="input-bar-glass rounded-2xl p-1.5">
                  <div className="flex items-end gap-2">
                    <div className="relative">
                      <button
                        onClick={() => setShowUploadMenu(!showUploadMenu)}
                        className={`p-3 rounded-xl transition-all duration-200
                          ${isUploading ? 'text-white/60' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.06]'}`}
                        disabled={isUploading}
                      >
                        {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                      </button>
                      <AnimatePresence>
                        {showUploadMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            className="absolute bottom-full left-0 mb-2 upload-dropdown rounded-xl p-1.5 min-w-[180px]"
                          >
                            {[
                              { key: 'pdf', label: 'Incident Report', sub: 'PDF files', icon: FileText },
                              { key: 'scene_image', label: 'Scene Photo', sub: 'Images', icon: Image },
                              { key: 'evidence_image', label: 'Evidence Photo', sub: 'Images', icon: Image },
                            ].map(({ key, label, sub, icon: Icon }) => (
                              <button
                                key={key}
                                onClick={() => { setUploadType(key as any); setShowUploadMenu(false); openFilePicker(); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                                  text-white/50 hover:text-white/80 hover:bg-white/[0.06]
                                  transition-all duration-200 text-left"
                              >
                                <Icon size={15} className="text-white/30" />
                                <div>
                                  <p className="text-[12px] font-medium">{label}</p>
                                  <p className="text-[10px] text-white/25">{sub}</p>
                                </div>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={isHypothesisChat ? "Describe the incident or ask about a hypothesis..." : "Ask about the evidence..."}
                      rows={1}
                      className="flex-1 bg-transparent text-[14px] text-white/90 placeholder-white/20
                        resize-none focus:outline-none py-3 leading-relaxed"
                      style={{ minHeight: '48px', maxHeight: '150px' }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                      className="send-btn p-3 rounded-xl transition-all duration-200 active:scale-90
                        disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <Send size={17} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </>
        )}

      {/* Evidence Board in chat state — collapsible */}
      {!isHome && (
        <div className="fixed bottom-24 right-6 z-30">
          <button
            onClick={() => setShowEvidenceBoard(!showEvidenceBoard)}
            className="evidence-board-toggle"
            title="Toggle Evidence Board"
          >
            <span className="evidence-board-toggle-dot" />
            <LayoutGrid size={13} />
            <span>Board</span>
            {evidenceItems.length > 0 && (
              <span className="text-white/20 text-[10px]">({evidenceItems.length})</span>
            )}
          </button>
        </div>
      )}

      {/* Floating Evidence Board overlay for chat state */}
      <AnimatePresence>
        {!isHome && showEvidenceBoard && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-36 right-6 z-20"
            style={{ width: 480, marginLeft: sidebarOpen ? 270 : 0 }}
          >
            <EvidenceBoard3D
              evidence={evidenceItems}
              onSelectEvidence={handleSelectEvidence}
              theme={theme}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Panel Overlay */}
      <DetailPanel
        item={selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
        theme={theme}
      />

      {/* Scene Analysis Modal */}
      <SceneAnalysisModal
        isOpen={sceneModalOpen}
        onClose={() => { setSceneModalOpen(false); setSceneModalFile(null); }}
        imageUrl={sceneModalFile?.imageUrl || ''}
        fileName={sceneModalFile?.fileName || ''}
        imageType={sceneModalFile?.imageType || 'scene_image'}
        analysis={sceneModalFile ? (sceneAnalyses[sceneModalFile.fileName] || null) : null}
        isAnalyzing={sceneModalFile ? (analyzingFiles[sceneModalFile.fileName] || false) : false}
      />

      {/* Reports Gallery */}
      <ReportsGallery
        isOpen={showReportsGallery}
        onClose={() => setShowReportsGallery(false)}
        onOpenScene={(report: SavedReport) => {
          // Only open scene modal for images, not PDFs
          if (report.fileType === 'pdf') return;
          setShowReportsGallery(false);
          const imgUrl = report.imageUrl || '';
          const fType = (report.fileType === 'scene_image' || report.fileType === 'evidence_image') ? report.fileType as 'scene_image' | 'evidence_image' : 'scene_image';
          setSceneModalFile({ imageUrl: imgUrl, fileName: report.fileName, imageType: fType });
          setSceneModalOpen(true);
          // Load analysis from report if available
          if (report.analysis) {
            setSceneAnalyses((prev) => ({ ...prev, [report.fileName]: report.analysis }));
          } else if (!sceneAnalyses[report.fileName] && !analyzingFiles[report.fileName] && report.caption) {
            // Trigger analysis
            setAnalyzingFiles((prev) => ({ ...prev, [report.fileName]: true }));
            analyzeScene(report.caption, report.fileName, fType)
              .then((result) => {
                setSceneAnalyses((prev) => ({ ...prev, [report.fileName]: result.analysis }));
                saveReportToDB(report.fileName, fType, report.imageUrl || undefined, report.caption || undefined, report.chunks, report.caseId || undefined, result.analysis);
              })
              .catch((err) => console.error('[Gallery] Analysis failed:', err))
              .finally(() => setAnalyzingFiles((prev) => ({ ...prev, [report.fileName]: false })));
          }
        }}
        theme={theme}
      />
      {/* Blast transition overlay */}
      <AnimatePresence>
        {showBlast && (
          <motion.div
            className="blast-overlay"
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              className="blast-core"
              initial={{ scale: 0 }}
              animate={{ scale: 40 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.div
              className="blast-text"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <Zap size={40} className="text-black/80" />
              <span>Activating Investigator Mode</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </main>
    </>
  );
}
