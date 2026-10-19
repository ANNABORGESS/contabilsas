import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FEATURES_EM_BREVE, JOURNEYS, type JourneyId } from '../../config/journeys'
import { useApp, useSummary } from '../../components/AppContext'
import { BarChartBox, PALETA } from '../../components/charts'
import { Badge, Card, DataTable, ExportButtons, Kpi, PageHead, Tabs } from '../../components/ui'
import { brl, num, pct } from '../../components/format'
import { REF_DATE, addDays, dateLabel, monthEnd, monthOf, monthStart, toDate } from '../../domain/dates'
import { SEGMENTACAO_LABEL, validarCampanha } from '../../domain/compliance'
import { variacao } from '../../domain/metrics'
import type { Campanha, Canal } from '../../domain/types'
import { JourneyBanner, scopeSub } from '../shared/common'

type Aba = 'planejamento' | 'campanhas' | 'desempenho' | 'redes' | 'calendario' | 'lancamentos' | 'studio' | 'biblioteca' | 'ia'

const ESTRATEGIA: Record<JourneyId, { posicionamento: string; publico: string; objetivos: string[]; canais: string; tom: string }> = {
  teen: {
    posicionamento: 'Informação confiável e acolhedora sobre o corpo e o bem-estar na adolescência.',
    publico: 'Adolescentes de 12 a 17 anos e seus responsáveis (comunicação também direcionada a mães, pais e escolas).',
    objetivos: ['Crescer a base com consentimento dos responsáveis', 'Construir confiança com escolas e parceiros educacionais', 'Converter famílias para o Premium com comunicação transparente'],
    canais: 'Conteúdo orgânico educativo, parcerias com escolas, YouTube e Instagram com segmentação contextual.',
    tom: 'Leve, acolhedor, sem apelos de consumo; nada de pressão estética.',
  },
  ciclo: {
    posicionamento: 'Autoconhecimento do ciclo para viver cada fase com mais energia.',
    publico: 'Mulheres de 18 a 39 anos que querem entender o próprio ciclo e organizar a rotina.',
    objetivos: ['Escalar aquisição com CAC controlado', 'Aumentar conversão para Premium anual', 'Fortalecer a comunidade e as indicações'],
    canais: 'Instagram, TikTok, influenciadoras, Google e e-mail.',
    tom: 'Próximo, empoderador, baseado em evidências.',
  },
  mais40: {
    posicionamento: 'Uma nova fase com informação, cuidado e comunidade.',
    publico: 'Mulheres a partir dos 40 anos vivendo o climatério e a maturidade.',
    objetivos: ['Ganhar autoridade com especialistas', 'Crescer o Premium anual', 'Reduzir o churn com conteúdo recorrente'],
    canais: 'Instagram, YouTube, Google, e-mail e parcerias com profissionais de saúde.',
    tom: 'Sereno, respeitoso, sem tabus.',
  },
}

