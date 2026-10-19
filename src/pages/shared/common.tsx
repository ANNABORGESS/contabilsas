import { JOURNEYS, scopeLabel, type JourneyId, type Scope } from '../../config/journeys'
import { monthLabel, type MonthKey } from '../../domain/dates'
import { computeAllRows, type MonthRow } from '../../domain/metrics'
import type { Dataset } from '../../domain/types'
import { DemoBadge } from '../../components/ui'

export function seriesMensal(ds: Dataset, scope: Scope, months: MonthKey[]): (MonthRow & { label: string })[] {
  const set = new Set(months)
  return computeAllRows(ds)[scope].filter((r) => set.has(r.mes)).map((r) => ({ ...r, label: monthLabel(r.mes) }))
}

/** Para gráficos de tendência, garante ao menos 6 meses de contexto. */
export function mesesTendencia(months: MonthKey[], all: MonthKey[], min = 6): MonthKey[] {
  if (months.length >= min) return months
  const end = months[months.length - 1]
  return all.filter((m) => m <= end).slice(-min)
}

export function JourneyBanner({ journey }: { journey: JourneyId }) {
  const j = JOURNEYS[journey]
  return (
    <>
      {j.status === 'pre_lancamento' && (
        <div className="banner warn">
          <strong>Pré-lançamento.</strong> O escritório de {j.nome} está preparado, mas as funções operacionais ficam desativadas até o lançamento.
        </div>
      )}
      {j.protecaoMenores && (
        <div className="banner">
          <span>🛡</span>
          <span>
            <strong>Proteção de menores ativa.</strong> Publicidade comportamental direcionada e uso comercial de informações de saúde são bloqueados nesta jornada. O painel exibe apenas indicadores agregados.
          </span>
        </div>
      )}
    </>
  )
}

export function scopeSub(scope: Scope, periodLabel: string) {
  return (
    <>
      {scope === 'global' ? 'Resultados consolidados das três jornadas' : `${scopeLabel(scope)} · ${JOURNEYS[scope].faixa}`} · {periodLabel} <DemoBadge />
    </>
  )
}
