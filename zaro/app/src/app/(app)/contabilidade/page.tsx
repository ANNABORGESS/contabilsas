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
import { atenderPedido } from '@/server/pedidos';
import { aplicarStatus, aprovarConfiaveis, aprovarTodosExceto, estornarLanc, trocarConta } from './acoes';

type SP = { aba?: string; per?: string; ref?: string; de?: string; ate?: string; st?: string; previa?: string; q?: string; modelo?: string; msg?: string; erro?: string; pedido?: string };
const STATUS = ['Todos', 'Automático', 'Sugerido', 'Em revisão', 'Aprovado', 'Contabilizado', 'Estornado', 'Excluído'];
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
  const aba = ['lancamentos', 'balancete', 'dre', 'balanco'].includes(sp.aba || '') ? sp.aba! : 'lancamentos';
  const p = periodoContabil(sp, lancs.map((l) => l.comp));
  const previa = sp.previa === '1';
  const edita = podeEditar(u);
  const qs = (extra: Record<string, string | undefined>) => {
    const o = { aba, per: sp.per, ref: sp.ref, de: sp.de, ate: sp.ate, st: sp.st, previa: sp.previa, q: sp.q, modelo: sp.modelo, ...extra };
    return '/contabilidade?' + Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
  };
  const volta = qs({});
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
        {[['lancamentos', `Lançamentos (${pendentes} a aprovar)`], ['balancete', 'Balancete'], ['dre', 'DRE'], ['balanco', 'Balanço']].map(([k, n]) => (
          <Link key={k} href={qs({ aba: k })} className={aba === k ? 'ativo' : ''}>{n}</Link>
        ))}
      </div>
      <form className="card linha nao-imprimir" style={{ marginBottom: 16 }} action="/contabilidade">
        <input type="hidden" name="aba" value={aba} />
        <div><label>Período</label><select name="per" defaultValue={sp.per || 'ano'}><option value="mes">Mês</option><option value="tri">Trimestre</option><option value="ano">Ano</option><option value="pers">Personalizado</option></select></div>
        <div><label>Referência</label><input type="month" name="ref" defaultValue={sp.ref || p.ate} /></div>
        <div><label>De (personalizado)</label><input type="month" name="de" defaultValue={sp.de} /></div>
        <div><label>Até (personalizado)</label><input type="month" name="ate" defaultValue={sp.ate} /></div>
        {aba === 'lancamentos' && <div><label>Status</label><select name="st" defaultValue={sp.st || 'Todos'}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>}
        {aba === 'lancamentos' && <div style={{ flex: 1, minWidth: 160 }}><label>Busca</label><input name="q" defaultValue={sp.q} placeholder="Histórico, documento, código do título" /></div>}
        {aba === 'balancete' && <div><label>Modelo</label><select name="modelo" defaultValue={sp.modelo || ''}><option value="">Modelo do escritório</option><option value="zaro">Plano de contas do ZARO (detalhado)</option></select></div>}
        {aba !== 'lancamentos' && <label className="linha" style={{ alignSelf: 'flex-end' }}><input type="checkbox" name="previa" value="1" defaultChecked={previa} /> Prévia (inclui não aprovados)</label>}
        <button className="btn" type="submit" style={{ alignSelf: 'flex-end' }}>Aplicar</button>
      </form>

      {aba === 'lancamentos' && <Lancamentos lancs={sp.st === 'Excluído' ? todos : lancs} p={p} sp={sp} edita={edita} volta={volta} />}
      {aba === 'balancete' && (sp.modelo === 'zaro' ? <Balancete lancs={lancs} p={p} previa={previa} emp={emp.razao} /> : <BalanceteEscritorio lancs={lancs} p={p} previa={previa} emp={emp.razao} />)}
      {aba === 'dre' && <Dre lancs={lancs} p={p} previa={previa} emp={emp.razao} />}
      {aba === 'balanco' && <Balanco lancs={lancs} p={p} previa={previa} emp={emp.razao} />}
    </>
  );
}

function Lancamentos({ lancs, p, sp, edita, volta }: { lancs: Lancamento[]; p: Periodo; sp: SP; edita: boolean; volta: string }) {
  const q = (sp.q || '').toLowerCase();
  const vis = lancs.filter((l) => l.comp >= p.de && l.comp <= p.ate && (!sp.st || sp.st === 'Todos' || l.status === sp.st) && (!q || `${l.hist} ${l.doc} ${l.origemId}`.toLowerCase().includes(q)));
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
      {!vis.length ? <div className="vazio">Nenhum lançamento neste período e filtro.</div> : (
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
