import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { getDb } from '@/db';
import { brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { mesesAte } from '@/domain/painel';
import { exigirEmpresa, exigirUsuario, podeEditar, type Empresa, type Usuario } from '@/server/auth';
import { compPadrao, dadosDoPainel, type DadosPainel } from '@/server/painel';
import { BLOCOS, prefPainel, type Bloco } from '@/server/preferencias';
import { iaDisponivel } from '@/server/zaro-ia';
import { mesAtivo } from '@/server/mes';
import { Icone } from '@/components/Icone';
import { PerguntasIa } from '@/components/ZaroIa';
import { Grafico } from '@/components/painel/Grafico';
import { Personalizar, SeletorComp } from '@/components/painel/Personalizar';
import { COR } from '@/components/painel/cores';
import { Esqueleto } from './loading';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (m: string) => `${MESES[+m.slice(5) - 1]}/${m.slice(2, 4)}`;
const compBr = (c: string) => c.split('-').reverse().join('/');

function saudacao() {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Manaus' }).format(new Date()));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ comp?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const hoje = new Date().toISOString().slice(0, 10);
  const opcoes = mesesAte(hoje.slice(0, 7), 24).reverse();
  const mesTopo = await mesAtivo();
  const comp = sp.comp && opcoes.includes(sp.comp) ? sp.comp : mesTopo && opcoes.includes(mesTopo) ? mesTopo : compPadrao(hoje);
  const pref = await prefPainel(await getDb(), u);

  return (
    <>
      <div className="cabeca painel-cabeca">
        <div>
          <h1>{saudacao()}, {u.nome.split(' ')[0]}.</h1>
          <p>
            <b>{emp.fantasia || emp.razao}</b> · CNPJ {formatarCnpj(emp.cnpj)} · <span title="A ZARO ainda não tem cadastro de filiais: os números são da empresa (CNPJ) inteira.">Filial: matriz</span>
          </p>
        </div>
        <div className="filtros-painel">
          <span className="pequeno mudo">Escritório <b>{u.tenantNome}</b></span>
          <label className="pequeno">Competência <SeletorComp comp={comp} opcoes={opcoes} /></label>
          <Personalizar blocos={BLOCOS.map(([chave, nome]) => ({ chave, nome }))} ordem={pref.ordem} ocultos={pref.ocultos} />
        </div>
      </div>
      <Suspense key={`${emp.id}:${comp}`} fallback={<Esqueleto />}>
        <Blocos u={u} emp={emp} comp={comp} hoje={hoje} ordem={pref.ordem.filter((b) => !pref.ocultos.includes(b))} />
      </Suspense>
    </>
  );
}

async function Blocos({ u, emp, comp, hoje, ordem }: { u: Usuario; emp: Empresa; comp: string; hoje: string; ordem: Bloco[] }) {
  const d = await dadosDoPainel(await getDb(), u, emp, comp, hoje);
  const edita = podeEditar(u);
  const blocos: Record<Bloco, () => ReactNode> = {
    indicadores: () => <Indicadores d={d} />,
    posicao: () => <Posicao d={d} />,
    ia: () => <CartaoIa />,
    evolucao: () => <Evolucao d={d} />,
    fluxo: () => <Fluxo d={d} />,
    fechamento: () => <Fechamento d={d} />,
    atencao: () => <Atencao d={d} />,
    insights: () => <Insights d={d} />,
    atividades: () => <Atividades d={d} />,
    acoes: () => <Acoes edita={edita} comp={comp} />,
  };
  const largos: Bloco[] = ['indicadores', 'fechamento'];
  return (
    <>
      <p className="pequeno mudo status-dados">
        Última atualização dos dados: {d.ultimaAtualizacao ? new Date(d.ultimaAtualizacao).toLocaleString('pt-BR', { timeZone: 'America/Manaus', dateStyle: 'short', timeStyle: 'short' }) : 'nenhum registro'}
        {d.desatualizado && !d.vazio && <span className="tag at" style={{ marginLeft: 8 }}>Sem movimento há mais de 15 dias: os números podem estar desatualizados</span>}
      </p>
      {d.vazio && (
        <div className="aviso">Esta empresa ainda não tem títulos, lançamentos nem atividade. Comece importando documentos no <Link href="/autopilot">Autopilot</Link> ou o backup em <Link href="/configuracoes">Configurações</Link>. O Dashboard não mostra números de exemplo.</div>
      )}
      <div className="painel-grade">
        {ordem.map((b) => <section key={b} className={largos.includes(b) ? 'largo' : ''} data-bloco={b}>{blocos[b]()}</section>)}
      </div>
    </>
  );
}

function Variacao({ atual, antes, inverso, rotulo = 'vs. 30 dias atrás' }: { atual: number; antes: number | null; inverso?: boolean; rotulo?: string }) {
  if (antes == null) return <span className="var mudo">sem base de comparação</span>;
  const dif = atual - antes;
  const pct = antes !== 0 ? Math.round((dif / Math.abs(antes)) * 100) : null;
  const bom = inverso ? dif < 0 : dif > 0;
  return (
    <span className={`var ${dif === 0 ? 'mudo' : bom ? 'pos' : 'neg'}`}>
      {dif > 0 ? '▲' : dif < 0 ? '▼' : '='} {pct != null ? `${Math.abs(pct)}%` : brl(Math.abs(dif))} <span className="mudo">{rotulo}</span>
    </span>
  );
}

function Indicador({ icone, cor, rotulo, natureza, valor, children, href, link }: { icone: string; cor: string; rotulo: string; natureza: string; valor: ReactNode; children: ReactNode; href: string; link: string }) {
  return (
    <div className="card indicador" data-cor={cor}>
      <div className="ind-topo"><span className="ind-icone"><Icone nome={icone} tam={18} /></span><span className="rotulo">{rotulo}</span><span className="tag natureza">{natureza}</span></div>
      <div className="v">{valor}</div>
      <div className="ind-info">{children}</div>
      <Link href={href} className="ind-link">{link} →</Link>
    </div>
  );
}

function Indicadores({ d }: { d: DadosPainel }) {
  const i = d.indicadores;
  return (
    <div className="indicadores">
      <Indicador icone="fin" cor="menta" rotulo="Saldo bancário" natureza="Efetivo" href="/financeiro?tipo=extrato" link="Ver extrato"
        valor={i.banco.valor != null ? <span className={i.banco.valor < 0 ? 'neg' : ''}>{brl(i.banco.valor)}</span> : <span className="mudo">—</span>}>
        {i.banco.valor != null ? <><Variacao atual={i.banco.valor} antes={i.banco.antes} /><span>{i.banco.info}{i.banco.desatualizado && <span className="tag at"> desatualizado</span>}</span></> : <span>Saldo não informado. <Link href="/financeiro?tipo=extrato#saldo">Informar saldo inicial</Link> para a ZARO calcular pelo extrato.</span>}
      </Indicador>
      <Indicador icone="com" cor="ceu" rotulo="Contas a receber" natureza="Previsto" href="/financeiro?tipo=receber" link="Ver recebíveis" valor={brl(i.receber.valor)}>
        <Variacao atual={i.receber.valor} antes={i.receber.antes} />
        <span>{i.receber.n} título(s) · vencido {brl(i.receber.vencido)}</span>
      </Indicador>
      <Indicador icone="doc" cor="pessego" rotulo="Contas a pagar" natureza="Apurado" href="/financeiro?tipo=pagar" link="Ver contas" valor={brl(i.pagar.valor)}>
        <Variacao atual={i.pagar.valor} antes={i.pagar.antes} inverso />
        <span>{i.pagar.n} título(s) · vencido <b className={i.pagar.vencido ? 'neg' : ''}>{brl(i.pagar.vencido)}</b></span>
      </Indicador>
      <Indicador icone="fis" cor="lavanda" rotulo="Tributos em aberto" natureza="Apurado" href="/financeiro?tipo=pagar&f=abertos" link="Conferir tributos" valor={brl(i.tributos.valor)}>
        <Variacao atual={i.tributos.valor} antes={i.tributos.antes} inverso />
        <span>{i.tributos.nVencido ? <b className="neg">{i.tributos.nVencido} vencido(s): {brl(i.tributos.vencido)}</b> : 'Nenhum vencido'} · no mês {brl(i.tributos.noMes)}</span>
      </Indicador>
      <Indicador icone="cnt" cor="rosa" rotulo={`Resultado ${compBr(d.comp)}`} natureza={i.resultado.previa ? 'Prévia' : 'Apurado'} href={`/contabilidade?aba=dre&per=mes&ref=${d.comp}${i.resultado.previa ? '&previa=1' : ''}`} link="Ver DRE"
        valor={i.resultado.temLancamentos ? <span className={i.resultado.valor < 0 ? 'neg' : ''}>{brl(i.resultado.valor)}</span> : <span className="mudo">—</span>}>
        {i.resultado.temLancamentos ? <><Variacao atual={i.resultado.valor} antes={i.resultado.antes} rotulo="vs. mês anterior" /><span>{i.resultado.previa ? `${i.resultado.pendentes} lançamento(s) sem aprovação` : 'Lançamentos aprovados'}</span></> : <span>Sem lançamentos contábeis nesta competência.</span>}
      </Indicador>
    </div>
  );
}

function Posicao({ d }: { d: DadosPainel }) {
  const i = d.indicadores, f = d.fluxo;
  const linhas: [string, ReactNode, string, string][] = [
    ['Saldo em bancos', i.banco.valor != null ? brl(i.banco.valor) : 'não informado', 'efetivo', '/financeiro?tipo=extrato'],
    ['A receber (em aberto)', brl(i.receber.valor), 'previsto, ainda não é caixa', '/financeiro?tipo=receber'],
    ['A pagar (em aberto)', brl(i.pagar.valor), 'obrigação apurada', '/financeiro?tipo=pagar'],
    ['Tributos (em aberto)', brl(i.tributos.valor), 'incluídos no a pagar', '/financeiro?tipo=pagar&f=abertos'],
  ];
  return (
    <div className="card">
      <h2>Posição financeira</h2>
      <table className="posicao"><tbody>
        {linhas.map(([r, v, n, h]) => <tr key={r}><td><Link href={h}>{r}</Link><div className="pequeno mudo">{n}</div></td><td className="num">{v}</td></tr>)}
        <tr className="total"><td>Saldo projetado em 30 dias<div className="pequeno mudo">{f.temSaldoInicial ? 'banco + entradas previstas − saídas previstas' : 'sem saldo bancário: só o líquido previsto do período'}</div></td><td className={`num ${f.saldoFinal < 0 ? 'neg' : ''}`}>{brl(f.saldoFinal)}</td></tr>
      </tbody></table>
      {(f.vencidos.entradas > 0 || f.vencidos.saidas > 0) && <p className="pequeno mudo">Fora da projeção (já vencidos): a receber {brl(f.vencidos.entradas)} · a pagar {brl(f.vencidos.saidas)}.</p>}
    </div>
  );
}

function CartaoIa() {
  return (
    <div className="card cartao-ia">
      <div className="linha"><span className="ind-icone ia"><Icone nome="brilho" tam={18} /></span><h2>ZARO IA</h2>{!iaDisponivel() && <span className="tag at">aguardando chave da Anthropic</span>}</div>
      <p className="pequeno mudo">Pergunte sobre os números desta empresa. A resposta cita a fonte, o período e o link para conferir.</p>
      <PerguntasIa perguntas={['Como está meu caixa hoje?', 'O que vence nos próximos 7 dias?', 'Quais impostos estão em aberto?', 'O fechamento está atrasado?', 'Como está o endividamento?']} />
      <p className="pequeno" style={{ marginTop: 10 }}><Link href="/especialistas?q=crise">Diagnóstico de crise financeira →</Link> <span className="mudo">especialista que analisa liquidez, endividamento e propõe plano de recuperação</span></p>
    </div>
  );
}

function Evolucao({ d }: { d: DadosPainel }) {
  return (
    <div className="card">
      <h2>Evolução financeira</h2>
      <p className="pequeno mudo">Realizado: baixas registradas (recebimentos e pagamentos) por mês até {compBr(d.comp)}.</p>
      <Grafico titulo="Recebimentos, pagamentos e saldo por mês" categorias={d.serie.map((s) => mesCurto(s.mes))} rotulos={d.serie.map((s) => compBr(s.mes))} janelas={[3, 6, 12]} janelaInicial={6}
        series={[
          { nome: 'Recebimentos', cor: COR.entrada, tipo: 'barra', valores: d.serie.map((s) => s.entradas) },
          { nome: 'Pagamentos', cor: COR.saida, tipo: 'barra', valores: d.serie.map((s) => s.saidas) },
          { nome: 'Saldo do mês', cor: COR.saldo, tipo: 'linha', valores: d.serie.map((s) => s.saldo) },
        ]} />
    </div>
  );
}

function Fluxo({ d }: { d: DadosPainel }) {
  const f = d.fluxo;
  const cats = ['Hoje', ...f.semanas.map((s) => `${dataBr(s.de).slice(0, 5)}`)];
  return (
    <div className="card">
      <h2>Fluxo de caixa projetado</h2>
      <p className="pequeno mudo">{f.temSaldoInicial ? `Começa no saldo bancário de hoje (${brl(f.saldoInicial)}, realizado) e soma` : 'Sem saldo bancário informado: mostra só'} os títulos em aberto por vencimento (previsto, tracejado).</p>
      <Grafico titulo="Fluxo de caixa projetado por semana" categorias={cats} rotulos={['Hoje (realizado)', ...f.semanas.map((s) => `${dataBr(s.de)} a ${dataBr(s.ate)}`)]}
        series={[
          { nome: 'Entradas previstas', cor: COR.entrada, tipo: 'barra', valores: [null, ...f.semanas.map((s) => s.entradas)] },
          { nome: 'Saídas previstas', cor: COR.saida, tipo: 'barra', valores: [null, ...f.semanas.map((s) => -s.saidas)] },
          { nome: f.temSaldoInicial ? 'Saldo projetado' : 'Líquido acumulado', cor: COR.saldo, tipo: 'linha', valores: [f.saldoInicial ?? 0, ...f.semanas.map((s) => s.saldo)], projetadoDesde: 1 },
        ]} />
    </div>
  );
}

function Anel({ pct }: { pct: number | null }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={pct == null ? 'Não se aplica' : `${pct}%`} className="anel-mini">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--divisor)" strokeWidth="7" />
      {!!pct && <circle cx="32" cy="32" r={r} fill="none" stroke={pct === 100 ? '#78c39c' : '#8a6bbf'} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 32 32)" />}
      <text x="32" y="36" textAnchor="middle" className="anel-txt-mini">{pct == null ? '—' : `${pct}%`}</text>
    </svg>
  );
}

