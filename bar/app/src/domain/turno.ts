// Data operacional: o turno de um bar passa da meia-noite. Uma venda às 2h da manhã de
// sábado pertence à noite de sexta. A virada do dia é configurável (padrão 6h).

export const FUSO_PADRAO = 'America/Sao_Paulo';
export const VIRADA_PADRAO = 6;

function partesLocais(d: Date, fuso: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  return { data: `${v('year')}-${v('month')}-${v('day')}`, hora: Number(v('hour')) };
}

function diaAnterior(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function dataOperacional(momento: Date, fuso = FUSO_PADRAO, virada = VIRADA_PADRAO): string {
  const { data, hora } = partesLocais(momento, fuso);
  return hora < virada ? diaAnterior(data) : data;
}

export function horaLocal(momento: Date, fuso = FUSO_PADRAO): number {
  return partesLocais(momento, fuso).hora;
}

export function dataValida(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
