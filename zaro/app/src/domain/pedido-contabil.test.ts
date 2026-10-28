import { describe, expect, it } from 'vitest';
import { atalhoDoPedido, interpretarPedido, linksDoPedido } from './pedido-contabil';

const H = '2026-10-28';
describe('pedido de demonstração em português', () => {
  it('balancete de 2026 até setembro', () => {
    expect(interpretarPedido('presciso do balancete de 2026 ate setembro', H)).toMatchObject({ demonstracoes: ['balancete'], de: '2026-01', ate: '2026-09', formato: 'tela', modelo: 'escritorio', previa: null });
  });
  it('intervalo, formato e modelo', () => {
    expect(interpretarPedido('Balancete de janeiro a março de 2026 em PDF', H)).toMatchObject({ de: '2026-01', ate: '2026-03', formato: 'pdf' });
    expect(interpretarPedido('balancete no modelo do ZARO em excel, prévia', H)).toMatchObject({ modelo: 'zaro', formato: 'excel', previa: true, de: '2026-01', ate: '2026-10' });
  });
  it('DRE do mês, trimestre e balanço numa data', () => {
    expect(interpretarPedido('DRE de março', H)).toMatchObject({ demonstracoes: ['dre'], de: '2026-03', ate: '2026-03' });
    expect(interpretarPedido('dre do 2º trimestre de 2026', H)).toMatchObject({ de: '2026-04', ate: '2026-06' });
    expect(interpretarPedido('balanço em 30/09/2026', H)).toMatchObject({ demonstracoes: ['balanco'], de: '2026-01', ate: '2026-09' });
    expect(interpretarPedido('balanço patrimonial de 2025', H)).toMatchObject({ de: '2025-01', ate: '2025-12' });
  });
  it('várias demonstrações e pedidos que não são demonstração', () => {
    expect(interpretarPedido('balancete, DRE e balanço até setembro', H)?.demonstracoes).toEqual(['balancete', 'dre', 'balanco']);
    expect(interpretarPedido('como está o caixa?', H)).toBeNull();
    expect(atalhoDoPedido('quero ver os impostos a recuperar')?.href).toBe('/fiscal/creditos');
  });
  it('monta os endereços com o período', () => {
    const p = interpretarPedido('balancete até setembro', H)!;
    expect(linksDoPedido(p, 'balancete', true).pdf).toBe('/relatorio-contabil?aba=balancete&per=pers&de=2026-01&ate=2026-09&ref=2026-09&previa=1');
  });
});
