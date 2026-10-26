// Split Payment (Reforma Tributária, LC 214/2025): acompanhamento da segregação de IBS e CBS na liquidação
// financeira. Regras do ZARO:
// - o valor destacado na NF NÃO é tratado como segregado; segregado só vem de retorno do provedor de pagamento
//   (PSP) ou de comprovante anexado, e só o confirmado com evidência vai para a contabilidade;
// - nenhuma alíquota é presumida: a simulação usa as alíquotas que o usuário informa ou as destacadas nas NFs;
// - dados reais, estimados e simulados ficam sempre separados.
import { addDias, arred } from './dinheiro';

/** Regras versionadas usadas pelo ZARO (fonte e vigência de cada uma). */
export const REGRAS_SPLIT = [
  { versao: 'SP-2025.1', vigencia: 'desde 16/01/2025', titulo: 'Split payment previsto na LC 214/2025', texto: 'IBS e CBS podem ser segregados e recolhidos na liquidação financeira da operação pelos prestadores de serviços de pagamento e instituições operadoras de sistemas de pagamento, com implantação gradual definida em regulamento.', fonte: 'Lei Complementar nº 214/2025 (planalto.gov.br)' },
  { versao: 'SP-2026.1', vigencia: '2026', titulo: 'Ano de teste: destaque de CBS 0,9% e IBS 0,1%', texto: 'Em 2026 as NFs destacam CBS (0,9%) e IBS (0,1%) em caráter de teste. O ZARO lê esses valores do XML, mas não os trata como segregados nem como recolhidos.', fonte: 'LC 214/2025 · XML das NF-e/NFS-e (grupo IBSCBS)' },
  { versao: 'SP-2026.2', vigencia: 'desde 15/10/2026', titulo: 'Testes técnicos da Plataforma Pública do Split Payment', texto: 'Testes de integração entre prestadores de serviços de pagamento e a plataforma, em ambiente controlado, sem processamento definitivo de transações reais. O split ainda não está habilitado para as empresas em geral.', fonte: 'Receita Federal (anúncio informado em 26/10/2026)' },
] as const;
export const VERSAO_REGRAS = REGRAS_SPLIT[REGRAS_SPLIT.length - 1].versao;

export type EventoSplit = 'pagamento' | 'parcial' | 'estorno' | 'devolucao' | 'antecipacao';
export type StatusSegregacao = 'nao_informado' | 'informado_psp' | 'confirmado';
export type Natureza = 'real' | 'estimado' | 'simulado';

export interface OperacaoSplit {
  id: string;
  evento: EventoSplit;
  data: string; // data da liquidação
  competencia: string;
  nf: string | null;
  tituloId: string | null;
  valorDocumento: number | null; // valor da NF/título (bruto do documento)
  valorBruto: number; // valor pago pelo cliente nesta transação
  ibsDestacado: number | null;
  cbsDestacado: number | null;
  ibsSegregado: number | null; // só do PSP ou comprovante
  cbsSegregado: number | null;
  taxaPsp: number | null;
  valorLiquido: number | null; // o que entrou na conta
  psp: string | null;
  idTransacao: string | null;
  status: StatusSegregacao;
  extratoId: string | null;
}

export const DIVERGENCIAS = {
  sem_documento: 'Operação sem documento fiscal',
  parcial: 'Pagamento parcial',
  estorno: 'Estorno ou devolução',
  bruto_liquido: 'Bruto − tributos − taxa ≠ líquido',
  sem_retorno_psp: 'Sem retorno do PSP (segregação não comprovada)',
  tributo_divergente: 'Segregado diferente do destacado na NF',
  sem_conciliacao: 'Sem conciliação com o extrato',
  duplicidade: 'Transação em duplicidade',
  tributacao_indeterminada: 'Tributação não determinada (NF sem IBS/CBS)',
} as const;
export type Divergencia = keyof typeof DIVERGENCIAS;

/** Itens que são pendência (falta informação), não divergência de valores. */
export const PENDENCIAS: Divergencia[] = ['sem_retorno_psp', 'sem_conciliacao', 'tributacao_indeterminada'];

