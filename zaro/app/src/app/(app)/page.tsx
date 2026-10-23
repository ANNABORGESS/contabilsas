import { and, count, eq } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl } from '@/domain/dinheiro';
import { STATUS_NO_LIVRO } from '@/domain/motor';
import { regimeEm } from '@/domain/regime';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { lancamentosDaEmpresa } from '@/server/contabil';
import { AtalhoBusca } from '@/components/Topo';
import { auditoriaRecente, resumoFinanceiro } from '@/server/consultas';

function saudacao() {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Manaus' }).format(new Date()));
  return h < 12 ? 'Bom dia.' : h < 18 ? 'Boa tarde.' : 'Boa noite.';
}

/** Anel de progresso do fechamento, como no protótipo. */
function Anel({ pct }: { pct: number }) {
  const r = 56, c = 2 * Math.PI * r;
  return (
    <div className="anel" role="img" aria-label={`Fechamento ${pct}%`}>
      <svg width="136" height="136" viewBox="0 0 136 136">
        <circle cx="68" cy="68" r={r} fill="none" stroke="#ebe5df" strokeWidth="11" />
        {pct > 0 && <circle cx="68" cy="68" r={r} fill="none" stroke="#8fbf9f" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 68 68)" className="anel-arco" />}
      </svg>
      <div className="anel-txt"><b>{pct}%</b><span>Fechamento</span></div>
    </div>
  );
}

export default async function Dashboard() {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const db = await getDb();
  const hoje = new Date().toISOString().slice(0, 10);
  const [fin, lancs, [{ novos }], atividade] = await Promise.all([
    resumoFinanceiro(db, emp.id, hoje),
    lancamentosDaEmpresa(db, emp),
    db.select({ novos: count() }).from(schema.documentosEntrada).where(and(eq(schema.documentosEntrada.empresaId, emp.id), eq(schema.documentosEntrada.status, 'Novo'))),
    auditoriaRecente(db, u.tenantId, emp.id),
  ]);
  const comp = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 7);
  const doMes = lancs.filter((l) => l.comp === comp);
  const fechados = doMes.filter((l) => STATUS_NO_LIVRO.includes(l.status)).length;
  const pctFech = doMes.length ? Math.round((fechados / doMes.length) * 100) : 0;
  const aAprovar = lancs.filter((l) => !STATUS_NO_LIVRO.includes(l.status)).length;
  const emRevisao = lancs.filter((l) => l.status === 'Em revisão').length;
  const saldoPrevisto = fin.receber.total - fin.pagar.total;

  const prioridades = [
    novos > 0 && { t: `${novos} documento(s) novo(s) no Autopilot`, href: '/autopilot' },
    fin.pagarVencido.n > 0 && { t: `${fin.pagarVencido.n} título(s) a pagar vencido(s): ${brl(fin.pagarVencido.total)}`, href: '/financeiro?tipo=pagar&f=vencidos' },
    fin.receberVencido.n > 0 && { t: `${fin.receberVencido.n} título(s) a receber vencido(s): ${brl(fin.receberVencido.total)}`, href: '/financeiro?tipo=receber&f=vencidos' },
    emRevisao > 0 && { t: `${emRevisao} lançamento(s) sem classificação segura`, href: '/contabilidade?st=Em%20revis%C3%A3o' },
  ].filter(Boolean) as { t: string; href: string }[];

  return (
    <>
      <div className="cabeca">
        <div>
          <h1>{saudacao()}</h1>
          <p>Aqui está o que exige sua atenção hoje · {emp.fantasia || emp.razao} · {regimeEm(emp, hoje) || 'regime não informado'}</p>
        </div>
        <AtalhoBusca />
      </div>

      <div className="card fechamento">
        <Anel pct={pctFech} />
        <div>
          <div className="mudo">Fechamento contábil</div>
          <div className="competencia">{comp.split('-').reverse().join('/')}</div>
          <div className="mudo pequeno">{fechados} de {doMes.length} lançamentos da competência aprovados</div>
          <Link href="/contabilidade" className="btn mini" style={{ marginTop: 12 }}>Ver fechamento</Link>
        </div>
      </div>

      <div className="card faixa">
        <Link href="/financeiro?tipo=pagar&f=vencidos" className="kpi"><div className="rotulo">Vencidos</div><div className="v neg">{fin.pagarVencido.n}</div><div className="s">títulos a pagar</div></Link>
        <Link href="/contabilidade" className="kpi"><div className="rotulo">A aprovar</div><div className="v">{aAprovar}</div><div className="s">lançamentos contábeis</div></Link>
        <Link href="/autopilot" className="kpi"><div className="rotulo">Autopilot</div><div className="v">{novos}</div><div className="s">documentos aguardando</div></Link>
        <Link href="/financeiro?tipo=receber&f=vencidos" className="kpi"><div className="rotulo">A receber vencido</div><div className="v at">{fin.receberVencido.n}</div><div className="s">{brl(fin.receberVencido.total)}</div></Link>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Posição financeira</h2>
        <div className="grade g3" style={{ marginTop: 14 }}>
          <div className="kpi"><div className="rotulo">Contas a receber</div><div className="v pos">{brl(fin.receber.total)}</div><div className="s">{fin.receber.n} título(s) em aberto</div></div>
          <div className="kpi"><div className="rotulo">Contas a pagar</div><div className="v neg">{brl(fin.pagar.total)}</div><div className="s">{fin.pagar.n} título(s) em aberto</div></div>
          <div className="kpi"><div className="rotulo">Saldo previsto</div><div className={`v ${saldoPrevisto < 0 ? 'neg' : ''}`}>{brl(saldoPrevisto)}</div><div className="s">receber − pagar</div></div>
        </div>
      </div>

      <div className="grade g2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Prioridades</h2>
          {prioridades.length ? (
            <ul style={{ paddingLeft: 18, marginBottom: 0 }}>{prioridades.map((p) => <li key={p.t} style={{ margin: '8px 0' }}><Link href={p.href}>{p.t}</Link></li>)}</ul>
          ) : (
            <p className="mudo">Nada urgente agora.</p>
          )}
        </div>
        <div className="card">
          <div className="linha" style={{ justifyContent: 'space-between' }}><h2>Atividade recente</h2><Link href="/auditoria" className="pequeno">Ver tudo</Link></div>
          {atividade.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
              {atividade.map((a) => (
                <li key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--divisor)' }}>
                  {a.acao}{a.entidade ? ` · ${a.entidade}` : ''}
                  <div className="pequeno mudo">{a.usuario} · {a.quando.toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mudo">Sem atividade ainda.</p>
          )}
        </div>
      </div>
    </>
  );
}
