import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Lazy-init prisma — returns null if DB not configured
function getPrisma() {
  try {
    const url = process.env.DATABASE_URL || '';
    if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) return null;
    const { prisma } = require('@/lib/prisma');
    return prisma;
  } catch { return null; }
}

// GET /api/chats — list all chats
export async function GET() {
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json([]);

  try {
    const chats = await prisma.chat.findMany({
      orderBy: { createdAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    const result = chats.map((chat: any) => ({
      id: chat.id,
      title: chat.title,
      isHypothesisMode: chat.isHypothesisMode,
      createdAt: chat.createdAt.toISOString(),
      messages: chat.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources ? JSON.parse(m.sources) : undefined,
        contextChunks: m.contextChunks ? JSON.parse(m.contextChunks) : undefined,
      })),
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json([]);
  }
}

// POST /api/chats — create or update a chat
export async function POST(request: Request) {
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ success: false, reason: 'no-db' });

  try {
    const body = await request.json();
    const { id, title, messages, isHypothesisMode } = body;

    const chat = await prisma.chat.upsert({
      where: { id: id || '' },
      update: {
        title,
        isHypothesisMode: isHypothesisMode || false,
        updatedAt: new Date(),
      },
      create: {
        id,
        title,
        isHypothesisMode: isHypothesisMode || false,
      },
    });

    if (messages && Array.isArray(messages)) {
      await prisma.message.deleteMany({ where: { chatId: chat.id } });
      if (messages.length > 0) {
        await prisma.message.createMany({
          data: messages.map((m: any) => ({
            id: m.id,
            chatId: chat.id,
            role: m.role,
            content: m.content,
            sources: m.sources ? JSON.stringify(m.sources) : null,
            contextChunks: m.contextChunks ? JSON.stringify(m.contextChunks) : null,
          })),
        });
      }
    }

    return NextResponse.json({ success: true, chatId: chat.id });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}

// DELETE /api/chats — delete a chat
export async function DELETE(request: Request) {
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ success: false, reason: 'no-db' });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await prisma.chat.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
