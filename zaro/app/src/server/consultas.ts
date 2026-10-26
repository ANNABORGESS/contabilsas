// Consultas usadas por várias telas. Todas filtram pela empresa ativa.
import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';

export type Titulo = typeof schema.titulos.$inferSelect;

const ABERTO = sql`${schema.titulos.status} not ilike '%cancel%' and ${schema.titulos.status} not ilike '%pago%' and ${schema.titulos.status} not ilike '%recebido%' and ${schema.titulos.status} not ilike '%quitad%' and ${schema.titulos.retorno} = false`;

/** Soma das baixas de cada título. */
export async function pagosPorTitulo(db: Db, empresaId: string) {
  const r = await db
    .select({ id: schema.baixas.tituloId, total: sql<string>`sum(${schema.baixas.valor})` })
    .from(schema.baixas)
    .innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId))
    .where(and(eq(schema.titulos.empresaId, empresaId), eq(schema.baixas.estornada, false)))
    .groupBy(schema.baixas.tituloId);
  return new Map(r.map((x) => [x.id, Number(x.total)]));
}

export async function resumoFinanceiro(db: Db, empresaId: string, hoje: string) {
  const linhas = await db
    .select({ tipo: schema.titulos.tipo, venc: schema.titulos.venc, valor: schema.titulos.valor })
    .from(schema.titulos)
    .where(and(eq(schema.titulos.empresaId, empresaId), ABERTO));
  const pega = (tipo: string, vencido?: boolean) =>
    linhas
      .filter((l) => l.tipo === tipo && (vencido === undefined || (!!l.venc && l.venc < hoje) === vencido))
      .reduce((a, l) => ({ n: a.n + 1, total: a.total + Number(l.valor) }), { n: 0, total: 0 });
  return {
    pagar: pega('pagar'),
    receber: pega('receber'),
    pagarVencido: pega('pagar', true),
    receberVencido: pega('receber', true),
  };
}

export async function titulosDaEmpresa(db: Db, empresaId: string, tipo: 'pagar' | 'receber') {
  return db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, empresaId), eq(schema.titulos.tipo, tipo))).orderBy(sql`${schema.titulos.venc} asc nulls last`, schema.titulos.codigo);
}

export async function auditoriaRecente(db: Db, tenantId: string, empresaId: string | null, limite = 8) {
  return db
    .select()
    .from(schema.auditoria)
    .where(empresaId ? and(eq(schema.auditoria.tenantId, tenantId), sql`(${schema.auditoria.empresaId} = ${empresaId} or ${schema.auditoria.empresaId} is null)`) : eq(schema.auditoria.tenantId, tenantId))
    .orderBy(desc(schema.auditoria.quando))
    .limit(limite);
}

export const ehAberto = (t: Pick<Titulo, 'status' | 'retorno'>) => !t.retorno && !/cancel|pago|recebido|quitad/i.test(t.status);

/** Contagem para o sino do topo: títulos a pagar vencidos e documentos novos no Autopilot. */
export async function alertasDaEmpresa(db: Db, empresaId: string, hoje: string) {
  const [[v], [d]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.titulos).where(and(eq(schema.titulos.empresaId, empresaId), eq(schema.titulos.tipo, 'pagar'), ABERTO, sql`${schema.titulos.venc} < ${hoje}`)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.documentosEntrada).where(and(eq(schema.documentosEntrada.empresaId, empresaId), eq(schema.documentosEntrada.status, 'Novo'))),
  ]);
  return { vencidos: Number(v.n), documentos: Number(d.n) };
}

/** Busca do topo: títulos (código, nome, NF, descrição, pedido), clientes/fornecedores (nome, CNPJ),
 *  orçamentos/pedidos/compras do Comercial (nº, parceiro, referência, item) e produtos do cadastro. */
