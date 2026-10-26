// Registro de tudo o que acontece (rastreabilidade) e relógio da sincronização em tempo real:
// cada evento aumenta o id; as telas abertas recebem o novo número e recarregam o que mudou.
import { EventEmitter } from 'node:events';
import { sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';

const g = globalThis as unknown as { __barSinal?: EventEmitter };
export const sinal = (g.__barSinal ||= new EventEmitter().setMaxListeners(500));

export interface NovoEvento {
  tipo: string;
  descricao: string;
  pedidoId?: string;
  usuarioId?: string;
  dados?: unknown;
}

export async function registrar(db: Db, e: NovoEvento) {
  await db.insert(schema.eventos).values({ tipo: e.tipo, descricao: e.descricao, pedidoId: e.pedidoId, usuarioId: e.usuarioId, dados: e.dados ?? null });
}

/** Avise depois que a transação gravou: as telas no mesmo servidor atualizam na hora. */
export function avisar() {
  sinal.emit('mudou');
}

export async function versaoAtual(db: Db): Promise<number> {
  const r = await db.execute<{ v: string | number | null }>(sql`select max(id) as v from eventos`);
  const linhas = (Array.isArray(r) ? r : (r as unknown as { rows: { v: string | number | null }[] }).rows) as { v: string | number | null }[];
  return Number(linhas[0]?.v ?? 0);
}
