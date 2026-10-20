import { carregarSessoes, type Sessao } from '../domain/council'

// Sessões do conselho gravadas pelo /roast-room em `sessions/<data>-<jornada>-<decisão>/`.
// Em `npm run dev`, novos arquivos aparecem na tela conforme cada rodada termina.
const arquivos = import.meta.glob('../../sessions/*/*.{json,md}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

let cache: Sessao[] | null = null
export function getSessoes(): Sessao[] {
  if (!cache) cache = carregarSessoes(arquivos)
  return cache
}
