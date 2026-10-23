import Link from 'next/link';
import { getDb } from '@/db';
import { brl } from '@/domain/dinheiro';
import { mesesAte } from '@/domain/painel';
import { rotuloConta } from '@/domain/plano-contas';
import { dadosExecutivo } from '@/server/inteligencia';
import { BarrasH, Grafico } from '@/components/painel/Grafico';
import { COR } from '@/components/painel/cores';
import { Card, compBr, mesCurto, Var, type Props } from './comum';

const PASTEL = ['#e8956a', '#a48fd6', '#5f9fdc', '#d7b46f', '#e992ab', '#6fc196'];

export async function Executivo({ emp, sp, hoje }: Props) {
  const opcoes = mesesAte(hoje.slice(0, 7), 24).reverse();
  const ref = sp.ref && opcoes.includes(sp.ref) ? sp.ref : opcoes[1];
  const periodo = sp.per === 'mes' ? 'mes' : 'ano';
  const detalhe = sp.det === 'categoria' ? 'categoria' : 'centro';
  const previa = sp.previa !== '0';
  const d = await dadosExecutivo(await getDb(), emp, ref, periodo, detalhe, previa);
  const a = d.atual, b = d.antes;
  const rotAnt = periodo === 'mes' ? 'vs. mês anterior' : 'vs. mesmo período do ano anterior';
  return (
    <>
      <form className="card filtros-if" action="/inteligencia">
        <input type="hidden" name="aba" value="executivo" />
        <div><label>Período</label><select name="per" defaultValue={periodo}><option value="ano">Acumulado do ano</option><option value="mes">Mês</option></select></div>
        <div><label>Até a competência</label><select name="ref" defaultValue={ref}>{opcoes.map((c) => <option key={c} value={c}>{compBr(c)}</option>)}</select></div>
        <div><label>Unidade por</label><select name="det" defaultValue={detalhe}><option value="centro">Centro de custo</option><option value="categoria">Categoria</option></select></div>
        <div><label>Lançamentos</label><select name="previa" defaultValue={previa ? '1' : '0'}><option value="1">Todos (prévia)</option><option value="0">Só aprovados</option></select></div>
        <button className="btn" type="submit">Aplicar</button>
      </form>
      {d.vazio ? <div className="card vazio">Sem lançamentos contábeis nesta empresa. Os indicadores aparecem quando houver títulos, NF ou extrato contabilizados.</div> : (
        <>
          {previa && d.pendentes > 0 && <div className="aviso">Prévia: {d.pendentes} lançamento(s) do período ainda sem aprovação estão incluídos. <Link href={`/contabilidade?per=mes&ref=${ref}`}>Aprovar na Contabilidade</Link></div>}
          <div className="indicadores quatro">
            <Card rotulo={`Faturamento · ${d.tituloPeriodo}`} cor="ceu" valor={brl(a.faturamento)} fonte="DRE por competência (conta 3.1)"><Var atual={a.faturamento} antes={b?.faturamento} rotulo={rotAnt} /></Card>
            <Card rotulo="Lucro líquido" cor="menta" valor={<span className={a.lucro < 0 ? 'neg' : ''}>{brl(a.lucro)}</span>} fonte="DRE: receitas − custos − despesas"><Var atual={a.lucro} antes={b?.lucro} rotulo={rotAnt} /></Card>
            <Card rotulo="Margem líquida" cor="lavanda" valor={a.margem == null ? '—' : `${a.margem.toLocaleString('pt-BR')}%`} fonte="lucro ÷ receita líquida"><span>{b?.margem != null ? `antes: ${b.margem.toLocaleString('pt-BR')}%` : 'sem base de comparação'}</span></Card>
            <Card rotulo="EBITDA" cor="pessego" valor={brl(a.ebitda)} fonte="lucro + juros + IRPJ/CSLL + depreciação">
              <Var atual={a.ebitda} antes={b?.ebitda} rotulo={rotAnt} />
              {!d.ebitdaConfiavel && <span className="at">Incompleto: {d.faltas.join('; ')}.</span>}
            </Card>
          </div>
          <div className="painel-grade" style={{ marginTop: 16 }}>
            <div className="card largo">
              <h2>Faturamento x lucro líquido</h2>
              <p className="pequeno mudo">Últimos 12 meses até {compBr(ref)}, por competência. Passe o cursor para ver os valores; use "Tabela" para a composição de cada mês.</p>
              <Grafico titulo="Faturamento e lucro por mês" categorias={d.mensal.map((m) => mesCurto(m.mes))} rotulos={d.mensal.map((m) => compBr(m.mes))} janelas={[6, 12]} janelaInicial={12}
                series={[
                  { nome: 'Faturamento', cor: COR.entrada, tipo: 'barra', valores: d.mensal.map((m) => m.faturamento) },
                  { nome: 'Lucro líquido', cor: COR.saldo, tipo: 'linha', valores: d.mensal.map((m) => m.lucro) },
                ]} />
              <details style={{ marginTop: 8 }}><summary className="pequeno">Composição mês a mês</summary>
                <div className="tabela-wrap"><table className="compacta">
                  <thead><tr><th>Mês</th><th className="num">Faturamento</th><th className="num">Deduções</th><th className="num">Custo</th><th className="num">Pessoal</th><th className="num">Operacionais</th><th className="num">IRPJ/CSLL</th><th className="num">Depreciação</th><th className="num">Financeiras</th><th className="num">Lucro</th><th className="num">EBITDA</th></tr></thead>
                  <tbody>{d.mensal.map((m) => <tr key={m.mes}><td>{compBr(m.mes)}</td>{[m.faturamento, m.deducoes, m.custo, m.pessoal, m.operacionais, m.tributosLucro, m.depreciacao, m.financeiras, m.lucro, m.ebitda].map((v, i) => <td key={i} className={`num ${v < 0 ? 'neg' : ''}`}>{brl(v)}</td>)}</tr>)}</tbody>
                </table></div>
              </details>
            </div>
            <div className="card">
              <h2>Composição de cada R$ 100 faturados</h2>
              <p className="pequeno mudo">{d.tituloPeriodo}. Cada conta entra numa só linha (sem dupla contagem).</p>
              {d.composicao ? (
                <>
                  <BarrasH formato="pct" itens={d.composicao.map((c, i) => ({ rotulo: c.rotulo, valor: c.valor, cor: c.chave === 'lucro' ? (c.valor < 0 ? '#ea9585' : '#6fc196') : PASTEL[i] }))} />
                  {d.composicao.at(-1)!.valor < 0 && <p className="aviso erro" style={{ marginTop: 10 }}>Os custos e despesas superaram a receita: para cada R$ 100 faturados houve perda de R$ {Math.abs(d.composicao.at(-1)!.valor).toLocaleString('pt-BR')}.</p>}
                </>
              ) : <div className="vazio">Sem faturamento no período.</div>}
            </div>
            <div className="card">
              <h2>Margem líquida mensal</h2>
              <p className="pequeno mudo">Meses com margem negativa aparecem com ponto coral.</p>
              <Grafico titulo="Margem líquida por mês" formato="pct" categorias={d.mensal.map((m) => mesCurto(m.mes))} rotulos={d.mensal.map((m) => compBr(m.mes))}
                series={[{ nome: 'Margem líquida', cor: COR.saldo, tipo: 'linha', valores: d.mensal.map((m) => m.margem) }]} />
            </div>
            <div className="card">
              <h2>Resultado por {detalhe === 'centro' ? 'centro de custo' : 'categoria'}</h2>
              <p className="pequeno mudo">Vem do centro de custo (ou categoria) do título que originou o lançamento. Lançamentos sem título (extrato, imobilizado) ficam em "Sem classificação".</p>
              {d.porUnidade.length ? (
                <div className="tabela-wrap"><table className="compacta">
                  <thead><tr><th>Unidade</th><th className="num">Faturamento</th><th className="num">Custos</th><th className="num">Despesas</th><th className="num">Lucro</th><th className="num">Margem</th></tr></thead>
                  <tbody>{d.porUnidade.map((x) => <tr key={x.nome}><td>{x.nome}</td><td className="num">{brl(x.faturamento)}</td><td className="num">{brl(x.custos)}</td><td className="num">{brl(x.despesas)}</td><td className={`num ${x.lucro < 0 ? 'neg' : ''}`}>{brl(x.lucro)}</td><td className="num">{x.margem == null ? '—' : `${x.margem.toLocaleString('pt-BR')}%`}</td></tr>)}</tbody>
                </table></div>
              ) : <div className="vazio">Sem lançamentos no período.</div>}
            </div>
            <div className="card">
              <h2>Despesas que mais pesaram</h2>
              <BarrasH itens={d.maioresDespesas.map((x, i) => ({ rotulo: rotuloConta(x.conta), valor: x.valor, cor: PASTEL[i % PASTEL.length], href: `/contabilidade?aba=balancete&per=${periodo === 'mes' ? 'mes' : 'ano'}&ref=${ref}` }))} total={a.faturamento || undefined} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
