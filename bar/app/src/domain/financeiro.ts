// Custos e lucro do período. Regime de caixa simples: lucro = vendas líquidas − despesas lançadas.
// As compras de bebidas e de comidas entram como despesa quando são pagas.

export const CATEGORIAS_DESPESA = ['funcionarios', 'bebidas', 'comidas', 'contas', 'outros'] as const;
export type CategoriaDespesa = (typeof CATEGORIAS_DESPESA)[number];

export const NOME_CATEGORIA: Record<CategoriaDespesa, string> = {
  funcionarios: 'Funcionários',
  bebidas: 'Bebidas (compras)',
  comidas: 'Comidas (compras)',
  contas: 'Aluguel e contas',
  outros: 'Outras despesas',
};

export class ErroDespesa extends Error {}

export function ehCategoria(c: unknown): c is CategoriaDespesa {
  return typeof c === 'string' && (CATEGORIAS_DESPESA as readonly string[]).includes(c);
}

export interface DespesaNova {
  data: string;
  categoria: CategoriaDespesa;
  descricao: string;
  valorCentavos: number;
}

export function validarDespesa(d: { data?: unknown; categoria?: unknown; descricao?: unknown; valorCentavos?: unknown }): DespesaNova {
  if (typeof d.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.data) || Number.isNaN(Date.parse(`${d.data}T00:00:00Z`))) throw new ErroDespesa('Informe a data da despesa.');
  if (!ehCategoria(d.categoria)) throw new ErroDespesa('Escolha a categoria.');
  const descricao = typeof d.descricao === 'string' ? d.descricao.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!descricao) throw new ErroDespesa('Descreva a despesa (ex.: salário da Ana, 10 caixas de cerveja).');
  const v = Number(d.valorCentavos);
  if (!Number.isInteger(v) || v <= 0 || v > 100_000_000) throw new ErroDespesa('Informe um valor válido.');
  return { data: d.data, categoria: d.categoria, descricao, valorCentavos: v };
}

export interface VendaDia {
  data: string;
  liquidoCentavos: number;
}

export function resumoFinanceiro(vendas: VendaDia[], despesas: { data: string; categoria: string; valorCentavos: number }[]) {
  const vendasCentavos = vendas.reduce((a, v) => a + v.liquidoCentavos, 0);
  const despesasCentavos = despesas.reduce((a, d) => a + d.valorCentavos, 0);
  const lucroCentavos = vendasCentavos - despesasCentavos;
  const porCategoria = CATEGORIAS_DESPESA.map((c) => ({
    categoria: c,
    valorCentavos: despesas.filter((d) => d.categoria === c).reduce((a, d) => a + d.valorCentavos, 0),
  }))
    .filter((c) => c.valorCentavos > 0)
    .map((c) => ({ ...c, percentualDasVendas: vendasCentavos ? Math.round((c.valorCentavos / vendasCentavos) * 1000) / 10 : null }));
  const datas = [...new Set([...vendas.map((v) => v.data), ...despesas.map((d) => d.data)])].sort();
  const porDia = datas.map((data) => {
    const v = vendas.filter((x) => x.data === data).reduce((a, x) => a + x.liquidoCentavos, 0);
    const d = despesas.filter((x) => x.data === data).reduce((a, x) => a + x.valorCentavos, 0);
    return { data, vendasCentavos: v, despesasCentavos: d, lucroCentavos: v - d };
  });
  return {
    vendasCentavos,
    despesasCentavos,
    lucroCentavos,
    margem: vendasCentavos ? Math.round((lucroCentavos / vendasCentavos) * 1000) / 10 : null,
    porCategoria,
    porDia,
  };
}

export type ResumoFinanceiro = ReturnType<typeof resumoFinanceiro>;
