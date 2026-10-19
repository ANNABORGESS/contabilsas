import { JOURNEYS, type JourneyId } from '../../config/journeys'
import { useApp, useSummary } from '../../components/AppContext'
import { AreaChartBox, BarChartBox, DonutBox, LineChartBox } from '../../components/charts'
import { Card, DataTable, ExportButtons, Kpi, PageHead } from '../../components/ui'
import { pct } from '../../components/format'
import { ALL_MONTHS } from '../../domain/dates'
import { variacao } from '../../domain/metrics'
import { JourneyBanner, mesesTendencia, scopeSub, seriesMensal } from '../shared/common'

export function Usuarias({ journey }: { journey: JourneyId }) {
  const { ds, months, periodLabel } = useApp()
  const j = JOURNEYS[journey]
  const { cur, prev } = useSummary(journey)
  const serie = seriesMensal(ds, journey, mesesTendencia(months, ALL_MONTHS))
  const historico = seriesMensal(ds, journey, ALL_MONTHS.filter((m) => m >= j.inicio.slice(0, 7)))
  const tabela = seriesMensal(ds, journey, months).reverse()

  return (
    <>
      <PageHead
        eyebrow="Usuárias"
        title={`Usuárias · ${j.nome.replace('AKORA ', '')}`}
        sub={scopeSub(journey, periodLabel)}
        actions={
          <ExportButtons
            name={`usuarias_${journey}`}
            sheets={() => [
              {
                name: 'Usuárias por mês',
                rows: historico.map((r) => ({ Mês: r.label, 'Cadastros acumulados': r.cadastrosAcum, Novas: r.novas, 'Migradas (entrada)': r.migradasEntrada, 'Migradas (saída)': r.migradasSaida, Contas: r.membros, Ativas: r.ativas, Inativas: r.membros - r.ativas, Premium: r.premium, Gratuitas: r.membros - r.premium, Cancelamentos: r.cancelamentos })),
              },
            ]}
          />
        }
      />
      <JourneyBanner journey={journey} />

      <div className="grid kpis">
        <Kpi label="Total de cadastros" value={cur.totalCadastros} delta={variacao(cur.totalCadastros, prev.totalCadastros)} />
        <Kpi label="Novas usuárias" value={cur.novas} delta={variacao(cur.novas, prev.novas)} foot="no período" />
        <Kpi label="Ativas" value={cur.ativas} delta={variacao(cur.ativas, prev.ativas)} />
        <Kpi label="Inativas" value={cur.inativas} delta={variacao(cur.inativas, prev.inativas)} inverse />
        <Kpi label="Gratuitas" value={cur.gratuitas} />
        <Kpi label="Premium" value={cur.premium} delta={variacao(cur.premium, prev.premium)} />
        <Kpi label="Retenção de assinantes" value={cur.retencao} formato="pct" foot="média mensal" />
        <Kpi label="Cancelamentos" value={cur.cancelamentos} delta={variacao(cur.cancelamentos, prev.cancelamentos)} inverse foot="assinaturas" />
      </div>

      {(cur.migradasEntrada > 0 || cur.migradasSaida > 0) && (
        <div className="banner">
          <span>⇄</span>
          <span>
            No período, <strong>{cur.migradasEntrada}</strong> usuária(s) chegaram por migração de faixa etária e <strong>{cur.migradasSaida}</strong> migraram para a próxima jornada.
            O histórico e a receita anteriores à migração permanecem na jornada de origem; no consolidado global cada pessoa conta uma única vez.
          </span>
        </div>
      )}

      <div className="grid cols-2">
        <Card title="Crescimento histórico" sub="Cadastros acumulados desde o lançamento da jornada">
          <AreaChartBox data={historico} x="label" series={[{ key: 'cadastrosAcum', label: 'Cadastros', color: j.cor }]} />
        </Card>
        <Card title="Novas usuárias por mês" sub="Cadastros originados na jornada e migrações">
          <BarChartBox
            data={serie}
            x="label"
            stacked
            series={[
              { key: 'novas', label: 'Novos cadastros', color: j.cor },
              { key: 'migradasEntrada', label: 'Migradas (entrada)', color: '#B9B0CF' },
            ]}
          />
        </Card>
        <Card title="Ativas × inativas" sub="Situação ao final de cada mês">
          <BarChartBox
            data={serie.map((r) => ({ label: r.label, ativas: r.ativas, inativas: r.membros - r.ativas }))}
            x="label"
            stacked
            series={[
              { key: 'ativas', label: 'Ativas', color: j.cor },
              { key: 'inativas', label: 'Inativas', color: '#DCD6E6' },
            ]}
          />
        </Card>
        <Card title="Gratuitas × Premium" sub="Situação atual">
          <DonutBox
            data={[
              { name: 'Gratuitas', value: cur.gratuitas, color: '#B9B0CF' },
              { name: 'Premium mensal', value: cur.premiumMensal, color: j.cor },
              { name: 'Premium anual', value: cur.premiumAnual, color: '#423566' },
            ]}
          />
        </Card>
        <Card title="Taxa de atividade" sub="Usuárias ativas / contas abertas" className="span-2">
          <LineChartBox data={serie.map((r) => ({ label: r.label, taxa: r.membros ? r.ativas / r.membros : 0 }))} x="label" formato="pct" series={[{ key: 'taxa', label: 'Taxa de atividade', color: j.cor }]} height={200} />
        </Card>
      </div>

      <Card title="Detalhamento por período" className="mt">
        <DataTable
          rows={tabela}
          exportName={`usuarias_${journey}_periodo`}
          searchable={false}
          columns={[
            { key: 'mes', label: 'Mês', value: (r) => r.label },
            { key: 'cad', label: 'Cadastros acum.', value: (r) => r.cadastrosAcum, formato: 'num' },
            { key: 'novas', label: 'Novas', value: (r) => r.novas, formato: 'num' },
            { key: 'mig', label: 'Migr. entrada', value: (r) => r.migradasEntrada, formato: 'num' },
            { key: 'migs', label: 'Migr. saída', value: (r) => r.migradasSaida, formato: 'num' },
            { key: 'ativas', label: 'Ativas', value: (r) => r.ativas, formato: 'num' },
            { key: 'inativas', label: 'Inativas', value: (r) => r.membros - r.ativas, formato: 'num' },
            { key: 'premium', label: 'Premium', value: (r) => r.premium, formato: 'num' },
            { key: 'taxa', label: '% Premium', value: (r) => (r.membros ? r.premium / r.membros : 0), render: (r) => pct(r.membros ? r.premium / r.membros : 0), align: 'right' },
          ]}
        />
      </Card>
    </>
  )
}
