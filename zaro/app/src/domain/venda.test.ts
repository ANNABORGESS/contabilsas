import { describe, expect, it } from 'vitest';
import { categoriaDaVenda, parcelasDaVenda, totalDaVenda } from './venda';

describe('venda', () => {
  it('soma itens no centavo', () => {
    expect(totalDaVenda([{ qtd: 3, preco: 33.333 }, { qtd: 1, preco: 875 }])).toEqual({ itens: [100, 875], total: 975 });
  });
  it('parcela de 30 em 30 dias e a última leva os centavos', () => {
    expect(parcelasDaVenda(100, 3, '2026-11-10')).toEqual([
      { parcela: '1/3', venc: '2026-11-10', valor: 33.33 },
      { parcela: '2/3', venc: '2026-12-10', valor: 33.33 },
      { parcela: '3/3', venc: '2027-01-09', valor: 33.34 },
    ]);
  });
  it('à vista é uma parcela só', () => {
    expect(parcelasDaVenda(875, 0, '2026-11-10')).toEqual([{ parcela: '1/1', venc: '2026-11-10', valor: 875 }]);
  });
  it('só serviço é serviço prestado; com produto, venda de produção', () => {
    expect(categoriaDaVenda(['servico', 'servico'])).toBe('Serviço prestado');
    expect(categoriaDaVenda(['servico', 'produto'])).toBe('Venda de produção');
  });
});
