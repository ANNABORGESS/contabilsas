import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, dataBr, numero } from '@/domain/dinheiro';
import { historicoPrecos, simularPreco } from '@/domain/precos';
import type { Empresa } from '@/server/auth';
import { notasDeVenda } from '@/server/produtos-vendidos';
import { Avisos, Cabeca } from './comum';

export type SPPrecos = Record<string, string | undefined>;

function Abas({ aba }: { aba: string }) {
  return (
    <div className="abas">
      <Link href="/comercial?t=precos" className={aba === 'historico' ? 'ativo' : ''}>Histórico de preços</Link>
      <Link href="/comercial?t=precos&aba=simulador" className={aba === 'simulador' ? 'ativo' : ''}>Simulador de preços</Link>
    </div>
  );
}

const CAMPOS: [string, string, string][] = [
  ['qtd', 'Quantidade do pedido', '1'], ['material', 'Material por unidade (R$)', ''], ['horas', 'Horas por unidade', '0'], ['valorHora', 'Valor da hora (R$)', '0'], ['outros', 'Outros custos por unidade (R$)', '0'],
  ['impostosPct', 'Impostos sobre a venda (%)', '9,25'], ['comissaoPct', 'Comissão (%)', '0'], ['despesasPct', 'Despesas fixas rateadas (%)', '10'], ['margemPct', 'Lucro desejado (%)', '20'],
];

