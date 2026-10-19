import { useMemo } from 'react'
import { FEATURES_EM_BREVE, JOURNEYS, type JourneyId } from '../../config/journeys'
import { useApp, useSummary } from '../../components/AppContext'
import { BarChartBox, DonutBox, LineChartBox } from '../../components/charts'
import { Badge, Card, DataTable, ExportButtons, Kpi, PageHead } from '../../components/ui'
import { brl, num } from '../../components/format'
import { ALL_MONTHS, dateLabel, monthEnd, monthStart } from '../../domain/dates'
import { variacao } from '../../domain/metrics'
import { JourneyBanner, mesesTendencia, scopeSub, seriesMensal } from '../shared/common'

export function Assinaturas({ journey }: { journey: JourneyId }) {
  const { ds, months, periodLabel } = useApp()
  const j = JOURNEYS[journey]
  const { cur, prev } = useSummary(journey)
  const serie = seriesMensal(ds, journey, mesesTendencia(months, ALL_MONTHS))

  const { reembolsos, pendentes } = useMemo(() => {
    const de = monthStart(months[0])
    const ate = monthEnd(months[months.length - 1])
    const t = ds.transacoes.filter((x) => x.jornada === journey && x.data >= de && x.data <= ate)
    return { reembolsos: t.filter((x) => x.status === 'reembolsado'), pendentes: t.filter((x) => x.status === 'pendente') }
  }, [ds, journey, months])

  return (
    <>
      <PageHead
        eyebrow="Assinaturas"
        title={`Assinaturas · ${j.nome.replace('AKORA ', '')}`}
        sub={scopeSub(journey, periodLabel)}
        actions={
          <ExportButtons
            name={`assinaturas_${journey}`}
            sheets={() => [
              { name: 'Mensal', rows: seriesMensal(ds, journey, months).map((r) => ({ Mês: r.label, Assinantes: r.premium, Mensal: r.premiumMensal, Anual: r.premiumAnual, Novas: r.novasAssinaturas, Renovações: r.renovacoes, Cancelamentos: r.cancelamentos, Reembolsos: r.reembolsos, Pendentes: r.pendentes })) },
              { name: 'Reembolsos e pendências', rows: [...reembolsos, ...pendentes].map((t) => ({ Transação: t.id, Data: t.data, Plano: t.plano, Valor: t.valor, Status: t.status })) },
            ]}
          />
        }
      />
      <JourneyBanner journey={journey} />
      {j.protecaoMenores && (
        <div className="banner">
          <span>👪</span>
          <span>Assinaturas Teen são contratadas e pagas pelo responsável legal.</span>
        </div>
      )}

      <div className="grid kpis">
        <Kpi label="Assinantes" value={cur.premium} delta={variacao(cur.premium, prev.premium)} />
        <Kpi label="Plano gratuito" value={cur.gratuitas} delta={variacao(cur.gratuitas, prev.gratuitas)} />
        <Kpi label="Premium mensal" value={cur.premiumMensal} foot={brl(j.precos.mensal) + '/mês'} />
        <Kpi label="Premium anual" value={cur.premiumAnual} foot={brl(j.precos.anual) + '/ano'} />
        <Kpi label="Novas assinaturas" value={cur.novasAssinaturas} delta={variacao(cur.novasAssinaturas, prev.novasAssinaturas)} />
        <Kpi label="Renovações anuais" value={cur.renovacoes} delta={variacao(cur.renovacoes, prev.renovacoes)} />
        <Kpi label="Cancelamentos" value={cur.cancelamentos} delta={variacao(cur.cancelamentos, prev.cancelamentos)} inverse foot={`churn ${(cur.churn * 100).toFixed(1).replace('.', ',')}%/mês`} />
        <Kpi label="Conversão gratuito → Premium" value={cur.conversao} formato="pct" foot="média mensal" />
        <Kpi label="Reembolsos" value={cur.reembolsos} formato="brl" inverse delta={variacao(cur.reembolsos, prev.reembolsos)} />
        <Kpi label="Pagamentos pendentes" value={cur.pendentes} formato="brl" foot={`${pendentes.length} cobrança(s)`} />
      </div>

      <div className="grid cols-2">
        <Card title="Base de assinantes" sub="Premium mensal × anual">
          <BarChartBox
            stacked
            x="label"
            data={serie}
            series={[
              { key: 'premiumMensal', label: 'Mensal', color: j.cor },
              { key: 'premiumAnual', label: 'Anual', color: '#423566' },
            ]}
          />
        </Card>
        <Card title="Entradas e saídas" sub="Novas assinaturas, renovações e cancelamentos">
          <LineChartBox
            x="label"
            data={serie}
            series={[
              { key: 'novasAssinaturas', label: 'Novas', color: j.cor },
              { key: 'renovacoes', label: 'Renovações', color: '#7B6AA6' },
              { key: 'cancelamentos', label: 'Cancelamentos', color: '#B5524A' },
            ]}
          />
        </Card>
        <Card title="Distribuição atual">
          <DonutBox
            data={[
              { name: 'Gratuito', value: cur.gratuitas, color: '#B9B0CF' },
              { name: 'Premium mensal', value: cur.premiumMensal, color: j.cor },
              { name: 'Premium anual', value: cur.premiumAnual, color: '#423566' },
            ]}
          />
        </Card>
        <Card title="Reembolsos e pagamentos pendentes" sub={periodLabel} actions={<Badge tone="warn">{FEATURES_EM_BREVE.gatewayPagamento}</Badge>}>
          <DataTable
            rows={[...pendentes, ...reembolsos]}
            pageSize={8}
            columns={[
              { key: 'id', label: 'Transação', value: (t) => t.id },
              { key: 'd', label: 'Data', value: (t) => t.data, render: (t) => dateLabel(t.data) },
              { key: 'p', label: 'Plano', value: (t) => t.plano },
              { key: 'v', label: 'Valor', value: (t) => t.valor, formato: 'brlCents' },
              { key: 's', label: 'Status', value: (t) => t.status, render: (t) => <Badge tone={t.status === 'pendente' ? 'warn' : 'bad'}>{t.status}</Badge> },
            ]}
          />
          <p className="muted small">Identificadores pseudonimizados — o painel não exibe dados pessoais das usuárias. Total: {num(pendentes.length + reembolsos.length)}.</p>
        </Card>
      </div>
    </>
  )
}
