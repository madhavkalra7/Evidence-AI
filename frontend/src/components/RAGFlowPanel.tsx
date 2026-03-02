'use client';

import { motion } from 'framer-motion';
import { Activity, Database, Cpu, Eye, FileText, Image, Zap } from 'lucide-react';

/* ============================================================
   RAG FLOW VISUALIZATION PANEL
   ============================================================
   Shows the live RAG pipeline steps visually:
   1. Document Upload
   2. Text Extraction / Image Captioning
   3. Chunking
   4. Embedding Generation
   5. FAISS Vector Storage
   6. Query Embedding
   7. Similarity Search
   8. Context Injection
   9. LLM Generation
   ============================================================ */

interface RAGFlowProps {
  totalChunks: number;
  sources: string[];
}

const pipelineSteps = [
  {
    icon: FileText,
    label: 'Document Input',
    description: 'PDF / Image uploaded',
    color: '#00d4ff',
  },
  {
    icon: Eye,
    label: 'Extraction',
    description: 'PyPDF text / BLIP caption',
    color: '#00d4ff',
  },
  {
    icon: Activity,
    label: 'Chunking',
    description: '500 char overlapping chunks',
    color: '#ffaa00',
  },
  {
    icon: Cpu,
    label: 'Embedding',
    description: 'all-MiniLM-L6-v2 → 384D vectors',
    color: '#ffaa00',
  },
  {
    icon: Database,
    label: 'FAISS Index',
    description: 'Vector similarity search',
    color: '#00ff88',
  },
  {
    icon: Zap,
    label: 'Groq LLM',
    description: 'Llama3-8B generation',
    color: '#ff0040',
  },
];

export default function RAGFlowPanel({ totalChunks, sources }: RAGFlowProps) {
  return (
    <div className="space-y-4">
      {/* Pipeline Steps */}
      <div className="space-y-1">
        {pipelineSteps.map((step, i) => (
          <motion.div
            key={step.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
          >
            {/* Step icon with glow */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: `${step.color}15`,
                border: `1px solid ${step.color}30`,
              }}
            >
              <step.icon size={14} style={{ color: step.color }} />
            </div>

            {/* Step info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono font-semibold text-white/80">{step.label}</p>
              <p className="text-[10px] font-mono text-white/40 truncate">{step.description}</p>
            </div>

            {/* Connector line */}
            {i < pipelineSteps.length - 1 && (
              <div className="absolute left-[27px] mt-10 w-0.5 h-2" style={{ backgroundColor: `${step.color}30` }} />
            )}
          </motion.div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <p className="text-[10px] font-mono text-white/40 uppercase">Total Chunks</p>
          <p className="text-lg font-mono font-bold text-neon-blue">{totalChunks}</p>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <p className="text-[10px] font-mono text-white/40 uppercase">Sources</p>
          <p className="text-lg font-mono font-bold text-neon-green">{sources.length}</p>
        </div>
      </div>

      {/* Source Types */}
      {sources.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-mono text-white/40 uppercase">Active Sources</p>
          {sources.map((source, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded bg-white/5">
              {source === 'pdf' ? (
                <FileText size={12} className="text-neon-blue" />
              ) : (
                <Image size={12} className="text-neon-red" />
              )}
              <span className="text-xs font-mono text-white/60">{source}</span>
            </div>
          ))}
        </div>
      )}

      {/* RAG Explanation */}
      <div className="p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/20">
        <p className="text-[10px] font-mono text-neon-blue/80 font-semibold mb-1">How RAG Works</p>
        <p className="text-[10px] font-mono text-white/40 leading-relaxed">
          Your question is converted to a vector → FAISS finds the most similar document chunks → 
          These chunks are injected into the LLM prompt as context → The LLM answers ONLY from this context.
        </p>
      </div>
    </div>
  );
}
