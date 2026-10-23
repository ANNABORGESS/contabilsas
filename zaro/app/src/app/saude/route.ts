// Verificação rápida: o sistema está no ar e falando com o banco?
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, banco: process.env.DATABASE_URL ? 'nuvem' : 'local' });
  } catch (e) {
    // mostra só o tipo do erro, nunca a URL ou a senha do banco
    const err = e as { code?: string; message?: string };
    return Response.json({ ok: false, erro: err.code || String(err.message || 'erro').slice(0, 120).replace(/postgres(ql)?:\/\/\S+/g, '[url]') }, { status: 503 });
  }
}
