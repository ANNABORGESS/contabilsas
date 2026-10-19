import { JOURNEYS } from '../config/journeys'
import type { Campanha } from './types'

export interface ResultadoValidacao {
  erros: string[]
  avisos: string[]
}

const SEGMENTACOES_PROIBIDAS_MENORES = new Set(['interesses', 'comportamental', 'lookalike'])

/**
 * Regras de campanha:
 * - Toda campanha precisa estar identificada por jornada.
 * - Teen: proibida publicidade comportamental direcionada a menores (segmentação por
 *   interesses, comportamento ou públicos semelhantes) e proibido uso comercial de
 *   informações sensíveis de saúde.
 * - Demais jornadas: dados de saúde também são sensíveis (LGPD art. 11) — bloqueados
 *   para fins comerciais no painel.
 * - Jornada em pré-lançamento não aceita novas campanhas.
 */
export function validarCampanha(c: Partial<Campanha>): ResultadoValidacao {
  const erros: string[] = []
  const avisos: string[] = []

  if (!c.jornada) {
    erros.push('Toda campanha deve ser identificada por jornada.')
    return { erros, avisos }
  }
  const j = JOURNEYS[c.jornada]
  if (j.status !== 'ativa') erros.push(`${j.nome} está em pré-lançamento: criação de campanhas desativada.`)
  if (!c.nome?.trim()) erros.push('Informe o nome da campanha.')
  if (c.inicio && c.fim && c.fim < c.inicio) erros.push('A data de término deve ser posterior ao início.')
  if (c.orcamento !== undefined && c.orcamento < 0) erros.push('Orçamento não pode ser negativo.')

  if (c.usaDadosSaude) {
    erros.push(
      j.protecaoMenores
        ? 'Teen: é proibido o uso comercial de informações sensíveis de saúde.'
        : 'Dados de saúde são sensíveis (LGPD): não podem ser usados para segmentação comercial.',
    )
  }
  if (j.protecaoMenores && c.segmentacao && SEGMENTACOES_PROIBIDAS_MENORES.has(c.segmentacao)) {
    erros.push('Teen: publicidade comportamental direcionada a menores é proibida. Use segmentação contextual ou ampla.')
  }
  if (j.protecaoMenores && c.tipo === 'paga') {
    avisos.push('Teen: revise a peça com o checklist de comunicação para menores antes de publicar.')
  }
  return { erros, avisos }
}

export const SEGMENTACAO_LABEL: Record<Campanha['segmentacao'], string> = {
  contextual: 'Contextual',
  amplo: 'Ampla',
  interesses: 'Por interesses',
  comportamental: 'Comportamental',
  lookalike: 'Públicos semelhantes',
}
