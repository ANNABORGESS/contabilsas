import { useState } from 'react'
import { JOURNEYS, JOURNEY_IDS } from '../../config/journeys'
import { useApp } from '../../components/AppContext'
import { BarChartBox, DonutBox, LineChartBox } from '../../components/charts'
import { Card, ExportButtons, PageHead } from '../../components/ui'
import { fmt, type Formato } from '../../components/format'
import { ALL_MONTHS, monthLabel } from '../../domain/dates'
import { computeAllRows, getSummary, type MonthRow, type Summary } from '../../domain/metrics'
import { mesesTendencia, scopeSub } from '../shared/common'

interface Metrica {
  id: string
  label: string
  formato: Formato
  s: (x: Summary) => number
  m?: (r: MonthRow) => number
}

const METRICAS: Metrica[] = [
  { id: 'usuarias', label: 'Total de usuárias', formato: 'num', s: (x) => x.totalCadastros, m: (r) => r.cadastrosAcum },
  { id: 'ativas', label: 'Usuárias ativas', formato: 'num', s: (x) => x.ativas, m: (r) => r.ativas },
  { id: 'premium', label: 'Assinantes Premium', formato: 'num', s: (x) => x.premium, m: (r) => r.premium },
  { id: 'fat', label: 'Faturamento', formato: 'brl', s: (x) => x.receitaBruta, m: (r) => r.receitaBruta },
  { id: 'mrr', label: 'MRR', formato: 'brl', s: (x) => x.mrr, m: (r) => r.mrr },
  { id: 'desp', label: 'Despesas (diretas + rateio)', formato: 'brl', s: (x) => x.despesasTotal, m: (r) => Object.values(r.despesas).reduce((a, b) => a + b, 0) },
  { id: 'mkt', label: 'Investimento em marketing', formato: 'brl', s: (x) => x.despesas.marketing, m: (r) => r.despesas.marketing },
  { id: 'res', label: 'Resultado', formato: 'brl', s: (x) => x.resultado },
  { id: 'margem', label: 'Margem', formato: 'pct', s: (x) => x.margem },
  { id: 'arpu', label: 'Receita por usuária ativa', formato: 'brlCents', s: (x) => (x.ativas ? x.receitaBruta / x.ativas / Math.max(1, x.meses.length) : 0) },
  { id: 'penetracao', label: '% Premium da base', formato: 'pct', s: (x) => (x.membros ? x.premium / x.membros : 0) },
  { id: 'conv', label: 'Conversão gratuito → Premium', formato: 'pct', s: (x) => x.conversao },
  { id: 'churn', label: 'Churn mensal', formato: 'pct', s: (x) => x.churn },
  { id: 'cac', label: 'CAC (por cadastro)', formato: 'brlCents', s: (x) => x.cac },
  { id: 'cps', label: 'Custo por assinatura', formato: 'brlCents', s: (x) => x.custoPorAssinatura },
  { id: 'cresc', label: 'Crescimento da base', formato: 'pct', s: (x) => x.crescimento },
]

export function Comparativo() {
  const { ds, months, periodLabel } = useApp()
  const [sel, setSel] = useState('fat')
  const met = METRICAS.find((m) => m.id === sel)!
  const sums = Object.fromEntries(JOURNEY_IDS.map((j) => [j, getSummary(ds, j, months)])) as Record<(typeof JOURNEY_IDS)[number], Summary>
  const all = computeAllRows(ds)
  const ms = mesesTendencia(months, ALL_MONTHS, 9)
  const tendencia = met.m
    ? ms.map((m) => {
        const i = ALL_MONTHS.indexOf(m)
        return { label: monthLabel(m), ...Object.fromEntries(JOURNEY_IDS.map((j) => [j, met.m!(all[j][i])])) }
      })
    : null

  return (
    <>
      <PageHead
        eyebrow="AKORA Global"
        title="Teen × Ciclo × 40+"
        sub={scopeSub('global', periodLabel)}
        actions={
          <ExportButtons
            name="comparativo_jornadas"
            sheets={() => [{ name: 'Comparativo', rows: METRICAS.map((m) => ({ Indicador: m.label, ...Object.fromEntries(JOURNEY_IDS.map((j) => [JOURNEYS[j].nome, Math.round(m.s(sums[j]) * 10000) / 10000])) })) }]}
          />
        }
      />

      <div className="grid cols-2">
        <Card
          title="Comparar indicador"
          actions={
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              {METRICAS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          }
        >
          <BarChartBox
            formato={met.formato}
            x="nome"
            data={JOURNEY_IDS.map((j) => ({ nome: JOURNEYS[j].nome.replace('AKORA ', ''), valor: met.s(sums[j]) }))}
            series={[{ key: 'valor', label: met.label, color: '#423566' }]}
          />
        </Card>
        <Card title={tendencia ? `${met.label} · evolução` : 'Participação no faturamento'}>
          {tendencia ? (
            <LineChartBox formato={met.formato} x="label" data={tendencia} series={JOURNEY_IDS.map((j) => ({ key: j, label: JOURNEYS[j].nome, color: JOURNEYS[j].cor }))} />
          ) : (
            <DonutBox formato="brl" data={JOURNEY_IDS.map((j) => ({ name: JOURNEYS[j].nome, value: Math.round(sums[j].receitaBruta), color: JOURNEYS[j].cor }))} />
          )}
        </Card>
      </div>

      <Card title="Quadro comparativo" sub={periodLabel} className="mt">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Indicador</th>
                {JOURNEY_IDS.map((j) => (
                  <th key={j} className="num" style={{ color: JOURNEYS[j].cor }}>
                    {JOURNEYS[j].nome.replace('AKORA ', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICAS.map((m) => {
                const vals = JOURNEY_IDS.map((j) => m.s(sums[j]))
                const melhor = m.id === 'churn' || m.id === 'cac' || m.id === 'cps' || m.id === 'desp' || m.id === 'mkt' ? Math.min(...vals) : Math.max(...vals)
                return (
                  <tr key={m.id} onClick={() => setSel(m.id)} style={{ cursor: 'pointer' }}>
                    <td>{m.label}</td>
                    {vals.map((v, k) => (
                      <td key={k} className="num" style={{ fontWeight: v === melhor ? 700 : 400 }}>
                        {fmt(v, m.formato)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small mt">Em negrito, o melhor desempenho entre as jornadas. Cada jornada mostra apenas os próprios resultados — nada é misturado entre os modos.</p>
      </Card>
    </>
  )
}
