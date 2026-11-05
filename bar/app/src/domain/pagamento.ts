// Pagamento do pedido: um só (a forma informada) ou a conta dividida em várias partes, cada uma
// com sua forma (ex.: dois cartões, metade Pix e metade dinheiro). A soma tem que fechar o total.
import { FORMAS_PAGAMENTO, NOME_FORMA, ehFormaPagamento, type FormaPagamento } from './pedido';

export interface ParteNova {
  forma: FormaPagamento;
  valorCentavos: number;
  pessoa: string | null;
}

export const MAX_PARTES = 20;
export class ErroPagamento extends Error {}

/** Valida as partes da conta dividida: formas válidas, valores positivos e soma igual ao total. */
export function validarPartes(partes: unknown, totalCentavos: number): ParteNova[] {
  if (!Array.isArray(partes) || partes.length === 0) throw new ErroPagamento('Informe como a conta foi paga.');
  if (partes.length > MAX_PARTES) throw new ErroPagamento(`Divida em no máximo ${MAX_PARTES} partes.`);
  const r = partes.map((p) => {
    const x = (p || {}) as { forma?: unknown; valorCentavos?: unknown; pessoa?: unknown };
    if (!ehFormaPagamento(x.forma)) throw new ErroPagamento('Escolha a forma de pagamento de cada parte.');
    const v = Number(x.valorCentavos);
    if (!Number.isInteger(v) || v <= 0) throw new ErroPagamento('Cada parte precisa de um valor maior que zero.');
    const pessoa = typeof x.pessoa === 'string' ? x.pessoa.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    return { forma: x.forma, valorCentavos: v, pessoa: pessoa || null };
  });
  const soma = r.reduce((a, p) => a + p.valorCentavos, 0);
  if (soma !== totalCentavos) throw new ErroPagamento(soma < totalCentavos ? 'As partes não fecham o total: ainda falta valor.' : 'As partes passam do total da conta.');
  return r;
}

/** Forma que aparece no pedido: a única usada, ou "dividido" quando há mais de uma parte. */
export function formaDoPedido(partes: { forma: string }[]): string {
  return partes.length === 1 ? partes[0].forma : 'dividido';
}

export function nomeForma(f: string): string {
  return f === 'dividido' ? 'Dividido' : (NOME_FORMA[f as FormaPagamento] ?? f);
}

/** Divide o total igualmente em n partes (os centavos que sobram vão para as primeiras). */
export function dividirIgual(totalCentavos: number, n: number): number[] {
  const k = Math.max(1, Math.min(MAX_PARTES, Math.floor(n)));
  const base = Math.floor(totalCentavos / k);
  const resto = totalCentavos - base * k;
  return Array.from({ length: k }, (_, i) => base + (i < resto ? 1 : 0));
}

/**
 * O que vale de cada forma depois dos itens cancelados: o valor que ficou é repartido entre as
 * partes na proporção do que cada uma pagou (o centavo que sobra fica na última).
 */
export function valendoPorForma(partes: { forma: string; valorCentavos: number }[], totalCentavos: number, liquidoCentavos: number) {
  if (!partes.length || totalCentavos <= 0) return [];
  let usado = 0;
  return partes.map((p, i) => {
    const v = i === partes.length - 1 ? liquidoCentavos - usado : Math.round((p.valorCentavos * liquidoCentavos) / totalCentavos);
    usado += v;
    return { forma: p.forma, valorCentavos: v };
  });
}

/** Soma por forma (débito, crédito, pix, dinheiro). */
export function somarPorForma(linhas: { forma: string; valorCentavos: number }[]): Record<FormaPagamento, number> {
  const r = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f, 0])) as Record<FormaPagamento, number>;
  for (const l of linhas) if (ehFormaPagamento(l.forma)) r[l.forma] += l.valorCentavos;
  return r;
}

/**
 * Fechamento de caixa: em cada forma, o esperado (sistema; no dinheiro soma o troco inicial) contra o
 * conferido (dinheiro contado na gaveta, relatório da maquininha). Diferença positiva = sobrou.
 */
export function conferirCaixa(sistema: Record<FormaPagamento, number>, conferido: Partial<Record<FormaPagamento, number>>, trocoInicialCentavos: number) {
  const linhas = FORMAS_PAGAMENTO.map((f) => {
    const esperado = sistema[f] + (f === 'dinheiro' ? trocoInicialCentavos : 0);
    const contado = conferido[f];
    return { forma: f, sistema: sistema[f], esperado, conferido: contado ?? null, diferenca: contado === undefined ? null : contado - esperado };
  });
  const comConferencia = linhas.filter((l) => l.diferenca !== null);
  return { linhas, diferencaTotal: comConferencia.reduce((a, l) => a + (l.diferenca as number), 0), conferidas: comConferencia.length };
}
