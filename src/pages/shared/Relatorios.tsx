import { useState } from 'react'
import { JOURNEYS, JOURNEY_IDS, scopeLabel, type Scope } from '../../config/journeys'
import { useApp } from '../../components/AppContext'
import { Card, Delta, ExportButtons, PageHead, Tabs } from '../../components/ui'
import { fmt, type Formato } from '../../components/format'
import { ALL_MONTHS, REF_DATE, addMonthKey, dateLabel, monthLabel, type MonthKey } from '../../domain/dates'
import { deduplicacao, getSummary, variacao, type Summary } from '../../domain/metrics'
import { alertas } from '../../domain/goals'
import { JourneyBanner, scopeSub } from './common'

type Tipo = 'executivo' | 'financeiro' | 'marketing' | 'usuarias' | 'assinaturas'
type Comparacao = 'anterior' | 'ano_anterior'

interface Indicador {
  label: string
  f: (s: Summary) => number
  formato: Formato
  inverse?: boolean
}

const IND: Record<Tipo, Indicador[]> = {
  executivo: [
    { label: 'Total de usuárias', f: (s) => s.totalCadastros, formato: 'num' },
    { label: 'Usuárias ativas', f: (s) => s.ativas, formato: 'num' },
    { label: 'Assinantes Premium', f: (s) => s.premium, formato: 'num' },
    { label: 'Faturamento bruto', f: (s) => s.receitaBruta, formato: 'brl' },
    { label: 'Receita líquida', f: (s) => s.receitaLiquida, formato: 'brl' },
    { label: 'Despesas', f: (s) => s.despesasTotal, formato: 'brl', inverse: true },
    { label: 'Resultado', f: (s) => s.resultado, formato: 'brl' },
    { label: 'MRR', f: (s) => s.mrr, formato: 'brl' },
    { label: 'Investimento em marketing', f: (s) => s.despesas.marketing, formato: 'brl', inverse: true },
    { label: 'Crescimento da base', f: (s) => s.crescimento, formato: 'pct' },
  ],
  financeiro: [
    { label: 'Faturamento bruto', f: (s) => s.receitaBruta, formato: 'brl' },
    { label: 'Receita recebida', f: (s) => s.receitaRecebida, formato: 'brl' },
    { label: 'Reembolsos', f: (s) => s.reembolsos, formato: 'brl', inverse: true },
    { label: 'Impostos', f: (s) => s.impostos, formato: 'brl', inverse: true },
    { label: 'Taxas de pagamento', f: (s) => s.taxas, formato: 'brl', inverse: true },
    { label: 'Receita líquida', f: (s) => s.receitaLiquida, formato: 'brl' },
    { label: 'Tecnologia e IA', f: (s) => s.custosTecnologiaIA, formato: 'brl', inverse: true },
    { label: 'Marketing', f: (s) => s.despesas.marketing, formato: 'brl', inverse: true },
    { label: 'Pessoal', f: (s) => s.despesas.pessoal, formato: 'brl', inverse: true },
    { label: 'Despesas totais', f: (s) => s.despesasTotal, formato: 'brl', inverse: true },
    { label: 'Resultado operacional', f: (s) => s.resultado, formato: 'brl' },
    { label: 'Margem', f: (s) => s.margem, formato: 'pct' },
    { label: 'MRR', f: (s) => s.mrr, formato: 'brl' },
    { label: 'ARR', f: (s) => s.arr, formato: 'brl' },
  ],
  marketing: [
    { label: 'Investimento em marketing', f: (s) => s.despesas.marketing, formato: 'brl', inverse: true },
    { label: 'Novas usuárias', f: (s) => s.novas, formato: 'num' },
    { label: 'Custo por cadastro (CAC)', f: (s) => s.cac, formato: 'brlCents', inverse: true },
    { label: 'Novas assinaturas', f: (s) => s.novasAssinaturas, formato: 'num' },
    { label: 'Custo por assinatura', f: (s) => s.custoPorAssinatura, formato: 'brlCents', inverse: true },
    { label: 'Conversão gratuito → Premium', f: (s) => s.conversao, formato: 'pct' },
  ],
  usuarias: [
    { label: 'Total de cadastros', f: (s) => s.totalCadastros, formato: 'num' },
    { label: 'Novas usuárias', f: (s) => s.novas, formato: 'num' },
    { label: 'Migradas (entrada)', f: (s) => s.migradasEntrada, formato: 'num' },
    { label: 'Migradas (saída)', f: (s) => s.migradasSaida, formato: 'num' },
    { label: 'Ativas', f: (s) => s.ativas, formato: 'num' },
    { label: 'Inativas', f: (s) => s.inativas, formato: 'num', inverse: true },
    { label: 'Gratuitas', f: (s) => s.gratuitas, formato: 'num' },
    { label: 'Premium', f: (s) => s.premium, formato: 'num' },
    { label: 'Crescimento', f: (s) => s.crescimento, formato: 'pct' },
  ],
  assinaturas: [
    { label: 'Assinantes', f: (s) => s.premium, formato: 'num' },
    { label: 'Premium mensal', f: (s) => s.premiumMensal, formato: 'num' },
    { label: 'Premium anual', f: (s) => s.premiumAnual, formato: 'num' },
    { label: 'Novas assinaturas', f: (s) => s.novasAssinaturas, formato: 'num' },
    { label: 'Renovações', f: (s) => s.renovacoes, formato: 'num' },
    { label: 'Cancelamentos', f: (s) => s.cancelamentos, formato: 'num', inverse: true },
    { label: 'Churn mensal médio', f: (s) => s.churn, formato: 'pct', inverse: true },
    { label: 'Retenção mensal média', f: (s) => s.retencao, formato: 'pct' },
    { label: 'Reembolsos', f: (s) => s.reembolsos, formato: 'brl', inverse: true },
    { label: 'Pagamentos pendentes', f: (s) => s.pendentes, formato: 'brl', inverse: true },
    { label: 'Conversão gratuito → Premium', f: (s) => s.conversao, formato: 'pct' },
  ],
}

