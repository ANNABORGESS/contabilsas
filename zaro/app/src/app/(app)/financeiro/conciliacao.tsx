import Link from 'next/link';
import { getDb } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import type { Empresa, Usuario } from '@/server/auth';
import { dadosConciliacao, FILTROS_CONCILIACAO } from '@/server/financeiro-analises';
import { conciliarAcao, definirSaldo } from './acoes';

const COR_SIT: Record<string, string> = { Conciliado: 'pos', Classificado: 'acento', Pendente: 'at', 'Transferência própria': '' };

export async function Conciliacao({ u, emp, sp, edita, cabeca }: { u: Usuario; emp: Empresa; sp: { f?: string; conta?: string }; edita: boolean; cabeca: React.ReactNode }) {
  const f = FILTROS_CONCILIACAO.some(([k]) => k === sp.f) ? sp.f! : 'pendentes';
  const d = await dadosConciliacao(await getDb(), u, emp, f, sp.conta || '');
  const volta = `/financeiro?tipo=extrato&f=${f}${sp.conta ? `&conta=${encodeURIComponent(sp.conta)}` : ''}`;
  const r = d.resumo;
  const pct = d.total ? Math.round(((r.conciliados + r.classificados + r.proprias) / d.total) * 100) : null;
  return (
    <>
      {cabeca}
      <div className="grade g4" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="rotulo">Conciliado</div><div className="v">{pct == null ? '—' : `${pct}%`}</div><div className="s">{r.conciliados} com título · {r.classificados} classificados</div></div>
        <div className="card kpi"><div className="rotulo">Pendentes</div><div className={`v ${r.pendentes ? 'at' : ''}`}>{r.pendentes}</div><div className="s">movimentos sem título nem conta segura</div></div>
        <div className="card kpi"><div className="rotulo">Entradas / saídas</div><div className="v" style={{ fontSize: 18 }}>{brl(r.entradas)}</div><div className="s">saídas {brl(r.saidas)}</div></div>
        <div className="card kpi"><div className="rotulo">Saldo bancário</div><div className="v">{d.saldo ? brl(d.saldo.atual) : '—'}</div><div className="s">{d.saldo ? `extrato até ${dataBr(d.saldo.ultimoMovimento)}` : 'informe o saldo inicial abaixo'}</div></div>
      </div>
      <div className="card" id="saldo" style={{ marginBottom: 16 }}>
        <h2>Saldo bancário</h2>
        {d.saldo ? (
          <p>Saldo atual: <b className={d.saldo.atual < 0 ? 'neg' : ''}>{brl(d.saldo.atual)}</b> · saldo inicial de {brl(d.saldo.inicial.valor)} em {dataBr(d.saldo.inicial.data)} mais os movimentos do extrato até {dataBr(d.saldo.ultimoMovimento)}. Confira com o saldo do extrato do banco no mesmo dia.</p>
        ) : (
          <p className="mudo">Informe o saldo do banco numa data (o do extrato daquele dia). A ZARO soma os movimentos posteriores e mostra o saldo no Dashboard.</p>
        )}
        {edita && (
          <form action={definirSaldo} className="linha" style={{ marginTop: 10 }}>
            <input type="hidden" name="volta" value="/financeiro?tipo=extrato" />
            <div><label>Data do saldo</label><input type="date" name="data" required defaultValue={d.saldo?.inicial.data} /></div>
            <div><label>Saldo no fim do dia (R$)</label><input name="valor" required inputMode="decimal" defaultValue={d.saldo ? String(d.saldo.inicial.valor).replace('.', ',') : ''} /></div>
            <button className="btn primario" type="submit">{d.saldo ? 'Atualizar saldo inicial' : 'Gravar saldo inicial'}</button>
          </form>
        )}
      </div>
      <div className="card">
        <form className="linha" action="/financeiro" style={{ marginBottom: 12 }}>
          <input type="hidden" name="tipo" value="extrato" />
          <select name="f" defaultValue={f} style={{ width: 180 }}>{FILTROS_CONCILIACAO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <select name="conta" defaultValue={sp.conta || ''} style={{ width: 220 }}><option value="">Todas as contas</option>{d.contas.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn" type="submit">Filtrar</button>
          <span className="pequeno mudo">A ZARO liga sozinha o movimento ao título de mesmo valor e data próxima. Os pendentes ficam aqui com sugestões.</span>
        </form>
        {d.lista.length ? (
          <div className="tabela-wrap"><table className="compacta">
            <thead><tr><th>Data</th><th>Conta</th><th>Histórico</th><th className="num">Valor</th><th>Situação</th><th>Título / sugestão</th></tr></thead>
            <tbody>{d.lista.map((m) => (
              <tr key={m.id}>
                <td>{dataBr(m.data)}</td><td className="pequeno">{m.conta}</td><td>{m.memo}</td>
                <td className={`num ${m.valor < 0 ? 'neg' : 'pos'}`}>{brl(m.valor)}</td>
                <td><span className={`tag ${COR_SIT[m.situacao]}`}>{m.situacao}</span>{m.manual && <div className="pequeno mudo">manual</div>}</td>
                <td className="pequeno">
                  {m.titulo ? <Link href={`/financeiro?tipo=${m.valor > 0 ? 'receber' : 'pagar'}&f=todos&q=${encodeURIComponent(m.titulo.codigo)}`}>{m.titulo.codigo} · {m.titulo.nome}</Link>
                    : m.situacao === 'Pendente' ? (m.sugestoes.length ? m.sugestoes.map((s) => (
                      <form key={s.id} action={conciliarAcao} className="linha sugestao-conc">
                        <input type="hidden" name="volta" value={volta} /><input type="hidden" name="mov" value={m.id} /><input type="hidden" name="titulo" value={s.id} />
                        <span><b>{s.codigo}</b> · {s.nome} · {brl(s.saldo)} · vence {dataBr(s.venc)}<span className="mudo"> ({s.motivo})</span></span>
                        {edita && <button className="btn mini primario" type="submit">Conciliar</button>}
                      </form>
                    )) : <span className="mudo">Sem título parecido. Lance o título ou classifique na <Link href={`/contabilidade?q=${encodeURIComponent(m.memo.slice(0, 20))}`}>Contabilidade</Link>.</span>)
                      : <span className="mudo">{m.classificacao}</span>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="vazio">{d.total ? 'Nenhum movimento neste filtro.' : 'Nenhum extrato importado ainda. Os extratos entram pela importação do backup em Configurações.'}</div>}
      </div>
    </>
  );
}
