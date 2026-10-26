// Dinheiro sempre em centavos inteiros: somar e multiplicar sem erro de arredondamento.

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function reais(centavos: number): string {
  return fmt.format(centavos / 100);
}

/** "12,50", "12.50", "R$ 1.234,56" ou 12.5 → centavos. Devolve null se não for um valor válido. */
export function paraCentavos(valor: string | number): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor * 100) : null;
  let s = valor.replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