export async function buscar(db: Db, empresaId: string, termo: string) {
  const t = termo.trim();
  if (t.length < 2) return { titulos: [] as Titulo[], parceiros: [] as (typeof schema.parceiros.$inferSelect)[], docs: [] as (typeof schema.docsComerciais.$inferSelect)[], produtos: [] as (typeof schema.catalogo.$inferSelect)[] };
  const like = `%${t.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  const dig = t.replace(/\D/g, '');
  const num = /^(?:ORC|PED|SC|OC)-?0*(\d+)$/i.exec(t)?.[1];
  const [titulos, parceiros, docs, produtos] = await Promise.all([
    db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, empresaId), sql`(${schema.titulos.codigo} ilike ${like} or ${schema.titulos.nome} ilike ${like} or ${schema.titulos.nf} ilike ${like} or ${schema.titulos.descricao} ilike ${like} or ${schema.titulos.dados}->>'pedido' ilike ${like})`)).orderBy(sql`${schema.titulos.venc} desc nulls last`).limit(40),
    db.select().from(schema.parceiros).where(and(eq(schema.parceiros.empresaId, empresaId), dig.length >= 4 ? sql`(${schema.parceiros.razao} ilike ${like} or ${schema.parceiros.doc} like ${'%' + dig + '%'})` : sql`${schema.parceiros.razao} ilike ${like}`)).limit(20),
    db.select().from(schema.docsComerciais).where(and(eq(schema.docsComerciais.empresaId, empresaId), num ? eq(schema.docsComerciais.numero, Number(num)) : sql`(${schema.docsComerciais.parceiro} ilike ${like} or ${schema.docsComerciais.referencia} ilike ${like} or ${schema.docsComerciais.itens}::text ilike ${like})`)).limit(20),
    db.select().from(schema.catalogo).where(and(eq(schema.catalogo.empresaId, empresaId), sql`(${schema.catalogo.nome} ilike ${like} or ${schema.catalogo.ncm} ilike ${like})`)).limit(20),
  ]);
  return { titulos, parceiros, docs, produtos };
}

export const FILTROS_TITULO = [['abertos', 'Em aberto'], ['vencidos', 'Vencidos'], ['quitados', 'Pagos/recebidos'], ['retorno', 'Retorno'], ['cancelados', 'Cancelados'], ['todos', 'Todos']] as const;

/** Lista do Financeiro com o filtro e a busca da tela (a mesma usada na exportação em Excel e PDF). */
export async function titulosFiltrados(db: Db, empresaId: string, tipo: 'pagar' | 'receber', filtro: string | undefined, busca: string | undefined, hoje: string) {
  const f = FILTROS_TITULO.some(([k]) => k === filtro) ? filtro! : 'abertos';
  const q = (busca || '').toLowerCase().trim();
  const todos = await titulosDaEmpresa(db, empresaId, tipo);
  const lista = todos.filter((t) => {
    const ok =
      f === 'todos' ? true
        : f === 'abertos' ? ehAberto(t)
          : f === 'vencidos' ? ehAberto(t) && !!t.venc && t.venc < hoje
            : f === 'quitados' ? /pago|recebido|quitad/i.test(t.status)
              : f === 'retorno' ? t.retorno
                : /cancel/i.test(t.status);
    return ok && (!q || `${t.codigo} ${t.nome} ${t.nf || ''} ${t.descricao || ''} ${t.nfChave || ''}`.toLowerCase().includes(q));
  });
  return { f, q: (busca || '').trim(), todos, lista, nomeFiltro: FILTROS_TITULO.find(([k]) => k === f)![1] };
}

/** "Localizar pela chave": onde a NF de 44 dígitos está nesta empresa (títulos, Autopilot e lista da SEFAZ). */
export async function localizarChave(db: Db, empresaId: string, entrada: string) {
  const chave = entrada.replace(/\D/g, '');
  if (chave.length !== 44) return { chave, valida: false as const, titulos: [] as Titulo[], documentos: [] as { id: string; tipo: string; status: string; nomeArquivo: string; valor: number | null }[], notas: [] as { numero: string | null; razaoEmit: string | null; valor: number; situacao: string | null; recebidoEm: Date | null; lancadoEm: Date | null }[] };
  const [titulos, documentos, notas] = await Promise.all([
    db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, empresaId), eq(schema.titulos.nfChave, chave))).orderBy(schema.titulos.codigo),
    db.select({ id: schema.documentosEntrada.id, tipo: schema.documentosEntrada.tipo, status: schema.documentosEntrada.status, nomeArquivo: schema.documentosEntrada.nomeArquivo, valor: schema.documentosEntrada.valor }).from(schema.documentosEntrada).where(and(eq(schema.documentosEntrada.empresaId, empresaId), eq(schema.documentosEntrada.chave, chave))),
    db.select({ numero: schema.notasSefaz.numero, razaoEmit: schema.notasSefaz.razaoEmit, valor: schema.notasSefaz.valor, situacao: schema.notasSefaz.situacao, recebidoEm: schema.notasSefaz.recebidoEm, lancadoEm: schema.notasSefaz.lancadoEm }).from(schema.notasSefaz).where(and(eq(schema.notasSefaz.empresaId, empresaId), eq(schema.notasSefaz.chave, chave))),
  ]);
  return { chave, valida: true as const, titulos, documentos, notas };
}
