// Saldo bancário efetivo: saldo inicial informado pelo contador (data e valor) mais os
// movimentos do extrato depois dessa data. Sem saldo inicial, não há saldo (nada é estimado).
import 'server-only';
import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { arred } from '@/domain/dinheiro';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';

export interface SaldoInicial {
  data: string;
  valor: number;
}

const chave = (empresaId: string) => `saldoBanco:${empresaId}`;

export async function saldoInicial(db: Db, tenantId: string, empresaId: string): Promise<SaldoInicial | null> {
  const [r] = await db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, tenantId), eq(schema.configuracoes.chave, chave(empresaId))));
  const v = r?.valor as SaldoInicial | undefined;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v.data) && Number.isFinite(v.valor) ? v : null;
}

export async function definirSaldoInicial(db: Db, u: Usuario, emp: Empresa, data: string, valor: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data do saldo.');
  if (!Number.isFinite(valor)) throw new Error('Informe o valor do saldo.');
  const antes = await saldoInicial(db, u.tenantId, emp.id);
  const novo: SaldoInicial = { data, valor: arred(valor) };
  await db
    .insert(schema.configuracoes)
    .values({ tenantId: u.tenantId, chave: chave(emp.id), valor: novo })
    .onConflictDoUpdate({ target: [schema.configuracoes.tenantId, schema.configuracoes.chave], set: { valor: novo, atualizadoEm: new Date() } });
  await auditar(db, u, { empresaId: emp.id, acao: 'Informou saldo bancário inicial', entidade: data, antes: antes ? JSON.stringify(antes) : undefined, depois: JSON.stringify(novo) });
}

/** Saldo numa data (hoje por padrão) e a data do último movimento do extrato considerado. */
export async function saldoBancario(db: Db, tenantId: string, empresaId: string) {
  const ini = await saldoInicial(db, tenantId, empresaId);
  if (!ini) return null;
  const movs = await db
    .select({ data: schema.extratoMovimentos.data, valor: schema.extratoMovimentos.valor })
    .from(schema.extratoMovimentos)
    .where(and(eq(schema.extratoMovimentos.empresaId, empresaId), gt(schema.extratoMovimentos.data, ini.data)));
  const em = (data: string) => (data < ini.data ? null : arred(ini.valor + movs.filter((m) => m.data <= data).reduce((a, m) => a + m.valor, 0)));
  const ultimo = movs.reduce((a, m) => (m.data > a ? m.data : a), ini.data);
  return { inicial: ini, em, ultimoMovimento: ultimo, atual: em('9999-12-31')! };
}
