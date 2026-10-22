import { and, eq, like } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { brl } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import type { DadosDocumento } from '@/server/autopilot';

export default async function Estoque() {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const db = await getDb();
  const docs = await db.select({ dados: schema.documentosEntrada.dados }).from(schema.documentosEntrada)
    .where(and(eq(schema.documentosEntrada.empresaId, emp.id), eq(schema.documentosEntrada.status, 'Aprovado'), like(schema.documentosEntrada.tipo, '%saída%')));
  const prod = new Map<string, { desc: string; ncm: string; qtd: number; total: number; notas: number }>();
  for (const d of docs) {
    const n = (d.dados as DadosDocumento).nota;
    if (!n || (d.dados as DadosDocumento).retorno) continue;
    for (const i of n.itens) {
      const k = i.desc.trim().toUpperCase();
      const p = prod.get(k) || { desc: i.desc, ncm: i.ncm, qtd: 0, total: 0, notas: 0 };
      p.qtd += i.qtd; p.total += i.total; p.notas += 1;
      prod.set(k, p);
    }
  }
  const lista = [...prod.values()].sort((a, b) => b.total - a.total);
  return (
    <>
      <div className="cabeca"><div><h1>Produtos e Estoque</h1><p>{emp.semEstoque ? 'Esta empresa trabalha sob encomenda, sem estoque: a compra de material vai direto para custo. Abaixo, os produtos vendidos sob pedido, tirados das NFs de saída aprovadas.' : 'Produtos vendidos, tirados das NFs de saída aprovadas.'}</p></div></div>
      <div className="card">
        {lista.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Produto</th><th>NCM</th><th className="num">Notas</th><th className="num">Quantidade</th><th className="num">Faturado</th><th className="num">Preço médio</th></tr></thead>
            <tbody>{lista.map((p) => <tr key={p.desc}><td>{p.desc}</td><td>{p.ncm || '—'}</td><td className="num">{p.notas}</td><td className="num">{p.qtd.toLocaleString('pt-BR')}</td><td className="num">{brl(p.total)}</td><td className="num">{brl(p.qtd ? p.total / p.qtd : 0)}</td></tr>)}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhuma NF de venda aprovada ainda.</div>}
      </div>
    </>
  );
}
