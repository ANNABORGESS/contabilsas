import { describe, expect, it } from 'vitest';
import { apuracaoIcms, classificarItem, creditosDaNota } from './creditos';
import { gerarLancamentos } from './motor';

const item = (o: Partial<Parameters<typeof classificarItem>[0]> = {}) => ({ desc: 'CHAPA ACO 1020', ncm: '72085200', cfop: '5101', cst: '00', unit: 50, icms: 18, ipi: 5, total: 100, qtd: 2, un: 'KG', ...o });

describe('classificação do item para crédito', () => {
  it('matéria-prima credita; uso e consumo, ST e Simples não', () => {
    expect(classificarItem(item(), false).classe).toBe('insumo');
    expect(classificarItem(item(), false).credita).toBe(true);
    expect(classificarItem(item({ desc: 'LUVA DE VAQUETA', ncm: '42032100' }), false).classe).toBe('uso_consumo');
    expect(classificarItem(item({ cfop: '5405', cst: '60' }), false).classe).toBe('st');
    expect(classificarItem(item({ cst: '10' }), false).credita).toBe(false);
    expect(classificarItem(item(), true).classe).toBe('simples');
  });
  it('máquina cara é imobilizado; NCM desconhecido fica a confirmar; sem destaque não credita', () => {
    expect(classificarItem(item({ ncm: '84571000', unit: 85000 }), false).classe).toBe('imobilizado');
    expect(classificarItem(item({ ncm: '82077010', desc: 'FRESA TOPO' }), false).credita).toBeNull();
    expect(classificarItem(item({ icms: 0, ipi: 0 }), false).classe).toBe('sem_destaque');
    expect(classificarItem(item({ cfop: '5202' }), false).classe).toBe('devolucao');
  });
});

describe('créditos da nota', () => {
  it('soma ICMS dos insumos, IPI só para contribuinte, e respeita decisão por item e por NCM', () => {
    const itens = [item(), item({ ncm: '82077010', desc: 'FRESA', icms: 10, ipi: 0 }), item({ desc: 'LUVA', ncm: '42032100', icms: 3 })];
    const a = creditosDaNota('D1', itens, { simples: false });
    expect(a.icms).toBe(18);
    expect(a.ipi).toBe(0);
    expect(a.aConfirmar).toBe(1);
    const b = creditosDaNota('D1', itens, { simples: false, config: { contribuinteIpi: true, decisoes: { 'ncm:82077010': 'credita', 'D1|0': 'nao' } } });
    expect(b.icms).toBe(10);
    expect(b.ipi).toBe(0);
    expect(b.itens[1].decididoPor).toBe('ncm');
    expect(b.aConfirmar).toBe(0);
  });
});

describe('apuração mensal do ICMS', () => {
  it('compensa o crédito e leva o saldo credor para o mês seguinte', () => {
    const r = apuracaoIcms({ '2026-01': 100, '2026-02': 500 }, { '2026-01': 300, '2026-02': 50 });
    expect(r[0]).toMatchObject({ compensado: 100, aRecolher: 0, saldoCredor: 200 });
    expect(r[1]).toMatchObject({ saldoAnterior: 200, compensado: 250, aRecolher: 250, saldoCredor: 0 });
  });
});

describe('motor: crédito na compra e compensação', () => {
  it('tira o crédito do custo e abate do ICMS a recolher', () => {
    const L = gerarLancamentos({
      titulos: [{ id: 'CP-1', tipo: 'pagar', nome: 'Fornecedor Teste', nf: '10', origem: 'nf', contaContabil: '4.1.1.01', competencia: '2026-03', emissao: '2026-03-05', valor: 1000, status: 'Aberto' }],
      creditos: [{ id: 'D1', tituloId: 'CP-1', doc: 'NF 10', nome: 'Fornecedor Teste', data: '2026-03-05', comp: '2026-03', icms: 180, ipi: 0 }],
      compensacoesIcms: [{ comp: '2026-03', valor: 120 }],
    });
    const cred = L.find((l) => l.id === 'CRED|D1')!;
    expect(cred).toMatchObject({ deb: '1.1.4.01', cred: '4.1.1.01', valor: 180 });
    const apur = L.find((l) => l.id === 'APUR|ICMS|2026-03')!;
    expect(apur).toMatchObject({ deb: '2.1.4.01', cred: '1.1.4.01', valor: 120, data: '2026-03-31' });
  });
});

describe('casos que dependem do uso', () => {
  it('reservatório e telha ficam a confirmar; saco de lixo é uso e consumo', () => {
    expect(classificarItem(item({ desc: 'RESERVATORIO TIPO TACA', ncm: '73101010' }), false).credita).toBeNull();
    expect(classificarItem(item({ desc: 'TELHA GALVALUME TRAPEZIO', ncm: '73144100' }), false).credita).toBeNull();
    expect(classificarItem(item({ desc: 'SACO DE LIXO 200 LITROS', ncm: '39232190' }), false).classe).toBe('uso_consumo');
  });
});
