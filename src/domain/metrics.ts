// Cálculo de indicadores por jornada e consolidado global.
// Regras centrais:
// - Pessoas são contadas por id único (migração Teen → Ciclo não duplica no global).
// - Cada transação pertence a exatamente uma jornada (a vigente na data da cobrança).
// - Despesas: na jornada, valor direto + parcela de rateio; no global, valor original (sem duplicar).

import { JOURNEYS, JOURNEY_IDS, type JourneyId, type Scope } from '../config/journeys'
import { alocarDespesa, type BasesRateio } from './allocation'
import {
  ALL_MONTHS,
  REF_DATE,
  addDays,
  addMonthKey,
  diffDays,
  monthEnd,
  monthOf,
  monthStart,
  type ISODate,
  type MonthKey,
} from './dates'
import { isMember, isPremiumAt, journeyAt } from './people'
import type { CategoriaDespesa, Dataset, Pessoa } from './types'

export const ALIQUOTA_IMPOSTOS = 0.06
export const TAXA_GATEWAY = 0.0399

export const CATEGORIAS: { id: CategoriaDespesa; label: string }[] = [
  { id: 'tecnologia', label: 'Tecnologia' },
  { id: 'ia', label: 'Inteligência artificial' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'pessoal', label: 'Pessoal' },
  { id: 'operacional', label: 'Operacional' },
  { id: 'juridico', label: 'Jurídico e compliance' },
]

export type DespesasPorCategoria = Record<CategoriaDespesa, number>

const despesasZero = (): DespesasPorCategoria => ({ tecnologia: 0, ia: 0, marketing: 0, pessoal: 0, operacional: 0, juridico: 0 })

export interface MonthRow {
  mes: MonthKey
  cadastrosAcum: number
  novas: number
  migradasEntrada: number
  migradasSaida: number
  membros: number
  ativas: number
  premium: number
  premiumMensal: number
  premiumAnual: number
  novasAssinaturas: number
  renovacoes: number
  cancelamentos: number
  receitaBruta: number
  reembolsos: number
  pendentes: number
  receitaRecebida: number
  transacoesPagas: number
  despesas: DespesasPorCategoria
  mrr: number
}

export type AllRows = Record<Scope, MonthRow[]>

function emptyRow(mes: MonthKey): MonthRow {
  return {
    mes,
    cadastrosAcum: 0,
    novas: 0,
    migradasEntrada: 0,
    migradasSaida: 0,
    membros: 0,
    ativas: 0,
    premium: 0,
    premiumMensal: 0,
    premiumAnual: 0,
    novasAssinaturas: 0,
    renovacoes: 0,
    cancelamentos: 0,
    receitaBruta: 0,
    reembolsos: 0,
    pendentes: 0,
    receitaRecebida: 0,
    transacoesPagas: 0,
    despesas: despesasZero(),
    mrr: 0,
  }
}

/** Último dia considerado em um mês (o mês corrente termina na data de referência). */
export function fimDoMes(m: MonthKey): ISODate {
  const e = monthEnd(m)
  return e > REF_DATE ? REF_DATE : e
}

const cacheRows = new WeakMap<Dataset, AllRows>()

