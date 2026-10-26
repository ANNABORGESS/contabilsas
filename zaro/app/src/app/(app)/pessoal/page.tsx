// Departamento Pessoal — central de auditoria trabalhista e conferência da folha.
// O sistema externo processa a folha e transmite as obrigações; o ZARO confere.
import Link from 'next/link';
import { FecharMenu } from '@/components/FecharMenu';
import { PerguntasIa } from '@/components/ZaroIa';
import { getDb } from '@/db';
import { addDias, brl, dataBr } from '@/domain/dinheiro';
import { type Holerite, type ItemConferencia, TABELAS_DP } from '@/domain/dp';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { dadosDP, ETAPAS_DP, podeVerDP, TIPOS_DOC } from '@/server/dp';
import { concluirAcao, convencaoAcao, declaradoAcao, eventoAcao, importarAcao, revisarAcao } from './acoes';

export const maxDuration = 60;

const ABAS: [string, string][] = [['visao', 'Visão Geral'], ['funcionarios', 'Funcionários'], ['folha', 'Conferência da Folha'], ['ferias', 'Férias, 13º e Rescisões'], ['encargos', 'Encargos e Guias'], ['esocial', 'eSocial'], ['convencoes', 'Convenções e Sindicatos'], ['relatorios', 'Auditoria e Relatórios']];
const COR: Record<string, string> = { Conferido: 'pos', Divergente: 'neg', 'Revisão Necessária': 'at', Pendente: '', 'Aguardando Documento': 'acento', Aceito: 'pos', Rejeitado: 'neg', Validada: 'pos', 'Aguardando validação': 'at', Calculado: '', Declarado: 'acento', 'Guia emitida': 'at', Pago: 'pos', Conciliado: 'pos', 'Pendente de comprovação': 'neg' };
const PERGUNTAS = ['Minha folha está correta?', 'Existe alguma diferença no INSS?', 'O FGTS está compatível com a folha?', 'Quais funcionários apresentam valores divergentes?', 'Quais guias estão sem comprovante?', 'O que está faltando para concluir a conferência da competência?'];
const compBr = (c: string | null) => (c ? c.split('-').reverse().join('/') : '—');
const v = (n: number | null | undefined) => (n == null ? '—' : brl(n));

type SP = Record<string, string | undefined>;

