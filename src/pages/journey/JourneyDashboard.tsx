import { Link } from 'react-router-dom'
import { JOURNEYS, type JourneyId } from '../../config/journeys'
import { useApp, useSummary } from '../../components/AppContext'
import { AreaChartBox, BarChartBox, LineChartBox } from '../../components/charts'
import { Badge, Card, Delta, Kpi, PageHead, Progress } from '../../components/ui'
import { brl, fmt, num } from '../../components/format'
import { ALL_MONTHS, dateLabel } from '../../domain/dates'
import { cadastrosDiarios, crescimentoJanelas, variacao } from '../../domain/metrics'
import { alertas, avaliarMetas } from '../../domain/goals'
import { JourneyBanner, mesesTendencia, scopeSub, seriesMensal } from '../shared/common'

export function JourneyDashboard({ journey }: { journey: JourneyId }) {
  const { ds, months, periodLabel } = useApp()
  const j = JOURNEYS[journey]
  const { cur, prev } = useSummary(journey)
  const serie = seriesMensal(ds, journey, mesesTendencia(months, ALL_MONTHS))
  const janelas = crescimentoJanelas(ds, journey)
  const diarios = cadastrosDiarios(ds, journey).map((d) => ({ ...d, label: dateLabel(d.data).slice(0, 5) }))
  const metas = avaliarMetas(ds, journey, 'mensal')
  const avisos = alertas(ds, journey)

  return (
    <>
      <PageHead eyebrow="Dashboard" title={j.nome} sub={scopeSub(journey, periodLabel)} />
      <JourneyBanner journey={journey} />

      <div className="grid kpis">
        <Kpi label="Total de usuárias" value={cur.totalCadastros} delta={variacao(cur.totalCadastros, prev.totalCadastros)} foot="cadastros acumulados" />
        <Kpi label="Usuárias ativas" value={cur.ativas} delta={variacao(cur.ativas, prev.ativas)} foot="no último mês" />
        <Kpi label="Assinantes Premium" value={cur.premium} delta={variacao(cur.premium, prev.premium)} />
        <Kpi label="Faturamento" value={cur.receitaBruta} formato="brl" delta={variacao(cur.receitaBruta, prev.receitaBruta)} />
        <Kpi label="Despesas" value={cur.despesasTotal} formato="brl" delta={variacao(cur.despesasTotal, prev.despesasTotal)} inverse foot="diretas + rateio" />
        <Kpi label="Investimento em marketing" value={cur.despesas.marketing} formato="brl" delta={variacao(cur.despesas.marketing, prev.despesas.marketing)} inverse />
        <Kpi label="Resultado" value={cur.resultado} formato="brl" foot={`margem ${fmt(cur.margem, 'pct')}`} />
        <Kpi label="Crescimento" value={cur.crescimento} formato="pct" foot="usuárias com conta ativa no período" />
      </div>

      <div className="grid cols-3">
        {janelas.map((w) => (
          <Card key={w.label} title={`Novas usuárias · ${w.label}`}>
            <div className="kpi-value">{num(w.atual)}</div>
            <div className="kpi-foot">
              <Delta value={w.variacao} /> vs. período anterior ({num(w.anterior)})
            </div>
          </Card>
        ))}
      </div>

      <div className="grid cols-2 mt">
        <Card title="Evolução de usuárias" sub="Contas ativas, usuárias ativas no mês e Premium">
          <AreaChartBox
            data={serie}
            x="label"
            series={[
              { key: 'membros', label: 'Contas', color: '#B9B0CF' },
              { key: 'ativas', label: 'Ativas', color: j.cor },
              { key: 'premium', label: 'Premium', color: '#423566' },
            ]}
          />
        </Card>
        <Card title="Receita × despesas" sub="Faturamento bruto e despesas (diretas + rateio)">
          <BarChartBox
            data={serie.map((r) => ({ label: r.label, receita: r.receitaBruta, despesas: Object.values(r.despesas).reduce((s, v) => s + v, 0) }))}
            x="label"
            formato="brl"
            series={[
              { key: 'receita', label: 'Faturamento', color: j.cor },
              { key: 'despesas', label: 'Despesas', color: '#B9B0CF' },
            ]}
          />
        </Card>
        <Card title="Cadastros diários" sub="Últimos 30 dias">
          <LineChartBox data={diarios} x="label" series={[{ key: 'cadastros', label: 'Cadastros', color: j.cor }]} height={220} />
        </Card>
        <Card title="Metas do mês e alertas" actions={<Link className="btn" to={`/${journey}/metas`}>Ver metas</Link>}>
          <ul className="list">
            {metas.map((m) => (
              <li key={m.id} style={{ flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span>{m.label}</span>
                  <span className="small">
                    {fmt(m.realizado, m.formato)} / {fmt(m.meta, m.formato)} <Badge tone={m.status}>{m.status === 'ok' ? 'no ritmo' : m.status === 'atencao' ? 'atenção' : 'crítico'}</Badge>
                  </span>
                </div>
                <Progress value={m.atingimento} marker={m.formato === 'pct' ? undefined : m.ritmoEsperado} color={j.cor} />
              </li>
            ))}
          </ul>
          {avisos.length > 0 && (
            <div className="banner warn mt" style={{ marginBottom: 0 }}>
              <span>⚠</span>
              <span>{avisos.length} alerta(s): {avisos.map((a) => a.texto).join(' ')}</span>
            </div>
          )}
          <p className="muted small mt" style={{ marginBottom: 0 }}>MRR atual: {brl(cur.mrr)} · ARR: {brl(cur.arr)}</p>
        </Card>
      </div>
    </>
  )
}
