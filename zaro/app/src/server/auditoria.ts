// Toda ação relevante deixa rastro: quem, quando, o quê, antes, depois e justificativa.
import 'server-only';
import type { Db } from '@/db';
import { schema } from '@/db';
import type { Usuario } from './auth';

export interface Registro {
  acao: string;
  entidade?: string;
  antes?: string;
  depois?: string;
  justificativa?: string;
  empresaId?: string | null;
}

export async function auditar(db: Db, u: Usuario, r: Registro) {
  await db.insert(schema.auditoria).values({
    tenantId: u.tenantId,
    empresaId: r.empresaId ?? null,
    usuarioId: u.id,
    usuario: `${u.nome} · ${u.perfil}`,
    acao: r.acao,
    entidade: r.entidade,
    antes: r.antes,
    depois: r.depois,
    justificativa: r.justificativa,
  });
}
