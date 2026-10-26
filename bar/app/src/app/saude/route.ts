// Diagnóstico da publicação: diz se o banco conecta e, se não, o motivo (sem expor senha).
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { versaoAtual } from '@/server/eventos';

export const dynamic = 'force-dynamic';

export async function GET() {
  const temUrl = !!process.env.DATABASE_URL;
  try {
    const db = await getDb();
    await versaoAtual(db);
    return NextResponse.json({ ok: true, banco: 'conectado' });
  } catch (e) {
    const msg = (e as Error).message?.replace(/postgres(ql)?:\/\/[^\s]+/g, '[endereço do banco]') || String(e);
    return NextResponse.json({ ok: false, temDatabaseUrl: temUrl, erro: msg }, { status: 500 });
  }
}
