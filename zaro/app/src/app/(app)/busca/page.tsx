import Link from 'next/link';
import { getDb } from '@/db';
import { rotuloDoc, type TipoDoc } from '@/domain/comercial';
import { brl, formatarCnpj } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { buscar } from '@/server/consultas';
import { corStatus } from '@/components/status';

export default async function Busca({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const q = ((await searchParams).q || '').trim();
  const r = await buscar(await getDb(), emp.id, q);
  const hoje = new Date().toISOString().slice(0, 10);
  const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
  return (
    <>
      <div className="cabeca">
        <div>
          <h1>Busca</h1>
          <p>{q ? <>Resultados para “{q}” em {emp.fantasia || emp.razao}</> : 'Digite ao menos 2 letras na busca do topo.'}</p>
        </div>
      </div>
      {q.length >= 2 && !r.titulos.length && !r.parceiros.length && !r.docs.length && !r.produtos.length && <div className="card vazio">Nada encontrado.</div>}
      {r.titulos.length > 0 && (
        <div className="card">
          <h2>Títulos</h2>
          <div className="tabela-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Título</th><th>Nome</th><th>NF</th><th>Vencimento</th><th className="num">Valor</th><th>Status</th></tr></thead>
              <tbody>
                {r.titulos.map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/financeiro?tipo=${t.tipo}&f=todos&q=${encodeURIComponent(t.codigo)}`}><b>{t.codigo}</b></Link><div className="pequeno mudo">{t.tipo === 'pagar' ? 'A pagar' : 'A receber'}</div></td>
                    <td>{t.nome}</td>
                    <td>{t.nf || '—'}</td>
                    <td>{data(t.venc)}</td>
                    <td className="num">{brl(Number(t.valor))}</td>
                    <td><span className={`tag ${corStatus(t.status, t.venc, hoje)}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {r.parceiros.length > 0 && (
        <div className="card">
          <h2>Clientes e fornecedores</h2>
          <div className="tabela-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Nome</th><th>CNPJ/CPF</th><th>Tipo</th></tr></thead>
              <tbody>
                {r.parceiros.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/comercial?t=${p.tipo}&editar=${p.id}`}>{p.razao}</Link></td>
                    <td>{p.doc ? formatarCnpj(p.doc) : '—'}</td>
                    <td>{p.tipo === 'cliente' ? 'Cliente' : 'Fornecedor'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {r.docs.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Comercial</h2>
          <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Documento</th><th>Cliente / fornecedor</th><th>Data</th><th className="num">Total</th><th>Status</th></tr></thead>
            <tbody>{r.docs.map((d) => {
              const aba = d.tipo === 'orcamento' ? 'orcamentos' : d.tipo === 'pedido' ? 'pedidos' : 'compras';
              return <tr key={d.id}><td><Link href={`/comercial?t=${aba}`}><b>{rotuloDoc(d.tipo as TipoDoc, d.numero)}</b></Link>{d.referencia && <span className="pequeno mudo"> · ref. {d.referencia}</span>}</td><td>{d.parceiro || '—'}</td><td>{data(d.data)}</td><td className="num">{brl(d.total)}</td><td>{d.status}</td></tr>;
            })}</tbody>
          </table></div>
        </div>
      )}
      {r.produtos.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Produtos e serviços</h2>
          <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Item</th><th>NCM</th><th className="num">Custo</th><th className="num">Preço</th></tr></thead>
            <tbody>{r.produtos.map((p) => <tr key={p.id}><td><Link href="/comercial?t=produtos&aba=cadastro">{p.nome}</Link></td><td>{p.ncm || '—'}</td><td className="num">{p.custo ? brl(p.custo) : '—'}</td><td className="num">{p.preco ? brl(p.preco) : '—'}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </>
  );
}
