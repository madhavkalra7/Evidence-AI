import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/reports — list all saved reports
export async function GET() {
  try {
    const reports = await prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const result = reports.map((r) => ({
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
  } catch (error) {
    console.error('Failed to fetch reports:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

// POST /api/reports — save a new report
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fileName, fileType, imageUrl, thumbnailUrl, caption, chunks, caseId, analysis } = body;

    // Check if report with same fileName already exists, update if so
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
  } catch (error) {
    console.error('Failed to save report:', error);
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
  }
}

// DELETE /api/reports — delete a report
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await prisma.report.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete report:', error);
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 });
  }
}
