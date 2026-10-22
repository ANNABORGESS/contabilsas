import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { brl } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';

export default async function Documentos() {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const db = await getDb();
  const docs = await db
    .select({ d: schema.documentosEntrada, a: { id: schema.arquivos.id, nome: schema.arquivos.nome, tamanho: schema.arquivos.tamanho } })
    .from(schema.documentosEntrada)
    .innerJoin(schema.arquivos, eq(schema.arquivos.id, schema.documentosEntrada.arquivoId))
    .where(and(eq(schema.documentosEntrada.empresaId, emp.id), isNotNull(schema.documentosEntrada.arquivoId)))
    .orderBy(desc(schema.documentosEntrada.criadoEm))
    .limit(500);
  return (
    <>
      <div className="cabeca"><div><h1>Documentos</h1><p>Cofre fiscal: todo arquivo recebido pelo Autopilot fica guardado e pode ser baixado.</p></div></div>
      <div className="card">
        {docs.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Recebido</th><th>Tipo</th><th>Arquivo</th><th className="num">Valor</th><th>Situação</th><th /></tr></thead>
            <tbody>{docs.map(({ d, a }) => (
              <tr key={d.id}><td className="pequeno">{d.criadoEm.toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}</td><td>{d.tipo}</td><td>{a.nome}<div className="pequeno mudo">{Math.max(1, Math.round(a.tamanho / 1024))} KB · {d.canal}</div></td><td className="num">{d.valor != null ? brl(d.valor) : '—'}</td><td>{d.status}</td><td><a className="btn mini" href={`/arquivos/${a.id}`}>Baixar</a></td></tr>
            ))}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhum documento guardado ainda.</div>}
      </div>
    </>
  );
}
