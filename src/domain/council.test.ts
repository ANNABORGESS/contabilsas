import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { carregarSessoes, labelPt, limitesDoEscopo, montarComando, montarSessao, parseCard, placar, recomendada, sessoesDoEscopo } from './council'

const raiz = join(__dirname, '../../sessions')
const raw: Record<string, string> = {}
for (const d of readdirSync(raiz, { withFileTypes: true }).filter((x) => x.isDirectory()))
  for (const f of readdirSync(join(raiz, d.name))) if (/\.(json|md)$/.test(f)) raw[`sessions/${d.name}/${f}`] = readFileSync(join(raiz, d.name, f), 'utf8')

const sessoes = carregarSessoes(raw)

describe('Conselho: leitura das sessões', () => {
  it('lê as três sessões de exemplo, nos dois formatos (council.json e events.json)', () => {
    expect(sessoes.length).toBeGreaterThanOrEqual(3)
    for (const s of sessoes.filter((x) => x.exemplo)) {
      expect(s.opcoes.length).toBeGreaterThanOrEqual(2)
      expect(s.rodadas.length).toBeGreaterThanOrEqual(2)
      expect(s.veredito?.label).toBeTruthy()
      expect(s.rodadas[s.rodadas.length - 1].cards.length).toBe(s.assentos.length)
    }
  })

  it('calcula o placar ponderado da última rodada e recomenda a opção do veredito', () => {
    const seed = sessoes.find((s) => s.id.includes('take-the-seed'))!
    const p = placar(seed)
    // Rodada 3, opção B: (3×7 + 3×7 + 2×8 + 2×8 + 2×7 + 2×7 + 1×8) / 15 = 7,3
    expect(p.find((o) => o.id === 'B')!.score).toBe(7.3)
    expect(recomendada(seed)).toBe('B')
  })

  it('lê campos que dividem a mesma linha com "·"', () => {
    const c = parseCard('OPTION SCORES: A 2/10 · B 7/10\nPILLAR SCORE: 6/10 · CONFIDENCE: 4/5 · RUIN RISK: likely · DOOR: one-way', ['A', 'B'])
    expect(c.optionScores).toEqual({ A: 2, B: 7 })
    expect(c.pillar).toBe(6)
    expect(c.confidence).toBe(4)
    expect(c.ruin).toBe('likely')
    expect(c.door).toBe('one-way')
  })

  it('cada jornada vê só os próprios conselhos; a Global vê todos', () => {
    const teen = montarSessao('2026-11-01-teen-preco', { 'council.json': JSON.stringify({ title: 'Preço Teen', jornada: 'teen', options: ['Subir', 'Manter'] }) })!
    const ciclo = montarSessao('2026-11-02-ciclo-ads', { 'council.json': JSON.stringify({ title: 'Ads Ciclo', jornada: 'ciclo', options: ['Sim', 'Não'] }) })!
    const todas = [teen, ciclo, ...sessoes]
    expect(sessoesDoEscopo(todas, 'teen').map((s) => s.id)).toEqual([teen.id])
    expect(sessoesDoEscopo(todas, 'ciclo').map((s) => s.id)).toEqual([ciclo.id])
    expect(sessoesDoEscopo(todas, 'global').length).toBe(todas.length)
    expect(sessoesDoEscopo(sessoes, 'teen')).toEqual([])
  })

  it('traduz os rótulos do veredito', () => {
    expect(labelPt('GO WITH CONDITIONS').texto).toBe('Seguir com condições')
    expect(labelPt("DON'T DO IT").tom).toBe('bad')
  })
})

describe('Conselho: comando para o Claude Code', () => {
  const form = { decisao: 'Subir o Premium Teen?', opcoes: ['Subir para todas', 'Só novas', 'Manter'], inclinacao: '', sucesso: '', limitesExtras: '', modo: 'quick' as const, assentos: ['hormozi', 'buffett'] as ('hormozi' | 'buffett')[] }
  const ctx = { periodo: 'últimos 3 meses', demo: true, linhas: ['817 assinantes'] }

  it('leva a jornada, o modo, os assentos e os números', () => {
    const cmd = montarComando('teen', form, ctx)
    expect(cmd.split('\n')[0]).toBe('/roast-room --jornada teen --quick --seats hormozi,buffett')
    expect(cmd).toContain('A) Subir para todas · B) Só novas · C) Manter')
    expect(cmd).toContain('817 assinantes')
    expect(cmd).toContain('dados fictícios')
  })

  it('sempre inclui a proteção de menores no Teen e na Global, e a LGPD em todas', () => {
    expect(montarComando('teen', form, ctx)).toMatch(/publicidade comportamental/)
    expect(limitesDoEscopo('global').join(' ')).toMatch(/publicidade comportamental/)
    expect(limitesDoEscopo('ciclo').join(' ')).not.toMatch(/menores/)
    for (const j of ['teen', 'ciclo', 'mais40', 'global'] as const) expect(limitesDoEscopo(j).join(' ')).toMatch(/LGPD/)
  })
})