export function computeAllRows(ds: Dataset): AllRows {
  const hit = cacheRows.get(ds)
  if (hit) return hit
  const scopes: Scope[] = ['global', ...JOURNEY_IDS]
  const rows = Object.fromEntries(scopes.map((s) => [s, ALL_MONTHS.map(emptyRow)])) as AllRows
  const idxMes = new Map(ALL_MONTHS.map((m, i) => [m, i]))

  // --- Pessoas ---
  for (const p of ds.pessoas) {
    const ci = idxMes.get(monthOf(p.cadastro))
    if (ci !== undefined) {
      rows.global[ci].novas++
      rows[p.historico[0].jornada][ci].novas++
    }
    p.historico.forEach((s, k) => {
      if (k > 0) {
        const i = idxMes.get(monthOf(s.desde))
        if (i !== undefined) rows[s.jornada][i].migradasEntrada++
      }
      if (s.ate) {
        const i = idxMes.get(monthOf(s.ate))
        if (i !== undefined) rows[s.jornada][i].migradasSaida++
      }
    })
    if (p.assinatura?.cancelamento) {
      const c = p.assinatura.cancelamento
      const i = idxMes.get(monthOf(c))
      const j = journeyAt(p, addDays(c, -1))
      if (i !== undefined && j) {
        rows.global[i].cancelamentos++
        rows[j][i].cancelamentos++
      }
    }

    ALL_MONTHS.forEach((m, i) => {
      const fim = fimDoMes(m)
      if (p.cadastro > fim) return
      rows.global[i].cadastrosAcum++
      // Na jornada, conta quem já passou por ela (cadastro original ou migração).
      const vistas = new Set<JourneyId>()
      for (const s of p.historico) if (s.desde <= fim) vistas.add(s.jornada)
      vistas.forEach((j) => rows[j][i].cadastrosAcum++)
      if (!isMember(p, fim, 'global')) return
      const j = journeyAt(p, fim) as JourneyId
      const ativa = (p.atividade >> i) & 1
      const premium = isPremiumAt(p, fim)
      for (const r of [rows.global[i], rows[j][i]]) {
        r.membros++
        if (ativa) r.ativas++
        if (premium) {
          r.premium++
          if (p.assinatura!.plano === 'mensal') r.premiumMensal++
          else r.premiumAnual++
          const preco = JOURNEYS[j].precos
          r.mrr += p.assinatura!.plano === 'mensal' ? preco.mensal : preco.anual / 12
        }
      }
    })
  }

  // --- Transações ---
  for (const t of ds.transacoes) {
    const i = idxMes.get(t.competencia)
    if (i === undefined) continue
    for (const r of [rows.global[i], rows[t.jornada][i]]) {
      r.receitaBruta += t.valor
      if (t.status === 'reembolsado') r.reembolsos += t.valor
      if (t.status === 'pendente') r.pendentes += t.valor
      if (t.status === 'pago') {
        r.receitaRecebida += t.valor
        r.transacoesPagas++
      }
      if (t.tipo === 'nova') r.novasAssinaturas++
      if (t.tipo === 'renovacao') r.renovacoes++
    }
  }

  // --- Despesas (global = original; jornadas = direta + rateio) ---
  const bases = basesPorMes(rows)
  for (const d of ds.despesas) {
    const i = idxMes.get(d.competencia)
    if (i === undefined) continue
    rows.global[i].despesas[d.categoria] += d.valor
    const parcelas = alocarDespesa(d, bases[d.competencia])
    for (const j of JOURNEY_IDS) rows[j][i].despesas[d.categoria] += parcelas[j]
  }

  cacheRows.set(ds, rows)
  return rows
}

function basesPorMes(rows: AllRows): Record<MonthKey, BasesRateio> {
  const out: Record<MonthKey, BasesRateio> = {}
  ALL_MONTHS.forEach((m, i) => {
    const operando = { teen: false, ciclo: false, mais40: false }
    const usuariasAtivas = { teen: 0, ciclo: 0, mais40: 0 }
    const receita = { teen: 0, ciclo: 0, mais40: 0 }
    for (const j of JOURNEY_IDS) {
      operando[j] = m >= monthOf(JOURNEYS[j].inicio)
      usuariasAtivas[j] = rows[j][i].ativas
      receita[j] = rows[j][i].receitaBruta - rows[j][i].reembolsos
    }
    out[m] = { operando, usuariasAtivas, receita }
  })
  return out
}

export function basesRateio(ds: Dataset, m: MonthKey): BasesRateio {
  return basesPorMes(computeAllRows(ds))[m]
}

// ---------------------------------------------------------------------------
// Períodos

export type PeriodId = 'mes' | '3m' | '6m' | '12m' | 'ytd' | 'tudo'

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'mes', label: 'Mês atual' },
  { id: '3m', label: 'Últimos 3 meses' },
  { id: '6m', label: 'Últimos 6 meses' },
  { id: '12m', label: 'Últimos 12 meses' },
  { id: 'ytd', label: 'Ano atual' },
  { id: 'tudo', label: 'Todo o histórico' },
]

export function periodMonths(id: PeriodId, end: MonthKey = monthOf(REF_DATE)): MonthKey[] {
  const n = id === 'mes' ? 1 : id === '3m' ? 3 : id === '6m' ? 6 : id === '12m' ? 12 : id === 'ytd' ? Number(end.slice(5)) : ALL_MONTHS.length
  return ALL_MONTHS.filter((m) => m <= end).slice(-n)
}

/** Período imediatamente anterior, de mesma duração (limitado ao início da série). */
export function previousMonths(months: MonthKey[]): MonthKey[] {
  if (!months.length) return []
  const n = months.length
  const end = addMonthKey(months[0], -1)
  return ALL_MONTHS.filter((m) => m <= end).slice(-n)
}

// ---------------------------------------------------------------------------
// Resumo de período

