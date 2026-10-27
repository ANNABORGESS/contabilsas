// Funcionário cria a própria conta (garçom, cozinha ou bar). Ela só entra depois da aprovação.
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db';
import { solicitarConta } from '@/server/cadastros';
import { ErroRegra } from '@/server/erros';
import { avisar } from '@/server/eventos';
import { erro } from '@/server/http';

export async function POST(req: NextRequest) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) return erro('Envio inválido.', 415);
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const conta = await solicitarConta(await getDb(), d);
    avisar();
    return NextResponse.json({ conta });
  } catch (e) {
    if (e instanceof ErroRegra) return erro(e.message, e.status);
    throw e;
  }
}
