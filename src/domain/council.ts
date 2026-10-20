// Conselho (Roast Room): leitura das sessões salvas em `sessions/` pelo /roast-room do Claude Code.
// Os conselheiros são simulações construídas a partir de trabalhos públicos — não são as pessoas reais.

import { JOURNEYS, type JourneyId, type Scope } from '../config/journeys'

export type SeatKey = 'bezos' | 'graham' | 'hormozi' | 'garyvee' | 'martell' | 'wickman' | 'buffett'

export interface Seat {
  key: SeatKey
  nome: string
  curto: string
  iniciais: string
  pilar: string
  pergunta: string
  cor: string
}

export const SEATS: Seat[] = [
  { key: 'bezos', nome: 'Jeff Bezos', curto: 'Bezos', iniciais: 'JB', pilar: 'Estratégia e decisões', pergunta: 'É a aposta certa, e quão reversível ela é?', cor: '#8F6A3E' },
  { key: 'graham', nome: 'Paul Graham', curto: 'Graham', iniciais: 'PG', pilar: 'Produto e startups', pergunta: 'As pessoas querem isso de verdade, e está crescendo?', cor: '#B5654A' },
  { key: 'hormozi', nome: 'Alex Hormozi', curto: 'Hormozi', iniciais: 'AH', pilar: 'Ofertas, preço e vendas', pergunta: 'As pessoas vão pagar, quanto, e como fechamos?', cor: '#A44D63' },
  { key: 'garyvee', nome: 'Gary Vaynerchuk', curto: 'Gary V', iniciais: 'GV', pilar: 'Marketing e atenção', pergunta: 'De onde vem a atenção, e ela está barata?', cor: '#7B5BA6' },
  { key: 'martell', nome: 'Dan Martell', curto: 'Martell', iniciais: 'DM', pilar: 'Pessoas, contratação e tempo da fundadora', pergunta: 'Quem faz isso, e quanto custa na agenda?', cor: '#4E6FA8' },
  { key: 'wickman', nome: 'Gino Wickman', curto: 'Wickman', iniciais: 'GW', pilar: 'Operações e escala', pergunta: 'A empresa roda isso sem depender da fundadora?', cor: '#3F8770' },
  { key: 'buffett', nome: 'Warren Buffett', curto: 'Buffett', iniciais: 'WB', pilar: 'Dinheiro e capital', pergunta: 'O que isso faz com o caixa, o risco e o valor no longo prazo?', cor: '#4C5F7A' },
]

export const SEAT_BY_KEY = Object.fromEntries(SEATS.map((s) => [s.key, s])) as Record<SeatKey, Seat>

