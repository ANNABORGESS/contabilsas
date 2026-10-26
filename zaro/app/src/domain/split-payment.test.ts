import { describe, expect, it } from 'vitest';
import { analisarOperacoes, divergenciasDe, lerRetornoPsp, type OperacaoSplit, projecaoSplit, resumoSplit, simularSplit } from './split-payment';

const op = (o: Partial<OperacaoSplit>): OperacaoSplit => ({
  id: 'x', evento: 'pagamento', data: '2026-10-10', competencia: '2026-10', nf: '3976', tituloId: 't1', valorDocumento: 1000, valorBruto: 1000,
  ibsDestacado: 1, cbsDestacado: 9, ibsSegregado: null, cbsSegregado: null, taxaPsp: null, valorLiquido: null, psp: null, idTransacao: null, status: 'nao_informado', extratoId: null, ...o,
});

describe('Split Payment', () => {
  it('venda à vista conferida pelo PSP: sem divergência além da conciliação', () => {
    const o = op({ ibsSegregado: 1, cbsSegregado: 9, taxaPsp: 20, valorLiquido: 970, status: 'informado_psp', psp: 'PSP', idTransacao: 'A1', extratoId: 'e1' });
    expect(divergenciasDe(o)).toEqual([]);
  });

  it('destacado na NF não vira segregado: sem retorno do PSP fica pendente', () => {
    expect(divergenciasDe(op({}))).toEqual(['sem_retorno_psp']);
  });

  it('pagamento parcial compara o segregado com o destaque proporcional', () => {
    const o = op({ evento: 'parcial', valorBruto: 500, ibsSegregado: 0.5, cbsSegregado: 4.5, valorLiquido: 495, status: 'informado_psp', extratoId: 'e' });
    expect(divergenciasDe(o)).toEqual(['parcial']);
    expect(divergenciasDe({ ...o, cbsSegregado: 6 })).toEqual(expect.arrayContaining(['parcial', 'bruto_liquido', 'tributo_divergente']));
  });

  it('estorno, sem documento, tributação não determinada e duplicidade', () => {
    expect(divergenciasDe(op({ evento: 'estorno' }))).toContain('estorno');
    expect(divergenciasDe(op({ nf: null, tituloId: null, ibsDestacado: null, cbsDestacado: null }))).toContain('sem_documento');
    expect(divergenciasDe(op({ ibsDestacado: null, cbsDestacado: null }))).toContain('tributacao_indeterminada');
    const a = analisarOperacoes([op({ id: 'a', psp: 'P', idTransacao: '9' }), op({ id: 'b', psp: 'P', idTransacao: '9' })]);
    expect(a.every((x) => x.divergencias.includes('duplicidade'))).toBe(true);
  });

  it('resumo separa confirmado, informado pelo PSP e estimado; estorno subtrai', () => {
    const r = resumoSplit([
      op({ id: '1', ibsSegregado: 1, cbsSegregado: 9, valorLiquido: 990, status: 'confirmado' }),
      op({ id: '2', ibsSegregado: 2, cbsSegregado: 18, valorBruto: 2000, valorDocumento: 2000, valorLiquido: 1980, status: 'informado_psp' }),
      op({ id: '3', evento: 'estorno', valorBruto: 1000, ibsDestacado: null, cbsDestacado: null }),
    ]);
    expect(r).toMatchObject({ transacoes: 3, bruto: 2000, ibsConfirmado: 1, cbsConfirmado: 9, ibsInformadoPsp: 2, cbsInformadoPsp: 18, aguardandoConfirmacao: 1 });
  });

  it('simulador: parcelado, antecipação e tributação não determinada', () => {
    const s = simularSplit({ valor: 1000, ibsPct: 0.1, cbsPct: 0.9, taxaPct: 2, parcelas: 3, primeiraLiquidacao: '2026-11-10' });
    expect(s.parcelas.map((p) => [p.data, p.bruto])).toEqual([['2026-11-10', 333.33], ['2026-12-10', 333.33], ['2027-01-09', 333.34]]);
    expect(s).toMatchObject({ bruto: 1000, ibs: 1, cbs: 9, segregado: 10, taxa: 20, liquido: 970 });
    const a = simularSplit({ valor: 1000, ibsPct: 0.1, cbsPct: 0.9, taxaPct: 2, parcelas: 3, primeiraLiquidacao: '2026-11-10', antecipacaoPct: 3 });
    expect(a.parcelas.every((p) => p.data === '2026-11-10')).toBe(true);
    expect(a.custoAntecipacao).toBe(29.1);
    expect(() => simularSplit({ valor: 1000, ibsPct: null, cbsPct: 0.9, taxaPct: 0, parcelas: 1, primeiraLiquidacao: '2026-11-10' })).toThrow(/não determinada/);
  });

  it('projeção 30/60/90: segregação só pelos destaques, sem destaque fica separado', () => {
    const p = projecaoSplit([
      { venc: '2026-11-10', saldo: 1000, valorDocumento: 1000, ibsDestacado: 1, cbsDestacado: 9 },
      { venc: '2026-12-20', saldo: 500, valorDocumento: 1000, ibsDestacado: 1, cbsDestacado: 9 },
      { venc: '2026-11-01', saldo: 300, valorDocumento: 300, ibsDestacado: null, cbsDestacado: null },
    ], '2026-10-26', 1);
    expect(p[0]).toMatchObject({ dias: 30, bruto: 1300, segregacao: 10, taxas: 13, liquido: 1277, semDestaque: 300 });
    expect(p[1]).toMatchObject({ dias: 60, bruto: 1800, segregacao: 15 });
  });

  it('lê o retorno do PSP em CSV com vírgula decimal', () => {
    const r = lerRetornoPsp('Data;Transação;Valor bruto;IBS;CBS;Taxa;Valor líquido;NF;Tipo\n10/11/2026;TX1;1.000,00;1,00;9,00;20,00;970,00;3976;pagamento\n11/11/2026;TX2;100,00;;;;;;Estorno');
    expect(r[0]).toMatchObject({ data: '2026-11-10', idTransacao: 'TX1', valorBruto: 1000, ibs: 1, cbs: 9, taxa: 20, liquido: 970, nf: '3976', evento: 'pagamento' });
    expect(r[1]).toMatchObject({ evento: 'estorno', ibs: null, liquido: null });
    expect(() => lerRetornoPsp('a;b\n1;2')).toThrow(/colunas/);
  });
});
