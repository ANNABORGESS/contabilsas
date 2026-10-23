import { and, asc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { addDias, brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { LINHAS_VENDA } from '@/domain/venda';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { vendasDaEmpresa } from '@/server/comercial';
import { cancelar, vender } from './acoes';

function Abas({ t }: { t: string }) {
  return (
    <div className="abas">
      <Link href="/comercial?t=cliente" className={t === 'cliente' ? 'ativo' : ''}>Clientes</Link>
      <Link href="/comercial?t=fornecedor" className={t === 'fornecedor' ? 'ativo' : ''}>Fornecedores</Link>
      <Link href="/comercial?t=vendas" className={t === 'vendas' ? 'ativo' : ''}>Vendas</Link>
    </div>
  );
}

async function Vendas({ empId, edita, msg, erro }: { empId: string; edita: boolean; msg?: string; erro?: string }) {
  const db = await getDb();
  const [clientes, catalogo, vendas] = await Promise.all([
    db.select({ id: schema.parceiros.id, razao: schema.parceiros.razao, doc: schema.parceiros.doc }).from(schema.parceiros).where(and(eq(schema.parceiros.empresaId, empId), eq(schema.parceiros.tipo, 'cliente'))).orderBy(asc(schema.parceiros.razao)),
    db.select().from(schema.catalogo).where(and(eq(schema.catalogo.empresaId, empId), eq(schema.catalogo.ativo, true))).orderBy(asc(schema.catalogo.nome)),
    vendasDaEmpresa(db, empId),
  ]);
  const hoje = new Date().toISOString().slice(0, 10);
  const rot = (n: number) => `V-${String(n).padStart(4, '0')}`;
  return (
    <>
      {msg && <div className="aviso ok">{msg}</div>}
      {erro && <div className="aviso erro">{erro}</div>}
      {edita && (
        <div className="card">
          <details open={!vendas.length}>
            <summary>Nova venda</summary>
            <p className="pequeno mudo" style={{ margin: '8px 0 0' }}>Cada parcela vira um título no Contas a Receber. Deixe o preço em branco para usar o preço do cadastro.{!catalogo.length && <> Cadastre seus produtos e serviços em <Link href="/estoque">Produtos e Estoque</Link>, ou digite o nome do item na linha.</>}</p>
            <form action={vender} className="campos" style={{ marginTop: 12 }}>
              <div className="grade g4">
                <div><label>Data da venda</label><input type="date" name="data" defaultValue={hoje} required /></div>
                <div style={{ gridColumn: 'span 3' }}><label>Cliente</label>
                  <select name="cliente" defaultValue="">
                    <option value="">— Cliente novo (preencha ao lado) —</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.razao}{c.doc ? ` · ${formatarCnpj(c.doc)}` : ''}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}><label>Cliente novo: nome</label><input name="novoCliente" placeholder="Só se não estiver na lista" /></div>
                <div style={{ gridColumn: 'span 2' }}><label>Cliente novo: CNPJ ou CPF</label><input name="novoDoc" inputMode="numeric" /></div>
              </div>
              <div className="tabela-wrap"><table>
                <thead><tr><th>Item do cadastro</th><th>ou nome do item</th><th className="num">Qtd.</th><th className="num">Preço unit.</th></tr></thead>
                <tbody>{Array.from({ length: LINHAS_VENDA }, (_, k) => (
                  <tr key={k}>
                    <td style={{ minWidth: 220 }}><select name={`item${k}`} defaultValue=""><option value="">—</option>{catalogo.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.preco ? ` · ${brl(c.preco)}` : ''}</option>)}</select></td>
                    <td style={{ minWidth: 180 }}><input name={`nome${k}`} placeholder={k === 0 ? 'Ex.: Serviço de usinagem' : ''} /></td>
                    <td className="num" style={{ width: 90 }}><input name={`qtd${k}`} inputMode="decimal" defaultValue={k === 0 ? '1' : ''} style={{ textAlign: 'right' }} /></td>
                    <td className="num" style={{ width: 140 }}><input name={`preco${k}`} inputMode="decimal" placeholder="do cadastro" style={{ textAlign: 'right' }} /></td>
                  </tr>
                ))}</tbody>
              </table></div>
              <div className="grade g4">
                <div><label>Parcelas</label><select name="parcelas" defaultValue="1">{Array.from({ length: 12 }, (_, k) => <option key={k} value={k + 1}>{k === 0 ? 'À vista (1x)' : `${k + 1}x de 30 em 30 dias`}</option>)}</select></div>
                <div><label>1º vencimento</label><input type="date" name="primeiroVenc" defaultValue={addDias(hoje, 30)} required /></div>
                <div style={{ gridColumn: 'span 2' }}><label>Observação</label><input name="obs" placeholder="Pedido do cliente, condição combinada…" /></div>
              </div>
              <div><button className="btn primario" type="submit">Lançar venda</button></div>
            </form>
          </details>
        </div>
      )}
      <div className="card">
        <h2>Vendas lançadas</h2>
        {vendas.length ? (
          <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Venda</th><th>Data</th><th>Cliente</th><th>Itens</th><th className="num">Total</th><th>Parcelas</th><th>Status</th><th></th></tr></thead>
            <tbody>{vendas.map((v) => (
              <tr key={v.id}>
                <td><Link href={`/busca?q=${rot(v.numero)}`}><b>{rot(v.numero)}</b></Link></td>
                <td>{dataBr(v.data)}</td>
                <td>{v.cliente}</td>
                <td className="pequeno">{v.itens.map((i) => `${i.qtd} × ${i.nome}`).join(', ')}{v.obs && <div className="mudo">{v.obs}</div>}</td>
                <td className="num">{brl(v.total)}</td>
                <td>{v.parcelas}x · 1º {dataBr(v.primeiroVenc)}</td>
                <td><span className={`tag ${v.status === 'Cancelada' ? '' : 'pos'}`}>{v.status}</span></td>
                <td>{edita && v.status !== 'Cancelada' && (
                  <details><summary className="pequeno">Cancelar</summary>
                    <form action={cancelar} className="campos" style={{ marginTop: 8, minWidth: 220 }}>
                      <input type="hidden" name="id" value={v.id} />
                      <input name="motivo" placeholder="Motivo" required />
                      <button className="btn mini perigo" type="submit">Cancelar venda e parcelas</button>
                    </form>
                  </details>
                )}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhuma venda lançada ainda.</div>}
      </div>
    </>
  );
}

export default async function Comercial({ searchParams }: { searchParams: Promise<{ t?: string; msg?: string; erro?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const { t, msg, erro } = await searchParams;
  if (t === 'vendas') {
    return (
      <>
        <div className="cabeca"><div><h1>Comercial</h1><p>Vendas lançadas aqui geram as parcelas no Contas a Receber e entram na contabilidade como receita.</p></div></div>
        <Abas t="vendas" />
        <Vendas empId={emp.id} edita={podeEditar(u)} msg={msg} erro={erro} />
      </>
    );
  }
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
      <Abas t={tipo} />
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
