'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, Database, FileText, Image, Sparkles, ChevronDown, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { sendMessage, ChatResponse } from '@/lib/api';

/* ============================================================
   CHAT INTERFACE — Evidence.AI Premium Chat
   ============================================================ */

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  contextChunks?: {
    text: string;
    type: string;
    page: number;
    score: number;
  }[];
  timestamp: Date;
}

interface ChatInterfaceProps {
  totalChunks: number;
}

export default function ChatInterface({ totalChunks }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showContext, setShowContext] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response: ChatResponse = await sendMessage(userMessage.content);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        contextChunks: response.context_chunks,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error?.response?.data?.detail || 'Failed to get response. Make sure you have uploaded evidence first.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-xl bg-[#7c5cfc]/10 flex items-center justify-center">
            <MessageSquare size={15} className="text-[#7c5cfc]" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full" />
          </div>
          <div>
            <span className="text-sm font-semibold text-white/85">Evidence.AI Analyst</span>
            <p className="text-[10px] text-white/30">RAG-powered forensic analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
          <Database size={11} className="text-white/30" />
          <span className="text-[10px] text-white/35 font-medium">{totalChunks} indexed</span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.06] mx-4" />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-[#7c5cfc]/8 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-[#7c5cfc]/40" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-white/45">
                Upload evidence, then ask questions
              </p>
              <div className="flex flex-col gap-1.5">
                {[
                  'Summarize the incident report',
                  'What evidence was found at the scene?',
                  'Describe the timeline of events',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      if (totalChunks > 0) {
                        setInput(q);
                      }
                    }}
                    className="text-[11px] text-white/25 hover:text-[#a78bfa] transition-colors duration-300
                      px-3 py-1.5 rounded-lg hover:bg-[#7c5cfc]/5"
                  >
                    &quot;{q}&quot;
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 w-7 h-7 rounded-xl bg-[#7c5cfc]/12 flex items-center justify-center mt-1">
                  <Bot size={13} className="text-[#a78bfa]" />
                </div>
              )}

              <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-3.5 rounded-2xl text-[13px] leading-relaxed
                    ${msg.role === 'user'
                      ? 'bg-[#7c5cfc]/15 border border-[#7c5cfc]/20 text-white/90 rounded-br-md'
                      : 'bg-white/[0.04] border border-white/[0.06] text-white/80 rounded-bl-md'
                    }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.sources.map((source, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium
                          bg-amber-500/[0.08] border border-amber-500/[0.15] text-amber-400/70"
                      >
                        {source.includes('pdf') ? <FileText size={9} /> : <Image size={9} />}
                        {source}
                      </span>
                    ))}
                  </div>
                )}

                {/* RAG Context */}
                {msg.contextChunks && msg.contextChunks.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowContext(showContext === msg.id ? null : msg.id)}
                      className="flex items-center gap-1 text-[10px] text-white/25 hover:text-[#a78bfa]/60 transition-colors duration-300"
                    >
                      <ChevronDown
                        size={12}
                        className={`transition-transform duration-200 ${showContext === msg.id ? 'rotate-180' : ''}`}
                      />
                      RAG Context ({msg.contextChunks.length} chunks)
                    </button>

                    <AnimatePresence>
                      {showContext === msg.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mt-2 space-y-1.5 overflow-hidden"
                        >
                          {msg.contextChunks.map((chunk, i) => (
                            <div
                              key={i}
                              className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[11px]"
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-medium uppercase tracking-wider
                                  ${chunk.type === 'pdf'
                                    ? 'bg-blue-500/10 text-blue-400/70'
                                    : chunk.type === 'scene_image'
                                      ? 'bg-rose-500/10 text-rose-400/70'
                                      : 'bg-emerald-500/10 text-emerald-400/70'
                                  }`}
                                >
                                  {chunk.type}
                                </span>
                                {chunk.page > 0 && (
                                  <span className="text-white/20">p.{chunk.page}</span>
                                )}
                                <span className="text-[#a78bfa]/40 ml-auto font-mono text-[10px]">
                                  {chunk.score.toFixed(4)}
                                </span>
                              </div>
                              <p className="text-white/35 leading-relaxed">{chunk.text}</p>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="flex-shrink-0 w-7 h-7 rounded-xl bg-white/[0.06] flex items-center justify-center mt-1">
                  <User size={13} className="text-white/40" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-7 h-7 rounded-xl bg-[#7c5cfc]/12 flex items-center justify-center">
              <Bot size={13} className="text-[#a78bfa]" />
            </div>
            <div className="p-3.5 rounded-2xl rounded-bl-md bg-white/[0.04] border border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <Loader2 size={13} className="text-[#7c5cfc] animate-spin" />
                <span className="text-[11px] text-white/30">
                  Analyzing evidence...
                </span>
              </div>
              <div className="flex gap-1.5 mt-2">
                <div className="typing-dot w-1.5 h-1.5 bg-[#7c5cfc]/50 rounded-full" />
                <div className="typing-dot w-1.5 h-1.5 bg-[#7c5cfc]/50 rounded-full" />
                <div className="typing-dot w-1.5 h-1.5 bg-[#7c5cfc]/50 rounded-full" />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-4 pt-3">
        <div className="h-px bg-white/[0.06] mb-3" />
        <div className="flex gap-2.5 items-end">
          <div className="flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={totalChunks > 0
                ? 'Ask about the evidence...'
                : 'Upload evidence files first...'}
              disabled={totalChunks === 0}
              rows={1}
              className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm
                text-white/90 placeholder-white/20 resize-none
                focus:outline-none focus:border-[#7c5cfc]/30 focus:bg-white/[0.06]
                disabled:opacity-25 disabled:cursor-not-allowed
                transition-all duration-300"
              style={{ minHeight: '46px', maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || totalChunks === 0}
            className="p-3.5 rounded-xl bg-[#7c5cfc]/15 border border-[#7c5cfc]/25 text-[#a78bfa]
              hover:bg-[#7c5cfc]/25 hover:border-[#7c5cfc]/40
              disabled:opacity-20 disabled:cursor-not-allowed
              transition-all duration-300 active:scale-95"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
