// Produtos vendidos sob encomenda: tirados dos itens das NFs de venda (Contas a Receber).
// A empresa não tem estoque: cada pedido é produzido e faturado; aqui só se vê o que já foi vendido.
import { arred } from './dinheiro';

export interface ItemVendido {
  desc: string;
  ncm: string;
  un: string;
  qtd: number;
  unit: number;
  total: number;
}

export interface NotaComItens {
  nf: string;
  chave: string;
  tipo: string; // NF-e ou NFS-e
  cliente: string;
  pedido: string;
  emissao: string;
  itens: ItemVendido[];
}

/** Separa o código do cliente/produto do nome: "04PRMC0003 - IMA NOS…" → código 04PRMC0003. */
export function separarCodigo(desc: string) {
  const d = desc.replace(/\s+/g, ' ').trim();
  const m = d.match(/^([A-Z0-9][A-Z0-9.\/]{5,})\s*-\s*(.+)$/i) || d.match(/^(\d{8,}[A-Z]\d+|9099990U\d+|0{6,}[A-Z0-9]+)\s+(.+)$/i);
  if (m && /\d/.test(m[1])) return { codigo: m[1].toUpperCase(), nome: m[2].trim() };
  return { codigo: '', nome: d };
}

/** Descrição de serviço da NFS-e sem o ruído de quantidade, valor, pedido e banco. */
export function limparDescServico(desc: string) {
  let d = desc.replace(/\s+/g, ' ').trim();
  d = d.split(/\s*-?\s*(?:QUANT|QTD|UND|UN:|VLR|V\. UNIT|N[°º] PEDIDO|ORÇAMENTO|COND\. PG)|,\s*obs\.?:/i)[0];
  const cod = d.match(/C[ÓO]D(?:\. PROD\.)?:\s*([A-Z0-9]+)\s*-\s*(.+)/i) || d.match(/PROD:\s*([A-Z0-9]+)\s*-\s*DESCRI[ÇC][ÃA]O:\s*(.+)/i) || d.match(/ITEM:\s*([A-Z0-9]*[A-Z][A-Z0-9]*)\s*-\s*(.+)/i);
  if (cod) return `${cod[1].toUpperCase()} - ${cod[2].trim().replace(/\s*-\s*$/, '')}`;
  return d.replace(/^ITEM:?\s*[\d/]+\s*-\s*/i, '').replace(/\s*-\s*$/, '');
}

const chaveProduto = (desc: string) => {
  const { codigo, nome } = separarCodigo(desc);
  return codigo || nome.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
};

export interface ProdutoVendido {
  chave: string;
  codigo: string;
  nome: string;
  servico: boolean;
  ncm: string;
  un: string;
  qtd: number;
  total: number;
  precoMedio: number;
  ultimoPreco: number;
  ultimaVenda: string;
  clientes: string[];
  pedidos: string[];
  nfs: string[];
}

/** Agrupa os itens das notas por produto (código do cliente quando há, senão o nome). */
export function produtosVendidos(notas: NotaComItens[]): ProdutoVendido[] {
  const mapa = new Map<string, ProdutoVendido>();
  const ordenadas = [...notas].sort((a, b) => a.emissao.localeCompare(b.emissao));
  for (const n of ordenadas) {
    const servico = /NFS/i.test(n.tipo);
    for (const i of n.itens) {
      const desc = servico ? limparDescServico(i.desc) : i.desc;
      const k = chaveProduto(desc);
      if (!k) continue;
      const { codigo, nome } = separarCodigo(desc);
      const p = mapa.get(k) || { chave: k, codigo, nome, servico, ncm: i.ncm || '', un: i.un || '', qtd: 0, total: 0, precoMedio: 0, ultimoPreco: 0, ultimaVenda: '', clientes: [], pedidos: [], nfs: [] };
      p.qtd = arred(p.qtd + i.qtd);
      p.total = arred(p.total + i.total);
      p.ultimoPreco = i.unit || (i.qtd ? arred(i.total / i.qtd) : 0);
      p.ultimaVenda = n.emissao;
      if (nome.length > p.nome.length) p.nome = nome;
      if (!p.clientes.includes(n.cliente)) p.clientes.push(n.cliente);
      if (n.pedido && !p.pedidos.includes(n.pedido)) p.pedidos.push(n.pedido);
      if (!p.nfs.includes(n.nf)) p.nfs.push(n.nf);
      mapa.set(k, p);
    }
  }
  return [...mapa.values()].map((p) => ({ ...p, precoMedio: p.qtd ? arred(p.total / p.qtd) : 0 })).sort((a, b) => b.total - a.total);
}
