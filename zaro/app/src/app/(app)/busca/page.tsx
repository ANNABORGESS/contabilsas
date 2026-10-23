import Link from 'next/link';
import { getDb } from '@/db';
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
      {q.length >= 2 && !r.titulos.length && !r.parceiros.length && <div className="card vazio">Nada encontrado.</div>}
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
                    <td><Link href={`/comercial?t=${p.tipo}`}>{p.razao}</Link></td>
                    <td>{p.doc ? formatarCnpj(p.doc) : '—'}</td>
                    <td>{p.tipo === 'cliente' ? 'Cliente' : 'Fornecedor'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
