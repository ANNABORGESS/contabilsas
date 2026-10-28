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
/** Cervejas pequenas por balde. */
export const MAX_BALDE = 10;

export interface ProdutoCardapio {
  id: string;
  nome: string;
  setor: Setor | string;
  precoCentavos: number;
  ativo: boolean;
  balde?: boolean;
}

export interface ItemSolicitado {
  produtoId: string;
  quantidade: number;
  /** número do balde (1, 2...) quando a cerveja vai no balde */
  balde?: number | null;
}

export interface LinhaPedido {
  produtoId: string;
  nome: string;
  setor: Setor;
  quantidade: number;
  precoCentavos: number;
  subtotalCentavos: number;
  balde: number | null;
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

/**
 * Junta itens repetidos, valida quantidades e produtos e calcula subtotais e total. Cervejas pequenas
 * podem ir em balde: cada balde leva de 1 a MAX_BALDE cervejas (pode misturar marcas) e cada cerveja
 * é cobrada pelo preço dela.
 */
export function montarPedido(itens: ItemSolicitado[], cardapio: ProdutoCardapio[]): PedidoMontado {
  if (!Array.isArray(itens) || itens.length === 0) throw new ErroPedido('Adicione pelo menos um produto.');
  const porId = new Map(cardapio.map((p) => [p.id, p]));
  const qtd = new Map<string, { produtoId: string; balde: number | null; quantidade: number }>();
  const porBalde = new Map<number, number>();
  for (const it of itens) {
    if (!it || typeof it.produtoId !== 'string') throw new ErroPedido('Produto inválido.');
    if (!Number.isInteger(it.quantidade) || it.quantidade < 1) throw new ErroPedido('A quantidade deve ser um número inteiro maior que zero.');
    const balde = it.balde ?? null;
    if (balde !== null && (!Number.isInteger(balde) || balde < 1 || balde > 50)) throw new ErroPedido('Balde inválido.');
    const k = `${it.produtoId}|${balde ?? ''}`;
    const atual = qtd.get(k) || { produtoId: it.produtoId, balde, quantidade: 0 };
    atual.quantidade += it.quantidade;
    qtd.set(k, atual);
    if (balde !== null) porBalde.set(balde, (porBalde.get(balde) || 0) + it.quantidade);
  }
  for (const [n, total] of porBalde) if (total > MAX_BALDE) throw new ErroPedido(`O balde ${n} tem ${total} cervejas: o máximo é ${MAX_BALDE}.`);
  const linhas: LinhaPedido[] = [];
  for (const { produtoId, balde, quantidade } of qtd.values()) {
    const p = porId.get(produtoId);
    if (!p) throw new ErroPedido('Um dos produtos não existe mais no cardápio.');
    if (!p.ativo) throw new ErroPedido(`${p.nome} está indisponível.`);
    if (!ehSetor(p.setor)) throw new ErroPedido(`${p.nome} está sem setor de preparo.`);
    if (quantidade > MAX_QUANTIDADE) throw new ErroPedido(`Quantidade de ${p.nome} acima de ${MAX_QUANTIDADE}.`);
    if (balde !== null && !p.balde) throw new ErroPedido(`${p.nome} não vai no balde.`);
    linhas.push({ produtoId, nome: p.nome, setor: p.setor, quantidade, precoCentavos: p.precoCentavos, subtotalCentavos: p.precoCentavos * quantidade, balde });
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

/** Separa os itens soltos dos que vão em balde, agrupando por número do balde. */
export function agruparBaldes<T extends { quantidade: number; balde?: number | null }>(itens: T[]) {
  const soltos = itens.filter((i) => !i.balde);
  const numeros = [...new Set(itens.map((i) => i.balde).filter((b): b is number => !!b))].sort((a, b) => a - b);
  const baldes = numeros.map((n) => {
    const doBalde = itens.filter((i) => i.balde === n);
    return { n, itens: doBalde, cervejas: doBalde.reduce((a, i) => a + i.quantidade, 0) };
  });
  return { soltos, baldes };
}

/** "3× Batata frita" ou "6× Cerveja lata (balde 1)". */
export function textoItem(i: { quantidade: number; nome: string; balde?: number | null }) {
  return `${i.quantidade}× ${i.nome}${i.balde ? ` (balde ${i.balde})` : ''}`;
}
