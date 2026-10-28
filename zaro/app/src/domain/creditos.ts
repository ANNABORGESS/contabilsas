// Impostos a recuperar: lê cada item das NF de compra e decide se o ICMS/IPI destacado vira crédito.
// Regra geral (LC 87/96): insumo e matéria-prima creditam; uso e consumo não (art. 33, I, só a partir de 2033);
// imobilizado credita em 1/48 por mês no CIAP; ST não credita; empresa do Simples não credita.
// O que não dá para decidir pelo NCM/CFOP fica "a confirmar" e só credita depois da decisão do contador.
import { arred } from './dinheiro';
import type { ItemNF } from './nfe';

export type ClasseItem = 'insumo' | 'uso_consumo' | 'imobilizado' | 'st' | 'devolucao' | 'remessa' | 'simples' | 'sem_destaque' | 'a_confirmar';

export const NOME_CLASSE: Record<ClasseItem, string> = {
  insumo: 'Insumo / matéria-prima',
  uso_consumo: 'Uso e consumo',
  imobilizado: 'Imobilizado (CIAP)',
  st: 'Substituição tributária',
  devolucao: 'Devolução de venda',
  remessa: 'Remessa / retorno',
  simples: 'Compra no Simples Nacional',
  sem_destaque: 'Sem imposto destacado',
  a_confirmar: 'A confirmar',
};

export type Decisao = 'credita' | 'nao';

export interface ConfigCreditos {
  /** empresa contribuinte do IPI (industrial ou equiparada): credita o IPI das compras de insumo */
  contribuinteIpi?: boolean;
  /** decisões do contador: por item ("<documento>|<n>") ou por NCM ("ncm:<ncm>") */
  decisoes?: Record<string, Decisao>;
}

export interface ItemCredito {
  chave: string;
  n: number;
  desc: string;
  ncm: string;
  cfop: string;
  cst: string;
  total: number;
  icms: number;
  ipi: number;
  classe: ClasseItem;
  motivo: string;
  /** null = a confirmar */
  credita: boolean | null;
  decididoPor?: 'item' | 'ncm';
  credIcms: number;
  credIpi: number;
}

const final3 = (cfop: string) => String(cfop || '').replace(/\D/g, '').slice(1);
const USO_CONSUMO_TEXTO = /\b(luvas?|botas?|botina|flanela|desinfetante|detergente|sab[aã]o|papel higi|papel toalha|copos?|caf[eé]|a[cç][uú]car|uniformes?|camis[ae]|cal[cç]a|epi|[oó]culos|protetor auricular|vassoura|rodo|limpeza|escrit[oó]rio|caneta|toner|cartucho|lanche|refei[cç][aã]o|[aá]gua mineral|g[aá]s de cozinha|saco de lixo|odoriz\w*)\b/i;
// podem ser obra/instalação da fábrica (imobilizado) ou material de uma encomenda (insumo): só o contador sabe
const OBRA_OU_ENCOMENDA = /\b(reservat[oó]rio|telhas?|caixa d.?[aá]gua|estrutura met[aá]lica)\b/i;

