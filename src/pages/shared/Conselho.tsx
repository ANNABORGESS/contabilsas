import { useMemo, useState } from 'react'
import { JOURNEYS, scopeColor, scopeLabel, type Scope } from '../../config/journeys'
import { useApp, useSummary } from '../../components/AppContext'
import { Badge, Card, PageHead, Tabs } from '../../components/ui'
import { brl, brlCents, num, pct } from '../../components/format'
import { dateLabel } from '../../domain/dates'
import {
  SEATS,
  SEAT_BY_KEY,
  labelPt,
  limitesDoEscopo,
  montarComando,
  placar,
  recomendada,
  seatKey,
  sessoesDoEscopo,
  spread,
  ultimaRodada,
  type FormDecisao,
  type SeatKey,
  type Sessao,
} from '../../domain/council'
import { getSessoes } from '../../data/sessions'
import { JourneyBanner, scopeSub } from './common'

type Aba = 'sessoes' | 'nova' | 'conselheiros'

const AVISO = 'Os conselheiros são simulações construídas a partir de cartas, ensaios, palestras e vídeos públicos. Não são as pessoas reais, não falam por elas e não têm vínculo com a AKORA.'

export function Conselho({ scope }: { scope: Scope }) {
  const { periodLabel } = useApp()
  const [aba, setAba] = useState<Aba>('sessoes')
  const [aberta, setAbertaState] = useState<string | null>(null)
  const setAberta = (id: string | null) => {
    setAbertaState(id)
    window.scrollTo({ top: 0 })
  }
  const sessoes = useMemo(() => sessoesDoEscopo(getSessoes(), scope), [scope])
  const sessao = sessoes.find((s) => s.id === aberta) ?? null

  return (
    <>
      <PageHead eyebrow="Conselho" title={`Conselho · ${scopeLabel(scope).replace('AKORA ', '')}`} sub={scopeSub(scope, periodLabel)} />
      {scope !== 'global' && <JourneyBanner journey={scope} />}
      <div className="banner">
        <span>⚖</span>
        <span>
          Leve uma decisão difícil a um conselho de sete conselheiros de IA (Roast Room). Eles debatem em três rodadas e devolvem um veredito com notas, a divergência e os próximos passos. O conselho roda no Claude Code; aqui você prepara a decisão e acompanha o resultado.
        </span>
      </div>

      {sessao ? (
        <DetalheSessao sessao={sessao} voltar={() => setAberta(null)} />
      ) : (
        <>
          <Tabs<Aba>
            value={aba}
            onChange={setAba}
            tabs={[
              { id: 'sessoes', label: `Sessões (${sessoes.length})` },
              { id: 'nova', label: 'Nova decisão' },
              { id: 'conselheiros', label: 'Conselheiros' },
            ]}
          />
          {aba === 'sessoes' && <ListaSessoes scope={scope} sessoes={sessoes} abrir={setAberta} novaDecisao={() => setAba('nova')} />}
          {aba === 'nova' && <NovaDecisao scope={scope} />}
          {aba === 'conselheiros' && <Conselheiros />}
        </>
      )}
      <p className="muted small mt">{AVISO}</p>
    </>
  )
}

function SeatAvatar({ seat, size = 34 }: { seat: SeatKey; size?: number }) {
  const s = SEAT_BY_KEY[seat]
  return (
    <span className="seat-avatar" style={{ background: s.cor, width: size, height: size, fontSize: size * 0.36 }} title={`${s.nome} (simulação) · ${s.pilar}`}>
      {s.iniciais}
    </span>
  )
}

function VereditoBadge({ s }: { s: Sessao }) {
  if (!s.veredito) return <Badge tone="warn">Em andamento · rodada {ultimaRodada(s)?.n ?? 0}</Badge>
  const l = labelPt(s.veredito.label)
  return <Badge tone={l.tom}>{l.texto}</Badge>
}