export function Marketing({ journey }: { journey: JourneyId }) {
  const { ds, months, periodLabel } = useApp()
  const j = JOURNEYS[journey]
  const { cur, prev } = useSummary(journey)
  const [params, setParams] = useSearchParams()
  const aba = (params.get('tab') as Aba) || 'planejamento'
  const setAba = (t: Aba) => setParams({ tab: t })

  const [novas, setNovas] = useState<Campanha[]>([])
  const campanhas = useMemo(() => [...novas, ...ds.campanhas.filter((c) => c.jornada === journey)], [ds, journey, novas])
  const inicioPeriodo = monthStart(months[0])
  const fimPeriodo = monthEnd(months[months.length - 1])
  const doPeriodo = campanhas.filter((c) => c.inicio <= fimPeriodo && c.fim >= inicioPeriodo)

  return (
    <>
      <PageHead
        eyebrow="Marketing Office"
        title={`Marketing · ${j.nome.replace('AKORA ', '')}`}
        sub={scopeSub(journey, periodLabel)}
        actions={
          <ExportButtons
            name={`marketing_${journey}`}
            sheets={() => [
              { name: 'Campanhas', rows: doPeriodo.map((c) => ({ Campanha: c.nome, Canal: c.canal, Tipo: c.tipo, Segmentação: SEGMENTACAO_LABEL[c.segmentacao], Início: c.inicio, Fim: c.fim, Orçamento: c.orcamento, Investido: c.investido, Impressões: c.impressoes, Cliques: c.cliques, Cadastros: c.cadastros, 'Conversões Premium': c.conversoesPremium })) },
              { name: 'Calendário', rows: ds.posts.filter((p) => p.jornada === journey).map((p) => ({ Data: p.data, Canal: p.canal, Formato: p.formato, Tema: p.tema, Status: p.status })) },
            ]}
          />
        }
      />
      <JourneyBanner journey={journey} />

      <div className="grid kpis">
        <Kpi label="Investimento em marketing" value={cur.despesas.marketing} formato="brl" delta={variacao(cur.despesas.marketing, prev.despesas.marketing)} inverse />
        <Kpi label="Custo por cadastro (CAC)" value={cur.cac} formato="brlCents" delta={variacao(cur.cac, prev.cac)} inverse />
        <Kpi label="Custo por assinatura" value={cur.custoPorAssinatura} formato="brlCents" delta={variacao(cur.custoPorAssinatura, prev.custoPorAssinatura)} inverse />
        <Kpi label="Campanhas no período" value={doPeriodo.length} foot={`${doPeriodo.filter((c) => c.status === 'ativa').length} ativas`} />
      </div>

      <Tabs<Aba>
        value={aba}
        onChange={setAba}
        tabs={[
          { id: 'planejamento', label: 'Planejamento estratégico' },
          { id: 'campanhas', label: 'Campanhas' },
          { id: 'desempenho', label: 'Orçamento e desempenho' },
          { id: 'redes', label: 'Redes sociais' },
          { id: 'calendario', label: 'Calendário editorial' },
          { id: 'lancamentos', label: 'Lançamentos' },
          { id: 'studio', label: 'Creative Studio' },
          { id: 'biblioteca', label: 'Biblioteca' },
          { id: 'ia', label: 'IA de marketing' },
        ]}
      />

      {aba === 'planejamento' && <Planejamento journey={journey} />}
      {aba === 'campanhas' && <Campanhas journey={journey} campanhas={campanhas} initialQuery={params.get('q') ?? ''} onCreate={(c) => setNovas((n) => [c, ...n])} />}
      {aba === 'desempenho' && <Desempenho journey={journey} campanhas={doPeriodo} />}
      {aba === 'redes' && <Redes journey={journey} />}
      {aba === 'calendario' && <Calendario journey={journey} />}
      {aba === 'lancamentos' && (
        <Card title="Planejamento de lançamentos">
          <DataTable
            rows={ds.lancamentos.filter((l) => l.jornada === journey)}
            columns={[
              { key: 'n', label: 'Lançamento', value: (l) => l.nome },
              { key: 'd', label: 'Data', value: (l) => l.data, render: (l) => dateLabel(l.data) },
              { key: 'e', label: 'Etapa', value: (l) => l.etapa, render: (l) => <Badge>{l.etapa.replace('_', '-')}</Badge> },
              { key: 'r', label: 'Responsável', value: (l) => l.responsavel },
            ]}
          />
        </Card>
      )}
      {aba === 'studio' && (
        <Card title="Creative Studio" sub="Briefings e produção de peças" actions={<Badge tone="warn">{FEATURES_EM_BREVE.creativeStudioIntegracao}</Badge>}>
          <DataTable
            rows={ds.briefs.filter((b) => b.jornada === journey)}
            columns={[
              { key: 't', label: 'Peça', value: (b) => b.titulo },
              { key: 'f', label: 'Formato', value: (b) => b.formato },
              { key: 's', label: 'Status', value: (b) => b.status, render: (b) => <Badge tone={b.status === 'aprovado' ? 'ok' : ''}>{b.status}</Badge> },
              { key: 'p', label: 'Prazo', value: (b) => b.prazo, render: (b) => dateLabel(b.prazo) },
            ]}
          />
        </Card>
      )}
      {aba === 'biblioteca' && (
        <Card title="Biblioteca de materiais">
          <DataTable
            rows={ds.materiais.filter((m) => m.jornada === journey)}
            columns={[
              { key: 'n', label: 'Material', value: (m) => m.nome },
              { key: 't', label: 'Tipo', value: (m) => m.tipo },
              { key: 'a', label: 'Atualizado em', value: (m) => m.atualizado, render: (m) => dateLabel(m.atualizado) },
            ]}
          />
        </Card>
      )}
      {aba === 'ia' && (
        <Card title="IA de marketing">
          <div className="empty">
            <p>
              <Badge tone="warn">Em breve</Badge>
            </p>
            <p>{FEATURES_EM_BREVE.iaMarketing}. Quando ativada, a IA sugerirá pautas, copys e otimizações de orçamento usando apenas dados agregados de {j.nome}.</p>
            {j.protecaoMenores && <p>No Teen, a IA não fará segmentação comportamental nem usará dados de saúde.</p>}
          </div>
        </Card>
      )}
    </>
  )
}

