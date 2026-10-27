// Ajudantes das rotas da API: respostas JSON, erros com a mensagem certa e proteção contra
// envios de outros sites (só aceita JSON, que um formulário de outro site não consegue mandar).
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, type Db } from '@/db';
import type { Papel } from '@/domain/papeis';
import { ErroAcesso, exigir, type Usuario } from './auth';
import { ErroRegra } from './erros';
import { avisar } from './eventos';

export function erro(msg: string, status = 400) {
  return NextResponse.json({ erro: msg }, { status });
}

type Ctx = { db: Db; u: Usuario; req: NextRequest; corpo: Record<string, unknown> };

/** Rota protegida por papel. Escritas avisam as telas abertas para atualizarem. */
export function rota(papeis: Papel[], fn: (c: Ctx) => Promise<unknown>) {
  return async (req: NextRequest) => {
    let u: Usuario | null = null;
    try {
      const escrita = req.method !== 'GET';
      let corpo: Record<string, unknown> = {};
      if (escrita) {
        if (!(req.headers.get('content-type') || '').includes('application/json')) return erro('Envio inválido.', 415);
        corpo = ((await req.json().catch(() => ({}))) || {}) as Record<string, unknown>;
      }
      u = await exigir(...papeis);
      const db = await getDb();
      const r = await fn({ db, u: u!, req, corpo });
      if (escrita) avisar();
      return r instanceof Response ? r : NextResponse.json(r ?? { ok: true });
    } catch (e) {
      if (e instanceof ErroAcesso || e instanceof ErroRegra) return erro(e.message, e.status);
      console.error(e);
      // o administrador vê o motivo técnico, para poder mandar ao suporte
      const motivo = u?.papel === 'admin' && e instanceof Error ? ` (${e.message.replace(/postgres(ql)?:\/\/[^\s]+/g, '[banco]').slice(0, 300)})` : '';
      return erro(`Erro inesperado. Tente de novo.${motivo}`, 500);
    }
  };
}

/** Parâmetro de rota dinâmica ([id]). */
export function param(req: NextRequest, posicaoDoFim = 0) {
  const partes = req.nextUrl.pathname.split('/').filter(Boolean);
  return decodeURIComponent(partes[partes.length - 1 - posicaoDoFim] || '');
}