const TITULOS: Record<Tipo, string> = {
  executivo: 'Relatório executivo',
  financeiro: 'Relatório financeiro',
  marketing: 'Relatório de marketing',
  usuarias: 'Relatório de usuárias',
  assinaturas: 'Relatório de assinaturas',
}

function mesmoPeriodoAnoAnterior(months: MonthKey[]): MonthKey[] {
  return months.map((m) => addMonthKey(m, -12)).filter((m) => ALL_MONTHS.includes(m))
}

export function Relatorios({ scope }: { scope: Scope }) {
  const { ds, months, prevMonths, periodLabel } = useApp()
  const [tipo, setTipo] = useState<Tipo>('executivo')
  const [comp, setComp] = useState<Comparacao>('anterior')
  const base = comp === 'anterior' ? prevMonths : mesmoPeriodoAnoAnterior(months)
  const cur = getSummary(ds, scope, months)
  const prev = getSummary(ds, scope, base)
  const ind = IND[tipo]
  const descPeriodo = (ms: MonthKey[]) => (ms.length ? `${monthLabel(ms[0])} – ${monthLabel(ms[ms.length - 1])}` : 'sem dados')
  const porJornada = scope === 'global' ? JOURNEY_IDS.map((j) => ({ j, s: getSummary(ds, j, months) })) : []
  const dedup = scope === 'global' ? deduplicacao(ds) : null
  const avisos = alertas(ds, scope)

  return (
    <>
      <PageHead
        eyebrow="Relatórios"
        title={`${TITULOS[tipo]} · ${scopeLabel(scope).replace('AKORA ', '')}`}
        sub={scopeSub(scope, periodLabel)}
        actions={
          <>
            <select value={comp} onChange={(e) => setComp(e.target.value as Comparacao)} aria-label="Comparação">
              <option value="anterior">vs. período anterior</option>
              <option value="ano_anterior">vs. mesmo período do ano anterior</option>
            </select>
            <ExportButtons
              name={`${tipo}_${scope}`}
              sheets={() => [
                {
                  name: TITULOS[tipo],
                  rows: ind.map((i) => ({ Indicador: i.label, [`Atual (${descPeriodo(months)})`]: round(i.f(cur)), [`Comparação (${descPeriodo(base)})`]: round(i.f(prev)), Variação: variacao(i.f(cur), i.f(prev)) ?? '' })),
                },
                ...(scope === 'global'
                  ? [{ name: 'Por jornada', rows: ind.map((i) => ({ Indicador: i.label, ...Object.fromEntries(porJornada.map(({ j, s }) => [JOURNEYS[j].nome, round(i.f(s))])), Consolidado: round(i.f(cur)) })) }]
                  : []),
              ]}
            />
          </>
        }
      />
      {scope !== 'global' && <JourneyBanner journey={scope} />}

      <Tabs<Tipo>
        value={tipo}
        onChange={setTipo}
        tabs={(Object.keys(TITULOS) as Tipo[]).map((t) => ({ id: t, label: TITULOS[t].replace('Relatório ', '').replace(/^de /, '').replace(/^./, (c) => c.toUpperCase()) }))}
      />

      <div className="print-only">
        <h1>AKORA Command Center — {TITULOS[tipo]}</h1>
        <p>
          {scopeLabel(scope)} · {descPeriodo(months)} · gerado em {dateLabel(REF_DATE)} · dados fictícios
        </p>
      </div>

      <Card title={TITULOS[tipo]} sub={`Atual: ${descPeriodo(months)} · Comparação: ${descPeriodo(base)}`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th className="num">Atual</th>
                <th className="num">Comparação</th>
                <th className="num">Variação</th>
              </tr>
            </thead>
            <tbody>
              {ind.map((i) => (
                <tr key={i.label}>
                  <td>{i.label}</td>
                  <td className="num">{fmt(i.f(cur), i.formato)}</td>
                  <td className="num">{base.length ? fmt(i.f(prev), i.formato) : '—'}</td>
                  <td className="num">{base.length ? <Delta value={variacao(i.f(cur), i.f(prev))} inverse={i.inverse} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {scope === 'global' && (
        <Card title="Comparativo por jornada" sub={descPeriodo(months)} className="mt">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Indicador</th>
                  {porJornada.map(({ j }) => (
                    <th key={j} className="num">
                      {JOURNEYS[j].nome.replace('AKORA ', '')}
                    </th>
                  ))}
                  <th className="num">Consolidado</th>
                </tr>
              </thead>
              <tbody>
                {ind.map((i) => (
                  <tr key={i.label}>
                    <td>{i.label}</td>
                    {porJornada.map(({ j, s }) => (
                      <td key={j} className="num">
                        {fmt(i.f(s), i.formato)}
                      </td>
                    ))}
                    <td className="num">
                      <strong>{fmt(i.f(cur), i.formato)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dedup && (
            <p className="muted small mt">
              Total de usuárias consolidado sem duplicidade: a soma das jornadas seria {fmt(dedup.somaJornadas, 'num')}, mas {fmt(dedup.migracoes, 'num')} pessoas migraram de faixa e contam uma única vez ({fmt(dedup.totalUnico, 'num')}).
            </p>
          )}
        </Card>
      )}

      {tipo === 'executivo' && (
        <Card title="Pontos de atenção" className="mt">
          {avisos.length ? (
            <ul className="list">
              {avisos.map((a, k) => (
                <li key={k}>
                  <span>{a.nivel === 'critico' ? '⛔' : '⚠'}</span> {a.texto}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Todas as metas do mês estão no ritmo esperado.</p>
          )}
        </Card>
      )}
    </>
  )
}

const round = (v: number) => Math.round(v * 100) / 100
