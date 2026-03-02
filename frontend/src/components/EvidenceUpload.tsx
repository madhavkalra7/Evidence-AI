'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Image, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { uploadPDF, uploadImage, type UploadResponse } from '@/lib/api';

/* ============================================================
   EVIDENCE UPLOAD — Sleek glassmorphism upload panel
   ============================================================ */

interface UploadResult {
  type: 'pdf' | 'scene_image' | 'evidence_image';
  filename: string;
  chunks: number;
  caption?: string;
  status: 'success' | 'error';
  message: string;
}

interface EvidenceUploadProps {
  onUploadComplete: () => void;
}

const uploadTypes = [
  { key: 'pdf', label: 'Report', icon: FileText, desc: 'Incident PDFs' },
  { key: 'scene_image', label: 'Scene', icon: Image, desc: 'Crime scene photos' },
  { key: 'evidence_image', label: 'Evidence', icon: Image, desc: 'Physical evidence' },
] as const;

export default function EvidenceUpload({ onUploadComplete }: EvidenceUploadProps) {
  const [uploads, setUploads] = useState<UploadResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadType, setUploadType] = useState<'pdf' | 'scene_image' | 'evidence_image'>('pdf');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsUploading(true);

    for (const file of acceptedFiles) {
      try {
        let result: UploadResponse;

        if (file.type === 'application/pdf') {
          result = await uploadPDF(file);
          setUploads((prev: UploadResult[]) => [...prev, {
            type: 'pdf',
            filename: file.name,
            chunks: result.chunks_created,
            status: 'success',
            message: `${result.pages_extracted} pages → ${result.chunks_created} chunks`
          }]);
        } else {
          result = await uploadImage(file, uploadType);
          setUploads((prev: UploadResult[]) => [...prev, {
            type: uploadType as 'scene_image' | 'evidence_image',
            filename: file.name,
            chunks: result.chunks_created,
            caption: result.caption,
            status: 'success',
            message: result.caption || 'Image processed'
          }]);
        }

        onUploadComplete();
      } catch (error: any) {
        setUploads((prev: UploadResult[]) => [...prev, {
          type: uploadType as 'pdf' | 'scene_image' | 'evidence_image',
          filename: file.name,
          chunks: 0,
          status: 'error',
          message: error?.response?.data?.detail || 'Upload failed'
        }]);
      }
    }

    setIsUploading(false);
  }, [uploadType, onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: 50 * 1024 * 1024,
  });

  const clearUploads = () => setUploads([]);

  return (
    <div className="space-y-5">
      {/* Type Selector */}
      <div className="grid grid-cols-3 gap-2">
        {uploadTypes.map(({ key, label, icon: Icon, desc }) => {
          const isActive = uploadType === key;
          return (
            <button
              key={key}
              onClick={() => setUploadType(key)}
              className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl text-center 
                transition-all duration-300 group
                ${isActive
                  ? 'bg-[#7c5cfc]/12 border border-[#7c5cfc]/30'
                  : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1]'
                }`}
            >
              <Icon
                size={18}
                className={`transition-colors duration-300 ${isActive ? 'text-[#a78bfa]' : 'text-white/30 group-hover:text-white/50'}`}
              />
              <span className={`text-[11px] font-medium transition-colors duration-300
                ${isActive ? 'text-[#a78bfa]' : 'text-white/40 group-hover:text-white/60'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`relative group cursor-pointer rounded-xl border-2 border-dashed p-8
          transition-all duration-300
          ${isDragActive
            ? 'border-[#7c5cfc]/60 bg-[#7c5cfc]/8'
            : 'border-white/[0.08] hover:border-[#7c5cfc]/30 bg-white/[0.02] hover:bg-white/[0.04]'
          }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          {isUploading ? (
            <div className="w-12 h-12 rounded-2xl bg-[#7c5cfc]/10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-[#7c5cfc] animate-spin" />
            </div>
          ) : (
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300
              ${isDragActive
                ? 'bg-[#7c5cfc]/15 scale-110'
                : 'bg-white/[0.04] group-hover:bg-[#7c5cfc]/10'}`}
            >
              <Upload className={`w-5 h-5 transition-colors duration-300
                ${isDragActive ? 'text-[#7c5cfc]' : 'text-white/25 group-hover:text-[#7c5cfc]/60'}`}
              />
            </div>
          )}
          <div className="text-center">
            <p className={`text-sm font-medium transition-colors duration-300
              ${isDragActive ? 'text-[#a78bfa]' : 'text-white/50'}`}>
              {isDragActive
                ? 'Drop to analyze'
                : isUploading
                  ? 'Processing through RAG pipeline...'
                  : 'Drop files or click to browse'}
            </p>
            <p className="text-[11px] text-white/25 mt-1">
              PDF, JPG, PNG — Max 50MB
            </p>
          </div>
        </div>
      </div>

      {/* Upload Results */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/30 font-medium uppercase tracking-wider">
              Processed Files
            </span>
            <button
              onClick={clearUploads}
              className="text-[10px] text-white/25 hover:text-white/50 transition-colors"
            >
              Clear all
            </button>
          </div>

          <AnimatePresence>
            {uploads.map((upload, i) => (
              <motion.div
                key={`${upload.filename}-${i}`}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`p-3 rounded-xl text-xs transition-all duration-300
                  ${upload.status === 'success'
                    ? 'bg-emerald-500/[0.06] border border-emerald-500/[0.12]'
                    : 'bg-red-500/[0.06] border border-red-500/[0.12]'
                  }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5
                    ${upload.status === 'success' ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                    {upload.status === 'success'
                      ? <CheckCircle size={13} className="text-emerald-400" />
                      : <AlertCircle size={13} className="text-red-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white/80 truncate">{upload.filename}</p>
                    <p className="text-white/35 mt-0.5 text-[11px]">{upload.message}</p>
                  </div>
                  {upload.chunks > 0 && (
                    <span className="text-[10px] text-[#a78bfa] font-mono bg-[#7c5cfc]/10 px-1.5 py-0.5 rounded-md flex-shrink-0">
                      {upload.chunks} chunks
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
