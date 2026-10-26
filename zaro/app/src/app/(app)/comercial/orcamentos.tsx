import Link from 'next/link';
import { FecharMenu } from '@/components/FecharMenu';
import { FLUXO, rotuloDoc, totais } from '@/domain/comercial';
import { addDias, brl, dataBr } from '@/domain/dinheiro';
import { docsDaEmpresa } from '@/server/comercial-docs';
import { getDb } from '@/db';
import { converterAcao, criarDocAcao, mudarStatusAcao } from './acoes';
import { Avisos, BotoesStatus, Cabeca, EscolherParceiro, type ItemCatalogo, Kpis, LinhasItens, type Parceiro, tagStatus } from './comum';

export async function Orcamentos({ empId, edita, clientes, catalogo, hoje, msg, erro }: { empId: string; edita: boolean; clientes: Parceiro[]; catalogo: ItemCatalogo[]; hoje: string; msg?: string; erro?: string }) {
  const lista = await docsDaEmpresa(await getDb(), empId, ['orcamento']);
  const abertos = lista.filter((o) => ['Rascunho', 'Enviado'].includes(o.status));
  const fechados = lista.filter((o) => ['Aprovado', 'Convertido', 'Rejeitado'].includes(o.status));
  const ganhos = fechados.filter((o) => o.status !== 'Rejeitado');
  const conversao = fechados.length ? Math.round((ganhos.length / fechados.length) * 100) : null;
  const vencendo = abertos.filter((o) => o.prazo && o.prazo >= hoje && o.prazo <= addDias(hoje, 7)).length;
  return (
    <>
      <Cabeca titulo="Orçamentos" sub="Orçamento → aprovação do cliente → pedido → faturamento → Contas a Receber → recebimento." />
      <Avisos msg={msg} erro={erro} />
      <Kpis itens={[
        ['Em aberto', brl(abertos.reduce((a, o) => a + o.total, 0)), `${abertos.length} orçamento(s)`],
        ['Aprovados', brl(ganhos.reduce((a, o) => a + o.total, 0)), `${ganhos.length} aprovado(s) ou convertido(s)`],
        ['Taxa de aprovação', conversao == null ? '—' : `${conversao}%`, 'dos orçamentos respondidos'],
        ['Vencem em 7 dias', String(vencendo), 'validade próxima, ainda sem resposta'],
      ]} />
      {edita && (
        <div className="card" style={{ marginBottom: 16 }}>
          <details open={!lista.length}>
            <summary>Novo orçamento</summary>
            <p className="pequeno mudo" style={{ margin: '8px 0 0' }}>Itens do cadastro trazem preço e custo, e a margem aparece na lista. Deixe o preço em branco para usar o do cadastro.{!catalogo.length && <> Cadastre produtos e serviços em <Link href="/estoque">Produtos e Estoque</Link>, ou digite a descrição.</>}</p>
            <form action={criarDocAcao} className="campos" style={{ marginTop: 12 }}>
              <input type="hidden" name="tipo" value="orcamento" />
              <div className="grade g4">
                <div><label>Emissão</label><input type="date" name="data" defaultValue={hoje} required /></div>
                <div><label>Válido até</label><input type="date" name="prazo" defaultValue={addDias(hoje, 15)} /></div>
                <EscolherParceiro lista={clientes} rotulo="Cliente" />
                <div><label>Nº de referência do cliente</label><input name="referencia" placeholder="Solicitação / RFQ" /></div>
                <div style={{ gridColumn: 'span 2' }}><label>Condição de pagamento e entrega</label><input name="condicao" placeholder="Ex.: 28 dias · entrega em 10 dias úteis" /></div>
                <div><label>Observação</label><input name="obs" placeholder="Garantia, frete…" /></div>
              </div>
              <LinhasItens catalogo={catalogo} />
              <div><button className="btn primario" type="submit">Criar orçamento</button></div>
            </form>
          </details>
        </div>
      )}
      <div className="card">
        <h2>Orçamentos</h2>
        {lista.length ? (
          <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Nº</th><th>Cliente</th><th>Emissão</th><th>Validade</th><th>Itens</th><th className="num">Total</th><th className="num">Margem</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>{lista.map((o) => {
              const m = totais(o.itens).margem;
              const vencido = ['Rascunho', 'Enviado'].includes(o.status) && o.prazo && o.prazo < hoje;
              const proximos = FLUXO.orcamento[o.status].filter((s) => s !== 'Convertido');
              return (
                <tr key={o.id}>
                  <td><b>{rotuloDoc('orcamento', o.numero)}</b>{o.referencia && <div className="pequeno mudo">Ref. {o.referencia}</div>}</td>
                  <td>{o.parceiro}</td>
                  <td>{dataBr(o.data)}</td>
                  <td>{o.prazo ? dataBr(o.prazo) : '—'}{vencido && <div><span className="tag neg">Vencido</span></div>}</td>
                  <td className="pequeno">{o.itens.map((i) => `${i.qtd} × ${i.nome}`).join(', ')}{o.condicao && <div className="mudo">{o.condicao}</div>}</td>
                  <td className="num">{brl(o.total)}</td>
                  <td className="num">{m == null ? <span className="mudo" title="Algum item sem custo no cadastro">—</span> : `${m.toLocaleString('pt-BR')}%`}</td>
                  <td><span className={`tag ${tagStatus(o.status)}`}>{o.status}</span></td>
                  <td><div className="linha" style={{ gap: 6 }}>
                    <Link className="btn mini" href={`/proposta/${o.id}`} target="_blank">PDF</Link>
                    {edita && <BotoesStatus id={o.id} volta="orcamentos" opcoes={proximos} acao={mudarStatusAcao} />}
                    {edita && o.status === 'Aprovado' && (
                      <details className="menu-acao"><summary className="btn mini primario">Converter em pedido</summary>
                        <form action={converterAcao} className="card menu-acao-caixa" style={{ width: 300, top: 34 }}>
                          <FecharMenu />
                          <input type="hidden" name="id" value={o.id} />
                          <label>Previsão de entrega</label><input type="date" name="prazo" defaultValue={addDias(hoje, 15)} />
                          <label>Nº do pedido do cliente</label><input name="referencia" defaultValue={o.referencia || ''} placeholder="Ex.: 0000052804" />
                          <button className="btn primario" type="submit">Gerar pedido</button>
                        </form>
                      </details>
                    )}
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhum orçamento ainda.</div>}
      </div>
    </>
  );
}
