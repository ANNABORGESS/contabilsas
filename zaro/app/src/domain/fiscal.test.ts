import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addDias, dividir, numero } from './dinheiro';
import { lerXmlFiscal, type NotaFiscal } from './nfe';
import { direcaoDaNota, ehCfopRetorno, ehRetorno, titulosDaNota } from './operacao';
import { regimeEm } from './regime';

const xml = (nome: string) => readFileSync(path.join(__dirname, '__fixtures__', nome), 'utf8');
const nota = (nome: string) => lerXmlFiscal(xml(nome)) as NotaFiscal;
const ABS = '08.201.911/0001-99';

describe('dinheiro', () => {
  it('divide sem perder centavos', () => {
    expect(dividir(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(dividir(100, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });
  it('entende número brasileiro e com ponto', () => {
    expect(numero('1.234,56')).toBe(1234.56);
    expect(numero('1234.56')).toBe(1234.56);
    expect(numero('')).toBe(0);
  });
  it('soma dias atravessando o mês', () => expect(addDias('2026-01-15', 30)).toBe('2026-02-14'));
});

describe('regime por vigência', () => {
  const abs = {
    regime: 'Lucro Presumido',
    regimeHist: [
      { regime: 'Simples Nacional', ate: '2025-12-31' },
      { regime: 'Lucro Presumido', de: '2026-01-01' },
    ],
  };
  it('usa o regime da data, não o atual', () => {
    expect(regimeEm(abs, '2025-07-28')).toBe('Simples Nacional');
    expect(regimeEm(abs, '2025-12-31')).toBe('Simples Nacional');
    expect(regimeEm(abs, '2026-01-01')).toBe('Lucro Presumido');
  });
  it('sem histórico, usa o regime cadastrado', () => expect(regimeEm({ regime: 'MEI' }, '2020-01-01')).toBe('MEI'));
});

describe('leitura de XML', () => {
  it('lê NF-e de venda com duplicatas, impostos e zeros à esquerda', () => {
    const n = nota('nfe-venda.xml');
    expect(n.tipo).toBe('NF-e');
    expect(n.dados.chave).toBe('13260108201911000199550010000012341000012345');
    expect(n.dados.emitCnpj).toBe('08201911000199');
    expect(n.dados.cliDoc).toBe('03951798000145');
    expect(n.dados.numero).toBe('1234');
    expect(n.dados.emissao).toBe('2026-01-15');
    expect(n.dados.vNF).toBe(1200.01);
    expect(n.itens).toHaveLength(2);
    expect(n.parcelas).toEqual([
      { n: '001', venc: '2026-02-14', valor: 600 },
      { n: '002', venc: '2026-03-16', valor: 600.01 },
    ]);
    expect(n.impostos.find((i) => i.nome === 'ICMS')).toMatchObject({ valor: 200, aliq: 20 });
    expect(n.dados.forma).toBe('Boleto');
  });
  it('lê referência à nota original no retorno', () => {
    expect(nota('nfe-retorno.xml').dados.refChaves).toEqual(['13260103951798000145550010000098761000098765']);
  });
  it('lê NFS-e ABRASF com ISS retido', () => {
    const n = nota('nfse-abrasf.xml');
    expect(n.tipo).toBe('NFS-e');
    expect(n.dados.vNF).toBe(875);
    expect(n.retencoes.map((r) => r.nome)).toEqual(['IRRF', 'ISS retido']);
    expect(n.dados.vLiq).toBe(818.13);
    expect(n.dados.competencia).toBe('2026-05');
  });
  it('reconhece evento de cancelamento homologado', () => {
    const e = lerXmlFiscal(xml('evento-cancelamento.xml'));
    expect(e).toMatchObject({ tipo: 'Evento', tpEvento: '110111', cancelamento: true, chave: '13260108201911000199550010000012341000012345' });
  });
  it('recusa XML que não é fiscal', () => {
    expect(() => lerXmlFiscal('<pedido><x>1</x></pedido>')).toThrow(/não foi reconhecido/);
    expect(() => lerXmlFiscal('isto não é xml')).toThrow();
  });
});

describe('operação da nota', () => {
  it('NF emitida pela empresa é saída; recebida é entrada; outra é de terceiros', () => {
    expect(direcaoDaNota(nota('nfe-venda.xml'), ABS)).toBe('saida');
    expect(direcaoDaNota(nota('nfe-compra-sem-dup.xml'), ABS)).toBe('entrada');
    expect(direcaoDaNota(nota('nfe-venda.xml'), '11.111.111/0001-11')).toBe('terceiros');
  });
  it('CFOP de remessa, retorno e conserto não é venda', () => {
    for (const c of ['5902', '6916', '5949', '5551', '5920']) expect(ehCfopRetorno(c)).toBe(true);
    for (const c of ['5101', '6102', '5933', '5405']) expect(ehCfopRetorno(c)).toBe(false);
    expect(ehRetorno(nota('nfe-retorno.xml'))).toBe(true);
    expect(ehRetorno(nota('nfe-venda.xml'))).toBe(false);
  });
});

describe('títulos gerados pela nota', () => {
  it('desdobra a venda nas duplicatas do XML', () => {
    const t = titulosDaNota(nota('nfe-venda.xml'), 'saida');
    expect(t.map((x) => [x.tipo, x.parcela, x.venc, x.valor])).toEqual([
      ['receber', '1/2', '2026-02-14', 600],
      ['receber', '2/2', '2026-03-16', 600.01],
    ]);
    expect(t.every((x) => !x.vencEstimado && x.impactaCaixa)).toBe(true);
  });
  it('sem duplicata, vence em emissão + 30 dias e pede revisão', () => {
    const [t] = titulosDaNota(nota('nfe-compra-sem-dup.xml'), 'entrada');
    expect(t).toMatchObject({ tipo: 'pagar', venc: '2026-02-09', valor: 300, vencEstimado: true, contaContabil: '4.1.1.01' });
  });
  it('retorno fica com valor zero no caixa e guarda o valor fiscal', () => {
    const [t] = titulosDaNota(nota('nfe-retorno.xml'), 'saida');
    expect(t).toMatchObject({ valor: 0, valorFiscal: 5000, status: 'Retorno', impactaCaixa: false, retorno: true });
  });
  it('nota com valor zero (cancelada) não gera título', () => {
    const n = nota('nfe-venda.xml');
    n.dados.vNF = 0;
    expect(titulosDaNota(n, 'saida')).toEqual([]);
  });
});