function Fechamento({ d }: { d: DadosPainel }) {
  return (
    <div className="card">
      <h2>Fechamento da competência {compBr(d.comp)}</h2>
      <p className="pequeno mudo">Percentual = tarefas concluídas sobre as que se aplicam à empresa, calculado a partir dos registros.</p>
      <div className="fech-areas">
        {d.areas.map((a) => (
          <div key={a.chave} className="fech-area">
            <div className="linha"><Anel pct={a.pct} /><div><Link href={a.href}><b>{a.nome}</b></Link><div className="pequeno mudo">{a.pct == null ? 'Não se aplica nesta competência' : `${a.pendencias.length} pendência(s)${a.erros ? ` · ${a.erros} erro(s)` : ''}`}</div></div></div>
            <ul className="tarefas">
              {a.tarefas.filter((t) => !t.naoSeAplica).map((t) => <li key={t.texto} className={t.ok ? 'ok' : t.erro ? 'erro' : 'pend'}>{t.texto}</li>)}
            </ul>
            {a.proxima && <Link className="btn mini" href={a.proxima.href}>{a.proxima.acao}</Link>}
            <div className="pequeno mudo" style={{ marginTop: 6 }}>Responsável: {a.responsavel ? `${a.responsavel.nome} (última ação em ${new Date(a.responsavel.quando).toLocaleDateString('pt-BR')})` : 'sem registro de atividade'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Atencao({ d }: { d: DadosPainel }) {
  return (
    <div className="card">
      <div className="linha" style={{ justifyContent: 'space-between' }}><h2>Requer sua atenção</h2>{d.totalAlertas > d.alertas.length && <span className="pequeno mudo">{d.alertas.length} de {d.totalAlertas}</span>}</div>
      {d.alertas.length ? (
        <ul className="alertas">
          {d.alertas.map((a) => (
            <li key={a.titulo + a.detalhe} data-g={a.gravidade}>
              <Link href={a.href}><b>{a.titulo}</b><span className="pequeno mudo">{a.detalhe}</span></Link>
              <span className={`tag ${a.gravidade === 3 ? 'neg' : a.gravidade === 2 ? 'at' : ''}`}>{a.gravidade === 3 ? 'Crítico' : a.gravidade === 2 ? 'Alto' : 'Atenção'}</span>
            </li>
          ))}
        </ul>
      ) : <div className="vazio">Nada pendente com evidência nos registros.</div>}
    </div>
  );
}

function Insights({ d }: { d: DadosPainel }) {
  return (
    <div className="card cartao-ia">
      <h2>Insights ZARO</h2>
      {d.insights.length ? (
        <ul className="insights">
          {d.insights.map((x) => <li key={x.titulo} data-tom={x.tom}><Link href={x.href}><b>{x.titulo}</b></Link><p className="pequeno">{x.texto}</p></li>)}
        </ul>
      ) : <div className="vazio">Sem padrão relevante nos dados desta competência. Os insights só aparecem quando os registros mostram a situação.</div>}
    </div>
  );
}

function Atividades({ d }: { d: DadosPainel }) {
  return (
    <div className="card">
      <div className="linha" style={{ justifyContent: 'space-between' }}><h2>Atividades recentes</h2><Link href="/auditoria" className="pequeno">Ver tudo</Link></div>
      {d.atividades.length ? (
        <div className="tabela-wrap"><table className="compacta">
          <thead><tr><th>Data</th><th>Descrição</th><th>Módulo</th><th>Status</th></tr></thead>
          <tbody>{d.atividades.map((a) => (
            <tr key={a.id}>
              <td className="pequeno">{new Date(a.quando).toLocaleString('pt-BR', { timeZone: 'America/Manaus', dateStyle: 'short', timeStyle: 'short' })}</td>
              <td>{a.acao}{a.entidade ? ` · ${a.entidade}` : ''}<div className="pequeno mudo">{a.usuario} · {d.empresa.nome}</div></td>
              <td><span className="tag">{a.modulo}</span></td>
              <td><span className="tag pos">Registrado</span></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <div className="vazio">Sem atividade registrada para esta empresa.</div>}
    </div>
  );
}

function Acoes({ edita, comp }: { edita: boolean; comp: string }) {
  const acoes: [string, string, string, boolean][] = [
    ['Importar documentos', '/autopilot', 'auto', true],
    ['Conciliar banco', '/financeiro?tipo=extrato', 'fin', true],
    ['Registrar recebimento', '/financeiro?tipo=receber&f=abertos', 'com', true],
    ['Conferir tributos', '/fiscal', 'fis', false],
    ['Executar fechamento', `/contabilidade?per=mes&ref=${comp}`, 'cnt', true],
    ['Emitir balanço, balancete ou DRE', `/contabilidade?aba=balancete&per=mes&ref=${comp}`, 'doc', false],
  ];
  return (
    <div className="card">
      <h2>Ações rápidas</h2>
      {!edita && <p className="pequeno mudo">Seu perfil é de consulta: as ações que alteram dados ficam bloqueadas.</p>}
      <div className="acoes-rapidas">
        {acoes.map(([n, h, i, altera]) => altera && !edita
          ? <span key={n} className="acao-rapida bloqueada" title="Sem permissão para alterar dados"><Icone nome={i} tam={18} />{n}</span>
          : <Link key={n} href={h} className="acao-rapida"><Icone nome={i} tam={18} />{n}</Link>)}
      </div>
    </div>
  );
}
