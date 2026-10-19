import { describe, expect, it } from 'vitest'
import { JOURNEYS, JOURNEY_IDS } from '../config/journeys'
import { generateDataset } from '../data/seed'
import { alocarDespesa, distribuir, validarDespesa } from './allocation'
import { validarCampanha } from './compliance'
import { ALL_MONTHS, REF_DATE } from './dates'
import { basesRateio, computeAllRows, deduplicacao, getSummary, periodMonths } from './metrics'
import { isMember, journeyAt } from './people'

const ds = generateDataset()
const rows = computeAllRows(ds)

describe('Usuárias sem duplicidade', () => {
  it('uma pessoa que migra de Teen para Ciclo conta uma única vez no global', () => {
    const migrada = ds.pessoas.find((p) => p.historico.length > 1 && p.historico[0].jornada === 'teen')!
    expect(migrada).toBeDefined()
    expect(journeyAt(migrada, migrada.historico[0].desde)).toBe('teen')
    expect(journeyAt(migrada, migrada.historico[1].desde)).toBe('ciclo')

    const d = deduplicacao(ds)
    expect(d.migracoes).toBeGreaterThan(0)
    expect(d.totalUnico).toBe(ds.pessoas.filter((p) => p.cadastro <= REF_DATE).length)
    expect(d.somaJornadas - d.migracoes).toBe(d.totalUnico)
  })

  it('cada pessoa pertence a exatamente uma jornada em qualquer data', () => {
    for (const p of ds.pessoas.slice(0, 2000)) {
      const membroEm = JOURNEY_IDS.filter((j) => isMember(p, REF_DATE, j))
      expect(membroEm.length).toBe(isMember(p, REF_DATE, 'global') ? 1 : 0)
    }
  })

  it('contas ativas no global = soma das jornadas (sem sobreposição)', () => {
    ALL_MONTHS.forEach((_, i) => {
      const soma = JOURNEY_IDS.reduce((s, j) => s + rows[j][i].membros, 0)
      expect(rows.global[i].membros).toBe(soma)
    })
  })
})

describe('Receitas por jornada e período', () => {
  it('cada transação pertence à jornada vigente na data da cobrança', () => {
    const byId = new Map(ds.pessoas.map((p) => [p.id, p]))
    for (const t of ds.transacoes) expect(journeyAt(byId.get(t.pessoaId)!, t.data)).toBe(t.jornada)
  })

  it('faturamento global = soma das jornadas, sem duplicar transações', () => {
    const months = periodMonths('tudo')
    const g = getSummary(ds, 'global', months).receitaBruta
    const soma = JOURNEY_IDS.reduce((s, j) => s + getSummary(ds, j, months).receitaBruta, 0)
    expect(g).toBeCloseTo(soma, 2)
    expect(g).toBeCloseTo(ds.transacoes.reduce((s, t) => s + t.valor, 0), 2)
  })
})

describe('Rateio de despesas compartilhadas', () => {
  it('a soma das parcelas é exatamente o valor original', () => {
    const p = distribuir(1000.01, { teen: 1, ciclo: 1, mais40: 1 })
    expect(Math.round((p.teen + p.ciclo + p.mais40) * 100)).toBe(100001)
  })

  it('despesas do global = soma das parcelas alocadas às jornadas em todos os meses', () => {
    ALL_MONTHS.forEach((_, i) => {
      const g = Object.values(rows.global[i].despesas).reduce((a, b) => a + b, 0)
      const soma = JOURNEY_IDS.reduce((s, j) => s + Object.values(rows[j][i].despesas).reduce((a, b) => a + b, 0), 0)
      expect(soma).toBeCloseTo(g, 1)
    })
  })

  it('despesa direta vai integralmente para a jornada indicada', () => {
    const d = ds.despesas.find((x) => 'jornada' in x.destino && x.destino.jornada === 'teen')!
    const p = alocarDespesa(d, basesRateio(ds, d.competencia))
    expect(p.teen).toBe(d.valor)
    expect(p.ciclo + p.mais40).toBe(0)
  })

  it('jornada que ainda não operava não recebe rateio', () => {
    const m = ALL_MONTHS[0] // jan/25: Teen e 40+ ainda não lançadas
    const d = ds.despesas.find((x) => x.competencia === m && 'rateio' in x.destino && x.destino.rateio.tipo === 'igual')!
    const p = alocarDespesa(d, basesRateio(ds, m))
    expect(p.teen).toBe(0)
    expect(p.mais40).toBe(0)
    expect(p.ciclo).toBe(d.valor)
  })

  it('todo lançamento exige jornada ou regra de rateio explícita', () => {
    expect(validarDespesa({ valor: 100, competencia: '2026-10' })).toContain('Informe a jornada ou uma regra explícita de rateio.')
    expect(validarDespesa({ valor: 100, competencia: '2026-10', destino: { rateio: { tipo: 'percentual', percentuais: { teen: 0.5, ciclo: 0.3, mais40: 0.1 } } } })).toContain('Os percentuais de rateio devem somar 100%.')
    expect(validarDespesa({ valor: 100, competencia: '2026-10', destino: { jornada: 'ciclo' } })).toEqual([])
    for (const d of ds.despesas) expect(validarDespesa(d)).toEqual([])
  })
})

describe('Proteção de menores no Teen', () => {
  const base = { jornada: 'teen' as const, nome: 'Teste', tipo: 'paga' as const, usaDadosSaude: false, inicio: '2026-11-01', fim: '2026-11-30', orcamento: 1000 }

  it('bloqueia segmentação comportamental, por interesses e lookalike', () => {
    for (const segmentacao of ['comportamental', 'interesses', 'lookalike'] as const) {
      expect(validarCampanha({ ...base, segmentacao }).erros.length).toBeGreaterThan(0)
    }
    expect(validarCampanha({ ...base, segmentacao: 'contextual' }).erros).toEqual([])
  })

  it('bloqueia uso comercial de dados de saúde', () => {
    expect(validarCampanha({ ...base, segmentacao: 'contextual', usaDadosSaude: true }).erros.length).toBeGreaterThan(0)
  })

  it('campanha precisa de jornada', () => {
    expect(validarCampanha({ nome: 'Sem jornada' }).erros).toContain('Toda campanha deve ser identificada por jornada.')
  })

  it('nenhuma campanha Teen dos dados usa segmentação proibida', () => {
    for (const c of ds.campanhas.filter((x) => x.jornada === 'teen')) {
      expect(['contextual', 'amplo']).toContain(c.segmentacao)
      expect(c.usaDadosSaude).toBe(false)
    }
  })

  it('jornada em pré-lançamento não aceita novas campanhas', () => {
    const original = JOURNEYS.mais40.status
    JOURNEYS.mais40.status = 'pre_lancamento'
    try {
      expect(validarCampanha({ ...base, jornada: 'mais40', segmentacao: 'contextual' }).erros.some((e) => e.includes('pré-lançamento'))).toBe(true)
    } finally {
      JOURNEYS.mais40.status = original
    }
  })
})
