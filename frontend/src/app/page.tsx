'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, Send, Bot, User, Loader2, Sparkles, ChevronDown, FileText, Image, Fingerprint, X, CheckCircle2, LayoutGrid, Eye, FolderOpen, ArrowLeft, Zap, Shield, Search, Crosshair, Palette, Download } from 'lucide-react';
import ReportsGallery, { type SavedReport } from '@/components/ReportsGallery';
import ReactMarkdown from 'react-markdown';
import { useDropzone } from 'react-dropzone';
import Sidebar, { type ChatSession } from '@/components/Sidebar';
import IntroVideo from '@/components/IntroVideo';
import ThemeToggle from '@/components/ThemeToggle';
import DetailPanel from '@/components/DetailPanel';
import DetectiveBoard from '@/components/DetectiveBoard';
import { getStatus, resetStore, sendMessage, sendHypothesisChat, sendForensicChat, uploadPDF, uploadImage, analyzeScene, type ChatResponse, type UploadResponse, type SceneAnalysis } from '@/lib/api';
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

const BodyModel3DDynamic = dynamic(() => import('@/components/BodyModel3D'), {
  ssr: false,
});

const PromptInputBoxDynamic = dynamic(
  () => import('@/components/ui/ai-prompt-box').then((mod) => ({ default: mod.PromptInputBox })),
  { ssr: false }
);


/* ============================================================
   PAGE — Evidence.AI
   FullScreen Unicorn BG + ChatGPT-style sidebar + centered chat
   ============================================================ */

