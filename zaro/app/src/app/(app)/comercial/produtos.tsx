import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import { produtosVendidos } from '@/domain/produtos-vendidos';
import type { Empresa } from '@/server/auth';
import { notasDeVenda } from '@/server/produtos-vendidos';
import { alternar, salvar, trazer } from './acoes-produtos';
import { Avisos, Cabeca } from './comum';
import { movimentacoes } from '@/server/rentabilidade';

type Item = typeof schema.catalogo.$inferSelect;

function FormItem({ i }: { i?: Item }) {
  return (
    <form action={salvar} className="campos" style={{ marginTop: 12 }}>
      {i && <input type="hidden" name="id" value={i.id} />}
      <div className="grade g4">
        <div><label>Tipo</label><select name="tipo" defaultValue={i?.tipo || 'servico'}><option value="servico">Serviço</option><option value="produto">Produto</option></select></div>
        <div style={{ gridColumn: 'span 3' }}><label>Nome</label><input name="nome" required defaultValue={i?.nome} placeholder="Ex.: Usinagem de peça sob desenho" /></div>
        <div><label>Unidade</label><input name="unidade" defaultValue={i?.unidade || ''} placeholder="UN, H, KG" /></div>
        <div><label>NCM ou item LC 116</label><input name="ncm" defaultValue={i?.ncm || ''} placeholder="8466.93.30 ou 14.01" /></div>
        <div><label>Preço de venda</label><input name="preco" inputMode="decimal" defaultValue={i?.preco ? String(i.preco).replace('.', ',') : ''} placeholder="0,00" /></div>
        <div><label>Custo</label><input name="custo" inputMode="decimal" defaultValue={i?.custo ? String(i.custo).replace('.', ',') : ''} placeholder="0,00" /></div>
        <div><label>Categoria</label><input name="categoria" defaultValue={i?.categoria || ''} placeholder="Usinagem, ferramentaria…" /></div>
        <div style={{ gridColumn: 'span 3' }}><label>Descrição</label><input name="descricao" defaultValue={i?.descricao || ''} /></div>
      </div>
      <div><button className="btn primario" type="submit">{i ? 'Salvar alteração' : 'Cadastrar'}</button></div>
    </form>
  );
}

export type SP = { aba?: string; inativos?: string; msg?: string; erro?: string; q?: string };

function Abas({ aba }: { aba: string }) {
  return (
    <div className="abas">
      <Link href="/comercial?t=produtos" className={aba === 'vendidos' ? 'ativo' : ''}>Produtos vendidos</Link>
      <Link href="/comercial?t=produtos&aba=cadastro" className={aba === 'cadastro' ? 'ativo' : ''}>Produtos e custos</Link>
      <Link href="/comercial?t=produtos&aba=movimentacoes" className={aba === 'movimentacoes' ? 'ativo' : ''}>Movimentações</Link>
    </div>
  );
}

