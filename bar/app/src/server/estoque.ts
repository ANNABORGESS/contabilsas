// Estoque dos produtos: baixa na venda, devolve no cancelamento e entrada/ajuste pelo administrador.
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { ESTOQUE_BAIXO, quantidadeEstoque } from '@/domain/estoque';
import type { Usuario } from './auth';
import { ErroRegra } from './erros';
import { registrar } from './eventos';

const somarPorProduto = (linhas: { produtoId: string; quantidade: number }[]) => {
  const m = new Map<string, number>();
  for (const l of linhas) if (l.quantidade > 0) m.set(l.produtoId, (m.get(l.produtoId) || 0) + l.quantidade);
  return m;
};

/** Venda confirmada: tira do estoque (só dos produtos com controle). Avisa quando acaba ou fica baixo. */
export async function baixarEstoque(db: Db, linhas: { produtoId: string; quantidade: number }[], pedidoId: string, numero: number, usuarioId: string) {
  for (const [produtoId, q] of somarPorProduto(linhas)) {
    const [p] = await db
      .update(schema.produtos)
      .set({ estoque: sql`${schema.produtos.estoque} - ${q}` })
      .where(and(eq(schema.produtos.id, produtoId), isNotNull(schema.produtos.estoque)))
      .returning({ nome: schema.produtos.nome, estoque: schema.produtos.estoque });
    if (!p || p.estoque === null) continue;
    const antes = p.estoque + q;
    if (p.estoque <= 0 && antes > 0)
      await registrar(db, { tipo: 'estoque_esgotado', pedidoId, usuarioId, descricao: `${p.nome} esgotou no pedido #${numero}${p.estoque < 0 ? ` (ficou ${p.estoque}: confira o estoque)` : ''}` });
    else if (p.estoque <= ESTOQUE_BAIXO && antes > ESTOQUE_BAIXO)
      await registrar(db, { tipo: 'estoque_baixo', pedidoId, usuarioId, descricao: `Estoque baixo: restam ${p.estoque} de ${p.nome}` });
  }
}

/** Cancelamento (nada preparado): as unidades voltam para o estoque. */
export async function devolverEstoque(db: Db, linhas: { produtoId: string; quantidade: number }[]) {
  for (const [produtoId, q] of somarPorProduto(linhas))
    await db
      .update(schema.produtos)
      .set({ estoque: sql`${schema.produtos.estoque} + ${q}` })
      .where(and(eq(schema.produtos.id, produtoId), isNotNull(schema.produtos.estoque)));
}

async function produto(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroRegra('Produto não encontrado.', 404);
  const [p] = await db.select().from(schema.produtos).where(eq(schema.produtos.id, id));
  if (!p || p.excluido) throw new ErroRegra('Produto não encontrado.', 404);
  return p;
}

/**
 * Administrador mexe no estoque: "entrada" soma (chegou mercadoria), "ajustar" grava a contagem,
 * "desligar" para de controlar o estoque desse produto.
 */
export async function alterarEstoque(db: Db, u: Usuario, id: string, acao: unknown, quantidade: unknown) {
  if (u.papel !== 'admin') throw new ErroRegra('Só o administrador mexe no estoque.', 403);
  const p = await produto(db, id);
  if (acao === 'desligar') {
    await db.update(schema.produtos).set({ estoque: null }).where(eq(schema.produtos.id, p.id));
    await registrar(db, { tipo: 'estoque_alterado', usuarioId: u.id, descricao: `${u.nome} parou de controlar o estoque de ${p.nome}` });
    return { estoque: null };
  }
  if (acao === 'entrada') {
    const q = quantidadeEstoque(quantidade, 1);
    if (q === null) throw new ErroRegra('Informe quantas unidades chegaram.');
    const [r] = await db
      .update(schema.produtos)
      .set({ estoque: sql`coalesce(${schema.produtos.estoque}, 0) + ${q}` })
      .where(eq(schema.produtos.id, p.id))
      .returning({ estoque: schema.produtos.estoque });
    await registrar(db, { tipo: 'estoque_entrada', usuarioId: u.id, descricao: `${u.nome} deu entrada de ${q} un. de ${p.nome} (estoque agora: ${r.estoque})` });
    return { estoque: r.estoque };
  }
  if (acao === 'ajustar') {
    const q = quantidadeEstoque(quantidade);
    if (q === null) throw new ErroRegra('Informe a quantidade contada (0 ou mais).');
    await db.update(schema.produtos).set({ estoque: q }).where(eq(schema.produtos.id, p.id));
    await registrar(db, { tipo: 'estoque_ajustado', usuarioId: u.id, descricao: `${u.nome} ajustou o estoque de ${p.nome}: ${p.estoque ?? 'sem controle'} → ${q}` });
    return { estoque: q };
  }
  throw new ErroRegra('Ação de estoque inválida.');
}
