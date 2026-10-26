import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import { produtosVendidos } from '@/domain/produtos-vendidos';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { notasDeVenda } from '@/server/produtos-vendidos';
import { alternar, salvar, trazer } from './acoes';

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

type SP = { aba?: string; inativos?: string; msg?: string; erro?: string; q?: string };

function Abas({ aba }: { aba: 'vendidos' | 'cadastro' }) {
  return (
    <div className="abas">
      <Link href="/estoque?aba=vendidos" className={aba === 'vendidos' ? 'ativo' : ''}>Produtos vendidos nas NFs</Link>
      <Link href="/estoque?aba=cadastro" className={aba === 'cadastro' ? 'ativo' : ''}>Cadastro de produtos e serviços</Link>
    </div>
  );
}

export default async function Estoque({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const db = await getDb();
  const edita = podeEditar(u);
  const cabeca = (
    <div className="cabeca central">
      <div>
        <div className="sobretitulo">{emp.semEstoque ? 'Sob encomenda · sem estoque' : 'Produtos'}</div>
        <h1>Produtos e Estoque</h1>
        <p>{emp.semEstoque ? 'A empresa produz por demanda de cada pedido e não mantém estoque: a compra de material vai direto para custo. Aqui ficam os produtos e serviços já vendidos, tirados das NFs do Contas a Receber.' : 'Produtos vendidos, tirados das NFs do Contas a Receber, e o cadastro usado em orçamentos e vendas.'}</p>
      </div>
      {edita && <form action={trazer}><button className="btn primario" type="submit">Trazer produtos das NFs para o cadastro</button></form>}
    </div>
  );
  const avisos = <>{sp.msg && <div className="aviso ok">{sp.msg}</div>}{sp.erro && <div className="aviso erro">{sp.erro}</div>}</>;
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
            <Link className="pequeno" href={sp.inativos ? '/estoque?aba=cadastro' : '/estoque?aba=cadastro&inativos=1'}>{sp.inativos ? 'Esconder desativados' : 'Mostrar desativados'}</Link>
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
        <form className="linha" action="/estoque" style={{ marginBottom: 12 }}>
          <input type="hidden" name="aba" value="vendidos" />
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