export interface Summary {
  meses: MonthKey[]
  totalCadastros: number
  novas: number
  migradasEntrada: number
  migradasSaida: number
  membros: number
  membrosInicio: number
  ativas: number
  inativas: number
  premium: number
  premiumInicio: number
  gratuitas: number
  premiumMensal: number
  premiumAnual: number
  novasAssinaturas: number
  renovacoes: number
  cancelamentos: number
  receitaBruta: number
  reembolsos: number
  pendentes: number
  receitaRecebida: number
  impostos: number
  taxas: number
  receitaLiquida: number
  despesas: DespesasPorCategoria
  despesasTotal: number
  custosTecnologiaIA: number
  margemBruta: number
  resultado: number
  margem: number
  mrr: number
  arr: number
  churn: number
  retencao: number
  conversao: number
  crescimento: number
  cac: number
  custoPorAssinatura: number
  ticketMedio: number
}

export function summarize(rows: MonthRow[], months: MonthKey[]): Summary {
  const set = new Set(months)
  const sel = rows.filter((r) => set.has(r.mes))
  const last = sel[sel.length - 1] ?? emptyRow(months[months.length - 1] ?? '')
  const firstIdx = rows.findIndex((r) => r.mes === sel[0]?.mes)
  const before = firstIdx > 0 ? rows[firstIdx - 1] : emptyRow('')
  const sum = (f: (r: MonthRow) => number) => sel.reduce((s, r) => s + f(r), 0)

  const despesas = despesasZero()
  for (const r of sel) for (const c of CATEGORIAS) despesas[c.id] += r.despesas[c.id]
  const despesasTotal = CATEGORIAS.reduce((s, c) => s + despesas[c.id], 0)

  const receitaBruta = sum((r) => r.receitaBruta)
  const reembolsos = sum((r) => r.reembolsos)
  const receitaRecebida = sum((r) => r.receitaRecebida)
  const impostos = (receitaBruta - reembolsos) * ALIQUOTA_IMPOSTOS
  const taxas = receitaRecebida * TAXA_GATEWAY
  const receitaLiquida = receitaBruta - reembolsos - impostos - taxas
  const custosTecnologiaIA = despesas.tecnologia + despesas.ia
  const resultado = receitaLiquida - despesasTotal

  // Taxas mensais médias (churn de assinantes e conversão gratuito → Premium).
  let churnAcc = 0
  let convAcc = 0
  let n = 0
  for (const r of sel) {
    const i = rows.indexOf(r)
    const prev = i > 0 ? rows[i - 1] : null
    if (!prev || prev.membros === 0) continue
    churnAcc += prev.premium ? r.cancelamentos / prev.premium : 0
    const gratuitasPrev = prev.membros - prev.premium
    convAcc += gratuitasPrev ? r.novasAssinaturas / gratuitasPrev : 0
    n++
  }
  const churn = n ? churnAcc / n : 0
  const conversao = n ? convAcc / n : 0
  const novas = sum((r) => r.novas)
  const novasAssinaturas = sum((r) => r.novasAssinaturas)
  const transacoesPagas = sum((r) => r.transacoesPagas)

  return {
    meses: months,
    totalCadastros: last.cadastrosAcum,
    novas,
    migradasEntrada: sum((r) => r.migradasEntrada),
    migradasSaida: sum((r) => r.migradasSaida),
    membros: last.membros,
    membrosInicio: before.membros,
    ativas: last.ativas,
    inativas: last.membros - last.ativas,
    premium: last.premium,
    premiumInicio: before.premium,
    gratuitas: last.membros - last.premium,
    premiumMensal: last.premiumMensal,
    premiumAnual: last.premiumAnual,
    novasAssinaturas,
    renovacoes: sum((r) => r.renovacoes),
    cancelamentos: sum((r) => r.cancelamentos),
    receitaBruta,
    reembolsos,
    pendentes: sum((r) => r.pendentes),
    receitaRecebida,
    impostos,
    taxas,
    receitaLiquida,
    despesas,
    despesasTotal,
    custosTecnologiaIA,
    margemBruta: receitaLiquida - custosTecnologiaIA,
    resultado,
    margem: receitaLiquida ? resultado / receitaLiquida : 0,
    mrr: last.mrr,
    arr: last.mrr * 12,
    churn,
    retencao: 1 - churn,
    conversao,
    crescimento: before.membros ? (last.membros - before.membros) / before.membros : 0,
    cac: novas ? despesas.marketing / novas : 0,
    custoPorAssinatura: novasAssinaturas ? despesas.marketing / novasAssinaturas : 0,
    ticketMedio: transacoesPagas ? receitaRecebida / transacoesPagas : 0,
  }
}

export function getSummary(ds: Dataset, scope: Scope, months: MonthKey[]): Summary {
  return summarize(computeAllRows(ds)[scope], months)
}

