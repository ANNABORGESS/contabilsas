// Relatório de Auditoria DP (PDF pela impressão do navegador).
import { getDb } from '@/db';
import { brl, formatarCnpj } from '@/domain/dinheiro';
import { auditar } from '@/server/auditoria';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { dadosDP, exigirDP } from '@/server/dp';
import { Imprimir } from './Imprimir';
import './relatorio.css';

export const dynamic = 'force-dynamic';
const compBr = (c: string | null) => (c ? c.split('-').reverse().join('/') : '—');
const cls = (s: string) => (s === 'Conferido' || s === 'Confere' || s === 'Conciliado' || s === 'Pago' ? 'ok' : s === 'Divergente' || s === 'Pendente de comprovação' ? 'neg' : 'at');

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ comp?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  return { title: `Auditoria_DP_${(await searchParams).comp || ''}_${emp.razao.replace(/[^\w]+/g, '_')}` };
}

export default async function RelatorioDP({ searchParams }: { searchParams: Promise<{ comp?: string }> }) {
  const u = await exigirUsuario();
  exigirDP(u);
  const emp = await exigirEmpresa(u);
  const comp = (await searchParams).comp || null;
  const db = await getDb();
  const d = await dadosDP(db, emp, comp);
  await auditar(db, u, { empresaId: emp.id, acao: 'Gerou relatório de auditoria DP', entidade: compBr(d.comp) });
  const problemas = d.linhas.filter((l) => l.status !== 'Conferido');
  const pend = [
    ...d.obrigacoes.filter((o) => !['Pago', 'Conciliado'].includes(o.status)).map((o) => `${o.tributo}: ${o.status}`),
    ...d.esocial.filter((e) => e.status === 'Rejeitado').map((e) => `eSocial rejeitado: ${e.descricao}`),
    ...d.contabil.filter((x) => x.achado !== 'Confere').map((x) => `${x.item}: ${x.achado}`),
  ];
  const recomend = [...new Set(problemas.map((p) => p.acao).filter((a) => a && a !== '—'))];
  return (
    <div className="rd">
      <Imprimir />
      <div className="rd-cab">
        <div><h1>Relatório de Auditoria — Departamento Pessoal</h1><div>{emp.razao} · CNPJ {formatarCnpj(emp.cnpj)}</div></div>
        <div style={{ textAlign: 'right' }}><b>Competência {compBr(d.comp)}</b><div>Análise em {new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })}</div></div>
      </div>
      <div className="rd-kpis">
        <div><span>Funcionários</span><b>{d.totais.funcionarios}</b></div>
        <div><span>Total da folha (vencimentos)</span><b>{brl(d.totais.vencimentos)}</b></div>
        <div><span>Encargos (FGTS + INSS seg. + IRRF)</span><b>{brl(d.totais.fgts + d.totais.inss + d.totais.irrf)}</b></div>
        <div><span>Itens conferidos</span><b>{d.linhas.filter((l) => l.status === 'Conferido').length} / {d.linhas.length}</b></div>
      </div>
      <h2>Divergências e itens para revisão ({problemas.length})</h2>
      {problemas.length ? (
        <table><thead><tr><th>Funcionário</th><th>Item</th><th className="n">Informado</th><th className="n">Conferido</th><th className="n">Diferença</th><th>Status</th><th>Motivo</th></tr></thead>
          <tbody>{problemas.map((l) => <tr key={l.chave}><td>{l.funcionario}</td><td>{l.item}</td><td className="n">{l.informado != null ? brl(l.informado) : '—'}</td><td className="n">{l.conferido != null ? brl(l.conferido) : '—'}</td><td className="n">{l.diferenca != null ? brl(l.diferenca) : '—'}</td><td className={cls(l.status)}>{l.status}</td><td>{l.motivo}{l.revisao ? ` · revisão: ${l.revisao.nota || l.revisao.decisao} (${l.revisao.por})` : ''}</td></tr>)}</tbody></table>
      ) : <p>Nenhuma divergência: todos os itens conferidos.</p>}
      <h2>Encargos e guias</h2>
      <table><thead><tr><th>Tributo</th><th className="n">Calculado</th><th className="n">Declarado</th><th className="n">Guia</th><th className="n">Pago</th><th>Status</th></tr></thead>
        <tbody>{d.obrigacoes.map((o) => <tr key={o.tributo}><td>{o.tributo}</td><td className="n">{brl(o.calculado)}</td><td className="n">{o.declarado != null ? brl(o.declarado) : '—'}</td><td className="n">{o.guia != null ? brl(o.guia) : '—'}</td><td className="n">{o.pago != null ? brl(o.pago) : '—'}</td><td className={cls(o.status)}>{o.status}</td></tr>)}</tbody></table>
      {d.contabil.length > 0 && <><h2>Folha × contabilidade</h2>
        <table><thead><tr><th>Item</th><th className="n">Folha</th><th className="n">Razão</th><th>Achado</th></tr></thead><tbody>{d.contabil.map((x) => <tr key={x.item}><td>{x.item}</td><td className="n">{brl(x.folha)}</td><td className="n">{brl(x.razao)}</td><td className={cls(x.achado)}>{x.achado}</td></tr>)}</tbody></table></>}
      <h2>Pendências</h2>
      {pend.length ? <ul>{pend.map((p) => <li key={p}>{p}</li>)}</ul> : <p>Nenhuma.</p>}
      <h2>Recomendações</h2>
      {recomend.length ? <ul>{recomend.map((r) => <li key={r}>{r}</li>)}</ul> : <p>Sem recomendações adicionais.</p>}
      <h2>Parecer</h2>
      <p>{d.conf?.parecer || 'Conferência ainda não concluída.'}</p>
      <p style={{ color: '#6b7280' }}>A folha foi processada e transmitida no sistema externo de DP. Esta conferência não comprova transmissão de obrigações nem pagamentos. Tabelas usadas: INSS, IRRF e FGTS oficiais da competência, versionadas no ZARO.</p>
      <div className="rd-ass"><div><span />Responsável pela revisão: {d.conf?.responsavel || u.nome}</div><div><span />{emp.razao}</div></div>
    </div>
  );
}
