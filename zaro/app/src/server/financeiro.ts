// Baixas, ajustes e lançamentos manuais de títulos.
import 'server-only';
import { and, eq, like, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { arred, brl, dataBr } from '@/domain/dinheiro';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';

async function titulo(db: Db, emp: Empresa, id: string) {
  const [t] = await db.select().from(schema.titulos).where(and(eq(schema.titulos.id, id), eq(schema.titulos.empresaId, emp.id)));
  if (!t) throw new Error('Título não encontrado nesta empresa.');
  return t;
}

async function recalcularStatus(db: Db, tituloId: string) {
  const [t] = await db.select().from(schema.titulos).where(eq(schema.titulos.id, tituloId));
  if (!t || t.retorno || /cancel/i.test(t.status)) return t;
  const [{ pago }] = await db.select({ pago: sql<string>`coalesce(sum(${schema.baixas.valor}), 0)` }).from(schema.baixas).where(and(eq(schema.baixas.tituloId, tituloId), eq(schema.baixas.estornada, false)));
  const p = Number(pago);
  const quitado = t.tipo === 'pagar' ? 'Pago' : 'Recebido';
  const aberto = t.tipo === 'pagar' ? 'A pagar' : 'A receber';
  const status = p >= t.valor - 0.004 ? quitado : p > 0 ? 'Parcial' : aberto;
  await db.update(schema.titulos).set({ status }).where(eq(schema.titulos.id, tituloId));
  return { ...t, status };
}

export async function registrarBaixa(db: Db, u: Usuario, emp: Empresa, tituloId: string, data: string, valor: number, forma: string) {
  const t = await titulo(db, emp, tituloId);
  if (t.retorno || /cancel/i.test(t.status)) throw new Error('Título de retorno ou cancelado não recebe baixa.');
  if (!(valor > 0)) throw new Error('Informe o valor da baixa.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data da baixa.');
  await db.insert(schema.baixas).values({ tenantId: u.tenantId, tituloId, data, valor: arred(valor), forma: forma || null });
  const novo = await recalcularStatus(db, tituloId);
  await auditar(db, u, { empresaId: emp.id, acao: t.tipo === 'pagar' ? 'Registrou pagamento' : 'Registrou recebimento', entidade: `${t.codigo} · ${t.nome}`, antes: t.status, depois: `${novo?.status} · ${brl(valor)} em ${dataBr(data)}` });
}

export async function estornarBaixa(db: Db, u: Usuario, emp: Empresa, baixaId: string, motivo: string) {
  const [b] = await db.select({ b: schema.baixas, t: schema.titulos }).from(schema.baixas).innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId)).where(and(eq(schema.baixas.id, baixaId), eq(schema.titulos.empresaId, emp.id)));
  if (!b) throw new Error('Baixa não encontrada.');
  if (!motivo.trim()) throw new Error('Informe o motivo do estorno.');
  await db.update(schema.baixas).set({ estornada: true, obs: motivo }).where(eq(schema.baixas.id, baixaId));
  await recalcularStatus(db, b.t.id);
  await auditar(db, u, { empresaId: emp.id, acao: 'Estornou baixa', entidade: `${b.t.codigo} · ${b.t.nome}`, antes: brl(b.b.valor), justificativa: motivo });
}

export async function ajustarTitulo(db: Db, u: Usuario, emp: Empresa, tituloId: string, venc: string, valor: number) {
  const t = await titulo(db, emp, tituloId);
  await db.update(schema.titulos).set({ venc: venc || t.venc, valor: valor > 0 ? arred(valor) : t.valor, vencEstimado: false }).where(eq(schema.titulos.id, tituloId));
  await recalcularStatus(db, tituloId);
  await auditar(db, u, { empresaId: emp.id, acao: 'Revisou título', entidade: `${t.codigo} · ${t.nome}`, antes: `${dataBr(t.venc)} · ${brl(t.valor)}`, depois: `${dataBr(venc || t.venc)} · ${brl(valor > 0 ? valor : t.valor)}` });
}

export async function cancelarTitulo(db: Db, u: Usuario, emp: Empresa, tituloId: string, motivo: string) {
  if (!motivo.trim()) throw new Error('Informe o motivo do cancelamento.');
  const t = await titulo(db, emp, tituloId);
  await db.update(schema.titulos).set({ status: 'Cancelado', obs: [t.obs, `Cancelado: ${motivo}`].filter(Boolean).join(' · ') }).where(eq(schema.titulos.id, tituloId));
  await auditar(db, u, { empresaId: emp.id, acao: 'Cancelou título', entidade: `${t.codigo} · ${t.nome}`, antes: t.status, depois: 'Cancelado', justificativa: motivo });
}

/** Próximo código sequencial de título da empresa: CP-0001 (pagar) ou CR-0001 (receber). */
export async function proximoCodigo(db: Db, empresaId: string, tipo: 'pagar' | 'receber') {
  const prefixo = tipo === 'pagar' ? 'CP-' : 'CR-';
  const [r] = await db.select({ max: sql<number>`coalesce(max(cast(substring(${schema.titulos.codigo} from 4) as integer)), 0)` }).from(schema.titulos)
    .where(and(eq(schema.titulos.empresaId, empresaId), like(schema.titulos.codigo, `${prefixo}%`), sql`substring(${schema.titulos.codigo} from 4) ~ '^[0-9]+$'`));
  return `${prefixo}${String(Number(r?.max || 0) + 1).padStart(4, '0')}`;
}

export async function novoTitulo(db: Db, u: Usuario, emp: Empresa, v: { tipo: 'pagar' | 'receber'; nome: string; descricao: string; categoria: string; venc: string; valor: number; competencia: string }) {
  if (!v.nome.trim() || !(v.valor > 0) || !v.venc) throw new Error('Informe parceiro, valor e vencimento.');
  const codigo = await proximoCodigo(db, emp.id, v.tipo);
  await db.insert(schema.titulos).values({
    tenantId: u.tenantId, empresaId: emp.id, codigo, tipo: v.tipo, nome: v.nome.trim(), descricao: v.descricao || null, categoria: v.categoria || null,
    venc: v.venc, valor: arred(v.valor), status: v.tipo === 'pagar' ? 'A pagar' : 'A receber', competencia: v.competencia || v.venc.slice(0, 7), origem: 'manual',
  });
  await auditar(db, u, { empresaId: emp.id, acao: 'Lançou título manual', entidade: `${codigo} · ${v.nome}`, depois: `${brl(v.valor)} vence ${dataBr(v.venc)}` });
  return codigo;
}