export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null
  return (atual - anterior) / Math.abs(anterior)
}

// ---------------------------------------------------------------------------
// Crescimento diário / semanal / mensal (novos cadastros)

function entradas(ds: Dataset, scope: Scope, de: ISODate, ate: ISODate): number {
  let n = 0
  for (const p of ds.pessoas) {
    if (scope === 'global' || p.historico[0].jornada === scope) {
      if (p.cadastro >= de && p.cadastro <= ate) n++
    }
  }
  return n
}

export interface JanelaCrescimento {
  label: string
  atual: number
  anterior: number
  variacao: number | null
}

export function crescimentoJanelas(ds: Dataset, scope: Scope, ref: ISODate = REF_DATE): JanelaCrescimento[] {
  return [
    { label: 'Hoje', dias: 1 },
    { label: '7 dias', dias: 7 },
    { label: '30 dias', dias: 30 },
  ].map(({ label, dias }) => {
    const atual = entradas(ds, scope, addDays(ref, -(dias - 1)), ref)
    const anterior = entradas(ds, scope, addDays(ref, -(2 * dias - 1)), addDays(ref, -dias))
    return { label, atual, anterior, variacao: variacao(atual, anterior) }
  })
}

export function cadastrosDiarios(ds: Dataset, scope: Scope, dias = 30, ref: ISODate = REF_DATE) {
  const out: { data: ISODate; cadastros: number }[] = []
  const mapa = new Map<ISODate, number>()
  const inicio = addDays(ref, -(dias - 1))
  for (const p of ds.pessoas) {
    if (scope !== 'global' && p.historico[0].jornada !== scope) continue
    if (p.cadastro >= inicio && p.cadastro <= ref) mapa.set(p.cadastro, (mapa.get(p.cadastro) ?? 0) + 1)
  }
  for (let d = inicio; d <= ref; d = addDays(d, 1)) out.push({ data: d, cadastros: mapa.get(d) ?? 0 })
  return out
}

// ---------------------------------------------------------------------------
// Deduplicação global

export interface Deduplicacao {
  somaJornadas: number
  migracoes: number
  totalUnico: number
}

/** Mostra explicitamente quantos cadastros seriam duplicados se somássemos as jornadas. */
export function deduplicacao(ds: Dataset, ate: ISODate = REF_DATE): Deduplicacao {
  const rows = computeAllRows(ds)
  const i = ALL_MONTHS.indexOf(monthOf(ate))
  const soma = JOURNEY_IDS.reduce((s, j) => s + rows[j][i].cadastrosAcum, 0)
  const unico = rows.global[i].cadastrosAcum
  return { somaJornadas: soma, migracoes: soma - unico, totalUnico: unico }
}

// ---------------------------------------------------------------------------
// Previsão de faturamento (regressão linear simples sobre os últimos meses)

export function previsaoFaturamento(rows: MonthRow[], horizonte = 3, base = 6) {
  // O mês corrente está incompleto: a regressão usa apenas meses fechados.
  const fechados = rows.filter((r) => r.mes < monthOf(REF_DATE)).slice(-base)
  const ys = fechados.map((r) => r.receitaBruta - r.reembolsos)
  const n = ys.length
  const xm = (n - 1) / 2
  const ym = ys.reduce((s, y) => s + y, 0) / (n || 1)
  let num = 0
  let den = 0
  ys.forEach((y, x) => {
    num += (x - xm) * (y - ym)
    den += (x - xm) ** 2
  })
  const b = den ? num / den : 0
  const a = ym - b * xm
  const ultimo = fechados[fechados.length - 1]?.mes ?? monthOf(REF_DATE)
  return Array.from({ length: horizonte }, (_, k) => ({
    mes: addMonthKey(ultimo, k + 1),
    previsto: Math.max(0, a + b * (n + k)),
  }))
}

// ---------------------------------------------------------------------------
// Membros por jornada em uma data (útil para validações e testes)

export function contarMembros(pessoas: Pessoa[], d: ISODate, scope: Scope): number {
  return pessoas.filter((p) => isMember(p, d, scope)).length
}

export function diasNoMes(m: MonthKey): number {
  return diffDays(monthStart(m), monthEnd(m)) + 1
}

/** Fração já decorrida do mês corrente (para ritmo de metas). */
export function fracaoDoMes(m: MonthKey, ref: ISODate = REF_DATE): number {
  if (m < monthOf(ref)) return 1
  if (m > monthOf(ref)) return 0
  return (diffDays(monthStart(m), ref) + 1) / diasNoMes(m)
}
