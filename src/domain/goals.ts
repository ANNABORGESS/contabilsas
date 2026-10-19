import { JOURNEY_IDS, type Scope } from '../config/journeys'
import { REF_DATE, monthOf, type MonthKey } from './dates'
import { computeAllRows, fracaoDoMes, summarize } from './metrics'
import type { Dataset, MetaMensal } from './types'

export type Horizonte = 'mensal' | 'trimestral' | 'anual'

export interface LinhaMeta {
  id: 'novasUsuarias' | 'faturamento' | 'novasAssinaturas' | 'retencao' | 'conversao' | 'investimentoMarketing'
  label: string
  formato: 'num' | 'brl' | 'pct'
  meta: number
  realizado: number
  /** Realizado / meta (para investimento, quanto menor melhor acima de 100%). */
  atingimento: number
  /** Ritmo esperado no ponto atual do período (0–1). */
  ritmoEsperado: number
  status: 'ok' | 'atencao' | 'critico'
  /** Indicador de teto (investimento): ultrapassar é ruim. */
  teto?: boolean
}

export function mesesDoHorizonte(h: Horizonte, ref = monthOf(REF_DATE)): MonthKey[] {
  const ano = ref.slice(0, 4)
  const mes = Number(ref.slice(5))
  if (h === 'mensal') return [ref]
  if (h === 'trimestral') {
    const q0 = Math.floor((mes - 1) / 3) * 3 + 1
    return [0, 1, 2].map((k) => `${ano}-${String(q0 + k).padStart(2, '0')}`)
  }
  return Array.from({ length: 12 }, (_, k) => `${ano}-${String(k + 1).padStart(2, '0')}`)
}

function metasDoEscopo(ds: Dataset, scope: Scope, meses: MonthKey[]): MetaMensal[] {
  const js = scope === 'global' ? JOURNEY_IDS : [scope]
  return ds.metas.filter((m) => js.includes(m.jornada) && meses.includes(m.mes))
}

export function avaliarMetas(ds: Dataset, scope: Scope, h: Horizonte, ref = monthOf(REF_DATE)): LinhaMeta[] {
  const meses = mesesDoHorizonte(h, ref)
  const decorridos = meses.filter((m) => m <= ref)
  const metas = metasDoEscopo(ds, scope, meses)
  const s = summarize(computeAllRows(ds)[scope], decorridos)
  const ritmo = meses.reduce((acc, m) => acc + fracaoDoMes(m), 0) / meses.length
  const soma = (f: (m: MetaMensal) => number) => metas.reduce((a, m) => a + f(m), 0)

  // Para metas de taxa no escopo global, média ponderada pelo faturamento-meta de cada jornada.
  const pond = (f: (m: MetaMensal) => number) => {
    const peso = soma((m) => m.faturamento) || 1
    return metas.reduce((a, m) => a + f(m) * m.faturamento, 0) / peso
  }

  const linhas: Omit<LinhaMeta, 'atingimento' | 'status' | 'ritmoEsperado'>[] = [
    { id: 'novasUsuarias', label: 'Novas usuárias', formato: 'num', meta: soma((m) => m.novasUsuarias), realizado: s.novas },
    { id: 'faturamento', label: 'Faturamento', formato: 'brl', meta: soma((m) => m.faturamento), realizado: s.receitaBruta - s.reembolsos },
    { id: 'novasAssinaturas', label: 'Novas assinaturas', formato: 'num', meta: soma((m) => m.novasAssinaturas), realizado: s.novasAssinaturas },
    { id: 'retencao', label: 'Retenção de assinantes (mensal)', formato: 'pct', meta: pond((m) => m.retencao), realizado: s.retencao },
    { id: 'conversao', label: 'Conversão gratuito → Premium (mensal)', formato: 'pct', meta: pond((m) => m.conversao), realizado: s.conversao },
    { id: 'investimentoMarketing', label: 'Investimento em marketing (teto)', formato: 'brl', meta: soma((m) => m.investimentoMarketing), realizado: s.despesas.marketing, teto: true },
  ]

  return linhas.map((l) => {
    const taxa = l.formato === 'pct'
    const esperado = taxa ? 1 : ritmo
    const atingimento = l.meta ? l.realizado / l.meta : 0
    let status: LinhaMeta['status']
    if (l.teto) status = atingimento <= esperado * 1.05 ? 'ok' : atingimento <= esperado * 1.2 ? 'atencao' : 'critico'
    else {
      const r = esperado ? atingimento / esperado : 1
      status = r >= 0.97 ? 'ok' : r >= 0.85 ? 'atencao' : 'critico'
    }
    return { ...l, atingimento, ritmoEsperado: esperado, status }
  })
}

export interface Alerta {
  nivel: 'atencao' | 'critico' | 'info'
  texto: string
}

export function alertas(ds: Dataset, scope: Scope): Alerta[] {
  const out: Alerta[] = []
  for (const l of avaliarMetas(ds, scope, 'mensal')) {
    if (l.status === 'ok') continue
    const pct = Math.round(l.atingimento * 100)
    out.push({
      nivel: l.status,
      texto: l.teto
        ? `${l.label}: ${pct}% do teto mensal já utilizado.`
        : `${l.label}: ${pct}% da meta do mês (ritmo esperado ${Math.round(l.ritmoEsperado * 100)}%).`,
    })
  }
  return out
}
