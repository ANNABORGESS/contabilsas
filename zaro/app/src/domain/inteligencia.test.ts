import { describe, expect, it } from 'vitest';
import { composicao100, distribuirAnual, duplicidades, foraDoPadrao, inadimplencia, lerLinhaDigitavel, linhaDaConta, projecaoCaixa, resultadoGerencial, semaforo, totaisGerenciais } from './inteligencia';
import type { Lancamento } from './motor';

const l = (deb: string, cred: string, valor: number, hist = '', status: Lancamento['status'] = 'Aprovado'): Lancamento =>
  ({ id: Math.random().toString(), data: '2026-09-10', comp: '2026-09', deb, cred, valor, hist, origemId: 'x', modulo: '', doc: '', motivo: '', conf: 90, auto: true, status });

describe('Executivo', () => {
  const lancs = [
    l('1.1.2.01', '3.1.1.01', 10000), // venda
    l('3.2.1.01', '2.1.4.01', 900), // tributos sobre venda
    l('4.1.1.01', '2.1.1.01', 3000), // custo
    l('4.1.2.01', '2.1.1.01', 2000), // salários
    l('4.1.3.06', '2.1.1.01', 1000), // terceiros
    l('4.1.3.10', '1.2.3.91', 300), // depreciação
    l('4.1.4.01', '2.1.1.01', 400, 'Provisão DARF IRPJ — Receita Federal'),
    l('4.2.1.01', '2.1.1.01', 200), // juros
    l('2.1.1.01', '1.1.1.02', 3000), // pagamento: não é resultado
    l('4.1.3.06', '2.1.1.01', 999, '', 'Sugerido'), // fora sem prévia
  ];
  it('classifica cada conta em uma só linha (sem dupla contagem)', () => {
    expect(linhaDaConta('4.1.4.01', 'DARF CSLL')).toBe('tributosLucro');
    expect(linhaDaConta('4.1.4.01', 'Taxa municipal')).toBe('operacionais');
    expect(linhaDaConta('1.1.1.02')).toBeNull();
  });
  it('lucro, EBITDA e margem a partir dos lançamentos aprovados', () => {
    const t = totaisGerenciais(lancs, () => true, false);
    expect(t.operacionais).toBe(1000);
    const r = resultadoGerencial(t);
    expect(r.liquida).toBe(9100);
    expect(r.lucro).toBe(9100 - 3000 - 2000 - 1000 - 400 - 300 - 200);
    expect(r.ebitda).toBe(r.lucro + 200 + 400 + 300);
    expect(r.margem).toBeCloseTo((r.lucro / 9100) * 100, 1);
    expect(totaisGerenciais(lancs, () => true, true).operacionais).toBe(1999);
  });
  it('composição de R$ 100 soma 100 e mostra prejuízo', () => {
    const c = composicao100(totaisGerenciais(lancs, () => true, false))!;
    expect(c.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(100, 1);
    const p = composicao100({ faturamento: 100, deducoes: 0, custo: 150, pessoal: 0, operacionais: 0, tributosLucro: 0, depreciacao: 0, financeiras: 0 })!;
    expect(p.at(-1)).toMatchObject({ rotulo: 'Prejuízo', valor: -50 });
    expect(composicao100({ faturamento: 0, deducoes: 0, custo: 5, pessoal: 0, operacionais: 0, tributosLucro: 0, depreciacao: 0, financeiras: 0 })).toBeNull();
  });
});

describe('Caixa', () => {
  const itens = [
    { venc: '2026-10-25', saldo: 1000, tipo: 'receber' as const },
    { venc: '2026-10-20', saldo: 500, tipo: 'receber' as const }, // vencido: incerto
    { venc: '2026-10-24', saldo: 1500, tipo: 'pagar' as const },
    { venc: '2026-10-01', saldo: 100, tipo: 'pagar' as const }, // vencido a pagar: entra hoje
  ];
  it('não trata recebimento vencido como garantido e acha o menor saldo', () => {
    const p = projecaoCaixa(800, itens, '2026-10-23', 30);
    expect(p.entradas).toBe(1000);
    expect(p.saidas).toBe(1600);
    expect(p.menor).toEqual({ data: '2026-10-24', saldo: -800 });
    expect(p.negativo).toBe('2026-10-24');
  });
  it('cenários: atraso, aumento de despesas, recuperação e financiamento', () => {
    const p = projecaoCaixa(800, itens, '2026-10-23', 30, { atrasoRecebimentos: 10, aumentoDespesas: 10, recuperacaoVencidos: 50, financiamento: { valor: 2000, data: '2026-10-24' } }, 500);
    expect(p.saidas).toBe(1760);
    expect(p.entradas).toBe(1000 + 2000); // recuperação (30 dias) + atraso de 10 cai fora da janela
    expect(p.pontos.find((x) => x.data === '2026-11-04')!.entradas).toBe(1000);
    expect(p.abaixoDoMinimo).toBeNull();
  });
});

describe('Inadimplência', () => {
  const a = [
    { id: '1', cliente: 'Cliente A', doc: '1', venc: '2026-10-13', saldo: 1000 }, // 10 dias
    { id: '2', cliente: 'Cliente A', doc: '1', venc: '2026-07-15', saldo: 3000 }, // 100 dias
    { id: '3', cliente: 'Cliente B', doc: '2', venc: '2026-11-10', saldo: 6000 }, // a vencer
    { id: '4', cliente: 'Cliente C', doc: '3', venc: '2026-09-01', saldo: 0 }, // liquidado
  ];
  it('taxa com denominador explícito, faixas, atraso médio e ranking', () => {
    const r = inadimplencia(a, '2026-10-23');
    expect(r.totalAberto).toBe(10000);
    expect(r.totalVencido).toBe(4000);
    expect(r.taxa).toBe(40);
    expect(r.clientes).toBe(1);
    expect(r.atrasoMedio).toBe(55);
    expect(r.atrasoMedioPonderado).toBe(78);
    expect(r.faixas[0]).toMatchObject({ valor: 1000, pct: 25 });
    expect(r.faixas[4]).toMatchObject({ valor: 3000, n: 1 });
    expect(r.ranking).toHaveLength(1);
    expect(r.ranking[0]).toMatchObject({ cliente: 'Cliente A', valor: 4000, titulos: 2, maiorAtraso: 100 });
  });
});

describe('Pagamentos', () => {
  const mod10 = (s: string) => { let soma = 0; [...s].reverse().forEach((c, i) => { let n = Number(c) * (i % 2 === 0 ? 2 : 1); if (n > 9) n -= 9; soma += n; }); return String((10 - (soma % 10)) % 10); };
  const linha = (fator: number, valor: string) => {
    const c1 = '001900000', c2 = '0000000000', c3 = '0000000000';
    return c1 + mod10(c1) + c2 + mod10(c2) + c3 + mod10(c3) + '1' + String(fator).padStart(4, '0') + valor.padStart(10, '0');
  };
  it('lê valor e vencimento da linha digitável (fator novo e antigo)', () => {
    const r = lerLinhaDigitavel(linha(1000 + 608, '123456'), '2026-10-23')!; // 22/02/2025 + 608 dias
    expect(r).toMatchObject({ banco: '001', valor: 1234.56, venc: '2026-10-23', camposOk: true });
    expect(lerLinhaDigitavel(linha(9000, '100'), '2022-01-01')!.venc).toBe('2022-05-29');
    expect(lerLinhaDigitavel('123', '2026-10-23')).toBeNull();
    const errado = linha(1500, '1').split(''); errado[9] = errado[9] === '0' ? '1' : '0';
    expect(lerLinhaDigitavel(errado.join(''), '2026-10-23')!.camposOk).toBe(false);
  });
  it('acha duplicidade por NF e por valor/vencimento próximo, e valor fora do padrão', () => {
    const t = (id: string, nf: string | null, valor: number, venc: string) => ({ id, codigo: id, nome: 'Forn', doc: '9', nf, valor, venc, aberto: true });
    const d = duplicidades([t('1', '10', 100, '2026-10-01'), t('2', '10', 100, '2026-11-01'), t('3', null, 50, '2026-10-01'), t('4', null, 50, '2026-10-04'), t('5', '11', 70, '2026-10-01'), t('6', '12', 70, '2026-10-01')]);
    expect(d.map((x) => x.motivo)).toEqual(['mesma NF 10 e mesmo valor', 'mesmo valor com vencimentos próximos']);
    const hist = [t('a', null, 100, '2026-01-01'), t('b', null, 110, '2026-02-01'), t('c', null, 90, '2026-03-01')];
    expect(foraDoPadrao(t('x', null, 300, '2026-04-01'), hist)).toEqual({ mediana: 100 });
    expect(foraDoPadrao(t('x', null, 150, '2026-04-01'), hist)).toBeNull();
  });
});

describe('Orçamento', () => {
  it('semáforo diferente para despesa e receita', () => {
    expect(semaforo(1000, 850, 'despesa').status).toBe('verde');
    expect(semaforo(1000, 950, 'despesa').status).toBe('amarelo');
    expect(semaforo(1000, 1200, 'despesa').status).toBe('coral');
    expect(semaforo(1000, 1200, 'receita').status).toBe('verde');
    expect(semaforo(1000, 950, 'receita').status).toBe('amarelo');
    expect(semaforo(1000, 700, 'receita').status).toBe('coral');
    expect(semaforo(0, 10, 'despesa').status).toBe('coral');
  });
  it('distribui o anual em 12 meses sem perder centavo', () => {
    const m = distribuirAnual(1000);
    expect(m).toHaveLength(12);
    expect(m.reduce((a, x) => a + x, 0)).toBeCloseTo(1000, 2);
  });
});
