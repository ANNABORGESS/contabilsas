const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brlCentsFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const numFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const pctFmt = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const brl = (v: number) => brlFmt.format(v)
export const brlCents = (v: number) => brlCentsFmt.format(v)
export const num = (v: number) => numFmt.format(v)
export const pct = (v: number) => pctFmt.format(v)
export const signedPct = (v: number) => `${v > 0 ? '+' : ''}${pctFmt.format(v)}`

export function compactBrl(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`
  if (a >= 1_000) return `R$ ${(v / 1_000).toFixed(1).replace('.', ',')} mil`
  return brl(v)
}

export type Formato = 'num' | 'brl' | 'pct' | 'brlCents'

export function fmt(v: number, f: Formato): string {
  switch (f) {
    case 'brl':
      return brl(v)
    case 'brlCents':
      return brlCents(v)
    case 'pct':
      return pct(v)
    default:
      return num(v)
  }
}
