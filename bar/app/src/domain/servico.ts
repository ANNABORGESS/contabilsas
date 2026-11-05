// Taxa de serviço do garçom: 10%, opcional (o cliente pode não pagar). Vem marcada na hora de
// cobrar e o garçom tira se o cliente recusar. Couver artístico não entra na base dos 10%.
// A taxa é do garçom: entra no que foi cobrado (caixa e maquininha), mas não no faturamento do bar.

export const TAXA_SERVICO = 0.1;
/** Desligada a pedido da administração: o garçom não cobra os 10%. */
export const TAXA_SERVICO_LIGADA = false;

/** Item entra na base da taxa? Couver não. */
export function entraNaTaxa(nome: string, categoria?: string | null) {
  return !/couver/i.test(`${nome} ${categoria ?? ''}`);
}

export const taxaDe = (baseCentavos: number) => Math.round(baseCentavos * TAXA_SERVICO);

/** 10% sobre os itens que entram na base. */
export function taxaServico(linhas: { nome: string; subtotalCentavos: number; categoria?: string | null }[]) {
  return taxaDe(linhas.filter((l) => entraNaTaxa(l.nome, l.categoria)).reduce((a, l) => a + l.subtotalCentavos, 0));
}
