import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';

export default async function Pessoal() {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const db = await getDb();
  const funcs = await db.select().from(schema.funcionarios).where(eq(schema.funcionarios.empresaId, emp.id)).orderBy(asc(schema.funcionarios.nome));
  const folha = funcs.filter((f) => f.ativo).reduce((a, f) => a + (f.salario || 0), 0);
  return (
    <>
      <div className="cabeca"><div><h1>Departamento Pessoal</h1><p>Funcionários da empresa. Os títulos da folha (salários, INSS, IRRF, FGTS) entram no Contas a Pagar e são contabilizados pelo motor.</p></div></div>
      <div className="grade g3" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="rotulo">Ativos</div><div className="v">{funcs.filter((f) => f.ativo).length}</div></div>
        <div className="card kpi"><div className="rotulo">Salários contratuais</div><div className="v">{brl(folha)}</div><div className="s">soma dos ativos</div></div>
        <div className="card kpi"><div className="rotulo">Desligados</div><div className="v">{funcs.filter((f) => !f.ativo).length}</div></div>
      </div>
      <div className="aviso">Em construção: cálculo da folha mensal (INSS, IRRF e FGTS) e emissão das guias. Por enquanto as folhas importadas do protótipo ficam guardadas.</div>
      <div className="card">
        {funcs.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Nome</th><th>Cargo</th><th>Admissão</th><th className="num">Salário</th><th>Situação</th></tr></thead>
            <tbody>{funcs.map((f) => <tr key={f.id}><td>{f.nome}</td><td>{f.cargo || '—'}</td><td>{dataBr(f.admissao)}</td><td className="num">{f.salario != null ? brl(f.salario) : '—'}</td><td><span className={`tag ${f.ativo ? 'pos' : ''}`}>{f.ativo ? 'Ativo' : 'Desligado'}</span></td></tr>)}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhum funcionário. Eles entram pela importação do backup do protótipo.</div>}
      </div>
    </>
  );
}
