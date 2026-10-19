import type { JourneyId } from '../config/journeys'
import type { ISODate, MonthKey } from './dates'

/** Trecho do histórico de uma pessoa em uma jornada. `ate` exclusivo; null = vigente. */
export interface JourneySpan {
  jornada: JourneyId
  desde: ISODate
  ate: ISODate | null
}

/**
 * Pessoa (usuária) identificada por um id único e pseudonimizado.
 * O painel administrativo só usa atributos operacionais e agregáveis — nenhum dado de saúde.
 */
export interface Pessoa {
  id: string
  cadastro: ISODate
  nascimento: ISODate
  historico: JourneySpan[]
  /** Encerramento da conta (exclusão / desistência definitiva). */
  encerramento: ISODate | null
  /** Bitmask de atividade mensal: bit i = ativa no mês ALL_MONTHS[i]. */
  atividade: number
  assinatura: Assinatura | null
}

export type Plano = 'mensal' | 'anual'

export interface Assinatura {
  plano: Plano
  inicio: ISODate
  /** Data efetiva do cancelamento; null = vigente. */
  cancelamento: ISODate | null
}

export type StatusTransacao = 'pago' | 'pendente' | 'reembolsado'

export interface Transacao {
  id: string
  pessoaId: string
  /** Jornada da pessoa na data da cobrança (período de referência). */
  jornada: JourneyId
  data: ISODate
  competencia: MonthKey
  plano: Plano
  tipo: 'nova' | 'renovacao' | 'recorrencia'
  valor: number
  status: StatusTransacao
}

export type CategoriaDespesa = 'tecnologia' | 'ia' | 'marketing' | 'pessoal' | 'operacional' | 'juridico'

export type RegraRateio =
  | { tipo: 'usuarias_ativas' }
  | { tipo: 'receita' }
  | { tipo: 'igual' }
  | { tipo: 'percentual'; percentuais: Record<JourneyId, number> }

/**
 * Todo lançamento de despesa precisa de uma jornada OU de uma regra explícita de rateio.
 */
export type DestinoDespesa = { jornada: JourneyId } | { rateio: RegraRateio }

export interface Despesa {
  id: string
  descricao: string
  categoria: CategoriaDespesa
  competencia: MonthKey
  valor: number
  destino: DestinoDespesa
  campanhaId?: string
}

export type Canal = 'Instagram' | 'TikTok' | 'YouTube' | 'Google' | 'Influenciadoras' | 'E-mail' | 'Parcerias' | 'Pinterest'

/**
 * - `contextual`: anúncio exibido pelo contexto do conteúdo (permitido em todas as jornadas).
 * - `amplo`: segmentação ampla por região/idade mínima legal.
 * - `interesses` / `comportamental` / `lookalike`: baseados em perfil ou comportamento —
 *   proibidos no Teen.
 */
export type Segmentacao = 'contextual' | 'amplo' | 'interesses' | 'comportamental' | 'lookalike'

export interface Campanha {
  id: string
  jornada: JourneyId
  nome: string
  canal: Canal
  tipo: 'organica' | 'paga'
  objetivo: 'aquisicao' | 'conversao_premium' | 'reengajamento' | 'marca'
  segmentacao: Segmentacao
  usaDadosSaude: boolean
  inicio: ISODate
  fim: ISODate
  orcamento: number
  investido: number
  impressoes: number
  cliques: number
  cadastros: number
  conversoesPremium: number
  status: 'planejada' | 'ativa' | 'encerrada'
}

export interface PostEditorial {
  id: string
  jornada: JourneyId
  data: ISODate
  canal: Canal
  formato: 'Reels' | 'Carrossel' | 'Stories' | 'Vídeo' | 'Artigo' | 'Newsletter'
  tema: string
  status: 'ideia' | 'em_producao' | 'aprovado' | 'publicado'
}

export interface Lancamento {
  id: string
  jornada: JourneyId
  nome: string
  data: ISODate
  etapa: 'planejamento' | 'pre_lancamento' | 'lancamento' | 'pos_lancamento'
  responsavel: string
}

export interface Material {
  id: string
  jornada: JourneyId
  nome: string
  tipo: 'Guia de marca' | 'Template' | 'Vídeo' | 'Fotografia' | 'Roteiro' | 'Copy'
  atualizado: ISODate
}

export interface BriefCriativo {
  id: string
  jornada: JourneyId
  titulo: string
  formato: string
  status: 'briefing' | 'criação' | 'revisão' | 'aprovado'
  prazo: ISODate
}

export interface MetaMensal {
  jornada: JourneyId
  mes: MonthKey
  novasUsuarias: number
  faturamento: number
  novasAssinaturas: number
  /** Retenção mensal de assinantes (0–1). */
  retencao: number
  /** Conversão gratuito → Premium no mês (0–1). */
  conversao: number
  investimentoMarketing: number
}

export interface Dataset {
  demo: true
  pessoas: Pessoa[]
  transacoes: Transacao[]
  despesas: Despesa[]
  campanhas: Campanha[]
  posts: PostEditorial[]
  lancamentos: Lancamento[]
  materiais: Material[]
  briefs: BriefCriativo[]
  metas: MetaMensal[]
}