const dif = (a: number, b: number) => Math.abs(a - b) > 0.01;

/** Proporção do documento paga nesta transação (para comparar o segregado com o destacado). */
export function proporcao(op: Pick<OperacaoSplit, 'valorBruto' | 'valorDocumento'>) {
  return op.valorDocumento && op.valorDocumento > 0 ? Math.min(1, op.valorBruto / op.valorDocumento) : 1;
}

/** Divergências de uma operação; a duplicidade é marcada em analisarOperacoes, que vê a lista inteira. */
export function divergenciasDe(op: OperacaoSplit): Divergencia[] {
  const out: Divergencia[] = [];
  if (!op.nf && !op.tituloId) out.push('sem_documento');
  if (op.evento === 'estorno' || op.evento === 'devolucao') out.push('estorno');
  if ((op.evento === 'parcial' || op.evento === 'pagamento') && op.valorDocumento != null && op.valorBruto + 0.01 < op.valorDocumento) out.push('parcial');
  const temSeg = op.ibsSegregado != null || op.cbsSegregado != null;
  if (!temSeg && op.evento !== 'estorno' && op.evento !== 'devolucao') out.push('sem_retorno_psp');
  if (temSeg && op.valorLiquido != null && dif(op.valorBruto - (op.ibsSegregado || 0) - (op.cbsSegregado || 0) - (op.taxaPsp || 0), op.valorLiquido)) out.push('bruto_liquido');
  if (temSeg && op.ibsDestacado != null && op.cbsDestacado != null) {
    const p = proporcao(op);
    if (dif(op.ibsSegregado || 0, arred(op.ibsDestacado * p)) || dif(op.cbsSegregado || 0, arred(op.cbsDestacado * p))) out.push('tributo_divergente');
  }
  if (op.ibsDestacado == null && op.cbsDestacado == null && !temSeg && (op.nf || op.tituloId)) out.push('tributacao_indeterminada');
  if (!op.extratoId && (op.valorLiquido ?? 0) > 0) out.push('sem_conciliacao');
  return out;
}

export function analisarOperacoes(ops: OperacaoSplit[]) {
  const vistos = new Map<string, number>();
  for (const o of ops) if (o.psp && o.idTransacao) vistos.set(`${o.psp}|${o.idTransacao}`, (vistos.get(`${o.psp}|${o.idTransacao}`) || 0) + 1);
  return ops.map((o) => {
    const d = divergenciasDe(o);
    if (o.psp && o.idTransacao && (vistos.get(`${o.psp}|${o.idTransacao}`) || 0) > 1) d.push('duplicidade');
    return { ...o, divergencias: d };
  });
}

/** Indicadores do painel, separando real (PSP/comprovante), estimado (destaque da NF) e o que falta. */
export function resumoSplit(ops: OperacaoSplit[]) {
  const a = analisarOperacoes(ops);
  const sinal = (o: OperacaoSplit) => (o.evento === 'estorno' || o.evento === 'devolucao' ? -1 : 1);
  const soma = (f: (o: OperacaoSplit) => number) => arred(ops.reduce((s, o) => s + sinal(o) * f(o), 0));
  const conf = ops.filter((o) => o.status === 'confirmado');
  const psp = ops.filter((o) => o.status === 'informado_psp');
  return {
    transacoes: ops.length,
    bruto: soma((o) => o.valorBruto),
    ibsConfirmado: arred(conf.reduce((s, o) => s + sinal(o) * (o.ibsSegregado || 0), 0)),
    cbsConfirmado: arred(conf.reduce((s, o) => s + sinal(o) * (o.cbsSegregado || 0), 0)),
    ibsInformadoPsp: arred(psp.reduce((s, o) => s + sinal(o) * (o.ibsSegregado || 0), 0)),
    cbsInformadoPsp: arred(psp.reduce((s, o) => s + sinal(o) * (o.cbsSegregado || 0), 0)),
    ibsDestacadoEstimado: arred(ops.reduce((s, o) => s + sinal(o) * (o.ibsDestacado || 0) * proporcao(o), 0)),
    cbsDestacadoEstimado: arred(ops.reduce((s, o) => s + sinal(o) * (o.cbsDestacado || 0) * proporcao(o), 0)),
    liquido: soma((o) => o.valorLiquido ?? 0),
    semLiquido: ops.filter((o) => o.valorLiquido == null).length,
    // pendências (sem retorno do PSP, sem conciliação, NF sem IBS/CBS) não contam como divergência
    divergencias: a.filter((o) => o.divergencias.some((d) => !PENDENCIAS.includes(d))).length,
    aguardandoConfirmacao: a.filter((o) => o.status !== 'confirmado' && o.evento !== 'estorno' && o.evento !== 'devolucao').length,
    porDivergencia: Object.fromEntries((Object.keys(DIVERGENCIAS) as Divergencia[]).map((k) => [k, a.filter((o) => o.divergencias.includes(k)).length])) as Record<Divergencia, number>,
  };
}

