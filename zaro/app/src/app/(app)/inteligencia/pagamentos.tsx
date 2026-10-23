import Link from 'next/link';
import { getDb } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import { ETAPAS_PAGAMENTO } from '@/domain/inteligencia';
import { dadosPagamentos, FILTROS_PAGAMENTO } from '@/server/inteligencia';
import { ConferirBoleto } from '@/components/painel/Inteligencia';
import { agendarPagamentos, aprovarPagamentos, voltarPagamentos } from './acoes';
import { Card, type Props } from './comum';

export async function Pagamentos({ emp, hoje, sp, edita }: Props) {
  const d = await dadosPagamentos(await getDb(), emp, hoje, sp.f || 'abertos', sp.q || '');
  const r = d.resumo;
  const volta = `/inteligencia?aba=pagamentos&f=${d.f}${d.q ? `&q=${encodeURIComponent(d.q)}` : ''}`;
  return (
    <>
      <div className="indicadores">
        <Card rotulo="Total em aberto" cor="pessego" valor={brl(r.aberto)} fonte="Contas a Pagar"><span>{r.nAberto} título(s)</span></Card>
        <Card rotulo="Vencendo hoje" cor="rosa" valor={brl(r.hoje)} fonte="vencimento = hoje"><span>{r.nHoje} título(s)</span></Card>
        <Card rotulo="Próximos 7 dias" cor="lavanda" valor={brl(r.semana)} fonte="vencimento em até 7 dias"><span>{r.nSemana} título(s)</span></Card>
        <Card rotulo="Vencidos" cor="rosa" valor={<span className={r.vencidos ? 'neg' : ''}>{brl(r.vencidos)}</span>} fonte="vencimento passado, sem baixa"><span>{r.nVencidos} título(s)</span></Card>
        <Card rotulo="Programados" cor="menta" valor={brl(r.programados)} fonte="aprovados e agendados na ZARO"><span>{r.nProgramados} título(s) · {r.aguardando} documento(s) aguardando classificação</span></Card>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Fluxo do pagamento</h2>
        <p className="pequeno mudo">Documento recebido → conferência → título preparado → aprovação → agendamento → pago (baixa) → conciliado (extrato) → contabilizado. Receber boleto ou NF não autoriza pagamento: aprovar e agendar só registram a decisão na ZARO; o pagamento é feito por você no banco.</p>
        <div className="etapas">
          <span className="etapa"><b>{r.aguardando}</b>{ETAPAS_PAGAMENTO[0]}</span>
          {d.porEtapa.map((e) => <span key={e.etapa} className="etapa"><b>{e.n}</b>{e.etapa}</span>)}
        </div>
      </div>
      <div className="painel-grade" style={{ marginTop: 16 }}>
        <div className="card largo">
          <div className="linha" style={{ justifyContent: 'space-between' }}><h2>Lista operacional</h2>{(d.duplicidades > 0 || d.comAlerta > 0) && <Link href="/inteligencia?aba=pagamentos&f=revisao" className="tag neg">{d.comAlerta} título(s) com alerta</Link>}</div>
          <form className="linha" action="/inteligencia" style={{ margin: '10px 0' }}>
            <input type="hidden" name="aba" value="pagamentos" />
            <select name="f" defaultValue={d.f} aria-label="Filtro">{FILTROS_PAGAMENTO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
            <input name="q" defaultValue={d.q} placeholder="Fornecedor, NF ou código" style={{ maxWidth: 260 }} aria-label="Buscar" />
            <button className="btn mini" type="submit">Filtrar</button>
          </form>
          <form action={aprovarPagamentos}>
            <input type="hidden" name="volta" value={volta} />
            {d.linhas.length ? (
              <div className="tabela-wrap"><table className="compacta">
                <thead><tr>{edita && <th></th>}<th>Fornecedor</th><th>Documento</th><th>Emissão</th><th>Vencimento</th><th className="num">Valor</th><th>Status</th><th>Origem</th><th>Ação</th></tr></thead>
                <tbody>{d.linhas.map((l) => (
                  <tr key={l.id}>
                    {edita && <td>{l.aberto && <input type="checkbox" name="id" value={l.id} aria-label={`Selecionar ${l.codigo}`} />}</td>}
                    <td>{l.fornecedor}{l.alertas.map((a) => <div key={a} className="pequeno at">⚠ {a}</div>)}</td>
                    <td className="pequeno">{l.documento}<div className="mudo">{l.codigo}</div></td>
                    <td>{dataBr(l.emissao)}</td>
                    <td className={l.aberto && l.venc && l.venc < hoje ? 'neg' : ''}>{dataBr(l.venc)}</td>
                    <td className="num">{brl(l.valor)}</td>
                    <td><span className={`tag ${l.etapa === 'Agendado' || l.etapa === 'Aprovado' ? 'pos' : l.etapa === 'Título preparado' ? '' : 'acento'}`}>{l.etapa}</span>{l.agendadoPara && <div className="pequeno mudo">para {dataBr(l.agendadoPara)}</div>}</td>
                    <td className="pequeno">{l.origem}</td>
                    <td><Link className="btn mini" href={`/financeiro?tipo=pagar&f=todos&q=${encodeURIComponent(l.codigo)}`}>{l.aberto ? 'Abrir / baixar' : 'Ver'}</Link></td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <div className="vazio">Nenhum título neste filtro.</div>}
            {edita && d.linhas.some((l) => l.aberto) && (
              <div className="linha acoes-lote">
                <span className="pequeno mudo">Com os selecionados:</span>
                <button className="btn mini" type="submit" formAction={aprovarPagamentos} data-acao="aprovar">Aprovar pagamento</button>
                <input type="date" name="data" min={hoje} aria-label="Data do agendamento" />
                <button className="btn mini" type="submit" formAction={agendarPagamentos} data-acao="agendar">Agendar</button>
                <button className="btn mini" type="submit" formAction={voltarPagamentos} data-acao="voltar">Voltar para preparação</button>
              </div>
            )}
            {!edita && <p className="pequeno mudo">Perfil de consulta: aprovação e agendamento ficam bloqueados.</p>}
          </form>
        </div>
        <div className="card">
          <h2>Documentos em conferência</h2>
          <p className="pequeno mudo">XML/NF recebidos no <Link href="/autopilot">Autopilot</Link> ainda não aprovados. A conferência roda antes de virar título; com divergência, o documento fica para revisão.</p>
          {d.conferencia.length ? d.conferencia.map((c) => (
            <details key={c.id} className="conferencia">
              <summary><b>{c.fornecedor}</b> · NF {c.numero} · {brl(c.valor)} <span className={`tag ${c.divergencias ? 'at' : 'pos'}`}>{c.divergencias ? `${c.divergencias} divergência(s)` : 'Sem divergência'}</span><span className="pequeno mudo"> · {c.canal} · confiança {c.confianca}%</span></summary>
              <ul className="tarefas">{c.checks.map((k) => <li key={k.item} className={k.ok ? 'ok' : 'erro'}><b>{k.item}:</b> {k.detalhe}</li>)}</ul>
              <Link className="btn mini" href="/autopilot">{c.divergencias ? 'Revisar no Autopilot' : 'Aprovar no Autopilot'}</Link>
            </details>
          )) : <div className="vazio">Nenhum documento aguardando.</div>}
          <p className="pequeno mudo" style={{ marginTop: 10 }}>Fontes ligadas hoje: upload de XML/ZIP no Autopilot e lista da SEFAZ. E-mail, PDF de boleto e Portal do Cliente ainda não têm captura automática.</p>
        </div>
        <ConferirBoleto titulos={d.paraBoleto} hoje={hoje} />
      </div>
    </>
  );
}
