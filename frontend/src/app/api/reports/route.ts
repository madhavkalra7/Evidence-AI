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

// GET /api/reports — list all saved reports
export async function GET() {
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json([]);

  try {
    const reports = await prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const result = reports.map((r: any) => ({
      id: r.id,
      fileName: r.fileName,
      fileType: r.fileType,
      imageUrl: r.imageUrl,
      thumbnailUrl: r.thumbnailUrl,
      caption: r.caption,
      chunks: r.chunks,
      caseId: r.caseId,
      analysis: r.analysis ? JSON.parse(r.analysis) : null,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json([]);
  }
}

// POST /api/reports — save a new report
export async function POST(request: Request) {
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ success: false, reason: 'no-db' });

  try {
    const body = await request.json();
    const { fileName, fileType, imageUrl, thumbnailUrl, caption, chunks, caseId, analysis } = body;

    const existing = await prisma.report.findFirst({ where: { fileName } });

    if (existing) {
      const updated = await prisma.report.update({
        where: { id: existing.id },
        data: {
          imageUrl: imageUrl || existing.imageUrl,
          thumbnailUrl: thumbnailUrl || existing.thumbnailUrl,
          caption: caption || existing.caption,
          chunks: chunks ?? existing.chunks,
          caseId: caseId || existing.caseId,
          analysis: analysis ? JSON.stringify(analysis) : existing.analysis,
        },
      });
      return NextResponse.json({ success: true, reportId: updated.id, updated: true });
    }

    const report = await prisma.report.create({
      data: {
        fileName,
        fileType,
        imageUrl,
        thumbnailUrl,
        caption,
        chunks: chunks || 0,
        caseId,
        analysis: analysis ? JSON.stringify(analysis) : null,
      },
    });

    return NextResponse.json({ success: true, reportId: report.id });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}

// DELETE /api/reports — delete a report
export async function DELETE(request: Request) {
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ success: false, reason: 'no-db' });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await prisma.report.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
