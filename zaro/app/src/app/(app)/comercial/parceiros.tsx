import { and, asc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, formatarCnpj } from '@/domain/dinheiro';
import { consultarCnpj } from '../empresas/acoes';
import { salvarParceiroAcao } from './acoes';
import { Avisos, Cabeca } from './comum';
import { ParceiroForm } from './ParceiroForm';

export async function Parceiros({ empId, tipo, edita, novo, editar, q, msg, erro }: { empId: string; tipo: 'cliente' | 'fornecedor'; edita: boolean; novo?: string; editar?: string; q?: string; msg?: string; erro?: string }) {
  const db = await getDb();
  const busca = (q || '').trim().toLowerCase();
  const [lista, tot] = await Promise.all([
    db.select().from(schema.parceiros).where(and(eq(schema.parceiros.empresaId, empId), eq(schema.parceiros.tipo, tipo))).orderBy(asc(schema.parceiros.razao)),
    db.select({ doc: schema.titulos.docParceiro, nome: schema.titulos.nome, total: sql<string>`sum(coalesce(${schema.titulos.valorFiscal}, ${schema.titulos.valor}))`, n: sql<number>`count(distinct ${schema.titulos.nf})::int` })
      .from(schema.titulos)
      .where(and(eq(schema.titulos.empresaId, empId), eq(schema.titulos.tipo, tipo === 'cliente' ? 'receber' : 'pagar'), sql`${schema.titulos.status} not ilike '%cancel%'`))
      .groupBy(schema.titulos.docParceiro, schema.titulos.nome),
  ]);
  const mov = (p: (typeof lista)[number]) => {
    const l = tot.filter((x) => (p.doc ? x.doc === p.doc : x.nome === p.razao));
    return l.length ? { n: l.reduce((a, x) => a + x.n, 0), total: l.reduce((a, x) => a + Number(x.total), 0) } : null;
  };
  const filtrada = busca ? lista.filter((p) => `${p.razao} ${p.fantasia || ''} ${p.doc || ''}`.toLowerCase().includes(busca)) : lista;
  const editando = editar ? lista.find((p) => p.id === editar) : null;
  const abrir = edita && (novo === tipo || editando);
  const rotulo = tipo === 'cliente' ? 'cliente' : 'fornecedor';
  return (
    <>
      <Cabeca titulo="Clientes e Fornecedores" sub="Clientes e fornecedores da empresa. Os que vêm nas NFs são cadastrados sozinhos ao aprovar no Autopilot; os demais você cadastra aqui.">
        {edita && <><Link className="btn primario" href="/comercial?t=cliente&novo=cliente">+ Novo cliente</Link><Link className="btn primario" href="/comercial?t=fornecedor&novo=fornecedor">+ Novo fornecedor</Link></>}
      </Cabeca>
      <div className="abas"><Link href="/comercial?t=cliente" className={tipo === 'cliente' ? 'ativo' : ''}>Clientes</Link><Link href="/comercial?t=fornecedor" className={tipo === 'fornecedor' ? 'ativo' : ''}>Fornecedores</Link></div>
      <Avisos msg={msg} erro={erro} />
      {abrir && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <h2>{editando ? `Editar ${editando.razao}` : `Novo ${rotulo}`}</h2>
            <Link className="btn mini" href={`/comercial?t=${tipo}`}>Fechar</Link>
          </div>
          <div style={{ marginTop: 12 }}><ParceiroForm tipo={tipo} parceiro={editando || {}} salvar={salvarParceiroAcao} consultar={consultarCnpj} /></div>
        </div>
      )}
      <div className="card">
        <form className="linha" action="/comercial" style={{ marginBottom: 12 }}>
          <input type="hidden" name="t" value={tipo} />
          <input name="q" defaultValue={q || ''} placeholder={`Buscar ${rotulo} por nome ou CNPJ`} style={{ maxWidth: 360 }} />
          <button className="btn" type="submit">Buscar</button>
          <span className="pequeno mudo">{filtrada.length} {tipo === 'cliente' ? 'cliente(s)' : 'fornecedor(es)'}</span>
        </form>
        {filtrada.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Nome</th><th>CNPJ/CPF</th><th>Contato</th><th>Categoria</th><th>Origem</th><th className="num">NFs</th><th className="num">Movimento total</th><th /></tr></thead>
            <tbody>{filtrada.map((p) => {
              const x = mov(p);
              const d = p.dados as Record<string, string>;
              return (
                <tr key={p.id}>
                  <td>{p.razao}{p.fantasia && <div className="pequeno mudo">{p.fantasia}</div>}</td>
                  <td>{p.doc ? formatarCnpj(p.doc) : '—'}</td>
                  <td className="pequeno">{[d.contato, d.telefone, d.email].filter(Boolean).join(' · ') || '—'}{(d.cidade || d.uf) && <div className="mudo">{[d.cidade, d.uf].filter(Boolean).join('/')}</div>}</td>
                  <td>{p.categoria || '—'}</td>
                  <td className="pequeno">{p.origem || '—'}</td>
                  <td className="num">{x?.n || 0}</td>
                  <td className="num">{x ? brl(x.total) : '—'}</td>
                  <td className="num">{edita && <Link className="btn mini" href={`/comercial?t=${tipo}&editar=${p.id}`}>Editar</Link>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <div className="vazio">{busca ? 'Nada encontrado com essa busca.' : `Nenhum ${rotulo} cadastrado ainda.`}{edita && !busca && <> Use <b>+ Novo {rotulo}</b>.</>}</div>}
      </div>
    </>
  );
}
