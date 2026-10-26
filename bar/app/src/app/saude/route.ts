// Diagnóstico da publicação: diz se o banco conecta e, se não, o motivo (sem expor senha).
import { NextResponse } from 'next/server';
import { getDb, urlDoBanco } from '@/db';
import { versaoAtual } from '@/server/eventos';

export const dynamic = 'force-dynamic';

export async function GET() {
  const temUrl = !!process.env.DATABASE_URL;
  // mostra só o servidor e o usuário do endereço, nunca a senha
  let servidor: string | null = null;
  try {
    const u = urlDoBanco();
    if (u) servidor = `${new URL(u).username}@${new URL(u).host}`;
  } catch {}
  try {
    const db = await getDb();
    await versaoAtual(db);
    return NextResponse.json({ ok: true, banco: 'conectado' });
  } catch (e) {
    const msg = (e as Error).message?.replace(/postgres(ql)?:\/\/[^\s]+/g, '[endereço do banco]') || String(e);
    return NextResponse.json({ ok: false, temDatabaseUrl: temUrl, servidor, erro: msg }, { status: 500 });
  }
}
