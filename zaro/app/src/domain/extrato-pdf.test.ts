import { describe, expect, it } from 'vitest';
import { balancete } from './demonstracoes';
import { lerExtratoBradesco, lerExtratoItau, lerExtratoPdf } from './extrato-pdf';
import { gerarLancamentos, type TituloMotor } from './motor';

const ITAU = `         EMPRESA TESTE LTDA CNPJ 00.000.000/0001-00                    Agência 0001  Conta 0012345-6
         Data          Lançamentos                     Razão Social                      CNPJ/CPF                  Valor (R$)  Saldo (R$)
         31/12/2025    SALDO ANTERIOR                                                                                            1.000,00
                       RECEBIMENTOS CLIENTE            CLIENTE ALFA
         02/01/2026                                                                        11.111.111/0001-11          5.000,00
                       COMERCIO...                      LTDA
         02/01/2026    TAR PLANO ADAPT 1 12/25                                                                         -159,00
                       COMPRA NO DÉBITO MAXPEL
         02/01/2026                                      MAXPEL                                                        -180,10
                       -001024
         02/01/2026    SALDO TOTAL DISPONÍVEL DIA                                                                                5.660,90
         05/01/2026    PIX ENVIADO                      FULANO DE TAL                   000.000.000-00               -660,90
         05/01/2026    SALDO EM CONTA CORRENTE                                                                                   5.000,00`;

const BRADESCO = `          Extrato de: Ag: 999 | CC: 0123456-7 | Entre 01/01/2026 e 21/10/2026
          31/12/2025     SALDO ANTERIOR                                                                                               0,00
                         TED-TRANSF ELET DISPON
          19/01/2026                                               1234567               7.425,00                                    7.425,00
                         REMET.CLIENTE BETA LTDA
                         OPERACOES VENCIDAS
                                                                   10019                                        -108,75              7.316,25
                         CONTR. 1111111
          Total                                                                         7.425,00                -108,75              7.316,25`;

describe('extratos em PDF', () => {
  it('Itaú: movimentos com histórico quebrado em linhas e conferência pelos saldos do dia', () => {
    const r = lerExtratoItau(ITAU)!;
    expect(r.conta).toBe('Itaú 0001/0012345-6');
    expect([r.saldoInicial, r.saldoFinal, r.movimentos.length, r.conferidos, r.divergencias.length]).toEqual([1000, 5000, 4, 2, 0]);
    expect(r.movimentos[0].memo).toContain('RECEBIMENTOS CLIENTE');
    expect(r.movimentos[2].memo).toContain('COMPRA NO DÉBITO MAXPEL');
    expect(r.movimentos[1].memo).toBe('TAR PLANO ADAPT 1 12/25');
  });
  it('Bradesco: valor e saldo por linha, data só no primeiro do dia', () => {
    const r = lerExtratoPdf(BRADESCO)!;
    expect(r.banco).toBe('Bradesco');
    expect(r.movimentos.map((m) => [m.data, m.valor])).toEqual([['2026-01-19', 7425], ['2026-01-19', -108.75]]);
    expect(r.movimentos[1].memo).toContain('OPERACOES VENCIDAS');
    expect(r.divergencias).toHaveLength(0);
  });
  it('acusa saldo que não bate', () => {
    expect(lerExtratoBradesco(BRADESCO.replace('7.316,25\n', '7.000,00\n'))!.divergencias.length).toBe(1);
  });
});

describe('extrato na contabilidade', () => {
  const pago: TituloMotor = { id: 'CP-9', tipo: 'pagar', nome: 'Fornecedor Sem Par', categoria: 'Compra de material', competencia: '2026-01', venc: '2026-01-03', valor: 777, status: 'Pago', baixas: [{ data: '2026-01-03', valor: 777 }] };
  const extrato = [
    { id: 'm1', conta: 'Itaú 1/1', data: '2026-01-02', valor: 5000, memo: 'RECEBIMENTOS CLIENTE ALFA' },
    { id: 'm2', conta: 'Itaú 1/1', data: '2026-01-05', valor: -0.9, memo: 'TAR PLANO' },
  ];
  const L = gerarLancamentos({ titulos: [pago], extrato, saldoInicialBanco: { data: '2025-12-31', valor: 1000 }, contratos: [{ id: 'c', instituicao: 'X', contrato: '1', tipo: 'Empréstimo', valor: 60000, dataContr: '2024-01-01', status: 'Ativo' }] } as never);
  const b = balancete(L, { de: '2026-01', ate: '2026-12' }, true);
  const saldo = (c: string) => b.linhas.find((l) => l.conta === c)?.final || 0;
  it('o banco fecha com o extrato e o pagamento sem par fica a conciliar', () => {
    expect(saldo('1.1.1.02')).toBe(1000 + 5000 - 0.9);
    expect(saldo('1.1.9.98')).toBe(-777);
    expect(L.find((l) => l.id === 'BKSALDO|abertura')!.valor).toBe(59000); // 60.000 do empréstimo de 2024 × 1.000 no extrato
  });
});

describe('contraparte no extrato', () => {
  it('funcionário, empresa do grupo (também só pelo CNPJ), cliente conhecido, saque e guia', async () => {
    const { lancamentosDoExtrato } = await import('./motor');
    const cliente: TituloMotor = { id: 'CR-1', tipo: 'receber', nome: 'TEC TOY S.A', valor: 9999, status: 'A receber', venc: '2026-01-01' };
    const L = lancamentosDoExtrato([
      { id: 'a', conta: 'Itaú', data: '2026-03-01', valor: -60, memo: 'PIX ENVIADO JOAO PEREIRA DA SILVA' },
      { id: 'b', conta: 'Itaú', data: '2026-03-01', valor: 5000, memo: 'PIX RECEBIDO A B S SERVICOS 58.981.264/0001-53' },
      { id: 'c', conta: 'Itaú', data: '2026-03-02', valor: -700, memo: 'PIX ENVIADO 58.981.264/0001-53' },
      { id: 'd', conta: 'Itaú', data: '2026-03-03', valor: 5200, memo: 'RECEBIMENTOS TEC TOY S.A 22.770.366/0001-82' },
      { id: 'e', conta: 'Itaú', data: '2026-03-03', valor: -500, memo: 'SAQUE DIN ATM' },
      { id: 'f', conta: 'Itaú', data: '2026-03-04', valor: -300, memo: 'PAGAMENTOS TRIB COD BARRAS' },
      { id: 'g', conta: 'Itaú', data: '2026-03-05', valor: 344, memo: 'PIX RECEBIDO A B S INDUSTRIAL DA AMAZONIA EIRELI' },
    ], [cliente], 'A B S INDUSTRIAL DA AMAZONIA LTDA', {}, ['JOAO PEREIRA DA SILVA']);
    expect(L.map((l) => [l.origemId, l.deb === '1.1.1.02' ? l.cred : l.deb])).toEqual([
      ['a', '2.1.2.01'], ['b', '2.1.5.01'], ['c', '2.1.5.01'], ['d', '1.1.2.01'], ['e', '1.1.1.01'], ['f', '2.1.4.01'], ['g', '1.1.9.97'],
    ]);
  });
});
