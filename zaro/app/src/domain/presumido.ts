// Estimativa dos tributos do Lucro Presumido por trimestre, para conferência do contador
// (conferido com a skill 02-apuracao-lucro-presumido).
// Presunção: 8% (IRPJ) e 12% (CSLL) para comércio e indústria; 32% para serviços.
// IRPJ 15% + adicional de 10% sobre o que passar de R$ 60.000 de base no trimestre; CSLL 9%.
// Receitas financeiras entram direto na base, sem presunção. IRRF retido por terceiros é
// abatido do IRPJ. PIS 0,65% e COFINS 3% (cumulativo) sobre a receita bruta sem o ICMS
// destacado (Tema 69 do STF).
// A partir de 2026 (LC 224/2025 e IN RFB 2.306/2026), a parte da receita bruta acima de R$ 5 milhões
// no ano tem presunção 10% maior (8% → 8,8%; 12% → 13,2%; 32% → 35,2%). Veja acrescimosLC224.
import { arred } from './dinheiro';

export interface ReceitaTrimestre {
  produtos: number;
  servicos: number;
  /** ICMS destacado nas notas de saída: sai da base de PIS/COFINS */
  icms?: number;
  /** receitas financeiras: somam direto na base de IRPJ e CSLL */
  financeiras?: number;
  /** IRRF retido pelos clientes: abate do IRPJ */
  irrfRetido?: number;
  /** base a mais da LC 224/2025 (pode ser negativa no ajuste anual do 4º trimestre) */
  acrescimoIrpj?: number;
  acrescimoCsll?: number;
}

export function tributosPresumido(r: ReceitaTrimestre) {
  const bruta = r.produtos + r.servicos;
  const fin = r.financeiras || 0;
  const baseIrpj = Math.max(0, r.produtos * 0.08 + r.servicos * 0.32 + fin + (r.acrescimoIrpj || 0));
  const baseCsll = Math.max(0, r.produtos * 0.12 + r.servicos * 0.32 + fin + (r.acrescimoCsll || 0));
  const irpjDevido = baseIrpj * 0.15 + Math.max(0, baseIrpj - 60000) * 0.1;
  const irpj = Math.max(0, irpjDevido - (r.irrfRetido || 0));
  const csll = baseCsll * 0.09;
  const basePisCofins = Math.max(0, bruta - (r.icms || 0));
  const pis = basePisCofins * 0.0065;
  const cofins = basePisCofins * 0.03;
  return {
    bruta: arred(bruta), baseIrpj: arred(baseIrpj), baseCsll: arred(baseCsll), basePisCofins: arred(basePisCofins),
    irpjDevido: arred(irpjDevido), irpj: arred(irpj), csll: arred(csll), pis: arred(pis), cofins: arred(cofins),
    total: arred(irpj + csll + pis + cofins),
  };
}

const LIMITE_TRIMESTRE = 1_250_000;
const PRESUNCAO = { irpj: { produtos: 0.08, servicos: 0.32 }, csll: { produtos: 0.12, servicos: 0.32 } };

/** Base a mais pela majoração de 10% sobre a receita excedente, repartida pela mistura produtos/serviços. */
function acrescimo(produtos: number, servicos: number, excedente: number, t: 'irpj' | 'csll') {
  const rb = produtos + servicos;
  if (!(rb > 0) || !excedente) return 0;
  return excedente * 0.1 * ((produtos / rb) * PRESUNCAO[t].produtos + (servicos / rb) * PRESUNCAO[t].servicos);
}

/**
 * Acréscimo de base da LC 224/2025 em cada trimestre do ano (IRPJ e CSLL).
 * - 1º a 3º trimestre: limite de R$ 1,25 mi por trimestre; a sobra não usada passa para o
 *   trimestre seguinte. O que passa do limite usa a presunção majorada.
 * - 4º trimestre: ajuste anual. Compara a receita do ano com o limite anual (R$ 5 mi), na
 *   mistura de produtos/serviços do ano, e lança a diferença do que já foi majorado (pode ser crédito).
 * - CSLL em 2026 só majora a partir do 2º trimestre (anterioridade nonagesimal); o limite anual
 *   dela fica em R$ 3,75 mi (2º a 4º trimestre). A cadeia de sobra é a mesma para os dois tributos.
 * Leitura igual à da calculadora "Lucro Presumido 2026" enviada pelo escritório; o texto legal
 * não fecha todos os pontos, então confira com o contador responsável.
 */
export function acrescimosLC224(ano: number, trimestres: { produtos: number; servicos: number }[]) {
  const zero = trimestres.map(() => ({ irpj: 0, csll: 0, excedente: 0 }));
  if (ano < 2026) return zero;
  const rb = trimestres.map((t) => t.produtos + t.servicos);
  const exc: number[] = [];
  let sub = LIMITE_TRIMESTRE;
  for (let q = 0; q < 3; q++) {
    exc.push(Math.max(0, (rb[q] || 0) - sub));
    sub = LIMITE_TRIMESTRE + Math.max(0, sub - (rb[q] || 0));
  }
  const serie = (t: 'irpj' | 'csll', desde: number) => {
    const r = [0, 1, 2].map((q) => (q >= desde && trimestres[q] ? acrescimo(trimestres[q].produtos, trimestres[q].servicos, exc[q], t) : 0));
    const faixa = trimestres.slice(desde, 4);
    const p = faixa.reduce((a, x) => a + x.produtos, 0);
    const s = faixa.reduce((a, x) => a + x.servicos, 0);
    const anual = acrescimo(p, s, Math.max(0, p + s - (4 - desde) * LIMITE_TRIMESTRE), t);
    r.push(anual - r.slice(desde).reduce((a, v) => a + v, 0));
    return r;
  };
  const irpj = serie('irpj', 0);
  const csll = serie('csll', ano === 2026 ? 1 : 0);
  return trimestres.map((_, q) => ({ irpj: arred(irpj[q]), csll: arred(csll[q]), excedente: arred(q < 3 ? exc[q] : 0) }));
}