const GRADIENT_THEMES = ['green', 'blue', 'purple', 'crimson', 'amber', 'cyan', 'pink', 'detective'] as const;
type GradientTheme = typeof GRADIENT_THEMES[number];
const getRandomGradient = (): GradientTheme => GRADIENT_THEMES[Math.floor(Math.random() * GRADIENT_THEMES.length)];

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
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [gradientTheme, setGradientTheme] = useState<GradientTheme>('green');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfDownloads, setPdfDownloads] = useState<Record<string, { url: string; fileName: string }>>({});
  const [showAbout, setShowAbout] = useState(false);

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

  // Gradient theme: persist + set data-gradient on <html>
  useEffect(() => {
    const savedGradient = localStorage.getItem('evidenceai-gradient') as GradientTheme | null;
    if (savedGradient && GRADIENT_THEMES.includes(savedGradient)) {
      setGradientTheme(savedGradient);
    } else {
      const random = getRandomGradient();
      setGradientTheme(random);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-gradient', gradientTheme);
    localStorage.setItem('evidenceai-gradient', gradientTheme);
  }, [gradientTheme]);

  const cycleGradient = () => {
    const currentIdx = GRADIENT_THEMES.indexOf(gradientTheme);
    const nextIdx = (currentIdx + 1) % GRADIENT_THEMES.length;
    setGradientTheme(GRADIENT_THEMES[nextIdx]);
  };

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

  // ── Load saved chats from DB on mount (with localStorage fallback) ──
  const chatsLoadedFromDB = useRef(false);
  useEffect(() => {
    (async () => {
      let loaded = false;
      // Try DB first
      try {
        const res = await fetch('/api/chats');
        if (res.ok) {
          const saved = await res.json();
          if (Array.isArray(saved) && saved.length > 0) {
            setChats(saved.map((c: any) => ({
              id: c.id,
              title: c.title,
              messages: c.messages || [],
              isHypothesisMode: c.isHypothesisMode || false,
              createdAt: new Date(c.createdAt),
            })));
            loaded = true;
          }
        }
      } catch (e) {
        console.log('[DB] Could not load saved chats:', e);
      }
      // Fallback to localStorage
      if (!loaded) {
        try {
          const stored = localStorage.getItem('evidenceai-chats');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setChats(parsed.map((c: any) => ({
                ...c,
                createdAt: new Date(c.createdAt),
              })));
            }
          }
        } catch (e) {
          console.log('[LS] Could not load saved chats:', e);
        }
      }
      // Also load saved reports from localStorage
      try {
        const storedReports = localStorage.getItem('evidenceai-reports');
        if (storedReports) {
          const parsed = JSON.parse(storedReports);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSavedReports(parsed);
          }
        }
      } catch (e) {
        console.log('[LS] Could not load saved reports:', e);
      }
      // Mark loaded so auto-save won't fire on the initial load
      setTimeout(() => { chatsLoadedFromDB.current = true; }, 3000);
    })();
  }, []);

  // ── Persist saved reports to localStorage whenever they change ──
  useEffect(() => {
    if (savedReports.length === 0) return;
    if (!chatsLoadedFromDB.current) return;
    try {
      localStorage.setItem('evidenceai-reports', JSON.stringify(savedReports));
    } catch (e) {
      console.log('[LS] Could not save reports:', e);
    }
  }, [savedReports]);

  // ── Auto-save chats to DB + localStorage (debounced) ──
  const saveChatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (chats.length === 0) return;
    if (!chatsLoadedFromDB.current) return; // Skip save during initial load
    if (saveChatTimeoutRef.current) clearTimeout(saveChatTimeoutRef.current);
    saveChatTimeoutRef.current = setTimeout(async () => {
      // Always save to localStorage (reliable)
      try {
        localStorage.setItem('evidenceai-chats', JSON.stringify(chats));
      } catch (e) {
        console.log('[LS] Could not save chats:', e);
      }
      // Also try DB save (best-effort)
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
          // Silently fail — localStorage has the data
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
    // Save to in-memory state (always works, even without DB)
    const localReport: SavedReport = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName,
      fileType,
      imageUrl: imageUrl || null,
      thumbnailUrl: null,
      caption: caption || null,
      chunks,
      caseId: caseId || null,
      analysis: analysis || null,
      createdAt: new Date().toISOString(),
    };
    setSavedReports((prev) => {
      // Update existing by fileName, or add new
      const idx = prev.findIndex((r) => r.fileName === fileName);
      if (idx >= 0) {
        const updated = [...prev];
        // Only overwrite fields that have non-null values (preserve existing imageUrl etc.)
        const merged = { ...updated[idx] };
        if (localReport.imageUrl) merged.imageUrl = localReport.imageUrl;
        if (localReport.caption) merged.caption = localReport.caption;
        if (localReport.analysis) merged.analysis = localReport.analysis;
        if (localReport.caseId) merged.caseId = localReport.caseId;
        merged.fileType = localReport.fileType;
        merged.chunks = localReport.chunks;
        merged.createdAt = updated[idx].createdAt; // keep original timestamp
        updated[idx] = merged;
        return updated;
      }
      return [localReport, ...prev];
    });

    // Also try DB save (best-effort)
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
    // Default to detective theme (bg image), user can change after
    setGradientTheme('detective');
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

  const handleRenameSession = (id: string, newTitle: string) => {
    setChats((prev) => prev.map((c) => c.id === id ? { ...c, title: newTitle } : c));
  };

  // ── Send message ──
  const handleSend = async (directMessage?: string) => {
    const messageText = directMessage || input;
    if (!messageText.trim() || isLoading) return;

    // Check if this is a forensic chatbot message
    const isForensicMode = messageText.startsWith('[Forensic:');
    const cleanMessage = isForensicMode
      ? messageText.replace(/^\[Forensic:\s*/, '').replace(/\]$/, '').trim()
      : messageText.trim();

    let chat = activeChat;
    if (!chat) chat = createChat();

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: cleanMessage };
    const isHypothesis = chat.isHypothesisMode || false;

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chat!.id) return c;
        const updated = { ...c, messages: [...c.messages, userMsg] };
        // Auto-name: on first user message OR if title is still default
        const isDefaultTitle = c.title === 'New Analysis' || c.title.startsWith('Evidence:');
        if (c.messages.length === 0 || isDefaultTitle) {
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
      if (isForensicMode) {
        // Forensic chatbot mode — no evidence needed
        const history = [...(chat.messages || []), userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));
        res = await sendForensicChat(cleanMessage, history.slice(0, -1));
      } else if (isHypothesis) {
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

  // ── Canvas Mode: Generate PDF Report from Image ──
  const generatePdfReport = async (imageFile: File, userNotes: string) => {
    setIsGeneratingPdf(true);
    let chat = activeChat;
    if (!chat) chat = createChat();

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `📄 Generate PDF Report: ${imageFile.name}${userNotes ? ` — ${userNotes}` : ''}`,
    };
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chat!.id) return c;
        const updated = { ...c, messages: [...c.messages, userMsg] };
        if (c.messages.length === 0 || c.title === 'New Analysis') {
          updated.title = `📄 Report: ${imageFile.name.slice(0, 30)}`;
        }
        return updated;
      })
    );

    try {
      // Read image as data URL
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      // Upload image to backend for analysis
      let caption = '';
      try {
        const uploadRes = await uploadImage(imageFile, 'evidence_image');
        caption = uploadRes.caption || '';
      } catch { /* continue without caption */ }

      // Get AI analysis if we got a caption
      let aiAnalysis = '';
      if (caption) {
        try {
          const chatRes = await sendMessage(`Analyze this evidence image and provide a detailed forensic report. The image shows: ${caption}. ${userNotes ? `Additional notes: ${userNotes}` : ''}`);
          aiAnalysis = chatRes.answer;
        } catch { /* continue without AI analysis */ }
      }

      // Helper: clean markdown formatting and source references from text
      const cleanText = (text: string) =>
        text
          .replace(/#{1,6}\s?/g, '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/`(.*?)`/g, '$1')
          .replace(/\[Source\s*\d+\]/gi, '')
          .replace(/\[(\d+)\]/g, '')
          .replace(/---+/g, '')
          // Remove orphaned source-reference phrases like "According to ," "as described by and ,"
          .replace(/(?:According to|as described by|as noted by|as identified by|as mentioned in|including)\s*(?:and\s*)?\s*,/gi, '')
          .replace(/,\s*which also/gi, ', which')
          .replace(/from various sources,?/gi, '')
          .replace(/across multiple sources,?\s*(?:including)?/gi, '')
          .replace(/\s*,\s*,/g, ',')
          .replace(/\s{2,}/g, ' ')
          .trim();

      // Generate PDF with jsPDF
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      const footerY = pageHeight - 12;
      const maxContentY = footerY - 8; // leave gap above footer
      let y = margin;

      const caseId = `CASE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      // Helper: check page break needed
      const checkPage = (needed: number) => {
        if (y + needed > maxContentY) {
          doc.addPage();
          y = margin;
        }
      };

      // Helper: print section heading
      const printHeading = (title: string) => {
        checkPage(14);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(10, 61, 53);
        doc.text(title, margin, y);
        y += 2;
        doc.setDrawColor(42, 140, 106);
        doc.setLineWidth(0.3);
        doc.line(margin, y, margin + doc.getTextWidth(title) + 6, y);
        y += 6;
      };

      // Helper: print body text with auto page-break
      const printBody = (text: string) => {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 50, 50);
        const lines = doc.splitTextToSize(cleanText(text), contentWidth);
        for (const line of lines) {
          checkPage(6);
          doc.text(line, margin, y);
          y += 5;
        }
        y += 3;
      };

      // ─── HEADER ───
      doc.setFillColor(10, 61, 53);
      doc.rect(0, 0, pageWidth, 38, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Evidence.AI — Forensic Incident Report', margin, 18);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Case ID: ${caseId}   |   Date: ${reportDate}`, margin, 28);
      doc.text(`File: ${imageFile.name}   |   Type: Evidence Image Analysis`, margin, 34);

      y = 48;

      // Divider
      doc.setDrawColor(42, 140, 106);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      // ─── EVIDENCE IMAGE ───
      try {
        const img = new window.Image();
        img.src = imageDataUrl;
        await new Promise((resolve) => { img.onload = resolve; });
        const aspectRatio = img.width / img.height;
        const imgWidth = Math.min(contentWidth, 110);
        const imgHeight = imgWidth / aspectRatio;
        checkPage(imgHeight + 10);
        const imgX = (pageWidth - imgWidth) / 2;
        doc.addImage(imageDataUrl, 'JPEG', imgX, y, imgWidth, imgHeight);
        y += imgHeight + 10;
      } catch {
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text('[Image could not be embedded]', margin, y);
        y += 10;
      }

      // ─── INCIDENT OVERVIEW ───
      printHeading('Incident Overview');
      printBody(`Evidence file: ${imageFile.name}`);
      printBody(`Date of analysis: ${reportDate}`);
      if (caption) {
        printBody(caption);
      } else {
        printBody('Evidence image uploaded for analysis. No automated description available.');
      }

      // ─── EVIDENCE COLLECTED ───
      printHeading('Evidence Collected');
      printBody(`Primary exhibit: ${imageFile.name} (digital image)`);
      if (userNotes) {
        printBody(`Investigator notes: ${userNotes}`);
      }

      // ─── FORENSIC ANALYSIS ───
      printHeading('Forensic Analysis');
      if (aiAnalysis) {
        printBody(aiAnalysis);
      } else {
        printBody('AI analysis not available. Please ensure evidence has been uploaded to the backend for processing.');
      }

      // ─── CONCLUSION ───
      printHeading('Conclusion');
      printBody('Based on the analysis above, further investigation is recommended. All findings should be corroborated with physical evidence examination and witness statements. Cross-reference these visual observations with additional case files for consistency.');

      // ─── FOOTER on every page ───
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Evidence.AI — Confidential Forensic Report — Page ${i} of ${pageCount}`, pageWidth / 2, footerY, { align: 'center' });
      }

      // Create blob and download link
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const fileName = `EvidenceAI_Report_${Date.now()}.pdf`;

      // Add AI message with download link
      const msgId = (Date.now() + 1).toString();
      const aiMsg: Message = {
        id: msgId,
        role: 'assistant',
        content: `✅ **PDF Report Generated Successfully!**\n\n📄 **${fileName}**\n\nYour forensic report has been generated with:\n- Evidence image analysis\n${caption ? '- AI image description\n' : ''}${aiAnalysis ? '- Detailed forensic analysis\n' : ''}${userNotes ? '- Investigator notes\n' : ''}\n📥 Click the download button below to save your report.`,
      };
      setChats((prev) => prev.map((c) => c.id === chat!.id ? { ...c, messages: [...c.messages, aiMsg] } : c));

      // Store download URL for the inline download button
      setPdfDownloads((prev) => ({ ...prev, [msgId]: { url: pdfUrl, fileName } }));

      // Also trigger auto-download
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000);
    } catch (err: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ Failed to generate PDF report: ${err?.message || 'Unknown error'}. Please try again.`,
      };
      setChats((prev) => prev.map((c) => c.id === chat!.id ? { ...c, messages: [...c.messages, errMsg] } : c));
    }
    setIsGeneratingPdf(false);
  };

  // ── Unified handler for PromptInputBox ──
  const handlePromptSend = (message: string, promptFiles?: File[]) => {
    const isCanvasMode = message.startsWith('[Canvas:');
    const hasImageFile = promptFiles?.some((f) => f.type.startsWith('image/'));

    if (isCanvasMode && hasImageFile && promptFiles) {
      const imageFile = promptFiles.find((f) => f.type.startsWith('image/'));
      if (imageFile) {
        // Extract user notes from canvas message
        const notes = message.replace(/^\[Canvas:\s*/, '').replace(/\]$/, '').trim();
        generatePdfReport(imageFile, notes);
        return;
      }
    }

    // Normal flow: upload files + send message
    if (promptFiles && promptFiles.length > 0) onDrop(promptFiles);
    if (message.trim()) handleSend(message);
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
      // Determine type from MIME (uploadType may still be stale 'pdf' default)
      const isImageFile = file.type.startsWith('image/');
      const fileType = file.type === 'application/pdf'
        ? 'pdf' as const
        : isImageFile
          ? (uploadType === 'evidence_image' ? 'evidence_image' : 'scene_image')
          : uploadType;
      // Create a local object URL for image thumbnail/preview
      const imageUrl = isImageFile ? URL.createObjectURL(file) : undefined;
      setUploadedFiles((prev) => [...prev, { id: fileId, name: file.name, type: fileType, chunks: 0, status: 'uploading', imageUrl }]);
      try {
        let res: UploadResponse;
        if (file.type === 'application/pdf') {
          res = await uploadPDF(file);
        } else {
          // Send the corrected fileType, not the potentially-stale uploadType
          res = await uploadImage(file, fileType);
        }
        setUploadedFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, chunks: res.chunks_created, status: 'done' as const, caption: res.caption } : f));
        fetchStatus();

        // Auto-inject upload confirmation into active chat
        const uploadMsg: Message = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: !isImageFile
            ? `📄 **Evidence Uploaded:** \`${file.name}\`\n\n- **Pages Extracted:** ${res.pages_extracted || 'N/A'}\n- **Chunks Created:** ${res.chunks_created}\n\n_You can now ask questions about this document._`
            : `🖼️ **Evidence Uploaded:** \`${file.name}\`\n\n**${fileType === 'scene_image' ? 'Crime Scene Photo' : 'Evidence Photo'}** — ${res.chunks_created} chunks indexed\n\n${res.caption ? `> ${res.caption.slice(0, 150).trim()}…` : ''}\n\n_Click **Open Scene** to view full forensic analysis._`,
        };

        setChats((prev) => {
          const currentId = activeChatId;
          if (currentId) {
            return prev.map((c) => {
              if (c.id !== currentId) return c;
              // Also update title if still default
              const newTitle = (c.title === 'New Analysis')
                ? `Evidence: ${file.name.slice(0, 30)}`
                : c.title;
              return { ...c, title: newTitle, messages: [...c.messages, uploadMsg] };
            });
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
        if (isImageFile) {
          const imgType = (fileType === 'scene_image' || fileType === 'evidence_image') ? fileType : 'scene_image' as const;
          const caption = res.caption || `Forensic ${imgType === 'scene_image' ? 'crime scene' : 'evidence'} image: ${res.filename}`;
          console.log('[Scene] Auto-triggering analysis for:', res.filename, 'caption length:', caption.length);
          setAnalyzingFiles((prev) => ({ ...prev, [file.name]: true }));

          // Convert image to base64 for DB persistence (blob URLs are ephemeral)
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Url = reader.result as string;
            // Update uploadedFiles with base64 URL (so scene modal works reliably)
            setUploadedFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, imageUrl: base64Url } : f));
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
          // Save PDF report to DB — include extracted text as analysis
          const pdfCaption = `PDF Document — ${res.pages_extracted || '?'} pages extracted, ${res.chunks_created} chunks indexed.`;
          const pdfAnalysis = res.text_preview || null;
          saveReportToDB(file.name, 'pdf', undefined, pdfCaption, res.chunks_created, (res as any).case_id, pdfAnalysis);
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

      <main className="relative h-screen h-[100dvh] overflow-hidden" {...getRootProps()}>
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
                <button className="db-top-link" onClick={() => setShowAbout(true)}>ABOUT</button>
                <button className="db-top-btn" onClick={() => handleNewChat()}>NEW CHAT</button>
                <button className="db-top-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>CHAT HISTORY</button>
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
              onRenameSession={handleRenameSession}
              isOpen={sidebarOpen}
              onToggle={() => setSidebarOpen(!sidebarOpen)}
              onGoHome={() => setActiveChatId(null)}
            />
          </>
        ) : (
          /* ── CHAT STATE — Xrio-style Gradient Chat UI ── */
          <>
            {/* Gradient Background */}
            <div className="chat-gradient-bg" />

            {/* Detective 3D body models — only visible on detective theme */}
            {gradientTheme === 'detective' && (
              <>
                <BodyModel3DDynamic side="left" />
                <BodyModel3DDynamic side="right" />
              </>
            )}

            {/* Sidebar for chat */}
            <Sidebar
              sessions={sessions}
              activeSessionId={activeChatId}
              onNewChat={handleNewChat}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              onRenameSession={handleRenameSession}
              isOpen={sidebarOpen}
              onToggle={() => setSidebarOpen(!sidebarOpen)}
              onGoHome={() => setActiveChatId(null)}
            />

            {/* Chat content area */}
            <div
              className="relative z-10 flex flex-col h-full transition-all duration-500 ease-out"
              style={{ marginLeft: sidebarOpen ? 270 : 0 }}
            >
              {/* Top bar — Logo + Nav + Theme Toggle */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-between px-5 sm:px-8 py-4"
              >
                {/* Logo */}
                <button
                  onClick={() => setActiveChatId(null)}
                  className="flex items-center gap-2 group"
                >
                  <span className="text-xl font-black tracking-tight chat-text-primary">
                    Evidence<span className="chat-text-accent">.AI</span>
                  </span>
                </button>

                {/* Center nav pills */}
                <div className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-full chat-nav-pill-container">
                  <button onClick={() => setActiveChatId(null)} className="chat-nav-pill">Home</button>
                  <button onClick={() => setShowReportsGallery(true)} className="chat-nav-pill">Case Files</button>
                  <button onClick={() => setSidebarOpen(!sidebarOpen)} className="chat-nav-pill">History</button>
                </div>

                {/* Right side: Actions */}
                <div className="flex items-center gap-2">
                  {isHypothesisChat && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full
                      bg-amber-500/[0.08] border border-amber-500/[0.15]">
                      <Zap size={12} className="text-amber-400" />
                      <span className="text-[11px] text-amber-300/80 font-medium">Hypothesis Mode</span>
                    </div>
                  )}
                  <button
                    onClick={() => handleNewChat()}
                    className="chat-contact-btn"
                  >
                    <Sparkles size={14} />
                    <span>New Chat</span>
                  </button>
                  <div className="w-px h-5 bg-current opacity-10 mx-1" />
                  <ThemeToggle theme={theme} onToggle={toggleTheme} />
                  <div className="ml-1">
                    <button
                      onClick={cycleGradient}
                      className="color-changer-btn"
                      title="Change color theme"
                    />
                  </div>
                </div>
              </motion.div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto scrollbar-forensic">
                {isChatEmpty ? (
                  <div className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto px-4 text-center">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      className="w-full space-y-10"
                    >
                      {isHypothesisChat ? (
                        <>
                          <div>
                            <h1 className="text-5xl sm:text-7xl font-black tracking-tighter chat-hero-title">
                              Hypothesis
                            </h1>
                            <p className="text-sm chat-text-muted mt-3">
                              Describe the crime scene, the victim, the circumstances.
                            </p>
                          </div>

                          {/* Input box */}
                          <div className="w-full max-w-2xl mx-auto">
                            <PromptInputBoxDynamic
                              onSend={handlePromptSend}
                              isLoading={isLoading || isGeneratingPdf}
                              placeholder="Describe the incident or ask about a hypothesis..."
                            />
                          </div>

                          {/* Pre-prompts */}
                          <div className="flex flex-wrap gap-3 justify-center">
                            {[
                              { icon: '🔪', text: 'A body was found in the kitchen with no forced entry' },
                              { icon: '🏦', text: 'Bank vault breached, no alarms triggered' },
                              { icon: '🔥', text: 'Warehouse fire, possible arson' },
                            ].map(({ icon, text }) => (
                              <motion.button
                                key={text}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleSend(text)}
                                className="chat-suggestion-chip"
                              >
                                <span>{icon}</span>
                                <span>{text}</span>
                              </motion.button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Big hero title like Xrio — with glitch animation */}
                          <div>
                            <h1 className="text-6xl sm:text-8xl lg:text-9xl font-black tracking-tighter chat-hero-title leading-[0.9] glitch-text" data-text="Evidence.AI">
                              Evidence<span className="chat-hero-accent">.AI</span>
                            </h1>
                            <p className="text-sm sm:text-base chat-text-muted mt-4 max-w-md mx-auto leading-relaxed">
                              Upload evidence documents & crime scene images.<br />
                              Let AI analyze, connect dots and generate forensic reports.
                            </p>
                          </div>

                          {/* Input box — centered like Xrio */}
                          <div className="w-full max-w-2xl mx-auto">
                            <PromptInputBoxDynamic
                              onSend={handlePromptSend}
                              isLoading={isLoading || isGeneratingPdf}
                              placeholder="What do you want to know?"
                            />
                          </div>

                          {/* Pre-prompt suggestions */}
                          <div className="flex flex-wrap gap-2.5 justify-center max-w-2xl mx-auto">
                            {[
                              { icon: Search, text: 'What evidence was found at the scene?' },
                              { icon: FileText, text: 'Summarize the incident report' },
                              { icon: Crosshair, text: 'Build a timeline of events' },
                              { icon: Fingerprint, text: 'Analyze fingerprint matches' },
                              { icon: Shield, text: 'Identify suspect connections' },
                            ].map(({ icon: Icon, text }) => (
                              <motion.button
                                key={text}
                                whileHover={{ scale: 1.03, y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => handleSend(text)}
                                className="chat-suggestion-chip"
                              >
                                <Icon size={14} />
                                <span>{text}</span>
                              </motion.button>
                            ))}
                          </div>

                        </>
                      )}
                    </motion.div>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                    <AnimatePresence>
                      {messages.map((msg, msgIdx) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: msgIdx < 3 ? msgIdx * 0.1 : 0, ease: [0.16, 1, 0.3, 1] }}
                          className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          {msg.role === 'assistant' && (
                            <div className="flex-shrink-0 w-9 h-9 rounded-2xl chat-avatar-ai flex items-center justify-center mt-0.5">
                              <Bot size={16} className="chat-avatar-ai-icon" />
                            </div>
                          )}

                          <div className={`max-w-[90%] sm:max-w-[75%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`px-4 py-3.5 rounded-2xl text-[14px] leading-[1.75]
                              ${msg.role === 'user'
                                ? 'chat-msg-user rounded-br-md'
                                : 'chat-msg-ai rounded-bl-md'
                              }`}
                            >
                              {msg.role === 'assistant' ? (
                                <div className="markdown-content"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                              ) : msg.content}
                            </div>

                            {/* PDF Download button */}
                            {msg.role === 'assistant' && pdfDownloads[msg.id] && (
                              <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className="mt-2"
                              >
                                <a
                                  href={pdfDownloads[msg.id].url}
                                  download={pdfDownloads[msg.id].fileName}
                                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                                    bg-orange-500/[0.1] border border-orange-500/20 text-orange-400
                                    hover:bg-orange-500/[0.2] transition-all duration-200 text-[13px] font-medium"
                                >
                                  <Download size={16} />
                                  <span>Download {pdfDownloads[msg.id].fileName}</span>
                                </a>
                              </motion.div>
                            )}

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
                                  className="flex items-center gap-3 mt-3"
                                >
                                  {matchedFile?.imageUrl && (
                                    <img
                                      src={matchedFile.imageUrl}
                                      alt={fName}
                                      className="w-16 h-16 rounded-xl object-cover border border-white/10"
                                    />
                                  )}
                                  <button
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl
                                      bg-cyan-500/[0.08] border border-cyan-500/15 text-cyan-300/80
                                      hover:bg-cyan-500/[0.15] transition-all duration-200 text-[12px]"
                                    onClick={() => handleOpenScene(fName, imgType)}
                                    disabled={!matchedFile?.imageUrl}
                                  >
                                    {isAnalyzingThis ? (
                                      <>
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>Analyzing…</span>
                                      </>
                                    ) : (
                                      <>
                                        <Eye size={14} />
                                        <span>Open Scene</span>
                                      </>
                                    )}
                                    {hasAnalysis && (
                                      <span className="text-[10px] opacity-50">
                                        ({sceneAnalyses[fName]?.findings.length} findings)
                                      </span>
                                    )}
                                  </button>
                                </motion.div>
                              );
                            })()}

                            {/* Sources */}
                            {msg.sources && msg.sources.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {msg.sources.map((src, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium
                                    bg-amber-500/[0.06] border border-amber-500/10 text-amber-400/60">
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
                                  className="flex items-center gap-1.5 text-[10px] text-white/20 hover:text-cyan-400/50 transition-colors mt-1"
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
                                        <div key={i} className="p-3 rounded-xl text-[11px]
                                          bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm">
                                          <div className="flex items-center gap-2 mb-1.5">
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
                            <div className="flex-shrink-0 w-9 h-9 rounded-2xl chat-avatar-user flex items-center justify-center mt-0.5">
                              <User size={15} className="chat-avatar-user-icon" />
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {/* Loading indicator */}
                    {isLoading && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex gap-3"
                      >
                        <div className="w-9 h-9 rounded-2xl chat-avatar-ai flex items-center justify-center">
                          <Bot size={16} className="chat-avatar-ai-icon" />
                        </div>
                        <div className="px-5 py-4 rounded-2xl rounded-bl-md chat-msg-ai">
                          <div className="flex items-center gap-3">
                            <div className="relative w-5 h-5">
                              <div className="absolute inset-0 rounded-full border-2 chat-spinner animate-spin" />
                            </div>
                            <span className="text-[12px] chat-text-muted font-mono">Analyzing evidence...</span>
                          </div>
                          <div className="flex gap-1.5 mt-2.5">
                            {[0, 1, 2].map(i => (
                              <motion.div
                                key={i}
                                animate={{ opacity: [0.2, 0.6, 0.2] }}
                                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                                className="w-1.5 h-1.5 chat-loading-dot rounded-full"
                              />
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* PDF Generating animation */}
                    {isGeneratingPdf && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex gap-3"
                      >
                        <div className="w-9 h-9 rounded-2xl chat-avatar-ai flex items-center justify-center">
                          <Bot size={16} className="chat-avatar-ai-icon" />
                        </div>
                        <div className="relative px-6 py-5 rounded-2xl rounded-bl-md pdf-generating-card overflow-hidden max-w-xs">
                          <div className="pdf-scan-line" />
                          <div className="flex items-center gap-3 mb-3">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                            >
                              <FileText size={20} className="text-orange-400" />
                            </motion.div>
                            <span className="text-[13px] font-semibold text-orange-300">Generating PDF Report...</span>
                          </div>
                          <div className="space-y-2">
                            {['Analyzing image...', 'Running forensic analysis...', 'Building report...'].map((step, i) => (
                              <motion.div
                                key={step}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
                                className="flex items-center gap-2"
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-orange-400/50" />
                                <span className="text-[11px] text-white/40 font-mono">{step}</span>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>

              {/* Uploaded files pills */}
              {uploadedFiles.length > 0 && (
                <div className="px-4 relative z-20">
                  <div className="max-w-3xl mx-auto">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {uploadedFiles.map((f) => (
                        <motion.div
                          key={f.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px]
                            chat-msg-ai"
                        >
                          {f.status === 'uploading' ? (
                            <Loader2 size={12} className="animate-spin text-cyan-400/60" />
                          ) : f.status === 'done' ? (
                            <CheckCircle2 size={12} className="text-emerald-400/70" />
                          ) : (
                            <X size={12} className="text-red-400/70" />
                          )}
                          {f.type === 'pdf' ? <FileText size={12} className="text-white/30" /> : <Image size={12} className="text-white/30" />}
                          <span className="text-white/50 max-w-[150px] truncate">{f.name}</span>
                          {f.status === 'done' && <span className="text-white/20 text-[10px] font-mono">{f.chunks} chunks</span>}
                          <button onClick={() => removeUploadedFile(f.id)} className="text-white/20 hover:text-white/50 transition-colors ml-1">
                            <X size={11} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* PromptInputBox — only show when messages exist (not empty state) */}
              {!isChatEmpty && (
                <div className="pb-4 sm:pb-6 px-3 sm:px-4 relative z-20">
                  <div className="max-w-3xl mx-auto">
                    <PromptInputBoxDynamic
                      onSend={handlePromptSend}
                      isLoading={isLoading || isGeneratingPdf}
                      placeholder={isHypothesisChat ? "Describe the incident or ask about a hypothesis..." : "Ask about the evidence..."}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

      {/* Evidence Board in chat state — collapsible */}
      {!isHome && (
        <div className="fixed bottom-24 right-3 sm:right-6 z-30">
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
            className="fixed bottom-36 right-3 sm:right-6 z-20 max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-2rem)]"
            style={{ width: 480 }}
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
        localReports={savedReports}
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

      {/* About Modal */}
      <AnimatePresence>
        {showAbout && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAbout(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a1a1e] text-white shadow-2xl overflow-hidden"
            >
              <div className="p-6 sm:p-8">
                <button
                  onClick={() => setShowAbout(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 transition-colors"
                >
                  <X size={18} className="text-white/50" />
                </button>

                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <Fingerprint size={22} className="text-emerald-400" />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">Evidence.AI</h2>
                </div>

                <div className="space-y-3 text-[14px] leading-relaxed text-white/70">
                  <p>
                    <strong className="text-white/90">Evidence.AI</strong> is an AI-powered forensic analysis platform that combines
                    Retrieval-Augmented Generation (RAG) with multimodal intelligence to assist in criminal investigation workflows.
                  </p>
                  <p>
                    Upload crime scene images, forensic PDFs, and evidence documents — the AI analyzes, cross-references,
                    and generates detailed forensic reports. Features include intelligent case isolation, timeline reconstruction,
                    hypothesis generation using ACH methodology, and a specialized forensic chatbot.
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-white/10">
                  <h3 className="text-sm font-semibold text-white/90 mb-3">Connect with Madhav</h3>
                  <div className="space-y-2 text-[13px]">
                    <div className="flex items-center gap-3 text-white/60">
                      <span className="text-white/30">📞</span>
                      <span>9813569096</span>
                    </div>
                    <div className="flex items-center gap-3 text-white/60">
                      <span className="text-white/30">📧</span>
                      <a href="mailto:madhavkalra2005@gmail.com" className="hover:text-emerald-400 transition-colors">
                        madhavkalra2005@gmail.com
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </main>
    </>
  );
}
