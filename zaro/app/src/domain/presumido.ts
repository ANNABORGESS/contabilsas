// Estimativa dos tributos do Lucro Presumido por trimestre, para conferência do contador.
// Presunção: 8% (IRPJ) e 12% (CSLL) para venda de produtos; 32% para serviços.
// IRPJ 15% + adicional de 10% sobre o que passar de R$ 60.000 no trimestre; CSLL 9%;
// PIS 0,65% e COFINS 3% (regime cumulativo), mensais sobre a receita bruta.
import { arred } from './dinheiro';

export interface ReceitaTrimestre {
  produtos: number;
  servicos: number;
}

export function tributosPresumido(r: ReceitaTrimestre) {
  const bruta = r.produtos + r.servicos;
  const baseIrpj = r.produtos * 0.08 + r.servicos * 0.32;
  const baseCsll = r.produtos * 0.12 + r.servicos * 0.32;
  const irpj = baseIrpj * 0.15 + Math.max(0, baseIrpj - 60000) * 0.1;
  const csll = baseCsll * 0.09;
  const pis = bruta * 0.0065;
  const cofins = bruta * 0.03;
  return {
    bruta: arred(bruta), baseIrpj: arred(baseIrpj), baseCsll: arred(baseCsll),
    irpj: arred(irpj), csll: arred(csll), pis: arred(pis), cofins: arred(cofins),
    total: arred(irpj + csll + pis + cofins),
  };
}
