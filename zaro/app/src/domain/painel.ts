// Regras do Dashboard executivo: séries do gráfico, fluxo projetado, progresso do fechamento,
// prioridades e insights. Tudo aqui é calculado a partir de registros reais; quando não há
// evidência, a função devolve vazio (nunca um número de demonstração).
import { addDias, arred } from './dinheiro';

export const ehTributo = (t: { nome: string; categoria?: string | null; descricao?: string | null }) =>
  /\b(darf|pgdas|das-mei|gps|dae|dam|fgts|inss|irpj|csll|pis|cofins|icms|iss|ipi|irrf|dctfweb|simples nacional|receita federal|sefaz|parcelamento rfb|pgfn)\b|tribut|impost/i.test(`${t.nome} ${t.categoria || ''} ${t.descricao || ''}`);

/** "2026-10" → ["2026-05", ..., "2026-10"] (n meses terminando no mês dado). */
export function mesesAte(fim: string, n: number) {
  const [a, m] = fim.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export const ultimoDia = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

export interface Movimento {
  data: string;
  valor: number;
  tipo: 'receber' | 'pagar';
}

/** Realizado por mês (baixas): recebimentos, pagamentos e saldo do mês (recebido − pago). */
export function serieMensal(movs: Movimento[], meses: string[]) {
  return meses.map((mes) => {
    const doMes = movs.filter((x) => x.data.startsWith(mes));
    const entradas = arred(doMes.filter((x) => x.tipo === 'receber').reduce((a, x) => a + x.valor, 0));
    const saidas = arred(doMes.filter((x) => x.tipo === 'pagar').reduce((a, x) => a + x.valor, 0));
    return { mes, entradas, saidas, saldo: arred(entradas - saidas) };
  });
}

export interface Aberto {
  venc: string | null;
  saldo: number;
  tipo: 'receber' | 'pagar';
}

/**
 * Fluxo dos próximos `dias` em blocos de 7 dias, só com títulos em aberto (previsões cadastradas).
 * Vencidos ficam à parte (não entram no "previsto", mas aparecem para não sumirem).
 * Saldo inicial é o saldo bancário efetivo; sem ele, a projeção mostra só o líquido do período.
 */
export function fluxoProjetado(saldoInicial: number | null, abertos: Aberto[], hoje: string, dias = 30) {
  const fim = addDias(hoje, dias - 1);
  const vencidos = {
    entradas: arred(abertos.filter((t) => t.tipo === 'receber' && t.venc && t.venc < hoje).reduce((a, t) => a + t.saldo, 0)),
    saidas: arred(abertos.filter((t) => t.tipo === 'pagar' && t.venc && t.venc < hoje).reduce((a, t) => a + t.saldo, 0)),
  };
  const semanas: { de: string; ate: string; entradas: number; saidas: number; saldo: number }[] = [];
  let acumulado = saldoInicial ?? 0;
  for (let ini = hoje; ini <= fim; ini = addDias(ini, 7)) {
    const ate = addDias(ini, 6) < fim ? addDias(ini, 6) : fim;
    const no = abertos.filter((t) => t.venc && t.venc >= ini && t.venc <= ate);
    const entradas = arred(no.filter((t) => t.tipo === 'receber').reduce((a, t) => a + t.saldo, 0));
    const saidas = arred(no.filter((t) => t.tipo === 'pagar').reduce((a, t) => a + t.saldo, 0));
    acumulado = arred(acumulado + entradas - saidas);
    semanas.push({ de: ini, ate, entradas, saidas, saldo: acumulado });
  }
  const entradas = arred(semanas.reduce((a, s) => a + s.entradas, 0));
  const saidas = arred(semanas.reduce((a, s) => a + s.saidas, 0));
  return { saldoInicial, semanas, entradas, saidas, vencidos, saldoFinal: arred((saldoInicial ?? 0) + entradas - saidas), temSaldoInicial: saldoInicial != null };
}

/** Saldo de um título numa data: valor (se já existia) menos baixas até a data. */
export function emAbertoEm(t: { valor: number; criadoEm: string; baixas: { data: string; valor: number }[] }, data: string) {
  if (t.criadoEm > data) return 0;
  return Math.max(0, arred(t.valor - t.baixas.filter((b) => b.data <= data).reduce((a, b) => a + b.valor, 0)));
}

export interface Tarefa {
  ok: boolean;
  /** tarefa que não se aplica à empresa nesta competência (ex.: sem funcionários) */
  naoSeAplica?: boolean;
  erro?: boolean;
  texto: string;
  acao: string;
  href: string;
}

/** Progresso real: tarefas cumpridas / tarefas que se aplicam. Sem tarefas aplicáveis → null. */
export function progresso(tarefas: Tarefa[]) {
  const validas = tarefas.filter((t) => !t.naoSeAplica);
  if (!validas.length) return { pct: null as number | null, pendencias: [] as Tarefa[], erros: 0, proxima: null as Tarefa | null };
  const pendencias = validas.filter((t) => !t.ok);
  return {
    pct: Math.round(((validas.length - pendencias.length) / validas.length) * 100),
    pendencias,
    erros: pendencias.filter((t) => t.erro).length,
    proxima: pendencias.find((t) => t.erro) || pendencias[0] || null,
  };
}

export interface Alerta {
  titulo: string;
  detalhe: string;
  href: string;
  /** 3 crítico (vencido / erro), 2 alto, 1 atenção */
  gravidade: 1 | 2 | 3;
  /** dias de atraso (positivo) ou para vencer (negativo); null sem prazo */
  dias: number | null;
  valor: number;
  modulo: string;
}

/** Urgência: gravidade, depois atraso/prazo mais apertado, depois valor. */
export function ordenarAlertas(a: Alerta[]) {
  return [...a].sort((x, y) => y.gravidade - x.gravidade || (y.dias ?? -999) - (x.dias ?? -999) || y.valor - x.valor);
}

export interface Insight {
  titulo: string;
  texto: string;
  href: string;
  tom: 'bom' | 'atencao' | 'risco';
  prioridade: number;
}

export interface EntradaInsights {
  recebidoMes: number;
  recebidoMesAnterior: number;
  pagoMes: number;
  pagoMesAnterior: number;
  pagar7: number;
  pagarAVencer: number;
  receberAberto: number;
  receberVencido: number;
  pagarVencido: number;
  entradas30: number;
  notasForaZaro: number;
  mes: string;
}

const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);
const brlCurto = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Até 3 insights, só quando os registros mostram a situação (nada é inventado para preencher). */
export function gerarInsights(e: EntradaInsights): Insight[] {
  const out: Insight[] = [];
  if (e.recebidoMesAnterior > 0 && e.recebidoMes > 0 && Math.abs(pct(e.recebidoMes, e.recebidoMesAnterior)) >= 20) {
    const p = pct(e.recebidoMes, e.recebidoMesAnterior);
    out.push({ titulo: `Recebimentos ${p > 0 ? 'subiram' : 'caíram'} ${Math.abs(p)}%`, texto: `${brlCurto(e.recebidoMes)} recebidos em ${e.mes.split('-').reverse().join('/')}, contra ${brlCurto(e.recebidoMesAnterior)} no mês anterior.`, href: '/financeiro?tipo=receber&f=quitados', tom: p > 0 ? 'bom' : 'atencao', prioridade: p > 0 ? 2 : 4 });
  }
  if (e.pagarAVencer > 0 && e.pagar7 / e.pagarAVencer >= 0.4 && e.pagar7 >= 1000) {
    out.push({ titulo: 'Pagamentos concentrados na semana', texto: `${brlCurto(e.pagar7)} vencem nos próximos 7 dias: ${Math.round((e.pagar7 / e.pagarAVencer) * 100)}% de tudo o que ainda vai vencer.`, href: '/financeiro?tipo=pagar&f=abertos', tom: 'atencao', prioridade: 5 });
  }
  if (e.pagarVencido > 0 && e.pagarVencido > e.entradas30) {
    out.push({ titulo: 'Atrasados maiores que as entradas previstas', texto: `${brlCurto(e.pagarVencido)} a pagar já vencidos, contra ${brlCurto(e.entradas30)} a receber nos próximos 30 dias.`, href: '/financeiro?tipo=pagar&f=vencidos', tom: 'risco', prioridade: 6 });
  }
  if (e.receberAberto > 0 && e.receberVencido / e.receberAberto >= 0.3) {
    out.push({ titulo: 'Inadimplência alta', texto: `${Math.round((e.receberVencido / e.receberAberto) * 100)}% do contas a receber está vencido (${brlCurto(e.receberVencido)}).`, href: '/financeiro?tipo=receber&f=vencidos', tom: 'risco', prioridade: 5 });
  }
  if (e.notasForaZaro > 0) {
    out.push({ titulo: `${e.notasForaZaro} NF da SEFAZ fora da ZARO`, texto: 'Notas na lista do portal sem título nem XML no Autopilot: podem faltar receitas ou despesas.', href: '/fiscal/notas?f=forazaro', tom: 'atencao', prioridade: 3 });
  }
  return out.sort((a, b) => b.prioridade - a.prioridade).slice(0, 3);
}

/** Módulo de uma linha da auditoria, para a lista de atividades. */
export function moduloDaAcao(acao: string) {
  const a = acao.toLowerCase();
  if (/\bnf\b|nota|autopilot|xml|sefaz|evento/.test(a)) return 'Fiscal';
  if (/folha|holerite|funcion/.test(a)) return 'Departamento Pessoal';
  if (/orçamento|pedido|cotação|solicitação|compra|produto|serviço do cadastro|cliente|fornecedor|custo ao pedido|custo do pedido/.test(a)) return 'Comercial';
  if (/lançamento|conta contábil|balancete|dre|balanço|estorn.*lanç|regra/.test(a)) return 'Contabilidade';
  if (/baixa|título|pagamento|recebimento|extrato|empréstimo|financiamento|venda/.test(a)) return 'Financeiro';
  if (/especialista|conselho|ia\b/.test(a)) return 'ZARO IA';
  if (/empresa|regime/.test(a)) return 'Empresas';
  return 'Sistema';
}
