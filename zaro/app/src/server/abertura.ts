// Balanço de abertura da empresa: saldos por conta numa data (ex.: 31/12/2025, do balanço registrado na Junta).
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { arred, brl } from '@/domain/dinheiro';
import { CONTA_ABERTURA, type AberturaMotor } from '@/domain/motor';
import { PLANO_PADRAO } from '@/domain/plano-contas';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';

const chave = (empresaId: string) => `abertura:${empresaId}`;

export async function aberturaDaEmpresa(db: Db, tenantId: string, empresaId: string): Promise<AberturaMotor | null> {
  const [r] = await db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, tenantId), eq(schema.configuracoes.chave, chave(empresaId))));
  const v = r?.valor as AberturaMotor | undefined;
  return v?.data && Array.isArray(v.contas) ? v : null;
}

/** Grava o balanço de abertura; só aceita contas do plano e débitos iguais aos créditos. */
export async function salvarAbertura(db: Db, u: Usuario, emp: Empresa, ab: AberturaMotor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ab.data)) throw new Error('Data do balanço de abertura inválida.');
  const contas = ab.contas.map((c) => ({ conta: c.conta, valor: arred(c.valor) })).filter((c) => Math.abs(c.valor) >= 0.005);
  const invalida = contas.find((c) => c.conta === CONTA_ABERTURA || !PLANO_PADRAO.some((p) => p.codigo === c.conta) || !/^[12]\./.test(c.conta));
  if (invalida) throw new Error(`A conta ${invalida.conta} não pode receber saldo de abertura (use contas de ativo, passivo ou PL do plano).`);
  const dif = arred(contas.reduce((a, c) => a + c.valor, 0));
  if (Math.abs(dif) >= 0.01) throw new Error(`O balanço não fecha: a diferença entre devedores e credores é ${brl(Math.abs(dif))}. Nada foi gravado.`);
  const valor = { data: ab.data, contas, fonte: ab.fonte || '' };
  await db.insert(schema.configuracoes).values({ tenantId: u.tenantId, chave: chave(emp.id), valor })
    .onConflictDoUpdate({ target: [schema.configuracoes.tenantId, schema.configuracoes.chave], set: { valor, atualizadoEm: new Date() } });
  await auditar(db, u, { empresaId: emp.id, acao: 'Gravou o balanço de abertura', entidade: `Saldos em ${ab.data}`, depois: `${contas.length} conta(s) · ${ab.fonte || ''}`.slice(0, 200) });
}