export interface EntradaSimulacaoSplit {
  valor: number;
  ibsPct: number | null;
  cbsPct: number | null;
  taxaPct: number; // taxa do meio de pagamento (despesa bancária, não tributo)
  parcelas: number;
  primeiraLiquidacao: string;
  intervaloDias?: number;
  antecipacaoPct?: number; // custo de antecipar todas as parcelas para a 1ª data
}

/** Simulação: não comprova recolhimento. Sem alíquotas informadas, a tributação fica "não determinada". */
export function simularSplit(e: EntradaSimulacaoSplit) {
  if (!(e.valor > 0)) throw new Error('Informe o valor da venda.');
  if (e.ibsPct == null || e.cbsPct == null) throw new Error('Tributação não determinada: informe as alíquotas de IBS e CBS da operação (ou use as destacadas na NF). O ZARO não presume alíquota.');
  if (e.ibsPct < 0 || e.cbsPct < 0 || e.ibsPct + e.cbsPct + e.taxaPct >= 100) throw new Error('Alíquotas inválidas.');
  const n = Math.max(1, Math.floor(e.parcelas || 1));
  // tributos e taxa calculados sobre o total; a última parcela absorve os centavos
  const total = { bruto: arred(e.valor), ibs: arred((e.valor * e.ibsPct) / 100), cbs: arred((e.valor * e.cbsPct) / 100), taxa: arred((e.valor * e.taxaPct) / 100) };
  const fatia = (k: keyof typeof total, i: number) => (i === n - 1 ? arred(total[k] - arred(total[k] / n) * (n - 1)) : arred(total[k] / n));
  const parcelas = Array.from({ length: n }, (_, i) => {
    const bruto = fatia('bruto', i);
    const ibs = fatia('ibs', i);
    const cbs = fatia('cbs', i);
    const taxa = fatia('taxa', i);
    return { n: i + 1, data: e.antecipacaoPct != null ? e.primeiraLiquidacao : addDias(e.primeiraLiquidacao, i * (e.intervaloDias ?? 30)), bruto, ibs, cbs, taxa, liquido: arred(bruto - ibs - cbs - taxa) };
  });
  const tot = (k: 'bruto' | 'ibs' | 'cbs' | 'taxa' | 'liquido') => arred(parcelas.reduce((s, p) => s + p[k], 0));
  const custoAntecipacao = e.antecipacaoPct != null ? arred((tot('liquido') * e.antecipacaoPct) / 100) : 0;
  return { parcelas, bruto: tot('bruto'), ibs: tot('ibs'), cbs: tot('cbs'), segregado: arred(tot('ibs') + tot('cbs')), taxa: tot('taxa'), custoAntecipacao, liquido: arred(tot('liquido') - custoAntecipacao) };
}

export interface TituloAberto {
  venc: string;
  saldo: number;
  valorDocumento: number;
  ibsDestacado: number | null;
  cbsDestacado: number | null;
}

