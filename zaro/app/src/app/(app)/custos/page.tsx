import { getDb } from '@/db';
import { brl } from '@/domain/dinheiro';
import { dre } from '@/domain/demonstracoes';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { lancamentosDaEmpresa } from '@/server/contabil';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default async function Custos({ searchParams }: { searchParams: Promise<{ ano?: string; previa?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const ano = /^\d{4}$/.test(sp.ano || '') ? sp.ano! : String(new Date().getFullYear());
  const previa = sp.previa === '1';
  const lancs = await lancamentosDaEmpresa(await getDb(), emp);
  const meses = MESES.map((nome, i) => {
    const c = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const d = dre(lancs, { de: c, ate: c }, previa);
    const v = (r: string) => d.linhas.find((l) => l.rotulo.startsWith(r))?.valor || 0;
    const receita = v('Receita líquida');
    const custo = -v('(−) Custo');
    return { nome, receita, custo, margem: receita ? ((receita - custo) / receita) * 100 : null, resultado: d.resultado };
  });
  return (
    <>
      <div className="cabeca"><div><h1>Custos e Preços</h1><p>Receita, custo de materiais e serviços e margem bruta por mês, a partir dos lançamentos {previa ? 'de todos os status (prévia)' : 'aprovados'}.</p></div></div>
      <form className="card linha" style={{ marginBottom: 16 }}>
        <div><label>Ano</label><input name="ano" defaultValue={ano} style={{ width: 100 }} /></div>
        <label className="linha" style={{ alignSelf: 'flex-end' }}><input type="checkbox" name="previa" value="1" defaultChecked={previa} /> Prévia</label>
        <button className="btn" style={{ alignSelf: 'flex-end' }}>Aplicar</button>
      </form>
      <div className="card"><div className="tabela-wrap"><table>
        <thead><tr><th>Mês</th><th className="num">Receita líquida</th><th className="num">Custo</th><th className="num">Margem bruta</th><th className="num">Resultado</th></tr></thead>
        <tbody>{meses.map((m) => <tr key={m.nome}><td>{m.nome}/{ano}</td><td className="num">{brl(m.receita)}</td><td className="num">{brl(m.custo)}</td><td className="num">{m.margem == null ? '—' : `${m.margem.toFixed(1).replace('.', ',')}%`}</td><td className={`num ${m.resultado < 0 ? 'neg' : ''}`}>{brl(m.resultado)}</td></tr>)}</tbody>
      </table></div></div>
      <div className="aviso" style={{ marginTop: 16 }}>Em construção: custo por hora de máquina e formação de preço por pedido.</div>
    </>
  );
}
