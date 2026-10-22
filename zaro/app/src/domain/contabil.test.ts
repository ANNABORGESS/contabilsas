import { describe, expect, it } from 'vitest';
import { balanco, balancete, dre } from './demonstracoes';
import { classificarDespesa, depreciacaoMensal, gerarLancamentos, type Lancamento, type TituloMotor } from './motor';

const venda: TituloMotor = {
  id: 'CR-1', tipo: 'receber', nome: 'UCB DA AMAZONIA', nf: '1234', competencia: '2026-01', emissao: '2026-01-15', venc: '2026-02-14',
  valor: 1000, status: 'Recebido', impostos: [{ nome: 'ICMS', valor: 200 }, { nome: 'PIS', valor: 6.5 }], baixas: [{ data: '2026-02-14', valor: 1000 }],
};
const compra: TituloMotor = {
  id: 'CP-1', tipo: 'pagar', nome: 'Amazonas Energia', categoria: 'Energia', competencia: '2026-01', emissao: '2026-01-05', venc: '2026-01-20',
  valor: 300, status: 'A pagar',
};
const aprovarTudo = (l: Lancamento[]) => l.map((x) => ({ ...x, status: 'Aprovado' as const }));

describe('motor contábil', () => {
  it('venda gera receita, deduções e recebimento', () => {
    const L = gerarLancamentos({ titulos: [venda] });
    const por = (sufixo: string) => L.find((l) => l.id === `CR-1|${sufixo}`)!;
    expect(por('prov')).toMatchObject({ deb: '1.1.2.01', cred: '3.1.1.01', valor: 1000 });
    expect(por('ded')).toMatchObject({ deb: '3.2.1.01', cred: '2.1.4.01', valor: 206.5 });
    expect(por('pag')).toMatchObject({ deb: '1.1.1.02', cred: '1.1.2.01', valor: 1000 });
  });

  it('compra é classificada pelo fornecedor e aprende regra do contador', () => {
    expect(classificarDespesa(compra).conta).toBe('4.1.3.01');
    expect(classificarDespesa(compra, { 'amazonas energia': '4.1.3.09' })).toMatchObject({ conta: '4.1.3.09', conf: 98 });
    const L = gerarLancamentos({ titulos: [compra] });
    expect(L).toHaveLength(1);
    expect(L[0]).toMatchObject({ deb: '4.1.3.01', cred: '2.1.1.01', status: 'Automático' });
  });

  it('retorno e título cancelado não geram lançamento', () => {
    expect(gerarLancamentos({ titulos: [{ ...venda, retorno: true }, { ...compra, status: 'Cancelado' }] })).toEqual([]);
  });

  it('recebimento que aparece no extrato não é lançado duas vezes', () => {
    const L = gerarLancamentos({ titulos: [venda], extrato: [{ id: 'm9', conta: 'Itaú', data: '2026-02-14', valor: 1000, memo: 'PIX UCB AMAZONIA' }] });
    expect(L.some((l) => l.id === 'CR-1|pag')).toBe(false);
    expect(L.find((l) => l.id === 'BKX|m9')).toMatchObject({ deb: '1.1.1.02', cred: '1.1.2.01' });
  });

  it('estorno cria o lançamento inverso', () => {
    const L = gerarLancamentos({ titulos: [compra], decisoes: { status: { 'CP-1|prov': 'Estornado' }, estornos: { 'CP-1|prov': { motivo: 'erro', data: '2026-01-31' } } } });
    const inv = L.find((l) => l.id === 'CP-1|prov|est')!;
    expect(inv).toMatchObject({ deb: '2.1.1.01', cred: '4.1.3.01', status: 'Contabilizado', data: '2026-01-31' });
  });

  it('depreciação linear para no valor residual', () => {
    const d = depreciacaoMensal({ id: 'M1', descricao: 'Torno', qtd: 1, valor: 1200, data: '2026-01-10', taxa: 10, residual: 1185, origem: 'compra' }, '2026-12');
    expect(d.map((x) => x.comp)).toEqual(['2026-02', '2026-03']);
    expect(d.map((x) => x.valor)).toEqual([10, 5]);
  });
});