/** Classe do item pela operação (CFOP/CST), pelo NCM e pela descrição. Não olha a decisão do contador. */
export function classificarItem(it: Pick<ItemNF, 'desc' | 'ncm' | 'cfop' | 'cst' | 'unit' | 'icms' | 'ipi'>, simples: boolean): { classe: ClasseItem; motivo: string; credita: boolean | null } {
  const c = final3(it.cfop);
  const ncm = String(it.ncm || '').replace(/\D/g, '');
  const cst = String(it.cst || '');
  if (simples) return { classe: 'simples', motivo: 'Na data da compra a empresa estava no Simples Nacional: não se aproveita crédito de ICMS/IPI', credita: false };
  if (!((it.icms || 0) > 0 || (it.ipi || 0) > 0)) return { classe: 'sem_destaque', motivo: 'Sem ICMS ou IPI destacado no item', credita: false };
  if (['401', '403', '405'].includes(c) || ['10', '30', '60', '70', '201', '202', '203', '500'].includes(cst)) {
    return { classe: 'st', motivo: `CFOP ${it.cfop}${cst ? ` / CST ${cst}` : ''}: ICMS cobrado por substituição tributária, sem crédito na compra`, credita: false };
  }
  if (['201', '202', '410', '411'].includes(c)) return { classe: 'devolucao', motivo: `CFOP ${it.cfop}: devolução de mercadoria vendida, recupera o ICMS da venda`, credita: true };
  if (c.startsWith('9')) return { classe: 'remessa', motivo: `CFOP ${it.cfop}: remessa, retorno ou outra saída; confira se o imposto destacado é creditável`, credita: null };
  if (['551', '552', '553'].includes(c)) return { classe: 'imobilizado', motivo: `CFOP ${it.cfop}: venda de bem do ativo; crédito em 48 meses (CIAP)`, credita: false };
  if (OBRA_OU_ENCOMENDA.test(it.desc || '')) return { classe: 'a_confirmar', motivo: 'Pode ser obra ou instalação da própria fábrica (imobilizado, sem crédito integral) ou material de uma encomenda (insumo, credita)', credita: null };
  const cap = Number(ncm.slice(0, 2));
  if (USO_CONSUMO_TEXTO.test(it.desc || '') || (cap >= 1 && cap <= 24) || (cap >= 61 && cap <= 65) || /^(3401|3402|3808|4818|4015|4820|9608)/.test(ncm)) {
    return { classe: 'uso_consumo', motivo: 'Material de uso e consumo: sem crédito de ICMS até 2033 (LC 87/96, art. 33, I)', credita: false };
  }
  if ((/^(84|85|90)/.test(ncm) && (it.unit || 0) >= 1200) || /^9403/.test(ncm)) {
    return { classe: 'imobilizado', motivo: 'Máquina, equipamento ou móvel: é imobilizado; o ICMS credita 1/48 por mês no CIAP (controle à parte)', credita: false };
  }
  if (/^(39|40|48|72|73|74|75|76|78|79|80|81|83)/.test(ncm) || /^(3403|3810|3814|7010)/.test(ncm)) {
    return { classe: 'insumo', motivo: `NCM ${it.ncm}: matéria-prima, material de embalagem ou insumo da produção`, credita: true };
  }
  return { classe: 'a_confirmar', motivo: `NCM ${it.ncm || 'não informado'}: não dá para saber pelo código se é insumo ou uso e consumo`, credita: null };
}

/** Créditos de uma NF de compra, item a item, com as decisões do contador aplicadas. */
export function creditosDaNota(documento: string, itens: ItemNF[], ctx: { simples: boolean; config?: ConfigCreditos }) {
  const dec = ctx.config?.decisoes || {};
  const ipiOk = !!ctx.config?.contribuinteIpi;
  const linhas: ItemCredito[] = itens.map((it, n) => {
    const chave = `${documento}|${n}`;
    const auto = classificarItem(it, ctx.simples);
    const ncm = String(it.ncm || '').replace(/\D/g, '');
    const porItem = dec[chave];
    const porNcm = ncm ? dec[`ncm:${ncm}`] : undefined;
    // no Simples e sem imposto destacado não há o que decidir
    const decidivel = auto.classe !== 'simples' && auto.classe !== 'sem_destaque';
    const escolha = decidivel ? porItem || porNcm : undefined;
    const credita = escolha ? escolha === 'credita' : auto.credita;
    const icms = arred(it.icms || 0);
    const ipi = arred(it.ipi || 0);
    return {
      chave, n, desc: it.desc, ncm: it.ncm, cfop: it.cfop, cst: it.cst || '', total: it.total, icms, ipi,
      classe: auto.classe, motivo: auto.motivo, credita, decididoPor: escolha ? (porItem ? 'item' : 'ncm') : undefined,
      credIcms: credita ? icms : 0, credIpi: credita && ipiOk ? ipi : 0,
    };
  });
  return {
    itens: linhas,
    icms: arred(linhas.reduce((a, l) => a + l.credIcms, 0)),
    ipi: arred(linhas.reduce((a, l) => a + l.credIpi, 0)),
    aConfirmar: linhas.filter((l) => l.credita === null).length,
  };
}

export interface MesApuracao {
  comp: string;
  debito: number;
  credito: number;
  saldoAnterior: number;
  compensado: number;
  aRecolher: number;
  saldoCredor: number;
}

/** Apuração mensal do ICMS: débito das vendas menos créditos das compras; o que sobra de crédito passa para o mês seguinte. */
export function apuracaoIcms(debitos: Record<string, number>, creditos: Record<string, number>): MesApuracao[] {
  const comps = [...new Set([...Object.keys(debitos), ...Object.keys(creditos)])].sort();
  let saldo = 0;
  return comps.map((comp) => {
    const debito = arred(debitos[comp] || 0);
    const credito = arred(creditos[comp] || 0);
    const disponivel = arred(saldo + credito);
    const compensado = arred(Math.min(debito, disponivel));
    const linha = { comp, debito, credito, saldoAnterior: saldo, compensado, aRecolher: arred(debito - compensado), saldoCredor: arred(disponivel - compensado) };
    saldo = linha.saldoCredor;
    return linha;
  });
}
