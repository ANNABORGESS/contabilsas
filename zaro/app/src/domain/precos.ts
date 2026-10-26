// Preços e rentabilidade do Comercial: simulador de preço (markup divisor), histórico de preços
// vendidos nas NFs e margem por pedido, cliente e produto.
import { arred } from './dinheiro';
import { type NotaComItens, separarCodigo, limparDescServico } from './produtos-vendidos';

export interface EntradaSimulacao {
  qtd: number;
  material: number; // custo de material por unidade
  horas: number; // horas de máquina/mão de obra por unidade
  valorHora: number;
  outros: number; // frete, terceiros, embalagem por unidade
  impostosPct: number; // tributos sobre a venda
  comissaoPct: number;
  despesasPct: number; // despesas fixas rateadas
  margemPct: number; // lucro desejado sobre o preço
}

/** Preço pelo markup divisor: custo ÷ (1 − (impostos + comissão + despesas + margem)). */
export function simularPreco(e: EntradaSimulacao) {
  const custoUnit = arred(e.material + e.horas * e.valorHora + e.outros);
  const variaveis = e.impostosPct + e.comissaoPct + e.despesasPct;
  const soma = variaveis + e.margemPct;
  if (soma >= 100) throw new Error('Impostos, comissão, despesas e margem somam 100% ou mais: o preço ficaria infinito.');
  if (!(custoUnit > 0)) throw new Error('Informe o custo (material, horas ou outros).');
  const preco = arred(custoUnit / (1 - soma / 100));
  const minimo = arred(custoUnit / (1 - variaveis / 100));
  const qtd = Math.max(1, e.qtd || 1);
  const pct = (p: number) => arred((preco * p) / 100);
  return {
    custoUnit, preco, minimo, markup: arred(preco / custoUnit),
    composicao: { custo: custoUnit, impostos: pct(e.impostosPct), comissao: pct(e.comissaoPct), despesas: pct(e.despesasPct), lucro: arred(preco - custoUnit - pct(e.impostosPct) - pct(e.comissaoPct) - pct(e.despesasPct)) },
    totalPedido: arred(preco * qtd), lucroPedido: arred((preco - custoUnit - pct(variaveis)) * qtd),
  };
}

export interface VendaDePreco {
  data: string;
  nf: string;
  cliente: string;
  pedido: string;
  qtd: number;
  unit: number;
  variacao: number | null; // % sobre a venda anterior do mesmo produto
}

/** Cada venda de cada produto, em ordem de data, com a variação de preço em relação à anterior. */
export function historicoPrecos(notas: NotaComItens[]) {
  const mapa = new Map<string, { codigo: string; nome: string; vendas: VendaDePreco[] }>();
  for (const n of [...notas].sort((a, b) => a.emissao.localeCompare(b.emissao))) {
    const servico = /NFS/i.test(n.tipo);
    for (const i of n.itens) {
      const { codigo, nome } = separarCodigo(servico ? limparDescServico(i.desc) : i.desc);
      const k = codigo || nome.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
      const g = mapa.get(k) || { codigo, nome, vendas: [] };
      const unit = i.unit || (i.qtd ? arred(i.total / i.qtd) : 0);
      const ant = g.vendas[g.vendas.length - 1];
      g.vendas.push({ data: n.emissao, nf: n.nf, cliente: n.cliente, pedido: n.pedido, qtd: i.qtd, unit, variacao: ant && ant.unit ? arred(((unit - ant.unit) / ant.unit) * 100) : null });
      mapa.set(k, g);
    }
  }
  return [...mapa.values()].map((g) => {
    const precos = g.vendas.map((v) => v.unit);
    return { ...g, menor: Math.min(...precos), maior: Math.max(...precos), ultimo: precos[precos.length - 1], mudou: new Set(precos).size > 1 };
  }).sort((a, b) => Number(b.mudou) - Number(a.mudou) || b.vendas.length - a.vendas.length || a.nome.localeCompare(b.nome));
}

/** Margem: (receita − custo) ÷ receita, em %. Sem custo conhecido, null. */
export const margem = (receita: number, custo: number | null) => (custo == null || !(receita > 0) ? null : arred(((receita - custo) / receita) * 100));
