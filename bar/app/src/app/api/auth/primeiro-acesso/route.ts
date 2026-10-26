import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db';
import { entrar } from '@/server/auth';
import { primeiroAcesso } from '@/server/cadastros';
import { ErroRegra } from '@/server/erros';
import { erro } from '@/server/http';

export async function POST(req: NextRequest) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) return erro('Envio inválido.', 415);
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    await primeiroAcesso(await getDb(), d);
    await entrar(String(d.usuario), String(d.senha));
    return NextResponse.json({ destino: '/admin' });
  } catch (e) {
    if (e instanceof ErroRegra) return erro(e.message, e.status);
    throw e;
  }
}
