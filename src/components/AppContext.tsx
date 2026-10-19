import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Scope } from '../config/journeys'
import { getDataset } from '../data/seed'
import { getSummary, periodMonths, previousMonths, PERIODS, type PeriodId, type Summary } from '../domain/metrics'
import type { MonthKey } from '../domain/dates'
import type { Dataset } from '../domain/types'

interface Ctx {
  ds: Dataset
  period: PeriodId
  setPeriod: (p: PeriodId) => void
  months: MonthKey[]
  prevMonths: MonthKey[]
  periodLabel: string
}

const AppCtx = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const ds = useMemo(() => getDataset(), [])
  const [period, setPeriod] = useState<PeriodId>(() => {
    try {
      return (localStorage.getItem('akora.period') as PeriodId) || '3m'
    } catch {
      return '3m'
    }
  })
  const value = useMemo<Ctx>(() => {
    const months = periodMonths(period)
    return {
      ds,
      period,
      setPeriod: (p) => {
        setPeriod(p)
        try {
          localStorage.setItem('akora.period', p)
        } catch {
          /* armazenamento indisponível */
        }
      },
      months,
      prevMonths: previousMonths(months),
      periodLabel: PERIODS.find((p) => p.id === period)!.label,
    }
  }, [ds, period])
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp fora do AppProvider')
  return c
}

/** Resumo do período selecionado e do período anterior para o escopo. */
export function useSummary(scope: Scope): { cur: Summary; prev: Summary } {
  const { ds, months, prevMonths } = useApp()
  return useMemo(
    () => ({ cur: getSummary(ds, scope, months), prev: getSummary(ds, scope, prevMonths) }),
    [ds, scope, months, prevMonths],
  )
}
