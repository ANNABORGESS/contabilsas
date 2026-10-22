import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { exigirUsuario } from '@/server/auth';

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await exigirUsuario();
  const { q } = await searchParams;
  const db = await getDb();
  const filtro = q ? or(ilike(schema.auditoria.acao, `%${q}%`), ilike(schema.auditoria.entidade, `%${q}%`), ilike(schema.auditoria.usuario, `%${q}%`)) : undefined;
  const linhas = await db
    .select({ a: schema.auditoria, emp: schema.empresas.fantasia, razao: schema.empresas.razao })
    .from(schema.auditoria)
    .leftJoin(schema.empresas, eq(schema.empresas.id, schema.auditoria.empresaId))
    .where(and(eq(schema.auditoria.tenantId, u.tenantId), filtro))
    .orderBy(desc(schema.auditoria.quando))
    .limit(300);
  return (
    <>
      <div className="cabeca"><div><h1>Auditoria</h1><p>Quem fez o quê, quando, antes e depois. Os registros não podem ser apagados pela tela.</p></div></div>
      <form className="card linha" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Buscar por ação, item ou usuário" style={{ flex: 1 }} />
        <button className="btn">Buscar</button>
      </form>
      <div className="card">
        {linhas.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Quando</th><th>Usuário</th><th>Empresa</th><th>Ação</th><th>Item</th><th>Antes</th><th>Depois</th><th>Justificativa</th></tr></thead>
            <tbody>{linhas.map(({ a, emp, razao }) => (
              <tr key={a.id}><td className="num pequeno">{a.quando.toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}</td><td className="pequeno">{a.usuario}</td><td className="pequeno">{emp || razao || '—'}</td><td>{a.acao}</td><td className="pequeno">{a.entidade || '—'}</td><td className="pequeno">{a.antes || '—'}</td><td className="pequeno">{a.depois || '—'}</td><td className="pequeno">{a.justificativa === 'importado-do-prototipo-marcador' ? '—' : a.justificativa || '—'}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhum registro.</div>}
        {linhas.length === 300 && <p className="pequeno mudo">Mostrando os 300 mais recentes. Use a busca para encontrar os anteriores.</p>}
      </div>
    </>
  );
}