function Planejamento({ journey }: { journey: JourneyId }) {
  const e = ESTRATEGIA[journey]
  return (
    <div className="grid cols-2">
      <Card title="Posicionamento">
        <p>{e.posicionamento}</p>
        <h3 className="mt">Público</h3>
        <p className="small">{e.publico}</p>
        <h3 className="mt">Tom de voz</h3>
        <p className="small">{e.tom}</p>
      </Card>
      <Card title="Objetivos do semestre">
        <ul className="list">
          {e.objetivos.map((o) => (
            <li key={o}>
              <span style={{ color: 'var(--accent)' }}>✦</span> {o}
            </li>
          ))}
        </ul>
        <h3 className="mt">Canais prioritários</h3>
        <p className="small">{e.canais}</p>
      </Card>
    </div>
  )
}

function Campanhas({ journey, campanhas, initialQuery, onCreate }: { journey: JourneyId; campanhas: Campanha[]; initialQuery: string; onCreate: (c: Campanha) => void }) {
  const j = JOURNEYS[journey]
  const [aberto, setAberto] = useState(false)
  const filtradas = initialQuery ? campanhas.filter((c) => c.nome.toLowerCase().includes(initialQuery.toLowerCase())) : campanhas
  return (
    <div className="stack">
      <Card
        title="Gestão de campanhas"
        sub="Todas as campanhas são identificadas por jornada; os resultados não se misturam entre os modos."
        actions={
          <button className="btn primary" disabled={j.status !== 'ativa'} onClick={() => setAberto((a) => !a)}>
            + Nova campanha
          </button>
        }
      >
        {aberto && <NovaCampanha journey={journey} onCreate={(c) => (onCreate(c), setAberto(false))} />}
        <DataTable
          rows={filtradas}
          exportName={`campanhas_${journey}`}
          columns={[
            { key: 'n', label: 'Campanha', value: (c) => c.nome },
            { key: 'c', label: 'Canal', value: (c) => c.canal },
            { key: 't', label: 'Tipo', value: (c) => (c.tipo === 'paga' ? 'Paga' : 'Orgânica') },
            { key: 'seg', label: 'Segmentação', value: (c) => SEGMENTACAO_LABEL[c.segmentacao] },
            { key: 'p', label: 'Período', value: (c) => c.inicio, render: (c) => `${dateLabel(c.inicio).slice(0, 5)} – ${dateLabel(c.fim).slice(0, 5)}` },
            { key: 's', label: 'Status', value: (c) => c.status, render: (c) => <Badge tone={c.status === 'ativa' ? 'ok' : c.status === 'planejada' ? 'warn' : ''}>{c.status}</Badge> },
            { key: 'o', label: 'Orçamento', value: (c) => c.orcamento, formato: 'brl' },
            { key: 'i', label: 'Investido', value: (c) => c.investido, formato: 'brl' },
            { key: 'cad', label: 'Cadastros', value: (c) => c.cadastros, formato: 'num' },
            { key: 'conv', label: 'Premium', value: (c) => c.conversoesPremium, formato: 'num' },
            { key: 'cpa', label: 'CPA', value: (c) => (c.cadastros ? c.investido / c.cadastros : 0), formato: 'brlCents' },
          ]}
        />
      </Card>
    </div>
  )
}

