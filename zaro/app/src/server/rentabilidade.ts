// Custos e rentabilidade do Comercial: custo por pedido (contas a pagar vinculadas ao pedido + custo do
// cadastro dos itens), rentabilidade por cliente e produto, e orçado (orçamento) × realizado (faturado e custo).
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { rotuloDoc } from '@/domain/comercial';
import { arred, brl } from '@/domain/dinheiro';
import { margem } from '@/domain/precos';
import { type ItemVendido, produtosVendidos, separarCodigo, limparDescServico } from '@/domain/produtos-vendidos';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { notasDeVenda } from './produtos-vendidos';

export const normPedido = (p: unknown) => String(p || '').trim().replace(/^0+(?=\d+$)/, '');
const ativo = (t: { status: string; retorno: boolean }) => !t.retorno && !/cancel|retorno/i.test(t.status);

/** Custo do cadastro por código do produto ou nome (maiúsculo). */
async function custosDoCadastro(db: Db, empresaId: string) {
  const cat = await db.select({ nome: schema.catalogo.nome, custo: schema.catalogo.custo }).from(schema.catalogo).where(eq(schema.catalogo.empresaId, empresaId));
  const m = new Map<string, number>();
  for (const c of cat) {
    if (!(Number(c.custo) > 0)) continue;
    const { codigo, nome } = separarCodigo(c.nome);
    if (codigo) m.set(codigo, Number(c.custo));
    m.set(nome.toUpperCase(), Number(c.custo));
  }
  return m;
}

function custoEstimado(itens: ItemVendido[], servico: boolean, custos: Map<string, number>) {
  let total = 0;
  for (const i of itens) {
    const { codigo, nome } = separarCodigo(servico ? limparDescServico(i.desc) : i.desc);
    const c = (codigo && custos.get(codigo)) || custos.get(nome.toUpperCase());
    if (c == null) return null; // sem custo de algum item, não estima
    total += c * i.qtd;
  }
  return arred(total);
}