describe('demonstrações', () => {
  const L = aprovarTudo(
    gerarLancamentos({
      titulos: [venda, { ...compra, status: 'Pago', baixas: [{ data: '2026-01-20', valor: 300 }] }],
      imobilizado: [{ id: 'M1', descricao: 'Torno', qtd: 1, valor: 12000, data: '2025-12-01', taxa: 10, origem: 'abertura' }],
      hoje: '2026-02-28',
    }),
  );

  it('balancete fecha: débitos = créditos', () => {
    const b = balancete(L, { de: '2026-01', ate: '2026-02' });
    expect(b.totalDebitos).toBe(b.totalCreditos);
    expect(b.linhas.find((l) => l.conta === '1.1.1.02')!.final).toBe(700);
  });

  it('só lançamentos aprovados entram, a não ser na prévia', () => {
    const naoAprov = gerarLancamentos({ titulos: [venda] });
    expect(dre(naoAprov, { de: '2026-01', ate: '2026-12' }).resultado).toBe(0);
    expect(dre(naoAprov, { de: '2026-01', ate: '2026-12' }, true).resultado).toBe(793.5);
  });

  it('DRE: receita − deduções − custos − despesas − depreciação', () => {
    // 1000 − 206,50 − 300 (energia) − 200 (2 meses de depreciação de 12.000 a 10% a.a.)
    expect(dre(L, { de: '2026-01', ate: '2026-02' }).resultado).toBe(293.5);
  });

  it('balanço fecha: ativo = passivo + patrimônio líquido', () => {
    const b = balanco(L, '2026-02');
    expect(b.fecha).toBe(true);
    expect(b.ativo).toBe(b.passivo + b.pl);
  });
});

describe('Lucro Presumido (estimativa)', () => {
  it('calcula IRPJ com adicional acima de R$ 60 mil de base no trimestre', async () => {
    const { tributosPresumido } = await import('./presumido');
    const t = tributosPresumido({ produtos: 1_000_000, servicos: 0 });
    // base IRPJ 80.000 → 15% = 12.000 + 10% de 20.000 = 2.000
    expect(t.irpj).toBe(14000);
    expect(t.csll).toBe(10800); // 12% × 1.000.000 × 9%
    expect(t.pis).toBe(6500);
    expect(t.cofins).toBe(30000);
  });
  it('serviço usa presunção de 32%', async () => {
    const { tributosPresumido } = await import('./presumido');
    expect(tributosPresumido({ produtos: 0, servicos: 100_000 }).baseIrpj).toBe(32000);
  });
});

describe('extrato bancário', () => {
  it('saída que bate com título vira baixa de fornecedor; o resto é classificado pelo histórico', async () => {
    const { lancamentosDoExtrato } = await import('./motor');
    const L = lancamentosDoExtrato(
      [
        { id: 'm1', conta: 'Itaú', data: '2026-01-21', valor: -300, memo: 'PAGTO AMAZONAS ENERGIA' },
        { id: 'm2', conta: 'Itaú', data: '2026-01-22', valor: -12.5, memo: 'TARIFA PACOTE SERVICOS' },
        { id: 'm3', conta: 'Itaú', data: '2026-01-23', valor: 450, memo: 'PIX RECEBIDO FULANO' },
        { id: 'm4', conta: 'Itaú', data: '2026-01-24', valor: -1000, memo: 'TRANSF MESMA TITULARIDADE' },
      ],
      [compra],
      'A B S INDUSTRIAL',
      {},
    );
    expect(L.map((l) => [l.origemId, l.deb, l.cred])).toEqual([
      ['m1', '2.1.1.01', '1.1.1.02'],
      ['m2', '4.2.1.02', '1.1.1.02'],
      ['m3', '1.1.1.02', '2.1.9.99'],
    ]);
  });

  it('pagamento que está no extrato sai só pelo extrato; pagamento fora do extrato continua lançado', () => {
    const outra: TituloMotor = { ...compra, id: 'CP-2', nome: 'Posto Ipiranga', valor: 99, status: 'Pago', baixas: [{ data: '2026-01-25', valor: 99 }] };
    const L = gerarLancamentos({
      titulos: [{ ...compra, status: 'Pago', baixas: [{ data: '2026-01-20', valor: 300 }] }, outra],
      extrato: [{ id: 'm1', conta: 'Itaú', data: '2026-01-20', valor: -300, memo: 'PAGTO AMAZONAS ENERGIA' }],
    });
    expect(L.filter((l) => l.cred === '1.1.1.02').map((l) => l.id).sort()).toEqual(['BKX|m1', 'CP-2|pag']);
  });
});
