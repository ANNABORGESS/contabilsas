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
  funcionarioNome: string | null;
}

const limpar = (t: unknown, max: number) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function validarDespesa(d: { data?: unknown; categoria?: unknown; descricao?: unknown; valorCentavos?: unknown; funcionarioNome?: unknown }): DespesaNova {
  if (typeof d.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.data) || Number.isNaN(Date.parse(`${d.data}T00:00:00Z`))) throw new ErroDespesa('Informe a data da despesa.');
  if (!ehCategoria(d.categoria)) throw new ErroDespesa('Escolha a categoria.');
  const descricao = limpar(d.descricao, 120);
  if (!descricao) throw new ErroDespesa('Descreva a despesa (ex.: salário da Ana, 10 caixas de cerveja).');
  const v = Number(d.valorCentavos);
  if (!Number.isInteger(v) || v <= 0 || v > 100_000_000) throw new ErroDespesa('Informe um valor válido.');
  // pagamento de funcionário sempre leva o nome, para somar quanto cada um recebeu
  const funcionarioNome = d.categoria === 'funcionarios' ? limpar(d.funcionarioNome, 60) : '';
  if (d.categoria === 'funcionarios' && !funcionarioNome) throw new ErroDespesa('Informe o nome do funcionário.');
  return { data: d.data, categoria: d.categoria, descricao, valorCentavos: v, funcionarioNome: funcionarioNome || null };
}

export interface VendaDia {
  data: string;
  liquidoCentavos: number;
}

export function resumoFinanceiro(vendas: VendaDia[], despesas: { data: string; categoria: string; valorCentavos: number; funcionarioNome?: string | null }[]) {
  const vendasCentavos = vendas.reduce((a, v) => a + v.liquidoCentavos, 0);
  const despesasCentavos = despesas.reduce((a, d) => a + d.valorCentavos, 0);
  const lucroCentavos = vendasCentavos - despesasCentavos;
  const porCategoria = CATEGORIAS_DESPESA.map((c) => ({
    categoria: c,
    valorCentavos: despesas.filter((d) => d.categoria === c).reduce((a, d) => a + d.valorCentavos, 0),
  }))
    .filter((c) => c.valorCentavos > 0)
    .map((c) => ({ ...c, percentualDasVendas: vendasCentavos ? Math.round((c.valorCentavos / vendasCentavos) * 1000) / 10 : null }));
  // pagamentos de funcionários somados por nome (sem diferenciar maiúsculas)
  const pagos = new Map<string, { nome: string; valorCentavos: number; lancamentos: number }>();
  for (const d of despesas) {
    if (d.categoria !== 'funcionarios') continue;
    const nome = d.funcionarioNome?.trim() || 'Sem nome';
    const k = nome.toLocaleLowerCase('pt-BR');
    const atual = pagos.get(k) || { nome, valorCentavos: 0, lancamentos: 0 };
    atual.valorCentavos += d.valorCentavos;
    atual.lancamentos += 1;
    pagos.set(k, atual);
  }
  const porFuncionario = [...pagos.values()].sort((a, b) => b.valorCentavos - a.valorCentavos);
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
    porFuncionario,
    porDia,
  };
}

export type ResumoFinanceiro = ReturnType<typeof resumoFinanceiro>;
