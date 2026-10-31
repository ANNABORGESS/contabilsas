// Relatórios e visão geral do turno.
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { resumir, type PedidoRel } from '@/domain/relatorio';
import { horaLocal } from '@/domain/turno';
import { FUSO } from './config';
import { listarPedidos, type PedidoLista } from './pedidos';

export function paraRelatorio(lista: PedidoLista[]): PedidoRel[] {
  return lista.map((p) => ({
    id: p.id,
    numero: p.numero,
    mesa: p.mesa,
    garcom: p.garcom,
    totalCentavos: p.totalCentavos,
    itensCanceladosCentavos: p.itensCanceladosCentavos,
    formaPagamento: p.formaPagamento,
    status: p.status,
    hora: horaLocal(new Date(p.pagoEm), FUSO),
    divergenciaPreco: p.divergenciaPreco,
    itens: p.itens,
    preparos: p.preparos.map((x) => ({ setor: x.setor, criadoEm: new Date(x.criadoEm), prontoEm: x.prontoEm ? new Date(x.prontoEm) : null })),
  }));
}

export async function relatorio(db: Db, de: string, ate: string) {
  const lista = await listarPedidos(db, { de, ate, limite: 5000 });
  return { de, ate, resumo: resumir(paraRelatorio(lista)), pedidos: lista.length };
}

/** Situação de cada mesa no turno: pedidos, valor e o que está em preparo ou pronto. */
export async function mesasDoTurno(db: Db, data: string) {
  const [mesas, pedidos] = await Promise.all([
    db.select().from(schema.mesas).where(eq(schema.mesas.ativa, true)).orderBy(schema.mesas.numero),
    listarPedidos(db, { de: data, ate: data, limite: 5000 }),
  ]);
  return mesas.map((m) => {
    const dela = pedidos.filter((p) => p.mesaId === m.id);
    const pagos = dela.filter((p) => p.status === 'pago');
    const prs = pagos.flatMap((p) => p.preparos);
    return {
      id: m.id,
      numero: m.numero,
      nome: m.nome,
      pedidos: pagos.length,
      totalCentavos: pagos.reduce((a, p) => a + p.liquidoCentavos, 0),
      ultimoEm: dela[0]?.pagoEm ?? null,
      // nomes dos clientes dos pedidos do turno, do mais recente para o mais antigo
      clientes: [...new Set(pagos.map((p) => p.cliente).filter((c): c is string => !!c))],
      emPreparo: prs.filter((x) => x.status === 'novo' || x.status === 'preparando').length,
      prontos: prs.filter((x) => x.status === 'pronto').length,
    };
  });
}

export async function visaoGeral(db: Db, data: string) {
  const [rel, fila, pendentes] = await Promise.all([
    relatorio(db, data, data),
    db
      .select({ setor: schema.preparos.setor, status: schema.preparos.status, n: sql<number>`count(*)::int` })
      .from(schema.preparos)
      .innerJoin(schema.pedidos, eq(schema.pedidos.id, schema.preparos.pedidoId))
      .where(and(inArray(schema.preparos.status, ['novo', 'preparando', 'pronto']), eq(schema.pedidos.status, 'pago')))
      .groupBy(schema.preparos.setor, schema.preparos.status),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.solicitacoes).where(eq(schema.solicitacoes.status, 'pendente')),
  ]);
  const contar = (setor: string, status: string) => Number(fila.find((f) => f.setor === setor && f.status === status)?.n ?? 0);
  return {
    data,
    resumo: rel.resumo,
    fila: {
      cozinha: { novo: contar('cozinha', 'novo'), preparando: contar('cozinha', 'preparando'), pronto: contar('cozinha', 'pronto') },
      bar: { novo: contar('bar', 'novo'), preparando: contar('bar', 'preparando'), pronto: contar('bar', 'pronto') },
    },
    solicitacoesPendentes: Number(pendentes[0]?.n ?? 0),
  };
}
