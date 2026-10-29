import Link from 'next/link';
import { getDb } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import { balanceteComGrupos, balanco, balancete, dre, periodoContabil, type Periodo } from '@/domain/demonstracoes';
import { STATUS_NO_LIVRO, type Lancamento } from '@/domain/motor';
import { PLANO_PADRAO, rotuloConta } from '@/domain/plano-contas';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { lancamentosDaEmpresa } from '@/server/contabil';
import { BalanceteModelo } from '@/components/BalanceteModelo';
import { balanceteModelo } from '@/domain/balancete-modelo';
import { redirect } from 'next/navigation';
import { PedidoZaro } from '@/components/PedidoZaro';
import { CamposPeriodo } from '@/components/CamposPeriodo';
import { atenderPedido } from '@/server/pedidos';
import { aplicarStatus, aprovarConfiaveis, aprovarContraparteAcao, aprovarTodosExceto, classificarContraparteAcao, estornarLanc, salvarAberturaAcao, trocarConta } from './acoes';
import { aberturaDaEmpresa } from '@/server/abertura';
import { CONTA_ABERTURA, type AberturaMotor } from '@/domain/motor';

type SP = { aba?: string; per?: string; ref?: string; de?: string; ate?: string; st?: string; previa?: string; q?: string; modelo?: string; msg?: string; erro?: string; pedido?: string };
const STATUS = ['A aprovar', 'Todos', 'Automático', 'Sugerido', 'Em revisão', 'Aprovado', 'Contabilizado', 'Estornado', 'Excluído'];
const COR: Record<string, string> = { Automático: 'acento', Sugerido: 'ia', 'Em revisão': 'at', Aprovado: 'pos', Contabilizado: 'pos', Estornado: '', Excluído: 'neg' };

