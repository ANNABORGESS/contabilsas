import { describe, expect, it } from 'vitest';
import { montarPedido } from './pedido';
import { aplicarPrecosCobrados } from './pedido';
import { restanteDaPromocao, resultadoPromocao, textoRestante, validarPromocao, type Promocao } from './promocao';

const original = { id: '11111111-1111-1111-1111-111111111111', nome: 'Original 300ml', setor: 'bar', precoCentavos: 1200, ativo: true, balde: true };
const promo: Promocao = { id: 'p1', nome: 'Original em dobro', produtoId: original.id, quantidadeCombo: 2, precoComboCentavos: 1200, dias: [0, 1, 2, 3, 4, 5, 6], inicio: '10:00', fim: '20:00', ativa: true };
// Manaus = UTC-4 (sem horário de verão)
const manaus = (hhmm: string, dia = '2026-11-06') => new Date(`${dia}T${hhmm}:00-04:00`);

describe('promoção programada (horário de Manaus)', () => {
  it('vale até 19:59 e encerra exatamente às 20h', () => {
    expect(restanteDaPromocao(promo, manaus('19:30'))).toBe(30 * 60_000);
    expect(restanteDaPromocao(promo, manaus('19:59'))).toBe(60_000);
    expect(restanteDaPromocao(promo, manaus('20:00'))).toBeNull();
    expect(restanteDaPromocao(promo, manaus('09:59'))).toBeNull();
  });
  it('20h em Manaus é 21h em Brasília: usa o fuso de Manaus', () => {
    expect(restanteDaPromocao(promo, new Date('2026-11-06T20:30:00-03:00'))).not.toBeNull(); // 19:30 em Manaus
  });
  it('só nos dias marcados e só ligada', () => {
    const soSexta = { ...promo, dias: [5] }; // 06/11/2026 é sexta
    expect(restanteDaPromocao(soSexta, manaus('15:00'))).not.toBeNull();
    expect(restanteDaPromocao(soSexta, manaus('15:00', '2026-11-07'))).toBeNull();
    expect(restanteDaPromocao({ ...promo, ativa: false }, manaus('15:00'))).toBeNull();
  });
  it('2 Original saem por R$ 12; ímpar: o que sobra no preço normal; estoque conta todas', () => {
    const m = montarPedido([{ produtoId: original.id, quantidade: 3 }], [original], [promo]);
    expect(m.totalCentavos).toBe(2400);
    expect(m.linhas.map((l) => [l.quantidade, l.unidades, l.precoCentavos, l.promocaoId])).toEqual([
      [1, 2, 1200, 'p1'],
      [1, 1, 1200, null],
    ]);
    expect(m.linhas.reduce((a, l) => a + l.quantidade * l.unidades, 0)).toBe(3);
  });
  it('compre 2 e ganhe 2: 4 Original por R$ 28; 6 = 1 combo + 2 no normal; estoque baixa todas', () => {
    const p4 = { ...promo, quantidadeCombo: 4, precoComboCentavos: 2800 };
    const o14 = { ...original, precoCentavos: 1400 };
    expect(montarPedido([{ produtoId: o14.id, quantidade: 4 }], [o14], [p4]).totalCentavos).toBe(2800);
    const m = montarPedido([{ produtoId: o14.id, quantidade: 6 }], [o14], [p4]);
    expect(m.totalCentavos).toBe(2800 + 2 * 1400);
    expect(m.linhas.reduce((a, l) => a + l.quantidade * l.unidades, 0)).toBe(6);
  });
  it('sem promoção valendo (depois das 20h), preço normal', () => {
    expect(montarPedido([{ produtoId: original.id, quantidade: 2 }], [original], []).totalCentavos).toBe(2400);
  });
  it('balde de 10 Original na promoção: 5 combos', () => {
    const m = montarPedido([{ produtoId: original.id, quantidade: 10, balde: 1 }], [original], [promo]);
    expect(m.totalCentavos).toBe(6000);
    expect(m.linhas[0].balde).toBe(1);
  });
  it('preço cobrado confere por linha (combo e normal do mesmo produto)', () => {
    const m = montarPedido([{ produtoId: original.id, quantidade: 3 }], [original], [promo]);
    const cobrado = m.linhas.map((l) => ({ produtoId: l.produtoId, precoCentavos: l.precoCentavos, promocaoId: l.promocaoId }));
    expect(aplicarPrecosCobrados(m, cobrado, 2400).divergencia).toBe(false);
  });
  it('relatório: unidades, faturado, custo e desconto', () => {
    const r = resultadoPromocao([{ quantidade: 5, quantidadeCancelada: 1, unidades: 2, precoCentavos: 1200 }], 450, 1200);
    expect(r).toEqual({ combos: 4, unidades: 8, faturadoCentavos: 4800, custoCentavos: 3600, precoNormalCentavos: 9600, descontoCentavos: 4800 });
  });
  it('cadastro confere horário e dias', () => {
    const base = { nome: 'Original em dobro', produtoId: original.id, quantidadeCombo: 2, precoComboCentavos: 1200, dias: [5, 6], inicio: '10:00', fim: '20:00' };
    expect(validarPromocao(base).dias).toEqual([5, 6]);
    expect(() => validarPromocao({ ...base, dias: [] })).toThrow(/dia/);
    expect(() => validarPromocao({ ...base, inicio: '21:00' })).toThrow(/antes/);
  });
  it('contagem regressiva', () => {
    expect(textoRestante(83 * 60_000)).toBe('1h 23min');
    expect(textoRestante(12 * 60_000 + 5000)).toBe('12min');
  });
});
