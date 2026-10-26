import { FecharMenu } from '@/components/FecharMenu';
import { getDb } from '@/db';
import { pedidosDasNotas, rotuloDoc, situacaoPedido } from '@/domain/comercial';
import { addDias, brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { docsDaEmpresa, movimentoDosPedidos, titulosComPedido } from '@/server/comercial-docs';
import { criarDocAcao, faturarAcao, mudarStatusAcao } from './acoes';
import { Avisos, BotoesStatus, Cabeca, EscolherParceiro, type ItemCatalogo, Kpis, LinhasItens, type Parceiro, tagStatus } from './comum';

export async function Pedidos({ empId, edita, clientes, catalogo, hoje, msg, erro }: { empId: string; edita: boolean; clientes: Parceiro[]; catalogo: ItemCatalogo[]; hoje: string; msg?: string; erro?: string }) {
  const db = await getDb();
  const [lista, mov, tits] = await Promise.all([docsDaEmpresa(db, empId, ['pedido']), movimentoDosPedidos(db, empId), titulosComPedido(db, empId)]);
  const origens = new Map((await docsDaEmpresa(db, empId, ['orcamento'])).map((o) => [o.id, rotuloDoc('orcamento', o.numero)]));
  const pedidos = lista.map((p) => {
    const m = mov.get(p.id) || { faturado: 0, recebido: 0 };
    return { ...p, ...situacaoPedido(p, m.faturado, m.recebido, hoje) };
  });
  const dasNotas = pedidosDasNotas(tits);
  const ativos = pedidos.filter((p) => p.status !== 'Cancelado');
  const soma = (l: number[]) => l.reduce((a, v) => a + v, 0);
  const aReceberNotas = soma(dasNotas.map((p) => p.aReceber));
  return (
    <>
      <Cabeca titulo="Pedidos aprovados" sub="Pedido do cliente → faturamento → Contas a Receber → recebimento. Orçamentos aprovados viram pedido em Orçamentos." />
      <Avisos msg={msg} erro={erro} />
      <Kpis itens={[
        ['Pedidos aprovados', brl(soma(ativos.map((p) => p.total))), `${ativos.length} pedido(s) no ZARO`],
        ['A faturar', brl(soma(ativos.map((p) => p.saldo))), `${ativos.filter((p) => p.saldo > 0.004).length} com saldo`],
        ['Faturado', brl(soma(ativos.map((p) => p.faturado)) + soma(dasNotas.map((p) => p.faturado))), 'pedidos do ZARO + pedidos das NFs'],
        ['A receber', brl(soma(ativos.map((p) => Math.max(0, p.faturado - p.recebido))) + aReceberNotas), 'títulos dos pedidos faturados'],
        ['Atrasados', String(ativos.filter((p) => p.atrasado).length), 'entrega vencida com saldo'],
        ['Entregas próximas', String(ativos.filter((p) => p.proximo).length), 'em até 7 dias'],
      ]} />
      {edita && (
        <div className="card" style={{ marginBottom: 16 }}>
          <details>
            <summary>+ Novo pedido aprovado</summary>
            <p className="pequeno mudo" style={{ margin: '8px 0 0' }}>Para pedido que chegou direto, sem orçamento no ZARO. Ao faturar, as parcelas vão para o Contas a Receber com o nº do pedido.</p>
            <form action={criarDocAcao} className="campos" style={{ marginTop: 12 }}>
              <input type="hidden" name="tipo" value="pedido" />
              <div className="grade g4">
                <div><label>Data do pedido</label><input type="date" name="data" defaultValue={hoje} required /></div>
                <div><label>Previsão de entrega</label><input type="date" name="prazo" defaultValue={addDias(hoje, 15)} /></div>
                <EscolherParceiro lista={clientes} rotulo="Cliente" />
                <div><label>Nº do pedido do cliente</label><input name="referencia" placeholder="Ex.: 0000052804" /></div>
                <div style={{ gridColumn: 'span 2' }}><label>Condição de pagamento</label><input name="condicao" placeholder="Ex.: 15 dias · depósito" /></div>
                <div><label>Observação</label><input name="obs" /></div>
              </div>
              <LinhasItens catalogo={catalogo} />
              <div><button className="btn primario" type="submit">Registrar pedido</button></div>
            </form>
          </details>
        </div>
      )}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Pedidos no ZARO</h2>
        {pedidos.length ? (
          <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Previsão entrega</th><th className="num">Valor</th><th className="num">Faturado</th><th className="num">Saldo a faturar</th><th className="num">Recebido</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>{pedidos.map((p) => (
              <tr key={p.id}>
                <td><b>{rotuloDoc('pedido', p.numero)}</b>{p.referencia && <div className="pequeno mudo">Cliente: {p.referencia}</div>}{p.origemId && origens.get(p.origemId) && <div className="pequeno mudo">de {origens.get(p.origemId)}</div>}</td>
                <td>{p.parceiro}</td>
                <td>{dataBr(p.data)}</td>
                <td>{p.prazo ? dataBr(p.prazo) : '—'}{p.atrasado && <div><span className="tag neg">Atrasado</span></div>}{p.proximo && <div><span className="tag at">Próximos 7 dias</span></div>}</td>
                <td className="num">{brl(p.total)}</td>
                <td className="num">{brl(p.faturado)}</td>
                <td className="num">{brl(p.saldo)}</td>
                <td className="num">{brl(p.recebido)}</td>
                <td><span className={`tag ${tagStatus(p.status)}`}>{p.status}</span></td>
                <td><div className="linha" style={{ gap: 6 }}>
                  {edita && p.status === 'A faturar' && (
                    <details className="menu-acao"><summary className="btn mini primario">Faturar</summary>
                      <form action={faturarAcao} className="card menu-acao-caixa" style={{ width: 300, top: 34 }}>
                        <FecharMenu />
                        <input type="hidden" name="id" value={p.id} />
                        <label>Parcelas</label>
                        <select name="parcelas" defaultValue="1">{Array.from({ length: 12 }, (_, k) => <option key={k} value={k + 1}>{k === 0 ? 'À vista (1x)' : `${k + 1}x de 30 em 30 dias`}</option>)}</select>
                        <label>1º vencimento</label><input type="date" name="primeiroVenc" defaultValue={addDias(hoje, 30)} required />
                        <button className="btn primario" type="submit">Faturar {brl(p.total)}</button>
                        <span className="pequeno mudo">Lança a venda e as parcelas no Contas a Receber.</span>
                      </form>
                    </details>
                  )}
                  {edita && p.status === 'A faturar' && <BotoesStatus id={p.id} volta="pedidos" opcoes={['Cancelado']} acao={mudarStatusAcao} />}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhum pedido registrado no ZARO ainda.</div>}
      </div>
      <div className="card">
        <h2>Pedidos que vieram nas NFs emitidas</h2>
        <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Lidos do campo “pedido” das notas fiscais de venda já importadas. Mostram o que foi faturado e recebido por pedido do cliente.</p>
        {dasNotas.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Cliente</th><th>Pedido</th><th>NFs</th><th>1ª emissão</th><th className="num">Faturado (NF)</th><th className="num">Líquido</th><th className="num">Recebido</th><th className="num">A receber</th><th>Status</th></tr></thead>
            <tbody>{dasNotas.map((p) => (
              <tr key={`${p.doc || p.cliente}-${p.pedido}`}>
                <td>{p.cliente}{p.doc && <div className="pequeno mudo">{formatarCnpj(p.doc)}</div>}</td>
                <td><b>{p.pedido}</b></td>
                <td className="pequeno">{p.nfs.length ? p.nfs.map((n) => `NF ${n}`).join(', ') : '—'}</td>
                <td>{p.primeira ? dataBr(p.primeira) : '—'}</td>
                <td className="num">{brl(p.faturado)}</td>
                <td className="num">{brl(p.liquido)}</td>
                <td className="num">{brl(p.recebido)}</td>
                <td className="num">{brl(p.aReceber)}</td>
                <td><span className={`tag ${p.aReceber > 0.004 ? 'at' : 'pos'}`}>{p.aReceber > 0.004 ? 'A receber' : 'Recebido'}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhuma NF de venda com nº de pedido ainda.</div>}
      </div>
    </>
  );
}
