// Pedidos pagos. A confirmação do pagamento grava, numa única transação, o pedido, os itens,
// um preparo por setor e o evento. A chave de envio do celular torna a operação idempotente:
// toque duplo, rede instável ou reenvio devolvem o mesmo pedido, nunca um segundo.
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { reais } from '@/domain/dinheiro';
import { ErroPedido, NOME_FORMA, NOME_SETOR, aplicarPrecosCobrados, chaveValida, ehFormaPagamento, montarPedido, type ItemSolicitado } from '@/domain/pedido';
import { situacaoPedido, type StatusPreparo } from '@/domain/preparo';
import { dataOperacional } from '@/domain/turno';
import { FUSO, VIRADA } from './config';
import { ErroRegra } from './erros';
import { registrar } from './eventos';
import type { Usuario } from './auth';

async function cardapio(db: Db, ids: string[]) {
  const validos = ids.filter((i) => typeof i === 'string' && /^[0-9a-f-]{36}$/i.test(i));
  if (!validos.length) return [];
  return db.select().from(schema.produtos).where(inArray(schema.produtos.id, validos));
}

async function mesaAtiva(db: Db, mesaId: unknown) {
  if (typeof mesaId !== 'string' || !/^[0-9a-f-]{36}$/i.test(mesaId)) throw new ErroRegra('Escolha a mesa.');
  const [m] = await db.select().from(schema.mesas).where(eq(schema.mesas.id, mesaId));
  if (!m || !m.ativa) throw new ErroRegra('Mesa não encontrada ou desativada.');
  return m;
}

function montar(itens: ItemSolicitado[], produtos: Awaited<ReturnType<typeof cardapio>>) {
  try {
    return montarPedido(itens, produtos);
  } catch (e) {
    if (e instanceof ErroPedido) throw new ErroRegra(e.message);
    throw e;
  }
}

/** Antes de cobrar: confere mesa e produtos e devolve o total calculado com o cardápio atual. */
export async function previa(db: Db, entrada: { mesaId: unknown; itens: ItemSolicitado[] }) {
  const mesa = await mesaAtiva(db, entrada.mesaId);
  const itens = Array.isArray(entrada.itens) ? entrada.itens : [];
  const m = montar(itens, await cardapio(db, itens.map((i) => i?.produtoId)));
  return { mesa: { id: mesa.id, numero: mesa.numero }, ...m };
}

export interface Confirmacao {
  chave: unknown;
  mesaId: unknown;
  itens: ItemSolicitado[];
  formaPagamento: unknown;
  totalCobradoCentavos?: number;
  precosCobrados?: { produtoId: string; precoCentavos: number }[];
  observacao?: unknown;
}

