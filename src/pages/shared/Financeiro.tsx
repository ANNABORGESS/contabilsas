import { useMemo, useState } from 'react'
import { JOURNEYS, JOURNEY_IDS, scopeColor, scopeLabel, type Scope } from '../../config/journeys'
import { useApp, useSummary } from '../../components/AppContext'
import { AreaChartBox, BarChartBox, DonutBox, LineChartBox, PALETA } from '../../components/charts'
import { Card, DataTable, ExportButtons, Kpi, PageHead, Tabs } from '../../components/ui'
import { brl, pct } from '../../components/format'
import { ALL_MONTHS, monthLabel } from '../../domain/dates'
import { alocarDespesa, descreverDestino } from '../../domain/allocation'
import { ALIQUOTA_IMPOSTOS, CATEGORIAS, TAXA_GATEWAY, basesRateio, computeAllRows, previsaoFaturamento, variacao, type Summary } from '../../domain/metrics'
import { JourneyBanner, mesesTendencia, scopeSub, seriesMensal } from './common'

type Aba = 'visao' | 'dre' | 'caixa' | 'receitas' | 'despesas' | 'previsao'

export function Financeiro({ scope }: { scope: Scope }) {
  const { ds, months, periodLabel } = useApp()
  const { cur, prev } = useSummary(scope)
  const [aba, setAba] = useState<Aba>('visao')
  const cor = scopeColor(scope)
  const serie = seriesMensal(ds, scope, mesesTendencia(months, ALL_MONTHS))

  const despesasPeriodo = useMemo(() => {
    const set = new Set(months)
    return ds.despesas
      .filter((d) => set.has(d.competencia))
      .map((d) => {
        const parcelas = alocarDespesa(d, basesRateio(ds, d.competencia))
        return { d, parcelas, valorEscopo: scope === 'global' ? d.valor : parcelas[scope] }
      })
      .filter((x) => x.valorEscopo > 0)
  }, [ds, months, scope])

  return (
    <>
      <PageHead
        eyebrow={scope === 'global' ? 'Financeiro consolidado' : 'Financeiro'}
        title={`Financeiro · ${scopeLabel(scope).replace('AKORA ', '')}`}
        sub={scopeSub(scope, periodLabel)}
        actions={
          <ExportButtons
            name={`financeiro_${scope}`}
            sheets={() => [
              { name: 'DRE gerencial', rows: dreLinhas(cur, prev).map((l) => ({ Conta: l.conta, 'Período atual': round(l.atual), 'Período anterior': round(l.anterior) })) },
              { name: 'Mensal', rows: seriesMensal(ds, scope, months).map((r) => ({ Mês: r.label, 'Faturamento bruto': round(r.receitaBruta), Recebido: round(r.receitaRecebida), Reembolsos: round(r.reembolsos), Pendentes: round(r.pendentes), Despesas: round(Object.values(r.despesas).reduce((s, v) => s + v, 0)), MRR: round(r.mrr) })) },
              { name: 'Despesas', rows: despesasPeriodo.map(({ d, valorEscopo }) => ({ Competência: d.competencia, Descrição: d.descricao, Categoria: d.categoria, Destino: descreverDestino(d), 'Valor original': d.valor, 'Valor no escopo': valorEscopo })) },
            ]}
          />
        }
      />
      {scope !== 'global' && <JourneyBanner journey={scope} />}
      {scope === 'global' && (
        <div className="banner">
          <span>Σ</span>
          <span>
            O consolidado soma cada transação uma única vez e usa o valor original das despesas compartilhadas. A soma das parcelas rateadas entre Teen, Ciclo e 40+ é sempre igual ao valor original — sem duplicidade.
          </span>
        </div>
      )}

      <Tabs<Aba>
        value={aba}
        onChange={setAba}
        tabs={[
          { id: 'visao', label: 'Visão geral' },
          { id: 'dre', label: 'DRE gerencial' },
          { id: 'caixa', label: 'Fluxo de caixa' },
          { id: 'receitas', label: 'Receitas e assinaturas' },
          { id: 'despesas', label: 'Despesas e rateio' },
          { id: 'previsao', label: 'Previsão' },
        ]}
      />

      {aba === 'visao' && (
        <>
          <div className="grid kpis">
            <Kpi label="Faturamento bruto" value={cur.receitaBruta} formato="brl" delta={variacao(cur.receitaBruta, prev.receitaBruta)} />
            <Kpi label="Receita recebida" value={cur.receitaRecebida} formato="brl" delta={variacao(cur.receitaRecebida, prev.receitaRecebida)} />
            <Kpi label="Faturamento líquido" value={cur.receitaLiquida} formato="brl" delta={variacao(cur.receitaLiquida, prev.receitaLiquida)} foot="após impostos, taxas e reembolsos" />
            <Kpi label="MRR" value={cur.mrr} formato="brl" delta={variacao(cur.mrr, prev.mrr)} />
            <Kpi label="ARR" value={cur.arr} formato="brl" />
            <Kpi label="Despesas operacionais" value={cur.despesasTotal} formato="brl" delta={variacao(cur.despesasTotal, prev.despesasTotal)} inverse />
            <Kpi label="Tecnologia e IA" value={cur.custosTecnologiaIA} formato="brl" delta={variacao(cur.custosTecnologiaIA, prev.custosTecnologiaIA)} inverse />
            <Kpi label="Marketing" value={cur.despesas.marketing} formato="brl" delta={variacao(cur.despesas.marketing, prev.despesas.marketing)} inverse />
            <Kpi label="Resultado" value={cur.resultado} formato="brl" foot={`margem ${pct(cur.margem)}`} />
            <Kpi label="Ticket médio" value={cur.ticketMedio} formato="brlCents" />
          </div>
          <div className="grid cols-2">
            <Card title="Faturamento, recebido e despesas">
              <LineChartBox
                data={serie.map((r) => ({ label: r.label, bruto: r.receitaBruta, recebido: r.receitaRecebida, despesas: Object.values(r.despesas).reduce((s, v) => s + v, 0) }))}
                x="label"
                formato="brl"
                series={[
                  { key: 'bruto', label: 'Faturamento bruto', color: cor },
                  { key: 'recebido', label: 'Recebido', color: '#7B6AA6' },
                  { key: 'despesas', label: 'Despesas', color: '#C9C2D8' },
                ]}
              />
            </Card>
            <Card title="Despesas por categoria" sub={periodLabel}>
              <DonutBox formato="brl" data={CATEGORIAS.map((c, i) => ({ name: c.label, value: Math.round(cur.despesas[c.id]), color: PALETA[i] }))} />
            </Card>
            {scope === 'global' && <ReceitaPorJornada />}
          </div>
        </>
      )}

      {aba === 'dre' && <Dre cur={cur} prev={prev} />}

      {aba === 'caixa' && <FluxoCaixa scope={scope} />}

      {aba === 'receitas' && (
        <div className="grid cols-2">
          <Card title="Receita por plano" sub="Mensal × anual, por competência">
            <BarChartBox
              stacked
              formato="brl"
              x="label"
              data={receitaPorPlano(ds, scope, mesesTendencia(months, ALL_MONTHS))}
              series={[
                { key: 'mensal', label: 'Premium mensal', color: cor },
                { key: 'anual', label: 'Premium anual', color: '#423566' },
              ]}
            />
          </Card>
          <Card title="Recebido, pendente e reembolsado">
            <BarChartBox
              stacked
              formato="brl"
              x="label"
              data={serie.map((r) => ({ label: r.label, recebido: r.receitaRecebida, pendente: r.pendentes, reembolsado: r.reembolsos }))}
              series={[
                { key: 'recebido', label: 'Recebido', color: cor },
                { key: 'pendente', label: 'Pendente', color: '#E0B7AE' },
                { key: 'reembolsado', label: 'Reembolsado', color: '#B5524A' },
              ]}
            />
          </Card>
          <Card title="MRR" sub="Receita recorrente mensal ao fim de cada mês" className="span-2">
            <AreaChartBox data={serie} x="label" formato="brl" series={[{ key: 'mrr', label: 'MRR', color: cor }]} height={220} />
          </Card>
        </div>
      )}

      {aba === 'despesas' && (
        <Card title="Lançamentos de despesa" sub={scope === 'global' ? 'Valor original e distribuição por jornada' : 'Despesas diretas da jornada e parcela de despesas compartilhadas (rateio)'}>
          <DataTable
            rows={despesasPeriodo}
            exportName={`despesas_${scope}`}
            columns={[
              { key: 'comp', label: 'Competência', value: (x) => x.d.competencia, render: (x) => monthLabel(x.d.competencia) },
              { key: 'desc', label: 'Descrição', value: (x) => x.d.descricao },
              { key: 'cat', label: 'Categoria', value: (x) => CATEGORIAS.find((c) => c.id === x.d.categoria)!.label },
              { key: 'dest', label: 'Destino', value: (x) => ('jornada' in x.d.destino ? `${JOURNEYS[x.d.destino.jornada].nome} (direta)` : descreverDestino(x.d)) },
              { key: 'orig', label: 'Valor original', value: (x) => x.d.valor, formato: 'brlCents' },
              ...(scope === 'global'
                ? JOURNEY_IDS.map((j) => ({ key: j, label: JOURNEYS[j].nome.replace('AKORA ', ''), value: (x: (typeof despesasPeriodo)[number]) => x.parcelas[j], formato: 'brlCents' as const }))
                : [{ key: 'esc', label: 'Parcela da jornada', value: (x: (typeof despesasPeriodo)[number]) => x.valorEscopo, formato: 'brlCents' as const }]),
            ]}
          />
        </Card>
      )}

      {aba === 'previsao' && <Previsao scope={scope} />}
    </>
  )
}

