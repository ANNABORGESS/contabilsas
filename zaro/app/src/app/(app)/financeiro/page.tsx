import { and, desc, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { ehAberto, FILTROS_TITULO, titulosFiltrados } from '@/server/consultas';
import { baixar, cancelar, criar, estornar, revisar } from './acoes';
import { corStatus } from '@/components/status';

type SP = { tipo?: string; f?: string; q?: string; msg?: string; erro?: string };

export default async function Financeiro({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const aba = sp.tipo === 'receber' ? 'receber' : sp.tipo === 'extrato' ? 'extrato' : sp.tipo === 'emprestimos' ? 'emprestimos' : 'pagar';
  const edita = podeEditar(u);
  const hoje = new Date().toISOString().slice(0, 10);
  const db = await getDb();

  const abas = (
    <div className="abas">
      <Link href="/financeiro?tipo=pagar" className={aba === 'pagar' ? 'ativo' : ''}>Contas a Pagar</Link>
      <Link href="/financeiro?tipo=receber" className={aba === 'receber' ? 'ativo' : ''}>Contas a Receber</Link>
      <Link href="/financeiro?tipo=extrato" className={aba === 'extrato' ? 'ativo' : ''}>Extrato bancário</Link>
      <Link href="/financeiro?tipo=emprestimos" className={aba === 'emprestimos' ? 'ativo' : ''}>Empréstimos</Link>
    </div>
  );
  const avisos = (
    <>
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      {sp.msg && <div className="aviso ok">{sp.msg}</div>}
    </>
  );

  if (aba === 'extrato') {
    const movs = await db.select().from(schema.extratoMovimentos).where(eq(schema.extratoMovimentos.empresaId, emp.id)).orderBy(desc(schema.extratoMovimentos.data)).limit(500);
    return (
      <>
        <div className="cabeca"><div><h1>Financeiro</h1><p>Movimentos de extrato bancário importados (últimos 500).</p></div></div>
        {abas}
        <div className="card">
          {movs.length ? (
            <div className="tabela-wrap"><table>
              <thead><tr><th>Data</th><th>Conta</th><th>Histórico</th><th className="num">Valor</th></tr></thead>
              <tbody>{movs.map((m) => <tr key={m.id}><td>{dataBr(m.data)}</td><td>{m.conta}</td><td>{m.memo}</td><td className={`num ${m.valor < 0 ? 'neg' : 'pos'}`}>{brl(m.valor)}</td></tr>)}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhum extrato importado. Os extratos do protótipo entram pela importação do backup em Configurações.</div>}
        </div>
      </>
    );
  }

  if (aba === 'emprestimos') {
    const ctrs = await db.select().from(schema.contratosDivida).where(eq(schema.contratosDivida.empresaId, emp.id));
    const total = ctrs.filter((c) => !/cancel|quitad/i.test(c.status)).reduce((a, c) => a + c.valor, 0);
    return (
      <>
        <div className="cabeca"><div><h1>Financeiro</h1><p>Contratos de empréstimo e financiamento. Total contratado ativo: <b>{brl(total)}</b>.</p></div></div>
        {abas}
        <div className="aviso">Pendência conhecida: saldo de abertura e cronograma das parcelas ainda precisam ser informados para o Balanço mostrar a dívida correta.</div>
        <div className="card">
          {ctrs.length ? (
            <div className="tabela-wrap"><table>
              <thead><tr><th>Instituição</th><th>Contrato</th><th>Tipo</th><th>Data</th><th className="num">Valor</th><th>Taxa</th><th>Sistema</th><th>Status</th></tr></thead>
              <tbody>{ctrs.map((c) => <tr key={c.id}><td>{c.instituicao}</td><td>{c.contrato}</td><td>{c.tipo}</td><td>{dataBr(c.dataContr)}</td><td className="num">{brl(c.valor)}</td><td>{c.taxa != null ? `${String(c.taxa).replace('.', ',')}% a.m.` : '—'}</td><td>{c.sistema || '—'}</td><td>{c.status}</td></tr>)}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhum contrato cadastrado.</div>}
        </div>
      </>
    );
  }

  const tipo = aba;
  const { f, q, todos, lista } = await titulosFiltrados(db, emp.id, tipo, sp.f, sp.q, hoje);
  const ids = lista.slice(0, 300).map((t) => t.id);
  const bxs = ids.length ? await db.select().from(schema.baixas).where(and(inArray(schema.baixas.tituloId, ids))) : [];
  const porTit = new Map<string, typeof bxs>();
  for (const b of bxs) porTit.set(b.tituloId, [...(porTit.get(b.tituloId) || []), b]);
  const aberto = todos.filter(ehAberto);
  const totAberto = aberto.reduce((a, t) => a + t.valor, 0);
  const totVencido = aberto.filter((t) => t.venc && t.venc < hoje).reduce((a, t) => a + t.valor, 0);
  const volta = `/financeiro?tipo=${tipo}&f=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <>
      <div className="cabeca">
        <div><h1>Financeiro</h1><p>{tipo === 'pagar' ? 'Títulos a pagar: NF de fornecedores, guias, folha e empréstimos.' : 'Títulos a receber: NF de saída da empresa. Notas de retorno ficam com valor zero no caixa.'}</p></div>
      </div>
      {abas}
      {avisos}
      <div className="grade g3" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="rotulo">Em aberto</div><div className="v">{brl(totAberto)}</div><div className="s">{aberto.length} título(s)</div></div>
        <div className="card kpi"><div className="rotulo">Vencido</div><div className="v neg">{brl(totVencido)}</div><div className="s">até hoje</div></div>
        <div className="card kpi"><div className="rotulo">Na lista</div><div className="v">{lista.length}</div><div className="s">com o filtro atual</div></div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <form className="linha" action="/financeiro">
          <input type="hidden" name="tipo" value={tipo} />
          <select name="f" defaultValue={f} style={{ width: 180 }}>{FILTROS_TITULO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <input name="q" defaultValue={sp.q} placeholder="Buscar por código, nome, NF" style={{ flex: 1, minWidth: 200 }} />
          <button className="btn" type="submit">Filtrar</button>
          <a className="btn" href={`/financeiro/exportar?tipo=${tipo}&f=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`} title="Baixar a lista filtrada em planilha">Excel</a>
          <a className="btn" href={`/financeiro/relatorio?tipo=${tipo}&f=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`} target="_blank" rel="noopener" title="Abrir relatório para imprimir ou salvar em PDF">PDF</a>
        </form>
        {edita && (
          <details style={{ marginTop: 12 }}>
            <summary>Lançar título manual</summary>
            <form action={criar} className="grade g4" style={{ marginTop: 10, alignItems: 'end' }}>
              <input type="hidden" name="volta" value={volta} /><input type="hidden" name="tipo" value={tipo} />
              <div><label>{tipo === 'pagar' ? 'Fornecedor / credor' : 'Cliente'}</label><input name="nome" required /></div>
              <div><label>Descrição</label><input name="descricao" /></div>
              <div><label>Categoria</label><input name="categoria" placeholder="Ex.: Energia, Aluguel" /></div>
              <div><label>Vencimento</label><input name="venc" type="date" required /></div>
              <div><label>Valor</label><input name="valor" inputMode="decimal" placeholder="0,00" required /></div>
              <div><label>Competência</label><input name="competencia" type="month" /></div>
              <div><button className="btn primario" type="submit">Lançar</button></div>
            </form>
          </details>
        )}
      </div>
      <div className="card">
        {lista.length ? (
          <div className="tabela-wrap">
            <table>
              <thead><tr><th>Título</th><th>{tipo === 'pagar' ? 'Fornecedor' : 'Cliente'}</th><th>NF</th><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Baixado</th><th>Status</th><th /></tr></thead>
              <tbody>
                {lista.slice(0, 300).map((t) => {
                  const bs = (porTit.get(t.id) || []).filter((b) => !b.estornada);
                  const baixado = bs.reduce((a, b) => a + b.valor, 0);
                  return (
                    <tr key={t.id}>
                      <td><b>{t.codigo}</b><div className="pequeno mudo">{t.categoria || t.origem}</div></td>
                      <td>{t.nome}{t.docParceiro && <div className="pequeno mudo">{formatarCnpj(t.docParceiro)}</div>}</td>
                      <td>{t.nf || '—'}</td>
                      <td>{t.parcela}</td>
                      <td>{dataBr(t.venc)} {t.vencEstimado && <span className="tag at">revisar</span>}</td>
                      <td className="num">{brl(t.valor)}{t.retorno && t.valorFiscal ? <div className="pequeno mudo">fiscal {brl(t.valorFiscal)}</div> : null}</td>
                      <td className="num">{baixado ? brl(baixado) : '—'}</td>
                      <td><span className={`tag ${corStatus(t.status, t.venc, hoje)}`}>{t.status}</span></td>
                      <td style={{ minWidth: 120 }}>
                        <details>
                          <summary className="pequeno">Detalhes</summary>
                          <div className="campos" style={{ marginTop: 8, minWidth: 300 }}>
                            {t.obs && <div className="pequeno">{t.obs}</div>}
                            {(porTit.get(t.id) || []).map((b) => (
                              <div key={b.id} className="pequeno linha">
                                <span className={b.estornada ? 'mudo' : ''}>{dataBr(b.data)} · {brl(b.valor)} {b.forma && `· ${b.forma}`} {b.estornada && '(estornada)'}</span>
                                {edita && !b.estornada && (
                                  <form action={estornar} className="linha"><input type="hidden" name="volta" value={volta} /><input type="hidden" name="baixa" value={b.id} /><input name="motivo" placeholder="Motivo" required style={{ width: 120 }} /><button className="btn mini perigo">Estornar</button></form>
                                )}
                              </div>
                            ))}
                            {edita && ehAberto(t) && (
                              <form action={baixar} className="linha">
                                <input type="hidden" name="volta" value={volta} /><input type="hidden" name="id" value={t.id} />
                                <input name="data" type="date" defaultValue={hoje} required style={{ width: 150 }} />
                                <input name="valor" defaultValue={String(Math.max(0, t.valor - baixado).toFixed(2)).replace('.', ',')} style={{ width: 110 }} />
                                <button className="btn mini primario">{tipo === 'pagar' ? 'Pagar' : 'Receber'}</button>
                              </form>
                            )}
                            {edita && ehAberto(t) && (
                              <form action={revisar} className="linha">
                                <input type="hidden" name="volta" value={volta} /><input type="hidden" name="id" value={t.id} />
                                <input name="venc" type="date" defaultValue={t.venc || ''} style={{ width: 150 }} />
                                <input name="valor" defaultValue={String(t.valor.toFixed(2)).replace('.', ',')} style={{ width: 110 }} />
                                <button className="btn mini">Revisar</button>
                              </form>
                            )}
                            {edita && !/cancel/i.test(t.status) && (
                              <form action={cancelar} className="linha"><input type="hidden" name="volta" value={volta} /><input type="hidden" name="id" value={t.id} /><input name="motivo" placeholder="Motivo do cancelamento" required style={{ width: 190 }} /><button className="btn mini perigo">Cancelar</button></form>
                            )}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lista.length > 300 && <p className="pequeno mudo">Mostrando 300 de {lista.length}. Use a busca para encontrar os demais.</p>}
          </div>
        ) : <div className="vazio">Nenhum título com este filtro.</div>}
      </div>
    </>
  );
}