export async function confirmarPagamento(db: Db, u: Usuario, c: Confirmacao, agora = new Date()) {
  if (!chaveValida(c.chave)) throw new ErroRegra('Envio sem identificação. Atualize a tela e tente de novo.');
  const chave = c.chave;
  const existente = await pedidoPorChave(db, chave);
  if (existente) return { pedido: existente, duplicado: true };

  if (!ehFormaPagamento(c.formaPagamento)) throw new ErroRegra('Informe a forma de pagamento.');
  const forma = c.formaPagamento;
  const mesa = await mesaAtiva(db, c.mesaId);
  const itens = Array.isArray(c.itens) ? c.itens : [];
  const montado = montar(itens, await cardapio(db, itens.map((i) => i?.produtoId)));
  let final;
  try {
    final = aplicarPrecosCobrados(montado, c.precosCobrados, c.totalCobradoCentavos);
  } catch (e) {
    if (e instanceof ErroPedido) throw new ErroRegra(e.message);
    throw e;
  }
  const observacao = typeof c.observacao === 'string' && c.observacao.trim() ? c.observacao.trim().slice(0, 300) : null;

  const criado = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(schema.pedidos)
      .values({
        chave,
        mesaId: mesa.id,
        garcomId: u.id,
        totalCentavos: final.totalCentavos,
        formaPagamento: forma,
        pagoEm: agora,
        dataOperacional: dataOperacional(agora, FUSO, VIRADA),
        divergenciaPreco: final.divergencia,
        observacao,
      })
      .onConflictDoNothing({ target: schema.pedidos.chave })
      .returning();
    if (!p) return null; // outro envio com a mesma chave chegou primeiro
    await tx.insert(schema.pedidoItens).values(final.linhas.map((l) => ({ pedidoId: p.id, ...l })));
    await tx.insert(schema.preparos).values(final.setores.map((setor) => ({ pedidoId: p.id, setor, criadoEm: agora })));
    const tx2 = tx as unknown as Db;
    await registrar(tx2, {
      tipo: 'pagamento_confirmado',
      pedidoId: p.id,
      usuarioId: u.id,
      descricao: `Pedido #${p.numero} · mesa ${mesa.numero} · ${reais(p.totalCentavos)} no ${NOME_FORMA[forma]} confirmado por ${u.nome} (confirmação manual)`,
      dados: { forma, totalCentavos: p.totalCentavos, chave },
    });
    for (const s of final.setores)
      await registrar(tx2, { tipo: 'enviado_preparo', pedidoId: p.id, usuarioId: u.id, descricao: `Pedido #${p.numero} enviado para ${NOME_SETOR[s]}` });
    if (final.divergencia)
      await registrar(tx2, { tipo: 'divergencia_preco', pedidoId: p.id, usuarioId: u.id, descricao: `Pedido #${p.numero} cobrado com preço diferente do cardápio atual (${reais(montado.totalCentavos)} pelo cardápio)` });
    return p;
  });
  const pedido = await pedidoPorChave(db, chave);
  if (!pedido) throw new ErroRegra('Não foi possível registrar o pedido. Tente de novo.', 500);
  return { pedido, duplicado: !criado };
}

async function pedidoPorChave(db: Db, chave: string) {
  const [p] = await db.select({ id: schema.pedidos.id }).from(schema.pedidos).where(eq(schema.pedidos.chave, chave));
  return p ? detalhePedido(db, p.id) : null;
}

/** Pedido com itens, preparos e linha do tempo (rastreabilidade). */
export async function detalhePedido(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db
    .select({ pedido: schema.pedidos, mesa: schema.mesas.numero, garcom: schema.usuarios.nome })
    .from(schema.pedidos)
    .innerJoin(schema.mesas, eq(schema.mesas.id, schema.pedidos.mesaId))
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.pedidos.garcomId))
    .where(eq(schema.pedidos.id, id));
  if (!p) return null;
  const [itens, preparos, linhaDoTempo, solicitacoes] = await Promise.all([
    db.select().from(schema.pedidoItens).where(eq(schema.pedidoItens.pedidoId, id)).orderBy(asc(schema.pedidoItens.setor), asc(schema.pedidoItens.nome)),
    db.select().from(schema.preparos).where(eq(schema.preparos.pedidoId, id)).orderBy(asc(schema.preparos.setor)),
    db
      .select({ id: schema.eventos.id, tipo: schema.eventos.tipo, descricao: schema.eventos.descricao, criadoEm: schema.eventos.criadoEm, usuario: schema.usuarios.nome })
      .from(schema.eventos)
      .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.eventos.usuarioId))
      .where(eq(schema.eventos.pedidoId, id))
      .orderBy(asc(schema.eventos.id)),
    db.select().from(schema.solicitacoes).where(eq(schema.solicitacoes.pedidoId, id)).orderBy(desc(schema.solicitacoes.criadoEm)),
  ]);
  const encerradoPor = p.pedido.encerradoPorId
    ? (await db.select({ nome: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, p.pedido.encerradoPorId)))[0]?.nome
    : null;
  const { chave: _chave, ...pedido } = p.pedido;
  return {
    ...pedido,
    mesa: p.mesa,
    garcom: p.garcom,
    encerradoPor,
    itens,
    preparos,
    situacao: pedido.status === 'pago' ? situacaoPedido(preparos.map((x) => ({ setor: x.setor as 'cozinha', status: x.status as StatusPreparo }))) : 'cancelado',
    linhaDoTempo,
    solicitacaoPendente: solicitacoes.some((s) => s.status === 'pendente'),
  };
}

