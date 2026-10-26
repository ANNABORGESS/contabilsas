// Regras do Comercial: orçamento → pedido do cliente → faturamento, e solicitação → cotação → pedido de compra → recebimento.
import { arred } from './dinheiro';

/** Quantas linhas de item os formulários de orçamento e pedido mostram. */
export const LINHAS_DOC = 8;

export type TipoDoc = 'orcamento' | 'pedido' | 'solicitacao' | 'compra';

export const PREFIXO: Record<TipoDoc, string> = { orcamento: 'ORC', pedido: 'PED', solicitacao: 'SC', compra: 'OC' };
export const rotuloDoc = (tipo: TipoDoc, numero: number) => `${PREFIXO[tipo]}-${String(numero).padStart(4, '0')}`;

/** Status de cada documento e para onde ele pode ir. */
export const FLUXO: Record<TipoDoc, Record<string, string[]>> = {
  orcamento: { Rascunho: ['Enviado', 'Cancelado'], Enviado: ['Aprovado', 'Rejeitado', 'Cancelado'], Aprovado: ['Convertido', 'Cancelado'], Rejeitado: ['Rascunho'], Convertido: [], Cancelado: [] },
  pedido: { 'A faturar': ['Faturado', 'Cancelado'], Faturado: [], Cancelado: [] },
  solicitacao: { Rascunho: ['Em aprovação', 'Cancelada'], 'Em aprovação': ['Aprovada', 'Rejeitada', 'Ajuste solicitado'], 'Ajuste solicitado': ['Em aprovação', 'Cancelada'], Aprovada: ['Pedido gerado'], Rejeitada: [], 'Pedido gerado': [], Cancelada: [] },
  compra: { Emitido: ['Recebido', 'Cancelado'], Recebido: [], Cancelado: [] },
};

export const STATUS_INICIAL: Record<TipoDoc, string> = { orcamento: 'Rascunho', pedido: 'A faturar', solicitacao: 'Rascunho', compra: 'Emitido' };

export function podeMudar(tipo: TipoDoc, de: string, para: string) {
  return (FLUXO[tipo][de] || []).includes(para);
}

export interface Linha {
  qtd: number;
  preco: number;
  custo?: number | null;
}

/** Total por item e geral; margem só quando todos os itens têm custo. */
export function totais(linhas: Linha[]) {
  const itens = linhas.map((l) => arred(l.qtd * l.preco));
  const total = arred(itens.reduce((a, v) => a + v, 0));
  const comCusto = linhas.length > 0 && linhas.every((l) => l.custo != null && l.custo > 0);
  const custo = comCusto ? arred(linhas.reduce((a, l) => a + l.qtd * (l.custo || 0), 0)) : null;
  const margem = custo != null && total > 0 ? arred(((total - custo) / total) * 100) : null;
  return { itens, total, custo, margem };
}

export interface Cotacao {
  fornecedor: string;
  unitario: number;
  prazoDias: number | null;
  condicao: string;
}

/** Recomenda a cotação de menor total; empate pelo menor prazo de entrega. Até 3 fornecedores. */
export function compararCotacoes(cotacoes: Cotacao[], qtd: number) {
  const linhas = cotacoes.slice(0, 3).filter((c) => c.fornecedor.trim() && c.unitario > 0).map((c) => ({ ...c, total: arred(c.unitario * qtd) }));
  const ordem = [...linhas].sort((a, b) => a.total - b.total || (a.prazoDias ?? 999) - (b.prazoDias ?? 999));
  const melhor = ordem[0];
  return linhas.map((c) => ({
    ...c,
    recomendada: c === melhor,
    diferenca: melhor ? arred(c.total - melhor.total) : 0,
  }));
}

/** Situação do pedido do cliente: quanto já foi faturado, saldo e atraso de entrega. */
export function situacaoPedido(p: { total: number; prazo: string | null; status: string }, faturado: number, recebido: number, hoje: string) {
  const saldo = arred(Math.max(0, p.total - faturado));
  const atrasado = p.status !== 'Cancelado' && saldo > 0.004 && !!p.prazo && p.prazo < hoje;
  const proximo = p.status !== 'Cancelado' && saldo > 0.004 && !!p.prazo && p.prazo >= hoje && diasEntre(hoje, p.prazo) <= 7;
  return { faturado: arred(faturado), recebido: arred(recebido), saldo, atrasado, proximo };
}

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);

export interface TituloComPedido {
  nome: string;
  docParceiro: string | null;
  nf: string | null;
  pedido: string;
  valor: number;
  valorFiscal: number | null;
  recebido: number;
  emissao: string | null;
  status: string;
}

/** Pedidos que já vieram nas NFs emitidas (campo pedido do XML), agrupados por cliente e nº do pedido. */
export function pedidosDasNotas(titulos: TituloComPedido[]) {
  const mapa = new Map<string, { cliente: string; doc: string | null; pedido: string; nfs: Set<string>; faturado: number; liquido: number; recebido: number; primeira: string | null }>();
  for (const t of titulos) {
    if (!t.pedido.trim() || /cancel/i.test(t.status)) continue;
    const pedido = t.pedido.trim().replace(/^0+(?=\d)/, '');
    const chave = `${t.docParceiro || t.nome}|${pedido}`;
    const g = mapa.get(chave) || { cliente: t.nome, doc: t.docParceiro, pedido, nfs: new Set<string>(), faturado: 0, liquido: 0, recebido: 0, primeira: t.emissao };
    if (t.nf && !g.nfs.has(t.nf)) {
      g.nfs.add(t.nf);
    }
    g.faturado += t.valorFiscal ?? t.valor;
    g.liquido += t.valor;
    g.recebido += t.recebido;
    if (t.emissao && (!g.primeira || t.emissao < g.primeira)) g.primeira = t.emissao;
    mapa.set(chave, g);
  }
  return [...mapa.values()]
    .map((g) => ({ cliente: g.cliente, doc: g.doc, pedido: g.pedido, nfs: [...g.nfs], faturado: arred(g.faturado), liquido: arred(g.liquido), recebido: arred(g.recebido), aReceber: arred(Math.max(0, g.liquido - g.recebido)), primeira: g.primeira }))
    .sort((a, b) => (b.primeira || '').localeCompare(a.primeira || ''));
}

/** Etapas da compra para o funil da tela. */
export function etapasCompra(solicitacoes: { status: string }[], compras: { status: string }[]) {
  const n = (l: { status: string }[], s: string[]) => l.filter((x) => s.includes(x.status)).length;
  return [
    { nome: 'Solicitação', qtd: n(solicitacoes, ['Rascunho', 'Ajuste solicitado']) },
    { nome: 'Aprovação', qtd: n(solicitacoes, ['Em aprovação']) },
    { nome: 'Cotação / pedido', qtd: n(solicitacoes, ['Aprovada']) },
    { nome: 'Aguardando entrega', qtd: n(compras, ['Emitido']) },
    { nome: 'Recebido', qtd: n(compras, ['Recebido']) },
  ];
}