export async function Produtos({ emp, edita, sp }: { emp: Empresa; edita: boolean; sp: SP }) {
  const db = await getDb();
  const cabeca = (
    <Cabeca titulo="Produtos e Estoque" sub={emp.semEstoque ? 'Sob encomenda, sem estoque: a empresa produz por demanda de cada pedido e a compra de material vai direto para custo. Aqui ficam os produtos e serviços já vendidos, tirados das NFs do Contas a Receber.' : 'Produtos vendidos, tirados das NFs do Contas a Receber, cadastro com custos e movimentações.'}>
      {edita && <form action={trazer}><button className="btn primario" type="submit">Trazer produtos das NFs para o cadastro</button></form>}
    </Cabeca>
  );
  const avisos = <Avisos msg={sp.msg} erro={sp.erro} />;
  if (sp.aba === 'cadastro') {
    const itens = await db.select().from(schema.catalogo).where(eq(schema.catalogo.empresaId, emp.id)).orderBy(asc(schema.catalogo.tipo), asc(schema.catalogo.nome));
    const mostrar = sp.inativos ? itens : itens.filter((i) => i.ativo);
    return (
      <>
        {cabeca}
        <Abas aba="cadastro" />
        {avisos}
        <p className="pequeno mudo" style={{ margin: '0 0 12px' }}>É deste cadastro que saem os itens e preços dos orçamentos, pedidos e vendas do Comercial.</p>
        {edita && <div className="card"><details><summary>Cadastrar produto ou serviço</summary><FormItem /></details></div>}
        <div className="card">
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <h2>{mostrar.length} item(ns)</h2>
            <Link className="pequeno" href={sp.inativos ? '/comercial?t=produtos&aba=cadastro' : '/comercial?t=produtos&aba=cadastro&inativos=1'}>{sp.inativos ? 'Esconder desativados' : 'Mostrar desativados'}</Link>
          </div>
          {mostrar.length ? (
            <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
              <thead><tr><th>Item</th><th>Tipo</th><th>Unid.</th><th>NCM / LC 116</th><th className="num">Custo</th><th className="num">Preço</th><th className="num">Margem</th><th></th></tr></thead>
              <tbody>{mostrar.map((i) => (
                <tr key={i.id} style={i.ativo ? undefined : { opacity: 0.55 }}>
                  <td><b>{i.nome}</b>{(i.categoria || i.descricao) && <div className="pequeno mudo">{[i.categoria, i.descricao].filter(Boolean).join(' · ')}</div>}</td>
                  <td><span className={`tag ${i.tipo === 'servico' ? 'ia' : 'acento'}`}>{i.tipo === 'servico' ? 'Serviço' : 'Produto'}</span></td>
                  <td>{i.unidade || '—'}</td>
                  <td>{i.ncm || '—'}</td>
                  <td className="num">{i.custo ? brl(i.custo) : '—'}</td>
                  <td className="num">{i.preco ? brl(i.preco) : '—'}</td>
                  <td className="num">{i.preco && i.custo ? `${Math.round(((i.preco - i.custo) / i.preco) * 100)}%` : '—'}</td>
                  <td>{edita && (
                    <details><summary className="pequeno">Editar</summary>
                      <FormItem i={i} />
                      <form action={alternar} style={{ marginTop: 8 }}><input type="hidden" name="id" value={i.id} /><button className="btn mini" type="submit">{i.ativo ? 'Desativar' : 'Reativar'}</button></form>
                    </details>
                  )}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhum produto ou serviço cadastrado ainda. Use <b>Trazer produtos das NFs para o cadastro</b>.</div>}
        </div>
      </>
    );
  }
  if (sp.aba === 'movimentacoes') {
    const mov = await movimentacoes(db, emp.id);
    const entradas = mov.filter((m) => m.tipo === 'Entrada');
    const saidas = mov.filter((m) => m.tipo === 'Saída');
    return (
      <>
        {cabeca}
        <Abas aba="movimentacoes" />
        {avisos}
        <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
          <div className="card kpi"><div className="rotulo">Entradas</div><div className="v">{entradas.length}</div><div className="s">{brl(entradas.reduce((a, m) => a + m.valor, 0))} · compras recebidas e NFs de entrada</div></div>
          <div className="card kpi"><div className="rotulo">Saídas</div><div className="v">{saidas.length}</div><div className="s">{brl(saidas.reduce((a, m) => a + m.valor, 0))} · itens das NFs de venda</div></div>
          <div className="card kpi"><div className="rotulo">Saldo de estoque</div><div className="v">{emp.semEstoque ? 'Não há' : 'Ver itens'}</div><div className="s">{emp.semEstoque ? 'produção por pedido: o que entra vira custo do pedido' : 'entradas menos saídas por item'}</div></div>
        </div>
        <div className="card">
          <h2>Histórico de movimentações</h2>
          {mov.length ? (
            <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
              <thead><tr><th>Data</th><th>Tipo</th><th>Documento</th><th>Cliente / fornecedor</th><th>Item</th><th className="num">Qtd.</th><th className="num">Valor</th></tr></thead>
              <tbody>{mov.slice(0, 500).map((m, k) => (
                <tr key={k}>
                  <td>{dataBr(m.data)}</td>
                  <td><span className={`tag ${m.tipo === 'Entrada' ? 'acento' : 'pos'}`}>{m.tipo}</span></td>
                  <td className="pequeno">{m.documento}</td>
                  <td className="pequeno">{m.parceiro}</td>
                  <td>{m.item}</td>
                  <td className="num">{m.qtd.toLocaleString('pt-BR')}</td>
                  <td className="num">{brl(m.valor)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhuma movimentação ainda.</div>}
        </div>
      </>
    );
  }
  const [{ notas, semItens }, cat] = await Promise.all([notasDeVenda(db, emp.id), db.select({ nome: schema.catalogo.nome }).from(schema.catalogo).where(eq(schema.catalogo.empresaId, emp.id))]);
  const noCadastro = new Set(cat.map((c) => c.nome.trim().toUpperCase()));
  const todos = produtosVendidos(notas);
  const q = (sp.q || '').trim().toLowerCase();
  const lista = q ? todos.filter((p) => `${p.codigo} ${p.nome} ${p.clientes.join(' ')} ${p.pedidos.join(' ')} ${p.nfs.join(' ')}`.toLowerCase().includes(q)) : todos;
  const faturado = todos.reduce((a, p) => a + p.total, 0);
  const clientes = new Set(notas.map((n) => n.cliente));
  return (
    <>
      {cabeca}
      <Abas aba="vendidos" />
      {avisos}
      <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
        <div className="card kpi"><div className="rotulo">Produtos e serviços</div><div className="v">{todos.length}</div><div className="s">{todos.filter((p) => !p.servico).length} produto(s) · {todos.filter((p) => p.servico).length} serviço(s)</div></div>
        <div className="card kpi"><div className="rotulo">Faturado nos itens</div><div className="v">{brl(faturado)}</div><div className="s">valor bruto das NFs</div></div>
        <div className="card kpi"><div className="rotulo">NFs lidas</div><div className="v">{notas.length}</div><div className="s">{clientes.size} cliente(s)</div></div>
        <div className="card kpi"><div className="rotulo">Estoque</div><div className="v">{emp.semEstoque ? 'Não controla' : 'Controla'}</div><div className="s">{emp.semEstoque ? 'produção por pedido' : 'ver movimentações'}</div></div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <form className="linha" action="/comercial" style={{ marginBottom: 12 }}>
          <input type="hidden" name="t" value="produtos" />
          <input name="q" defaultValue={sp.q || ''} placeholder="Buscar por código, produto, cliente, pedido ou NF" style={{ maxWidth: 420 }} />
          <button className="btn" type="submit">Buscar</button>
          <span className="pequeno mudo">{lista.length} item(ns)</span>
        </form>
        {lista.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Código</th><th>Produto / serviço</th><th>NCM</th><th>Clientes</th><th>Pedidos</th><th>NFs</th><th className="num">Qtd.</th><th className="num">Faturado</th><th className="num">Preço médio</th><th className="num">Último preço</th><th>Última venda</th></tr></thead>
            <tbody>{lista.map((p) => {
              const nome = (p.codigo ? `${p.codigo} - ${p.nome}` : p.nome).toUpperCase();
              return (
                <tr key={p.chave}>
                  <td className="pequeno"><b>{p.codigo || '—'}</b></td>
                  <td>{p.nome}<div className="pequeno"><span className={`tag ${p.servico ? 'ia' : 'acento'}`}>{p.servico ? 'Serviço' : 'Produto'}</span>{noCadastro.has(nome.slice(0, 200)) && <span className="tag pos" style={{ marginLeft: 4 }}>No cadastro</span>}</div></td>
                  <td className="pequeno">{p.ncm || '—'}</td>
                  <td className="pequeno">{p.clientes.join(', ')}</td>
                  <td className="pequeno">{p.pedidos.join(', ') || '—'}</td>
                  <td className="pequeno">{p.nfs.join(', ')}</td>
                  <td className="num">{p.qtd.toLocaleString('pt-BR')} {p.un}</td>
                  <td className="num">{brl(p.total)}</td>
                  <td className="num">{brl(p.precoMedio)}</td>
                  <td className="num">{brl(p.ultimoPreco)}</td>
                  <td>{dataBr(p.ultimaVenda)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <div className="vazio">{q ? 'Nada encontrado com essa busca.' : 'Nenhuma NF de venda com itens ainda. Envie os XMLs no Autopilot.'}</div>}
      </div>
      {semItens.length > 0 && (
        <div className="card">
          <h2>NFs do Contas a Receber sem itens</h2>
          <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Estas notas entraram sem o detalhe dos produtos (vieram de planilha ou PDF ilegível). Envie o XML no Autopilot para os itens aparecerem acima.</p>
          <div className="linha" style={{ gap: 6 }}>{semItens.map((n) => <span key={n.codigo} className="tag at" title={`${n.codigo} · ${brl(n.valor)}`}>NF {n.nf} · {n.cliente.split(' ').slice(0, 2).join(' ')}</span>)}</div>
        </div>
      )}
    </>
  );
}