export default async function Contabilidade({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const db = await getDb();
  const pedido = (sp.pedido || '').trim().slice(0, 300);
  const resposta = pedido ? await atenderPedido(db, u, emp, pedido) : undefined;
  // pedido de uma demonstração só, para ver na tela: vai direto para ela
  if (resposta?.tipo === 'demonstracao' && resposta.itens.length === 1 && resposta.pedido.formato === 'tela') redirect(resposta.itens[0].links.tela);
  const todos = await lancamentosDaEmpresa(db, emp, { incluirExcluidos: true });
  const lancs = todos.filter((l) => l.status !== 'Excluído');
  const aba = ['lancamentos', 'extrato', 'balancete', 'dre', 'balanco', 'abertura'].includes(sp.aba || '') ? sp.aba! : 'lancamentos';
  const p = periodoContabil(sp, lancs.map((l) => l.comp));
  const previa = sp.previa === '1';
  const edita = podeEditar(u);
  const qs = (extra: Record<string, string | undefined>) => {
    const o = { aba, per: sp.per, ref: sp.ref, de: sp.de, ate: sp.ate, st: sp.st, previa: sp.previa, q: sp.q, modelo: sp.modelo, ...extra };
    return '/contabilidade?' + Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
  };
  const volta = qs({});
  const anoHoje = new Date().getFullYear();
  const anos = [...new Set([...lancs.map((l) => l.comp.slice(0, 4)), String(anoHoje), p.ate.slice(0, 4)])].filter((a) => /^\d{4}$/.test(a) && +a >= 2000 && +a <= anoHoje + 1).sort().reverse();
  const pendentes = lancs.filter((l) => !STATUS_NO_LIVRO.includes(l.status)).length;

  return (
    <>
      <div className="cabeca">
        <div><h1>Contabilidade</h1><p>Toda operação gera lançamentos. As demonstrações só usam lançamentos aprovados{previa ? ' (prévia ligada: mostrando todos)' : ''}.</p></div>
        {aba !== 'lancamentos' && (
          <div className="nao-imprimir" style={{ display: 'flex', gap: 8 }}>
            <a className="btn primario" href={qs({}).replace('/contabilidade?', '/relatorio-contabil?')} target="_blank" rel="noreferrer">Salvar em PDF</a>
            <a className="btn" href={qs({}).replace('/contabilidade?', '/contabilidade/exportar?')}>Excel</a>
          </div>
        )}
      </div>
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      {sp.msg && <div className="aviso ok">{sp.msg}</div>}
      <PedidoZaro acao="/contabilidade" texto={pedido || undefined} resposta={resposta} />
      <div className="abas nao-imprimir">
        {[['lancamentos', `Lançamentos (${pendentes} a aprovar)`], ['extrato', `Classificar PIX e extrato (${lancs.filter((l) => l.id.startsWith('BKX|') && !STATUS_NO_LIVRO.includes(l.status)).length})`], ['balancete', 'Balancete'], ['dre', 'DRE'], ['balanco', 'Balanço'], ['abertura', 'Saldos de abertura']].map(([k, n]) => (
          <Link key={k} href={qs({ aba: k })} className={aba === k ? 'ativo' : ''}>{n}</Link>
        ))}
      </div>
      {aba !== 'abertura' && aba !== 'extrato' && <form className="card linha nao-imprimir" style={{ marginBottom: 16 }} action="/contabilidade">
        <input type="hidden" name="aba" value={aba} />
        <CamposPeriodo key={`${sp.per}|${sp.ref}|${sp.de}|${sp.ate}`} per={sp.per || 'ano'} refMes={sp.ref || p.ate} de={sp.de || p.de} ate={sp.ate || p.ate} anos={anos} />
        {aba === 'lancamentos' && <div><label>Status</label><select name="st" defaultValue={sp.st || 'A aprovar'}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>}
        {aba === 'lancamentos' && <div style={{ flex: 1, minWidth: 160 }}><label>Busca</label><input name="q" defaultValue={sp.q} placeholder="Histórico, documento, código do título" /></div>}
        {aba === 'balancete' && <div><label>Modelo</label><select name="modelo" defaultValue={sp.modelo || ''}><option value="">Modelo do escritório</option><option value="zaro">Plano de contas do ZARO (detalhado)</option></select></div>}
        {aba !== 'lancamentos' && <label className="linha" style={{ alignSelf: 'flex-end' }}><input type="checkbox" name="previa" value="1" defaultChecked={previa} /> Prévia (inclui não aprovados)</label>}
        <button className="btn" type="submit" style={{ alignSelf: 'flex-end' }}>Aplicar</button>
      </form>}

      {aba === 'extrato' && <ClassificarExtrato lancs={lancs} edita={edita} volta={volta} />}
      {aba === 'abertura' && <Abertura ab={await aberturaDaEmpresa(db, emp.tenantId, emp.id)} edita={edita} volta={volta} />}
      {aba === 'lancamentos' && <Lancamentos lancs={sp.st === 'Excluído' ? todos : lancs} p={p} sp={sp} edita={edita} volta={volta} />}
      {aba === 'balancete' && (sp.modelo === 'zaro' ? <Balancete lancs={lancs} p={p} previa={previa} emp={emp.razao} /> : <BalanceteEscritorio lancs={lancs} p={p} previa={previa} emp={emp.razao} />)}
      {aba === 'dre' && <Dre lancs={lancs} p={p} previa={previa} emp={emp.razao} />}
      {aba === 'balanco' && <Balanco lancs={lancs} p={p} previa={previa} emp={emp.razao} />}
    </>
  );
}

function Lancamentos({ lancs, p, sp, edita, volta }: { lancs: Lancamento[]; p: Periodo; sp: SP; edita: boolean; volta: string }) {
  const q = (sp.q || '').toLowerCase();
  const vis = lancs.filter((l) => l.comp >= p.de && l.comp <= p.ate && (sp.st === 'Todos' || (!sp.st || sp.st === 'A aprovar' ? !STATUS_NO_LIVRO.includes(l.status) : l.status === sp.st)) && (!q || `${l.hist} ${l.doc} ${l.origemId}`.toLowerCase().includes(q)));
  return (
    <div className="card">
      {edita && (
        <form action={aprovarConfiaveis} className="linha" style={{ marginBottom: 12 }}>
          <input type="hidden" name="volta" value={volta} />
          <button className="btn" type="submit">Aprovar todos com confiança ≥ 90%</button>
          <span className="pequeno mudo">Os de baixa confiança continuam para você revisar um a um.</span>
        </form>
      )}
      {edita && (
        <form action={aprovarTodosExceto} className="linha" style={{ marginBottom: 12 }}>
          <input type="hidden" name="volta" value={volta} />
          <button className="btn" type="submit">Aprovar todos os pendentes, menos os que têm</button>
          <input name="exceto" defaultValue="pix" style={{ width: 200 }} aria-label="Termos que ficam de fora" />
          <span className="pequeno mudo">Separe os termos por vírgula (ex.: pix, tarifa). Esses ficam para você revisar.</span>
        </form>
      )}
      {!vis.length ? <div className="vazio">{!sp.st || sp.st === 'A aprovar' ? 'Nada a aprovar neste período. Para ver os aprovados, escolha Status “Aprovado” ou “Todos”.' : 'Nenhum lançamento neste período e filtro.'}</div> : (
        <form action={aplicarStatus}>
          <input type="hidden" name="volta" value={volta} />
          {edita && (
            <div className="linha" style={{ marginBottom: 10 }}>
              <span className="pequeno">Com os marcados:</span>
              <button className="btn mini primario" name="status" value="Aprovado">Aprovar</button>
              <button className="btn mini" name="status" value="Contabilizado">Contabilizar</button>
              <button className="btn mini" name="status" value="Em revisão">Mandar para revisão</button>
              {sp.st === 'Excluído'
                ? <button className="btn mini primario" name="status" value="Restaurar">Restaurar</button>
                : <button className="btn mini perigo" name="status" value="Excluído" title="Tira o lançamento do balancete, da DRE e do balanço. Dá para restaurar depois.">Excluir</button>}
            </div>
          )}
          <div className="tabela-wrap"><table>
            <thead><tr>{edita && <th />}<th>Data</th><th>Histórico</th><th>Débito</th><th>Crédito</th><th className="num">Valor</th><th>Status</th><th>Por quê</th>{edita && <th />}</tr></thead>
            <tbody>
              {vis.slice(0, 400).map((l) => (
                <tr key={l.id}>
                  {edita && <td>{!['Contabilizado', 'Estornado'].includes(l.status) && <input type="checkbox" name="ids" value={l.id} aria-label="Marcar" />}</td>}
                  <td className="num">{dataBr(l.data)}<div className="pequeno mudo">{l.comp.split('-').reverse().join('/')}</div></td>
                  <td>{l.hist}<div className="pequeno mudo">{l.modulo} · {l.doc}</div></td>
                  <td className="pequeno">{rotuloConta(l.deb)}</td>
                  <td className="pequeno">{rotuloConta(l.cred)}</td>
                  <td className="num">{brl(l.valor)}</td>
                  <td><span className={`tag ${COR[l.status] || ''}`}>{l.status}</span><div className="pequeno mudo">{l.conf}%</div></td>
                  <td className="pequeno" style={{ minWidth: 220 }}>{l.motivo}</td>
                  {edita && (
                    <td>
                      {l.status === 'Excluído'
                        ? <button className="btn mini primario" name="restaurarUm" value={l.id}>Restaurar</button>
                        : !['Contabilizado', 'Estornado'].includes(l.status) && <button className="btn mini perigo" name="excluirUm" value={l.id} title="Tira este lançamento do balancete, da DRE e do balanço. Dá para restaurar depois.">Excluir</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
          {vis.length > 400 && <p className="pequeno mudo">Mostrando 400 de {vis.length}. Filtre por período ou status.</p>}
        </form>
      )}
      {edita && vis.some((l) => l.editavel || l.status === 'Contabilizado' || l.status === 'Aprovado') && (
        <details style={{ marginTop: 14 }}>
          <summary>Ajustar conta ou estornar um lançamento</summary>
          <div className="grade g2" style={{ marginTop: 10 }}>
            <form action={trocarConta} className="campos">
              <input type="hidden" name="volta" value={volta} />
              <div><label>Lançamento</label><select name="id">{vis.filter((l) => l.editavel && !['Contabilizado', 'Estornado'].includes(l.status)).slice(0, 300).map((l) => <option key={l.id} value={l.id}>{dataBr(l.data)} · {l.hist.slice(0, 70)} · {brl(l.valor)}</option>)}</select></div>
              <div><label>Nova conta</label><select name="conta">{PLANO_PADRAO.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nome}</option>)}</select></div>
              <label className="linha" style={{ fontWeight: 500 }}><input type="checkbox" name="aprender" defaultChecked /> Aprender: usar esta conta sempre para este parceiro</label>
              <div><button className="btn primario">Ajustar e aprovar</button></div>
            </form>
            <form action={estornarLanc} className="campos">
              <input type="hidden" name="volta" value={volta} />
              <div><label>Lançamento</label><select name="id">{vis.filter((l) => ['Aprovado', 'Contabilizado'].includes(l.status) && !l.id.endsWith('|est')).slice(0, 300).map((l) => <option key={l.id} value={l.id}>{dataBr(l.data)} · {l.hist.slice(0, 70)} · {brl(l.valor)}</option>)}</select></div>
              <div><label>Motivo do estorno</label><input name="motivo" required /></div>
              <div><button className="btn perigo">Estornar</button></div>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}

function Cabecalho({ titulo, emp, p }: { titulo: string; emp: string; p: { titulo: string } }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="rotulo">{emp}</div>
      <h2>{titulo} · {p.titulo}</h2>
    </div>
  );
}

function BalanceteEscritorio({ lancs, p, previa, emp }: { lancs: Lancamento[]; p: Periodo & { titulo: string }; previa: boolean; emp: string }) {
  const b = balanceteModelo(lancs, p, previa);
  return (
    <div className="card balancete-modelo">
      <Cabecalho titulo="Balancete de Verificação" emp={emp} p={p} />
      {!b.totalDebitos && !b.linhas.some((l) => l.anterior) ? <div className="vazio">Sem lançamentos aprovados no período. Aprove na aba Lançamentos ou ligue a prévia.</div> : <div className="tabela-wrap"><BalanceteModelo b={b} n="num" dePara /></div>}
    </div>
  );
}

function Balancete({ lancs, p, previa, emp }: { lancs: Lancamento[]; p: Periodo & { titulo: string }; previa: boolean; emp: string }) {
  const b = balancete(lancs, p, previa);
  // saldo com o lado: positivo = devedor (D), negativo = credor (C)
  const comLado = (v: number) => (Math.abs(v) < 0.005 ? '' : `${brl(Math.abs(v))} ${v > 0 ? 'D' : 'C'}`);
  return (
    <div className="card">
      <Cabecalho titulo="Balancete de Verificação" emp={emp} p={p} />
      {!b.linhas.length ? <div className="vazio">Sem lançamentos aprovados no período. Aprove na aba Lançamentos ou ligue a prévia.</div> : (
        <div className="tabela-wrap"><table>
          <thead><tr><th>Conta</th><th className="num">Saldo anterior</th><th className="num">Débitos</th><th className="num">Créditos</th><th className="num">Saldo atual</th></tr></thead>
          <tbody>
            {balanceteComGrupos(b.linhas).map((l) => (
              <tr key={l.conta} className={l.nivel === 1 ? 'destaque' : ''} style={l.sintetica ? { fontWeight: 700 } : undefined}>
                <td style={{ paddingLeft: 6 + (l.nivel - 1) * 14 }}>{l.conta} · {l.nome}</td><td className="num">{comLado(l.anterior)}</td><td className="num">{brl(l.debitos)}</td><td className="num">{brl(l.creditos)}</td><td className="num">{comLado(l.final)}</td>
              </tr>
            ))}
            <tr className="destaque"><td>Totais do período</td><td /><td className="num">{brl(b.totalDebitos)}</td><td className="num">{brl(b.totalCreditos)}</td><td className="num">{Math.abs(b.totalDebitos - b.totalCreditos) < 0.01 ? 'Débitos = créditos ✓' : 'Diferença!'}</td></tr>
          </tbody>
        </table></div>
      )}
    </div>
  );
}

function Dre({ lancs, p, previa, emp }: { lancs: Lancamento[]; p: Periodo & { titulo: string }; previa: boolean; emp: string }) {
  const d = dre(lancs, p, previa);
  return (
    <div className="card">
      <Cabecalho titulo="Demonstração do Resultado" emp={emp} p={p} />
      <table><tbody>
        {d.linhas.map((l) => (
          <tr key={l.rotulo} className={l.destaque ? 'destaque' : ''}>
            <td style={{ paddingLeft: l.nivel === 2 ? 26 : 6 }}>{l.rotulo}</td>
            <td className={`num ${l.destaque && l.valor < 0 ? 'neg' : ''}`}>{brl(l.valor)}</td>
          </tr>
        ))}
      </tbody></table>
      <p className="pequeno mudo" style={{ marginTop: 12 }}>Pendente: IRPJ e CSLL do Lucro Presumido ainda não são calculados na DRE.</p>
    </div>
  );
}

function Balanco({ lancs, p, previa, emp }: { lancs: Lancamento[]; p: Periodo & { titulo: string }; previa: boolean; emp: string }) {
  const b = balanco(lancs, p.ate, previa);
  return (
    <div className="card">
      <Cabecalho titulo={`Balanço Patrimonial em ${p.ate.split('-').reverse().join('/')}`} emp={emp} p={p} />
      {!b.fecha && <div className="aviso erro">O balanço não fecha: confira os lançamentos.</div>}
      <div className="grade g2">
        <table><tbody>
          <tr className="destaque"><td>ATIVO</td><td className="num">{brl(b.ativo)}</td></tr>
          {b.contasAtivo.map((c) => <tr key={c.conta}><td style={{ paddingLeft: 26 }}>{c.conta} · {c.nome}</td><td className="num">{brl(c.valor)}</td></tr>)}
        </tbody></table>
        <table><tbody>
          <tr className="destaque"><td>PASSIVO</td><td className="num">{brl(b.passivo)}</td></tr>
          {b.contasPassivo.filter((c) => !c.conta.startsWith('2.3')).map((c) => <tr key={c.conta}><td style={{ paddingLeft: 26 }}>{c.conta} · {c.nome}</td><td className="num">{brl(c.valor)}</td></tr>)}
          <tr className="destaque"><td>PATRIMÔNIO LÍQUIDO</td><td className="num">{brl(b.pl)}</td></tr>
          {b.contasPassivo.filter((c) => c.conta.startsWith('2.3')).map((c) => <tr key={c.conta}><td style={{ paddingLeft: 26 }}>{c.conta} · {c.nome}</td><td className="num">{brl(c.valor)}</td></tr>)}
          <tr><td style={{ paddingLeft: 26 }}>Resultado acumulado</td><td className="num">{brl(b.resultadoAcumulado)}</td></tr>
        </tbody></table>
      </div>
    </div>
  );
}

function Abertura({ ab, edita, volta }: { ab: AberturaMotor | null; edita: boolean; volta: string }) {
  const contas = PLANO_PADRAO.filter((c) => /^[12]\./.test(c.codigo) && c.codigo !== CONTA_ABERTURA);
  const valor = (c: string) => ab?.contas.find((x) => x.conta === c)?.valor || 0;
  const deb = ab ? ab.contas.filter((c) => c.valor > 0).reduce((a, c) => a + c.valor, 0) : 0;
  const cred = ab ? ab.contas.filter((c) => c.valor < 0).reduce((a, c) => a - c.valor, 0) : 0;
  const fmt = (v: number) => (v ? v.toFixed(2).replace('.', ',') : '');
  return (
    <div className="card">
      <h2>Balanço de abertura</h2>
      <p className="pequeno">Saldos de cada conta no fim do exercício anterior (o balanço registrado). A partir da data, a contabilidade parte destes saldos; o que aconteceu até ela já está dentro do balanço e fica de fora dos lançamentos. Débitos e créditos precisam ser iguais.</p>
      {ab && <p className="pequeno mudo">Gravado: {dataBr(ab.data)}{ab.fonte ? ` · ${ab.fonte}` : ''} · devedores {brl(deb)} · credores {brl(cred)}</p>}
      <form action={salvarAberturaAcao} className="campos">
        <input type="hidden" name="volta" value={volta} />
        <div className="linha">
          <div><label>Data do balanço</label><input type="date" name="data" defaultValue={ab?.data || ''} required disabled={!edita} /></div>
          <div style={{ flex: 1 }}><label>Fonte</label><input name="fonte" defaultValue={ab?.fonte || ''} placeholder="Ex.: Balanço 2025 registrado na JUCEA" disabled={!edita} /></div>
        </div>
        <div className="tabela-wrap"><table>
          <thead><tr><th>Conta</th><th className="num">Saldo devedor</th><th className="num">Saldo credor</th></tr></thead>
          <tbody>{contas.map((c) => (
            <tr key={c.codigo}>
              <td>{c.codigo} · {c.nome}</td>
              <td className="num"><input name={`d:${c.codigo}`} defaultValue={fmt(Math.max(valor(c.codigo), 0))} style={{ width: 140, textAlign: 'right' }} inputMode="decimal" disabled={!edita} /></td>
              <td className="num"><input name={`c:${c.codigo}`} defaultValue={fmt(Math.max(-valor(c.codigo), 0))} style={{ width: 140, textAlign: 'right' }} inputMode="decimal" disabled={!edita} /></td>
            </tr>
          ))}</tbody>
        </table></div>
        {edita && <div><button className="btn primario">Gravar balanço de abertura</button></div>}
      </form>
    </div>
  );
}

// contas mais usadas para classificar movimentos do extrato, no topo da lista
const CONTAS_EXTRATO: [string, string][] = [
  ['2.1.5.01', 'Sócia ou empresa do grupo (empréstimo / conta corrente)'], ['2.1.2.01', 'Funcionário (salário, adiantamento, vale)'],
  ['2.1.1.01', 'Fornecedor (pagamento de compra)'], ['1.1.2.01', 'Cliente (recebimento de venda)'], ['3.1.1.01', 'Receita de venda/serviço sem nota no ZARO'],
  ['4.1.1.01', 'Compra de material (custo)'], ['4.1.3.06', 'Serviço de terceiros'], ['4.1.3.03', 'Manutenção'], ['4.1.3.04', 'Combustível e veículos'],
  ['4.1.3.09', 'Despesas gerais'], ['4.1.2.04', 'Benefícios (alimentação, transporte)'], ['2.1.3.02', 'Empréstimo de pessoa física'], ['2.1.3.01', 'Empréstimo ou financiamento bancário'],
  ['2.1.4.01', 'Tributos (guia)'], ['4.2.1.02', 'Tarifa bancária'], ['1.1.9.97', 'Transferência entre contas da empresa'],
];

function ClassificarExtrato({ lancs, edita, volta }: { lancs: Lancamento[]; edita: boolean; volta: string }) {
  const pend = lancs.filter((l) => l.id.startsWith('BKX|') && !STATUS_NO_LIVRO.includes(l.status));
  const grupos = new Map<string, { n: number; entradas: number; saidas: number; contas: Map<string, number>; exemplo: string; motivo: string }>();
  for (const l of pend) {
    const k = l.contraparte || 'SEM NOME NO EXTRATO';
    const g = grupos.get(k) || { n: 0, entradas: 0, saidas: 0, contas: new Map(), exemplo: l.hist, motivo: l.motivo };
    const entrada = l.deb.startsWith('1.1.1');
    g.n++; if (entrada) g.entradas += l.valor; else g.saidas += l.valor;
    const conta = entrada ? l.cred : l.deb;
    g.contas.set(conta, (g.contas.get(conta) || 0) + 1);
    grupos.set(k, g);
  }
  const lista = [...grupos].map(([nome, g]) => ({ nome, ...g, conta: [...g.contas].sort((a, b) => b[1] - a[1])[0][0] })).sort((a, b) => b.entradas + b.saidas - (a.entradas + a.saidas));
  const outras = PLANO_PADRAO.filter((c) => !CONTAS_EXTRATO.some(([k]) => k === c.codigo) && c.codigo !== CONTA_ABERTURA);
  return (
    <div className="card">
      <h2>Classificar PIX e extrato por pessoa ou empresa</h2>
      <p className="pequeno">Cada linha junta todos os movimentos pendentes da mesma pessoa ou empresa. Escolha a conta e clique em <b>Classificar e aprovar</b>: todos entram nessa conta, ficam aprovados e os próximos extratos dela já vêm classificados. Se a conta sugerida já estiver certa, clique em <b>Aprovar como está</b>.</p>
      <p className="pequeno mudo">{pend.length} movimento(s) pendente(s) de {lista.length} contraparte(s). O nome vem do texto do banco; quando ele junta o nome da linha seguinte, confira pelo exemplo.</p>
      {!lista.length ? <div className="vazio">Nenhum movimento do extrato pendente.</div> : (
        <div className="tabela-wrap"><table>
          <thead><tr><th>Pessoa ou empresa</th><th className="num">Mov.</th><th className="num">Entradas</th><th className="num">Saídas</th><th>Conta hoje</th>{edita && <th>Classificar</th>}</tr></thead>
          <tbody>{lista.slice(0, 300).map((g) => (
            <tr key={g.nome}>
              <td><b>{g.nome}</b><div className="pequeno mudo">{g.exemplo.slice(0, 90)}</div></td>
              <td className="num">{g.n}</td>
              <td className="num">{g.entradas ? brl(g.entradas) : '—'}</td>
              <td className="num">{g.saidas ? brl(g.saidas) : '—'}</td>
              <td className="pequeno">{rotuloConta(g.conta)}{g.contas.size > 1 && <div className="mudo">e outras {g.contas.size - 1}</div>}</td>
              {edita && (
                <td style={{ minWidth: 300 }}>
                  <form action={classificarContraparteAcao} className="linha" style={{ gap: 6 }}>
                    <input type="hidden" name="volta" value={volta} /><input type="hidden" name="contraparte" value={g.nome} />
                    <select name="conta" defaultValue={g.conta} style={{ maxWidth: 230 }}>
                      <optgroup label="Mais usadas">{CONTAS_EXTRATO.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</optgroup>
                      <optgroup label="Plano de contas">{outras.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nome}</option>)}</optgroup>
                    </select>
                    <button className="btn mini primario">Classificar e aprovar</button>
                  </form>
                  <form action={aprovarContraparteAcao} style={{ marginTop: 4 }}>
                    <input type="hidden" name="volta" value={volta} /><input type="hidden" name="contraparte" value={g.nome} />
                    <button className="btn mini">Aprovar como está</button>
                  </form>
                </td>
              )}
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {lista.length > 300 && <p className="pequeno mudo">Mostrando as 300 maiores de {lista.length}.</p>}
    </div>
  );
}
