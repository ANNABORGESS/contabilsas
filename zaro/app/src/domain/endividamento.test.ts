import { describe, expect, it } from 'vitest';
import { custoMedio, indicadoresDivida, pgfnParcelada } from './endividamento';

describe('Endividamento', () => {
  const base = { onerosa: 300000, total: 400000, curtoPrazo: 280000, ebitda12: 60000, faturamento12: 1200000, juros12: 30000, servico12: 200000 };
  it('calcula os índices e classifica o risco', () => {
    const r = indicadoresDivida(base);
    expect(r.dividaEbitda).toBe(5);
    expect(r.coberturaJuros).toBe(2);
    expect(r.dividaFaturamento).toBe(25);
    expect(r.curtoPct).toBe(70);
    expect(r.comprometimento).toBe(16.67);
    expect(r.nivel).toBe('Crítico');
    expect(r.motivos.length).toBeGreaterThanOrEqual(3);
  });
  it('EBITDA negativo com dívida é crítico e sem base fica nulo', () => {
    const r = indicadoresDivida({ ...base, ebitda12: -10 });
    expect(r.nivel).toBe('Crítico');
    expect(r.dividaEbitda).toBeNull();
    expect(indicadoresDivida({ onerosa: 0, total: 0, curtoPrazo: 0, ebitda12: 0, faturamento12: 0, juros12: 0, servico12: 0 }).nivel).toBe('Sem dados');
    expect(indicadoresDivida({ ...base, onerosa: 50000, total: 50000, curtoPrazo: 10000, servico12: 20000, juros12: 5000 }).nivel).toBe('Saudável');
  });
  it('custo médio ponderado só com taxa informada', () => {
    expect(custoMedio([{ valor: 100, taxa: 2 }, { valor: 300, taxa: 4 }, { valor: 1000, taxa: null }])).toBe(3.5);
    expect(custoMedio([{ valor: 100, taxa: null }])).toBeNull();
    expect(custoMedio([{ valor: 60000, taxa: 8 }, { valor: 47400, taxa: 5 }, { valor: 47400, taxa: 5 }])).toBe(6.16);
    expect(pgfnParcelada('Ativa não ajuizável · negociada no SISPAR')).toBe(true);
    expect(pgfnParcelada('Ativa ajuizada · em cobrança')).toBe(false);
  });
});
