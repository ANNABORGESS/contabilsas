// Despesas e o resumo de custos e lucro (só administrador).
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { reais } from '@/domain/dinheiro';
import { ErroDespesa, NOME_CATEGORIA, resumoFinanceiro, validarDespesa } from '@/domain/financeiro';
import type { Usuario } from './auth';
import { ErroRegra } from './erros';
import { registrar } from './eventos';
import { listarPedidos } from './pedidos';

export async function listarDespesas(db: Db, de: string, ate: string) {
  return db
    .select({
      id: schema.despesas.id,
      data: schema.despesas.data,
      categoria: schema.despesas.categoria,
      descricao: schema.despesas.descricao,
      valorCentavos: schema.despesas.valorCentavos,
      funcionarioId: schema.despesas.funcionarioId,
      funcionarioNome: sql<string | null>`coalesce(${schema.despesas.funcionarioNome}, ${schema.usuarios.nome})`,
      criadoEm: schema.despesas.criadoEm,
    })
    .from(schema.despesas)
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.despesas.funcionarioId))
    .where(and(gte(schema.despesas.data, de), lte(schema.despesas.data, ate)))
    .orderBy(desc(schema.despesas.data), desc(schema.despesas.criadoEm));
}

export async function lancarDespesa(db: Db, u: Usuario, corpo: Record<string, unknown>) {
  let d;
  try {
    d = validarDespesa(corpo);
  } catch (e) {
    if (e instanceof ErroDespesa) throw new ErroRegra(e.message);
    throw e;
  }
  // se o nome digitado for de alguém da equipe, liga a despesa à conta dele também
  // e grava o nome como está no cadastro, para não somar "carlos" e "Carlos" separados
  let funcionarioId: string | null = null;
  if (d.funcionarioNome) {
    const [f] = await db
      .select({ id: schema.usuarios.id, nome: schema.usuarios.nome })
      .from(schema.usuarios)
      .where(sql`lower(${schema.usuarios.nome}) = lower(${d.funcionarioNome})`)
      .limit(1);
    if (f) {
      funcionarioId = f.id;
      d.funcionarioNome = f.nome;
    }
  }
  const [nova] = await db.insert(schema.despesas).values({ ...d, funcionarioId, criadoPorId: u.id }).returning();
  await registrar(db, { tipo: 'despesa_lancada', usuarioId: u.id, descricao: `${u.nome} lançou despesa de ${reais(d.valorCentavos)} em ${NOME_CATEGORIA[d.categoria]}${d.funcionarioNome ? ` para ${d.funcionarioNome}` : ''}: ${d.descricao} (${d.data.split('-').reverse().join('/')})` });
  return nova;
}

export async function excluirDespesa(db: Db, u: Usuario, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroRegra('Despesa não encontrada.', 404);
  const [d] = await db.delete(schema.despesas).where(eq(schema.despesas.id, id)).returning();
  if (!d) throw new ErroRegra('Despesa não encontrada.', 404);
  await registrar(db, { tipo: 'despesa_excluida', usuarioId: u.id, descricao: `${u.nome} excluiu a despesa de ${reais(d.valorCentavos)} (${d.descricao}, ${d.data.split('-').reverse().join('/')})` });
}

/** Vendas líquidas (pedidos pagos, sem cancelados e estornados) e despesas do período. */
export async function custosELucro(db: Db, de: string, ate: string) {
  const [pedidos, despesas] = await Promise.all([listarPedidos(db, { de, ate, status: 'pago', limite: 5000 }), listarDespesas(db, de, ate)]);
  const porData = new Map<string, number>();
  for (const p of pedidos) porData.set(p.dataOperacional, (porData.get(p.dataOperacional) || 0) + p.liquidoCentavos);
  const vendas = [...porData].map(([data, liquidoCentavos]) => ({ data, liquidoCentavos }));
  // vendas por setor (petiscos x bebidas), para comparar com o que se gastou em cada um
  const vendasPorSetor = { cozinha: 0, bar: 0 } as Record<string, number>;
  for (const p of pedidos) for (const i of p.itens) vendasPorSetor[i.setor] = (vendasPorSetor[i.setor] || 0) + i.subtotalCentavos - i.quantidadeCancelada * i.precoCentavos;
  return { de, ate, resumo: resumoFinanceiro(vendas, despesas), vendasPorSetor, pedidos: pedidos.length, despesas };
}

