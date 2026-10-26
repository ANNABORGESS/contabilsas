// Montagem do pedido pago. O celular manda produtos e quantidades; o total é sempre
// recalculado com o cardápio. Petiscos vão para a cozinha e bebidas para o bar.

export const SETORES = ['cozinha', 'bar'] as const;
export type Setor = (typeof SETORES)[number];
export const NOME_SETOR: Record<Setor, string> = { cozinha: 'Cozinha', bar: 'Bar' };

export const FORMAS_PAGAMENTO = ['credito', 'debito', 'pix', 'dinheiro'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];
export const NOME_FORMA: Record<FormaPagamento, string> = {
  credito: 'Crédito',
  debito: 'Débito',
  pix: 'Pix',
  dinheiro: 'Dinheiro',
};

export const MAX_QUANTIDADE = 99;

export interface ProdutoCardapio {
  id: string;
  nome: string;
  setor: Setor | string;
  precoCentavos: number;
  ativo: boolean;
}

export interface ItemSolicitado {
  produtoId: string;
  quantidade: number;
}

export interface LinhaPedido {
  produtoId: string;
  nome: string;
  setor: Setor;
  quantidade: number;
  precoCentavos: number;
  subtotalCentavos: number;
}

export interface PedidoMontado {
  linhas: LinhaPedido[];
  totalCentavos: number;
  setores: Setor[];
}

export class ErroPedido extends Error {}

export function ehSetor(s: unknown): s is Setor {
  return typeof s === 'string' && (SETORES as readonly string[]).includes(s);
}

export function ehFormaPagamento(f: unknown): f is FormaPagamento {
  return typeof f === 'string' && (FORMAS_PAGAMENTO as readonly string[]).includes(f);
}

/** Junta itens repetidos, valida quantidades e produtos e calcula subtotais e total. */
export function montarPedido(itens: ItemSolicitado[], cardapio: ProdutoCardapio[]): PedidoMontado {
  if (!Array.isArray(itens) || itens.length === 0) throw new ErroPedido('Adicione pelo menos um produto.');
  const porId = new Map(cardapio.map((p) => [p.id, p]));
  const qtd = new Map<string, number>();
  for (const it of itens) {
    if (!it || typeof it.produtoId !== 'string') throw new ErroPedido('Produto inválido.');
    if (!Number.isInteger(it.quantidade) || it.quantidade < 1) throw new ErroPedido('A quantidade deve ser um número inteiro maior que zero.');
    qtd.set(it.produtoId, (qtd.get(it.produtoId) || 0) + it.quantidade);
  }
  const linhas: LinhaPedido[] = [];
  for (const [produtoId, quantidade] of qtd) {
    const p = porId.get(produtoId);
    if (!p) throw new ErroPedido('Um dos produtos não existe mais no cardápio.');
    if (!p.ativo) throw new ErroPedido(`${p.nome} está indisponível.`);
    if (!ehSetor(p.setor)) throw new ErroPedido(`${p.nome} está sem setor de preparo.`);
    if (quantidade > MAX_QUANTIDADE) throw new ErroPedido(`Quantidade de ${p.nome} acima de ${MAX_QUANTIDADE}.`);
    linhas.push({ produtoId, nome: p.nome, setor: p.setor, quantidade, precoCentavos: p.precoCentavos, subtotalCentavos: p.precoCentavos * quantidade });
  }
  const totalCentavos = linhas.reduce((a, l) => a + l.subtotalCentavos, 0);
  if (totalCentavos <= 0) throw new ErroPedido('O total do pedido deve ser maior que zero.');
  const setores = SETORES.filter((s) => linhas.some((l) => l.setor === s));
  return { linhas, totalCentavos, setores };
}

/**
 * O garçom cobra na maquininha o total que viu na tela. Se o cardápio mudou entre a prévia e a
 * confirmação, o pedido é registrado com os preços cobrados (o dinheiro já entrou) e marcado
 * com divergência para o administrador conferir. Nunca se recusa um pagamento já recebido.
 */
export function aplicarPrecosCobrados(montado: PedidoMontado, cobrado: { produtoId: string; precoCentavos: number }[] | undefined, totalCobrado: number | undefined) {
  if (!cobrado || totalCobrado === undefined) return { ...montado, divergencia: false };
  const preco = new Map(cobrado.map((c) => [c.produtoId, c.precoCentavos]));
  const linhas = montado.linhas.map((l) => {
    const p = preco.get(l.produtoId);
    const precoCentavos = Number.isInteger(p) && p! >= 0 ? p! : l.precoCentavos;
    return { ...l, precoCentavos, subtotalCentavos: precoCentavos * l.quantidade };
  });
  const totalCentavos = linhas.reduce((a, l) => a + l.subtotalCentavos, 0);
  if (totalCentavos !== totalCobrado) throw new ErroPedido('O total cobrado não confere com os itens. Revise o pedido.');
  return { linhas, totalCentavos, setores: montado.setores, divergencia: linhas.some((l, i) => l.precoCentavos !== montado.linhas[i].precoCentavos) };
}

/** Chave de envio gerada no celular: impede que o mesmo pagamento vire dois pedidos. */
export function chaveValida(chave: unknown): chave is string {
  return typeof chave === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(chave);
}