function NovaCampanha({ journey, onCreate }: { journey: JourneyId; onCreate: (c: Campanha) => void }) {
  const j = JOURNEYS[journey]
  const [f, setF] = useState<Partial<Campanha>>({
    jornada: journey,
    nome: '',
    canal: 'Instagram',
    tipo: 'paga',
    objetivo: 'aquisicao',
    segmentacao: 'contextual',
    usaDadosSaude: false,
    inicio: addDays(REF_DATE, 7),
    fim: addDays(REF_DATE, 37),
    orcamento: 3000,
  })
  const v = validarCampanha(f)
  const set = <K extends keyof Campanha>(k: K, val: Campanha[K]) => setF((x) => ({ ...x, [k]: val }))
  const canais: Canal[] = ['Instagram', 'TikTok', 'YouTube', 'Google', 'Influenciadoras', 'E-mail', 'Parcerias', 'Pinterest']

  return (
    <div className="card" style={{ marginBottom: 16, background: 'var(--accent-soft)' }}>
      <div className="form-grid">
        <label>
          Nome
          <input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} />
        </label>
        <label>
          Jornada
          <input className="input" value={j.nome} disabled />
        </label>
        <label>
          Canal
          <select value={f.canal} onChange={(e) => set('canal', e.target.value as Canal)}>
            {canais.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={f.tipo} onChange={(e) => set('tipo', e.target.value as Campanha['tipo'])}>
            <option value="paga">Paga</option>
            <option value="organica">Orgânica</option>
          </select>
        </label>
        <label>
          Segmentação
          <select value={f.segmentacao} onChange={(e) => set('segmentacao', e.target.value as Campanha['segmentacao'])}>
            {Object.entries(SEGMENTACAO_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Início
          <input className="input" type="date" value={f.inicio} onChange={(e) => set('inicio', e.target.value)} />
        </label>
        <label>
          Fim
          <input className="input" type="date" value={f.fim} onChange={(e) => set('fim', e.target.value)} />
        </label>
        <label>
          Orçamento (R$)
          <input className="input" type="number" min={0} value={f.orcamento} onChange={(e) => set('orcamento', Number(e.target.value))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={f.usaDadosSaude} onChange={(e) => set('usaDadosSaude', e.target.checked)} />
          Usa dados de saúde para segmentar
        </label>
      </div>
      {v.erros.length > 0 && (
        <div className="banner danger mt" style={{ marginBottom: 0 }}>
          <span>⛔</span>
          <span>{v.erros.join(' ')}</span>
        </div>
      )}
      {v.avisos.length > 0 && v.erros.length === 0 && (
        <div className="banner warn mt" style={{ marginBottom: 0 }}>
          <span>⚠</span>
          <span>{v.avisos.join(' ')}</span>
        </div>
      )}
      <div className="btn-row mt">
        <button
          className="btn primary"
          disabled={v.erros.length > 0}
          onClick={() =>
            onCreate({
              ...(f as Campanha),
              id: `NOVA-${Date.now()}`,
              investido: 0,
              impressoes: 0,
              cliques: 0,
              cadastros: 0,
              conversoesPremium: 0,
              status: 'planejada',
            })
          }
        >
          Salvar campanha (rascunho local)
        </button>
        <span className="muted small">Sem integração de anúncios configurada: a campanha fica salva apenas nesta sessão.</span>
      </div>
    </div>
  )
}

function Desempenho({ journey, campanhas }: { journey: JourneyId; campanhas: Campanha[] }) {
  const j = JOURNEYS[journey]
  const porCanal = new Map<string, { canal: string; orcamento: number; investido: number; cadastros: number; conversoes: number; cliques: number; impressoes: number }>()
  for (const c of campanhas) {
    const x = porCanal.get(c.canal) ?? { canal: c.canal, orcamento: 0, investido: 0, cadastros: 0, conversoes: 0, cliques: 0, impressoes: 0 }
    x.orcamento += c.orcamento
    x.investido += c.investido
    x.cadastros += c.cadastros
    x.conversoes += c.conversoesPremium
    x.cliques += c.cliques
    x.impressoes += c.impressoes
    porCanal.set(c.canal, x)
  }
  const canais = [...porCanal.values()].sort((a, b) => b.investido - a.investido)
  // Retorno estimado: conversões × 6 meses de Premium mensal (LTV simplificado).
  const ltv = j.precos.mensal * 6
  const tot = canais.reduce((s, c) => ({ inv: s.inv + c.investido, imp: s.imp + c.impressoes, cli: s.cli + c.cliques, cad: s.cad + c.cadastros, conv: s.conv + c.conversoes }), { inv: 0, imp: 0, cli: 0, cad: 0, conv: 0 })

  return (
    <div className="grid cols-2">
      <Card title="Orçamento por canal" sub="Planejado × investido no período">
        <BarChartBox
          data={canais}
          x="canal"
          formato="brl"
          series={[
            { key: 'orcamento', label: 'Orçamento', color: '#DCD6E6' },
            { key: 'investido', label: 'Investido', color: j.cor },
          ]}
        />
      </Card>
      <Card title="Funil de conversão" sub="Campanhas do período">
        <table className="table">
          <tbody>
            {[
              ['Impressões', tot.imp, null],
              ['Cliques', tot.cli, tot.imp ? tot.cli / tot.imp : 0],
              ['Cadastros', tot.cad, tot.cli ? tot.cad / tot.cli : 0],
              ['Conversões Premium', tot.conv, tot.cad ? tot.conv / tot.cad : 0],
            ].map(([l, v, t]) => (
              <tr key={l as string}>
                <td>{l}</td>
                <td className="num">{num(v as number)}</td>
                <td className="num muted">{t === null ? '' : `${pct(t as number)} da etapa anterior`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Retorno por campanha" sub={`Retorno estimado = conversões × LTV simplificado (${brl(ltv)})`} className="span-2">
        <DataTable
          rows={campanhas.filter((c) => c.investido > 0)}
          exportName={`retorno_${journey}`}
          columns={[
            { key: 'n', label: 'Campanha', value: (c) => c.nome },
            { key: 'c', label: 'Canal', value: (c) => c.canal },
            { key: 'i', label: 'Investido', value: (c) => c.investido, formato: 'brl' },
            { key: 'ctr', label: 'CTR', value: (c) => (c.impressoes ? c.cliques / c.impressoes : 0), formato: 'pct' },
            { key: 'conv', label: 'Conv. cadastro', value: (c) => (c.cliques ? c.cadastros / c.cliques : 0), formato: 'pct' },
            { key: 'cac', label: 'CAC', value: (c) => (c.cadastros ? c.investido / c.cadastros : 0), formato: 'brlCents' },
            { key: 'ret', label: 'Retorno est.', value: (c) => c.conversoesPremium * ltv, formato: 'brl' },
            { key: 'roi', label: 'ROI est.', value: (c) => (c.investido ? (c.conversoesPremium * ltv - c.investido) / c.investido : 0), formato: 'pct' },
          ]}
        />
      </Card>
      <Card title="Desempenho por canal" className="span-2">
        <DataTable
          rows={canais}
          searchable={false}
          columns={[
            { key: 'c', label: 'Canal', value: (c) => c.canal },
            { key: 'o', label: 'Orçamento', value: (c) => c.orcamento, formato: 'brl' },
            { key: 'i', label: 'Investido', value: (c) => c.investido, formato: 'brl' },
            { key: 'cad', label: 'Cadastros', value: (c) => c.cadastros, formato: 'num' },
            { key: 'conv', label: 'Premium', value: (c) => c.conversoes, formato: 'num' },
            { key: 'cac', label: 'CAC', value: (c) => (c.cadastros ? c.investido / c.cadastros : 0), formato: 'brlCents' },
            { key: 'roi', label: 'ROI est.', value: (c) => (c.investido ? (c.conversoes * ltv - c.investido) / c.investido : 0), formato: 'pct' },
          ]}
        />
      </Card>
    </div>
  )
}

function Redes({ journey }: { journey: JourneyId }) {
  const { ds } = useApp()
  const posts = ds.posts.filter((p) => p.jornada === journey)
  const porCanal = new Map<string, { canal: string; publicados: number; programados: number }>()
  for (const p of posts) {
    const x = porCanal.get(p.canal) ?? { canal: p.canal, publicados: 0, programados: 0 }
    if (p.status === 'publicado') x.publicados++
    else x.programados++
    porCanal.set(p.canal, x)
  }
  return (
    <div className="grid cols-2">
      <Card title="Publicações por rede" sub="Últimos 30 dias e próximos 45 dias">
        <BarChartBox
          data={[...porCanal.values()]}
          x="canal"
          stacked
          series={[
            { key: 'publicados', label: 'Publicados', color: JOURNEYS[journey].cor },
            { key: 'programados', label: 'Programados', color: PALETA[2] },
          ]}
        />
      </Card>
      <Card title="Métricas das redes">
        <div className="empty">{FEATURES_EM_BREVE.analyticsApp}. Alcance, engajamento e seguidores por rede aparecerão aqui, agregados por jornada.</div>
      </Card>
    </div>
  )
}

function Calendario({ journey }: { journey: JourneyId }) {
  const { ds } = useApp()
  const [mes, setMes] = useState(monthOf(REF_DATE))
  const posts = ds.posts.filter((p) => p.jornada === journey && monthOf(p.data) === mes)
  const inicio = monthStart(mes)
  const offset = (toDate(inicio).getUTCDay() + 6) % 7
  const dias = Number(monthEnd(mes).slice(8))
  const celulas = [...Array(offset).fill(null), ...Array.from({ length: dias }, (_, i) => addDays(inicio, i))]
  const proximo = monthOf(addDays(monthEnd(mes), 1))
  const anterior = monthOf(addDays(inicio, -1))

  return (
    <Card
      title="Calendário editorial"
      sub={`${posts.length} publicações em ${mes.slice(5)}/${mes.slice(0, 4)}`}
      actions={
        <div className="btn-row">
          <button className="btn" onClick={() => setMes(anterior)}>
            ‹
          </button>
          <button className="btn" onClick={() => setMes(monthOf(REF_DATE))}>
            Hoje
          </button>
          <button className="btn" onClick={() => setMes(proximo)}>
            ›
          </button>
        </div>
      }
    >
      <div className="calendar">
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => (
          <div className="dow" key={d}>
            {d}
          </div>
        ))}
        {celulas.map((d, i) =>
          d === null ? (
            <div key={i} className="day out" />
          ) : (
            <div key={d} className={`day ${d === REF_DATE ? 'today' : ''}`}>
              <div className="n">{Number(d.slice(8))}</div>
              {posts
                .filter((p) => p.data === d)
                .map((p) => (
                  <div key={p.id} className="post" title={`${p.canal} · ${p.formato} · ${p.tema} (${p.status})`}>
                    {p.canal}: {p.tema}
                  </div>
                ))}
            </div>
          ),
        )}
      </div>
    </Card>
  )
}
