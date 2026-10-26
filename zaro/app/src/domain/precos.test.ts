import { describe, expect, it } from 'vitest';
import { historicoPrecos, margem, simularPreco } from './precos';

describe('preços', () => {
  const base = { qtd: 10, material: 200, horas: 2, valorHora: 90, outros: 20, impostosPct: 10, comissaoPct: 3, despesasPct: 7, margemPct: 20 };

  it('markup divisor: custo 400 com 40% sobre o preço → 666,67', () => {
    const r = simularPreco(base);
    expect(r.custoUnit).toBe(400);
    expect(r.preco).toBe(666.67);
    expect(r.minimo).toBe(500);
    expect(r.composicao.lucro).toBe(133.33);
    expect(r.totalPedido).toBe(6666.7);
  });

  it('recusa percentuais que somam 100% ou custo zero', () => {
    expect(() => simularPreco({ ...base, margemPct: 80 })).toThrow(/100%/);
    expect(() => simularPreco({ ...base, material: 0, horas: 0, outros: 0 })).toThrow(/custo/);
  });

  it('histórico: variação sobre a venda anterior e produtos com mudança primeiro', () => {
    const n = (nf: string, emissao: string, unit: number, desc = '04PRMC0003 - IMA NOS CARRIERS') => ({ nf, chave: nf, tipo: 'NF-e', cliente: 'UCB', pedido: '', emissao, itens: [{ desc, ncm: '', un: 'UN', qtd: 1, unit, total: unit }] });
    const h = historicoPrecos([n('2', '2026-10-23', 420), n('1', '2026-10-01', 400), n('3', '2026-10-05', 100, 'PINCA')]);
    expect(h[0]).toMatchObject({ codigo: '04PRMC0003', menor: 400, maior: 420, ultimo: 420, mudou: true });
    expect(h[0].vendas.map((v) => v.variacao)).toEqual([null, 5]);
    expect(h[1]).toMatchObject({ nome: 'PINCA', mudou: false });
  });

  it('margem', () => {
    expect(margem(1000, 600)).toBe(40);
    expect(margem(1000, null)).toBeNull();
    expect(margem(0, 10)).toBeNull();
  });
});
