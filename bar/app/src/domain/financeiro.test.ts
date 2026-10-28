import { describe, expect, it } from 'vitest';
import { lucroNoPreco, percentualFixas, resumoFinanceiro, sugerirPreco, validarDespesa } from './financeiro';

describe('custos e lucro', () => {
  it('lucro = vendas líquidas − despesas, com margem e participação de cada categoria', () => {
    const r = resumoFinanceiro(
      [
        { data: '2026-10-24', liquidoCentavos: 100000 },
        { data: '2026-10-25', liquidoCentavos: 50000 },
      ],
      [
        { data: '2026-10-24', categoria: 'funcionarios', valorCentavos: 30000 },
        { data: '2026-10-24', categoria: 'bebidas', valorCentavos: 20000 },
        { data: '2026-10-26', categoria: 'comidas', valorCentavos: 10000 },
      ],
    );
    expect(r.vendasCentavos).toBe(150000);
    expect(r.despesasCentavos).toBe(60000);
    expect(r.lucroCentavos).toBe(90000);
    expect(r.margem).toBe(60);
    expect(r.porCategoria.map((c) => [c.categoria, c.percentualDasVendas])).toEqual([
      ['funcionarios', 20],
      ['bebidas', 13.3],
      ['comidas', 6.7],
    ]);
    expect(r.porDia).toEqual([
      { data: '2026-10-24', vendasCentavos: 100000, despesasCentavos: 50000, lucroCentavos: 50000 },
      { data: '2026-10-25', vendasCentavos: 50000, despesasCentavos: 0, lucroCentavos: 50000 },
      { data: '2026-10-26', vendasCentavos: 0, despesasCentavos: 10000, lucroCentavos: -10000 },
    ]);
  });
  it('soma o que cada funcionário recebeu, juntando o mesmo nome escrito de jeitos diferentes', () => {
    const r = resumoFinanceiro(
      [],
      [
        { data: '2026-10-24', categoria: 'funcionarios', valorCentavos: 8000, funcionarioNome: 'Maria' },
        { data: '2026-10-25', categoria: 'funcionarios', valorCentavos: 8000, funcionarioNome: 'maria' },
        { data: '2026-10-25', categoria: 'funcionarios', valorCentavos: 12000, funcionarioNome: 'João' },
        { data: '2026-10-25', categoria: 'bebidas', valorCentavos: 50000, funcionarioNome: null },
      ],
    );
    expect(r.porFuncionario).toEqual([
      { nome: 'Maria', valorCentavos: 16000, lancamentos: 2 },
      { nome: 'João', valorCentavos: 12000, lancamentos: 1 },
    ]);
  });
  it('sem vendas não calcula margem; prejuízo aparece negativo', () => {
    const r = resumoFinanceiro([], [{ data: '2026-10-24', categoria: 'contas', valorCentavos: 5000 }]);
    expect(r.lucroCentavos).toBe(-5000);
    expect(r.margem).toBeNull();
  });
  it('valida a despesa', () => {
    expect(validarDespesa({ data: '2026-10-24', categoria: 'bebidas', descricao: '  10 caixas  de cerveja ', valorCentavos: 45000 })).toEqual({
      data: '2026-10-24',
      categoria: 'bebidas',
      descricao: '10 caixas de cerveja',
      valorCentavos: 45000,
      funcionarioNome: null,
    });
    expect(validarDespesa({ data: '2026-10-24', categoria: 'funcionarios', descricao: 'Diária', valorCentavos: 8000, funcionarioNome: '  Maria  Souza ' }).funcionarioNome).toBe('Maria Souza');
    expect(() => validarDespesa({ data: '2026-10-24', categoria: 'funcionarios', descricao: 'Diária', valorCentavos: 8000 })).toThrow(/nome do funcionário/);
    expect(() => validarDespesa({ data: 'ontem', categoria: 'bebidas', descricao: 'x', valorCentavos: 1 })).toThrow(/data/);
    expect(() => validarDespesa({ data: '2026-10-24', categoria: 'festa', descricao: 'x', valorCentavos: 1 })).toThrow(/categoria/);
    expect(() => validarDespesa({ data: '2026-10-24', categoria: 'bebidas', descricao: ' ', valorCentavos: 1 })).toThrow(/Descreva/);
    expect(() => validarDespesa({ data: '2026-10-24', categoria: 'bebidas', descricao: 'x', valorCentavos: 0 })).toThrow(/valor/);
  });

  it('despesas fixas em % das vendas, sem contar as compras de bebidas e comidas', () => {
    const r = resumoFinanceiro(
      [{ data: '2026-10-24', liquidoCentavos: 100000 }],
      [
        { data: '2026-10-24', categoria: 'funcionarios', valorCentavos: 20000 },
        { data: '2026-10-24', categoria: 'contas', valorCentavos: 5000 },
        { data: '2026-10-24', categoria: 'bebidas', valorCentavos: 30000 },
      ],
    );
    expect(percentualFixas(r)).toBe(25);
    expect(percentualFixas(resumoFinanceiro([], []))).toBeNull();
  });
  it('sugere o preço: custo ÷ (1 − fixas − taxa − margem), arredondado para cima em R$ 0,50', () => {
    // custo 5,00 com 25% fixas + 3% taxa + 20% margem → 5 ÷ 0,52 = 9,615… → 10,00
    expect(sugerirPreco(500, [25, 3, 20])).toBe(1000);
    expect(sugerirPreco(500, [0])).toBe(500);
    expect(sugerirPreco(0, [20])).toBeNull();
    expect(sugerirPreco(500, [60, 40])).toBeNull(); // percentuais impossíveis
    // no preço sugerido o lucro fica pelo menos na margem pedida
    expect(lucroNoPreco(1000, 500, [25, 3])).toBe(22);
    expect(lucroNoPreco(600, 500, [25, 3])).toBe(-11.3);
  });
});
