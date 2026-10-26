// Tempo real: mantém a conexão aberta e manda o número da versão sempre que algo muda.
// Avisos do próprio servidor chegam na hora; a consulta ao banco a cada 2 s cobre o caso de
// vários servidores (nuvem). O navegador reconecta sozinho se a conexão cair.
import type { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { ErroAcesso, exigir } from '@/server/auth';
import { sinal, versaoAtual } from '@/server/eventos';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await exigir();
  } catch (e) {
    return new Response('', { status: e instanceof ErroAcesso ? e.status : 500 });
  }
  const db = await getDb();
  const enc = new TextEncoder();
  let fechar = () => {};
  const stream = new ReadableStream({
    async start(ctrl) {
      let ultima = -1;
      let ativo = true;
      const enviar = (s: string) => {
        try {
          ctrl.enqueue(enc.encode(s));
        } catch {
          fechar();
        }
      };
      const conferir = async () => {
        if (!ativo) return;
        try {
          const v = await versaoAtual(db);
          if (v !== ultima) {
            ultima = v;
            enviar(`data: ${v}\n\n`);
          }
        } catch {
          /* banco ocupado: tenta no próximo ciclo */
        }
      };
      const aoMudar = () => void conferir();
      sinal.on('mudou', aoMudar);
      const intervalo = setInterval(conferir, 2000);
      const pulso = setInterval(() => enviar(': pulso\n\n'), 15000);
      // encerra depois de alguns minutos (limite de funções na nuvem); o navegador reconecta
      const limite = setTimeout(() => fechar(), 4 * 60 * 1000);
      fechar = () => {
        if (!ativo) return;
        ativo = false;
        sinal.off('mudou', aoMudar);
        clearInterval(intervalo);
        clearInterval(pulso);
        clearTimeout(limite);
        try {
          ctrl.close();
        } catch {}
      };
      req.signal.addEventListener('abort', () => fechar());
      enviar('retry: 2000\n\n');
      await conferir();
    },
    cancel() {
      fechar();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
