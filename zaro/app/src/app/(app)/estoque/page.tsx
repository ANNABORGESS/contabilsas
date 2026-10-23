import { and, asc, eq, like } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import type { DadosDocumento } from '@/server/autopilot';
import { alternar, salvar } from './acoes';

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

export default async function Estoque({ searchParams }: { searchParams: Promise<{ aba?: string; inativos?: string; msg?: string; erro?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const db = await getDb();
  const edita = podeEditar(u);
  if (sp.aba !== 'vendidos') {
    const itens = await db.select().from(schema.catalogo).where(eq(schema.catalogo.empresaId, emp.id)).orderBy(asc(schema.catalogo.tipo), asc(schema.catalogo.nome));
    const mostrar = sp.inativos ? itens : itens.filter((i) => i.ativo);
    return (
      <>
        <div className="cabeca"><div><h1>Produtos e Estoque</h1><p>Cadastro de produtos e serviços que a empresa vende. É dele que saem os itens e preços do lançamento de vendas em Comercial.</p></div></div>
        <div className="abas"><Link href="/estoque" className="ativo">Produtos e serviços</Link><Link href="/estoque?aba=vendidos">Vendidos nas NFs</Link></div>
        {sp.msg && <div className="aviso ok">{sp.msg}</div>}
        {sp.erro && <div className="aviso erro">{sp.erro}</div>}
        {edita && <div className="card"><details><summary>Cadastrar produto ou serviço</summary><FormItem /></details></div>}
        <div className="card">
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <h2>{mostrar.length} item(ns)</h2>
            <Link className="pequeno" href={sp.inativos ? '/estoque' : '/estoque?inativos=1'}>{sp.inativos ? 'Esconder desativados' : 'Mostrar desativados'}</Link>
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
          ) : <div className="vazio">Nenhum produto ou serviço cadastrado ainda.</div>}
        </div>
      </>
    );
  }
  const docs = await db.select({ dados: schema.documentosEntrada.dados }).from(schema.documentosEntrada)
    .where(and(eq(schema.documentosEntrada.empresaId, emp.id), eq(schema.documentosEntrada.status, 'Aprovado'), like(schema.documentosEntrada.tipo, '%saída%')));
  const prod = new Map<string, { desc: string; ncm: string; qtd: number; total: number; notas: number }>();
  for (const d of docs) {
    const n = (d.dados as DadosDocumento).nota;
    if (!n || (d.dados as DadosDocumento).retorno) continue;
    for (const i of n.itens) {
      const k = i.desc.trim().toUpperCase();
      const p = prod.get(k) || { desc: i.desc, ncm: i.ncm, qtd: 0, total: 0, notas: 0 };
      p.qtd += i.qtd; p.total += i.total; p.notas += 1;
      prod.set(k, p);
    }
  }
  const lista = [...prod.values()].sort((a, b) => b.total - a.total);
  return (
    <>
      <div className="cabeca"><div><h1>Produtos e Estoque</h1><p>{emp.semEstoque ? 'Esta empresa trabalha sob encomenda, sem estoque: a compra de material vai direto para custo. Abaixo, os produtos vendidos sob pedido, tirados das NFs de saída aprovadas.' : 'Produtos vendidos, tirados das NFs de saída aprovadas.'}</p></div></div>
      <div className="abas"><Link href="/estoque">Produtos e serviços</Link><Link href="/estoque?aba=vendidos" className="ativo">Vendidos nas NFs</Link></div>
      <div className="card">
        {lista.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Produto</th><th>NCM</th><th className="num">Notas</th><th className="num">Quantidade</th><th className="num">Faturado</th><th className="num">Preço médio</th></tr></thead>
            <tbody>{lista.map((p) => <tr key={p.desc}><td>{p.desc}</td><td>{p.ncm || '—'}</td><td className="num">{p.notas}</td><td className="num">{p.qtd.toLocaleString('pt-BR')}</td><td className="num">{brl(p.total)}</td><td className="num">{brl(p.qtd ? p.total / p.qtd : 0)}</td></tr>)}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhuma NF de venda aprovada ainda.</div>}
      </div>
    </>
  );
}
