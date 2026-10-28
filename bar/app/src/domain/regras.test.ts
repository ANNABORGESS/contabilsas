import { describe, expect, it } from 'vitest';
import { conferirEncerramento, tipoEncerramento, validarMotivo } from './cancelamento';
import { paraCentavos, reais } from './dinheiro';
import { aplicarPrecosCobrados, chaveValida, montarPedido, type ProdutoCardapio } from './pedido';
import { podeMudarStatus, proximoStatus, situacaoPedido } from './preparo';
import { csv, resumir, type PedidoRel } from './relatorio';
import { dataOperacional } from './turno';
import { pode } from './papeis';

const cardapio: ProdutoCardapio[] = [
  { id: 'batata', nome: 'Batata frita', setor: 'cozinha', precoCentavos: 3200, ativo: true },
  { id: 'chopp', nome: 'Chopp 300ml', setor: 'bar', precoCentavos: 1250, ativo: true },
  { id: 'caipi', nome: 'Caipirinha', setor: 'bar', precoCentavos: 2200, ativo: false },
  { id: 'lata', nome: 'Cerveja lata', setor: 'bar', precoCentavos: 800, ativo: true, balde: true },
  { id: 'long', nome: 'Long neck', setor: 'bar', precoCentavos: 1200, ativo: true, balde: true },
];

describe('balde de cerveja', () => {
  it('cada balde leva até 10 cervejas pequenas, pode misturar, e cada uma é cobrada pelo preço dela', () => {
    const p = montarPedido(
      [
        { produtoId: 'lata', quantidade: 6, balde: 1 },
        { produtoId: 'long', quantidade: 4, balde: 1 },
        { produtoId: 'lata', quantidade: 3, balde: 2 },
        { produtoId: 'lata', quantidade: 2 },
      ],
      cardapio,
    );
    expect(p.linhas.map((l) => [l.produtoId, l.balde, l.quantidade])).toEqual([
      ['lata', 1, 6],
      ['long', 1, 4],
      ['lata', 2, 3],
      ['lata', null, 2],
    ]);
    expect(p.totalCentavos).toBe(6 * 800 + 4 * 1200 + 3 * 800 + 2 * 800);
  });
  it('recusa mais de 10 no balde e produto que não vai no balde', () => {
    expect(() => montarPedido([{ produtoId: 'lata', quantidade: 7, balde: 1 }, { produtoId: 'long', quantidade: 4, balde: 1 }], cardapio)).toThrow(/balde 1 tem 11.*máximo é 10/);
    expect(() => montarPedido([{ produtoId: 'chopp', quantidade: 1, balde: 1 }], cardapio)).toThrow(/não vai no balde/);
    expect(() => montarPedido([{ produtoId: 'lata', quantidade: 1, balde: 0 }], cardapio)).toThrow(/Balde inválido/);
  });
});

