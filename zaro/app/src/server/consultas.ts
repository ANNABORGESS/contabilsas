// Consultas usadas por várias telas. Todas filtram pela empresa ativa.
import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';

export type Titulo = typeof schema.titulos.$inferSelect;

const ABERTO = sql`${schema.titulos.status} not ilike '%cancel%' and ${schema.titulos.status} not ilike '%pago%' and ${schema.titulos.status} not ilike '%recebido%' and ${schema.titulos.status} not ilike '%quitad%' and ${schema.titulos.retorno} = false`;

/** Soma das baixas de cada título. */
export async function pagosPorTitulo(db: Db, empresaId: string) {
  const r = await db
    .select({ id: schema.baixas.tituloId, total: sql<string>`sum(${schema.baixas.valor})` })
    .from(schema.baixas)
    .innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId))
    .where(and(eq(schema.titulos.empresaId, empresaId), eq(schema.baixas.estornada, false)))
    .groupBy(schema.baixas.tituloId);
  return new Map(r.map((x) => [x.id, Number(x.total)]));
}

export async function resumoFinanceiro(db: Db, empresaId: string, hoje: string) {
  const linhas = await db
    .select({ tipo: schema.titulos.tipo, venc: schema.titulos.venc, valor: schema.titulos.valor })
    .from(schema.titulos)
    .where(and(eq(schema.titulos.empresaId, empresaId), ABERTO));
  const pega = (tipo: string, vencido?: boolean) =>
    linhas
      .filter((l) => l.tipo === tipo && (vencido === undefined || (!!l.venc && l.venc < hoje) === vencido))
      .reduce((a, l) => ({ n: a.n + 1, total: a.total + Number(l.valor) }), { n: 0, total: 0 });
  return {
    pagar: pega('pagar'),
    receber: pega('receber'),
    pagarVencido: pega('pagar', true),
    receberVencido: pega('receber', true),
  };
}

export async function titulosDaEmpresa(db: Db, empresaId: string, tipo: 'pagar' | 'receber') {
  return db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, empresaId), eq(schema.titulos.tipo, tipo))).orderBy(sql`${schema.titulos.venc} asc nulls last`, schema.titulos.codigo);
}

export async function auditoriaRecente(db: Db, tenantId: string, empresaId: string | null, limite = 8) {
  return db
    .select()
    .from(schema.auditoria)
    .where(empresaId ? and(eq(schema.auditoria.tenantId, tenantId), sql`(${schema.auditoria.empresaId} = ${empresaId} or ${schema.auditoria.empresaId} is null)`) : eq(schema.auditoria.tenantId, tenantId))
    .orderBy(desc(schema.auditoria.quando))
    .limit(limite);
}

export const ehAberto = (t: Pick<Titulo, 'status' | 'retorno'>) => !t.retorno && !/cancel|pago|recebido|quitad/i.test(t.status);
