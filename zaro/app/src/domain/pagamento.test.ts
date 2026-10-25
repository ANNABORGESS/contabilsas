import { describe, expect, it } from 'vitest';
import { gerarLancamentos } from './motor';
import { conferirPagamento, etapaAtingida, parcelar, prioridade, reagendar7, valorFinal } from './pagamento';

describe('Registrar pagamento', () => {
  it('valor final = pago − desconto + juros + multa', () => {
    expect(valorFinal({ valor: 130, desconto: 10, juros: 2.5, multa: 2.6 })).toBe(125.1);
  });
  it('confere contra o saldo', () => {
    expect(conferirPagamento(130, { valor: 130, desconto: 0, juros: 0, multa: 0 })).toBeNull();
    expect(conferirPagamento(130, { valor: 131, desconto: 0, juros: 0, multa: 0 })).toMatch(/maior que o saldo/);
    expect(conferirPagamento(130, { valor: 0, desconto: 0, juros: 0, multa: 0 })).toMatch(/Informe/);
    expect(conferirPagamento(130, { valor: 100, desconto: 0, juros: -1, multa: 0 })).toMatch(/negativos/);
  });
  it('contabiliza juros, multa e desconto separados do principal', () => {
    const l = gerarLancamentos({ titulos: [{ id: 'CP-1', tipo: 'pagar', nome: 'Metal', valor: 130, status: 'Pago', venc: '2026-10-20', competencia: '2026-10', baixas: [{ id: 'b1', data: '2026-10-25', valor: 130, juros: 2, multa: 2.6, desconto: 1 }] }] });
    const v = (sufixo: string) => l.find((x) => x.id.endsWith(sufixo));
    expect(v('|pag')).toMatchObject({ deb: '2.1.1.01', cred: '1.1.1.02', valor: 130 });
    expect(v('|jur')).toMatchObject({ deb: '4.2.1.01', cred: '1.1.1.02', valor: 2 });
    expect(v('|mul')).toMatchObject({ deb: '4.2.1.04', valor: 2.6 });
    expect(v('|des')).toMatchObject({ deb: '1.1.1.02', cred: '4.2.1.03', valor: 1 });
    // saída de caixa líquida = 130 + 2 + 2,6 − 1
    const banco = l.reduce((a, x) => a + (x.deb === '1.1.1.02' ? x.valor : 0) - (x.cred === '1.1.1.02' ? x.valor : 0), 0);
    expect(Math.round(banco * 100) / 100).toBe(-133.6);
  });
});

describe('Planejar pagamento', () => {
  it('prioridade por vencimento, tributo e marcação', () => {
    expect(prioridade({ venc: '2023-02-04', nome: 'METAL ALUMÍNIO' }, '2026-10-25')).toEqual({ nivel: 'Alta', motivo: 'vencido há 1359d' });
    expect(prioridade({ venc: '2026-10-30', nome: 'DARF IRPJ' }, '2026-10-25').nivel).toBe('Alta');
    expect(prioridade({ venc: '2026-10-30', nome: 'Fornecedor' }, '2026-10-25').nivel).toBe('Média');
    expect(prioridade({ venc: '2026-12-30', nome: 'Fornecedor' }, '2026-10-25').nivel).toBe('Baixa');
    expect(prioridade({ venc: '2026-12-30', nome: 'Fornecedor', prioritario: true }, '2026-10-25').nivel).toBe('Alta');
  });
  it('parcela o saldo mês a mês sem perder centavo e respeitando fim de mês', () => {
    const p = parcelar(100, 3, '2026-01-31');
    expect(p.map((x) => x.venc)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(p.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(100, 2);
    expect(p[2].parcela).toBe('3/3');
    expect(() => parcelar(100, 1, '2026-01-31')).toThrow();
  });
  it('reagenda +7 dias e mapeia etapas', () => {
    expect(reagendar7('2026-10-28', '2026-10-20', '2026-10-25')).toBe('2026-11-04');
    expect(reagendar7(null, '2023-02-04', '2026-10-25')).toBe('2026-11-01');
    expect(etapaAtingida({ alertas: 0, etapa: 'Aprovado' })).toBe(3);
    expect(etapaAtingida({ alertas: 1, etapa: 'Título preparado' })).toBe(0);
  });
});

describe('Conciliação manual com o extrato', () => {
  it('a baixa vinculada ao movimento não sai do banco duas vezes', () => {
    const titulos = [{ id: 'CP-9', tipo: 'pagar' as const, nome: 'Fornecedor X', valor: 500, status: 'Pago', venc: '2026-08-01', competencia: '2026-08', baixas: [{ id: 'b9', data: '2026-10-10', valor: 500, extratoId: 'm1' }] }];
    const extrato = [{ id: 'm1', conta: 'Bradesco', data: '2026-10-10', valor: -500, memo: 'PAG BOLETO DIVERSOS' }];
    const l = gerarLancamentos({ titulos, extrato });
    const banco = l.reduce((a, x) => a + (x.deb === '1.1.1.02' ? x.valor : 0) - (x.cred === '1.1.1.02' ? x.valor : 0), 0);
    expect(banco).toBe(-500);
    expect(l.find((x) => x.id === 'BKX|m1')).toMatchObject({ deb: '2.1.1.01', tituloBaixado: 'CP-9', conciliadoManual: true });
    expect(l.some((x) => x.id === 'CP-9|pag')).toBe(false);
  });
});
