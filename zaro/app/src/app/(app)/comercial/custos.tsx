import Link from 'next/link';
import { getDb } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import { dre } from '@/domain/demonstracoes';
import type { Empresa } from '@/server/auth';
import { lancamentosDaEmpresa } from '@/server/contabil';
import { custosEPedidos } from '@/server/rentabilidade';
import { vincularCustoAcao } from './acoes';
import { Avisos, Cabeca } from './comum';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);
const corMargem = (v: number | null) => (v == null ? '' : v < 0 ? 'neg' : v < 15 ? 'at' : 'pos');

export type SPCustos = { aba?: string; ano?: string; previa?: string; msg?: string; erro?: string; q?: string };

function Abas({ aba }: { aba: string }) {
  const a = (k: string, n: string) => <Link href={`/comercial?t=custos${k === 'visao' ? '' : `&aba=${k}`}`} className={aba === k ? 'ativo' : ''}>{n}</Link>;
  return <div className="abas">{a('visao', 'Visão geral')}{a('pedido', 'Custo por pedido')}{a('rentabilidade', 'Rentabilidade')}{a('orcado', 'Orçado × realizado')}</div>;
}

export async function Custos({ emp, edita, sp }: { emp: Empresa; edita: boolean; sp: SPCustos }) {
  const aba = ['pedido', 'rentabilidade', 'orcado'].includes(sp.aba || '') ? sp.aba! : 'visao';
  const db = await getDb();
  const cab = <><Cabeca titulo="Custos e Rentabilidade" sub="Quanto custa cada pedido e quanto sobra: custo lançado (contas a pagar ligadas ao pedido) ou estimado pelo cadastro de produtos, margem por cliente e produto, e orçado × realizado." /><Abas aba={aba} /><Avisos msg={sp.msg} erro={sp.erro} /></>;

  if (aba === 'visao') {
    const ano = /^\d{4}$/.test(sp.ano || '') ? sp.ano! : String(new Date().getFullYear());
    const previa = sp.previa === '1';
    const [lancs, d] = await Promise.all([lancamentosDaEmpresa(db, emp), custosEPedidos(db, emp.id)]);
    const meses = MESES.map((nome, i) => {
      const c = `${ano}-${String(i + 1).padStart(2, '0')}`;
      const r = dre(lancs, { de: c, ate: c }, previa);
      const v = (x: string) => r.linhas.find((l) => l.rotulo.startsWith(x))?.valor || 0;
      const receita = v('Receita líquida');
      const custo = -v('(−) Custo');
      return { nome, receita, custo, margem: receita ? ((receita - custo) / receita) * 100 : null, resultado: r.resultado };
    });
    return (
      <>
        {cab}
        <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
          <div className="card kpi"><div className="rotulo">Faturado nos pedidos</div><div className="v">{brl(d.resumo.faturado)}</div><div className="s">{d.pedidos.length} pedido(s) com NF</div></div>
          <div className="card kpi"><div className="rotulo">Margem média</div><div className="v">{pct(d.resumo.margemMedia)}</div><div className="s">dos {d.resumo.comCusto} pedido(s) com custo</div></div>
          <div className="card kpi"><div className="rotulo">Pedidos sem custo</div><div className="v">{d.resumo.semCusto}</div><div className="s">ligue as contas a pagar ou informe custo no cadastro</div></div>
        </div>
        <form className="card linha" style={{ marginBottom: 16 }} action="/comercial">
          <input type="hidden" name="t" value="custos" />
          <div><label>Ano</label><input name="ano" defaultValue={ano} style={{ width: 100 }} /></div>
          <label className="linha" style={{ alignSelf: 'flex-end' }}><input type="checkbox" name="previa" value="1" defaultChecked={previa} /> Prévia</label>
          <button className="btn" style={{ alignSelf: 'flex-end' }}>Aplicar</button>
        </form>
        <div className="card">
          <h2>Receita, custo e margem bruta por mês</h2>
          <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Pelos lançamentos {previa ? 'de todos os status (prévia)' : 'aprovados'} da contabilidade.</p>
          <div className="tabela-wrap"><table>
            <thead><tr><th>Mês</th><th className="num">Receita líquida</th><th className="num">Custo</th><th className="num">Margem bruta</th><th className="num">Resultado</th></tr></thead>
            <tbody>{meses.map((m) => <tr key={m.nome}><td>{m.nome}/{ano}</td><td className="num">{brl(m.receita)}</td><td className="num">{brl(m.custo)}</td><td className="num">{m.margem == null ? '—' : `${m.margem.toFixed(1).replace('.', ',')}%`}</td><td className={`num ${m.resultado < 0 ? 'neg' : ''}`}>{brl(m.resultado)}</td></tr>)}</tbody>
          </table></div>
        </div>
      </>
    );
  }

  const d = await custosEPedidos(db, emp.id);
  if (aba === 'pedido') {
    const comPedido = d.pedidos.filter((p) => !p.pedido.startsWith('sem pedido'));
    return (
      <>
        {cab}
        {edita && (
          <div className="card" style={{ marginBottom: 16 }}>
            <details>
              <summary>Ligar uma conta a pagar a um pedido</summary>
              <p className="pequeno mudo" style={{ margin: '8px 0 0' }}>Material, serviço de terceiros ou frete comprado para um pedido entra no custo dele. Compras feitas em Compras e Cotações com o nº do pedido já entram sozinhas.</p>
              <form action={vincularCustoAcao} className="grade g3" style={{ marginTop: 10, alignItems: 'end' }}>
                <div style={{ gridColumn: 'span 2' }}><label>Conta a pagar</label>
                  <select name="titulo" required defaultValue="">
                    <option value="" disabled>Escolha</option>
                    {d.pagarAbertos.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nome} · {brl(t.valor)}{t.descricao ? ` · ${t.descricao.slice(0, 40)}` : ''}</option>)}
                  </select>
                </div>
                <div><label>Pedido do cliente</label><input name="pedido" list="pedidos-lista" required placeholder="Ex.: 4500002893" /></div>
                <datalist id="pedidos-lista">{comPedido.map((p) => <option key={p.pedido + p.cliente} value={p.pedido}>{p.cliente}</option>)}</datalist>
                <div><button className="btn primario" type="submit">Ligar ao pedido</button></div>
              </form>
            </details>
          </div>
        )}
        <div className="card">
          <h2>Custo por pedido</h2>
          <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Custo lançado = contas a pagar ligadas ao pedido. Sem elas, usa o custo do cadastro × quantidade (estimado).</p>
          {d.pedidos.length ? (
            <div className="tabela-wrap"><table>
              <thead><tr><th>Pedido</th><th>Cliente</th><th>NFs</th><th className="num">Faturado</th><th className="num">Custo lançado</th><th className="num">Custo estimado</th><th className="num">Lucro bruto</th><th className="num">Margem</th></tr></thead>
              <tbody>{d.pedidos.map((p) => (
                <tr key={p.pedido + p.cliente}>
                  <td><b>{p.pedido}</b>{p.primeira && <div className="pequeno mudo">{dataBr(p.primeira)}</div>}</td>
                  <td>{p.cliente}</td>
                  <td className="pequeno">{p.nfs.join(', ')}</td>
                  <td className="num">{brl(p.faturado)}</td>
                  <td className="num">{p.custoLancado == null ? '—' : brl(p.custoLancado)}{p.titulosCusto.length > 0 && (
                    <details><summary className="pequeno">{p.titulosCusto.length} conta(s)</summary>
                      {p.titulosCusto.map((t) => (
                        <form key={t.id} action={vincularCustoAcao} className="pequeno linha" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          {t.codigo} · {brl(t.valor)}<input type="hidden" name="titulo" value={t.id} /><input type="hidden" name="pedido" value="" />
                          {edita && <button className="btn mini" type="submit" title="Tirar do custo do pedido">×</button>}
                        </form>
                      ))}
                    </details>
                  )}</td>
                  <td className="num">{p.custoEstimado == null ? '—' : brl(p.custoEstimado)}</td>
                  <td className="num">{p.lucro == null ? '—' : brl(p.lucro)}</td>
                  <td className="num"><span className={`tag ${corMargem(p.margem)}`}>{pct(p.margem)}</span></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhuma NF de venda ainda.</div>}
        </div>
      </>
    );
  }

  if (aba === 'rentabilidade') {
    return (
      <>
        {cab}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Por cliente</h2>
          <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Cliente</th><th className="num">Pedidos</th><th className="num">Faturado</th><th className="num">Custo</th><th className="num">Faturado sem custo</th><th className="num">Margem</th></tr></thead>
            <tbody>{d.clientes.map((c) => (
              <tr key={c.cliente}><td>{c.cliente}</td><td className="num">{c.pedidos}</td><td className="num">{brl(c.faturado)}</td><td className="num">{brl(c.custo)}</td><td className="num">{c.semCusto ? brl(c.semCusto) : '—'}</td><td className="num"><span className={`tag ${corMargem(c.margem)}`}>{pct(c.margem)}</span></td></tr>
            ))}</tbody>
          </table></div>
          <p className="pequeno mudo" style={{ marginTop: 8 }}>A margem considera só os pedidos com custo; “faturado sem custo” fica fora da conta.</p>
        </div>
        <div className="card">
          <h2>Por produto e serviço</h2>
          <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Código</th><th>Produto / serviço</th><th className="num">Qtd.</th><th className="num">Faturado</th><th className="num">Custo unit. (cadastro)</th><th className="num">Custo total</th><th className="num">Margem</th></tr></thead>
            <tbody>{d.produtos.map((p) => (
              <tr key={p.chave}><td className="pequeno"><b>{p.codigo || '—'}</b></td><td>{p.nome}</td><td className="num">{p.qtd.toLocaleString('pt-BR')} {p.un}</td><td className="num">{brl(p.total)}</td><td className="num">{p.custoUnit == null ? '—' : brl(p.custoUnit)}</td><td className="num">{p.custo == null ? '—' : brl(p.custo)}</td><td className="num"><span className={`tag ${corMargem(p.margem)}`}>{pct(p.margem)}</span></td></tr>
            ))}</tbody>
          </table></div>
          <p className="pequeno mudo" style={{ marginTop: 8 }}>Informe o custo de cada item em <Link href="/comercial?t=produtos&aba=cadastro">Produtos e Estoque → Produtos e custos</Link> para ver a margem.</p>
        </div>
      </>
    );
  }

  const comOrcado = d.pedidos.filter((p) => p.orcado);
  return (
    <>
      {cab}
      <div className="card">
        <h2>Orçado × realizado</h2>
        <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Pedidos que nasceram de um orçamento do ZARO: valor e custo previstos no orçamento × faturado e custo do pedido.</p>
        {comOrcado.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Pedido</th><th>Orçamento</th><th>Cliente</th><th className="num">Orçado</th><th className="num">Faturado</th><th className="num">Diferença</th><th className="num">Custo orçado</th><th className="num">Custo real</th><th className="num">Margem orçada</th><th className="num">Margem real</th></tr></thead>
            <tbody>{comOrcado.map((p) => {
              const o = p.orcado!;
              const mo = o.custo == null || !o.total ? null : ((o.total - o.custo) / o.total) * 100;
              return (
                <tr key={p.pedido + p.cliente}>
                  <td><b>{p.pedido}</b></td><td>{o.rotulo}</td><td>{p.cliente}</td>
                  <td className="num">{brl(o.total)}</td><td className="num">{brl(p.faturado)}</td>
                  <td className={`num ${p.faturado - o.total < 0 ? 'neg' : ''}`}>{brl(p.faturado - o.total)}</td>
                  <td className="num">{o.custo == null ? '—' : brl(o.custo)}</td><td className="num">{p.custo == null ? '—' : brl(p.custo)}</td>
                  <td className="num">{pct(mo)}</td><td className="num"><span className={`tag ${corMargem(p.margem)}`}>{pct(p.margem)}</span></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhum pedido faturado veio de orçamento do ZARO ainda. Crie em <Link href="/comercial?t=orcamentos">Orçamentos</Link>, converta em pedido e fature em <Link href="/comercial?t=pedidos">Pedidos aprovados</Link>.</div>}
      </div>
    </>
  );
}
