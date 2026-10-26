// Relatório do Financeiro para imprimir ou salvar em PDF (o navegador abre a janela de impressão).
import { getDb } from '@/db';
import { brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { pagosPorTitulo, titulosFiltrados } from '@/server/consultas';
import { Imprimir } from './Imprimir';

export default async function Relatorio({ searchParams }: { searchParams: Promise<{ tipo?: string; f?: string; q?: string; mes?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const tipo = sp.tipo === 'receber' ? 'receber' : 'pagar';
  const hoje = new Date().toISOString().slice(0, 10);
  const db = await getDb();
  const [{ lista, nomeFiltro, q }, pagos] = await Promise.all([titulosFiltrados(db, emp.id, tipo, sp.f, sp.q, hoje), pagosPorTitulo(db, emp.id)]);
  const mes = /^\d{4}-\d{2}$/.test(sp.mes || '') ? sp.mes! : null;
  const linhas = lista.filter((t) => !mes || t.venc?.startsWith(mes)).map((t) => { const pago = pagos.get(t.id) || 0; return { t, pago, saldo: Math.max(0, t.valor - pago) }; });
  const soma = (k: 'pago' | 'saldo') => linhas.reduce((a, l) => a + l[k], 0);
  const total = linhas.reduce((a, l) => a + l.t.valor, 0);
  return (
    <div className="relatorio">
      <div className="cabeca">
        <div>
          <h1>{tipo === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber'}</h1>
          <p>{emp.razao}{emp.cnpj ? ` · CNPJ ${formatarCnpj(emp.cnpj)}` : ''} · {nomeFiltro}{mes ? ` · vencimentos de ${mes.split('-').reverse().join('/')}` : ''}{q ? ` · busca “${q}”` : ''} · emitido em {dataBr(hoje)}</p>
        </div>
        <Imprimir />
      </div>
      <div className="card">
        <div className="tabela-wrap"><table>
          <thead><tr><th>Título</th><th>{tipo === 'pagar' ? 'Fornecedor' : 'Cliente'}</th><th>NF</th><th>Parc.</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Pago</th><th className="num">Saldo</th><th>Status</th></tr></thead>
          <tbody>
            {linhas.map(({ t, pago, saldo }) => (
              <tr key={t.id}>
                <td>{t.codigo}</td>
                <td>{t.nome}{t.docParceiro && <div className="pequeno mudo">{formatarCnpj(t.docParceiro)}</div>}</td>
                <td>{t.nf || '—'}</td>
                <td>{t.parcela}</td>
                <td>{dataBr(t.venc)}</td>
                <td className="num">{brl(t.valor)}</td>
                <td className="num">{pago ? brl(pago) : '—'}</td>
                <td className="num">{brl(saldo)}</td>
                <td>{t.status}</td>
              </tr>
            ))}
            <tr className="destaque"><td colSpan={5}>Total · {linhas.length} título(s)</td><td className="num">{brl(total)}</td><td className="num">{brl(soma('pago'))}</td><td className="num">{brl(soma('saldo'))}</td><td /></tr>
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
