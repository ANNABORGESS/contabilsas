import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { trimestresPresumido } from '@/server/fiscal';

export default async function Fiscal({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const ano = /^\d{4}$/.test(sp.ano || '') ? sp.ano! : String(new Date().getFullYear());
  const db = await getDb();
  const dividas = await db.select().from(schema.dividasAtivas).where(eq(schema.dividasAtivas.empresaId, emp.id));
  const totalDiv = dividas.reduce((a, d) => a + (d.valor || 0), 0);

  const trimestres = await trimestresPresumido(db, emp, ano);

  return (
    <>
      <div className="cabeca"><div><h1>Fiscal e Tributário</h1><p>Regime por vigência, estimativa do Lucro Presumido e passivo da dívida ativa. Nunca se usa DAS, anexo ou Fator R em competência do Presumido.</p></div></div>
      <div className="abas"><Link href="/fiscal" className="ativo">Apuração</Link><Link href="/fiscal/notas">NF da SEFAZ</Link><Link href="/fiscal/reforma">Reforma Tributária</Link></div>
      <form className="card linha" style={{ marginBottom: 16 }}>
        <div><label>Ano</label><input name="ano" defaultValue={ano} style={{ width: 100 }} /></div>
        <button className="btn" style={{ alignSelf: 'flex-end' }}>Aplicar</button>
        <span className="pequeno mudo" style={{ alignSelf: 'flex-end' }}>Histórico: {emp.regimeHist.length ? emp.regimeHist.map((h) => `${h.regime}${h.de ? ` desde ${dataBr(h.de)}` : ''}${h.ate ? ` até ${dataBr(h.ate)}` : ''}`).join(' · ') : emp.regime || 'não informado'}</span>
      </form>
      <div className="card">
        <h2>Tributos por trimestre · {ano}</h2>
        <p className="pequeno mudo">Estimativa sobre as NF de saída lançadas (sem retornos e canceladas), para conferência. Presunção de 8%/12% para produtos e 32% para serviços; ICMS destacado fora da base de PIS/COFINS (Tema 69 do STF); IRRF retido pelos clientes abatido do IRPJ. Desde 2026, a receita acima de R$ 5 milhões no ano (R$ 1,25 mi por trimestre, com ajuste no 4º) tem presunção 10% maior (LC 224/2025); a CSLL só majora a partir do 2º trimestre de 2026. Receitas financeiras ainda não entram. Confira na Receita Federal antes de gerar as guias.</p>
        <div className="tabela-wrap"><table>
          <thead><tr><th>Trimestre</th><th>Regime</th><th className="num">Receita bruta</th><th className="num">IRPJ</th><th className="num">CSLL</th><th className="num">PIS</th><th className="num">COFINS</th><th className="num">Total</th></tr></thead>
          <tbody>{trimestres.map((t) => (
            <tr key={t.n}>
              <td>{t.n}º trimestre</td><td>{t.regs.join(' / ')}</td><td className="num">{brl(t.est.bruta)}</td>
              {t.presumido ? (<><td className="num">{brl(t.est.irpj)}{t.irrfRetido > 0 && <div className="pequeno mudo">− IRRF {brl(t.irrfRetido)}</div>}{t.lc.irpj !== 0 && <div className="pequeno at">LC 224: base {t.lc.irpj > 0 ? '+' : '−'} {brl(Math.abs(t.lc.irpj))}</div>}</td><td className="num">{brl(t.est.csll)}{t.lc.csll !== 0 && <div className="pequeno at">LC 224: base {t.lc.csll > 0 ? '+' : '−'} {brl(Math.abs(t.lc.csll))}</div>}</td><td className="num">{brl(t.est.pis)}{t.icms > 0 && <div className="pequeno mudo">base sem ICMS</div>}</td><td className="num">{brl(t.est.cofins)}</td><td className="num"><b>{brl(t.est.total)}</b></td></>) : <td colSpan={5} className="pequeno mudo">{t.regs.some((r) => /simples/i.test(r)) ? 'Simples Nacional: apuração pelo DAS (histórico)' : 'Regime sem cálculo automático'}</td>}
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
