import Link from 'next/link';
import { getDb } from '@/db';
import { brl } from '@/domain/dinheiro';
import { dadosOrcamento } from '@/server/inteligencia';
import { BarrasH, Grafico } from '@/components/painel/Grafico';
import { EditorOrcamento } from '@/components/painel/Inteligencia';
import { COR } from '@/components/painel/cores';
import { aprovarOrcamento, novaVersao, salvarLimites, salvarOrcamento } from './acoes';
import { Card, MESES, type Props } from './comum';

const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR')}%`);

export async function Orcamento({ u, emp, hoje, sp, edita }: Props) {
  const anoAtual = Number(hoje.slice(0, 4));
  const ano = Number(sp.ano) >= 2000 && Number(sp.ano) <= 2100 ? Number(sp.ano) : anoAtual;
  const ateMes = Number(sp.ate) >= 1 && Number(sp.ate) <= 12 ? Number(sp.ate) : ano < anoAtual ? 12 : ano > anoAtual ? 1 : Number(hoje.slice(5, 7));
  const nat = sp.nat === 'receita' ? 'receita' : 'despesa';
  const d = await dadosOrcamento(await getDb(), u, emp, ano, sp.v, sp.c, ateMes, nat);
  const base = `/inteligencia?aba=orcamento&ano=${ano}${d.versao ? `&v=${d.versao.id}` : ''}`;
  const csv = `/inteligencia/exportar?ano=${ano}&ate=${ateMes}&nat=${nat}${d.versao ? `&v=${d.versao.id}` : ''}`;
  return (
    <>
      <form className="card filtros-if" action="/inteligencia">
        <input type="hidden" name="aba" value="orcamento" />
        <div><label>Ano</label><select name="ano" defaultValue={ano}>{[anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a}>{a}</option>)}</select></div>
        <div><label>Versão</label><select name="v" defaultValue={d.versao?.id}>{d.versoes.map((v) => <option key={v.id} value={v.id}>{v.nome} · {v.tipo} · {v.status}</option>)}{!d.versoes.length && <option value="">Nenhuma</option>}</select></div>
        <div><label>Comparar com</label><select name="c" defaultValue={d.comparar?.id || ''}><option value="">— só realizado —</option>{d.versoes.filter((v) => v.id !== d.versao?.id).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select></div>
        <div><label>Acumulado até</label><select name="ate" defaultValue={ateMes}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}/{ano}</option>)}</select></div>
        <div><label>Natureza</label><select name="nat" defaultValue={nat}><option value="despesa">Despesas</option><option value="receita">Receitas</option></select></div>
        <button className="btn" type="submit">Aplicar</button>
        <a className="btn mini" href={csv}>Exportar CSV</a>
      </form>

      {!d.versao ? (
        <div className="card">
          <h2>Orçamento {ano}</h2>
          <p className="mudo">Nenhum orçamento cadastrado para {ano}. Crie a versão original; depois preencha por área (centro de custo ou categoria já usados nos títulos) e mês.</p>
        </div>
      ) : (
        <>
          <div className="indicadores quatro">
            <Card rotulo={`Orçamento · jan a ${MESES[ateMes - 1]}`} cor="lavanda" valor={brl(d.total.orcado)} fonte={`versão "${d.versao.nome}" (${d.versao.status})`}><span>Ano inteiro: {brl(d.total.anual)}</span></Card>
            <Card rotulo="Realizado" cor="ceu" valor={brl(d.total.realizado)} fonte="títulos por competência (sem cancelados)"><span>No ritmo atual, o ano fecha em {d.total.ritmo != null ? brl(d.total.ritmo) : '—'}</span></Card>
            <Card rotulo="Desvio" cor={(nat === 'despesa' ? d.total.desvio > 0 : d.total.desvio < 0) ? 'rosa' : 'menta'} valor={<span className={(nat === 'despesa' ? d.total.desvio > 0 : d.total.desvio < 0) ? 'neg' : 'pos'}>{brl(d.total.desvio)}</span>} fonte="realizado − orçado"><span>{pct(d.total.desvioPct)} · {nat === 'despesa' ? `ainda disponível no ano: ${brl(d.total.saldoDisponivel)}` : `falta realizar no ano: ${brl(d.total.saldoDisponivel)}`}</span></Card>
            <Card rotulo="Áreas acima do limite" cor="pessego" valor={d.acimaDoLimite} fonte={`semáforo: verde até ${d.limites.verde}%, amarelo até ${d.limites.amarelo}%`}><span>de {d.tabela.length} área(s)</span></Card>
          </div>
          <div className="painel-grade" style={{ marginTop: 16 }}>
            <div className="card largo">
              <h2>Orçado x realizado</h2>
              <p className="pequeno mudo">Por mês, {nat === 'despesa' ? 'despesas' : 'receitas'}. {d.comparar ? `Linha tracejada: "${d.comparar.nome}". ` : ''}Barras claras: mesmo mês do ano anterior (realizado).</p>
              <Grafico titulo="Orçado e realizado por mês" categorias={MESES} rotulos={MESES.map((m) => `${m}/${ano}`)}
                series={[
                  { nome: 'Orçado', cor: COR.saldo, tipo: 'barra', valores: d.mensal.map((m) => m.orcado) },
                  { nome: 'Realizado', cor: COR.entrada, tipo: 'barra', valores: d.mensal.map((m) => m.realizado) },
                  { nome: `Realizado ${ano - 1}`, cor: '#d7b46f', tipo: 'linha', valores: d.mensal.map((m) => m.anoAnterior || null) },
                  ...(d.comparar ? [{ nome: d.comparar.nome, cor: COR.saida, tipo: 'linha' as const, valores: d.mensal.map((m) => m.revisado), projetadoDesde: 0 }] : []),
                ]} />
            </div>
            <div className="card">
              <h2>Desvio por área</h2>
              <p className="pequeno mudo">Realizado − orçado até {MESES[ateMes - 1]}. {nat === 'despesa' ? 'Positivo = gastou mais.' : 'Negativo = faturou menos.'}</p>
              <BarrasH itens={d.tabela.filter((t) => t.desvio).slice(0, 10).map((t) => ({ rotulo: t.area, valor: t.desvio, cor: t.status === 'coral' ? '#ea9585' : t.status === 'amarelo' ? '#d7b46f' : '#6fc196', extra: pct(t.desvioPct) }))} />
            </div>
            <div className="card">
              <h2>Desvios explicados</h2>
              <p className="pequeno mudo">Só aparece quando os títulos lançados mostram de onde veio o excesso.</p>
              {d.tabela.filter((t) => t.status === 'coral' && t.causas.length).length ? (
                <ul className="insights">{d.tabela.filter((t) => t.status === 'coral' && t.causas.length).map((t) => (
                  <li key={t.area} data-tom="risco"><b>{t.area}: {brl(t.desvio)} acima do orçado</b><p className="pequeno">Maiores lançamentos na área: {t.causas.map(([n, v]) => `${n} (${brl(v)})`).join(', ')}.</p></li>
                ))}</ul>
              ) : <div className="vazio">Nenhuma área acima do limite com causa identificada.</div>}
            </div>
            <div className="card largo">
              <h2>Por centro de custo</h2>
              <div className="tabela-wrap"><table className="compacta">
                <thead><tr><th>Centro de custo</th><th className="num">Orçado</th><th className="num">Realizado</th><th className="num">Desvio R$</th><th className="num">Desvio %</th><th className="num">Consumo</th><th>Status</th>{d.comparar && <th className="num">{d.comparar.nome}</th>}<th className="num">{ano - 1}</th></tr></thead>
                <tbody>{d.tabela.map((t) => (
                  <tr key={t.area}><td>{t.area}</td><td className="num">{brl(t.orcado)}</td><td className="num">{brl(t.realizado)}</td><td className={`num ${t.status === 'coral' ? 'neg' : ''}`}>{brl(t.desvio)}</td><td className="num">{pct(t.desvioPct)}</td><td className="num">{pct(t.consumo)}</td>
                    <td><span className={`semaforo ${t.status}`} />{t.status === 'verde' ? 'Dentro' : t.status === 'amarelo' ? 'Perto do limite' : 'Acima do limite'}</td>
                    {d.comparar && <td className="num">{brl(t.revisado)}</td>}<td className="num">{brl(t.anoAnterior)}</td></tr>
                ))}</tbody>
              </table></div>
              <p className="pequeno mudo">{nat === 'despesa' ? 'Despesa: consumo = realizado ÷ orçado.' : 'Receita: atingimento = realizado ÷ orçado; verde a partir de 100%.'} Ordenado pela maior diferença.</p>
            </div>
          </div>
        </>
      )}

      <div className="painel-grade" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Versões</h2>
          {d.versoes.length ? (
            <ul className="alertas">{d.versoes.map((v) => (
              <li key={v.id}><span><Link href={`/inteligencia?aba=orcamento&ano=${ano}&v=${v.id}`}><b>{v.nome}</b></Link> · {v.tipo}<span className="pequeno mudo"> · {v.status === 'Aprovado' ? `aprovado por ${v.aprovadoPor} em ${new Date(v.aprovadoEm!).toLocaleDateString('pt-BR')}` : 'rascunho'}</span></span>
                <span className="linha">
                  <Link className="btn mini" href={`/inteligencia?aba=orcamento&ano=${ano}&v=${v.id}&editar=1`}>{v.status === 'Aprovado' ? 'Ver valores' : 'Editar'}</Link>
                  {edita && v.status !== 'Aprovado' && <form action={aprovarOrcamento}><input type="hidden" name="versao" value={v.id} /><input type="hidden" name="volta" value={`/inteligencia?aba=orcamento&ano=${ano}&v=${v.id}`} /><button className="btn mini primario" type="submit">Aprovar</button></form>}
                </span>
              </li>
            ))}</ul>
          ) : <p className="mudo">Nenhuma versão.</p>}
          {edita && (
            <form action={novaVersao} style={{ marginTop: 12 }}>
              <input type="hidden" name="ano" value={ano} /><input type="hidden" name="volta" value={base} />
              <div className="linha">
                <div><label>Tipo</label><select name="tipo"><option>Original</option>{d.versoes.length > 0 && <><option>Revisão</option><option>Forecast</option></>}</select></div>
                {d.versoes.length > 0 && <div><label>A partir de</label><select name="base" defaultValue={d.versao?.id}>{d.versoes.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select></div>}
                <div><label>Nome</label><input name="nome" placeholder={`Orçamento ${ano}`} /></div>
              </div>
              <button className="btn mini" type="submit" style={{ marginTop: 8 }}>Criar versão</button>
              <p className="pequeno mudo">Revisão copia a base. Forecast copia a base e troca os meses já fechados pelo realizado.</p>
            </form>
          )}
        </div>
        <div className="card">
          <h2>Limites do semáforo</h2>
          <p className="pequeno mudo">Para esta empresa. Despesa: verde até o primeiro limite de consumo, amarelo até o segundo, coral acima. Receita: verde ao atingir 100%, amarelo dentro da mesma folga.</p>
          <form action={salvarLimites} className="linha">
            <input type="hidden" name="volta" value={base} />
            <div><label>Verde até (%)</label><input name="verde" defaultValue={d.limites.verde} disabled={!edita} /></div>
            <div><label>Amarelo até (%)</label><input name="amarelo" defaultValue={d.limites.amarelo} disabled={!edita} /></div>
            {edita && <button className="btn mini" type="submit">Gravar</button>}
          </form>
        </div>
      </div>

      {d.versao && sp.editar === '1' && (
        <div style={{ marginTop: 16 }} id="editar">
          <EditorOrcamento versao={d.versao.id} linhas={d.linhasEdicao} areas={d.areasCadastradas} acao={salvarOrcamento} volta={`${base}&editar=1`} bloqueado={d.versao.status === 'Aprovado' || !edita} />
        </div>
      )}
    </>
  );
}
