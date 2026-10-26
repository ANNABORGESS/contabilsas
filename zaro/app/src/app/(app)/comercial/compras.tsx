import { FecharMenu } from '@/components/FecharMenu';
import { getDb } from '@/db';
import { compararCotacoes, type Cotacao, etapasCompra, FLUXO, rotuloDoc } from '@/domain/comercial';
import { addDias, brl, dataBr } from '@/domain/dinheiro';
import { docsDaEmpresa } from '@/server/comercial-docs';
import { cotacaoAcao, criarDocAcao, gerarCompraAcao, mudarStatusAcao, receberCompraAcao } from './acoes';
import { Avisos, BotoesStatus, Cabeca, type ItemCatalogo, LinhasItens, type Parceiro, tagStatus } from './comum';

export async function Compras({ empId, edita, fornecedores, catalogo, hoje, msg, erro }: { empId: string; edita: boolean; fornecedores: Parceiro[]; catalogo: ItemCatalogo[]; hoje: string; msg?: string; erro?: string }) {
  const lista = await docsDaEmpresa(await getDb(), empId, ['solicitacao', 'compra']);
  const sols = lista.filter((d) => d.tipo === 'solicitacao');
  const compras = lista.filter((d) => d.tipo === 'compra');
  const etapas = etapasCompra(sols, compras);
  return (
    <>
      <Cabeca titulo="Compras e cotação" sub="Solicitação → aprovação → cotação com até 3 fornecedores → pedido de compra → recebimento → Contas a Pagar." />
      <Avisos msg={msg} erro={erro} />
      <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 16 }}>
        {etapas.map((e, k) => (
          <div key={e.nome} className="card kpi"><div className="rotulo">{k + 1}. {e.nome}</div><div className="v">{e.qtd}</div><div className="s">{k < 3 ? 'solicitação(ões)' : 'pedido(s) de compra'}</div></div>
        ))}
      </div>
      <datalist id="fornecedores">{fornecedores.map((f) => <option key={f.id} value={f.razao} />)}</datalist>
      {edita && (
        <div className="card" style={{ marginBottom: 16 }}>
          <details open={!lista.length}>
            <summary>Nova solicitação de compra</summary>
            <form action={criarDocAcao} className="campos" style={{ marginTop: 12 }}>
              <input type="hidden" name="tipo" value="solicitacao" />
              <div className="grade g4">
                <div><label>Data</label><input type="date" name="data" defaultValue={hoje} required /></div>
                <div><label>Precisa até</label><input type="date" name="prazo" defaultValue={addDias(hoje, 10)} /></div>
                <div><label>Fornecedor sugerido</label><input name="fornecedorSugerido" list="fornecedores" /></div>
                <div><label>Centro de custo</label><input name="centro" placeholder="Ex.: Produção" /></div>
                <div><label>Prioridade</label><select name="prioridade" defaultValue="Normal"><option>Baixa</option><option>Normal</option><option>Alta</option><option>Urgente</option></select></div>
                <div style={{ gridColumn: 'span 3' }}><label>Justificativa</label><input name="obs" placeholder="Para que é a compra" /></div>
              </div>
              <LinhasItens catalogo={catalogo} linhas={1} />
              <p className="pequeno mudo" style={{ margin: 0 }}>O preço aqui é a estimativa; o valor final vem da cotação.</p>
              <div><button className="btn primario" type="submit">Criar solicitação</button></div>
            </form>
          </details>
        </div>
      )}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Solicitações</h2>
        {sols.length ? (
          <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Solicitação</th><th>Produto</th><th className="num">Qtd</th><th className="num">Valor estimado</th><th>Cotação</th><th>Centro / prioridade</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>{sols.map((s) => {
              const item = s.itens[0];
              const cots = compararCotacoes((s.dados.cotacoes as Cotacao[] | undefined) || [], item?.qtd || 1);
              const melhor = cots.find((c) => c.recomendada);
              const d = s.dados as { centro?: string; prioridade?: string; fornecedorSugerido?: string; compra?: string };
              const aberta = !['Pedido gerado', 'Rejeitada', 'Cancelada'].includes(s.status);
              return (
                <tr key={s.id}>
                  <td><b>{rotuloDoc('solicitacao', s.numero)}</b><div className="pequeno mudo">{dataBr(s.data)}{s.prazo && ` · até ${dataBr(s.prazo)}`}</div></td>
                  <td>{item?.nome}{s.obs && <div className="pequeno mudo">{s.obs}</div>}</td>
                  <td className="num">{item?.qtd}</td>
                  <td className="num">{s.total ? brl(s.total) : '—'}</td>
                  <td className="pequeno">
                    {cots.length ? cots.map((c) => <div key={c.fornecedor}>{c.recomendada ? '★ ' : ''}{c.fornecedor}: <b>{brl(c.total)}</b>{c.prazoDias != null && ` · ${c.prazoDias}d`}{c.diferenca > 0 && <span className="mudo"> (+{brl(c.diferenca)})</span>}</div>) : d.fornecedorSugerido ? <span className="mudo">Sugerido: {d.fornecedorSugerido}</span> : <span className="mudo">—</span>}
                    {d.compra && <div><span className="tag pos">{d.compra}</span></div>}
                  </td>
                  <td className="pequeno">{d.centro || '—'}<div><span className={`tag ${/Urgente|Alta/.test(d.prioridade || '') ? 'neg' : ''}`}>{d.prioridade || 'Normal'}</span></div></td>
                  <td><span className={`tag ${tagStatus(s.status)}`}>{s.status}</span></td>
                  <td><div className="linha" style={{ gap: 6 }}>
                    {edita && aberta && (
                      <details className="menu-acao"><summary className="btn mini">Cotação</summary>
                        <form action={cotacaoAcao} className="card menu-acao-caixa" style={{ width: 460, top: 34 }}>
                          <FecharMenu />
                          <input type="hidden" name="id" value={s.id} />
                          <b>Até 3 fornecedores · {item?.qtd} × {item?.nome}</b>
                          {[0, 1, 2].map((k) => {
                            const c = cots[k];
                            return (
                              <div key={k} className="grade" style={{ gridTemplateColumns: '2fr 1fr 0.8fr 1.2fr', gap: 6 }}>
                                <input name={`forn${k}`} list="fornecedores" placeholder={`Fornecedor ${k + 1}`} defaultValue={c?.fornecedor || (k === 0 ? d.fornecedorSugerido || '' : '')} aria-label="Fornecedor" />
                                <input name={`unit${k}`} inputMode="decimal" placeholder="R$ unit." defaultValue={c ? String(c.unitario).replace('.', ',') : ''} aria-label="Preço unitário" />
                                <input name={`prazo${k}`} inputMode="numeric" placeholder="Dias" defaultValue={c?.prazoDias ?? ''} aria-label="Prazo de entrega em dias" />
                                <input name={`cond${k}`} placeholder="Condição" defaultValue={c?.condicao || ''} aria-label="Condição de pagamento" />
                              </div>
                            );
                          })}
                          <button className="btn primario" type="submit">Comparar e salvar</button>
                          <span className="pequeno mudo">O ZARO recomenda o menor total; no empate, o menor prazo.</span>
                        </form>
                      </details>
                    )}
                    {edita && <BotoesStatus id={s.id} volta="compras" opcoes={FLUXO.solicitacao[s.status].filter((x) => x !== 'Pedido gerado')} acao={mudarStatusAcao} />}
                    {edita && s.status === 'Aprovada' && (
                      <details className="menu-acao"><summary className="btn mini primario">Gerar pedido</summary>
                        <form action={gerarCompraAcao} className="card menu-acao-caixa" style={{ width: 320, top: 34 }}>
                          <FecharMenu />
                          <input type="hidden" name="id" value={s.id} />
                          <label>Fornecedor</label><input name="fornecedor" list="fornecedores" defaultValue={melhor?.fornecedor || d.fornecedorSugerido || ''} required />
                          <label>Preço unitário</label><input name="unitario" inputMode="decimal" defaultValue={melhor ? String(melhor.unitario).replace('.', ',') : item?.preco ? String(item.preco).replace('.', ',') : ''} />
                          <label>Previsão de entrega</label><input type="date" name="prazo" defaultValue={addDias(hoje, melhor?.prazoDias ?? 10)} />
                          <label>Condição de pagamento</label><input name="condicao" defaultValue={melhor?.condicao || ''} />
                          <button className="btn primario" type="submit">Emitir pedido de compra</button>
                        </form>
                      </details>
                    )}
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhuma solicitação de compra ainda.</div>}
      </div>
      <div className="card">
        <h2>Pedidos de compra</h2>
        {compras.length ? (
          <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Pedido</th><th>Fornecedor</th><th>Produto</th><th className="num">Qtd</th><th className="num">Valor</th><th>Condição</th><th>Previsão</th><th>Recebido</th><th>Status</th><th>Ação</th></tr></thead>
            <tbody>{compras.map((c) => {
              const d = c.dados as { recebidoEm?: string; nf?: string; titulo?: string };
              const atrasado = c.status === 'Emitido' && c.prazo && c.prazo < hoje;
              return (
                <tr key={c.id}>
                  <td><b>{rotuloDoc('compra', c.numero)}</b><div className="pequeno mudo">{dataBr(c.data)}</div></td>
                  <td>{c.parceiro}</td>
                  <td>{c.itens.map((i) => i.nome).join(', ')}</td>
                  <td className="num">{c.itens.reduce((a, i) => a + i.qtd, 0)}</td>
                  <td className="num">{brl(c.total)}</td>
                  <td className="pequeno">{c.condicao || '—'}</td>
                  <td>{c.prazo ? dataBr(c.prazo) : '—'}{atrasado && <div><span className="tag neg">Atrasado</span></div>}</td>
                  <td className="pequeno">{d.recebidoEm ? <>{dataBr(d.recebidoEm)}{d.nf && ` · NF ${d.nf}`}{d.titulo && <div>{d.titulo} no Contas a Pagar</div>}</> : '—'}</td>
                  <td><span className={`tag ${tagStatus(c.status)}`}>{c.status}</span></td>
                  <td><div className="linha" style={{ gap: 6 }}>
                    {edita && c.status === 'Emitido' && (
                      <details className="menu-acao"><summary className="btn mini primario">Receber</summary>
                        <form action={receberCompraAcao} className="card menu-acao-caixa" style={{ width: 320, top: 34 }}>
                          <FecharMenu />
                          <input type="hidden" name="id" value={c.id} />
                          <label>Data do recebimento</label><input type="date" name="data" defaultValue={hoje} required />
                          <label>Nº da NF do fornecedor</label><input name="nf" />
                          <label>Vencimento da conta a pagar</label><input type="date" name="venc" defaultValue={addDias(hoje, 28)} />
                          <label className="linha" style={{ fontWeight: 500 }}><input type="checkbox" name="lancar" defaultChecked /> Lançar {brl(c.total)} no Contas a Pagar agora</label>
                          <span className="pequeno mudo">Desmarque se o XML desta NF vai entrar pelo Autopilot, para não lançar a conta duas vezes.</span>
                          <button className="btn primario" type="submit">Confirmar recebimento</button>
                        </form>
                      </details>
                    )}
                    {edita && c.status === 'Emitido' && <BotoesStatus id={c.id} volta="compras" opcoes={['Cancelado']} acao={mudarStatusAcao} />}
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhum pedido de compra ainda. Aprove uma solicitação e clique em <b>Gerar pedido</b>.</div>}
      </div>
    </>
  );
}
