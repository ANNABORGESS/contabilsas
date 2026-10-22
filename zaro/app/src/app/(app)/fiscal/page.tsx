import { and, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import { tributosPresumido } from '@/domain/presumido';
import { dataDaCompetencia, regimeEm } from '@/domain/regime';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';

export default async function Fiscal({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const ano = /^\d{4}$/.test(sp.ano || '') ? sp.ano! : String(new Date().getFullYear());
  const db = await getDb();
  const receitas = await db
    .select({ comp: schema.titulos.competencia, cat: schema.titulos.categoria, total: sql<string>`sum(coalesce(${schema.titulos.valorFiscal}, ${schema.titulos.valor}))` })
    .from(schema.titulos)
    .where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'receber'), eq(schema.titulos.retorno, false), sql`${schema.titulos.status} not ilike '%cancel%'`, sql`${schema.titulos.competencia} like ${ano + '-%'}`))
    .groupBy(schema.titulos.competencia, schema.titulos.categoria);
  const dividas = await db.select().from(schema.dividasAtivas).where(eq(schema.dividasAtivas.empresaId, emp.id));
  const totalDiv = dividas.reduce((a, d) => a + (d.valor || 0), 0);

  const trimestres = [0, 1, 2, 3].map((t) => {
    const meses = [1, 2, 3].map((m) => `${ano}-${String(t * 3 + m).padStart(2, '0')}`);
    const regs = [...new Set(meses.map((c) => regimeEm(emp, dataDaCompetencia(c)) || '—'))];
    const r = receitas.filter((x) => x.comp && meses.includes(x.comp));
    const servicos = r.filter((x) => /servi/i.test(x.cat || '')).reduce((a, x) => a + Number(x.total), 0);
    const produtos = r.reduce((a, x) => a + Number(x.total), 0) - servicos;
    return { n: t + 1, regs, presumido: regs.every((x) => /presumido/i.test(x)), est: tributosPresumido({ produtos, servicos }) };
  });

  return (
    <>
      <div className="cabeca"><div><h1>Fiscal e Tributário</h1><p>Regime por vigência, estimativa do Lucro Presumido e passivo da dívida ativa. Nunca se usa DAS, anexo ou Fator R em competência do Presumido.</p></div></div>
      <form className="card linha" style={{ marginBottom: 16 }}>
        <div><label>Ano</label><input name="ano" defaultValue={ano} style={{ width: 100 }} /></div>
        <button className="btn" style={{ alignSelf: 'flex-end' }}>Aplicar</button>
        <span className="pequeno mudo" style={{ alignSelf: 'flex-end' }}>Histórico: {emp.regimeHist.length ? emp.regimeHist.map((h) => `${h.regime}${h.de ? ` desde ${dataBr(h.de)}` : ''}${h.ate ? ` até ${dataBr(h.ate)}` : ''}`).join(' · ') : emp.regime || 'não informado'}</span>
      </form>
      <div className="card">
        <h2>Tributos por trimestre · {ano}</h2>
        <p className="pequeno mudo">Estimativa sobre as NF de saída lançadas (sem retornos e canceladas), para conferência. Confirme antes de gerar as guias.</p>
        <div className="tabela-wrap"><table>
          <thead><tr><th>Trimestre</th><th>Regime</th><th className="num">Receita bruta</th><th className="num">IRPJ</th><th className="num">CSLL</th><th className="num">PIS</th><th className="num">COFINS</th><th className="num">Total</th></tr></thead>
          <tbody>{trimestres.map((t) => (
            <tr key={t.n}>
              <td>{t.n}º trimestre</td><td>{t.regs.join(' / ')}</td><td className="num">{brl(t.est.bruta)}</td>
              {t.presumido ? (<><td className="num">{brl(t.est.irpj)}</td><td className="num">{brl(t.est.csll)}</td><td className="num">{brl(t.est.pis)}</td><td className="num">{brl(t.est.cofins)}</td><td className="num"><b>{brl(t.est.total)}</b></td></>) : <td colSpan={5} className="pequeno mudo">{t.regs.some((r) => /simples/i.test(r)) ? 'Simples Nacional: apuração pelo DAS (histórico)' : 'Regime sem cálculo automático'}</td>}
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="linha" style={{ justifyContent: 'space-between' }}><h2>Dívida ativa (PGFN)</h2><b>{brl(totalDiv)}</b></div>
        {dividas.length ? (
          <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Inscrição</th><th>Natureza</th><th>Situação</th><th className="num">Valor</th><th>Atualizado em</th></tr></thead>
            <tbody>{dividas.map((d) => <tr key={d.id}><td>{d.inscricao}</td><td>{d.natureza || '—'}</td><td className="pequeno">{d.situacao || '—'}</td><td className="num">{brl(d.valor)}</td><td>{dataBr(d.atualizadoEm)}</td></tr>)}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhuma inscrição registrada.</div>}
        <p className="pequeno mudo">Pendente: contabilizar este passivo como saldo de abertura no passivo não circulante.</p>
      </div>
      <div className="card"><h2>SEFAZ</h2><p>Busca de NF-e, manifestação e consulta ficam em <Link href="/configuracoes?aba=sefaz">Configurações → Integração SEFAZ</Link>. Emissão de NF-e e CT-e ainda não está disponível.</p></div>
    </>
  );
}
