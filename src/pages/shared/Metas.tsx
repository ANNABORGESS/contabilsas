import { useState } from 'react'
import { JOURNEYS, JOURNEY_IDS, scopeColor, scopeLabel, type Scope } from '../../config/journeys'
import { useApp } from '../../components/AppContext'
import { BarChartBox } from '../../components/charts'
import { Badge, Card, DataTable, ExportButtons, PageHead, Progress, Tabs } from '../../components/ui'
import { fmt } from '../../components/format'
import { monthLabel, monthOf, REF_DATE } from '../../domain/dates'
import { avaliarMetas, mesesDoHorizonte, type Horizonte } from '../../domain/goals'
import { computeAllRows } from '../../domain/metrics'
import { JourneyBanner, scopeSub } from './common'

const STATUS_LABEL = { ok: 'No ritmo', atencao: 'Atenção', critico: 'Crítico' }

export function Metas({ scope }: { scope: Scope }) {
  const { ds, periodLabel } = useApp()
  const [h, setH] = useState<Horizonte>('mensal')
  const linhas = avaliarMetas(ds, scope, h)
  const cor = scopeColor(scope)
  const meses = mesesDoHorizonte(h)
  const ano = mesesDoHorizonte('anual')

  // Planejamento mês a mês do ano: meta × realizado de faturamento e novas usuárias.
  const rows = computeAllRows(ds)[scope]
  const js = scope === 'global' ? JOURNEY_IDS : [scope]
  const plano = ano.map((m) => {
    const metas = ds.metas.filter((x) => x.mes === m && js.includes(x.jornada))
    const r = rows.find((x) => x.mes === m)
    const realizado = m <= monthOf(REF_DATE) && r
    return {
      mes: m,
      label: monthLabel(m),
      metaFat: metas.reduce((s, x) => s + x.faturamento, 0),
      fat: realizado ? r.receitaBruta - r.reembolsos : 0,
      metaNovas: metas.reduce((s, x) => s + x.novasUsuarias, 0),
      novas: realizado ? r.novas : 0,
      metaAss: metas.reduce((s, x) => s + x.novasAssinaturas, 0),
      ass: realizado ? r.novasAssinaturas : 0,
      metaMkt: metas.reduce((s, x) => s + x.investimentoMarketing, 0),
      mkt: realizado ? r.despesas.marketing : 0,
    }
  })

  return (
    <>
      <PageHead
        eyebrow={scope === 'global' ? 'Metas da empresa' : 'Metas'}
        title={`Metas · ${scopeLabel(scope).replace('AKORA ', '')}`}
        sub={scopeSub(scope, periodLabel)}
        actions={
          <ExportButtons
            name={`metas_${scope}`}
            sheets={() => [
              { name: `Metas ${h}`, rows: linhas.map((l) => ({ Indicador: l.label, Meta: l.meta, Realizado: l.realizado, Atingimento: l.atingimento, Status: STATUS_LABEL[l.status] })) },
              { name: 'Plano anual', rows: plano.map((p) => ({ Mês: p.label, 'Meta faturamento': p.metaFat, Faturamento: p.fat, 'Meta novas usuárias': p.metaNovas, 'Novas usuárias': p.novas, 'Meta assinaturas': p.metaAss, Assinaturas: p.ass, 'Teto marketing': p.metaMkt, Marketing: p.mkt })) },
            ]}
          />
        }
      />
      {scope !== 'global' && <JourneyBanner journey={scope} />}
      {scope === 'global' && (
        <div className="banner">
          <span>Σ</span>
          <span>As metas da empresa são a soma das metas de Teen, Ciclo e 40+. Metas de taxa (retenção e conversão) são ponderadas pelo faturamento-meta de cada jornada.</span>
        </div>
      )}

      <Tabs<Horizonte>
        value={h}
        onChange={setH}
        tabs={[
          { id: 'mensal', label: 'Mensal' },
          { id: 'trimestral', label: 'Trimestral' },
          { id: 'anual', label: 'Anual' },
        ]}
      />
      <p className="sub" style={{ marginBottom: 12 }}>
        {meses.length === 1 ? monthLabel(meses[0]) : `${monthLabel(meses[0])} a ${monthLabel(meses[meses.length - 1])}`} · a marca vertical indica o ritmo esperado até hoje
      </p>

      <div className="grid cols-3">
        {linhas.map((l) => (
          <Card key={l.id} title={l.label} actions={<Badge tone={l.status}>{STATUS_LABEL[l.status]}</Badge>}>
            <div className="kpi-value">{fmt(l.realizado, l.formato)}</div>
            <div className="kpi-foot" style={{ marginBottom: 10 }}>
              meta {fmt(l.meta, l.formato)} · {Math.round(l.atingimento * 100)}% {l.teto ? 'do teto' : 'atingido'}
            </div>
            <Progress value={l.atingimento} marker={l.formato === 'pct' ? undefined : l.ritmoEsperado} color={cor} />
          </Card>
        ))}
      </div>

      {scope === 'global' && (
        <Card title="Atingimento por jornada" sub={`Horizonte ${h}`} className="mt">
          <DataTable
            searchable={false}
            rows={JOURNEY_IDS.map((j) => ({ j, linhas: avaliarMetas(ds, j, h) }))}
            columns={[
              { key: 'j', label: 'Jornada', value: (x) => JOURNEYS[x.j].nome },
              ...['novasUsuarias', 'faturamento', 'novasAssinaturas', 'retencao', 'conversao', 'investimentoMarketing'].map((id) => ({
                key: id,
                label: avaliarMetas(ds, 'teen', h).find((l) => l.id === id)!.label.replace(' (mensal)', '').replace(' (teto)', ''),
                value: (x: { linhas: ReturnType<typeof avaliarMetas> }) => x.linhas.find((l) => l.id === id)!.atingimento,
                render: (x: { linhas: ReturnType<typeof avaliarMetas> }) => {
                  const l = x.linhas.find((y) => y.id === id)!
                  return <Badge tone={l.status}>{Math.round(l.atingimento * 100)}%</Badge>
                },
                align: 'right' as const,
              })),
            ]}
          />
        </Card>
      )}

      <div className="grid cols-2 mt">
        <Card title="Faturamento · meta × realizado" sub={`Planejamento mensal ${ano[0].slice(0, 4)}`}>
          <BarChartBox
            formato="brl"
            x="label"
            data={plano}
            series={[
              { key: 'metaFat', label: 'Meta', color: '#DCD6E6' },
              { key: 'fat', label: 'Realizado', color: cor },
            ]}
          />
        </Card>
        <Card title="Novas usuárias · meta × realizado" sub={`Planejamento mensal ${ano[0].slice(0, 4)}`}>
          <BarChartBox
            x="label"
            data={plano}
            series={[
              { key: 'metaNovas', label: 'Meta', color: '#DCD6E6' },
              { key: 'novas', label: 'Realizado', color: cor },
            ]}
          />
        </Card>
      </div>

      <Card title="Plano anual detalhado" className="mt">
        <DataTable
          searchable={false}
          rows={plano}
          columns={[
            { key: 'm', label: 'Mês', value: (p) => p.label },
            { key: 'mf', label: 'Meta faturamento', value: (p) => p.metaFat, formato: 'brl' },
            { key: 'f', label: 'Faturamento', value: (p) => p.fat, formato: 'brl' },
            { key: 'mn', label: 'Meta novas', value: (p) => p.metaNovas, formato: 'num' },
            { key: 'n', label: 'Novas', value: (p) => p.novas, formato: 'num' },
            { key: 'ma', label: 'Meta assinaturas', value: (p) => p.metaAss, formato: 'num' },
            { key: 'a', label: 'Assinaturas', value: (p) => p.ass, formato: 'num' },
            { key: 'mm', label: 'Teto marketing', value: (p) => p.metaMkt, formato: 'brl' },
            { key: 'mk', label: 'Marketing', value: (p) => p.mkt, formato: 'brl' },
          ]}
        />
      </Card>
    </>
  )
}
