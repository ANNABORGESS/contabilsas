// Cancelamento e estorno: o garçom só pode pedir; quem decide é o administrador.
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { ErroCancelamento, NOME_ENCERRAMENTO, conferirEncerramento, tipoEncerramento, validarMotivo } from '@/domain/cancelamento';
import { reais } from '@/domain/dinheiro';
import type { StatusPreparo } from '@/domain/preparo';
import type { Usuario } from './auth';
import { ErroRegra } from './erros';
import { registrar } from './eventos';

const regra = <T>(f: () => T): T => {
  try {
    return f();
  } catch (e) {
    if (e instanceof ErroCancelamento) throw new ErroRegra(e.message, 409);
    throw e;
  }
};

async function pedido(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroRegra('Pedido não encontrado.', 404);
  const [p] = await db.select().from(schema.pedidos).where(eq(schema.pedidos.id, id));
  if (!p) throw new ErroRegra('Pedido não encontrado.', 404);
  return p;
}

export async function solicitar(db: Db, u: Usuario, pedidoId: string, motivoBruto: unknown) {
  const motivo = regra(() => validarMotivo(motivoBruto));
  const p = await pedido(db, pedidoId);
  if (p.status !== 'pago') throw new ErroRegra('Este pedido já foi cancelado ou estornado.', 409);
  const [pendente] = await db.select().from(schema.solicitacoes).where(and(eq(schema.solicitacoes.pedidoId, p.id), eq(schema.solicitacoes.status, 'pendente')));
  if (pendente) return pendente;
  return db.transaction(async (tx) => {
    const [s] = await tx.insert(schema.solicitacoes).values({ pedidoId: p.id, solicitanteId: u.id, motivo }).returning();
    await registrar(tx as unknown as Db, { tipo: 'cancelamento_solicitado', pedidoId: p.id, usuarioId: u.id, descricao: `${u.nome} pediu o cancelamento do pedido #${p.numero}: ${motivo}` });
    return s;
  });
}

/** Cancela (nada preparado) ou estorna (já preparado). Só o administrador. */
export async function encerrar(db: Db, u: Usuario, pedidoId: string, motivoBruto: unknown, solicitacaoId?: string) {
  const motivo = regra(() => validarMotivo(motivoBruto));
  const p = await pedido(db, pedidoId);
  regra(() => conferirEncerramento(u.papel, p.status));
  const prs = await db.select().from(schema.preparos).where(eq(schema.preparos.pedidoId, p.id));
  const tipo = tipoEncerramento(prs.map((x) => x.status as StatusPreparo));
  const agora = new Date();
  await db.transaction(async (tx) => {
    const r = await tx
      .update(schema.pedidos)
      .set({ status: tipo, encerradoPorId: u.id, encerradoEm: agora, motivoEncerramento: motivo })
      .where(and(eq(schema.pedidos.id, p.id), eq(schema.pedidos.status, 'pago')))
      .returning({ id: schema.pedidos.id });
    if (!r.length) throw new ErroRegra('Este pedido já foi cancelado ou estornado.', 409);
    // tira dos painéis o que ainda não foi entregue
    await tx
      .update(schema.preparos)
      .set({ status: 'cancelado' })
      .where(and(eq(schema.preparos.pedidoId, p.id), inArray(schema.preparos.status, ['novo', 'preparando', 'pronto'])));
    await tx
      .update(schema.solicitacoes)
      .set({ status: 'aprovada', decididoPorId: u.id, decididoEm: agora })
      .where(and(eq(schema.solicitacoes.pedidoId, p.id), eq(schema.solicitacoes.status, 'pendente')));
    await registrar(tx as unknown as Db, {
      tipo: tipo === 'cancelado' ? 'pedido_cancelado' : 'pedido_estornado',
      pedidoId: p.id,
      usuarioId: u.id,
      descricao: `${NOME_ENCERRAMENTO[tipo]} do pedido #${p.numero} (${reais(p.totalCentavos)}) autorizado por ${u.nome}: ${motivo}. Devolver o valor na maquininha.`,
      dados: { solicitacaoId: solicitacaoId ?? null },
    });
  });
  return { tipo };
}

export async function recusar(db: Db, u: Usuario, solicitacaoId: string) {
  if (u.papel !== 'admin') throw new ErroRegra('Só o administrador decide cancelamentos.', 403);
  if (!/^[0-9a-f-]{36}$/i.test(solicitacaoId)) throw new ErroRegra('Solicitação não encontrada.', 404);
  await db.transaction(async (tx) => {
    const [s] = await tx
      .update(schema.solicitacoes)
      .set({ status: 'recusada', decididoPorId: u.id, decididoEm: new Date() })
      .where(and(eq(schema.solicitacoes.id, solicitacaoId), eq(schema.solicitacoes.status, 'pendente')))
      .returning();
    if (!s) throw new ErroRegra('Esta solicitação já foi decidida.', 409);
    const [p] = await tx.select({ numero: schema.pedidos.numero }).from(schema.pedidos).where(eq(schema.pedidos.id, s.pedidoId));
    await registrar(tx as unknown as Db, { tipo: 'cancelamento_recusado', pedidoId: s.pedidoId, usuarioId: u.id, descricao: `${u.nome} recusou o cancelamento do pedido #${p?.numero}` });
  });
}

export async function listarSolicitacoes(db: Db, status?: string) {
  return db
    .select({
      id: schema.solicitacoes.id,
      pedidoId: schema.solicitacoes.pedidoId,
      motivo: schema.solicitacoes.motivo,
      status: schema.solicitacoes.status,
      criadoEm: schema.solicitacoes.criadoEm,
      decididoEm: schema.solicitacoes.decididoEm,
      solicitante: schema.usuarios.nome,
      numero: schema.pedidos.numero,
      totalCentavos: schema.pedidos.totalCentavos,
      formaPagamento: schema.pedidos.formaPagamento,
      mesa: schema.mesas.numero,
    })
    .from(schema.solicitacoes)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.solicitacoes.solicitanteId))
    .innerJoin(schema.pedidos, eq(schema.pedidos.id, schema.solicitacoes.pedidoId))
    .innerJoin(schema.mesas, eq(schema.mesas.id, schema.pedidos.mesaId))
    .where(status ? eq(schema.solicitacoes.status, status) : undefined)
    .orderBy(desc(schema.solicitacoes.criadoEm))
    .limit(200);
}
