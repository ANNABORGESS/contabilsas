import { describe, expect, it } from 'vitest';
import { balanceteComGrupos, balanco, balancete, dre, periodoContabil } from './demonstracoes';
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
  it('confere com o exemplo da skill 02: receita financeira soma sem presunção', async () => {
    const { tributosPresumido } = await import('./presumido');
    const t = tributosPresumido({ produtos: 1_000_000, servicos: 0, financeiras: 5000 });
    expect(t.irpj).toBe(15250);
    expect(t.csll).toBe(11250);
  });
  it('tira o ICMS da base de PIS/COFINS e abate o IRRF retido do IRPJ', async () => {
    const { tributosPresumido } = await import('./presumido');
    const t = tributosPresumido({ produtos: 100_000, servicos: 0, icms: 18_000, irrfRetido: 200 });
    expect(t.pis).toBe(533);
    expect(t.cofins).toBe(2460);
    expect(t.irpj).toBe(1000);
  });
  it('LC 224: antes de 2026 e abaixo de R$ 1,25 mi por trimestre não há acréscimo', async () => {
    const { acrescimosLC224 } = await import('./presumido');
    const q = [0, 1, 2, 3].map(() => ({ produtos: 100_000, servicos: 0 }));
    expect(acrescimosLC224(2025, q.map(() => ({ produtos: 9e6, servicos: 0 }))).every((x) => !x.irpj && !x.csll)).toBe(true);
    expect(acrescimosLC224(2026, q).every((x) => !x.irpj && !x.csll)).toBe(true);
  });
  it('LC 224: majora o excedente; CSLL só a partir do 2º tri de 2026; ajuste anual no 4º', async () => {
    const { acrescimosLC224, tributosPresumido } = await import('./presumido');
    const r = acrescimosLC224(2026, [0, 1, 2, 3].map(() => ({ produtos: 2_000_000, servicos: 0 })));
    // 750 mil acima do limite em cada trimestre × 0,8% (10% de 8%)
    expect(r.map((x) => x.irpj)).toEqual([6000, 6000, 6000, 6000]);
    // CSLL: 0 no 1º; 750 mil × 1,2% no 2º e 3º; no 4º, ano (2º a 4º) 6 mi − 3,75 mi = 2,25 mi × 1,2% − 18 mil já majorados
    expect(r.map((x) => x.csll)).toEqual([0, 9000, 9000, 9000]);
    const t = tributosPresumido({ produtos: 2_000_000, servicos: 0, acrescimoIrpj: r[1].irpj, acrescimoCsll: r[1].csll });
    expect(t.baseIrpj).toBe(166000);
    expect(t.baseCsll).toBe(249000);
  });
  it('LC 224: a sobra do limite passa para o trimestre seguinte e serviço majora 32% → 35,2%', async () => {
    const { acrescimosLC224 } = await import('./presumido');
    const r = acrescimosLC224(2027, [
      { produtos: 0, servicos: 1_000_000 }, // sobra 250 mil
      { produtos: 0, servicos: 2_000_000 }, // limite 1,5 mi → excedente 500 mil
      { produtos: 0, servicos: 1_000_000 }, // limite 1,25 mi
      { produtos: 0, servicos: 1_000_000 },
    ]);
    expect(r[1]).toEqual({ irpj: 16000, csll: 16000, excedente: 500_000 }); // 500 mil × 3,2%
    expect(r[2].irpj).toBe(0);
    // ano: 5 mi, sem excedente anual → o 4º devolve o que foi majorado no 2º
    expect(r[3].irpj).toBe(-16000);
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
      ['m4', '1.1.9.97', '1.1.1.02'], // transferência entre contas próprias: conta de trânsito
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

describe('split payment na contabilidade', () => {
  it('recebimento confirmado: banco pelo líquido, IBS/CBS extinguem a obrigação, taxa é despesa; receita pelo total', async () => {
    const { gerarLancamentos } = await import('./motor');
    const l = gerarLancamentos({
      titulos: [{ id: 'CR-1', tipo: 'receber', nome: 'Cliente', nf: '10', valor: 1000, status: 'Recebido', competencia: '2026-11', emissao: '2026-11-01', impostos: [{ nome: 'IBS', valor: 1 }, { nome: 'CBS', valor: 9 }],
        baixas: [{ id: 'b1', data: '2026-11-10', valor: 1000, split: { ibs: 1, cbs: 9, taxa: 20 } }] }],
      imobilizado: [], contratos: [], decisoes: { status: {}, contas: {}, estornos: {}, regras: {} }, extrato: [], empresaNome: 'X',
    } as never);
    const v = (id: string) => l.find((x) => x.id === id);
    expect(v('CR-1|prov')).toMatchObject({ deb: '1.1.2.01', cred: '3.1.1.01', valor: 1000 });
    expect(v('CR-1|pag')).toMatchObject({ deb: '1.1.1.02', cred: '1.1.2.01', valor: 970 });
    expect(v('CR-1|spl|b1|trib')).toMatchObject({ deb: '2.1.4.01', cred: '1.1.2.01', valor: 10 });
    expect(v('CR-1|spl|b1|taxa')).toMatchObject({ deb: '4.2.1.02', cred: '1.1.2.01', valor: 20 });
    const clientes = l.filter((x) => x.deb === '1.1.2.01' || x.cred === '1.1.2.01').reduce((a, x) => a + (x.deb === '1.1.2.01' ? x.valor : -x.valor), 0);
    expect(Math.round(clientes * 100) / 100).toBe(0);
    // sem split confirmado nada muda
    const s = gerarLancamentos({ titulos: [{ id: 'CR-2', tipo: 'receber', nome: 'C', nf: '11', valor: 500, status: 'Recebido', competencia: '2026-11', baixas: [{ id: 'b', data: '2026-11-10', valor: 500 }] }], imobilizado: [], contratos: [], decisoes: { status: {}, contas: {}, estornos: {}, regras: {} }, extrato: [], empresaNome: 'X' } as never);
    expect(s.find((x) => x.id === 'CR-2|pag')?.valor).toBe(500);
    expect(s.some((x) => x.id.includes('|spl|'))).toBe(false);
  });
});

describe('balancete para impressão', () => {
  it('soma as contas sintéticas com o lado D/C', () => {
    const linhas = [
      { conta: '1.1.1.02', nome: 'Bancos', natureza: 'D' as const, anterior: 100, debitos: 50, creditos: 30, final: 120 },
      { conta: '1.1.2.01', nome: 'Clientes', natureza: 'D' as const, anterior: 0, debitos: 200, creditos: 0, final: 200 },
      { conta: '2.1.1.01', nome: 'Fornecedores', natureza: 'C' as const, anterior: 40, debitos: 10, creditos: 0, final: 30 },
    ];
    const g = balanceteComGrupos(linhas);
    expect(g.map((l) => l.conta)).toEqual(['1', '1.1', '1.1.1', '1.1.1.02', '1.1.2', '1.1.2.01', '2', '2.1', '2.1.1', '2.1.1.01']);
    const ativo = g.find((l) => l.conta === '1')!;
    expect([ativo.anterior, ativo.debitos, ativo.creditos, ativo.final]).toEqual([100, 250, 30, 320]);
    expect(g.find((l) => l.conta === '2')!.final).toBe(-30); // credor
    expect(g.find((l) => l.conta === '1.1.1.02')!.sintetica).toBe(false);
  });
  it('período personalizado de janeiro a setembro', () => {
    expect(periodoContabil({ per: 'pers', de: '2026-01', ate: '2026-09' }, [])).toEqual({ de: '2026-01', ate: '2026-09', titulo: '01/2026 a 09/2026' });
    expect(periodoContabil({ per: 'pers', de: '2026-05', ate: '2026-02' }, [], '2026-10').ate).toBe('2026-10');
  });
});

describe('balanço de abertura', () => {
  it('parte dos saldos de abertura e ignora o histórico até a data', () => {
    const L = gerarLancamentos({
      titulos: [
        { id: 'CP-ANTIGO', tipo: 'pagar', nome: 'Fornecedor Teste', nf: '1', competencia: '2025-06', emissao: '2025-06-10', valor: 500, status: 'Pago' },
        { id: 'CP-NOVO', tipo: 'pagar', nome: 'Fornecedor Teste', nf: '2', competencia: '2026-02', emissao: '2026-02-10', valor: 300, status: 'Aberto' },
        { id: 'CP-PF', tipo: 'pagar', nome: 'FULANO (pessoa física)', origem: 'emprestimo', contrato: 'X', venc: '2026-03-15', valor: 1000, status: 'Aberto' },
      ],
      abertura: { data: '2025-12-31', fonte: 'Balanço 2025', contas: [{ conta: '1.1.1.02', valor: 100 }, { conta: '2.1.1.01', valor: -400 }, { conta: '2.3.2.01', valor: 300 }] },
    });
    expect(L.some((l) => l.origemId === 'CP-ANTIGO')).toBe(false);
    expect(L.some((l) => l.id === 'CP-NOVO|prov')).toBe(true);
    const ab = L.filter((l) => l.id.startsWith('ABERT|'));
    expect(ab).toHaveLength(3);
    expect(ab.every((l) => l.status === 'Aprovado')).toBe(true);
    expect(ab.find((l) => l.id === 'ABERT|2.1.1.01')).toMatchObject({ deb: '2.3.9.99', cred: '2.1.1.01', valor: 400 });
    expect(L.find((l) => l.id === 'CP-PF|prov')?.deb).toBe('2.1.3.02');
  });
});

describe('tributos do Lucro Presumido na contabilidade', () => {
  it('PIS/COFINS como dedução e IRPJ/CSLL como despesa, cada um na obrigação certa', () => {
    const L = gerarLancamentos({
      titulos: [],
      tributosApurados: [
        { tributo: 'PIS', comp: '2026-02', periodo: '02/2026', base: 10000, valor: 65 },
        { tributo: 'IRPJ', comp: '2026-03', periodo: '1º trimestre/2026', base: 8000, valor: 1200 },
        { tributo: 'CSLL', comp: '2026-03', periodo: '1º trimestre/2026', base: 12000, valor: 1080 },
      ],
    });
    expect(L.find((l) => l.id === 'TRIB|PIS|2026-02')).toMatchObject({ deb: '3.2.1.01', cred: '2.1.4.01', valor: 65, data: '2026-02-28' });
    expect(L.find((l) => l.id === 'TRIB|IRPJ|2026-03')).toMatchObject({ deb: '4.3.1.01', valor: 1200, data: '2026-03-31' });
    const d = dre(L.map((l) => ({ ...l, status: 'Aprovado' as const })), { de: '2026-01', ate: '2026-03' });
    expect(d.resultado).toBeCloseTo(-(65 + 1200 + 1080));
    expect(d.linhas.some((x) => x.rotulo === '(−) IRPJ e CSLL')).toBe(true);
  });
});

describe('contas do imobilizado', () => {
  it('informática e veículos em contas próprias', () => {
    const L = gerarLancamentos({ titulos: [], hoje: '2026-02-15', imobilizado: [
      { id: 'A1', descricao: 'Notebook Teste i5', qtd: 1, valor: 1200, data: '2025-12-31', taxa: 20, origem: 'abertura' },
      { id: 'A2', descricao: 'Van Renault Master Minibus', qtd: 1, valor: 120000, data: '2025-12-31', taxa: 20, origem: 'abertura' },
    ] });
    expect(L.find((l) => l.id === 'IMB|A1')?.deb).toBe('1.2.3.02');
    expect(L.find((l) => l.id === 'DEP|A2|2026-01')).toMatchObject({ cred: '1.2.3.93', valor: 2000 });
  });
});

describe('contraparte do extrato', () => {
  it('tira o tipo do PIX, datas e CNPJ e usa o nome completo do Itaú', async () => {
    const { contraparteDoExtrato } = await import('./motor');
    expect(contraparteDoExtrato('PIX ENVIADO FULANO DE TAL SILVA')).toBe('FULANO DE TAL SILVA');
    expect(contraparteDoExtrato('PIX RECEBIDO BELTRA A06/02 BELTRANA ALVES COSTA DOS SANTOS')).toBe('BELTRANA ALVES COSTA DOS');
    expect(contraparteDoExtrato('PIX ENVIADO PIX ENVIADO CICRANO TESTE')).toBe('CICRANO TESTE');
    expect(contraparteDoExtrato('PIX ENVIADO EMPRESA TESTE 12.345.678/0001-90')).toBe('EMPRESA TESTE');
    expect(contraparteDoExtrato('PIX RECEBIDO BELTRA A06/06')).toBe('BELTRA A');
  });
  it('regra aprendida por contraparte classifica o movimento', () => {
    const L = gerarLancamentos({ titulos: [], extrato: [{ id: 'M1', conta: 'Banco Teste', data: '2026-03-02', valor: -500, memo: 'PIX ENVIADO FULANO DE TAL SILVA' }], decisoes: { regras: { 'contraparte:FULANO DE TAL SILVA': '4.1.3.06' } } });
    expect(L.find((l) => l.id === 'BKX|M1')).toMatchObject({ deb: '4.1.3.06', contraparte: 'FULANO DE TAL SILVA' });
  });
});
