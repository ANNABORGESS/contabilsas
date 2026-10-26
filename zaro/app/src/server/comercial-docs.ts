// Orçamentos, pedidos do cliente, solicitações e pedidos de compra (tabela docs_comerciais).
import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import type { ItemComercial } from '@/db/schema';
import { compararCotacoes, podeMudar, rotuloDoc, STATUS_INICIAL, totais, type Cotacao, type TipoDoc } from '@/domain/comercial';
import { arred, brl, dataBr, soDigitos } from '@/domain/dinheiro';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { lancarVenda } from './comercial';
import { proximoCodigo } from './financeiro';

export type DocComercial = typeof schema.docsComerciais.$inferSelect;

const NOME: Record<TipoDoc, string> = { orcamento: 'orçamento', pedido: 'pedido', solicitacao: 'solicitação de compra', compra: 'pedido de compra' };
const tipoParceiro = (tipo: TipoDoc) => (tipo === 'orcamento' || tipo === 'pedido' ? 'cliente' : 'fornecedor');
const ehData = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function docsDaEmpresa(db: Db, empresaId: string, tipos: TipoDoc[]) {
  return db.select().from(schema.docsComerciais).where(and(eq(schema.docsComerciais.empresaId, empresaId), inArray(schema.docsComerciais.tipo, tipos))).orderBy(desc(schema.docsComerciais.numero)).limit(300);
}

export async function docDaEmpresa(db: Db, empresaId: string, id: string) {
  const [d] = await db.select().from(schema.docsComerciais).where(and(eq(schema.docsComerciais.id, id), eq(schema.docsComerciais.empresaId, empresaId)));
  if (!d) throw new Error('Documento não encontrado nesta empresa.');
  return d;
}

/** Acha o parceiro pelo id, ou pelo CNPJ/nome digitado; cria se ainda não existir. */
async function parceiroDo(db: Db, u: Usuario, emp: Empresa, tipo: 'cliente' | 'fornecedor', v: { parceiroId?: string; nome?: string; doc?: string }) {
  if (v.parceiroId) {
    const [p] = await db.select().from(schema.parceiros).where(and(eq(schema.parceiros.id, v.parceiroId), eq(schema.parceiros.empresaId, emp.id)));
    if (!p) throw new Error(`${tipo === 'cliente' ? 'Cliente' : 'Fornecedor'} não encontrado nesta empresa.`);
    return p;
  }
  const nome = (v.nome || '').trim();
  if (!nome) return null;
  const doc = soDigitos(v.doc || '') || null;
  if (doc && doc.length !== 11 && doc.length !== 14) throw new Error('CPF/CNPJ incompleto.');
  const [existente] = await db.select().from(schema.parceiros).where(and(eq(schema.parceiros.empresaId, emp.id), eq(schema.parceiros.tipo, tipo), doc ? eq(schema.parceiros.doc, doc) : sql`lower(${schema.parceiros.razao}) = ${nome.toLowerCase()}`));
  if (existente) return existente;
  const [novo] = await db.insert(schema.parceiros).values({ tenantId: u.tenantId, empresaId: emp.id, tipo, doc, razao: nome, origem: 'Comercial' }).returning();
  return novo;
}

export interface ItemDigitado {
  catalogoId: string;
  nome: string;
  qtd: number;
  preco: number;
}

