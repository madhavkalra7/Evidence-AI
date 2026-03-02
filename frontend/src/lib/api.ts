import axios from 'axios';

// Backend API base URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes timeout for model loading
});

// --- Types ---
export interface UploadResponse {
  message: string;
  filename: string;
  pages_extracted?: number;
  chunks_created: number;
  total_in_store: number;
  caption?: string;
  image_type?: string;
  text_preview?: string;
}

export interface ChatResponse {
  answer: string;
  model: string;
  sources: string[];
  context_chunks: {
    text: string;
    type: string;
    page: number;
    score: number;
  }[];
}

export interface StatusResponse {
  status: string;
  vector_store: {
    total_chunks: number;
    index_size: number;
    dimension: number;
    sources: string[];
  };
}

// --- API Functions ---

export async function uploadPDF(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/api/upload/pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function uploadImage(file: File, imageType: string): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('image_type', imageType);

  const response = await api.post('/api/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function sendMessage(question: string): Promise<ChatResponse> {
  const response = await api.post('/api/chat', { question });
  return response.data;
}

export async function getStatus(): Promise<StatusResponse> {
  const response = await api.get('/api/status');
  return response.data;
}

export async function resetStore(): Promise<void> {
  await api.post('/api/reset');
}

// --- Scene Analysis Types ---
export interface SceneFinding {
  id: number;
  label: string;
  description: string;
  category: 'object' | 'damage' | 'evidence' | 'anomaly' | 'entry_point' | 'surface';
  severity: 'high' | 'medium' | 'low';
  position: { x: number; y: number };
}

export interface SceneConnection {
  from: number;
  to: number;
  label: string;
}

export interface SceneHoverWord {
  word: string;
  color: string;
}

export interface SceneAnalysis {
  summary: string;
  findings: SceneFinding[];
  connections: SceneConnection[];
  hover_words: SceneHoverWord[];
}

export interface SceneAnalysisResponse {
  filename: string;
  image_type: string;
  analysis: SceneAnalysis;
}

export async function sendHypothesisChat(
  message: string,
  history: { role: string; content: string }[],
  evidenceContext: string = ''
): Promise<ChatResponse> {
  const response = await api.post('/api/hypothesis/chat', { message, history, evidence_context: evidenceContext });
  return response.data;
}

export async function analyzeScene(
  caption: string,
  filename: string,
  imageType: string
): Promise<SceneAnalysisResponse> {
  const response = await api.post('/api/analyze/scene', {
    caption,
    filename,
    image_type: imageType,
  });
  return response.data;
}