const round = (v: number) => Math.round(v * 100) / 100

interface LinhaDre {
  conta: string
  atual: number
  anterior: number
  tipo?: 'subtotal' | 'total'
}

function dreLinhas(c: Summary, p: Summary): LinhaDre[] {
  const l = (conta: string, f: (s: Summary) => number, tipo?: LinhaDre['tipo']): LinhaDre => ({ conta, atual: f(c), anterior: f(p), tipo })
  return [
    l('Faturamento bruto', (s) => s.receitaBruta),
    l('(−) Reembolsos', (s) => -s.reembolsos),
    l(`(−) Impostos sobre receita (${pct(ALIQUOTA_IMPOSTOS)})`, (s) => -s.impostos),
    l(`(−) Taxas do gateway (${pct(TAXA_GATEWAY)})`, (s) => -s.taxas),
    l('= Receita líquida', (s) => s.receitaLiquida, 'subtotal'),
    l('(−) Tecnologia', (s) => -s.despesas.tecnologia),
    l('(−) Inteligência artificial', (s) => -s.despesas.ia),
    l('= Margem bruta', (s) => s.margemBruta, 'subtotal'),
    l('(−) Marketing', (s) => -s.despesas.marketing),
    l('(−) Pessoal', (s) => -s.despesas.pessoal),
    l('(−) Operacional e administrativo', (s) => -s.despesas.operacional),
    l('(−) Jurídico e compliance', (s) => -s.despesas.juridico),
    l('= Resultado operacional', (s) => s.resultado, 'total'),
  ]
}