/** Reconhece um assento por chave, nome curto, sobrenome ou nome completo. */
export function seatKey(raw: string | undefined | null): SeatKey | null {
  if (!raw) return null
  const t = raw.toLowerCase().replace(/\(.*$/, '').trim()
  for (const s of SEATS) {
    const sobrenome = s.nome.split(' ').pop()!.toLowerCase()
    if (t === s.key || t === s.curto.toLowerCase() || t === s.nome.toLowerCase() || t === sobrenome || t.startsWith(s.nome.toLowerCase()) || t.startsWith(s.curto.toLowerCase())) return s.key
  }
  if (/gary|vaynerchuk/.test(t)) return 'garyvee'
  return null
}

// ---------------------------------------------------------------------------
// Leitura dos cards (mesmo formato do Roast Room: rótulos em inglês)

const field = (text: string, label: string): string => {
  const m = text.match(new RegExp(`(?:^|[·|])[ \\t]*\\**${label}\\**[ \\t]*:[ \\t]*([^\\n·]+)`, 'im'))
  return m ? m[1].replace(/\*+/g, '').trim() : ''
}
const numero = (s: string): number | null => {
  const m = (s || '').match(/(\d+(?:[.,]\d+)?)/)
  return m ? Number(m[1].replace(',', '.')) : null
}

export function parseOptionScores(text: string, optionIds: string[]): Record<string, number> {
  const lm = text.match(/OPTION SCORES\**[ \t]*:[ \t]*([^\n]+)/i)
  const line = (lm ? lm[1] : '').split(/PILLAR SCORE|CONFIDENCE|FINAL SCORE/i)[0]
  const scores: Record<string, number> = {}
  for (const id of optionIds) {
    const m = line.match(new RegExp(`\\b${id}\\b\\s*[:=]?\\s*(\\d+(?:[.,]\\d+)?)`))
    if (m) scores[id] = Math.max(0, Math.min(10, Number(m[1].replace(',', '.'))))
  }
  return scores
}

export interface CardInfo {
  stance: string
  call: string
  optionScores: Record<string, number>
  pillar: number | null
  finalScore: number | null
  confidence: number | null
  ruin: '' | 'none' | 'possible' | 'likely'
  door: '' | 'one-way' | 'two-way'
  vote: '' | 'endorse' | 'amend' | 'dissent'
  oneLine: string
  risk: string
  thisWeek: string
  moved: boolean
}

export function parseCard(text: string, optionIds: string[]): CardInfo {
  const voteRaw = field(text, 'VOTE')
  return {
    stance: field(text, 'STANCE'),
    call: field(text, 'THE CALL'),
    optionScores: parseOptionScores(text, optionIds),
    pillar: numero(field(text, 'PILLAR SCORE')) ?? numero(field(text, 'FINAL PILLAR SCORE')),
    finalScore: numero(field(text, 'FINAL SCORE')),
    confidence: numero(field(text, 'CONFIDENCE')),
    ruin: ((field(text, 'RUIN RISK').match(/none|possible|likely/i) || [''])[0].toLowerCase() as CardInfo['ruin']),
    door: ((field(text, 'DOOR').match(/one-way|two-way/i) || [''])[0].toLowerCase() as CardInfo['door']),
    vote: /dissent/i.test(voteRaw) ? 'dissent' : /amend/i.test(voteRaw) ? 'amend' : /endorse/i.test(voteRaw) ? 'endorse' : '',
    oneLine: field(text, 'ONE LINE FOR THE FOUNDER'),
    risk: field(text, 'THE RISK I SEE'),
    thisWeek: field(text, "WHAT I'D DO THIS WEEK"),
    moved: /^\s*MOVED\b/m.test(text) || /^\s*MOVED\s*:/im.test(text),
  }
}

export interface Card {
  seat: SeatKey
  text: string
  info: CardInfo
}

export interface Round {
  n: number
  cards: Card[]
  chair: string
}

/** Divide um arquivo round-N.md em cards (um `## <Assento>` por card) e notas do Chair. */
export function splitRound(md: string, optionIds: string[]): Omit<Round, 'n'> {
  const partes = md.split(/^## +/m).slice(1)
  const cards: Card[] = []
  const chair: string[] = []
  for (const p of partes) {
    const nl = p.indexOf('\n')
    const head = (nl < 0 ? p : p.slice(0, nl)).trim()
    const body = (nl < 0 ? '' : p.slice(nl + 1)).trim()
    if (/^chair/i.test(head)) {
      chair.push(body)
      continue
    }
    const k = seatKey(head)
    if (k && !cards.some((c) => c.seat === k)) cards.push({ seat: k, text: body, info: parseCard(body, optionIds) })
  }
  return { cards, chair: chair.join('\n\n') }
}

// ---------------------------------------------------------------------------
// Sessões

export interface Opcao {
  id: string
  label: string
}

export interface Crux {
  question: string
  sides: { position: string; seats: SeatKey[] }[]
}

export interface Veredito {
  label: string
  call: string
  recommended?: string
  why: { point: string; seat?: string; framework?: string }[]
  minority?: { seat?: string; quote?: string; would_have_to_be_true?: string }
  next_steps: { when?: string; action: string }[]
  conditions: string[]
  kill_criteria?: string
  cheapest_test?: string
  revisit?: string
  override_note?: string
  fights: { crux: string; story: string }[]
}

export interface Sessao {
  id: string
  data: string
  jornada: Scope | null
  exemplo: boolean
  titulo: string
  decisao: string
  brief: string
  modo: 'full' | 'quick'
  opcoes: Opcao[]
  pesos: Record<SeatKey, { weight: number; reason: string }>
  assentos: SeatKey[]
  premissas: string[]
  rodadas: Round[]
  cruxes: Crux[]
  notaCruxes: string
  veredito: Veredito | null
  briefMd: string
  vereditoMd: string
}

type Arquivos = Record<string, string>

const lerJson = <T,>(s: string | undefined): T | null => {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

const JORNADAS_VALIDAS = new Set<string>(['teen', 'ciclo', 'mais40', 'global'])

function normalizarJornada(raw: unknown): Scope | null {
  const t = String(raw ?? '').toLowerCase().replace('40+', 'mais40').replace('+', '')
  return JORNADAS_VALIDAS.has(t) ? (t as Scope) : null
}

interface SetupBruto {
  title?: string
  decision?: string
  brief?: string
  mode?: string
  jornada?: string
  options?: (string | { id?: string; label?: string; text?: string })[]
  weights?: Record<string, number | { weight?: number; reason?: string }> | { seat: string; weight?: number; reason?: string }[]
  seats?: string[]
  assumptions?: string[]
}

/**
 * Monta uma sessão a partir dos arquivos de uma pasta `sessions/<id>/`.
 * Aceita o formato do Claude Code (council.json, round-N.md, cruxes.json, verdict.json)
 * e o formato gravado pelo app do Roast Room (events.json).
 */
export function montarSessao(id: string, arquivos: Arquivos): Sessao | null {
  const eventos = lerJson<{ title?: string; mode?: string; events?: { type: string; [k: string]: unknown }[] }>(arquivos['events.json'])
  const evento = (tipo: string) => eventos?.events?.find((e) => e.type === tipo) as Record<string, unknown> | undefined
  const setup = (lerJson<SetupBruto>(arquivos['council.json']) ?? (evento('setup') as SetupBruto | undefined)) || null
  if (!setup && !arquivos['brief.md']) return null

  const opcoes: Opcao[] = (setup?.options ?? []).map((o, i) =>
    typeof o === 'string' ? { id: 'ABCD'[i], label: o } : { id: String(o.id || 'ABCD'[i]).toUpperCase(), label: o.label || o.text || '' },
  )
  const ids = opcoes.map((o) => o.id)

  const pesos = Object.fromEntries(SEATS.map((s) => [s.key, { weight: 1, reason: '' }])) as Sessao['pesos']
  const listaPesos = Array.isArray(setup?.weights)
    ? setup!.weights
    : Object.entries(setup?.weights ?? {}).map(([seat, w]) => (typeof w === 'number' ? { seat, weight: w } : { seat, ...w }))
  for (const w of listaPesos as { seat: string; weight?: number; reason?: string }[]) {
    const k = seatKey(w.seat)
    if (k) pesos[k] = { weight: Math.max(1, Math.min(3, Number(w.weight) || 1)), reason: w.reason || '' }
  }
  const assentosSetup = (setup?.seats ?? []).map(seatKey).filter(Boolean) as SeatKey[]

  const rodadas: Round[] = []
  for (const n of [1, 2, 3]) {
    const md = arquivos[`round-${n}.md`]
    if (md) rodadas.push({ n, ...splitRound(md, ids) })
  }
  const assentos = assentosSetup.length ? [...new Set(assentosSetup)] : rodadas[0]?.cards.length ? rodadas[0].cards.map((c) => c.seat) : SEATS.map((s) => s.key)

  const cruxBruto = lerJson<{ cruxes?: { question?: string; sides?: { position?: string; seats?: string[] }[] }[]; note?: string }>(arquivos['cruxes.json']) ?? (evento('cruxes') as never)
  const cruxes: Crux[] = (cruxBruto?.cruxes ?? []).map((c) => ({
    question: c.question ?? '',
    sides: (c.sides ?? []).map((sd) => ({ position: sd.position ?? '', seats: (sd.seats ?? []).map(seatKey).filter(Boolean) as SeatKey[] })),
  }))

  const vBruto = (lerJson<Partial<Veredito>>(arquivos['verdict.json']) ?? ((evento('verdict')?.verdict as Partial<Veredito>) || null)) as Partial<Veredito> | null
  const veredito: Veredito | null = vBruto
    ? {
        label: vBruto.label ?? '',
        call: vBruto.call ?? '',
        recommended: vBruto.recommended,
        why: vBruto.why ?? [],
        minority: vBruto.minority,
        next_steps: (vBruto.next_steps ?? []).map((s) => (typeof s === 'string' ? { action: s } : s)),
        conditions: vBruto.conditions ?? [],
        kill_criteria: vBruto.kill_criteria,
        cheapest_test: vBruto.cheapest_test,
        revisit: vBruto.revisit,
        override_note: vBruto.override_note,
        fights: vBruto.fights ?? [],
      }
    : null

  return {
    id,
    data: /^\d{4}-\d{2}-\d{2}/.test(id) ? id.slice(0, 10) : '',
    jornada: normalizarJornada(setup?.jornada),
    exemplo: /example|exemplo/i.test(id),
    titulo: setup?.title || eventos?.title || id,
    decisao: setup?.decision ?? '',
    brief: setup?.brief ?? '',
    modo: (setup?.mode ?? eventos?.mode) === 'quick' ? 'quick' : 'full',
    opcoes,
    pesos,
    assentos,
    premissas: setup?.assumptions ?? [],
    rodadas,
    cruxes,
    notaCruxes: cruxBruto?.note ?? '',
    veredito,
    briefMd: arquivos['brief.md'] ?? '',
    vereditoMd: arquivos['verdict.md'] ?? '',
  }
}

/** Agrupa caminhos `.../sessions/<id>/<arquivo>` por sessão e monta cada uma (mais recentes primeiro). */
export function carregarSessoes(raw: Record<string, string>): Sessao[] {
  const pastas = new Map<string, Arquivos>()
  for (const [caminho, conteudo] of Object.entries(raw)) {
    const m = caminho.match(/sessions\/([^/]+)\/([^/]+)$/)
    if (!m) continue
    if (!pastas.has(m[1])) pastas.set(m[1], {})
    pastas.get(m[1])![m[2]] = conteudo
  }
  return [...pastas.entries()]
    .map(([id, arq]) => montarSessao(id, arq))
    .filter((s): s is Sessao => s !== null)
    .sort((a, b) => b.id.localeCompare(a.id))
}

/** Sessões visíveis em um escopo: cada jornada vê só as suas; a Global vê todas. */
export function sessoesDoEscopo(sessoes: Sessao[], scope: Scope): Sessao[] {
  return scope === 'global' ? sessoes : sessoes.filter((s) => s.jornada === scope)
}

// ---------------------------------------------------------------------------
// Placar

export interface PlacarOpcao {
  id: string
  label: string
  score: number | null
  math: string
}

export function ultimaRodada(s: Sessao): Round | null {
  return [...s.rodadas].reverse().find((r) => r.cards.length > 0) ?? null
}

/** Nota ponderada de cada opção na última rodada: soma(peso × nota) / soma(pesos). */
export function placar(s: Sessao): PlacarOpcao[] {
  const r = ultimaRodada(s)
  return s.opcoes.map((o) => {
    let num = 0
    let den = 0
    const partes: string[] = []
    for (const c of r?.cards ?? []) {
      const v = c.info.optionScores[o.id]
      const w = s.pesos[c.seat].weight
      if (typeof v === 'number') {
        num += w * v
        den += w
        partes.push(`${w}×${v}`)
      }
    }
    return { id: o.id, label: o.label, score: den ? Math.round((num / den) * 10) / 10 : null, math: den ? `(${partes.join(' + ')}) / ${den}` : '' }
  })
}

export function recomendada(s: Sessao): string | null {
  if (s.veredito?.recommended) return s.veredito.recommended
  const p = placar(s).filter((x) => x.score !== null)
  if (!p.length) return null
  return p.reduce((a, b) => (b.score! > a.score! ? b : a)).id
}

/** Diferença entre a maior e a menor nota dos assentos na opção recomendada. */
export function spread(s: Sessao): number | null {
  const id = recomendada(s)
  const r = ultimaRodada(s)
  if (!id || !r) return null
  const v = r.cards.map((c) => c.info.optionScores[id]).filter((x): x is number => typeof x === 'number')
  return v.length ? Math.max(...v) - Math.min(...v) : null
}

export type StatusSessao = 'concluida' | 'em_andamento'

export function status(s: Sessao): StatusSessao {
  return s.veredito ? 'concluida' : 'em_andamento'
}

export const LABEL_PT: Record<string, { texto: string; tom: 'ok' | 'warn' | 'bad' | '' }> = {
  GO: { texto: 'Seguir', tom: 'ok' },
  'GO WITH CONDITIONS': { texto: 'Seguir com condições', tom: 'ok' },
  RESHAPE: { texto: 'Redesenhar', tom: 'warn' },
  WAIT: { texto: 'Esperar', tom: 'warn' },
  "DON'T DO IT": { texto: 'Não fazer', tom: 'bad' },
}

export function labelPt(label: string) {
  return LABEL_PT[label.toUpperCase().replace('’', "'")] ?? { texto: label || 'Sem veredito', tom: '' as const }
}

// ---------------------------------------------------------------------------
// Brief para levar uma decisão ao conselho

export interface FormDecisao {
  decisao: string
  opcoes: string[]
  inclinacao: string
  sucesso: string
  limitesExtras: string
  modo: 'full' | 'quick'
  assentos: SeatKey[]
}

export interface ContextoNumeros {
  periodo: string
  linhas: string[]
  demo: boolean
}

export function limitesDoEscopo(scope: Scope): string[] {
  const base = ['Dados de saúde são sensíveis (LGPD) e nunca são usados para segmentar anúncios.']
  if (scope === 'teen' || scope === 'global') {
    base.unshift('Teen: proibida publicidade comportamental, por interesses ou por públicos semelhantes direcionada a menores, e proibido o uso comercial de informações de saúde. A compra é feita pelo responsável legal.')
  }
  if (scope === 'global') base.push('Uma pessoa conta uma única vez na empresa, mesmo quando migra de jornada.')
  return base
}

/** Texto pronto para colar no Claude Code: `/roast-room --jornada ...` seguido do brief. */
export function montarComando(scope: Scope, f: FormDecisao, ctx: ContextoNumeros): string {
  const flags = [`--jornada ${scope}`]
  if (f.modo === 'quick') flags.push('--quick')
  if (f.assentos.length && f.assentos.length < SEATS.length) flags.push(`--seats ${f.assentos.join(',')}`)
  const nomeEscopo = scope === 'global' ? 'AKORA Global' : `${JOURNEYS[scope as JourneyId].nome} (${JOURNEYS[scope as JourneyId].faixa})`
  const opcoes = f.opcoes.map((o) => o.trim()).filter(Boolean)
  const limites = [...limitesDoEscopo(scope), ...f.limitesExtras.split('\n').map((l) => l.trim()).filter(Boolean)]
  const linhas = [
    `/roast-room ${flags.join(' ')}`,
    `Decisão: ${f.decisao.trim() || '(descreva a decisão em uma linha)'}`,
    `Opções: ${opcoes.map((o, i) => `${'ABCD'[i]}) ${o}`).join(' · ')}`,
    `Contexto — ${nomeEscopo}, ${ctx.periodo}${ctx.demo ? ' (dados fictícios do AKORA)' : ''}: ${ctx.linhas.join('; ')}.`,
    `Limites: ${limites.join(' ')}`,
  ]
  if (f.sucesso.trim()) linhas.push(`Sucesso: ${f.sucesso.trim()}`)
  if (f.inclinacao.trim()) linhas.push(`Inclinação: ${f.inclinacao.trim()}`)
  return linhas.join('\n')
}
