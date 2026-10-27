import { describe, expect, it } from 'vitest';
import { balancete } from './demonstracoes';
import { lancamentosDaFolha, lerResumoFolha, resumoConfere, type ResumoFolha } from './folha-contabil';

const SINTETICA = `EMPRESA TESTE LTDA / Sistema de folha
Listagem Sintética da Folha de Pagamento: Mensal - Janeiro/2026 a Outubro/202627/10/2026
Vencimentos Valor Descontos Ref. Valor Bases ValorRef.
0001 - Salário 741,00 76.007,14 0028 - Desc. Férias 1.192,46 001 - INSS 79.314,40
0100 - Hora Extra 50% 48:05 1.394,63 0093 - Vale Transporte 2.705,65 003 - IRRF 62.720,05
0506 - DSR H. Extras 66,00 611,21 0511 - Arred. Mês Ant. 12,21 006 - FGTS 79.314,40
0510 - Arredondamento 10,62 0513 - Arr. Adiant. M. 9,42 008 - Valor FGTS 6.345,09
0720 - Férias 8,00 976,07 0515 - Desc. Adto Sal. 38.016,91 014 - DSR S/ HE 1.394,63
0721 - 1/3 Ab. Ob. Fér 8,00 325,35 0520 - Desc. INSS 270,00 7.262,44 017 - RAIS 79.314,40
1001 - Cesta Basica 1,00 3.120,00 0530 - Desc. IRRF 55,00 699,93 018 - GPS - Empresa 15.862,88
019 - GPS - Terceiros 840,70
020 - GPS - RAT 1.944,59
82.445,02 (49.899,02) 32.546,00Total Vencimentos Total Descontos Salário Líquido`;

const saldo = (L: ReturnType<typeof lancamentosDaFolha>, conta: string, ate = '2026-12') => balancete(L, { de: '2026-01', ate }, true).linhas.find((l) => l.conta === conta)?.final || 0;

describe('resumo da folha na contabilidade', () => {
  const r = lerResumoFolha(SINTETICA)!;
  it('lê período, rubricas e totais', () => {
    expect([r.de, r.ate]).toEqual(['2026-01', '2026-10']);
    expect(r.vencimentos).toHaveLength(7);
    expect(r.descontos).toHaveLength(7);
    expect(resumoConfere(r)).toBe(true);
  });
  it('salários a pagar = líquido + adiantamento + férias pagas antes; encargos e retenções', () => {
    const L = lancamentosDaFolha([{ id: 'F', resumo: r }]);
    expect(L.every((l) => l.comp === '2026-10')).toBe(true);
    expect(saldo(L, '2.1.2.01')).toBeCloseTo(32546 + 38016.91 + 1192.46, 2);
    expect(saldo(L, '2.1.2.02')).toBeCloseTo(7262.44 + 15862.88 + 840.7 + 1944.59, 2);
    expect(saldo(L, '2.1.2.03')).toBe(6345.09);
    expect(saldo(L, '2.1.2.04')).toBe(699.93);
    expect(saldo(L, '4.1.2.03')).toBeCloseTo(976.07 + 325.35, 2);
  });
  it('resumos acumulados lançam só a diferença no mês final (jan–set e jan–out)', () => {
    const set: ResumoFolha = { ...r, ate: '2026-09', vencimentos: r.vencimentos.map((v) => ({ ...v, valor: v.codigo === '0001' ? 68000 : v.valor })) };
    const L = lancamentosDaFolha([{ id: 'A', resumo: set, importadoEm: '1' }, { id: 'B', resumo: r, importadoEm: '2' }]);
    expect(saldo(L, '4.1.2.01', '2026-09')).toBeCloseTo(68000 + 1394.63 + 611.21 + 10.62 - 12.21 - 9.42, 2);
    expect(saldo(L, '4.1.2.01', '2026-10')).toBeCloseTo(76007.14 + 1394.63 + 611.21 + 10.62 - 12.21 - 9.42, 2);
    // o mesmo período importado de novo não duplica
    expect(lancamentosDaFolha([{ id: 'B', resumo: r, importadoEm: '2' }, { id: 'C', resumo: r, importadoEm: '3' }])).toHaveLength(L.filter((l) => l.comp === '2026-09').length);
  });
});
