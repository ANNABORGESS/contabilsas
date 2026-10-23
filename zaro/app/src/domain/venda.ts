// Regras de venda: soma dos itens e parcelamento em títulos a receber.
import { addDias, arred, dividir } from './dinheiro';

/** Quantas linhas de item o formulário de venda mostra. */
export const LINHAS_VENDA = 6;

export interface LinhaVenda {
  qtd: number;
  preco: number;
}

/** Total de cada item e da venda, arredondados no centavo. */
export function totalDaVenda(linhas: LinhaVenda[]) {
  const itens = linhas.map((l) => arred(l.qtd * l.preco));
  return { itens, total: arred(itens.reduce((a, v) => a + v, 0)) };
}

/** Parcelas de 30 em 30 dias a partir do 1º vencimento; a última absorve a diferença de centavos. */
export function parcelasDaVenda(total: number, n: number, primeiroVenc: string, intervaloDias = 30) {
  const qtd = Math.max(1, Math.floor(n));
  return dividir(total, qtd).map((valor, i) => ({ parcela: `${i + 1}/${qtd}`, venc: addDias(primeiroVenc, i * intervaloDias), valor }));
}

/** Categoria do título da venda: só serviços → "Serviço prestado"; com produto → "Venda de produção".
 *  A conta é sempre 3.1.1.01 (Receita de vendas e serviços), a única receita do plano padrão. */
export function categoriaDaVenda(tipos: ('produto' | 'servico')[]) {
  return tipos.length && tipos.every((t) => t === 'servico') ? 'Serviço prestado' : 'Venda de produção';
}