export async function custosEPedidos(db: Db, empresaId: string) {
  const [tits, docs, custos] = await Promise.all([
    db.select().from(schema.titulos).where(eq(schema.titulos.empresaId, empresaId)),
    db.select().from(schema.docsComerciais).where(and(eq(schema.docsComerciais.empresaId, empresaId), inArray(schema.docsComerciais.tipo, ['orcamento', 'pedido']))),
    custosDoCadastro(db, empresaId),
  ]);
  const orcamentos = new Map(docs.filter((d) => d.tipo === 'orcamento').map((d) => [d.id, d]));
  const orcadoDoPedido = new Map<string, { rotulo: string; total: number; custo: number | null }>();
  for (const p of docs.filter((d) => d.tipo === 'pedido')) {
    const o = p.origemId ? orcamentos.get(p.origemId) : undefined;
    if (!o) continue;
    const custo = o.itens.every((i) => i.custo != null && i.custo > 0) ? arred(o.itens.reduce((a, i) => a + i.qtd * (i.custo || 0), 0)) : null;
    orcadoDoPedido.set(normPedido(p.referencia || rotuloDoc('pedido', p.numero)), { rotulo: rotuloDoc('orcamento', o.numero), total: o.total, custo });
  }
  // custo lançado: contas a pagar vinculadas ao pedido
  const custoLancado = new Map<string, { total: number; titulos: { id: string; codigo: string; nome: string; valor: number }[] }>();
  for (const t of tits.filter((x) => x.tipo === 'pagar' && ativo(x))) {
    const k = normPedido((t.dados as { pedido?: string }).pedido);
    if (!k) continue;
    const g = custoLancado.get(k) || { total: 0, titulos: [] };
    g.total = arred(g.total + t.valor);
    g.titulos.push({ id: t.id, codigo: t.codigo, nome: t.nome, valor: t.valor });
    custoLancado.set(k, g);
  }
  // pedidos pelas notas de venda (cada NF conta uma vez, mesmo com várias parcelas)
  const { notas } = await notasDeVenda(db, empresaId);
  const porChave = new Map<string, { pedido: string; cliente: string; nfs: string[]; faturado: number; liquido: number; itens: { itens: ItemVendido[]; servico: boolean }[]; semItens: boolean; primeira: string }>();
  const vistos = new Set<string>();
  for (const t of tits.filter((x) => x.tipo === 'receber' && ativo(x) && x.nf)) {
    const chaveNf = t.nfChave || `NF ${t.nf}`;
    const d = t.dados as { pedido?: string; nfEmissao?: string; nfCancelada?: boolean };
    if (d.nfCancelada) continue;
    const pedido = normPedido(d.pedido) || `sem pedido · NF ${t.nf}`;
    const k = `${t.docParceiro || t.nome}|${pedido}`;
    const g = porChave.get(k) || { pedido, cliente: t.nome, nfs: [], faturado: 0, liquido: 0, itens: [], semItens: false, primeira: d.nfEmissao || '' };
    g.liquido = arred(g.liquido + t.valor);
    if (!vistos.has(chaveNf)) {
      vistos.add(chaveNf);
      g.nfs.push(t.nf!);
      g.faturado = arred(g.faturado + (t.valorFiscal ?? t.valor));
      const n = notas.find((x) => x.chave === chaveNf);
      if (n) g.itens.push({ itens: n.itens, servico: /NFS/i.test(n.tipo) });
      else g.semItens = true;
    }
    if (d.nfEmissao && (!g.primeira || d.nfEmissao < g.primeira)) g.primeira = d.nfEmissao;
    porChave.set(k, g);
  }
  const pedidos = [...porChave.values()].map((g) => {
    const est = g.semItens ? null : g.itens.reduce<number | null>((a, x) => { const c = custoEstimado(x.itens, x.servico, custos); return a == null || c == null ? null : arred(a + c); }, 0);
    const lanc = g.pedido.startsWith('sem pedido') ? undefined : custoLancado.get(g.pedido);
    const custo = lanc ? lanc.total : est;
    return {
      ...g, custoLancado: lanc?.total ?? null, titulosCusto: lanc?.titulos || [], custoEstimado: est, custo, lucro: custo == null ? null : arred(g.faturado - custo), margem: margem(g.faturado, custo),
      orcado: orcadoDoPedido.get(g.pedido) || null,
    };
  }).sort((a, b) => (b.primeira || '').localeCompare(a.primeira || ''));
  // por cliente
  const clientes = new Map<string, { cliente: string; faturado: number; custo: number; semCusto: number; pedidos: number }>();
  for (const p of pedidos) {
    const c = clientes.get(p.cliente) || { cliente: p.cliente, faturado: 0, custo: 0, semCusto: 0, pedidos: 0 };
    c.faturado = arred(c.faturado + p.faturado);
    c.pedidos += 1;
    if (p.custo == null) c.semCusto = arred(c.semCusto + p.faturado);
    else c.custo = arred(c.custo + p.custo);
    clientes.set(p.cliente, c);
  }
  // por produto: custo do cadastro × quantidade vendida
  const produtos = produtosVendidos(notas).map((p) => {
    const cu = (p.codigo && custos.get(p.codigo)) || custos.get(p.nome.toUpperCase()) || null;
    const custo = cu == null ? null : arred(cu * p.qtd);
    return { ...p, custoUnit: cu, custo, margem: margem(p.total, custo) };
  });
  const comCusto = pedidos.filter((p) => p.custo != null);
  return {
    pedidos, produtos,
    clientes: [...clientes.values()].map((c) => ({ ...c, margem: c.faturado - c.semCusto > 0 ? margem(c.faturado - c.semCusto, c.custo) : null })).sort((a, b) => b.faturado - a.faturado),
    resumo: { faturado: arred(pedidos.reduce((a, p) => a + p.faturado, 0)), comCusto: comCusto.length, semCusto: pedidos.length - comCusto.length, margemMedia: margem(comCusto.reduce((a, p) => a + p.faturado, 0), comCusto.reduce((a, p) => a + (p.custo || 0), 0)) },
    pagarAbertos: tits.filter((t) => t.tipo === 'pagar' && ativo(t) && !normPedido((t.dados as { pedido?: string }).pedido)).sort((a, b) => (b.venc || '').localeCompare(a.venc || '')).slice(0, 200).map((t) => ({ id: t.id, codigo: t.codigo, nome: t.nome, valor: t.valor, descricao: t.descricao })),
  };
}