export type DetalhePedido = NonNullable<Awaited<ReturnType<typeof detalhePedido>>>;

export interface FiltroPedidos {
  de?: string;
  ate?: string;
  mesaId?: string;
  garcomId?: string;
  status?: string;
  limite?: number;
}

/** Lista resumida para histórico de mesa, vendas e celular do garçom. */
export async function listarPedidos(db: Db, f: FiltroPedidos) {
  const cond = [];
  if (f.de) cond.push(sql`${schema.pedidos.dataOperacional} >= ${f.de}`);
  if (f.ate) cond.push(sql`${schema.pedidos.dataOperacional} <= ${f.ate}`);
  if (f.mesaId) cond.push(eq(schema.pedidos.mesaId, f.mesaId));
  if (f.garcomId) cond.push(eq(schema.pedidos.garcomId, f.garcomId));
  if (f.status) cond.push(eq(schema.pedidos.status, f.status));
  const lista = await db
    .select({
      id: schema.pedidos.id,
      numero: schema.pedidos.numero,
      mesaId: schema.pedidos.mesaId,
      mesa: schema.mesas.numero,
      garcomId: schema.pedidos.garcomId,
      garcom: schema.usuarios.nome,
      totalCentavos: schema.pedidos.totalCentavos,
      formaPagamento: schema.pedidos.formaPagamento,
      pagoEm: schema.pedidos.pagoEm,
      dataOperacional: schema.pedidos.dataOperacional,
      status: schema.pedidos.status,
      divergenciaPreco: schema.pedidos.divergenciaPreco,
      observacao: schema.pedidos.observacao,
    })
    .from(schema.pedidos)
    .innerJoin(schema.mesas, eq(schema.mesas.id, schema.pedidos.mesaId))
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.pedidos.garcomId))
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(schema.pedidos.numero))
    .limit(Math.min(f.limite || 500, 5000));
  if (!lista.length) return [];
  const ids = lista.map((p) => p.id);
  const [itens, preparos, pendentes] = await Promise.all([
    db.select().from(schema.pedidoItens).where(inArray(schema.pedidoItens.pedidoId, ids)),
    db.select().from(schema.preparos).where(inArray(schema.preparos.pedidoId, ids)),
    db.select({ pedidoId: schema.solicitacoes.pedidoId }).from(schema.solicitacoes).where(and(inArray(schema.solicitacoes.pedidoId, ids), eq(schema.solicitacoes.status, 'pendente'))),
  ]);
  const comPendencia = new Set(pendentes.map((s) => s.pedidoId));
  return lista.map((p) => {
    const prs = preparos.filter((x) => x.pedidoId === p.id).sort((a, b) => a.setor.localeCompare(b.setor));
    return {
      ...p,
      itens: itens.filter((i) => i.pedidoId === p.id).map((i) => ({ nome: i.nome, setor: i.setor, quantidade: i.quantidade, precoCentavos: i.precoCentavos, subtotalCentavos: i.subtotalCentavos })),
      preparos: prs.map((x) => ({ id: x.id, setor: x.setor, status: x.status, criadoEm: x.criadoEm, prontoEm: x.prontoEm, entregueEm: x.entregueEm })),
      situacao: p.status === 'pago' ? situacaoPedido(prs.map((x) => ({ setor: x.setor as 'cozinha', status: x.status as StatusPreparo }))) : 'cancelado',
      solicitacaoPendente: comPendencia.has(p.id),
    };
  });
}

export type PedidoLista = Awaited<ReturnType<typeof listarPedidos>>[number];
