// Painéis da cozinha e do bar e o aviso de "pronto" para o garçom.
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { NOME_SETOR, type Setor } from '@/domain/pedido';
import { NOME_STATUS, ehStatusPreparo, podeMudarStatus, type StatusPreparo } from '@/domain/preparo';
import type { Usuario } from './auth';
import { ErroRegra } from './erros';
import { registrar } from './eventos';

/** Pedidos pagos do setor: na fila, em preparo e prontos aguardando o garçom (mais antigos primeiro). */
export async function painelSetor(db: Db, setor: Setor) {
  const lista = await db
    .select({
      id: schema.preparos.id,
      status: schema.preparos.status,
      criadoEm: schema.preparos.criadoEm,
      iniciadoEm: schema.preparos.iniciadoEm,
      prontoEm: schema.preparos.prontoEm,
      pedidoId: schema.pedidos.id,
      numero: schema.pedidos.numero,
      mesa: schema.mesas.numero,
      garcom: schema.usuarios.nome,
      observacao: schema.pedidos.observacao,
      cliente: schema.pedidos.cliente,
    })
    .from(schema.preparos)
    .innerJoin(schema.pedidos, eq(schema.pedidos.id, schema.preparos.pedidoId))
    .innerJoin(schema.mesas, eq(schema.mesas.id, schema.pedidos.mesaId))
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.pedidos.garcomId))
    .where(and(eq(schema.preparos.setor, setor), inArray(schema.preparos.status, ['novo', 'preparando', 'pronto']), eq(schema.pedidos.status, 'pago')))
    .orderBy(asc(schema.preparos.criadoEm));
  const ids = lista.map((p) => p.pedidoId);
  const itens = ids.length
    ? await db.select().from(schema.pedidoItens).where(and(inArray(schema.pedidoItens.pedidoId, ids), eq(schema.pedidoItens.setor, setor))).orderBy(asc(schema.pedidoItens.nome))
    : [];
  // entregues nos últimos 30 minutos, para conferência
  const recentes = await db
    .select({ id: schema.preparos.id, numero: schema.pedidos.numero, mesa: schema.mesas.numero, entregueEm: schema.preparos.entregueEm })
    .from(schema.preparos)
    .innerJoin(schema.pedidos, eq(schema.pedidos.id, schema.preparos.pedidoId))
    .innerJoin(schema.mesas, eq(schema.mesas.id, schema.pedidos.mesaId))
    .where(and(eq(schema.preparos.setor, setor), eq(schema.preparos.status, 'entregue'), sql`${schema.preparos.entregueEm} > now() - interval '30 minutes'`))
    .orderBy(sql`${schema.preparos.entregueEm} desc`)
    .limit(12);
  return {
    setor,
    agora: new Date(),
    preparos: lista.map((p) => ({ ...p, itens: itens.filter((i) => i.pedidoId === p.pedidoId).map((i) => ({ nome: i.nome, quantidade: i.quantidade })) })),
    recentes,
  };
}

export async function mudarStatus(db: Db, u: Usuario, preparoId: string, para: unknown) {
  if (!ehStatusPreparo(para)) throw new ErroRegra('Status inválido.');
  if (!/^[0-9a-f-]{36}$/i.test(preparoId)) throw new ErroRegra('Preparo não encontrado.', 404);
  const [atual] = await db
    .select({ preparo: schema.preparos, numero: schema.pedidos.numero, statusPedido: schema.pedidos.status, mesa: schema.mesas.numero })
    .from(schema.preparos)
    .innerJoin(schema.pedidos, eq(schema.pedidos.id, schema.preparos.pedidoId))
    .innerJoin(schema.mesas, eq(schema.mesas.id, schema.pedidos.mesaId))
    .where(eq(schema.preparos.id, preparoId));
  if (!atual) throw new ErroRegra('Preparo não encontrado.', 404);
  const de = atual.preparo.status as StatusPreparo;
  const setor = atual.preparo.setor as Setor;
  if (atual.statusPedido !== 'pago') throw new ErroRegra('Este pedido foi cancelado.', 409);
  if (de === para) return; // toque repetido: nada a fazer
  if (!podeMudarStatus(de, para, u.papel, setor)) throw new ErroRegra(`Não é possível passar de "${NOME_STATUS[de]}" para "${NOME_STATUS[para]}".`, 409);
  const agora = new Date();
  const campos: Partial<typeof schema.preparos.$inferInsert> = { status: para };
  if (para === 'preparando') campos.iniciadoEm = atual.preparo.iniciadoEm ?? agora;
  if (para === 'pronto') campos.prontoEm = agora;
  if (para === 'novo') campos.iniciadoEm = null;
  if (para === 'preparando' && de === 'pronto') campos.prontoEm = null;
  if (para === 'entregue') campos.entregueEm = agora;
  await db.transaction(async (tx) => {
    // só muda se ninguém mudou antes (dois toques em aparelhos diferentes)
    const r = await tx.update(schema.preparos).set(campos).where(and(eq(schema.preparos.id, preparoId), eq(schema.preparos.status, de))).returning({ id: schema.preparos.id });
    if (!r.length) throw new ErroRegra('Este pedido acabou de ser atualizado em outro aparelho.', 409);
    await registrar(tx as unknown as Db, {
      tipo: `preparo_${para}`,
      pedidoId: atual.preparo.pedidoId,
      usuarioId: u.id,
      descricao: `${NOME_SETOR[setor]}: pedido #${atual.numero} (mesa ${atual.mesa}) ${NOME_STATUS[para].toLowerCase()} por ${u.nome}`,
    });
  });
}

/** Itens prontos esperando entrega (para o celular do garçom avisar). */
export async function prontosParaEntrega(db: Db) {
  return db
    .select({
      id: schema.preparos.id,
      setor: schema.preparos.setor,
      prontoEm: schema.preparos.prontoEm,
      pedidoId: schema.pedidos.id,
      numero: schema.pedidos.numero,
      mesa: schema.mesas.numero,
      cliente: schema.pedidos.cliente,
      garcomId: schema.pedidos.garcomId,
    })
    .from(schema.preparos)
    .innerJoin(schema.pedidos, eq(schema.pedidos.id, schema.preparos.pedidoId))
    .innerJoin(schema.mesas, eq(schema.mesas.id, schema.pedidos.mesaId))
    .where(and(eq(schema.preparos.status, 'pronto'), ne(schema.pedidos.status, 'cancelado'), ne(schema.pedidos.status, 'estornado')))
    .orderBy(asc(schema.preparos.prontoEm));
}
