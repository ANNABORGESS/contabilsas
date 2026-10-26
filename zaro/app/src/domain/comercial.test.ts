import { describe, expect, it } from 'vitest';
import { compararCotacoes, etapasCompra, pedidosDasNotas, podeMudar, rotuloDoc, situacaoPedido, totais } from './comercial';

describe('comercial', () => {
  it('numeração por tipo', () => {
    expect(rotuloDoc('orcamento', 7)).toBe('ORC-0007');
    expect(rotuloDoc('compra', 12)).toBe('OC-0012');
  });

  it('fluxo: orçamento só vira pedido depois de aprovado', () => {
    expect(podeMudar('orcamento', 'Rascunho', 'Enviado')).toBe(true);
    expect(podeMudar('orcamento', 'Enviado', 'Convertido')).toBe(false);
    expect(podeMudar('orcamento', 'Aprovado', 'Convertido')).toBe(true);
    expect(podeMudar('solicitacao', 'Rascunho', 'Aprovada')).toBe(false);
    expect(podeMudar('compra', 'Recebido', 'Cancelado')).toBe(false);
  });

  it('totais e margem só com custo em todos os itens', () => {
    expect(totais([{ qtd: 2, preco: 150.5, custo: 100 }, { qtd: 1, preco: 99.99, custo: 50 }])).toEqual({ itens: [301, 99.99], total: 400.99, custo: 250, margem: 37.65 });
    expect(totais([{ qtd: 1, preco: 100, custo: 60 }, { qtd: 1, preco: 50 }]).margem).toBeNull();
  });

  it('cotação: menor total, empate pelo prazo, no máximo 3', () => {
    const r = compararCotacoes([
      { fornecedor: 'A', unitario: 10, prazoDias: 10, condicao: '28 dias' },
      { fornecedor: 'B', unitario: 9.5, prazoDias: 15, condicao: '' },
      { fornecedor: 'C', unitario: 9.5, prazoDias: 5, condicao: '' },
      { fornecedor: 'D', unitario: 1, prazoDias: 1, condicao: '' },
    ], 100);
    expect(r.map((c) => c.fornecedor)).toEqual(['A', 'B', 'C']);
    expect(r.find((c) => c.recomendada)?.fornecedor).toBe('C');
    expect(r[0].diferenca).toBe(50);
  });

  it('situação do pedido: saldo, atraso e entrega próxima', () => {
    expect(situacaoPedido({ total: 1000, prazo: '2026-10-20', status: 'A faturar' }, 400, 0, '2026-10-26')).toMatchObject({ saldo: 600, atrasado: true, proximo: false });
    expect(situacaoPedido({ total: 1000, prazo: '2026-10-30', status: 'A faturar' }, 0, 0, '2026-10-26')).toMatchObject({ atrasado: false, proximo: true });
    expect(situacaoPedido({ total: 1000, prazo: '2026-10-01', status: 'Faturado' }, 1000, 1000, '2026-10-26').atrasado).toBe(false);
  });

  it('pedidos das NFs: agrupa por cliente e pedido, ignora canceladas e zeros à esquerda', () => {
    const base = { nome: 'HDL', docParceiro: '04034304000120', valorFiscal: 600, emissao: '2026-09-11', status: 'Recebido' };
    const r = pedidosDasNotas([
      { ...base, nf: '25', pedido: '0000052804', valor: 533.1, recebido: 533.1 },
      { ...base, nf: '24', pedido: '52804', valor: 534, recebido: 0, status: 'Cancelado' },
      { ...base, nf: '30', pedido: '52804', valor: 533.1, recebido: 0, emissao: '2026-10-01', status: 'A receber' },
      { ...base, nf: '31', pedido: '', valor: 10, recebido: 0 },
    ]);
    expect(r).toEqual([{ cliente: 'HDL', doc: '04034304000120', pedido: '52804', nfs: ['25', '30'], faturado: 1200, liquido: 1066.2, recebido: 533.1, aReceber: 533.1, primeira: '2026-09-11' }]);
  });

  it('etapas da compra', () => {
    expect(etapasCompra([{ status: 'Rascunho' }, { status: 'Em aprovação' }, { status: 'Aprovada' }], [{ status: 'Emitido' }, { status: 'Recebido' }]).map((e) => e.qtd)).toEqual([1, 1, 1, 1, 1]);
  });
});
