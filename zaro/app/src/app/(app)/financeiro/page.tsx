import { and, desc, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { ehAberto, FILTROS_TITULO, localizarChave, titulosFiltrados } from '@/server/consultas';
import { aprovarSelecao, baixar, confirmarRecebimentosAcao, cancelar, comprovanteSelecao, criar, definirSaldo, estornar, parcelarSelecao, prioritarioSelecao, programarSelecao, reagendarSelecao, registrarPagamentoAcao, rejeitarSelecao, renegociarSelecao, revisar, trocarContaSelecao } from './acoes';
import { etapaAtingida, prioridade } from '@/domain/pagamento';
import { dadosPlanejamento, receberAte } from '@/server/pagamentos';
import { PlanejarPagamento, RegistrarPagamento, type TituloPlano } from '@/components/financeiro/Pagamento';
import { saldoBancario } from '@/server/banco';
import { corStatus } from '@/components/status';
import { FecharMenu } from '@/components/FecharMenu';
import { Conciliacao } from './conciliacao';
import { Endividamento } from './endividamento';

type SP = { tipo?: string; f?: string; q?: string; msg?: string; erro?: string; chave?: string; novo?: string; pagar?: string; conta?: string; confirmar?: string };

export default async function Financeiro({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const aba = (['receber', 'extrato', 'emprestimos', 'endividamento'] as const).find((k) => k === sp.tipo) || 'pagar';
  const edita = podeEditar(u);
  const hoje = new Date().toISOString().slice(0, 10);
  const db = await getDb();

  const abas = (
    <div className="abas">
      <Link href="/financeiro?tipo=pagar" className={aba === 'pagar' ? 'ativo' : ''}>Contas a Pagar</Link>
      <Link href="/financeiro?tipo=receber" className={aba === 'receber' ? 'ativo' : ''}>Contas a Receber</Link>
      <Link href="/financeiro?tipo=emprestimos" className={aba === 'emprestimos' ? 'ativo' : ''}>Empréstimos e Financiamentos</Link>
      <Link href="/financeiro?tipo=endividamento" className={aba === 'endividamento' ? 'ativo' : ''}>Análise de endividamento</Link>
      <Link href="/financeiro?tipo=extrato" className={aba === 'extrato' ? 'ativo' : ''}>Conciliação bancária</Link>
    </div>
  );
  const avisos = (
    <>
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      {sp.msg && <div className="aviso ok">{sp.msg}</div>}
    </>
  );

  const cabecaSimples = (titulo: string, sub: string) => (
    <>
      <div className="cabeca central"><div><div className="sobretitulo">Financeiro · central de decisão</div><h1>{titulo}</h1><p>{sub}</p></div></div>
      {abas}
      {avisos}
    </>
  );

  if (aba === 'extrato') {
    return <Conciliacao u={u} emp={emp} sp={sp} edita={edita} cabeca={cabecaSimples('Conciliação bancária', 'Extrato do banco × títulos: o que já está conciliado, o que falta e o saldo')} />;
  }
  if (aba === 'endividamento') {
    return <Endividamento emp={emp} hoje={hoje} cabeca={cabecaSimples('Análise de endividamento', 'Quanto a empresa deve, para quem, quando vence e se o resultado sustenta a dívida')} />;
  }

  if (aba === 'emprestimos') {
    const ctrs = await db.select().from(schema.contratosDivida).where(eq(schema.contratosDivida.empresaId, emp.id));
    const total = ctrs.filter((c) => !/cancel|quitad/i.test(c.status)).reduce((a, c) => a + c.valor, 0);
    return (
      <>
        {cabecaSimples('Empréstimos e Financiamentos', `Contratos de empréstimo e financiamento. Total contratado ativo: ${brl(total)}.`)}
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
  const [{ f, q, todos, lista }, achado] = await Promise.all([
    titulosFiltrados(db, emp.id, tipo, sp.chave ? 'todos' : sp.f, sp.chave ? sp.chave.replace(/\D/g, '') : sp.q, hoje),
    sp.chave ? localizarChave(db, emp.id, sp.chave) : null,
  ]);
  const mesAtual = hoje.slice(0, 7);
  const planeja = tipo === 'pagar' && edita;
  const sim = edita && (tipo === 'pagar' || sp.confirmar) ? await dadosPlanejamento(db, u, emp, hoje) : null;
  const confirmar = tipo === 'receber' && edita && /^\d{4}-\d{2}-\d{2}$/.test(sp.confirmar || '') ? { ate: sp.confirmar!, lista: await receberAte(db, emp, sp.confirmar!) } : null;
  const pagarIds = planeja && sp.pagar ? sp.pagar.split(',').filter(Boolean).slice(0, 50) : [];
  const paraPagar = pagarIds.length ? await db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'pagar'), inArray(schema.titulos.id, pagarIds))) : [];
  const bxPagar = paraPagar.length ? await db.select().from(schema.baixas).where(and(inArray(schema.baixas.tituloId, paraPagar.map((t) => t.id)), eq(schema.baixas.estornada, false))) : [];
  const ids = lista.slice(0, 300).map((t) => t.id);
  const bxs = ids.length ? await db.select().from(schema.baixas).where(and(inArray(schema.baixas.tituloId, ids))) : [];
  const porTit = new Map<string, typeof bxs>();
  for (const b of bxs) porTit.set(b.tituloId, [...(porTit.get(b.tituloId) || []), b]);
  const pagDe = (t: (typeof lista)[number]) => ((t.dados as { pagamento?: { etapa?: string; agendadoPara?: string; prioritario?: boolean; conta?: string } })?.pagamento || {});
  const saldoDe = (t: (typeof lista)[number]) => Math.max(0, t.valor - (porTit.get(t.id) || []).filter((b) => !b.estornada).reduce((a, b) => a + b.valor, 0));
  const plano: Record<string, TituloPlano> = {};
  if (planeja) for (const t of lista.slice(0, 300)) {
    if (!ehAberto(t)) continue;
    const p = pagDe(t);
    const pr = prioridade({ venc: t.venc, nome: t.nome, categoria: t.categoria, descricao: t.descricao, prioritario: p.prioritario }, hoje);
    const etapa = p.etapa || 'Título preparado';
    plano[t.id] = { id: t.id, codigo: t.codigo, nome: t.nome, nf: t.nf, venc: t.venc, saldo: Math.round(saldoDe(t) * 100) / 100, prioridade: pr.nivel, motivo: pr.motivo, etapa, etapaIdx: etapaAtingida({ alertas: 0, etapa }), conta: p.conta || null, agendadoPara: p.agendadoPara || null };
  }
  const aberto = todos.filter(ehAberto);
  const totAberto = aberto.reduce((a, t) => a + t.valor, 0);
  const totVencido = aberto.filter((t) => t.venc && t.venc < hoje).reduce((a, t) => a + t.valor, 0);
  const volta = `/financeiro?tipo=${tipo}&f=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <>
      <div className="cabeca central">
        <div>
          <div className="sobretitulo">Financeiro · central de decisão</div>
          <h1>{tipo === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber'}</h1>
          <p>{tipo === 'pagar' ? 'Central inteligente de obrigações, prioridades e pagamentos' : 'Central de recebimentos, clientes e inadimplência'}</p>
        </div>
        <div className="acoes-cabeca">
          <details className="menu-acao">
            <summary className="btn">Gerar planilha do mês</summary>
            <div className="card menu-acao-caixa">
                <FecharMenu />
              <label htmlFor="mes-rel">Mês</label>
              <input id="mes-rel" type="month" name="mes" form="form-rel-pdf" defaultValue={mesAtual} required />
              <form id="form-rel-pdf" action="/relatorio-mensal" target="_blank" className="linha">
                <input type="hidden" name="pdf" value="1" /><input type="hidden" name="tipo" value={tipo} />
                <button className="btn primario mini" type="submit">Relatório em PDF</button>
                <button className="btn mini" type="submit" formAction="/financeiro/exportar" formTarget="_self" name="tipo" value={tipo}>Planilha Excel</button>
              </form>
              <span className="pequeno mudo">PDF no modelo do Relatório Financeiro (A4 deitado): receber, pagar, fluxo por semana, empréstimos e resumo do mês.</span>
            </div>
          </details>
          <details className="menu-acao">
            <summary className="btn">Localizar pela chave</summary>
            <form className="card menu-acao-caixa" action="/financeiro">
                <FecharMenu />
              <input type="hidden" name="tipo" value={tipo} />
              <label htmlFor="chave">Chave de acesso da NF (44 números)</label>
              <input id="chave" name="chave" defaultValue={sp.chave} inputMode="numeric" placeholder="1326 1008 2019 1100 0199 5500 1000 0012 3410 0012 3456" required />
              <button className="btn primario mini" type="submit" style={{ marginTop: 8 }}>Localizar</button>
            </form>
          </details>
          <details className="menu-acao">
            <summary className="btn">{tipo === 'pagar' ? 'Importar NF/XML/boleto' : 'Importar NF/XML'}</summary>
            <div className="card menu-acao-caixa">
                <FecharMenu />
              <Link href="/autopilot" className="acao-rapida">NF-e, NFS-e ou ZIP de XML<span className="pequeno mudo"> · Autopilot lê, confere e prepara o título</span></Link>
              {tipo === 'pagar' && <Link href="/inteligencia?aba=pagamentos" className="acao-rapida">Boleto (linha digitável)<span className="pequeno mudo"> · confere valor, vencimento e duplicidade</span></Link>}
              <Link href="/fiscal/notas" className="acao-rapida">Planilha de NF da SEFAZ<span className="pequeno mudo"> · notas do portal que ainda não estão na ZARO</span></Link>
            </div>
          </details>
          {edita && tipo === 'receber' && (
            <details className="menu-acao">
              <summary className="btn">Confirmar recebimentos</summary>
              <form className="card menu-acao-caixa" action="/financeiro">
                <FecharMenu />
                <input type="hidden" name="tipo" value="receber" />
                <label htmlFor="confirmar">Títulos em aberto que vencem até</label>
                <input id="confirmar" type="date" name="confirmar" defaultValue={sp.confirmar || hoje} required />
                <button className="btn primario mini" type="submit">Ver a lista para confirmar</button>
              </form>
            </details>
          )}
          {edita && <Link className="btn primario" href={`/financeiro?tipo=${tipo}&novo=1#lancar`}>+ Lançar título</Link>}
        </div>
      </div>
      {abas}
      {avisos}
      {confirmar && (
        <form className="card confirmar-lote" action={confirmarRecebimentosAcao} style={{ marginBottom: 16 }}>
          <input type="hidden" name="volta" value="/financeiro?tipo=receber&f=quitados" />
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <h2>Confirmar recebimentos com vencimento até {dataBr(confirmar.ate)}</h2>
            <Link href="/financeiro?tipo=receber" className="pequeno">Cancelar</Link>
          </div>
          {confirmar.lista.length ? (
            <>
              <p className="pequeno mudo">{confirmar.lista.length} título(s) em aberto, {brl(confirmar.lista.reduce((a, t) => a + t.saldo, 0))}. Desmarque o que ainda não entrou na conta. Cada título é baixado pelo saldo em aberto.</p>
              <div className="tabela-wrap"><table className="compacta">
                <thead><tr><th /><th>Título</th><th>Cliente</th><th>NF</th><th>Vencimento</th><th className="num">Saldo</th></tr></thead>
                <tbody>{confirmar.lista.map((t) => <tr key={t.id}><td><input type="checkbox" name="id" value={t.id} defaultChecked aria-label={`Confirmar ${t.codigo}`} /></td><td>{t.codigo}</td><td>{t.nome}</td><td>{t.nf || '—'}</td><td>{dataBr(t.venc)}</td><td className="num">{brl(t.saldo)}</td></tr>)}</tbody>
              </table></div>
              <div className="linha" style={{ marginTop: 12, alignItems: 'flex-end' }}>
                <div><label>Data do recebimento</label><select name="modo" defaultValue="venc"><option value="venc">A do vencimento de cada título</option><option value="unica">Uma data só para todos</option></select></div>
                <div><label>Data única</label><input type="date" name="dataUnica" max={hoje} /></div>
                <div><label>Forma</label><select name="forma" defaultValue="Transferência"><option>Transferência</option><option>PIX</option><option>Boleto</option><option>Dinheiro</option><option>Cartão</option><option>Outros</option></select></div>
                <div><label>Conta de entrada</label><input name="conta" list="contas-receb" placeholder="Banco / conta" /><datalist id="contas-receb">{(sim?.contas || []).map((c) => <option key={c} value={c} />)}</datalist></div>
                <button className="btn primario" type="submit">Confirmar recebimentos</button>
              </div>
            </>
          ) : <p className="mudo">Nenhum título a receber em aberto com vencimento até {dataBr(confirmar.ate)}.</p>}
        </form>
      )}
      {achado && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="linha" style={{ justifyContent: 'space-between' }}><h2>Chave {achado.chave || '—'}</h2><Link href={`/financeiro?tipo=${tipo}`} className="pequeno">Limpar</Link></div>
          {!achado.valida ? <p className="at">A chave de acesso tem 44 números; esta tem {achado.chave.length}.</p> : !achado.titulos.length && !achado.documentos.length && !achado.notas.length ? (
            <p className="mudo">Esta NF não está nesta empresa: nenhum título, nenhum XML no Autopilot e nenhuma linha na lista da SEFAZ. Se for de outra empresa do escritório, troque a empresa no topo. Para trazê-la, use <Link href="/autopilot">Importar XML</Link>.</p>
          ) : (
            <ul className="alertas">
              {achado.titulos.map((t) => <li key={t.id}><span><b>{t.codigo}</b> · {t.tipo === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber'} · {t.nome} · parcela {t.parcela} · vence {dataBr(t.venc)} · {brl(t.valor)}</span><span className={`tag ${corStatus(t.status, t.venc, hoje)}`}>{t.status}</span></li>)}
              {achado.documentos.map((d) => <li key={d.id}><span>Autopilot · {d.tipo} · {d.nomeArquivo}{d.valor ? ` · ${brl(d.valor)}` : ''}</span><Link className="tag" href="/autopilot">{d.status}</Link></li>)}
              {achado.notas.map((n, i) => <li key={i}><span>Lista da SEFAZ · NF {n.numero} · {n.razaoEmit} · {brl(n.valor)}{n.situacao ? ` · ${n.situacao}` : ''}</span><Link className="tag" href="/fiscal/notas?f=todas">{n.lancadoEm ? 'Lançada' : n.recebidoEm ? 'Recebida' : 'Não recebida'}</Link></li>)}
            </ul>
          )}
        </div>
      )}
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
          <details id="lancar" style={{ marginTop: 12 }} open={sp.novo === '1'}>
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
      {planeja && sim && (
        <PlanejarPagamento titulos={plano} sim={sim} hoje={hoje} volta={volta}
          acoes={{ aprovar: aprovarSelecao, programar: programarSelecao, rejeitar: rejeitarSelecao, reagendar: reagendarSelecao, parcelar: parcelarSelecao, renegociar: renegociarSelecao, prioritario: prioritarioSelecao, conta: trocarContaSelecao, comprovante: comprovanteSelecao }} />
      )}
      {paraPagar.length > 0 && (
        <RegistrarPagamento empresa={emp.razao} hoje={hoje} contas={sim?.contas || []} volta={volta} fechar={volta} acao={registrarPagamentoAcao}
          contaSugerida={paraPagar.map((t) => ((t.dados as { pagamento?: { conta?: string } })?.pagamento?.conta)).find(Boolean) || sim?.contas[0] || null}
          titulos={paraPagar.filter(ehAberto).map((t) => ({ id: t.id, codigo: t.codigo, nome: t.nome, nf: t.nf, parcela: t.parcela, valor: t.valor, venc: t.venc, saldo: Math.round(Math.max(0, t.valor - bxPagar.filter((b) => b.tituloId === t.id).reduce((a, b) => a + b.valor, 0)) * 100) / 100 }))} />
      )}
      <div className="card">
        {lista.length ? (
          <div className="tabela-wrap">
            <table>
              <thead><tr>{planeja && <th aria-label="Selecionar" />}<th>Título</th><th>{tipo === 'pagar' ? 'Fornecedor' : 'Cliente'}</th><th>NF</th><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Baixado</th><th>Status</th><th /></tr></thead>
              <tbody>
                {lista.slice(0, 300).map((t) => {
                  const bs = (porTit.get(t.id) || []).filter((b) => !b.estornada);
                  const baixado = bs.reduce((a, b) => a + b.valor, 0);
                  return (
                    <tr key={t.id} className={plano[t.id] ? `prio-linha-${plano[t.id].prioridade}` : undefined}>
                      {planeja && <td>{ehAberto(t) && <input type="checkbox" name="id" value={t.id} form="planejar" aria-label={`Selecionar ${t.codigo}`} />}</td>}
                      <td><b>{t.codigo}</b><div className="pequeno mudo">{t.categoria || t.origem}</div></td>
                      <td>{t.nome}{t.docParceiro && <div className="pequeno mudo">{formatarCnpj(t.docParceiro)}</div>}</td>
                      <td>{t.nf || '—'}</td>
                      <td>{t.parcela}</td>
                      <td>{dataBr(t.venc)} {t.vencEstimado && <span className="tag at">revisar</span>}{plano[t.id] && <div><span className={`tag prio-${plano[t.id].prioridade}`} title={plano[t.id].motivo}>{plano[t.id].prioridade}</span>{(plano[t.id].etapa !== 'Título preparado' || plano[t.id].agendadoPara) && <span className="pequeno mudo"> {plano[t.id].etapa === 'Título preparado' ? 'Para' : plano[t.id].etapa}{plano[t.id].agendadoPara ? ` ${dataBr(plano[t.id].agendadoPara)}` : ''}</span>}</div>}</td>
                      <td className="num">{brl(t.valor)}{t.retorno && t.valorFiscal ? <div className="pequeno mudo">fiscal {brl(t.valorFiscal)}</div> : null}</td>
                      <td className="num">{baixado ? brl(baixado) : '—'}</td>
                      <td><span className={`tag ${corStatus(t.status, t.venc, hoje)}`}>{t.status}</span></td>
                      <td style={{ minWidth: 120 }}>
                        {planeja && ehAberto(t) && <Link className="btn mini primario" href={`${volta}&pagar=${t.id}`} style={{ marginBottom: 6 }}>Registrar pagamento</Link>}
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
