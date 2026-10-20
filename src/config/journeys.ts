// Definição das jornadas (unidades de negócio) do AKORA Command Center.
// Cada jornada opera como uma unidade independente; a AKORA Global apenas consolida.

export type JourneyId = 'teen' | 'ciclo' | 'mais40'
export type Scope = JourneyId | 'global'

/**
 * - `ativa`: jornada lançada, todas as funções operacionais liberadas.
 * - `pre_lancamento`: escritório preparado (navegação, metas, planejamento),
 *   mas ações operacionais (criar campanhas, cobranças etc.) ficam desativadas.
 */
export type JourneyStatus = 'ativa' | 'pre_lancamento'

export interface JourneyConfig {
  id: JourneyId
  nome: string
  faixa: string
  idadeMin: number
  idadeMax: number | null
  status: JourneyStatus
  /** Data em que a jornada começou a operar (início da série histórica). */
  inicio: string
  cor: string
  corSuave: string
  precos: { mensal: number; anual: number }
  /** Regras de proteção específicas da jornada. */
  protecaoMenores: boolean
}

export const JOURNEYS: Record<JourneyId, JourneyConfig> = {
  teen: {
    id: 'teen',
    nome: 'AKORA Teen',
    faixa: '12–17 anos',
    idadeMin: 12,
    idadeMax: 17,
    status: 'ativa',
    inicio: '2025-03-01',
    cor: '#C2877B',
    corSuave: '#F3E4E0',
    precos: { mensal: 19.9, anual: 179.9 },
    protecaoMenores: true,
  },
  ciclo: {
    id: 'ciclo',
    nome: 'AKORA Ciclo',
    faixa: '18–39 anos',
    idadeMin: 18,
    idadeMax: 39,
    status: 'ativa',
    inicio: '2025-01-01',
    cor: '#7B6AA6',
    corSuave: '#E9E5F2',
    precos: { mensal: 29.9, anual: 269.9 },
    protecaoMenores: false,
  },
  mais40: {
    id: 'mais40',
    nome: 'AKORA 40+',
    faixa: '40+ anos',
    idadeMin: 40,
    idadeMax: null,
    status: 'ativa',
    inicio: '2025-06-01',
    cor: '#423566',
    corSuave: '#DEDAE8',
    precos: { mensal: 34.9, anual: 314.9 },
    protecaoMenores: false,
  },
}

export const JOURNEY_IDS: JourneyId[] = ['teen', 'ciclo', 'mais40']

export const BRAND = {
  deepPlum: '#423566',
  softLavender: '#B9B0CF',
  rose: '#C2877B',
  softWhite: '#FAF7F5',
}

export function scopeLabel(scope: Scope): string {
  return scope === 'global' ? 'AKORA Global' : JOURNEYS[scope].nome
}

export function scopeColor(scope: Scope): string {
  return scope === 'global' ? BRAND.deepPlum : JOURNEYS[scope].cor
}

export function journeyForAge(age: number): JourneyId {
  if (age < 18) return 'teen'
  if (age < 40) return 'ciclo'
  return 'mais40'
}

/** Funcionalidades que dependem de integrações ainda não configuradas. */
export const FEATURES_EM_BREVE = {
  iaMarketing: 'Aguardando integração com o provedor de IA',
  creativeStudioIntegracao: 'Aguardando integração com ferramentas de design',
  gatewayPagamento: 'Aguardando integração com o gateway de pagamentos',
  analyticsApp: 'Aguardando integração com o analytics agregado do app',
} as const

export const MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: '◧' },
  { id: 'usuarias', label: 'Usuárias', icon: '◉' },
  { id: 'financeiro', label: 'Financeiro', icon: '◈' },
  { id: 'marketing', label: 'Marketing Office', icon: '✦' },
  { id: 'assinaturas', label: 'Assinaturas', icon: '◎' },
  { id: 'metas', label: 'Metas', icon: '◬' },
  { id: 'relatorios', label: 'Relatórios', icon: '▤' },
  { id: 'conselho', label: 'Conselho', icon: '⚖' },
] as const

export type ModuleId = (typeof MODULES)[number]['id']

export const GLOBAL_MODULES = [
  { id: 'dashboard', label: 'Visão consolidada', icon: '◧' },
  { id: 'comparativo', label: 'Teen × Ciclo × 40+', icon: '⇄' },
  { id: 'financeiro', label: 'Financeiro consolidado', icon: '◈' },
  { id: 'metas', label: 'Metas da empresa', icon: '◬' },
  { id: 'relatorios', label: 'Relatórios', icon: '▤' },
  { id: 'conselho', label: 'Conselho', icon: '⚖' },
] as const

export type GlobalModuleId = (typeof GLOBAL_MODULES)[number]['id']
