import type { JourneyId } from '../config/journeys'
import type { ISODate } from './dates'
import type { Pessoa } from './types'

/** Jornada da pessoa em uma data (null se ainda não cadastrada). */
export function journeyAt(p: Pick<Pessoa, 'historico'>, d: ISODate): JourneyId | null {
  for (const s of p.historico) {
    if (s.desde <= d && (s.ate === null || d < s.ate)) return s.jornada
  }
  return null
}

/** A pessoa é membro (conta aberta) da jornada na data? Para escopo global, qualquer jornada. */
export function isMember(p: Pessoa, d: ISODate, jornada: JourneyId | 'global'): boolean {
  if (p.encerramento && p.encerramento <= d) return false
  const j = journeyAt(p, d)
  if (!j) return false
  return jornada === 'global' || j === jornada
}

/** A pessoa já passou pela jornada até a data (inclusive histórico)? */
export function everIn(p: Pessoa, d: ISODate, jornada: JourneyId): boolean {
  return p.historico.some((s) => s.jornada === jornada && s.desde <= d)
}

export function isPremiumAt(p: Pessoa, d: ISODate): boolean {
  const a = p.assinatura
  return !!a && a.inicio <= d && (a.cancelamento === null || d < a.cancelamento)
}

/**
 * Contagem de pessoas únicas. A identidade é o id da pessoa — uma usuária que migra
 * de Teen para Ciclo continua sendo UMA pessoa no total global.
 */
export function uniqueCount(ids: Iterable<string>): number {
  return new Set(ids).size
}
