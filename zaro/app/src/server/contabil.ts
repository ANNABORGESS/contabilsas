// Liga o motor contábil ao banco: carrega as operações da empresa ativa, aplica as decisões
// do contador e grava aprovações, ajustes de conta (com regra aprendida) e estornos.
import 'server-only';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { gerarLancamentos, type Lancamento, type StatusLanc } from '@/domain/motor';
import { rotuloConta } from '@/domain/plano-contas';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';

export async function lancamentosDaEmpresa(db: Db, emp: Empresa): Promise<Lancamento[]> {
  const [tits, bxs, imob, ctrs, decs, regras, extrato] = await Promise.all([
    db.select().from(schema.titulos).where(eq(schema.titulos.empresaId, emp.id)),
    db.select({ tituloId: schema.baixas.tituloId, data: schema.baixas.data, valor: schema.baixas.valor, estornada: schema.baixas.estornada })
      .from(schema.baixas).innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId)).where(eq(schema.titulos.empresaId, emp.id)),
    db.select().from(schema.imobilizado).where(eq(schema.imobilizado.empresaId, emp.id)),
    db.select().from(schema.contratosDivida).where(eq(schema.contratosDivida.empresaId, emp.id)),
    db.select().from(schema.lancamentoDecisoes).where(eq(schema.lancamentoDecisoes.empresaId, emp.id)),
    db.select().from(schema.regrasClassificacao).where(eq(schema.regrasClassificacao.empresaId, emp.id)),
    db.select({ id: schema.extratoMovimentos.id, conta: schema.extratoMovimentos.conta, data: schema.extratoMovimentos.data, valor: schema.extratoMovimentos.valor, memo: schema.extratoMovimentos.memo }).from(schema.extratoMovimentos).where(eq(schema.extratoMovimentos.empresaId, emp.id)),
  ]);
  const baixasPor = new Map<string, { data: string; valor: number; estornada: boolean }[]>();
  for (const b of bxs) baixasPor.set(b.tituloId, [...(baixasPor.get(b.tituloId) || []), b]);
  const status: Record<string, StatusLanc> = {};
  const contas: Record<string, string> = {};
  const estornos: Record<string, { motivo: string; data: string }> = {};
  for (const d of decs) {
    if (d.status) status[d.lancamentoId] = d.status as StatusLanc;
    if (d.conta) contas[d.lancamentoId] = d.conta;
    if (d.motivoEstorno) estornos[d.lancamentoId] = { motivo: d.motivoEstorno, data: d.dataEstorno || '' };
  }
  return gerarLancamentos({
    titulos: tits.map((t) => ({
      id: t.codigo, tipo: t.tipo as 'pagar' | 'receber', nome: t.nome, nf: t.nf, descricao: t.descricao, categoria: t.categoria, contaContabil: t.contaContabil,
      origem: t.origem, folhaTipo: t.folhaTipo, contrato: t.contrato, juros: t.juros, competencia: t.competencia, emissao: t.nfEmissao, venc: t.venc,
      valor: t.valor, status: t.status, retorno: t.retorno, impostos: t.impostos, baixas: baixasPor.get(t.id) || [],
    })),
    imobilizado: imob.map((a) => ({ id: a.id, descricao: a.descricao, qtd: a.qtd, valor: a.valor, data: a.data, taxa: a.taxa, residual: a.residual, origem: a.origem, nf: a.nf })),
    contratos: ctrs.map((c) => ({ id: c.id, instituicao: c.instituicao, contrato: c.contrato, tipo: c.tipo, valor: c.valor, dataContr: c.dataContr || '', status: c.status, natureza: c.natureza })),
    decisoes: { status, contas, estornos, regras: Object.fromEntries(regras.map((r) => [r.chave, r.conta])) },
    extrato,
    empresaNome: emp.razao,
  });
}

export async function mudarStatus(db: Db, u: Usuario, emp: Empresa, ids: string[], status: StatusLanc) {
  if (!ids.length) return;
  for (const id of ids) {
    await db.insert(schema.lancamentoDecisoes).values({ tenantId: u.tenantId, empresaId: emp.id, lancamentoId: id, status, usuario: u.nome })
      .onConflictDoUpdate({ target: [schema.lancamentoDecisoes.empresaId, schema.lancamentoDecisoes.lancamentoId], set: { status, usuario: u.nome, atualizadoEm: new Date() } });
  }
  await auditar(db, u, { empresaId: emp.id, acao: `Marcou lançamento(s) como ${status}`, entidade: `${ids.length} lançamento(s)`, depois: ids.slice(0, 20).join(', ') });
}

export async function ajustarConta(db: Db, u: Usuario, emp: Empresa, lanc: Lancamento, conta: string, aprenderRegra: boolean) {
  // em título a pagar e saída do extrato a conta ajustada é a de débito; em receber e entrada, a de crédito
  const antes = /Receber|entrada/.test(lanc.modulo) ? lanc.cred : lanc.deb;
  await db.insert(schema.lancamentoDecisoes).values({ tenantId: u.tenantId, empresaId: emp.id, lancamentoId: lanc.id, conta, status: 'Aprovado', usuario: u.nome })
    .onConflictDoUpdate({ target: [schema.lancamentoDecisoes.empresaId, schema.lancamentoDecisoes.lancamentoId], set: { conta, status: 'Aprovado', usuario: u.nome, atualizadoEm: new Date() } });
  if (aprenderRegra && lanc.chaveRegra) {
    await db.insert(schema.regrasClassificacao).values({ tenantId: u.tenantId, empresaId: emp.id, chave: lanc.chaveRegra, conta, usuario: u.nome })
      .onConflictDoUpdate({ target: [schema.regrasClassificacao.empresaId, schema.regrasClassificacao.chave], set: { conta, usuario: u.nome } });
  }
  await auditar(db, u, { empresaId: emp.id, acao: 'Ajustou conta de lançamento', entidade: lanc.hist, antes: rotuloConta(antes), depois: rotuloConta(conta), justificativa: aprenderRegra ? 'Regra aprendida para o parceiro' : undefined });
}

export async function estornar(db: Db, u: Usuario, emp: Empresa, id: string, motivo: string) {
  if (!motivo.trim()) throw new Error('Informe o motivo do estorno.');
  const hoje = new Date().toISOString().slice(0, 10);
  await db.insert(schema.lancamentoDecisoes).values({ tenantId: u.tenantId, empresaId: emp.id, lancamentoId: id, status: 'Estornado', motivoEstorno: motivo, dataEstorno: hoje, usuario: u.nome })
    .onConflictDoUpdate({ target: [schema.lancamentoDecisoes.empresaId, schema.lancamentoDecisoes.lancamentoId], set: { status: 'Estornado', motivoEstorno: motivo, dataEstorno: hoje, usuario: u.nome, atualizadoEm: new Date() } });
  await auditar(db, u, { empresaId: emp.id, acao: 'Estornou lançamento contábil', entidade: id, justificativa: motivo });
}

export async function regrasDaEmpresa(db: Db, emp: Empresa) {
  return db.select().from(schema.regrasClassificacao).where(eq(schema.regrasClassificacao.empresaId, emp.id));
}

