// Estoque dos produtos: baixa na venda, devolve no cancelamento e entrada, saída ou ajuste pelo
// administrador. Cada movimento fica registrado com o saldo depois dele (histórico do estoque).
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { ESTOQUE_BAIXO, quantidadeEstoque } from '@/domain/estoque';
import type { Usuario } from './auth';
import { ErroRegra } from './erros';
import { registrar } from './eventos';

type TipoMovimento = 'entrada' | 'saida' | 'venda' | 'cancelamento' | 'ajuste';

const somarPorProduto = (linhas: { produtoId: string; quantidade: number }[]) => {
  const m = new Map<string, number>();
  for (const l of linhas) if (l.quantidade > 0) m.set(l.produtoId, (m.get(l.produtoId) || 0) + l.quantidade);
  return m;
};

async function movimento(db: Db, m: { produtoId: string; tipo: TipoMovimento; quantidade: number; saldo: number; motivo?: string | null; pedidoId?: string | null; usuarioId?: string | null }) {
  await db.insert(schema.estoqueMovimentos).values({ ...m, motivo: m.motivo ?? null, pedidoId: m.pedidoId ?? null, usuarioId: m.usuarioId ?? null });
}

/** Soma (ou tira, com delta negativo) do estoque de um produto controlado; devolve o saldo novo. */
async function mexerSaldo(db: Db, produtoId: string, delta: number) {
  const [p] = await db
    .update(schema.produtos)
    .set({ estoque: sql`${schema.produtos.estoque} + ${delta}` })
    .where(and(eq(schema.produtos.id, produtoId), isNotNull(schema.produtos.estoque)))
    .returning({ nome: schema.produtos.nome, estoque: schema.produtos.estoque });
  return p && p.estoque !== null ? { nome: p.nome, saldo: p.estoque } : null;
}

/** Venda confirmada: tira do estoque (só dos produtos com controle). Avisa quando acaba ou fica baixo. */
export async function baixarEstoque(db: Db, linhas: { produtoId: string; quantidade: number }[], pedidoId: string, numero: number, usuarioId: string) {
  for (const [produtoId, q] of somarPorProduto(linhas)) {
    const r = await mexerSaldo(db, produtoId, -q);
    if (!r) continue;
    await movimento(db, { produtoId, tipo: 'venda', quantidade: -q, saldo: r.saldo, motivo: `Pedido #${numero}`, pedidoId, usuarioId });
    const antes = r.saldo + q;
    if (r.saldo <= 0 && antes > 0)
      await registrar(db, { tipo: 'estoque_esgotado', pedidoId, usuarioId, descricao: `${r.nome} acabou no estoque no pedido #${numero}${r.saldo < 0 ? ` (saldo ${r.saldo}: confira o estoque)` : ''}` });
    else if (r.saldo <= ESTOQUE_BAIXO && antes > ESTOQUE_BAIXO)
      await registrar(db, { tipo: 'estoque_baixo', pedidoId, usuarioId, descricao: `Estoque baixo: restam ${r.saldo} de ${r.nome}` });
  }
}

/** Cancelamento (nada preparado): as unidades voltam para o estoque. */
export async function devolverEstoque(db: Db, linhas: { produtoId: string; quantidade: number }[], pedidoId: string, numero: number, usuarioId: string) {
  for (const [produtoId, q] of somarPorProduto(linhas)) {
    const r = await mexerSaldo(db, produtoId, q);
    if (r) await movimento(db, { produtoId, tipo: 'cancelamento', quantidade: q, saldo: r.saldo, motivo: `Cancelado no pedido #${numero}`, pedidoId, usuarioId });
  }
}

async function produto(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroRegra('Produto não encontrado.', 404);
  const [p] = await db.select().from(schema.produtos).where(eq(schema.produtos.id, id));
  if (!p || p.excluido) throw new ErroRegra('Produto não encontrado.', 404);
  return p;
}

const textoMotivo = (m: unknown) => (typeof m === 'string' ? m.replace(/\s+/g, ' ').trim().slice(0, 120) : '');

/**
 * Administrador mexe no estoque:
 * - "entrada": chegou mercadoria, soma (começa o controle do zero se ainda não tinha);
 * - "saida": perda, quebra, consumo da casa, vencido... tira, com motivo;
 * - "ajustar": depois de contar, grava o número certo;
 * - "trava": liga ou desliga "não deixa vender quando acabar";
 * - "desligar": para de controlar o estoque desse produto.
 * Comida começa sem travar a venda (pode não ter estoque inicial); bebida começa travando.
 */