/** Liga (ou desliga, com pedido vazio) uma conta a pagar a um pedido do cliente, para entrar no custo do pedido. */
export async function vincularCusto(db: Db, u: Usuario, emp: Empresa, tituloId: string, pedido: string) {
  const [t] = await db.select().from(schema.titulos).where(and(eq(schema.titulos.id, tituloId), eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'pagar')));
  if (!t) throw new Error('Conta a pagar não encontrada nesta empresa.');
  const p = normPedido(pedido);
  const dados = { ...(t.dados as Record<string, unknown>) };
  if (p) dados.pedido = p;
  else delete dados.pedido;
  await db.update(schema.titulos).set({ dados }).where(eq(schema.titulos.id, tituloId));
  await auditar(db, u, { empresaId: emp.id, acao: p ? 'Vinculou custo ao pedido' : 'Desvinculou custo do pedido', entidade: `${t.codigo} · ${t.nome}`, depois: p ? `pedido ${p} · ${brl(t.valor)}` : undefined });
  return p ? `${t.codigo} (${brl(t.valor)}) entrou no custo do pedido ${p}.` : `${t.codigo} saiu do custo do pedido.`;
}

/** Entradas e saídas de itens: compras recebidas e NFs de entrada (entradas), NFs de venda (saídas). */
export async function movimentacoes(db: Db, empresaId: string) {
  const [{ notas }, compras, docsEntrada] = await Promise.all([
    notasDeVenda(db, empresaId),
    db.select().from(schema.docsComerciais).where(and(eq(schema.docsComerciais.empresaId, empresaId), eq(schema.docsComerciais.tipo, 'compra'), eq(schema.docsComerciais.status, 'Recebido'))),
    db.select({ dados: schema.documentosEntrada.dados }).from(schema.documentosEntrada).where(and(eq(schema.documentosEntrada.empresaId, empresaId), eq(schema.documentosEntrada.status, 'Aprovado'))),
  ]);
  type Mov = { data: string; tipo: 'Entrada' | 'Saída'; documento: string; parceiro: string; item: string; qtd: number; valor: number };
  const mov: Mov[] = [];
  for (const n of notas) for (const i of n.itens) mov.push({ data: n.emissao, tipo: 'Saída', documento: `${n.tipo} ${n.nf}`, parceiro: n.cliente, item: /NFS/i.test(n.tipo) ? limparDescServico(i.desc) : i.desc, qtd: i.qtd, valor: i.total });
  for (const c of compras) for (const i of c.itens) mov.push({ data: String((c.dados as { recebidoEm?: string }).recebidoEm || c.data), tipo: 'Entrada', documento: `${rotuloDoc('compra', c.numero)}${(c.dados as { nf?: string }).nf ? ` · NF ${(c.dados as { nf?: string }).nf}` : ''}`, parceiro: c.parceiro || '', item: i.nome, qtd: i.qtd, valor: i.total });
  for (const d of docsEntrada) {
    const dd = d.dados as { nota?: { tipo: string; dados: { numero: string; emitNome: string; emissao: string }; itens: ItemVendido[] }; direcao?: string; retorno?: boolean };
    const n = dd.nota;
    if (!n || dd.direcao !== 'entrada' || dd.retorno || !n.itens?.length) continue;
    for (const i of n.itens) mov.push({ data: n.dados.emissao, tipo: 'Entrada', documento: `${n.tipo} ${n.dados.numero}`, parceiro: n.dados.emitNome, item: i.desc, qtd: i.qtd, valor: i.total });
  }
  return mov.sort((a, b) => b.data.localeCompare(a.data));
}