/** Monta os itens com nome, tipo, preço e custo do cadastro quando o item vem de lá. */
async function montarItens(db: Db, emp: Empresa, digitados: ItemDigitado[], exigePreco: boolean): Promise<ItemComercial[]> {
  const ids = digitados.map((i) => i.catalogoId).filter(Boolean);
  const cat = ids.length ? await db.select().from(schema.catalogo).where(and(eq(schema.catalogo.empresaId, emp.id), inArray(schema.catalogo.id, ids))) : [];
  const porId = new Map(cat.map((c) => [c.id, c]));
  const linhas = digitados
    .filter((i) => (i.catalogoId || i.nome.trim()) && i.qtd > 0)
    .map((i) => {
      const c = i.catalogoId ? porId.get(i.catalogoId) : undefined;
      if (i.catalogoId && !c) throw new Error('Um dos itens não é desta empresa.');
      return { catalogoId: c?.id || null, tipo: (c?.tipo || 'servico') as 'produto' | 'servico', nome: c?.nome || i.nome.trim(), qtd: i.qtd, preco: i.preco > 0 ? i.preco : Number(c?.preco || 0), custo: c?.custo != null ? Number(c.custo) : null };
    });
  if (!linhas.length) throw new Error('Inclua ao menos um item com quantidade.');
  if (exigePreco && linhas.some((l) => !(l.preco > 0))) throw new Error('Informe o preço dos itens sem preço cadastrado.');
  const t = totais(linhas);
  return linhas.map((l, k) => ({ ...l, total: t.itens[k] }));
}

