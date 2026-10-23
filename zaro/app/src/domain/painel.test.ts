import { describe, expect, it } from 'vitest';
import { ehTributo, emAbertoEm, fluxoProjetado, gerarInsights, mesesAte, moduloDaAcao, ordenarAlertas, progresso, serieMensal } from './painel';

describe('dashboard', () => {
  it('meses do gráfico atravessam o ano', () => {
    expect(mesesAte('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('série mensal soma recebimentos e pagamentos realizados', () => {
    const s = serieMensal([{ data: '2026-10-02', valor: 100, tipo: 'receber' }, { data: '2026-10-05', valor: 30.5, tipo: 'pagar' }, { data: '2026-09-30', valor: 7, tipo: 'pagar' }], ['2026-09', '2026-10']);
    expect(s).toEqual([{ mes: '2026-09', entradas: 0, saidas: 7, saldo: -7 }, { mes: '2026-10', entradas: 100, saidas: 30.5, saldo: 69.5 }]);
  });

  it('fluxo projetado: semanas de 7 dias, vencidos à parte e saldo acumulado', () => {
    const f = fluxoProjetado(1000, [
      { venc: '2026-10-20', saldo: 500, tipo: 'pagar' }, // vencido
      { venc: '2026-10-23', saldo: 200, tipo: 'receber' },
      { venc: '2026-10-31', saldo: 300, tipo: 'pagar' },
      { venc: '2026-11-21', saldo: 50, tipo: 'receber' },
      { venc: '2026-11-22', saldo: 999, tipo: 'receber' }, // fora dos 30 dias
      { venc: null, saldo: 10, tipo: 'receber' },
    ], '2026-10-23');
    expect(f.semanas.map((s) => [s.de, s.ate, s.saldo])).toEqual([
      ['2026-10-23', '2026-10-29', 1200], ['2026-10-30', '2026-11-05', 900], ['2026-11-06', '2026-11-12', 900], ['2026-11-13', '2026-11-19', 900], ['2026-11-20', '2026-11-21', 950],
    ]);
    expect(f.vencidos).toEqual({ entradas: 0, saidas: 500 });
    expect(f.saldoFinal).toBe(950);
    expect(fluxoProjetado(null, [], '2026-10-23').temSaldoInicial).toBe(false);
  });

  it('saldo em aberto numa data passada usa só as baixas até lá', () => {
    const t = { valor: 100, criadoEm: '2026-09-01', baixas: [{ data: '2026-09-10', valor: 40 }, { data: '2026-10-05', valor: 60 }] };
    expect(emAbertoEm(t, '2026-08-31')).toBe(0);
    expect(emAbertoEm(t, '2026-09-30')).toBe(60);
    expect(emAbertoEm(t, '2026-10-23')).toBe(0);
  });

  it('progresso só conta o que se aplica e aponta o erro como próxima ação', () => {
    const p = progresso([
      { ok: true, texto: 'a', acao: '', href: '' },
      { ok: false, texto: 'b', acao: '', href: '' },
      { ok: false, erro: true, texto: 'c', acao: '', href: '' },
      { ok: false, naoSeAplica: true, texto: 'd', acao: '', href: '' },
    ]);
    expect(p.pct).toBe(33);
    expect(p.erros).toBe(1);
    expect(p.proxima?.texto).toBe('c');
    expect(progresso([{ ok: false, naoSeAplica: true, texto: '', acao: '', href: '' }]).pct).toBeNull();
  });

  it('alertas: gravidade, depois atraso, depois valor', () => {
    const base = { detalhe: '', href: '', modulo: '' };
    const r = ordenarAlertas([
      { ...base, titulo: 'a', gravidade: 2, dias: 40, valor: 10 },
      { ...base, titulo: 'b', gravidade: 3, dias: 2, valor: 10 },
      { ...base, titulo: 'c', gravidade: 3, dias: 10, valor: 1 },
      { ...base, titulo: 'd', gravidade: 3, dias: 10, valor: 5 },
    ]);
    expect(r.map((x) => x.titulo)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('insights só aparecem com evidência e no máximo 3', () => {
    const vazio = { recebidoMes: 0, recebidoMesAnterior: 0, pagoMes: 0, pagoMesAnterior: 0, pagar7: 0, pagarAVencer: 0, receberAberto: 0, receberVencido: 0, pagarVencido: 0, entradas30: 0, notasForaZaro: 0, mes: '2026-10' };
    expect(gerarInsights(vazio)).toEqual([]);
    const r = gerarInsights({ ...vazio, recebidoMes: 50000, recebidoMesAnterior: 30000, pagar7: 9000, pagarAVencer: 10000, pagarVencido: 80000, entradas30: 20000, receberAberto: 100, receberVencido: 60, notasForaZaro: 2 });
    expect(r).toHaveLength(3);
    expect(r[0].titulo).toBe('Atrasados maiores que as entradas previstas');
  });

  it('classifica tributo sem pegar a palavra "das" comum', () => {
    expect(ehTributo({ nome: 'RECEITA FEDERAL — DARF 1124' })).toBe(true);
    expect(ehTributo({ nome: 'Amazonas Energia', descricao: 'Conta de luz das máquinas' })).toBe(false);
    expect(ehTributo({ nome: 'X', categoria: 'FGTS' })).toBe(true);
  });

  it('módulo das atividades', () => {
    expect(moduloDaAcao('Importou lista de NF da SEFAZ')).toBe('Fiscal');
    expect(moduloDaAcao('Lançou venda')).toBe('Financeiro');
    expect(moduloDaAcao('Importou folha (PDF)')).toBe('Departamento Pessoal');
  });
});
