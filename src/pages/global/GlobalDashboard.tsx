import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { JOURNEYS, JOURNEY_IDS } from '../../config/journeys'
import { useApp, useSummary } from '../../components/AppContext'
import { AreaChartBox, BarChartBox } from '../../components/charts'
import { Badge, Card, Kpi, PageHead } from '../../components/ui'
import { brl, num, pct } from '../../components/format'
import { ALL_MONTHS, monthLabel } from '../../domain/dates'
import { computeAllRows, deduplicacao, getSummary, variacao } from '../../domain/metrics'
import { alertas } from '../../domain/goals'
import { mesesTendencia, scopeSub } from '../shared/common'

export function GlobalDashboard() {
  const { ds, months, periodLabel } = useApp()
  const { cur, prev } = useSummary('global')
  const dedup = deduplicacao(ds)
  const all = computeAllRows(ds)
  const ms = mesesTendencia(months, ALL_MONTHS)
  const porMes = ms.map((m) => {
    const i = ALL_MONTHS.indexOf(m)
    return {
      label: monthLabel(m),
      ...Object.fromEntries(JOURNEY_IDS.map((j) => [`u_${j}`, all[j][i].membros])),
      ...Object.fromEntries(JOURNEY_IDS.map((j) => [`r_${j}`, all[j][i].receitaBruta])),
    }
  })

  return (
    <>
      <PageHead eyebrow="AKORA Global" title="Visão consolidada da empresa" sub={scopeSub('global', periodLabel)} />

      <div className="grid kpis">
        <Kpi label="Usuárias únicas" value={cur.totalCadastros} delta={variacao(cur.totalCadastros, prev.totalCadastros)} foot="sem duplicar migrações" />
        <Kpi label="Usuárias ativas" value={cur.ativas} delta={variacao(cur.ativas, prev.ativas)} />
        <Kpi label="Assinantes Premium" value={cur.premium} delta={variacao(cur.premium, prev.premium)} />
        <Kpi label="Faturamento" value={cur.receitaBruta} formato="brl" delta={variacao(cur.receitaBruta, prev.receitaBruta)} />
        <Kpi label="Receita recebida" value={cur.receitaRecebida} formato="brl" delta={variacao(cur.receitaRecebida, prev.receitaRecebida)} />
        <Kpi label="Despesas" value={cur.despesasTotal} formato="brl" delta={variacao(cur.despesasTotal, prev.despesasTotal)} inverse />
        <Kpi label="Resultado" value={cur.resultado} formato="brl" foot={`margem ${pct(cur.margem)}`} />
        <Kpi label="Investimento em marketing" value={cur.despesas.marketing} formato="brl" delta={variacao(cur.despesas.marketing, prev.despesas.marketing)} inverse />
        <Kpi label="MRR" value={cur.mrr} formato="brl" delta={variacao(cur.mrr, prev.mrr)} foot={`ARR ${brl(cur.arr)}`} />
        <Kpi label="Crescimento" value={cur.crescimento} formato="pct" foot="contas ativas no período" />
      </div>

      <div className="compare-cards">
        {JOURNEY_IDS.map((j) => {
          const s = getSummary(ds, j, months)
          const share = cur.receitaBruta ? s.receitaBruta / cur.receitaBruta : 0
          const nAlertas = alertas(ds, j).length
          return (
            <section key={j} className="card journey-card" style={{ '--c': JOURNEYS[j].cor } as CSSProperties}>
              <div>
                <div className="head">
                  <div>
                    <h2>{JOURNEYS[j].nome}</h2>
                    <span className="muted small">{JOURNEYS[j].faixa}</span>
                  </div>
                  <Badge tone={JOURNEYS[j].status === 'ativa' ? 'ok' : 'warn'}>{JOURNEYS[j].status === 'ativa' ? 'Ativa' : 'Pré-lançamento'}</Badge>
                </div>
                <dl>
                  <dt>Usuárias</dt>
                  <dd>{num(s.totalCadastros)}</dd>
                  <dt>Ativas</dt>
                  <dd>{num(s.ativas)}</dd>
                  <dt>Premium</dt>
                  <dd>{num(s.premium)}</dd>
                  <dt>Faturamento</dt>
                  <dd>{brl(s.receitaBruta)}</dd>
                  <dt>Participação na receita</dt>
                  <dd>{pct(share)}</dd>
                  <dt>Resultado</dt>
                  <dd style={{ color: s.resultado < 0 ? 'var(--bad)' : 'var(--ok)' }}>{brl(s.resultado)}</dd>
                </dl>
                <div className="btn-row mt">
                  <Link className="btn primary" style={{ background: JOURNEYS[j].cor, borderColor: JOURNEYS[j].cor }} to={`/${j}/dashboard`}>
                    Abrir escritório
                  </Link>
                  {nAlertas > 0 && <Badge tone="warn">{nAlertas} alerta(s)</Badge>}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <div className="grid cols-2 mt">
        <Card title="Contas ativas por jornada">
          <BarChartBox stacked x="label" data={porMes} series={JOURNEY_IDS.map((j) => ({ key: `u_${j}`, label: JOURNEYS[j].nome, color: JOURNEYS[j].cor }))} />
        </Card>
        <Card title="Faturamento por jornada">
          <AreaChartBox stacked formato="brl" x="label" data={porMes} series={JOURNEY_IDS.map((j) => ({ key: `r_${j}`, label: JOURNEYS[j].nome, color: JOURNEYS[j].cor }))} />
        </Card>
        <Card title="Usuárias sem duplicidade" sub="Uma pessoa que migra de Teen para Ciclo (ou de Ciclo para 40+) conta uma única vez no total global" className="span-2">
          <div className="grid cols-3">
            <div>
              <div className="kpi-label">Soma dos cadastros das jornadas</div>
              <div className="kpi-value">{num(dedup.somaJornadas)}</div>
            </div>
            <div>
              <div className="kpi-label">(−) Migrações entre jornadas</div>
              <div className="kpi-value">{num(dedup.migracoes)}</div>
            </div>
            <div>
              <div className="kpi-label">= Pessoas únicas</div>
              <div className="kpi-value">{num(dedup.totalUnico)}</div>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