async function proximoNumero(db: Db, empresaId: string, tipo: TipoDoc) {
  const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${schema.docsComerciais.numero}), 0)::int` }).from(schema.docsComerciais).where(and(eq(schema.docsComerciais.empresaId, empresaId), eq(schema.docsComerciais.tipo, tipo)));
  return Number(n) + 1;
}

export interface NovoDoc {
  data: string;
  prazo: string;
  parceiroId: string;
  novoParceiro: string;
  novoDoc: string;
  referencia: string;
  itens: ItemDigitado[];
  condicao: string;
  obs: string;
  dados?: Record<string, unknown>;
}

export async function criarDoc(db: Db, u: Usuario, emp: Empresa, tipo: TipoDoc, v: NovoDoc) {
  if (!ehData(v.data)) throw new Error('Informe a data.');
  if (v.prazo && !ehData(v.prazo)) throw new Error('Data de validade/entrega inválida.');
  const itens = await montarItens(db, emp, v.itens, tipo !== 'solicitacao');
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const p = await parceiroDo(t, u, emp, tipoParceiro(tipo), { parceiroId: v.parceiroId, nome: v.novoParceiro, doc: v.novoDoc });
    if (!p && tipo !== 'solicitacao') throw new Error(`Escolha o ${tipoParceiro(tipo)} ou digite o nome de um novo.`);
    const numero = await proximoNumero(t, emp.id, tipo);
    const total = arred(itens.reduce((a, i) => a + i.total, 0));
    const [doc] = await t.insert(schema.docsComerciais).values({
      tenantId: u.tenantId, empresaId: emp.id, tipo, numero, data: v.data, prazo: v.prazo || null, parceiroId: p?.id || null, parceiro: p?.razao || null, docParceiro: p?.doc || null,
      referencia: v.referencia.trim() || null, itens, total, condicao: v.condicao.trim() || null, status: STATUS_INICIAL[tipo], obs: v.obs.trim() || null, dados: v.dados || {},
    }).returning();
    await auditar(t, u, { empresaId: emp.id, acao: `Criou ${NOME[tipo]}`, entidade: `${rotuloDoc(tipo, numero)}${p ? ` · ${p.razao}` : ''}`, depois: brl(total) });
    return doc;
  });
}

export async function mudarStatus(db: Db, u: Usuario, emp: Empresa, id: string, para: string, motivo = '') {
  const d = await docDaEmpresa(db, emp.id, id);
  const tipo = d.tipo as TipoDoc;
  if (!podeMudar(tipo, d.status, para)) throw new Error(`Não dá para passar de "${d.status}" para "${para}".`);
  if (/Rejeit|Cancel|Ajuste/.test(para) && !motivo.trim()) throw new Error('Informe o motivo.');
  const hist = [...((d.dados.historico as unknown[]) || []), { de: d.status, para, em: new Date().toISOString(), por: u.nome, motivo: motivo.trim() || undefined }];
  await db.update(schema.docsComerciais).set({ status: para, dados: { ...d.dados, historico: hist } }).where(eq(schema.docsComerciais.id, id));
  await auditar(db, u, { empresaId: emp.id, acao: `${NOME[tipo][0].toUpperCase()}${NOME[tipo].slice(1)}: ${para.toLowerCase()}`, entidade: `${rotuloDoc(tipo, d.numero)}${d.parceiro ? ` · ${d.parceiro}` : ''}`, antes: d.status, depois: para, justificativa: motivo.trim() || undefined });
  return `${rotuloDoc(tipo, d.numero)}: ${para}.`;
}

/** Orçamento aprovado pelo cliente vira pedido (mesmos itens e valores). */
export async function converterEmPedido(db: Db, u: Usuario, emp: Empresa, id: string, prazo: string, referencia: string) {
  const o = await docDaEmpresa(db, emp.id, id);
  if (o.tipo !== 'orcamento') throw new Error('Só orçamento vira pedido.');
  if (!podeMudar('orcamento', o.status, 'Convertido')) throw new Error('Aprove o orçamento antes de converter em pedido.');
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const numero = await proximoNumero(t, emp.id, 'pedido');
    const [p] = await t.insert(schema.docsComerciais).values({
      tenantId: u.tenantId, empresaId: emp.id, tipo: 'pedido', numero, data: new Date().toISOString().slice(0, 10), prazo: prazo || null, parceiroId: o.parceiroId, parceiro: o.parceiro, docParceiro: o.docParceiro,
      referencia: referencia.trim() || o.referencia, itens: o.itens, total: o.total, condicao: o.condicao, status: STATUS_INICIAL.pedido, origemId: o.id, obs: o.obs, dados: {},
    }).returning();
    await t.update(schema.docsComerciais).set({ status: 'Convertido', dados: { ...o.dados, pedidoId: p.id } }).where(eq(schema.docsComerciais.id, o.id));
    await auditar(t, u, { empresaId: emp.id, acao: 'Converteu orçamento em pedido', entidade: `${rotuloDoc('orcamento', o.numero)} → ${rotuloDoc('pedido', numero)} · ${o.parceiro}`, depois: brl(o.total) });
    return `${rotuloDoc('orcamento', o.numero)} virou o pedido ${rotuloDoc('pedido', numero)}.`;
  });
}

/** Fatura o pedido: lança a venda (parcelas no Contas a Receber) ligada ao pedido. */
export async function faturarPedido(db: Db, u: Usuario, emp: Empresa, id: string, parcelas: number, primeiroVenc: string) {
  const p = await docDaEmpresa(db, emp.id, id);
  if (p.tipo !== 'pedido') throw new Error('Só pedido do cliente pode ser faturado.');
  if (!podeMudar('pedido', p.status, 'Faturado')) throw new Error(`Pedido ${p.status.toLowerCase()} não pode ser faturado.`);
  if (!p.parceiroId) throw new Error('O cliente deste pedido não está mais cadastrado.');
  const rotulo = rotuloDoc('pedido', p.numero);
  const msg = await lancarVenda(db, u, emp, {
    data: new Date().toISOString().slice(0, 10), parceiroId: p.parceiroId, novoCliente: '', novoDoc: '',
    itens: p.itens.map((i) => ({ catalogoId: i.catalogoId || '', nome: i.nome, qtd: i.qtd, preco: i.preco })), parcelas, primeiroVenc,
    obs: `Pedido ${rotulo}${p.referencia ? ` (pedido do cliente ${p.referencia})` : ''}`, pedido: { id: p.id, rotulo, referencia: p.referencia },
  });
  await mudarStatus(db, u, emp, id, 'Faturado');
  return `${rotulo} faturado. ${msg}`;
}

/** Faturado e recebido de cada pedido, pelos títulos que a venda do pedido gerou. */
export async function movimentoDosPedidos(db: Db, empresaId: string) {
  const tits = await db.select({ id: schema.titulos.id, pedido: sql<string>`${schema.titulos.dados}->>'pedidoDoc'`, valor: schema.titulos.valor, status: schema.titulos.status })
    .from(schema.titulos).where(and(eq(schema.titulos.empresaId, empresaId), sql`${schema.titulos.dados} ? 'pedidoDoc'`));
  const validos = tits.filter((t) => !/cancel/i.test(t.status));
  const baixas = validos.length ? await db.select({ tituloId: schema.baixas.tituloId, valor: schema.baixas.valor }).from(schema.baixas).where(and(inArray(schema.baixas.tituloId, validos.map((t) => t.id)), eq(schema.baixas.estornada, false))) : [];
  const rec = new Map<string, number>();
  for (const b of baixas) rec.set(b.tituloId, (rec.get(b.tituloId) || 0) + b.valor);
  const r = new Map<string, { faturado: number; recebido: number }>();
  for (const t of validos) {
    const m = r.get(t.pedido) || { faturado: 0, recebido: 0 };
    m.faturado += t.valor;
    m.recebido += /recebid/i.test(t.status) && !rec.has(t.id) ? t.valor : rec.get(t.id) || 0;
    r.set(t.pedido, m);
  }
  return r;
}

/** Pedidos que vieram nas NFs já emitidas (campo pedido), com o que foi recebido de cada título. */
export async function titulosComPedido(db: Db, empresaId: string) {
  const tits = await db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, empresaId), eq(schema.titulos.tipo, 'receber'), sql`coalesce(${schema.titulos.dados}->>'pedido', '') <> ''`, sql`not (${schema.titulos.dados} ? 'pedidoDoc')`));
  const baixas = tits.length ? await db.select({ tituloId: schema.baixas.tituloId, valor: schema.baixas.valor }).from(schema.baixas).where(and(inArray(schema.baixas.tituloId, tits.map((t) => t.id)), eq(schema.baixas.estornada, false))) : [];
  const rec = new Map<string, number>();
  for (const b of baixas) rec.set(b.tituloId, (rec.get(b.tituloId) || 0) + b.valor);
  return tits.map((t) => {
    const d = t.dados as { pedido?: string; nfEmissao?: string };
    return {
      nome: t.nome, docParceiro: t.docParceiro, nf: t.nf, pedido: String(d.pedido || ''), valor: t.valor, valorFiscal: t.valorFiscal, emissao: d.nfEmissao || t.competencia || null, status: t.status,
      recebido: /recebid/i.test(t.status) && !rec.has(t.id) ? t.valor : rec.get(t.id) || 0,
    };
  });
}

export async function salvarCotacoes(db: Db, u: Usuario, emp: Empresa, id: string, cotacoes: Cotacao[]) {
  const s = await docDaEmpresa(db, emp.id, id);
  if (s.tipo !== 'solicitacao') throw new Error('Cotação é feita na solicitação de compra.');
  if (['Pedido gerado', 'Rejeitada', 'Cancelada'].includes(s.status)) throw new Error(`Solicitação ${s.status.toLowerCase()}: cotação fechada.`);
  const qtd = s.itens[0]?.qtd || 1;
  const comparadas = compararCotacoes(cotacoes, qtd);
  if (!comparadas.length) throw new Error('Informe ao menos um fornecedor com preço unitário.');
  await db.update(schema.docsComerciais).set({ dados: { ...s.dados, cotacoes: comparadas.map(({ fornecedor, unitario, prazoDias, condicao }) => ({ fornecedor, unitario, prazoDias, condicao })) } }).where(eq(schema.docsComerciais.id, id));
  const melhor = comparadas.find((c) => c.recomendada)!;
  await auditar(db, u, { empresaId: emp.id, acao: 'Registrou cotação', entidade: `${rotuloDoc('solicitacao', s.numero)} · ${s.itens[0]?.nome || ''}`, depois: `${comparadas.length} fornecedor(es) · melhor: ${melhor.fornecedor} ${brl(melhor.total)}` });
  return `Cotação salva. Recomendado: ${melhor.fornecedor} (${brl(melhor.total)}).`;
}

/** Solicitação aprovada vira pedido de compra para o fornecedor escolhido (ou o recomendado da cotação). */
export async function gerarPedidoCompra(db: Db, u: Usuario, emp: Empresa, id: string, v: { fornecedor: string; unitario: number; prazo: string; condicao: string }) {
  const s = await docDaEmpresa(db, emp.id, id);
  if (s.tipo !== 'solicitacao') throw new Error('Pedido de compra sai de uma solicitação.');
  if (!podeMudar('solicitacao', s.status, 'Pedido gerado')) throw new Error('A solicitação precisa estar aprovada para gerar o pedido de compra.');
  const cots = (s.dados.cotacoes as Cotacao[] | undefined) || [];
  const item = s.itens[0];
  const rec = compararCotacoes(cots, item.qtd).find((c) => c.recomendada);
  const fornecedor = v.fornecedor.trim() || rec?.fornecedor || String(s.dados.fornecedorSugerido || '');
  const unitario = v.unitario > 0 ? v.unitario : cots.find((c) => c.fornecedor === fornecedor)?.unitario || rec?.unitario || item.preco;
  if (!fornecedor) throw new Error('Informe o fornecedor (ou registre a cotação).');
  if (!(unitario > 0)) throw new Error('Informe o preço unitário.');
  const condicao = v.condicao.trim() || cots.find((c) => c.fornecedor === fornecedor)?.condicao || '';
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const p = await parceiroDo(t, u, emp, 'fornecedor', { nome: fornecedor });
    const numero = await proximoNumero(t, emp.id, 'compra');
    const itens = [{ ...item, preco: unitario, total: arred(item.qtd * unitario) }];
    await t.insert(schema.docsComerciais).values({
      tenantId: u.tenantId, empresaId: emp.id, tipo: 'compra', numero, data: new Date().toISOString().slice(0, 10), prazo: v.prazo || null, parceiroId: p!.id, parceiro: p!.razao, docParceiro: p!.doc,
      itens, total: itens[0].total, condicao: condicao || null, status: STATUS_INICIAL.compra, origemId: s.id, obs: s.obs, dados: { centro: s.dados.centro || null },
    });
    await t.update(schema.docsComerciais).set({ status: 'Pedido gerado', dados: { ...s.dados, compra: rotuloDoc('compra', numero) } }).where(eq(schema.docsComerciais.id, s.id));
    await auditar(t, u, { empresaId: emp.id, acao: 'Gerou pedido de compra', entidade: `${rotuloDoc('solicitacao', s.numero)} → ${rotuloDoc('compra', numero)} · ${p!.razao}`, depois: brl(itens[0].total) });
    return `Pedido de compra ${rotuloDoc('compra', numero)} emitido para ${p!.razao}: ${brl(itens[0].total)}.`;
  });
}

/** Recebimento da compra: marca recebido e, se pedido, lança o título no Contas a Pagar. */
export async function receberCompra(db: Db, u: Usuario, emp: Empresa, id: string, v: { data: string; venc: string; nf: string; lancarTitulo: boolean }) {
  const c = await docDaEmpresa(db, emp.id, id);
  if (c.tipo !== 'compra') throw new Error('Só pedido de compra é recebido.');
  if (!podeMudar('compra', c.status, 'Recebido')) throw new Error(`Pedido de compra ${c.status.toLowerCase()}.`);
  if (!ehData(v.data)) throw new Error('Informe a data do recebimento.');
  if (v.lancarTitulo && !ehData(v.venc)) throw new Error('Informe o vencimento da conta a pagar.');
  const rotulo = rotuloDoc('compra', c.numero);
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    let codigo = '';
    if (v.lancarTitulo) {
      // item digitado sem cadastro conta como material; serviço só quando todos vêm do cadastro como serviço
      const servico = c.itens.every((i) => i.catalogoId && i.tipo === 'servico');
      codigo = await proximoCodigo(t, emp.id, 'pagar');
      await t.insert(schema.titulos).values({
        tenantId: u.tenantId, empresaId: emp.id, codigo, tipo: 'pagar', parceiroId: c.parceiroId, nome: c.parceiro || 'Fornecedor', docParceiro: c.docParceiro, nf: v.nf.trim() || null,
        descricao: `Compra ${rotulo} · ${c.itens.map((i) => `${i.qtd} × ${i.nome}`).join(', ')}`.slice(0, 300), parcela: '1/1', venc: v.venc, valor: c.total, status: 'A pagar',
        competencia: v.data.slice(0, 7), categoria: servico ? 'Serviço de terceiros' : 'Compra de material', centro: (c.dados.centro as string) || null,
        contaContabil: servico ? '4.1.3.06' : emp.semEstoque === false ? '1.1.3.01' : '4.1.1.01', origem: 'compra', dados: { compra: c.id, compraNumero: rotulo },
      });
    }
    await t.update(schema.docsComerciais).set({ status: 'Recebido', dados: { ...c.dados, recebidoEm: v.data, nf: v.nf.trim() || null, titulo: codigo || null } }).where(eq(schema.docsComerciais.id, id));
    await auditar(t, u, { empresaId: emp.id, acao: 'Recebeu pedido de compra', entidade: `${rotulo} · ${c.parceiro}`, depois: `${dataBr(v.data)}${v.nf ? ` · NF ${v.nf}` : ''}${codigo ? ` · ${codigo} vence ${dataBr(v.venc)}` : ' · sem título (NF virá pelo Autopilot)'}` });
    return `${rotulo} recebido${codigo ? `; ${codigo} lançado no Contas a Pagar (${brl(c.total)}, vence ${dataBr(v.venc)})` : ''}.`;
  });
}

export interface DadosParceiro {
  id?: string;
  tipo: 'cliente' | 'fornecedor';
  razao: string;
  fantasia: string;
  doc: string;
  categoria: string;
  email: string;
  telefone: string;
  contato: string;
  cidade: string;
  uf: string;
  obs: string;
}

/** Cadastro manual de cliente ou fornecedor (os da NF continuam sendo criados pelo Autopilot). */
export async function salvarParceiro(db: Db, u: Usuario, emp: Empresa, v: DadosParceiro) {
  const razao = v.razao.trim();
  if (!razao) throw new Error('Informe o nome ou razão social.');
  const doc = soDigitos(v.doc) || null;
  if (doc && doc.length !== 11 && doc.length !== 14) throw new Error('CPF precisa ter 11 dígitos e CNPJ 14.');
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) throw new Error('E-mail inválido.');
  if (doc) {
    const [dup] = await db.select({ id: schema.parceiros.id }).from(schema.parceiros).where(and(eq(schema.parceiros.empresaId, emp.id), eq(schema.parceiros.tipo, v.tipo), eq(schema.parceiros.doc, doc)));
    if (dup && dup.id !== v.id) throw new Error(`Já existe ${v.tipo} com este ${doc.length === 14 ? 'CNPJ' : 'CPF'}.`);
  }
  const contato = { email: v.email.trim(), telefone: v.telefone.trim(), contato: v.contato.trim(), cidade: v.cidade.trim(), uf: v.uf.trim().toUpperCase(), obs: v.obs.trim() };
  const campos = { razao, fantasia: v.fantasia.trim() || null, doc, categoria: v.categoria.trim() || null };
  const rotulo = v.tipo === 'cliente' ? 'cliente' : 'fornecedor';
  if (v.id) {
    const [antes] = await db.select().from(schema.parceiros).where(and(eq(schema.parceiros.id, v.id), eq(schema.parceiros.empresaId, emp.id)));
    if (!antes) throw new Error('Cadastro não encontrado nesta empresa.');
    await db.update(schema.parceiros).set({ ...campos, dados: { ...antes.dados, ...contato } }).where(eq(schema.parceiros.id, v.id));
    await auditar(db, u, { empresaId: emp.id, acao: `Alterou cadastro de ${rotulo}`, entidade: razao });
    return `Cadastro de ${razao} atualizado.`;
  }
  await db.insert(schema.parceiros).values({ tenantId: u.tenantId, empresaId: emp.id, tipo: v.tipo, ...campos, origem: 'Cadastro manual', dados: contato });
  await auditar(db, u, { empresaId: emp.id, acao: `Cadastrou ${rotulo}`, entidade: `${razao}${doc ? ` · ${doc}` : ''}` });
  return `${v.tipo === 'cliente' ? 'Cliente' : 'Fornecedor'} ${razao} cadastrado.`;
}
