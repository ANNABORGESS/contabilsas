// Utilitários de datas em formato ISO (YYYY-MM-DD) e mês (YYYY-MM), sem fuso horário.

export type ISODate = string
export type MonthKey = string

/** Data de referência dos dados fictícios (o "hoje" da demonstração). */
export const REF_DATE: ISODate = '2026-10-19'
export const DATA_START: ISODate = '2025-01-01'

export function toDate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

export function fromDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = toDate(d)
  dt.setUTCDate(dt.getUTCDate() + n)
  return fromDate(dt)
}

export function addMonths(d: ISODate, n: number): ISODate {
  const dt = toDate(d)
  const day = dt.getUTCDate()
  dt.setUTCDate(1)
  dt.setUTCMonth(dt.getUTCMonth() + n)
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  dt.setUTCDate(Math.min(day, last))
  return fromDate(dt)
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000)
}

export function monthOf(d: ISODate): MonthKey {
  return d.slice(0, 7)
}

export function monthStart(m: MonthKey): ISODate {
  return `${m}-01`
}

export function monthEnd(m: MonthKey): ISODate {
  const [y, mo] = m.split('-').map(Number)
  return fromDate(new Date(Date.UTC(y, mo, 0)))
}

export function addMonthKey(m: MonthKey, n: number): MonthKey {
  return monthOf(addMonths(monthStart(m), n))
}

export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  for (let m = from; m <= to; m = addMonthKey(m, 1)) out.push(m)
  return out
}

/** Todos os meses da série histórica da demonstração. */
export const ALL_MONTHS: MonthKey[] = monthRange(monthOf(DATA_START), monthOf(REF_DATE))

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function monthLabel(m: MonthKey): string {
  const [y, mo] = m.split('-').map(Number)
  return `${MESES[mo - 1]}/${String(y).slice(2)}`
}

export function dateLabel(d: ISODate): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function ageAt(birth: ISODate, at: ISODate): number {
  const b = toDate(birth)
  const a = toDate(at)
  let age = a.getUTCFullYear() - b.getUTCFullYear()
  const beforeBirthday =
    a.getUTCMonth() < b.getUTCMonth() ||
    (a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() < b.getUTCDate())
  if (beforeBirthday) age--
  return age
}

export function birthdayAt(birth: ISODate, age: number): ISODate {
  return addMonths(birth, age * 12)
}
