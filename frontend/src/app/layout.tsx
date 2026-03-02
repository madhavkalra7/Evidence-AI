import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Evidence.AI — Forensic Multimodal RAG Assistant',
  description: 'AI-powered forensic report analysis using Multimodal RAG pipeline with HuggingFace, FAISS, and Groq',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#07070d]">
        {children}
      </body>
    </html>
  )
}
