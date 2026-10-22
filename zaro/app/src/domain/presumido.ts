// Estimativa dos tributos do Lucro Presumido por trimestre, para conferência do contador
// (conferido com a skill 02-apuracao-lucro-presumido).
// Presunção: 8% (IRPJ) e 12% (CSLL) para comércio e indústria; 32% para serviços.
// IRPJ 15% + adicional de 10% sobre o que passar de R$ 60.000 de base no trimestre; CSLL 9%.
// Receitas financeiras entram direto na base, sem presunção. IRRF retido por terceiros é
// abatido do IRPJ. PIS 0,65% e COFINS 3% (cumulativo) sobre a receita bruta sem o ICMS
// destacado (Tema 69 do STF).
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
}

export function tributosPresumido(r: ReceitaTrimestre) {
  const bruta = r.produtos + r.servicos;
  const fin = r.financeiras || 0;
  const baseIrpj = r.produtos * 0.08 + r.servicos * 0.32 + fin;
  const baseCsll = r.produtos * 0.12 + r.servicos * 0.32 + fin;
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