function JornadaBadge({ s }: { s: Sessao }) {
  if (s.exemplo && !s.jornada) return <Badge tone="demo">Exemplo do Roast Room (não é da AKORA)</Badge>
  if (!s.jornada) return <Badge>Sem jornada</Badge>
  return <Badge color={scopeColor(s.jornada)}>{scopeLabel(s.jornada)}</Badge>
}

function ListaSessoes({ scope, sessoes, abrir, novaDecisao }: { scope: Scope; sessoes: Sessao[]; abrir: (id: string) => void; novaDecisao: () => void }) {
  if (!sessoes.length)
    return (
      <div className="empty">
        <p>Nenhum conselho de {scopeLabel(scope)} ainda.</p>
        <p>Prepare a primeira decisão em “Nova decisão”, cole o comando no Claude Code e o resultado aparece aqui.</p>
        <button className="btn primary" onClick={novaDecisao}>
          Preparar uma decisão
        </button>
      </div>
    )
  return (
    <div className="session-list">
      {sessoes.map((s) => {
        const rec = recomendada(s)
        const op = s.opcoes.find((o) => o.id === rec)
        return (
          <button key={s.id} className="card session-item" onClick={() => abrir(s.id)}>
            <div className="session-top">
              <VereditoBadge s={s} />
              <span className="muted small">{s.data ? dateLabel(s.data) : ''}</span>
            </div>
            <h2>{s.titulo}</h2>
            {s.veredito?.call ? <p className="small">{s.veredito.call}</p> : <p className="small muted">{s.decisao}</p>}
            <div className="session-foot">
              <JornadaBadge s={s} />
              {op && (
                <span className="small">
                  Opção {op.id}: <strong>{op.label}</strong>
                </span>
              )}
              <span className="seat-row">
                {s.assentos.map((k) => (
                  <SeatAvatar key={k} seat={k} size={22} />
                ))}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function DetalheSessao({ sessao: s, voltar }: { sessao: Sessao; voltar: () => void }) {
  const notas = placar(s)
  const rec = recomendada(s)
  const sp = spread(s)
  const v = s.veredito
  const [rodada, setRodada] = useState<number>(ultimaRodada(s)?.n ?? 1)
  const r = s.rodadas.find((x) => x.n === rodada)
  const vereditoLabel = v ? labelPt(v.label) : null

  return (
    <div className="stack">
      <div className="btn-row">
        <button className="btn" onClick={voltar}>
          ‹ Todas as sessões
        </button>
        <JornadaBadge s={s} />
        <Badge>{s.modo === 'quick' ? 'Conselho rápido' : 'Conselho completo'}</Badge>
        {s.data && <span className="muted small">{dateLabel(s.data)}</span>}
      </div>

      <Card title={s.titulo} sub={s.decisao}>
        {s.brief && <p className="small">{s.brief}</p>}
        {s.premissas.length > 0 && (
          <p className="small muted">
            Premissas: {s.premissas.join(' · ')}
          </p>
        )}
      </Card>

      <div className="grid cols-2">
        <Card title="Veredito" actions={<VereditoBadge s={s} />}>
          {v ? (
            <>
              <p className="verdict-call">{v.call}</p>
              {v.override_note && <p className="small muted">{v.override_note}</p>}
            </>
          ) : (
            <p className="muted">O conselho ainda está debatendo. As rodadas aparecem abaixo conforme terminam.</p>
          )}
          <div className="stack mt" style={{ gap: 10 }}>
            {notas.map((o) => (
              <div key={o.id}>
                <div className="score-row">
                  <span>
                    <strong>{o.id}</strong> {o.label} {o.id === rec && <Badge tone="ok">recomendada</Badge>}
                  </span>
                  <strong>{o.score === null ? '—' : o.score.toFixed(1).replace('.', ',')}</strong>
                </div>
                <div className="progress">
                  <span style={{ width: `${(o.score ?? 0) * 10}%`, background: o.id === rec ? 'var(--accent)' : 'var(--lavender)' }} />
                </div>
                {o.math && <div className="muted small">{o.math}</div>}
              </div>
            ))}
          </div>
          <p className="muted small mt" style={{ marginBottom: 0 }}>
            Nota ponderada pelo peso de cada conselheiro na rodada {ultimaRodada(s)?.n ?? '—'}
            {sp !== null && ` · divergência na opção recomendada: ${sp} ponto(s)`}
            {vereditoLabel && ` · veredito original: ${v!.label}`}
          </p>
        </Card>

        {v && (
          <Card title="Por que o conselho decidiu assim">
            <ul className="list">
              {v.why.map((w, i) => {
                const k = seatKey(w.seat)
                return (
                  <li key={i}>
                    {k ? <SeatAvatar seat={k} size={26} /> : <span>•</span>}
                    <span>
                      {w.point}
                      {(w.seat || w.framework) && (
                        <span className="muted small">
                          {' '}
                          — {w.seat}
                          {w.framework ? `, ${w.framework}` : ''}
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
            {v.minority?.quote && (
              <div className="banner warn mt" style={{ marginBottom: 0 }}>
                <span>✋</span>
                <span>
                  <strong>Divergência ({v.minority.seat}):</strong> “{v.minority.quote}”
                  {v.minority.would_have_to_be_true && <span className="muted"> Teria que ser verdade: {v.minority.would_have_to_be_true}</span>}
                </span>
              </div>
            )}
          </Card>
        )}
      </div>

      {v && (
        <div className="grid cols-2">
          <Card title="Próximos passos">
            <ul className="list">
              {v.next_steps.map((n, i) => (
                <li key={i}>
                  <Badge>{n.when ?? `Passo ${i + 1}`}</Badge> {n.action}
                </li>
              ))}
            </ul>
            {v.cheapest_test && <p className="small mt">Teste mais barato: {v.cheapest_test}</p>}
            {v.kill_criteria && <p className="small">Critério para desistir: {v.kill_criteria}</p>}
            {v.revisit && <p className="small muted">Revisar: {v.revisit}</p>}
          </Card>
          <Card title="Condições">
            {v.conditions.length ? (
              <ul className="list">
                {v.conditions.map((c, i) => (
                  <li key={i}>
                    <span style={{ color: 'var(--accent)' }}>✓</span> {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Sem condições registradas.</p>
            )}
            {v.fights.length > 0 && (
              <>
                <h3 className="mt">Onde houve briga</h3>
                <ul className="list">
                  {v.fights.map((f, i) => (
                    <li key={i} style={{ flexDirection: 'column', gap: 2 }}>
                      <strong>{f.crux}</strong>
                      <span className="small muted">{f.story}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      )}

      {s.cruxes.length > 0 && (
        <Card title="Pontos de discordância" sub={s.notaCruxes}>
          <div className="stack" style={{ gap: 12 }}>
            {s.cruxes.map((c, i) => (
              <div key={i}>
                <strong>{c.question}</strong>
                <div className="crux-sides">
                  {c.sides.map((sd, j) => (
                    <div key={j} className="crux-side">
                      <span className="small">{sd.position}</span>
                      <span className="seat-row">
                        {sd.seats.map((k) => (
                          <SeatAvatar key={k} seat={k} size={22} />
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {s.rodadas.length > 0 && (
        <Card title="Rodadas" sub="Cards de cada conselheiro, como foram escritos">
          <Tabs<string>
            value={String(rodada)}
            onChange={(t) => setRodada(Number(t))}
            tabs={s.rodadas.map((x) => ({ id: String(x.n), label: x.n === 1 ? 'Rodada 1 · abertura' : x.n === 2 ? 'Rodada 2 · debate' : 'Rodada 3 · votação' }))}
          />
          {r && (
            <div className="stack" style={{ gap: 12 }}>
              {r.cards.map((c) => {
                const seat = SEAT_BY_KEY[c.seat]
                return (
                  <details key={c.seat} className="seat-card">
                    <summary>
                      <SeatAvatar seat={c.seat} />
                      <span className="seat-head">
                        <strong>{seat.nome}</strong> <span className="muted small">· {seat.pilar} · peso {s.pesos[c.seat].weight}</span>
                        <span className="small">{c.info.stance || c.info.call || c.info.oneLine}</span>
                      </span>
                      <span className="seat-scores">
                        {s.opcoes.map((o) => (
                          <span key={o.id} className={`chip ${o.id === rec ? 'on' : ''}`}>
                            {o.id} {c.info.optionScores[o.id] ?? '—'}
                          </span>
                        ))}
                        {c.info.ruin === 'likely' && <Badge tone="bad">risco de ruína</Badge>}
                        {c.info.ruin === 'possible' && <Badge tone="warn">risco possível</Badge>}
                        {c.info.vote === 'dissent' && <Badge tone="bad">diverge</Badge>}
                      </span>
                    </summary>
                    <div className="seat-text">{c.text}</div>
                  </details>
                )
              })}
              {r.chair && (
                <details className="seat-card">
                  <summary>
                    <span className="seat-avatar" style={{ background: 'var(--plum)' }}>
                      ⚖
                    </span>
                    <span className="seat-head">
                      <strong>Notas do Chair</strong>
                      <span className="small muted">Quem conduz o conselho e calcula o placar</span>
                    </span>
                  </summary>
                  <div className="seat-text">{r.chair}</div>
                </details>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function NovaDecisao({ scope }: { scope: Scope }) {
  const { periodLabel } = useApp()
  const { cur } = useSummary(scope)
  const [f, setF] = useState<FormDecisao>({
    decisao: '',
    opcoes: ['', '', 'Manter como está'],
    inclinacao: '',
    sucesso: '',
    limitesExtras: '',
    modo: 'full',
    assentos: SEATS.map((s) => s.key),
  })
  const [copiado, setCopiado] = useState<'' | 'ok' | 'erro'>('')
  const set = <K extends keyof FormDecisao>(k: K, v: FormDecisao[K]) => {
    setCopiado('')
    setF((x) => ({ ...x, [k]: v }))
  }

  const ctx = {
    periodo: periodLabel.toLowerCase(),
    demo: true,
    linhas: [
      `${num(cur.totalCadastros)} usuárias cadastradas, ${num(cur.ativas)} ativas e ${num(cur.premium)} assinantes Premium (${pct(cur.membros ? cur.premium / cur.membros : 0)} da base)`,
      `faturamento de ${brl(cur.receitaBruta)} no período, MRR de ${brl(cur.mrr)}`,
      `despesas de ${brl(cur.despesasTotal)}, das quais ${brl(cur.despesas.marketing)} em marketing`,
      `resultado de ${brl(cur.resultado)} (margem ${pct(cur.margem)})`,
      `churn mensal de assinantes ${pct(cur.churn)}, conversão gratuito → Premium ${pct(cur.conversao)} ao mês, CAC ${brlCents(cur.cac)} por cadastro`,
    ],
  }
  const comando = montarComando(scope, f, ctx)
  const pronto = f.decisao.trim().length > 5 && f.opcoes.filter((o) => o.trim()).length >= 2

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(comando)
      setCopiado('ok')
    } catch {
      setCopiado('erro')
      const el = document.getElementById('comando-conselho') as HTMLTextAreaElement | null
      el?.select()
    }
  }

  return (
    <div className="grid cols-2">
      <Card title="Descreva a decisão" sub="O conselho é tão bom quanto o que você conta para ele">
        <div className="form-grid one">
          <label htmlFor="cons-decisao">
            Decisão (uma linha)
            <input id="cons-decisao" className="input" placeholder="Ex.: Devemos subir o Premium mensal do Teen para R$ 24,90?" value={f.decisao} onChange={(e) => set('decisao', e.target.value)} />
          </label>
          {f.opcoes.map((o, i) => (
            <label key={i} htmlFor={`cons-op-${i}`}>
              Opção {'ABCD'[i]}
              <input
                id={`cons-op-${i}`}
                className="input"
                value={o}
                placeholder={i === 0 ? 'Ex.: Subir para todas agora' : i === 1 ? 'Ex.: Subir só para novas assinantes' : ''}
                onChange={(e) => set('opcoes', f.opcoes.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </label>
          ))}
          {f.opcoes.length < 4 && (
            <button className="btn" onClick={() => set('opcoes', [...f.opcoes, ''])}>
              + Opção
            </button>
          )}
          <label htmlFor="cons-sucesso">
            Como é o sucesso, e até quando
            <input id="cons-sucesso" className="input" placeholder="Ex.: MRR do Teen em R$ 20 mil até março" value={f.sucesso} onChange={(e) => set('sucesso', e.target.value)} />
          </label>
          <label htmlFor="cons-inclinacao">
            Para que lado você está inclinada, e por quê
            <input id="cons-inclinacao" className="input" placeholder="O conselho testa sua inclinação em vez de concordar com ela" value={f.inclinacao} onChange={(e) => set('inclinacao', e.target.value)} />
          </label>
          <label htmlFor="cons-limites">
            Outros limites (prazo, orçamento, horas)
            <textarea id="cons-limites" rows={2} value={f.limitesExtras} onChange={(e) => set('limitesExtras', e.target.value)} />
          </label>
          <label htmlFor="cons-modo">
            Tamanho do conselho
            <select id="cons-modo" value={f.modo} onChange={(e) => set('modo', e.target.value as FormDecisao['modo'])}>
              <option value="full">Completo: 7 conselheiros, 3 rodadas (decisões caras ou difíceis de desfazer)</option>
              <option value="quick">Rápido: 4 conselheiros, 2 rodadas (decisões reversíveis, usa bem menos do plano)</option>
            </select>
          </label>
        </div>
        <h3 className="mt">Conselheiros na mesa</h3>
        <div className="seat-pick">
          {SEATS.map((s) => {
            const on = f.assentos.includes(s.key)
            return (
              <label key={s.key} className={`seat-toggle ${on ? 'on' : ''}`} htmlFor={`cons-seat-${s.key}`}>
                <input
                  id={`cons-seat-${s.key}`}
                  type="checkbox"
                  checked={on}
                  onChange={() => set('assentos', on ? f.assentos.filter((k) => k !== s.key) : [...f.assentos, s.key])}
                />
                <SeatAvatar seat={s.key} size={22} /> {s.curto}
              </label>
            )
          })}
        </div>
      </Card>

      <Card title="Comando para o Claude Code" sub="Já leva os números da jornada e os limites que nenhuma opção pode quebrar">
        <textarea id="comando-conselho" className="command-box" readOnly value={comando} rows={14} />
        <div className="btn-row mt">
          <button className="btn primary" disabled={!pronto} onClick={copiar}>
            Copiar comando
          </button>
          {copiado === 'ok' && <span className="small" style={{ color: 'var(--ok)' }}>Copiado.</span>}
          {copiado === 'erro' && <span className="small muted">Não foi possível copiar sozinho: o texto está selecionado, copie com Ctrl+C.</span>}
          {!pronto && <span className="small muted">Preencha a decisão e pelo menos duas opções.</span>}
        </div>
        <h3 className="mt">Como rodar</h3>
        <ol className="small steps">
          <li>Abra o Claude Code na pasta do AKORA (este repositório).</li>
          <li>Cole o comando e responda às perguntas do Chair, se houver.</li>
          <li>Com <code>npm run dev</code> aberto, a sessão aparece em Conselho › Sessões de {scopeLabel(scope)} conforme cada rodada termina.</li>
        </ol>
        <p className="small muted">
          Limites incluídos automaticamente: {limitesDoEscopo(scope).join(' ')}
          {scope !== 'global' && ` Preços atuais: ${brlCents(JOURNEYS[scope].precos.mensal)}/mês e ${brlCents(JOURNEYS[scope].precos.anual)}/ano.`}
        </p>
      </Card>
    </div>
  )
}

function Conselheiros() {
  return (
    <div className="grid cols-2">
      {SEATS.map((s) => (
        <Card key={s.key}>
          <div className="seat-intro">
            <SeatAvatar seat={s.key} size={44} />
            <div>
              <h2>{s.nome}</h2>
              <div className="small muted">{s.pilar} · simulação</div>
              <p className="small" style={{ marginBottom: 0 }}>“{s.pergunta}”</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
