import Link from 'next/link';
import { getDb } from '@/db';
import { brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { notaCancelada } from '@/domain/notas-sefaz';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { ehSaida, FILTROS_NOTA, notasFiltradas } from '@/server/notas-sefaz';
import { BotaoEnviar } from '@/components/BotaoEnviar';
import { desfazer, importar, lancar, receber } from './acoes';

export default async function NotasSefaz({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; msg?: string; erro?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const { f, q, lista, resumo } = await notasFiltradas(await getDb(), emp, sp.f, sp.q);
  const edita = podeEditar(u);
  const volta = `/fiscal/notas?f=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const mostrar = lista.slice(0, 300);
  return (
    <>
      <div className="cabeca"><div><h1>Fiscal e Tributário</h1><p>Lista de NF do portal da SEFAZ-AM: recebimento da mercadoria (com selagem e pedido) e controle do que já foi lançado.</p></div></div>
      <div className="abas"><Link href="/fiscal">Apuração</Link><Link href="/fiscal/creditos">Impostos a recuperar</Link><Link href="/fiscal/notas" className="ativo">NF da SEFAZ</Link><Link href="/fiscal/reforma">Reforma Tributária</Link></div>
      {sp.msg && <div className="aviso ok">{sp.msg}</div>}
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      <div className="card faixa" style={{ marginTop: 0, marginBottom: 16 }}>
        <Link href="/fiscal/notas?f=areceber" className="kpi"><div className="rotulo">A receber</div><div className="v at">{resumo.aReceber}</div><div className="s">mercadoria não conferida</div></Link>
        <Link href="/fiscal/notas?f=alancar" className="kpi"><div className="rotulo">Falta lançar</div><div className="v">{resumo.aLancar}</div><div className="s">recebidas ou de saída, sem lançamento</div></Link>
        <Link href="/fiscal/notas?f=forazaro" className="kpi"><div className="rotulo">Fora da ZARO</div><div className="v neg">{resumo.foraZaro}</div><div className="s">sem título nem XML no Autopilot</div></Link>
        <Link href="/fiscal/notas?f=canceladas" className="kpi"><div className="rotulo">Canceladas</div><div className="v">{resumo.canceladas}</div><div className="s">de {resumo.total} na lista</div></Link>
      </div>
      {edita && (
        <div className="card">
          <details open={!resumo.total}>
            <summary>Importar planilha da SEFAZ</summary>
            <form action={importar} className="linha" style={{ marginTop: 12 }}>
              <input type="hidden" name="volta" value={volta} />
              <input type="file" name="planilha" accept=".xlsx,.csv" required style={{ flex: 1, minWidth: 240 }} />
              <BotaoEnviar texto="Importar" enviando="Importando…" />
            </form>
            <p className="pequeno mudo" style={{ marginBottom: 0 }}>Planilha .xlsx ou .csv na ordem do portal (UF, chave, número, série, emissão, emissor, destinatário, CFOP, selagem, situação, tipo, valor) ou com esses títulos. Pode importar de novo: notas repetidas não duplicam e a situação é atualizada (ex.: nota cancelada depois). Se o portal der .xls, abra no Excel e salve como .xlsx.</p>
          </details>
        </div>
      )}
      <div className="card">
        <form className="linha" action="/fiscal/notas">
          <select name="f" defaultValue={f} style={{ width: 220 }}>{FILTROS_NOTA.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <input name="q" defaultValue={q} placeholder="Chave, número, emissor, pedido, CFOP" style={{ flex: 1, minWidth: 200 }} />
          <button className="btn" type="submit">Filtrar</button>
          <a className="btn" href={`/fiscal/notas/exportar?f=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>Excel</a>
        </form>
        {mostrar.length ? (
          <div className="tabela-wrap" style={{ marginTop: 12 }}><table>
            <thead><tr><th>NF</th><th>Emissão</th><th>Emissor → Destinatário</th><th>CFOP</th><th>Selagem</th><th>Situação</th><th className="num">Valor</th><th>Controle</th></tr></thead>
            <tbody>{mostrar.map(({ n, naZaro }) => {
              const canc = notaCancelada(n.situacao);
              const saida = ehSaida(n, emp);
              return (
                <tr key={n.id} style={canc ? { opacity: 0.6 } : undefined}>
                  <td><b>{n.numero}</b>{n.serie && <span className="mudo">/{n.serie}</span>}<div className="pequeno mudo" title={n.chave}>{n.chave.slice(0, 4)}…{n.chave.slice(-6)}</div></td>
                  <td>{dataBr(n.emissao)}</td>
                  <td>{n.razaoEmit || '—'}<div className="pequeno mudo">{n.cnpjEmit ? formatarCnpj(n.cnpjEmit) : ''} → {n.razaoDest || '—'}</div></td>
                  <td>{n.cfop || '—'}</td>
                  <td className="pequeno">{n.selagem || '—'}</td>
                  <td><span className={`tag ${canc ? 'neg' : ''}`}>{n.situacao || '—'}</span>{!canc && <div className="pequeno" style={{ marginTop: 4 }}>{naZaro ? <span className="pos">na ZARO</span> : <span className="neg">fora da ZARO</span>}</div>}</td>
                  <td className="num">{brl(n.valor)}</td>
                  <td className="pequeno" style={{ minWidth: 190 }}>
                    {n.recebidoEm && <div className="pos">Recebida {n.recebidoEm.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })}{n.pedido ? ` · ped. ${n.pedido}` : ''}</div>}
                    {n.lancadoEm && <div className="pos">Lançada {n.lancadoEm.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })}</div>}
                    {saida && !canc && <div className="mudo">Saída (emitida pela empresa)</div>}
                    {edita && !canc && !saida && !n.recebidoEm && (
                      <details><summary>Receber</summary>
                        <form action={receber} className="campos" style={{ marginTop: 6 }}>
                          <input type="hidden" name="id" value={n.id} /><input type="hidden" name="volta" value={volta} />
                          <input name="pedido" placeholder="Nº do pedido (opcional)" />
                          <label className="linha" style={{ fontWeight: 500 }}><input type="checkbox" name="mesmoAssim" /> pedido repetido, receber assim mesmo</label>
                          <button className="btn mini" type="submit">Confirmar recebimento</button>
                        </form>
                      </details>
                    )}
                    {edita && (n.recebidoEm || saida) && !canc && !n.lancadoEm && (
                      <form action={lancar} style={{ marginTop: 4 }}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="volta" value={volta} /><button className="btn mini" type="submit">Marcar lançada</button></form>
                    )}
                    {edita && (n.recebidoEm || n.lancadoEm) && (
                      <form action={desfazer} style={{ marginTop: 4 }}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="volta" value={volta} /><button className="btn mini perigo" type="submit">Desfazer {n.lancadoEm ? 'lançamento' : 'recebimento'}</button></form>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <div className="vazio">{resumo.total ? 'Nenhuma nota com esse filtro.' : 'Importe a planilha do portal da SEFAZ para começar.'}</div>}
        {lista.length > mostrar.length && <p className="pequeno mudo">Mostrando 300 de {lista.length}. Use a busca ou baixe o Excel para ver todas.</p>}
      </div>
    </>
  );
}
