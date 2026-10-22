import { and, asc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, formatarCnpj } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';

export default async function Comercial({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const { t } = await searchParams;
  const tipo = t === 'fornecedor' ? 'fornecedor' : 'cliente';
  const db = await getDb();
  const lista = await db.select().from(schema.parceiros).where(and(eq(schema.parceiros.empresaId, emp.id), eq(schema.parceiros.tipo, tipo))).orderBy(asc(schema.parceiros.razao));
  const tot = await db
    .select({ doc: schema.titulos.docParceiro, total: sql<string>`sum(coalesce(${schema.titulos.valorFiscal}, ${schema.titulos.valor}))`, n: sql<number>`count(distinct ${schema.titulos.nf})::int` })
    .from(schema.titulos)
    .where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, tipo === 'cliente' ? 'receber' : 'pagar'), sql`${schema.titulos.status} not ilike '%cancel%'`))
    .groupBy(schema.titulos.docParceiro);
  const porDoc = new Map(tot.map((x) => [x.doc, x]));
  return (
    <>
      <div className="cabeca"><div><h1>Comercial</h1><p>Clientes e fornecedores. Novos cadastros são criados automaticamente ao aprovar NF no Autopilot.</p></div></div>
      <div className="abas">
        <Link href="/comercial?t=cliente" className={tipo === 'cliente' ? 'ativo' : ''}>Clientes</Link>
        <Link href="/comercial?t=fornecedor" className={tipo === 'fornecedor' ? 'ativo' : ''}>Fornecedores</Link>
      </div>
      <div className="aviso">Em construção: orçamentos com PDF e pedidos de venda.</div>
      <div className="card">
        {lista.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Nome</th><th>CNPJ/CPF</th><th>Categoria</th><th>Origem</th><th className="num">NFs</th><th className="num">Movimento total</th></tr></thead>
            <tbody>{lista.map((p) => { const x = p.doc ? porDoc.get(p.doc) : undefined; return <tr key={p.id}><td>{p.razao}{p.fantasia && <div className="pequeno mudo">{p.fantasia}</div>}</td><td>{p.doc ? formatarCnpj(p.doc) : '—'}</td><td>{p.categoria || '—'}</td><td className="pequeno">{p.origem || '—'}</td><td className="num">{x?.n || 0}</td><td className="num">{x ? brl(Number(x.total)) : '—'}</td></tr>; })}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhum {tipo} cadastrado ainda.</div>}
      </div>
    </>
  );
}