function Dre({ cur, prev }: { cur: Summary; prev: Summary }) {
  const linhas = dreLinhas(cur, prev)
  return (
    <Card title="DRE gerencial" sub="Regime de competência · período atual × período anterior">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Conta</th>
              <th className="num">Período atual</th>
              <th className="num">% receita líq.</th>
              <th className="num">Período anterior</th>
              <th className="num">Variação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              // Linhas de dedução: variação do valor absoluto (custo maior = variação positiva).
              const v = l.conta.startsWith('(−)') ? variacao(Math.abs(l.atual), Math.abs(l.anterior)) : variacao(l.atual, l.anterior)
              return (
                <tr key={l.conta} className={l.tipo ?? ''}>
                  <td>{l.conta}</td>
                  <td className="num">{brl(l.atual)}</td>
                  <td className="num">{cur.receitaLiquida ? pct(l.atual / cur.receitaLiquida) : '—'}</td>
                  <td className="num">{brl(l.anterior)}</td>
                  <td className="num">{v === null ? '—' : `${v > 0 ? '+' : ''}${pct(v)}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small mt">Alíquota e taxa de gateway são estimativas configuráveis até a integração com o ERP/contabilidade.</p>
    </Card>
  )
}

function FluxoCaixa({ scope }: { scope: Scope }) {
  const { ds, months } = useApp()
  const rows = computeAllRows(ds)[scope]
  let saldo = 0
  const fluxo = rows.map((r) => {
    const entradas = r.receitaRecebida
    const saidas = Object.values(r.despesas).reduce((s, v) => s + v, 0) + (r.receitaBruta - r.reembolsos) * ALIQUOTA_IMPOSTOS + r.receitaRecebida * TAXA_GATEWAY
    saldo += entradas - saidas
    return { mes: r.mes, label: monthLabel(r.mes), entradas, saidas, liquido: entradas - saidas, saldo }
  })
  const set = new Set(mesesTendencia(months, ALL_MONTHS))
  const vis = fluxo.filter((f) => set.has(f.mes))
  return (
    <div className="stack">
      <Card title="Fluxo de caixa" sub="Entradas recebidas × saídas (despesas, impostos e taxas)">
        <BarChartBox
          data={vis}
          x="label"
          formato="brl"
          series={[
            { key: 'entradas', label: 'Entradas', color: scopeColor(scope) },
            { key: 'saidas', label: 'Saídas', color: '#C9C2D8' },
          ]}
        />
      </Card>
      <Card title="Saldo acumulado" sub="Desde o início da série (sem aporte de capital)">
        <DataTable
          rows={[...vis].reverse()}
          searchable={false}
          columns={[
            { key: 'm', label: 'Mês', value: (r) => r.label },
            { key: 'e', label: 'Entradas', value: (r) => r.entradas, formato: 'brl' },
            { key: 's', label: 'Saídas', value: (r) => r.saidas, formato: 'brl' },
            { key: 'l', label: 'Geração líquida', value: (r) => r.liquido, formato: 'brl' },
            { key: 'a', label: 'Saldo acumulado', value: (r) => r.saldo, formato: 'brl' },
          ]}
        />
      </Card>
    </div>
  )
}

function Previsao({ scope }: { scope: Scope }) {
  const { ds } = useApp()
  const rows = computeAllRows(ds)[scope]
  const prev = previsaoFaturamento(rows)
  const hist = rows.slice(-7, -1).map((r) => ({ label: monthLabel(r.mes), realizado: r.receitaBruta - r.reembolsos }))
  const data = [...hist, ...prev.map((p) => ({ label: monthLabel(p.mes), previsto: p.previsto }))]
  if (hist.length) (data[hist.length - 1] as Record<string, number | string>).previsto = hist[hist.length - 1].realizado
  return (
    <Card title="Previsão de faturamento" sub="Tendência linear dos últimos 6 meses fechados (estimativa)">
      <LineChartBox
        data={data}
        x="label"
        formato="brl"
        series={[
          { key: 'realizado', label: 'Realizado', color: scopeColor(scope) },
          { key: 'previsto', label: 'Previsto', color: '#7B6AA6' },
        ]}
      />
      <div className="grid cols-3 mt">
        {prev.map((p) => (
          <div key={p.mes} className="card">
            <div className="kpi-label">{monthLabel(p.mes)}</div>
            <div className="kpi-value">{brl(p.previsto)}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ReceitaPorJornada() {
  const { ds, months } = useApp()
  const all = computeAllRows(ds)
  const ms = mesesTendencia(months, ALL_MONTHS)
  const data = ms.map((m) => {
    const i = ALL_MONTHS.indexOf(m)
    return { label: monthLabel(m), teen: all.teen[i].receitaBruta, ciclo: all.ciclo[i].receitaBruta, mais40: all.mais40[i].receitaBruta }
  })
  return (
    <Card title="Faturamento por jornada" className="span-2">
      <AreaChartBox stacked formato="brl" x="label" data={data} series={JOURNEY_IDS.map((j) => ({ key: j, label: JOURNEYS[j].nome, color: JOURNEYS[j].cor }))} />
    </Card>
  )
}

function receitaPorPlano(ds: ReturnType<typeof useApp>['ds'], scope: Scope, months: string[]) {
  const set = new Set(months)
  const acc = new Map<string, { mensal: number; anual: number }>()
  for (const m of months) acc.set(m, { mensal: 0, anual: 0 })
  for (const t of ds.transacoes) {
    if (!set.has(t.competencia) || t.status === 'reembolsado') continue
    if (scope !== 'global' && t.jornada !== scope) continue
    acc.get(t.competencia)![t.plano] += t.valor
  }
  return months.map((m) => ({ label: monthLabel(m), ...acc.get(m)! }))
}
