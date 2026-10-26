// Relatórios a partir dos pedidos. Vendas brutas incluem tudo o que foi confirmado;
// cancelamentos e estornos são mostrados à parte e descontados do líquido.
// Os valores são os informados pelos garçons: não substituem a conciliação com a adquirente.

export interface PedidoRel {
  id: string;
  numero: number;
  mesa: number;
  garcom: string;
  totalCentavos: number;
  formaPagamento: string;
  status: string; // pago | cancelado | estornado
  hora: number; // hora local do pagamento
  divergenciaPreco: boolean;
  itens: { nome: string; setor: string; quantidade: number; subtotalCentavos: number }[];
  preparos: { setor: string; criadoEm: Date; prontoEm: Date | null }[];
}

export interface Linha {
  chave: string;
  pedidos: number;
  quantidade: number;
  valorCentavos: number;
}

function somar(mapa: Map<string, Linha>, chave: string, valor: number, quantidade = 1) {
  const l = mapa.get(chave) || { chave, pedidos: 0, quantidade: 0, valorCentavos: 0 };
  l.pedidos += 1;
  l.quantidade += quantidade;
  l.valorCentavos += valor;
  mapa.set(chave, l);
}

const ordenar = (m: Map<string, Linha>) => [...m.values()].sort((a, b) => b.valorCentavos - a.valorCentavos || a.chave.localeCompare(b.chave));

export function resumir(pedidos: PedidoRel[]) {
  const validos = pedidos.filter((p) => p.status === 'pago');
  const encerrados = pedidos.filter((p) => p.status !== 'pago');
  const bruto = pedidos.reduce((a, p) => a + p.totalCentavos, 0);
  const cancelado = encerrados.filter((p) => p.status === 'cancelado').reduce((a, p) => a + p.totalCentavos, 0);
  const estornado = encerrados.filter((p) => p.status === 'estornado').reduce((a, p) => a + p.totalCentavos, 0);
  const liquido = bruto - cancelado - estornado;

  const porForma = new Map<string, Linha>();
  const porGarcom = new Map<string, Linha>();
  const porMesa = new Map<string, Linha>();
  const porProduto = new Map<string, Linha & { setor: string }>();
  const porHora = new Map<string, Linha>();
  for (const p of validos) {
    somar(porForma, p.formaPagamento, p.totalCentavos);
    somar(porGarcom, p.garcom, p.totalCentavos);
    somar(porMesa, String(p.mesa), p.totalCentavos);
    somar(porHora, String(p.hora).padStart(2, '0'), p.totalCentavos);
    for (const i of p.itens) {
      const l = porProduto.get(i.nome) || { chave: i.nome, setor: i.setor, pedidos: 0, quantidade: 0, valorCentavos: 0 };
      l.pedidos += 1;
      l.quantidade += i.quantidade;
      l.valorCentavos += i.subtotalCentavos;
      porProduto.set(i.nome, l);
    }
  }

  // tempo do pagamento ao "pronto", por setor (só preparos que ficaram prontos)
  const tempos: Record<string, number[]> = {};
  for (const p of validos)
    for (const pr of p.preparos)
      if (pr.prontoEm) (tempos[pr.setor] ||= []).push((pr.prontoEm.getTime() - pr.criadoEm.getTime()) / 60000);
  const tempoMedio = Object.fromEntries(Object.entries(tempos).map(([s, v]) => [s, Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 10) / 10]));

  return {
    pedidos: validos.length,
    encerrados: encerrados.length,
    brutoCentavos: bruto,
    canceladoCentavos: cancelado,
    estornadoCentavos: estornado,
    liquidoCentavos: liquido,
    ticketMedioCentavos: validos.length ? Math.round(liquido / validos.length) : 0,
    divergencias: validos.filter((p) => p.divergenciaPreco).length,
    porForma: ordenar(porForma),
    porGarcom: ordenar(porGarcom),
    porMesa: ordenar(porMesa),
    porHora: [...porHora.values()].sort((a, b) => a.chave.localeCompare(b.chave)),
    porProduto: [...porProduto.values()].sort((a, b) => b.quantidade - a.quantidade || b.valorCentavos - a.valorCentavos),
    tempoMedioMin: tempoMedio as Record<string, number>,
  };
}

export type Resumo = ReturnType<typeof resumir>;

/** CSV (separador ;) para abrir no Excel em português. */
export function csv(linhas: (string | number)[][]): string {
  const cel = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n');
}