export default async function Pessoal({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const aba = ABAS.some(([k]) => k === sp.aba) ? sp.aba! : 'visao';
  const cab = (
    <div className="cabeca central"><div><div className="sobretitulo">Departamento Pessoal · auditoria e conferência</div><h1>{ABAS.find(([k]) => k === aba)![1]}</h1><p>A folha é processada e transmitida no seu sistema de DP. O ZARO recebe os documentos, confere os cálculos com as tabelas oficiais, cruza com guias, Financeiro e Contabilidade e aponta divergências.</p></div></div>
  );
  if (!podeVerDP(u)) return <>{cab}<div className="aviso erro">Seu perfil ({u.perfil}) não tem acesso a salários, CPF e documentos dos trabalhadores. Peça acesso a um Administrador.</div></>;
  const edita = podeEditar(u);
  const comp = /^\d{4}-\d{2}$/.test(sp.comp || '') ? sp.comp! : null;
  const db = await getDb();
  const d = await dadosDP(db, emp, comp);
  const c = d.comp;
  const arquivoDe = new Map(d.docs.map((x) => [x.id, x.arquivoId]));
  const avisos = <>{sp.msg && <div className="aviso ok">{sp.msg}</div>}{sp.erro && <div className="aviso erro">{sp.erro}</div>}</>;
  const seletor = (
    <form className="linha" action="/pessoal" style={{ marginBottom: 12 }}>
      <input type="hidden" name="aba" value={aba} />
      <label className="linha">Competência <select name="comp" defaultValue={c || ''}>{d.competencias.length ? d.competencias.map((x) => <option key={x} value={x}>{compBr(x)}</option>) : <option value="">—</option>}</select></label>
      <button className="btn mini" type="submit">Ver</button>
    </form>
  );
  const importar = (tipo: string, volta: string, rotulo = 'Importar documentos') => edita && (
    <details className="card" style={{ marginBottom: 16 }} open={!d.todosHolerites.length && tipo === 'holerites'}>
      <summary><b>{rotulo}</b></summary>
      <form action={importarAcao} className="grade g4" style={{ alignItems: 'end', marginTop: 10 }}>
        <input type="hidden" name="volta" value={volta} />
        <div><label>Tipo</label><select name="tipo" defaultValue={tipo}>{TIPOS_DOC.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        <div><label>Competência</label><input type="month" name="competencia" defaultValue={c || ''} /></div>
        <div><label>Folha</label><select name="tipoFolha" defaultValue="mensal"><option value="mensal">Mensal</option><option value="adiantamento">Adiantamento</option><option value="ferias">Férias</option><option value="13">13º salário</option><option value="rescisao">Rescisão</option></select></div>
        <div style={{ gridColumn: 'span 3' }}><label>Arquivos (PDF, texto, XML, CSV, Excel)</label><input type="file" name="arquivo" multiple required /></div>
        <div><button className="btn primario" type="submit">Importar e conferir</button></div>
      </form>
      <p className="pequeno mudo" style={{ marginTop: 6 }}>Holerites (“Demonstrativo de Pagamento”) em PDF com texto são lidos e conferidos sozinhos; retorno do eSocial em XML também. Os demais ficam guardados para conferência manual. PDF digitalizado (imagem) não tem leitura automática.</p>
    </details>
  );

  let corpo: React.ReactNode;
  if (aba === 'visao') {
    const probl = d.linhas.filter((l) => l.status !== 'Conferido');
    const hoje = new Date().toISOString().slice(0, 10);
    const ferias = d.funcs.filter((f) => f.ativo && f.admissao).map((f) => { const ad = f.admissao!; const anos = Math.floor((Date.parse(hoje) - Date.parse(ad)) / (365.25 * 86_400_000)); const venc = addDias(ad, (anos + 1) * 365); return { nome: f.nome, venc }; }).filter((x) => x.venc <= addDias(hoje, 60)).sort((a, b) => a.venc.localeCompare(b.venc));
    const atencao = [
      ...probl.filter((l) => l.status === 'Divergente').slice(0, 5).map((l) => ({ t: `${l.funcionario}: ${l.item}`, s: `${v(l.informado)} × ${v(l.conferido)} — ${l.motivo}`, href: `/pessoal?aba=folha&comp=${c}`, cor: 'neg' })),
      ...d.obrigacoes.filter((o) => o.status === 'Pendente de comprovação' || o.status === 'Calculado').map((o) => ({ t: `${o.tributo} ${compBr(c)}: ${o.status}`, s: o.status === 'Calculado' ? 'Sem guia no Contas a Pagar nem valor declarado' : 'Pago sem comprovante anexado', href: `/pessoal?aba=encargos&comp=${c}`, cor: 'at' })),
      ...d.esocial.filter((e) => e.status === 'Rejeitado').slice(0, 3).map((e) => ({ t: `eSocial rejeitado: ${e.descricao}`, s: ((e.dados as { ocorrencias?: string[] }).ocorrencias || []).join('; '), href: '/pessoal?aba=esocial', cor: 'neg' })),
      ...d.eventos.filter((e) => e.status === 'Divergente').map((e) => ({ t: e.descricao, s: 'Prazo ou cálculo divergente', href: '/pessoal?aba=ferias', cor: 'neg' })),
      ...d.contabil.filter((x) => x.achado !== 'Confere').map((x) => ({ t: `Contabilidade: ${x.item}`, s: `${x.achado}: folha ${brl(x.folha)} × razão ${brl(x.razao)}`, href: `/pessoal?aba=relatorios&comp=${c}`, cor: 'at' })),
    ];
    corpo = (
      <>
        {seletor}
        <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
          {([
            ['Funcionários ativos', d.funcs.filter((f) => f.ativo).length, `${d.totais.funcionarios} holerite(s) em ${compBr(c)}`],
            ['Folhas recebidas', d.competencias.length, `${d.docs.length} documento(s)`],
            ['Folhas conferidas', d.concluidas, d.conf?.concluidaEm ? `${compBr(c)} concluída` : `${compBr(c)}: ${d.conf?.etapa || 'Importar documentos'}`],
            ['Folhas com divergência', d.compsComDivergencia, 'competências com item divergente'],
            ['Itens com divergência', d.linhas.filter((l) => l.status === 'Divergente').length, `${d.linhas.filter((l) => l.status === 'Revisão Necessária').length} para revisão`],
            ['Guias pendentes', d.obrigacoes.filter((o) => !['Pago', 'Conciliado'].includes(o.status)).length, 'FGTS, INSS, IRRF'],
            ['eSocial rejeitados', d.esocial.filter((e) => e.status === 'Rejeitado').length, `${d.esocial.length} evento(s) importado(s)`],
            ['Férias a vencer (60 dias)', ferias.length, ferias[0] ? `1º: ${dataBr(ferias[0].venc)}` : 'pela data de admissão'],
            ['Rescisões para revisão', d.eventos.filter((e) => e.tipo === 'rescisao' && e.status !== 'Conferido').length, `${d.eventos.filter((e) => e.tipo === 'rescisao').length} conferida(s)`],
          ] as [string, number, string][]).map(([r, n, s]) => <div key={r} className="card kpi"><div className="rotulo">{r}</div><div className="v">{n}</div><div className="s">{s}</div></div>)}
        </div>
        <div className="grade g2" style={{ alignItems: 'start' }}>
          <div className="card">
            <h2>Requer sua atenção</h2>
            {atencao.length ? atencao.slice(0, 10).map((a, k) => <Link key={k} href={a.href} className="linha" style={{ padding: '8px 0', borderBottom: '1px solid var(--divisor)', color: 'inherit', textDecoration: 'none', alignItems: 'flex-start' }}><span className={`tag ${a.cor}`}>!</span><div><b>{a.t}</b><div className="pequeno mudo">{a.s}</div></div></Link>) : <div className="vazio">{d.todosHolerites.length ? 'Nada pendente nesta competência.' : 'Importe a folha para começar a conferência.'}</div>}
          </div>
          <div className="card">
            <h2>Fechamento da conferência · {compBr(c)}</h2>
            <ol className="pequeno" style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.9 }}>
              {ETAPAS_DP.map((e) => { const i = ETAPAS_DP.indexOf(e); const at = ETAPAS_DP.indexOf(d.conf?.etapa || ETAPAS_DP[0]); return <li key={e} style={{ fontWeight: i === at ? 700 : 400, opacity: i > at ? 0.5 : 1 }}>{i < at || d.conf?.concluidaEm ? '✓ ' : ''}{e}</li>; })}
            </ol>
            <p className="pequeno mudo" style={{ marginTop: 8 }}>Concluir a conferência no ZARO não significa que as obrigações foram transmitidas ou pagas.</p>
            <PerguntasIa perguntas={PERGUNTAS} area="dp" />
          </div>
        </div>
      </>
    );
  } else if (aba === 'funcionarios') {
    corpo = (
      <>
        {importar('holerites', 'funcionarios', 'Importar cadastro pelos holerites')}
        <div className="card">
          <h2>{d.funcs.length} funcionário(s)</h2>
          <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Cadastro vindo do backup e dos holerites importados. O CPF aparece mascarado; o número completo não é guardado.</p>
          {d.funcs.length ? (
            <div className="tabela-wrap"><table>
              <thead><tr><th>Nome</th><th>Matrícula</th><th>CPF</th><th>Cargo</th><th>Admissão</th><th className="num">Salário (cadastro)</th><th className="num">Salário último holerite</th><th>Conferência cadastral</th></tr></thead>
              <tbody>{d.funcs.map((f) => {
                const fd = f.dados as { matricula?: string; cpfMascara?: string };
                const ult = d.todosHolerites.filter((h) => h.funcionarioId === f.id).sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
                const sb = ult ? (ult.dados as unknown as Holerite).salarioBase : null;
                const ok = sb == null || f.salario == null || Math.abs(sb - f.salario) <= 0.05;
                return <tr key={f.id}><td>{f.nome}</td><td>{fd.matricula || '—'}</td><td className="pequeno">{fd.cpfMascara || '—'}</td><td>{f.cargo || '—'}</td><td>{dataBr(f.admissao)}</td><td className="num">{v(f.salario)}</td><td className="num">{v(sb)}{ult && <div className="pequeno mudo">{compBr(ult.competencia)}</div>}</td><td><span className={`tag ${ok ? 'pos' : 'at'}`}>{!ult ? 'Sem holerite' : ok ? 'Confere' : 'Salário diferente do cadastro'}</span></td></tr>;
              })}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhum funcionário. Importe os holerites da folha.</div>}
        </div>
      </>
    );
  } else if (aba === 'folha') {
    const filtro = sp.st || '';
    const lista = d.linhas.filter((l) => (filtro ? l.status === filtro : true));
    corpo = (
      <>
        {importar('holerites', 'folha')}
        {seletor}
        <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 16 }}>
          {([['Funcionários', String(d.totais.funcionarios)], ['Vencimentos', brl(d.totais.vencimentos)], ['Descontos', brl(d.totais.descontos)], ['Líquido', brl(d.totais.liquido)], ['INSS descontado', brl(d.totais.inss)], ['IRRF', brl(d.totais.irrf)], ['FGTS do mês', brl(d.totais.fgts)]] as [string, string][]).map(([r, x]) => <div key={r} className="card kpi"><div className="rotulo">{r}</div><div className="v" style={{ fontSize: 20 }}>{x}</div></div>)}
        </div>
        <div className="card">
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <h2>Tabela de divergências · {compBr(c)}</h2>
            <div className="linha" style={{ gap: 6 }}>{['', 'Divergente', 'Revisão Necessária', 'Aguardando Documento', 'Pendente', 'Conferido'].map((s) => <Link key={s} href={`/pessoal?aba=folha${c ? `&comp=${c}` : ''}${s ? `&st=${encodeURIComponent(s)}` : ''}`} className={`tag ${filtro === s ? 'acento' : ''}`}>{s || 'Todos'} · {s ? d.linhas.filter((l) => l.status === s).length : d.linhas.length}</Link>)}</div>
          </div>
          <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Conferido com as tabelas {TABELAS_DP.map((t) => t.versao).join(' e ')} ({TABELAS_DP[TABELAS_DP.length - 1].fonte}). Diferença não é erro comprovado: avalie bases, rubricas e o cadastro antes de concluir.</p>
          {lista.length ? (
            <div className="tabela-wrap"><table>
              <thead><tr><th>Funcionário</th><th>Competência</th><th>Item</th><th className="num">Valor informado</th><th className="num">Valor conferido</th><th className="num">Diferença</th><th>Status</th><th>Motivo</th><th>Ação recomendada</th><th /></tr></thead>
              <tbody>{lista.map((l) => (
                <tr key={l.chave}>
                  <td>{l.funcionario}<div className="pequeno mudo">Mat. {l.matricula}</div></td>
                  <td>{compBr(l.competencia)}</td>
                  <td>{l.item}</td>
                  <td className="num">{v(l.informado)}</td>
                  <td className="num">{v(l.conferido)}</td>
                  <td className={`num ${l.diferenca && Math.abs(l.diferenca) > 0.05 ? 'neg' : ''}`}>{v(l.diferenca)}</td>
                  <td><span className={`tag ${COR[l.status] || ''}`}>{l.status}</span>{l.revisao && <div className="pequeno mudo" title={l.revisao.nota}>revisado por {l.revisao.por}</div>}</td>
                  <td className="pequeno">{l.motivo}</td>
                  <td className="pequeno">{l.acao}</td>
                  <td><div className="linha" style={{ gap: 4 }}>
                    {l.documentoId && arquivoDe.get(l.documentoId) && <a className="btn mini" href={`/arquivos/${arquivoDe.get(l.documentoId)}`} target="_blank">Documento</a>}
                    {edita && (
                      <details className="menu-acao"><summary className="btn mini">Revisar</summary>
                        <form action={revisarAcao} className="card menu-acao-caixa" style={{ width: 300, top: 34 }}>
                          <FecharMenu />
                          <input type="hidden" name="comp" value={l.competencia} /><input type="hidden" name="chave" value={l.chave} />
                          <label>Decisão do revisor</label>
                          <select name="decisao" defaultValue={l.status}>{['Conferido', 'Divergente', 'Revisão Necessária', 'Pendente', 'Aguardando Documento'].map((s) => <option key={s}>{s}</option>)}</select>
                          <label>Justificativa</label><input name="nota" placeholder="Ex.: dependente no cadastro do sistema de folha" defaultValue={l.revisao?.nota || ''} />
                          <button className="btn primario" type="submit">Registrar revisão</button>
                        </form>
                      </details>
                    )}
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="vazio">{d.linhas.length ? 'Nenhum item com este status.' : 'Importe os holerites da competência.'}</div>}
        </div>
      </>
    );
  } else if (aba === 'ferias') {
    corpo = (
      <>
        {importar('ferias', 'ferias', 'Importar recibos de férias, 13º e rescisões')}
        {edita && (
          <details className="card" style={{ marginBottom: 16 }}>
            <summary><b>Conferir férias, 13º ou rescisão</b></summary>
            <form action={eventoAcao} className="grade g4" style={{ alignItems: 'end', marginTop: 10 }}>
              <input type="hidden" name="comp" value={c || ''} />
              <div><label>Tipo</label><select name="tipo"><option value="ferias">Férias</option><option value="decimo">13º salário</option><option value="rescisao">Rescisão</option></select></div>
              <div style={{ gridColumn: 'span 2' }}><label>Funcionário</label><select name="funcionario" required>{d.funcs.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
              <div><label>Parcela do 13º</label><select name="parcela"><option value="1">1ª</option><option value="2">2ª</option></select></div>
              <div><label>Referência (início das férias / término / data do 13º)</label><input type="date" name="referencia" required /></div>
              <div><label>Pago em</label><input type="date" name="pagoEm" /></div>
              <div><label>Remuneração das férias</label><input name="remuneracao" inputMode="decimal" /></div>
              <div><label>1/3 informado</label><input name="terco" inputMode="decimal" /></div>
              <div><label>Valor pago</label><input name="valorPago" inputMode="decimal" /></div>
              <div style={{ gridColumn: 'span 2' }}><label>Observação</label><input name="obs" placeholder="Período aquisitivo, médias, motivo da rescisão…" /></div>
              <div><button className="btn primario" type="submit">Conferir</button></div>
            </form>
            <p className="pequeno mudo" style={{ marginTop: 6 }}>Confere prazos legais (férias até 2 dias antes — CLT 145; 13º até 30/11 e 20/12; rescisão em 10 dias — CLT 477 §6º) e o 1/3 constitucional. Médias e verbas variáveis ficam para revisão humana.</p>
          </details>
        )}
        <div className="card">
          <h2>Conferências</h2>
          {d.eventos.length ? (
            <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
              <thead><tr><th>Conferência</th><th>Referência</th><th>Pago em</th><th className="num">Valor pago</th><th>Itens</th><th>Status</th></tr></thead>
              <tbody>{d.eventos.map((e) => { const x = e.dados as { referencia: string; pagoEm: string | null; itens: ItemConferencia[] }; return <tr key={e.id}><td>{e.descricao}</td><td>{dataBr(x.referencia)}</td><td>{dataBr(x.pagoEm)}</td><td className="num">{v(e.valor)}</td><td className="pequeno">{x.itens.map((i) => <div key={i.item}>{i.item}: {i.motivo}</div>)}</td><td><span className={`tag ${COR[e.status || ''] || ''}`}>{e.status}</span></td></tr>; })}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhuma conferência de férias, 13º ou rescisão ainda.</div>}
        </div>
      </>
    );
  } else if (aba === 'encargos') {
    corpo = (
      <>
        {seletor}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Folha × declarado × guia × pagamento · {compBr(c)}</h2>
          <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Guias são procuradas no Contas a Pagar da competência. Guia emitida não é pagamento; pago sem comprovante anexado fica “pendente de comprovação”.</p>
          <div className="tabela-wrap"><table>
            <thead><tr><th>Tributo</th><th className="num">Calculado (folha)</th><th className="num">Declarado</th><th className="num">Guia (Contas a Pagar)</th><th className="num">Pago</th><th>Status</th><th>Observação</th>{edita && <th />}</tr></thead>
            <tbody>{d.obrigacoes.map((o) => (
              <tr key={o.tributo}>
                <td><b>{o.tributo}</b>{o.titulos.length > 0 && <div className="pequeno"><Link href={`/financeiro?tipo=pagar&f=todos&q=${o.titulos[0]}`}>{o.titulos.join(', ')}</Link></div>}</td>
                <td className="num">{brl(o.calculado)}</td>
                <td className="num">{v(o.declarado)}{o.declaradoFonte && <div className="pequeno mudo">{o.declaradoFonte}</div>}</td>
                <td className="num">{v(o.guia)}{o.difGuia != null && Math.abs(o.difGuia) > 0.05 && <div className="pequeno neg">dif. {brl(o.difGuia)}</div>}</td>
                <td className="num">{v(o.pago)}</td>
                <td><span className={`tag ${COR[o.status] || ''}`}>{o.status}</span></td>
                <td className="pequeno">{o.nota}</td>
                {edita && c && <td>
                  <details className="menu-acao"><summary className="btn mini">Declarado</summary>
                    <form action={declaradoAcao} className="card menu-acao-caixa" style={{ width: 300, top: 34 }}>
                      <FecharMenu />
                      <input type="hidden" name="comp" value={c} /><input type="hidden" name="tributo" value={o.tributo} />
                      <label>Valor declarado ({o.tributo === 'FGTS' ? 'FGTS Digital' : 'DCTFWeb'})</label><input name="declarado" inputMode="decimal" defaultValue={o.declarado ?? ''} required />
                      <label>Fonte</label><input name="fonte" placeholder="Ex.: recibo DCTFWeb nº…" defaultValue={o.declaradoFonte || ''} />
                      <button className="btn primario" type="submit">Salvar</button>
                    </form>
                  </details>
                </td>}
              </tr>
            ))}</tbody>
          </table></div>
        </div>
        {importar('guia', 'encargos', 'Importar guias, DCTFWeb, FGTS Digital e comprovantes')}
      </>
    );
  } else if (aba === 'esocial') {
    corpo = (
      <>
        {importar('esocial', 'esocial', 'Importar retorno do eSocial (XML)')}
        <div className="card">
          <h2>Eventos do eSocial</h2>
          <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>O ZARO não transmite eventos: acompanha recibos, aceites e rejeições dos arquivos de retorno do seu sistema de DP.</p>
          {d.esocial.length ? (
            <div className="tabela-wrap"><table>
              <thead><tr><th>Evento</th><th>Id</th><th>Recibo</th><th>Situação</th><th>Ocorrências</th><th>Documento</th></tr></thead>
              <tbody>{d.esocial.map((e) => { const x = e.dados as { id: string; recibo: string | null; ocorrencias: string[] }; return <tr key={e.id}><td>{e.descricao}</td><td className="pequeno">{x.id}</td><td className="pequeno">{x.recibo || '—'}</td><td><span className={`tag ${COR[e.status || ''] || ''}`}>{e.status}</span></td><td className="pequeno">{x.ocorrencias?.join('; ') || '—'}</td><td>{e.documentoId && arquivoDe.get(e.documentoId) ? <a href={`/arquivos/${arquivoDe.get(e.documentoId)}`} target="_blank">Abrir</a> : '—'}</td></tr>; })}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhum retorno do eSocial importado.</div>}
        </div>
      </>
    );
  } else if (aba === 'convencoes') {
    corpo = (
      <>
        {edita && (
          <details className="card" style={{ marginBottom: 16 }} open={!d.convencoes.length}>
            <summary><b>Cadastrar convenção ou acordo coletivo</b></summary>
            <form action={convencaoAcao} className="grade g4" style={{ alignItems: 'end', marginTop: 10 }}>
              <div style={{ gridColumn: 'span 2' }}><label>Sindicato / instrumento</label><input name="sindicato" required placeholder="Ex.: CCT Metalúrgicos de Manaus 2026" /></div>
              <div><label>Vigência de</label><input type="date" name="de" /></div>
              <div><label>até</label><input type="date" name="ate" /></div>
              <div><label>Data-base</label><input name="dataBase" placeholder="Ex.: 01/05" /></div>
              <div><label>Piso salarial</label><input name="piso" inputMode="decimal" /></div>
              <div><label>Reajuste (%)</label><input name="reajuste" inputMode="decimal" /></div>
              <div style={{ gridColumn: 'span 2' }}><label>Benefícios</label><input name="beneficios" placeholder="Cesta básica, PLR, adicionais…" /></div>
              <div style={{ gridColumn: 'span 2' }}><label>Regras específicas</label><input name="regras" placeholder="Hora extra 60%, adicional noturno…" /></div>
              <label className="linha" style={{ fontWeight: 500 }}><input type="checkbox" name="validar" /> Validei estas regras com o texto do instrumento</label>
              <div><button className="btn primario" type="submit">Salvar</button></div>
            </form>
            <p className="pequeno mudo" style={{ marginTop: 6 }}>Só convenção validada por um profissional vira parâmetro de auditoria (piso usado na conferência da folha). O PDF do instrumento pode ser guardado em “Importar documentos”, tipo Convenção.</p>
          </details>
        )}
        <div className="card">
          <h2>Convenções e sindicatos</h2>
          {d.convencoes.length ? (
            <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
              <thead><tr><th>Instrumento</th><th>Vigência</th><th>Data-base</th><th className="num">Piso</th><th className="num">Reajuste</th><th>Benefícios / regras</th><th>Situação</th></tr></thead>
              <tbody>{d.convencoes.map((x) => { const y = x.dados as { de?: string; ate?: string; dataBase?: string; reajuste?: number; beneficios?: string; regras?: string; validadoPor?: string }; return <tr key={x.id}><td>{x.descricao}</td><td>{dataBr(y.de || null)} a {dataBr(y.ate || null)}</td><td>{y.dataBase || '—'}</td><td className="num">{v(x.valor)}</td><td className="num">{y.reajuste != null ? `${y.reajuste}%` : '—'}</td><td className="pequeno">{[y.beneficios, y.regras].filter(Boolean).join(' · ') || '—'}</td><td><span className={`tag ${COR[x.status || ''] || ''}`}>{x.status}</span>{y.validadoPor && <div className="pequeno mudo">por {y.validadoPor}</div>}</td></tr>; })}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhuma convenção cadastrada.</div>}
        </div>
        {importar('convencao', 'convencoes', 'Guardar o PDF da convenção')}
      </>
    );
  } else {
    corpo = (
      <>
        {seletor}
        <div className="grade g2" style={{ alignItems: 'start' }}>
          <div className="card">
            <h2>Relatório de Auditoria DP · {compBr(c)}</h2>
            <p className="pequeno mudo">Empresa, CNPJ, competência, funcionários, totais da folha e encargos, itens conferidos, divergências, pendências, recomendações, responsável e data.</p>
            {c ? <div className="linha"><a className="btn primario" href={`/relatorio-dp?comp=${c}`} target="_blank">Gerar Relatório de Auditoria DP (PDF)</a><a className="btn" href={`/pessoal/exportar?comp=${c}`}>Excel</a></div> : <div className="vazio">Importe uma folha primeiro.</div>}
          </div>
          <div className="card">
            <h2>Concluir a conferência</h2>
            {d.conf?.concluidaEm ? (
              <>
                <div className="aviso ok">Concluída por {d.conf.responsavel} em {new Date(d.conf.concluidaEm).toLocaleDateString('pt-BR')}. Isso não significa que as obrigações foram transmitidas ou pagas.</div>
                <p className="pequeno">{d.conf.parecer}</p>
                {edita && <form action={concluirAcao}><input type="hidden" name="comp" value={c || ''} /><input type="hidden" name="reabrir" value="1" /><button className="btn mini" type="submit">Reabrir</button></form>}
              </>
            ) : edita && c ? (
              <form action={concluirAcao} className="campos">
                <input type="hidden" name="comp" value={c} />
                <label>Parecer do revisor</label>
                <textarea name="parecer" rows={4} required placeholder="Resumo da conferência, divergências tratadas e pendências." />
                <button className="btn primario" type="submit">Concluir conferência de {compBr(c)}</button>
              </form>
            ) : <div className="vazio">—</div>}
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Folha × Contabilidade · {compBr(c)}</h2>
          {d.contabil.length ? (
            <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
              <thead><tr><th>Item</th><th className="num">Folha</th><th className="num">Razão</th><th className="num">Diferença</th><th>Achado</th></tr></thead>
              <tbody>{d.contabil.map((x) => <tr key={x.item}><td>{x.item}</td><td className="num">{brl(x.folha)}</td><td className="num">{brl(x.razao)}</td><td className="num">{brl(x.diferenca)}</td><td><span className={`tag ${x.achado === 'Confere' ? 'pos' : 'at'}`}>{x.achado}</span></td></tr>)}</tbody>
            </table></div>
          ) : <div className="vazio">Sem folha importada nesta competência.</div>}
          <p className="pequeno mudo" style={{ marginTop: 8 }}>Ajustes sugeridos ficam para aprovação em <Link href="/contabilidade">Contabilidade</Link>; o ZARO não lança nada sozinho a partir da folha.</p>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Documentos recebidos</h2>
          {d.docs.length ? (
            <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
              <thead><tr><th>Arquivo</th><th>Tipo</th><th>Competência</th><th>Leitura</th><th>Recebido</th></tr></thead>
              <tbody>{d.docs.map((x) => <tr key={x.id}><td>{x.arquivoId ? <a href={`/arquivos/${x.arquivoId}`} target="_blank">{x.nome}</a> : x.nome}</td><td>{TIPOS_DOC.find(([k]) => k === x.tipo)?.[1] || x.tipo}</td><td>{compBr(x.competencia)}</td><td><span className={`tag ${x.status === 'Lido' ? 'pos' : x.status === 'Erro' ? 'neg' : ''}`}>{x.status}</span></td><td className="pequeno">{new Date(x.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Manaus' })} · {x.usuario}</td></tr>)}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhum documento.</div>}
        </div>
      </>
    );
  }

  return (
    <>
      {cab}
      {avisos}
      {corpo}
    </>
  );
}
