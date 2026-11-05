// Estoque: só para os produtos em que o administrador ligou o controle (estoque preenchido).
// A venda baixa o estoque; o cancelamento (nada preparado ainda) devolve. O estorno não devolve,
// porque o produto já saiu (foi preparado ou entregue).

/** A partir desta quantidade o estoque aparece como baixo. */
export const ESTOQUE_BAIXO = 24;

export type SituacaoEstoque = 'sem-controle' | 'esgotado' | 'baixo' | 'ok';

export function situacaoEstoque(estoque: number | null | undefined): SituacaoEstoque {
  if (estoque === null || estoque === undefined) return 'sem-controle';
  if (estoque <= 0) return 'esgotado';
  if (estoque <= ESTOQUE_BAIXO) return 'baixo';
  return 'ok';
}

/**
 * Antes de cobrar: confere se há unidades para o pedido inteiro (somando todas as linhas do mesmo
 * produto, inclusive as dos baldes). Devolve a mensagem do primeiro que falta, ou null.
 */
export function faltaNoEstoque(linhas: { produtoId: string; nome: string; quantidade: number }[], estoques: Map<string, number | null>): string | null {
  const pedido = new Map<string, { nome: string; q: number }>();
  for (const l of linhas) {
    const atual = pedido.get(l.produtoId) || { nome: l.nome, q: 0 };
    atual.q += l.quantidade;
    pedido.set(l.produtoId, atual);
  }
  for (const [id, { nome, q }] of pedido) {
    const e = estoques.get(id);
    if (e === null || e === undefined) continue;
    if (e <= 0) return `${nome} está esgotado.`;
    if (q > e) return `Só ${e === 1 ? 'resta 1' : `restam ${e}`} de ${nome} no estoque.`;
  }
  return null;
}

/** Quantidade informada pelo administrador (entrada ou ajuste): inteiro de 0 a 100 mil. */
export function quantidadeEstoque(v: unknown, minimo = 0): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= minimo && n <= 100_000 ? n : null;
}