export async function alterarEstoque(db: Db, u: Usuario, id: string, acao: unknown, quantidade: unknown, motivoBruto?: unknown) {
  if (u.papel !== 'admin') throw new ErroRegra('Só o administrador mexe no estoque.', 403);
  const p = await produto(db, id);
  const motivo = textoMotivo(motivoBruto);
  const comecando = p.estoque === null;
  const travaInicial = p.setor !== 'cozinha';
  if (acao === 'desligar') {
    await db.update(schema.produtos).set({ estoque: null }).where(eq(schema.produtos.id, p.id));
    await registrar(db, { tipo: 'estoque_alterado', usuarioId: u.id, descricao: `${u.nome} parou de controlar o estoque de ${p.nome}` });
    return { estoque: null, trava: p.estoqueTrava };
  }
  if (acao === 'trava') {
    if (comecando) throw new ErroRegra('Ligue o controle de estoque primeiro.');
    const trava = quantidade === true || quantidade === 'true';
    await db.update(schema.produtos).set({ estoqueTrava: trava }).where(eq(schema.produtos.id, p.id));
    await registrar(db, { tipo: 'estoque_alterado', usuarioId: u.id, descricao: `${u.nome} ${trava ? 'ligou' : 'desligou'} a trava de venda sem estoque de ${p.nome}` });
    return { estoque: p.estoque, trava };
  }
  if (acao === 'entrada' || acao === 'saida') {
    const q = quantidadeEstoque(quantidade, 1);
    if (q === null) throw new ErroRegra(acao === 'entrada' ? 'Informe quantas unidades chegaram.' : 'Informe quantas unidades saíram.');
    if (acao === 'saida' && !motivo) throw new ErroRegra('Diga o motivo da saída (ex.: quebrou, venceu, consumo da casa).');
    const delta = acao === 'entrada' ? q : -q;
    if (comecando) await db.update(schema.produtos).set({ estoque: 0, estoqueTrava: travaInicial }).where(eq(schema.produtos.id, p.id));
    const r = (await mexerSaldo(db, p.id, delta))!;
    await movimento(db, { produtoId: p.id, tipo: acao, quantidade: delta, saldo: r.saldo, motivo: motivo || null, usuarioId: u.id });
    await registrar(db, {
      tipo: acao === 'entrada' ? 'estoque_entrada' : 'estoque_saida',
      usuarioId: u.id,
      descricao: `${u.nome} deu ${acao === 'entrada' ? 'entrada' : 'saída'} de ${q} un. de ${p.nome}${motivo ? ` (${motivo})` : ''}. Saldo: ${r.saldo}`,
    });
    return { estoque: r.saldo, trava: comecando ? travaInicial : p.estoqueTrava };
  }
  if (acao === 'ajustar') {
    const q = quantidadeEstoque(quantidade);
    if (q === null) throw new ErroRegra('Informe a quantidade contada (0 ou mais).');
    await db
      .update(schema.produtos)
      .set(comecando ? { estoque: q, estoqueTrava: travaInicial } : { estoque: q })
      .where(eq(schema.produtos.id, p.id));
    await movimento(db, { produtoId: p.id, tipo: 'ajuste', quantidade: q - (p.estoque ?? 0), saldo: q, motivo: motivo || 'Contagem', usuarioId: u.id });
    await registrar(db, { tipo: 'estoque_ajustado', usuarioId: u.id, descricao: `${u.nome} ajustou o estoque de ${p.nome}: ${p.estoque ?? 'sem controle'} → ${q}` });
    return { estoque: q, trava: comecando ? travaInicial : p.estoqueTrava };
  }
  throw new ErroRegra('Ação de estoque inválida.');
}

/** Histórico das movimentações, do mais recente para o mais antigo. */
export async function listarMovimentos(db: Db, limite = 200) {
  return db
    .select({
      id: schema.estoqueMovimentos.id,
      tipo: schema.estoqueMovimentos.tipo,
      quantidade: schema.estoqueMovimentos.quantidade,
      saldo: schema.estoqueMovimentos.saldo,
      motivo: schema.estoqueMovimentos.motivo,
      criadoEm: schema.estoqueMovimentos.criadoEm,
      produto: schema.produtos.nome,
      setor: schema.produtos.setor,
      usuario: schema.usuarios.nome,
    })
    .from(schema.estoqueMovimentos)
    .innerJoin(schema.produtos, eq(schema.produtos.id, schema.estoqueMovimentos.produtoId))
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.estoqueMovimentos.usuarioId))
    .orderBy(desc(schema.estoqueMovimentos.criadoEm))
    .limit(Math.min(limite, 1000));
}