describe('dinheiro', () => {
  it('converte textos em centavos', () => {
    expect(paraCentavos('12,50')).toBe(1250);
    expect(paraCentavos('R$ 1.234,56')).toBe(123456);
    expect(paraCentavos('7.9')).toBe(790);
    expect(paraCentavos('abc')).toBeNull();
    expect(paraCentavos('1,234')).toBeNull();
  });
  it('formata em reais', () => {
    expect(reais(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
});

describe('montagem do pedido', () => {
  it('calcula o total e separa petiscos (cozinha) de bebidas (bar)', () => {
    const p = montarPedido([{ produtoId: 'batata', quantidade: 1 }, { produtoId: 'chopp', quantidade: 3 }], cardapio);
    expect(p.totalCentavos).toBe(3200 + 3 * 1250);
    expect(p.setores).toEqual(['cozinha', 'bar']);
    expect(p.linhas.find((l) => l.produtoId === 'chopp')!.subtotalCentavos).toBe(3750);
  });
  it('junta o mesmo produto adicionado duas vezes', () => {
    const p = montarPedido([{ produtoId: 'chopp', quantidade: 1 }, { produtoId: 'chopp', quantidade: 2 }], cardapio);
    expect(p.linhas).toHaveLength(1);
    expect(p.linhas[0].quantidade).toBe(3);
    expect(p.setores).toEqual(['bar']);
  });
  it('recusa pedido vazio, quantidade inválida, produto inexistente ou indisponível', () => {
    expect(() => montarPedido([], cardapio)).toThrow(/pelo menos um/);
    expect(() => montarPedido([{ produtoId: 'chopp', quantidade: 0 }], cardapio)).toThrow(/inteiro/);
    expect(() => montarPedido([{ produtoId: 'chopp', quantidade: 1.5 }], cardapio)).toThrow(/inteiro/);
    expect(() => montarPedido([{ produtoId: 'x', quantidade: 1 }], cardapio)).toThrow(/não existe/);
    expect(() => montarPedido([{ produtoId: 'caipi', quantidade: 1 }], cardapio)).toThrow(/indisponível/);
    expect(() => montarPedido([{ produtoId: 'chopp', quantidade: 100 }], cardapio)).toThrow(/acima/);
  });
  it('registra o valor cobrado e marca divergência quando o preço mudou depois da prévia', () => {
    const p = montarPedido([{ produtoId: 'chopp', quantidade: 2 }], cardapio);
    const igual = aplicarPrecosCobrados(p, [{ produtoId: 'chopp', precoCentavos: 1250 }], 2500);
    expect(igual.divergencia).toBe(false);
    const antigo = aplicarPrecosCobrados(p, [{ produtoId: 'chopp', precoCentavos: 1100 }], 2200);
    expect(antigo.totalCentavos).toBe(2200);
    expect(antigo.divergencia).toBe(true);
    expect(() => aplicarPrecosCobrados(p, [{ produtoId: 'chopp', precoCentavos: 1250 }], 9999)).toThrow(/não confere/);
  });
  it('aceita só chaves de envio bem formadas', () => {
    expect(chaveValida('3f2b1c9a-1111-4222-8333-944455556666')).toBe(true);
    expect(chaveValida('curta')).toBe(false);
    expect(chaveValida("x'; drop table")).toBe(false);
  });
});

describe('preparo', () => {
  it('avança um passo por vez', () => {
    expect(proximoStatus('novo')).toBe('preparando');
    expect(proximoStatus('pronto')).toBe('entregue');
    expect(proximoStatus('entregue')).toBeNull();
  });
  it('cada setor mexe só no que é seu; o garçom marca entregue', () => {
    expect(podeMudarStatus('novo', 'preparando', 'cozinha', 'cozinha')).toBe(true);
    expect(podeMudarStatus('novo', 'preparando', 'bar', 'cozinha')).toBe(false);
    expect(podeMudarStatus('novo', 'pronto', 'cozinha', 'cozinha')).toBe(false);
    expect(podeMudarStatus('preparando', 'novo', 'cozinha', 'cozinha')).toBe(true);
    expect(podeMudarStatus('pronto', 'preparando', 'bar', 'bar')).toBe(true);
    expect(podeMudarStatus('pronto', 'entregue', 'garcom', 'bar')).toBe(true);
    expect(podeMudarStatus('pronto', 'entregue', 'bar', 'bar')).toBe(false);
    expect(podeMudarStatus('preparando', 'pronto', 'garcom', 'bar')).toBe(false);
    expect(podeMudarStatus('entregue', 'pronto', 'admin', 'bar')).toBe(false);
    expect(podeMudarStatus('novo', 'cancelado', 'admin', 'bar')).toBe(false);
  });
  it('resume a situação do pedido pelos setores', () => {
    expect(situacaoPedido([{ setor: 'cozinha', status: 'novo' }, { setor: 'bar', status: 'novo' }])).toBe('aguardando');
    expect(situacaoPedido([{ setor: 'cozinha', status: 'preparando' }, { setor: 'bar', status: 'novo' }])).toBe('em_preparo');
    expect(situacaoPedido([{ setor: 'cozinha', status: 'preparando' }, { setor: 'bar', status: 'pronto' }])).toBe('parcial');
    expect(situacaoPedido([{ setor: 'cozinha', status: 'pronto' }, { setor: 'bar', status: 'entregue' }])).toBe('pronto');
    expect(situacaoPedido([{ setor: 'bar', status: 'entregue' }])).toBe('entregue');
    expect(situacaoPedido([{ setor: 'bar', status: 'cancelado' }])).toBe('cancelado');
  });
});

describe('cancelamento e estorno', () => {
  it('é cancelamento antes de preparar e estorno depois', () => {
    expect(tipoEncerramento(['novo', 'novo'])).toBe('cancelado');
    expect(tipoEncerramento(['novo', 'preparando'])).toBe('estornado');
    expect(tipoEncerramento(['entregue'])).toBe('estornado');
  });
  it('exige administrador, pedido pago e motivo', () => {
    expect(() => conferirEncerramento('garcom', 'pago')).toThrow(/administrador/);
    expect(() => conferirEncerramento('admin', 'cancelado')).toThrow(/já foi/);
    expect(() => conferirEncerramento('admin', 'pago')).not.toThrow();
    expect(() => validarMotivo('  ')).toThrow(/motivo/);
    expect(validarMotivo('  Cliente desistiu ')).toBe('Cliente desistiu');
  });
});

describe('turno', () => {
  it('venda de madrugada pertence à noite anterior', () => {
    expect(dataOperacional(new Date('2026-10-24T05:00:00Z'))).toBe('2026-10-23'); // 2h em São Paulo
    expect(dataOperacional(new Date('2026-10-24T10:00:00Z'))).toBe('2026-10-24'); // 7h
    expect(dataOperacional(new Date('2026-10-24T05:00:00Z'), 'America/Sao_Paulo', 0)).toBe('2026-10-24');
  });
});

describe('papéis', () => {
  it('administrador pode tudo; os demais só o que lhes cabe', () => {
    expect(pode('admin', 'garcom')).toBe(true);
    expect(pode('garcom', 'garcom')).toBe(true);
    expect(pode('cozinha', 'garcom')).toBe(false);
  });
});

describe('relatório', () => {
  const base = (o: Partial<PedidoRel>): PedidoRel => ({
    id: 'p', numero: 1, mesa: 1, garcom: 'Ana', totalCentavos: 1000, formaPagamento: 'pix', status: 'pago', hora: 21, divergenciaPreco: false,
    itens: [{ nome: 'Chopp', setor: 'bar', quantidade: 2, subtotalCentavos: 1000 }],
    preparos: [{ setor: 'bar', criadoEm: new Date('2026-10-24T00:00:00Z'), prontoEm: new Date('2026-10-24T00:04:00Z') }],
    ...o,
  });
  it('separa bruto, cancelado, estornado e líquido', () => {
    const r = resumir([
      base({ id: 'a' }),
      base({ id: 'b', mesa: 2, garcom: 'Bia', totalCentavos: 3000, formaPagamento: 'credito', preparos: [{ setor: 'bar', criadoEm: new Date(0), prontoEm: new Date(6 * 60000) }] }),
      base({ id: 'c', status: 'cancelado', totalCentavos: 500 }),
      base({ id: 'd', status: 'estornado', totalCentavos: 700 }),
    ]);
    expect(r.brutoCentavos).toBe(5200);
    expect(r.canceladoCentavos).toBe(500);
    expect(r.estornadoCentavos).toBe(700);
    expect(r.liquidoCentavos).toBe(4000);
    expect(r.pedidos).toBe(2);
    expect(r.ticketMedioCentavos).toBe(2000);
    expect(r.porForma.map((l) => l.chave)).toEqual(['credito', 'pix']);
    expect(r.porProduto[0]).toMatchObject({ chave: 'Chopp', quantidade: 4 });
    expect(r.tempoMedioMin.bar).toBe(5);
  });
  it('gera CSV que o Excel abre', () => {
    expect(csv([['a;b', 1], ['x"y', 2]])).toBe('﻿"a;b";1\r\n"x""y";2');
  });
});
