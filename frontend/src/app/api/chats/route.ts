import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/chats — list all chats with message count
export async function GET() {
  try {
    const chats = await prisma.chat.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const result = chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      isHypothesisMode: chat.isHypothesisMode,
      createdAt: chat.createdAt.toISOString(),
      messages: chat.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources ? JSON.parse(m.sources) : undefined,
        contextChunks: m.contextChunks ? JSON.parse(m.contextChunks) : undefined,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch chats:', error);
    return NextResponse.json({ error: 'Failed to fetch chats' }, { status: 500 });
  }
}

// POST /api/chats — create or update a chat
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, title, messages, isHypothesisMode } = body;

    // Upsert: create if not found, update if exists
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

    // If messages provided, sync them
    if (messages && Array.isArray(messages)) {
      // Delete existing messages and recreate (simple sync)
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
  } catch (error) {
    console.error('Failed to save chat:', error);
    return NextResponse.json({ error: 'Failed to save chat' }, { status: 500 });
  }
}

// DELETE /api/chats — delete a chat
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await prisma.chat.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete chat:', error);
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
  }
}
