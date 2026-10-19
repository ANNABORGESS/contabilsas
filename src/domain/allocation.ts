import { JOURNEY_IDS, type JourneyId } from '../config/journeys'
import type { Despesa, RegraRateio } from './types'

export type Pesos = Record<JourneyId, number>

/** Bases de rateio disponíveis em uma competência. */
export interface BasesRateio {
  usuariasAtivas: Pesos
  receita: Pesos
  /** Jornadas operando na competência (participam de rateios "igual" e "percentual"). */
  operando: Record<JourneyId, boolean>
}

const zero = (): Pesos => ({ teen: 0, ciclo: 0, mais40: 0 })

export function pesosDaRegra(regra: RegraRateio, bases: BasesRateio): Pesos {
  const op = (j: JourneyId) => (bases.operando[j] ? 1 : 0)
  switch (regra.tipo) {
    case 'usuarias_ativas':
      return { ...bases.usuariasAtivas }
    case 'receita':
      return { ...bases.receita }
    case 'igual':
      return { teen: op('teen'), ciclo: op('ciclo'), mais40: op('mais40') }
    case 'percentual':
      return {
        teen: regra.percentuais.teen * op('teen'),
        ciclo: regra.percentuais.ciclo * op('ciclo'),
        mais40: regra.percentuais.mais40 * op('mais40'),
      }
  }
}

/**
 * Distribui um valor entre as jornadas segundo pesos, em centavos, garantindo que
 * a soma das parcelas seja exatamente igual ao valor original (sem duplicar nem perder).
 * Se todos os pesos forem zero, divide igualmente entre as jornadas operando.
 */
export function distribuir(valor: number, pesos: Pesos, operando?: Record<JourneyId, boolean>): Pesos {
  let p = pesos
  let total = JOURNEY_IDS.reduce((s, j) => s + Math.max(0, p[j]), 0)
  if (total <= 0) {
    p = { teen: 1, ciclo: 1, mais40: 1 }
    if (operando) JOURNEY_IDS.forEach((j) => (p[j] = operando[j] ? 1 : 0))
    total = JOURNEY_IDS.reduce((s, j) => s + p[j], 0) || 1
  }
  const centavos = Math.round(valor * 100)
  const out = zero()
  let alocado = 0
  const restos: { j: JourneyId; resto: number }[] = []
  for (const j of JOURNEY_IDS) {
    const exato = (centavos * Math.max(0, p[j])) / total
    const base = Math.floor(exato)
    out[j] = base
    alocado += base
    restos.push({ j, resto: exato - base })
  }
  restos.sort((a, b) => b.resto - a.resto)
  for (let i = 0; alocado < centavos; i = (i + 1) % restos.length) {
    if (p[restos[i].j] > 0) {
      out[restos[i].j] += 1
      alocado++
    }
  }
  JOURNEY_IDS.forEach((j) => (out[j] = out[j] / 100))
  return out
}

/** Parcela de uma despesa atribuída a cada jornada. */
export function alocarDespesa(d: Despesa, bases: BasesRateio): Pesos {
  if ('jornada' in d.destino) {
    const out = zero()
    out[d.destino.jornada] = d.valor
    return out
  }
  return distribuir(d.valor, pesosDaRegra(d.destino.rateio, bases), bases.operando)
}

/** Valida que um lançamento tem jornada ou regra de rateio explícita. */
export function validarDespesa(d: Partial<Despesa>): string[] {
  const erros: string[] = []
  if (!d.destino) erros.push('Informe a jornada ou uma regra explícita de rateio.')
  else if ('rateio' in d.destino && d.destino.rateio.tipo === 'percentual') {
    const soma = JOURNEY_IDS.reduce((s, j) => s + (d.destino as { rateio: { percentuais: Pesos } }).rateio.percentuais[j], 0)
    if (Math.abs(soma - 1) > 0.0001) erros.push('Os percentuais de rateio devem somar 100%.')
  }
  if (!d.valor || d.valor <= 0) erros.push('Valor deve ser positivo.')
  if (!d.competencia) erros.push('Informe a competência.')
  return erros
}

export function descreverDestino(d: Despesa): string {
  if ('jornada' in d.destino) return 'Direta'
  const r = d.destino.rateio
  switch (r.tipo) {
    case 'usuarias_ativas':
      return 'Rateio por usuárias ativas'
    case 'receita':
      return 'Rateio por receita'
    case 'igual':
      return 'Rateio igualitário'
    case 'percentual':
      return `Rateio fixo ${Math.round(r.percentuais.teen * 100)}/${Math.round(r.percentuais.ciclo * 100)}/${Math.round(r.percentuais.mais40 * 100)}`
  }
}
