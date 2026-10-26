import { describe, expect, it } from 'vitest';
import { limparDescServico, produtosVendidos, separarCodigo } from './produtos-vendidos';

describe('produtos vendidos sob encomenda', () => {
  it('separa o código do produto do nome', () => {
    expect(separarCodigo('04PRMC0003 - IMA NOS CARRIERS SMD S5X0 50/60W')).toEqual({ codigo: '04PRMC0003', nome: 'IMA NOS CARRIERS SMD S5X0 50/60W' });
    expect(separarCodigo('9099990U0001844 NOZZLE DE INSERTO')).toEqual({ codigo: '9099990U0001844', nome: 'NOZZLE DE INSERTO' });
    expect(separarCodigo('GUIA LONGO 250x40MM')).toEqual({ codigo: '', nome: 'GUIA LONGO 250x40MM' });
    expect(separarCodigo('MORDENTE DO CARRO').codigo).toBe('');
  });

  it('limpa a descrição de serviço da NFS-e', () => {
    expect(limparDescServico('ITEM: 10/01 - CÓD: SERV100037 - SERVIÇO DE ADEQUAÇÃO DA BASE DO JIG - QUANT: 1 UN - VLR UNT: R$ 600,00')).toBe('SERV100037 - SERVIÇO DE ADEQUAÇÃO DA BASE DO JIG');
    expect(limparDescServico('ITEM 0001 - CÓD. PROD.: 04QLSV0009V - SV CONSERTO E REPARO - QUANT: 01- VLR UNIT:R$ 255,00')).toBe('04QLSV0009V - SV CONSERTO E REPARO');
    expect(limparDescServico('ITEM 0001 - CÓD. PROD.: 04QLSV0009V - SV CONSERTO E REPARO, obs.: SERV DE REPARO NO BLOCO - QUANT: 01')).toBe('04QLSV0009V - SV CONSERTO E REPARO');
    expect(limparDescServico('ITEM: 01 - SERVIÇO DE SOLDAGEM NA CAMISA - UND: SV - QUANT: 01')).toBe('SERVIÇO DE SOLDAGEM NA CAMISA');
    expect(limparDescServico('ORDEM: 5088575 - ITEM: SERV0178 - SERVIÇO RETRABALHO / REPARO - UND: SV')).toBe('SERV0178 - SERVIÇO RETRABALHO / REPARO');
    expect(limparDescServico('ITEM: 0001 - PROD: MAMASV005500 - DESCRIÇÃO:SERVICO DE CONFECCAO DE BANCADAS - UN: SV - QTD. 1')).toBe('MAMASV005500 - SERVICO DE CONFECCAO DE BANCADAS');
  });

  it('agrupa por código, soma quantidade e guarda o último preço', () => {
    const r = produtosVendidos([
      { nf: '3976', chave: 'b', tipo: 'NF-e', cliente: 'UCB', pedido: '2', emissao: '2026-10-23', itens: [{ desc: '04PRMC0003 - IMA NOS CARRIERS SMD S5X0 50/60W', ncm: '84663000', un: 'UN', qtd: 24, unit: 395.5, total: 9492 }] },
      { nf: '3973', chave: 'a', tipo: 'NF-e', cliente: 'UCB', pedido: '1', emissao: '2026-10-21', itens: [{ desc: '04PRMC0003 - IMA NOS CARRIERS SMD', ncm: '84663000', un: 'UN', qtd: 1, unit: 390, total: 390 }, { desc: 'MORDENTE DO CARRO', ncm: '', un: 'UN', qtd: 1, unit: 685, total: 685 }] },
      { nf: '25', chave: 'c', tipo: 'NFS-e', cliente: 'HDL', pedido: '52804', emissao: '2026-09-11', itens: [{ desc: 'ITEM: 10/01 - CÓD: SERV100037 - SERVIÇO DE ADEQUAÇÃO - QUANT: 1 UN', ncm: '', un: 'SV', qtd: 1, unit: 600, total: 600 }] },
    ]);
    expect(r[0]).toMatchObject({ codigo: '04PRMC0003', nome: 'IMA NOS CARRIERS SMD S5X0 50/60W', qtd: 25, total: 9882, ultimoPreco: 395.5, ultimaVenda: '2026-10-23', pedidos: ['1', '2'], nfs: ['3973', '3976'], servico: false });
    expect(r.find((p) => p.codigo === 'SERV100037')).toMatchObject({ servico: true, nome: 'SERVIÇO DE ADEQUAÇÃO' });
    expect(r).toHaveLength(3);
  });
});
