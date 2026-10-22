// Regime tributário por vigência. Uma empresa pode mudar de regime (ex.: A B S saiu do
// Simples em 31/12/2025 e está no Lucro Presumido desde 01/01/2026). Todo cálculo fiscal
// pergunta o regime da data da competência, nunca o regime "atual".

export type Regime = 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real' | 'MEI' | string;

export interface PeriodoRegime {
  regime: Regime;
  de?: string | null; // ISO yyyy-mm-dd, inclusive
  ate?: string | null; // ISO yyyy-mm-dd, inclusive
  fonte?: string;
}

export interface EmpresaComRegime {
  regime?: string | null;
  regimeHist?: PeriodoRegime[] | null;
}

export function regimeEm(empresa: EmpresaComRegime | null | undefined, data?: string): Regime {
  const e = empresa || {};
  const d = String(data || new Date().toISOString()).slice(0, 10);
  const p = (e.regimeHist || []).find((x) => (!x.de || d >= x.de) && (!x.ate || d <= x.ate));
  return p ? p.regime : e.regime || '';
}

export const ehSimples = (empresa: EmpresaComRegime | null | undefined, data?: string) =>
  /simples/i.test(regimeEm(empresa, data));

/** Competência "2026-03" → data usada para decidir o regime (meio do mês). */
export const dataDaCompetencia = (comp: string) => `${comp.slice(0, 7)}-15`;
