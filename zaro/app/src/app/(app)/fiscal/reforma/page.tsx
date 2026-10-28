// Fiscal e Tributário → Reforma Tributária → Split Payment.
import Link from 'next/link';
import { BarrasH } from '@/components/painel/Grafico';
import { FecharMenu } from '@/components/FecharMenu';
import { PerguntasIa } from '@/components/ZaroIa';
import { getDb } from '@/db';
import { addDias, brl, dataBr, numero } from '@/domain/dinheiro';
import { DIVERGENCIAS, type Divergencia, REGRAS_SPLIT, simularSplit, VERSAO_REGRAS } from '@/domain/split-payment';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { dadosSplit } from '@/server/split-payment';
import { conciliarAcao, confirmarAcao, desfazerAcao, importarAcao, sincronizarAcao } from './acoes';

const ABAS: [string, string][] = [['visao', 'Visão geral'], ['operacoes', 'Operações'], ['segregados', 'Tributos segregados'], ['conciliacao', 'Conciliação'], ['simulador', 'Simulador'], ['divergencias', 'Divergências'], ['relatorios', 'Relatórios']];
const STATUS: Record<string, [string, string]> = { nao_informado: ['Não informado', ''], informado_psp: ['Informado pelo PSP', 'at'], confirmado: ['Confirmado com evidência', 'pos'] };
const EVENTO: Record<string, string> = { pagamento: 'Pagamento', parcial: 'Parcial', estorno: 'Estorno', devolucao: 'Devolução', antecipacao: 'Antecipação' };
const PERGUNTAS = ['Quanto das vendas pode ser impactado pelo Split Payment?', 'Quanto foi efetivamente segregado?', 'Qual foi o impacto no caixa?', 'Existem operações sem confirmação?', 'Quais valores não foram conciliados?'];
const v = (n: number | null | undefined) => (n == null ? '—' : brl(n));

type SP = Record<string, string | undefined>;

