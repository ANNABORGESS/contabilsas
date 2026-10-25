import { describe, expect, it } from 'vitest';
import { grupoDoTitulo, nomeMes, semanasDoMes, separarParcela } from './relatorio';

describe('Relatório financeiro mensal', () => {
  it('semanas do mês como no modelo', () => {
    expect(semanasDoMes('2026-10').map((s) => s.rotulo)).toEqual(['01–07/out', '08–14/out', '15–21/out', '22–31/out']);
    expect(semanasDoMes('2026-02').at(-1)).toMatchObject({ de: '2026-02-22', ate: '2026-02-28' });
    expect(nomeMes('2026-10')).toBe('outubro');
  });
  it('agrupa por situação', () => {
    const hoje = '2026-10-08';
    expect(grupoDoTitulo({ tipo: 'receber', venc: '2026-10-01', saldo: 10 }, hoje)).toBe('Vencidos');
    expect(grupoDoTitulo({ tipo: 'receber', venc: '2026-10-20', saldo: 10 }, hoje)).toBe('A vencer');
    
    expect(grupoDoTitulo({ tipo: 'pagar', venc: '2026-10-15', saldo: 10 }, hoje)).toBe('Próximos 7 dias');
    expect(grupoDoTitulo({ tipo: 'pagar', venc: '2026-10-16', saldo: 10 }, hoje)).toBe('Restante do mês');
    expect(grupoDoTitulo({ tipo: 'pagar', venc: '2026-10-01', saldo: 0 }, hoje)).toBe('Pagos');
  });
});

describe('Parcela de empréstimo', () => {
  it('separa principal e juros pelo campo ou pela descrição', () => {
    expect(separarParcela(4800, null, 'Juros 8% ALENCAR-2024')).toEqual({ principal: 0, juros: 4800 });
    expect(separarParcela(10400, null, 'Quitação principal R$ 10.000,00 + juros 4% R$ 400,00')).toEqual({ principal: 10000, juros: 400 });
    expect(separarParcela(3766.63, null, 'Financiamento santander/aymoré parcela 14/24')).toEqual({ principal: null, juros: null });
    expect(separarParcela(1000, 120, '')).toEqual({ principal: 880, juros: 120 });
  });
});