export async function Precos({ emp, sp }: { emp: Empresa; sp: SPPrecos }) {
  const aba = sp.aba === 'simulador' ? 'simulador' : 'historico';
  const db = await getDb();
  const cab = <><Cabeca titulo="Preços e Simulações" sub="Quanto cada produto já foi vendido (pelas NFs) e quanto cobrar num pedido novo, a partir do custo." /><Abas aba={aba} /><Avisos msg={sp.msg} erro={sp.erro} /></>;

  if (aba === 'historico') {
    const { notas } = await notasDeVenda(db, emp.id);
    const todos = historicoPrecos(notas);
    const q = (sp.q || '').trim().toLowerCase();
    const lista = q ? todos.filter((p) => `${p.codigo} ${p.nome} ${p.vendas.map((v) => `${v.cliente} ${v.nf} ${v.pedido}`).join(' ')}`.toLowerCase().includes(q)) : todos;
    return (
      <>
        {cab}
        <div className="card">
          <form className="linha" action="/comercial" style={{ marginBottom: 12 }}>
            <input type="hidden" name="t" value="precos" />
            <input name="q" defaultValue={sp.q || ''} placeholder="Buscar produto, código, cliente, NF ou pedido" style={{ maxWidth: 420 }} />
            <button className="btn" type="submit">Buscar</button>
            <span className="pequeno mudo">{lista.length} item(ns) · {todos.filter((p) => p.mudou).length} com preço que mudou</span>
          </form>
          {lista.length ? (
            <div className="tabela-wrap"><table>
              <thead><tr><th>Código</th><th>Produto / serviço</th><th className="num">Vendas</th><th className="num">Menor</th><th className="num">Maior</th><th className="num">Último</th><th>Cada venda (data · NF · cliente · preço unit.)</th><th /></tr></thead>
              <tbody>{lista.map((p) => (
                <tr key={(p.codigo || p.nome) + p.vendas.length}>
                  <td className="pequeno"><b>{p.codigo || '—'}</b></td>
                  <td>{p.nome}{p.mudou && <div><span className="tag at">Preço mudou</span></div>}</td>
                  <td className="num">{p.vendas.length}</td>
                  <td className="num">{brl(p.menor)}</td>
                  <td className="num">{brl(p.maior)}</td>
                  <td className="num"><b>{brl(p.ultimo)}</b></td>
                  <td className="pequeno">{p.vendas.map((v, k) => (
                    <div key={k}>{dataBr(v.data)} · NF {v.nf} · {v.cliente.split(' ').slice(0, 2).join(' ')} · {brl(v.unit)}{v.variacao != null && v.variacao !== 0 && <span className={v.variacao > 0 ? 'pos' : 'neg'}> ({v.variacao > 0 ? '+' : ''}{v.variacao.toLocaleString('pt-BR')}%)</span>}</div>
                  ))}</td>
                  <td><Link className="btn mini" href={`/comercial?t=precos&aba=simulador&nome=${encodeURIComponent(p.codigo || p.nome)}&ref=${p.ultimo}`}>Simular</Link></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="vazio">{q ? 'Nada encontrado.' : 'Nenhuma NF de venda com itens ainda.'}</div>}
        </div>
      </>
    );
  }

  const catalogo = await db.select({ id: schema.catalogo.id, nome: schema.catalogo.nome, custo: schema.catalogo.custo, preco: schema.catalogo.preco }).from(schema.catalogo).where(eq(schema.catalogo.empresaId, emp.id)).orderBy(asc(schema.catalogo.nome));
  const item = sp.item ? catalogo.find((c) => c.id === sp.item) : undefined;
  const valor = (k: string, padrao: string) => sp[k] ?? (k === 'material' && item?.custo ? String(item.custo).replace('.', ',') : padrao);
  const calcular = CAMPOS.some(([k]) => sp[k] != null) || !!item?.custo;
  let resultado: ReturnType<typeof simularPreco> | null = null;
  let erro = '';
  if (calcular) {
    try {
      const n = (k: string, padrao: string) => numero(valor(k, padrao));
      resultado = simularPreco({ qtd: n('qtd', '1'), material: n('material', '0'), horas: n('horas', '0'), valorHora: n('valorHora', '0'), outros: n('outros', '0'), impostosPct: n('impostosPct', '9,25'), comissaoPct: n('comissaoPct', '0'), despesasPct: n('despesasPct', '10'), margemPct: n('margemPct', '20') });
    } catch (e) {
      erro = (e as Error).message;
    }
  }
  const ref = numero(sp.ref || (item?.preco ? String(item.preco) : ''));
  return (
    <>
      {cab}
      <div className="grade g2" style={{ alignItems: 'start' }}>
        <form className="card campos" action="/comercial">
          <input type="hidden" name="t" value="precos" /><input type="hidden" name="aba" value="simulador" />
          {sp.nome && <input type="hidden" name="nome" value={sp.nome} />}{sp.ref && <input type="hidden" name="ref" value={sp.ref} />}
          <h2>{sp.nome ? `Simular: ${sp.nome}` : 'Simular preço'}</h2>
          <div><label>Partir de um item do cadastro (usa o custo dele)</label>
            <select name="item" defaultValue={sp.item || ''}><option value="">—</option>{catalogo.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.custo ? ` · custo ${brl(Number(c.custo))}` : ''}</option>)}</select>
          </div>
          <div className="grade g2">
            {CAMPOS.map(([k, rot, padrao]) => <div key={k}><label htmlFor={`s-${k}`}>{rot}</label><input id={`s-${k}`} name={k} inputMode="decimal" defaultValue={valor(k, padrao)} /></div>)}
          </div>
          <div><button className="btn primario" type="submit">Calcular preço</button></div>
          <p className="pequeno mudo" style={{ margin: 0 }}>Preço = custo ÷ (1 − impostos − comissão − despesas − lucro). O preço mínimo zera o lucro.</p>
        </form>
        <div className="card">
          <h2>Resultado</h2>
          {erro && <div className="aviso erro">{erro}</div>}
          {resultado ? (
            <>
              <div className="grade g2" style={{ marginTop: 10 }}>
                <div className="card kpi"><div className="rotulo">Preço sugerido / un.</div><div className="v">{brl(resultado.preco)}</div><div className="s">markup {resultado.markup.toLocaleString('pt-BR')}×</div></div>
                <div className="card kpi"><div className="rotulo">Preço mínimo / un.</div><div className="v">{brl(resultado.minimo)}</div><div className="s">sem lucro, paga custos e impostos</div></div>
              </div>
              <div className="tabela-wrap" style={{ marginTop: 12 }}><table>
                <thead><tr><th>Composição do preço</th><th className="num">Por unidade</th></tr></thead>
                <tbody>
                  <tr><td>Custo (material + horas + outros)</td><td className="num">{brl(resultado.composicao.custo)}</td></tr>
                  <tr><td>Impostos</td><td className="num">{brl(resultado.composicao.impostos)}</td></tr>
                  <tr><td>Comissão</td><td className="num">{brl(resultado.composicao.comissao)}</td></tr>
                  <tr><td>Despesas fixas rateadas</td><td className="num">{brl(resultado.composicao.despesas)}</td></tr>
                  <tr><td><b>Lucro</b></td><td className="num"><b>{brl(resultado.composicao.lucro)}</b></td></tr>
                  <tr><td><b>Total do pedido</b> · lucro {brl(resultado.lucroPedido)}</td><td className="num"><b>{brl(resultado.totalPedido)}</b></td></tr>
                </tbody>
              </table></div>
              {ref > 0 && <div className={`aviso ${ref < resultado.minimo ? 'erro' : ref < resultado.preco ? '' : 'ok'}`} style={{ marginTop: 12 }}>Último preço vendido: {brl(ref)}. {ref < resultado.minimo ? 'Abaixo do mínimo: esse preço dá prejuízo com estes custos.' : ref < resultado.preco ? 'Entre o mínimo e o sugerido: lucro menor que o desejado.' : 'Igual ou acima do sugerido.'}</div>}
              <p className="pequeno mudo" style={{ marginTop: 10 }}>Para usar este preço, crie o orçamento em <Link href="/comercial?t=orcamentos">Orçamentos</Link>.</p>
            </>
          ) : !erro && <div className="vazio">Informe os custos e clique em Calcular preço.</div>}
        </div>
      </div>
    </>
  );
}
