// Valores em reais. Todo cálculo que divide valores passa por centavos para não perder 1 centavo.

export const centavos = (v: number) => Math.round(v * 100);
export const reais = (c: number) => c / 100;
export const arred = (v: number) => Math.round(v * 100) / 100;

/** Divide um total em n parcelas iguais; a diferença de centavos fica na última. */
export function dividir(total: number, n: number): number[] {
  if (n <= 0) return [];
  const c = centavos(total);
  const base = Math.floor(c / n);
  return Array.from({ length: n }, (_, i) => reais(base + (i === n - 1 ? c - base * n : 0)));
}

export const brl = (v: number | null | undefined) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1.234,56" ou "1234.56" → 1234.56 */
export function numero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export function addDias(iso: string, dias: number): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const dataBr = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

export function formatarCnpj(v: unknown): string {
  const d = soDigitos(v);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return String(v ?? '');
}