/** Projeção de 30/60/90 dias dos recebimentos: bruto, segregação estimada (pelos destaques das NFs), taxas e líquido. */
export function projecaoSplit(titulos: TituloAberto[], hoje: string, taxaPct = 0) {
  return [30, 60, 90].map((dias) => {
    const ate = addDias(hoje, dias);
    const no = titulos.filter((t) => t.venc >= hoje && t.venc <= ate && t.saldo > 0.004);
    const comDestaque = no.filter((t) => t.ibsDestacado != null || t.cbsDestacado != null);
    const prop = (t: TituloAberto) => (t.valorDocumento > 0 ? t.saldo / t.valorDocumento : 1);
    const bruto = arred(no.reduce((s, t) => s + t.saldo, 0));
    const segregacao = arred(comDestaque.reduce((s, t) => s + ((t.ibsDestacado || 0) + (t.cbsDestacado || 0)) * prop(t), 0));
    const taxas = arred((bruto * taxaPct) / 100);
    return { dias, bruto, segregacao, taxas, liquido: arred(bruto - segregacao - taxas), titulos: no.length, semDestaque: arred(no.filter((t) => !comDestaque.includes(t)).reduce((s, t) => s + t.saldo, 0)) };
  });
}

/** Lê o retorno do PSP em CSV (separador ; ou ,). Cabeçalhos aceitos: data, transacao/id_transacao, bruto/valor_bruto,
 *  ibs, cbs, taxa, liquido/valor_liquido, nf, chave, tipo/evento. */
export function lerRetornoPsp(csv: string) {
  const linhas = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) throw new Error('Arquivo sem linhas de transação.');
  const sep = linhas[0].includes(';') ? ';' : ',';
  const cab = linhas[0].split(sep).map((c) => c.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'));
  const idx = (...nomes: string[]) => cab.findIndex((c) => nomes.includes(c));
  const col = { data: idx('data', 'data_liquidacao'), id: idx('transacao', 'id_transacao', 'id', 'nsu'), bruto: idx('bruto', 'valor_bruto', 'valor'), ibs: idx('ibs', 'ibs_segregado'), cbs: idx('cbs', 'cbs_segregada', 'cbs_segregado'), taxa: idx('taxa', 'tarifa', 'mdr'), liquido: idx('liquido', 'valor_liquido'), nf: idx('nf', 'numero_nf'), chave: idx('chave', 'chave_nf'), tipo: idx('tipo', 'evento') };
  if (col.id < 0 || col.bruto < 0 || col.data < 0) throw new Error('O arquivo precisa das colunas data, transacao e bruto.');
  const num = (s: string | undefined) => {
    if (s == null || !s.trim()) return null;
    let t = s.trim().replace(/[R$\s]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const data = (s: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s.split('/').reverse().join('-') : s.slice(0, 10));
  return linhas.slice(1).map((l, i) => {
    const v = l.split(sep).map((x) => x.trim());
    const tipo = (v[col.tipo] || '').toLowerCase();
    const evento: EventoSplit = /estorn|chargeback/.test(tipo) ? 'estorno' : /devol/.test(tipo) ? 'devolucao' : /antecip/.test(tipo) ? 'antecipacao' : /parcial/.test(tipo) ? 'parcial' : 'pagamento';
    const bruto = num(v[col.bruto]);
    if (bruto == null || !v[col.id] || !/^\d{4}-\d{2}-\d{2}$/.test(data(v[col.data] || ''))) throw new Error(`Linha ${i + 2}: data, transação ou valor bruto inválido.`);
    return { linha: i + 2, data: data(v[col.data]), idTransacao: v[col.id], valorBruto: Math.abs(bruto), ibs: col.ibs >= 0 ? num(v[col.ibs]) : null, cbs: col.cbs >= 0 ? num(v[col.cbs]) : null, taxa: col.taxa >= 0 ? num(v[col.taxa]) : null, liquido: col.liquido >= 0 ? num(v[col.liquido]) : null, nf: col.nf >= 0 ? v[col.nf] || null : null, chave: col.chave >= 0 ? (v[col.chave] || '').replace(/\D/g, '') || null : null, evento };
  });
}