export default async function Reforma({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const edita = podeEditar(u);
  const aba = ABAS.some(([k]) => k === sp.aba) ? sp.aba! : 'visao';
  const hoje = new Date().toISOString().slice(0, 10);
  const comp = /^\d{4}-\d{2}$/.test(sp.comp || '') ? sp.comp : undefined;
  const d = await dadosSplit(await getDb(), emp, hoje, comp);
  const r = d.resumo;
  const filtroComp = (
    <form className="linha" action="/fiscal/reforma" style={{ marginBottom: 12 }}>
      <input type="hidden" name="aba" value={aba} />
      <label className="linha">Competência <select name="comp" defaultValue={comp || ''}><option value="">Todas</option>{d.competencias.map((c) => <option key={c} value={c}>{c.split('-').reverse().join('/')}</option>)}</select></label>
      <button className="btn mini" type="submit">Filtrar</button>
    </form>
  );
  const tabelaOps = (lista: typeof d.ops, acoes = false) => (
    lista.length ? (
      <div className="tabela-wrap"><table>
        <thead><tr><th>Data</th><th>Documento</th><th>Evento</th><th className="num">Bruto</th><th className="num">IBS/CBS na NF</th><th className="num">IBS segregado</th><th className="num">CBS segregada</th><th className="num">Taxa</th><th className="num">Líquido</th><th>Segregação</th><th>Extrato</th>{acoes && <th />}</tr></thead>
        <tbody>{lista.map((o) => (
          <tr key={o.id}>
            <td>{dataBr(o.data)}</td>
            <td>{o.nf ? `NF ${o.nf}` : <span className="tag neg">Sem documento</span>}{o.titulo && <div className="pequeno mudo">{o.titulo} · {o.cliente}</div>}{o.idTransacao && <div className="pequeno mudo">{o.psp} · {o.idTransacao}</div>}</td>
            <td>{EVENTO[o.evento]}</td>
            <td className="num">{brl(o.valorBruto)}</td>
            <td className="num pequeno">{o.ibsDestacado == null && o.cbsDestacado == null ? '—' : `${v(o.ibsDestacado)} / ${v(o.cbsDestacado)}`}</td>
            <td className="num">{v(o.ibsSegregado)}</td>
            <td className="num">{v(o.cbsSegregado)}</td>
            <td className="num">{v(o.taxaPsp)}</td>
            <td className="num">{v(o.valorLiquido)}</td>
            <td><span className={`tag ${STATUS[o.status][1]}`}>{STATUS[o.status][0]}</span>{o.evidencia && <div className="pequeno"><a href={`/arquivos/${o.evidencia.arquivoId}`} target="_blank">Comprovante</a> · {o.evidencia.fonte}</div>}</td>
            <td>{o.extratoId ? <span className="tag pos">Conciliado</span> : <span className="pequeno mudo">—</span>}</td>
            {acoes && <td>{edita && o.status === 'informado_psp' && (
              <details className="menu-acao"><summary className="btn mini primario">Confirmar</summary>
                <form action={confirmarAcao} className="card menu-acao-caixa" style={{ width: 320, top: 34 }}>
                  <FecharMenu />
                  <input type="hidden" name="id" value={o.id} />
                  <label>Fonte da evidência</label><input name="fonte" required placeholder="Ex.: comprovante do PSP, consulta oficial" />
                  <label>Comprovante (PDF, imagem ou arquivo)</label><input type="file" name="comprovante" required />
                  <button className="btn primario" type="submit">Confirmar segregação</button>
                  <span className="pequeno mudo">Só confirme com comprovante da fonte oficial ou do participante responsável. A contabilidade passa a registrar a extinção da obrigação.</span>
                </form>
              </details>
            )}{edita && o.status === 'confirmado' && (
              <details className="menu-acao"><summary className="btn mini">Desfazer</summary>
                <form action={desfazerAcao} className="card menu-acao-caixa" style={{ width: 280, top: 34 }}>
                  <FecharMenu />
                  <input type="hidden" name="id" value={o.id} /><input name="motivo" placeholder="Motivo" required />
                  <button className="btn mini perigo" type="submit">Desfazer confirmação</button>
                </form>
              </details>
            )}</td>}
          </tr>
        ))}</tbody>
      </table></div>
    ) : <div className="vazio">Nenhuma operação. Traga os recebimentos do Contas a Receber em <Link href="/fiscal/reforma?aba=operacoes">Operações</Link>.</div>
  );

  let corpo: React.ReactNode;
  if (aba === 'visao') {
    const proj30 = d.projecao[0];
    corpo = (
      <>
        <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 16 }}>
          <div className="card kpi"><div className="rotulo">Transações analisadas</div><div className="v">{r.transacoes}</div><div className="s">bruto {brl(r.bruto)} · real</div></div>
          <div className="card kpi"><div className="rotulo">IBS segregado confirmado</div><div className="v">{brl(r.ibsConfirmado)}</div><div className="s">informado pelo PSP: {brl(r.ibsInformadoPsp)}</div></div>
          <div className="card kpi"><div className="rotulo">CBS segregada confirmada</div><div className="v">{brl(r.cbsConfirmado)}</div><div className="s">informada pelo PSP: {brl(r.cbsInformadoPsp)}</div></div>
          <div className="card kpi"><div className="rotulo">Líquido recebido</div><div className="v">{brl(r.liquido)}</div><div className="s">{r.semLiquido} sem líquido informado</div></div>
          <div className="card kpi"><div className="rotulo">Divergências</div><div className="v">{r.divergencias}</div><div className="s">{r.aguardandoConfirmacao} aguardando confirmação</div></div>
          <div className="card kpi"><div className="rotulo">Impacto no caixa · 30 dias</div><div className="v">{brl(proj30.segregacao)}</div><div className="s">estimado pelos destaques das NFs</div></div>
        </div>
        <div className="grade g2" style={{ alignItems: 'start' }}>
          <div className="card">
            <h2>Recebimentos previstos (estimativa)</h2>
            <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Títulos a receber em aberto. A segregação estimada usa o IBS/CBS destacado em cada NF; títulos sem destaque ficam à parte. Taxas do meio de pagamento não entram aqui (informe-as no simulador).</p>
            <div className="tabela-wrap"><table>
              <thead><tr><th>Horizonte</th><th className="num">Bruto previsto</th><th className="num">Segregação estimada</th><th className="num">Líquido previsto</th><th className="num">Sem destaque</th></tr></thead>
              <tbody>{d.projecao.map((p) => <tr key={p.dias}><td>{p.dias} dias · {p.titulos} título(s)</td><td className="num">{brl(p.bruto)}</td><td className="num">{brl(p.segregacao)}</td><td className="num">{brl(p.liquido)}</td><td className="num">{brl(p.semDestaque)}</td></tr>)}</tbody>
            </table></div>
          </div>
          <div className="card">
            <h2>Real × informado × estimado</h2>
            <BarrasH itens={[
              { rotulo: 'IBS + CBS confirmados (real)', valor: r.ibsConfirmado + r.cbsConfirmado, cor: '#6fc196' },
              { rotulo: 'IBS + CBS informados pelo PSP', valor: r.ibsInformadoPsp + r.cbsInformadoPsp, cor: '#5f9fdc' },
              { rotulo: 'IBS + CBS destacados nas NFs (estimado)', valor: r.ibsDestacadoEstimado + r.cbsDestacadoEstimado, cor: '#a48fd6' },
            ]} />
            <p className="pequeno mudo" style={{ marginTop: 8 }}>Destacado na NF não é segregado: só retorno do provedor ou comprovante comprova a segregação.</p>
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Pergunte à ZARO IA</h2>
          <PerguntasIa perguntas={PERGUNTAS} area="split" />
        </div>
      </>
    );
  } else if (aba === 'operacoes') {
    corpo = (
      <div className="card">
        <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div><h2>Operações</h2><p className="pequeno mudo" style={{ margin: 0 }}>Documento fiscal → cobrança → recebimento → segregação → extrato → contabilidade. Cada recebimento entra uma vez só.</p></div>
          {edita && <form action={sincronizarAcao}><button className="btn primario" type="submit">Trazer recebimentos do Contas a Receber</button></form>}
        </div>
        {d.recebimentosSemOperacao > 0 && <div className="aviso">{d.recebimentosSemOperacao} recebimento(s) ainda não trazido(s) para cá.</div>}
        {filtroComp}
        {tabelaOps(d.ops)}
      </div>
    );
  } else if (aba === 'segregados') {
    const com = d.ops.filter((o) => o.ibsSegregado != null || o.cbsSegregado != null);
    corpo = (
      <div className="card">
        <h2>Tributos segregados</h2>
        <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Só valores vindos do retorno do provedor de pagamento. “Confirmar” exige comprovante; só o confirmado entra na contabilidade (banco pelo líquido, IBS/CBS extinguindo a obrigação, taxa como despesa bancária, receita pelo total).</p>
        {filtroComp}
        {tabelaOps(com, true)}
      </div>
    );
  } else if (aba === 'conciliacao') {
    corpo = (
      <>
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Importar retorno do provedor de pagamento</h2>
          <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Enquanto não houver API oficial liberada para o contribuinte, importe o arquivo do seu banco, maquininha ou PSP (CSV). Colunas: <code>data; transacao; bruto; ibs; cbs; taxa; liquido; nf; chave; tipo</code>. Reimportar o mesmo arquivo não duplica. O arquivo original fica guardado.</p>
          {edita && (
            <form action={importarAcao} className="grade g4" style={{ alignItems: 'end' }}>
              <div><label>Provedor (PSP)</label><input name="psp" required placeholder="Ex.: Banco X, Stone, Cielo" /></div>
              <div style={{ gridColumn: 'span 2' }}><label>Arquivo de retorno (.csv)</label><input type="file" name="arquivo" accept=".csv,text/csv" required /></div>
              <div><button className="btn primario" type="submit">Importar</button></div>
            </form>
          )}
        </div>
        <div className="card">
          <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h2>Conciliação com o extrato</h2>
            {edita && <form action={conciliarAcao}><button className="btn" type="submit">Conciliar pelo valor líquido</button></form>}
          </div>
          {filtroComp}
          {tabelaOps(d.ops.filter((o) => o.valorLiquido != null))}
        </div>
      </>
    );
  } else if (aba === 'simulador') {
    const campo = (k: string, padrao: string) => sp[k] ?? padrao;
    let sim: ReturnType<typeof simularSplit> | null = null;
    let erro = '';
    if (sp.valor) {
      try {
        sim = simularSplit({
          valor: numero(sp.valor), ibsPct: sp.ibsPct ? numero(sp.ibsPct) : null, cbsPct: sp.cbsPct ? numero(sp.cbsPct) : null, taxaPct: numero(sp.taxaPct || '0'),
          parcelas: Number(sp.parcelas || 1), primeiraLiquidacao: /^\d{4}-\d{2}-\d{2}$/.test(sp.data || '') ? sp.data! : addDias(hoje, 30), antecipacaoPct: sp.antecipar === '1' ? numero(sp.antecipacaoPct || '0') : undefined,
        });
      } catch (e) { erro = (e as Error).message; }
    }
    corpo = (
      <div className="grade g2" style={{ alignItems: 'start' }}>
        <form className="card campos" action="/fiscal/reforma">
          <input type="hidden" name="aba" value="simulador" />
          <h2>Simular uma venda</h2>
          <div className="grade g2">
            <div><label>Valor da venda (R$)</label><input name="valor" inputMode="decimal" defaultValue={campo('valor', '')} required /></div>
            <div><label>Tipo de operação</label><select name="tipo" defaultValue={campo('tipo', 'servico')}><option value="servico">Prestação de serviço</option><option value="mercadoria">Venda de mercadoria/produção</option></select></div>
            <div><label>Regime</label><input value={emp.regime || '—'} readOnly /></div>
            <div><label>Forma de pagamento</label><select name="forma" defaultValue={campo('forma', 'pix')}><option value="pix">PIX</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option><option value="ted">Transferência</option></select></div>
            <div><label>IBS (%) da operação</label><input name="ibsPct" inputMode="decimal" defaultValue={campo('ibsPct', '')} placeholder="informe" /></div>
            <div><label>CBS (%) da operação</label><input name="cbsPct" inputMode="decimal" defaultValue={campo('cbsPct', '')} placeholder="informe" /></div>
            <div><label>Taxa do meio de pagamento (%)</label><input name="taxaPct" inputMode="decimal" defaultValue={campo('taxaPct', '0')} /></div>
            <div><label>Parcelas</label><input name="parcelas" type="number" min={1} max={24} defaultValue={campo('parcelas', '1')} /></div>
            <div><label>1ª liquidação</label><input name="data" type="date" defaultValue={campo('data', addDias(hoje, 30))} /></div>
            <div><label className="linha" style={{ fontWeight: 500 }}><input type="checkbox" name="antecipar" value="1" defaultChecked={sp.antecipar === '1'} /> Antecipar recebíveis</label><input name="antecipacaoPct" inputMode="decimal" defaultValue={campo('antecipacaoPct', '0')} placeholder="custo da antecipação (%)" /></div>
          </div>
          <div className="linha"><button className="btn primario" type="submit">Simular</button>
            <Link className="btn mini" href={`/fiscal/reforma?aba=simulador&valor=${encodeURIComponent(campo('valor', '1000'))}&ibsPct=0,1&cbsPct=0,9&taxaPct=${campo('taxaPct', '0')}&parcelas=${campo('parcelas', '1')}`}>Usar destaque do ano de teste 2026 (IBS 0,1% · CBS 0,9%)</Link>
          </div>
          <p className="pequeno mudo" style={{ margin: 0 }}>O ZARO não presume alíquota: informe as da operação. O regime ({emp.regime || 'não informado'}) e o tipo de operação podem mudar a tributação e a modalidade de split; confira antes de usar.</p>
        </form>
        <div className="card">
          <h2>Resultado <span className="tag ia">Simulação</span></h2>
          {erro && <div className="aviso erro">{erro}</div>}
          {sim ? (
            <>
              <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
                <thead><tr><th>Parcela</th><th>Liquidação</th><th className="num">Bruto</th><th className="num">IBS</th><th className="num">CBS</th><th className="num">Taxa</th><th className="num">Líquido</th></tr></thead>
                <tbody>{sim.parcelas.map((p) => <tr key={p.n}><td>{p.n}</td><td>{dataBr(p.data)}</td><td className="num">{brl(p.bruto)}</td><td className="num">{brl(p.ibs)}</td><td className="num">{brl(p.cbs)}</td><td className="num">{brl(p.taxa)}</td><td className="num">{brl(p.liquido)}</td></tr>)}</tbody>
                <tfoot><tr><td colSpan={2}><b>Total</b></td><td className="num"><b>{brl(sim.bruto)}</b></td><td className="num">{brl(sim.ibs)}</td><td className="num">{brl(sim.cbs)}</td><td className="num">{brl(sim.taxa)}</td><td className="num"><b>{brl(sim.liquido)}</b></td></tr></tfoot>
              </table></div>
              {sim.custoAntecipacao > 0 && <p className="pequeno">Custo da antecipação: {brl(sim.custoAntecipacao)} (já descontado do líquido).</p>}
              <div className="aviso" style={{ marginTop: 10 }}>Tributos segregados estimados: <b>{brl(sim.segregado)}</b>. Taxa do meio de pagamento é despesa bancária, não tributo. Esta simulação não comprova segregação nem recolhimento.</div>
            </>
          ) : !erro && <div className="vazio">Informe os dados e clique em Simular.</div>}
        </div>
      </div>
    );
  } else if (aba === 'divergencias') {
    const tipos = (Object.keys(DIVERGENCIAS) as Divergencia[]).filter((k) => r.porDivergencia[k]);
    const filtro = tipos.includes(sp.tipo as Divergencia) ? (sp.tipo as Divergencia) : undefined;
    const lista = d.ops.filter((o) => (filtro ? o.divergencias.includes(filtro) : o.divergencias.length));
    corpo = (
      <div className="card">
        <h2>Divergências</h2>
        <div className="linha" style={{ gap: 6, margin: '10px 0' }}>
          <Link href="/fiscal/reforma?aba=divergencias" className={`tag ${!filtro ? 'acento' : ''}`}>Todas</Link>
          {tipos.map((k) => <Link key={k} href={`/fiscal/reforma?aba=divergencias&tipo=${k}`} className={`tag ${filtro === k ? 'acento' : ''}`}>{DIVERGENCIAS[k]} · {r.porDivergencia[k]}</Link>)}
        </div>
        {lista.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Data</th><th>Documento</th><th className="num">Bruto</th><th className="num">Líquido</th><th>Divergências</th><th>Ação recomendada</th></tr></thead>
            <tbody>{lista.map((o) => (
              <tr key={o.id}><td>{dataBr(o.data)}</td><td>{o.nf ? `NF ${o.nf}` : o.idTransacao || '—'}<div className="pequeno mudo">{o.cliente}</div></td><td className="num">{brl(o.valorBruto)}</td><td className="num">{v(o.valorLiquido)}</td>
                <td className="pequeno">{o.divergencias.map((x) => <div key={x}>{DIVERGENCIAS[x]}</div>)}</td>
                <td className="pequeno">{o.divergencias.includes('sem_retorno_psp') ? 'Importar o retorno do provedor' : o.divergencias.includes('sem_documento') ? 'Localizar a NF da transação' : o.divergencias.includes('bruto_liquido') || o.divergencias.includes('tributo_divergente') ? 'Conferir com o PSP e a NF antes de confirmar' : o.divergencias.includes('sem_conciliacao') ? 'Importar o extrato e conciliar' : o.divergencias.includes('duplicidade') ? 'Verificar transação repetida' : 'Revisar'}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <div className="vazio">Sem divergências.</div>}
      </div>
    );
  } else {
    corpo = (
      <div className="grade g2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h2>Relatórios</h2>
          {filtroComp}
          <a className="btn primario" href={`/fiscal/reforma/exportar${comp ? `?comp=${comp}` : ''}`}>Baixar Excel do Split Payment</a>
          <p className="pequeno mudo" style={{ marginTop: 8 }}>Operações, segregação (real, informada e estimada separadas), divergências, projeção de 30/60/90 dias e versão das regras usadas.</p>
        </div>
        <div className="card">
          <h2>Regras usadas · {VERSAO_REGRAS}</h2>
          {REGRAS_SPLIT.map((g) => <div key={g.versao} style={{ marginTop: 10 }}><b>{g.titulo}</b> <span className="pequeno mudo">· {g.versao} · {g.vigencia}</span><div className="pequeno">{g.texto}</div><div className="pequeno mudo">Fonte: {g.fonte}</div></div>)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="cabeca central"><div><div className="sobretitulo">Fiscal e Tributário · Reforma Tributária</div><h1>Split Payment</h1><p>Separação de IBS e CBS na liquidação dos pagamentos: quanto o cliente pagou, quanto foi segregado para tributos e quanto entrou na conta.</p></div></div>
      <div className="abas"><Link href="/fiscal">Apuração</Link><Link href="/fiscal/creditos">Impostos a recuperar</Link><Link href="/fiscal/notas">NF da SEFAZ</Link><Link href="/fiscal/reforma" className="ativo">Reforma Tributária</Link></div>
      <div className="aviso" style={{ marginBottom: 12 }}><b>Ainda não está em operação para as empresas.</b> A LC 214/2025 prevê implantação gradual; desde 15/10/2026 há testes técnicos entre provedores de pagamento e a Plataforma Pública, em ambiente controlado e sem transações reais. O ZARO está preparado: acompanha recebimentos, importa retornos dos provedores e simula o impacto. Nada aqui é recolhimento presumido.</div>
      {sp.msg && <div className="aviso ok">{sp.msg}</div>}
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      <div className="abas">{ABAS.map(([k, n]) => <Link key={k} href={`/fiscal/reforma?aba=${k}`} className={aba === k ? 'ativo' : ''}>{n}</Link>)}</div>
      {corpo}
    </>
  );
}
