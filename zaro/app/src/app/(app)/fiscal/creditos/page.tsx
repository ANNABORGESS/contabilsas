// Fiscal e Tributário → Impostos a recuperar: crédito de ICMS/IPI das NF de compra, item a item, e a
// apuração mensal do ICMS (débito das vendas × crédito das compras).
import Link from 'next/link';
import { getDb } from '@/db';
import { NOME_CLASSE } from '@/domain/creditos';
import { brl, dataBr } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { creditosDaEmpresa } from '@/server/creditos';
import { decidirAcao, ipiAcao } from './acoes';

const FILTROS: [string, string][] = [['confirmar', 'A confirmar'], ['credita', 'Com crédito'], ['nao', 'Sem crédito'], ['todos', 'Todos']];
const mes = (c: string) => c.split('-').reverse().join('/');

export default async function Creditos({ searchParams }: { searchParams: Promise<{ f?: string; msg?: string; erro?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const edita = podeEditar(u);
  const f = FILTROS.some(([k]) => k === sp.f) ? sp.f! : 'confirmar';
  const volta = `/fiscal/creditos?f=${f}`;
  const d = await creditosDaEmpresa(await getDb(), emp);

  const itens = d.notas.flatMap((n) => n.itens.map((i) => ({ ...i, nota: n })));
  const relevantes = itens.filter((i) => i.classe !== 'sem_destaque' && i.classe !== 'simples');
  const lista = (f === 'confirmar' ? relevantes.filter((i) => i.credita === null) : f === 'credita' ? relevantes.filter((i) => i.credita) : f === 'nao' ? relevantes.filter((i) => i.credita === false) : itens)
    .sort((a, b) => b.nota.data.localeCompare(a.nota.data) || a.n - b.n);
  const mostrar = lista.slice(0, 400);
  const totIcms = d.notas.reduce((a, n) => a + n.icms, 0);
  const totIpi = d.notas.reduce((a, n) => a + n.ipi, 0);
  const pendentes = relevantes.filter((i) => i.credita === null);
  const ultimo = d.apuracao[d.apuracao.length - 1];
  const porClasse = Object.entries(relevantes.reduce<Record<string, { n: number; icms: number }>>((a, i) => {
    const k = i.credita === null ? 'a_confirmar' : i.classe;
    a[k] = { n: (a[k]?.n || 0) + 1, icms: (a[k]?.icms || 0) + i.icms };
    return a;
  }, {})).sort((a, b) => b[1].icms - a[1].icms);

  return (
    <>
      <div className="cabeca"><div><h1>Fiscal e Tributário</h1><p>Impostos a recuperar: o ZARO lê cada item das NF de compra, separa o que gera crédito (insumo, matéria-prima, embalagem) do que é custo (uso e consumo, ST, imobilizado) e abate o crédito do ICMS das vendas mês a mês.</p></div></div>
      <div className="abas"><Link href="/fiscal">Apuração</Link><Link href="/fiscal/creditos" className="ativo">Impostos a recuperar</Link><Link href="/fiscal/notas">NF da SEFAZ</Link><Link href="/fiscal/reforma">Reforma Tributária</Link></div>
      {sp.msg && <div className="aviso ok">{sp.msg}</div>}
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}

      <div className="card faixa" style={{ marginTop: 0, marginBottom: 16 }}>
        <div className="kpi"><div className="rotulo">Crédito de ICMS</div><div className="v pos">{brl(totIcms)}</div><div className="s">{d.notas.filter((n) => n.icms > 0).length} NF de compra com crédito</div></div>
        <div className="kpi"><div className="rotulo">Crédito de IPI</div><div className="v">{brl(totIpi)}</div><div className="s">{d.config.contribuinteIpi ? 'contribuinte do IPI' : 'IPI fica no custo'}</div></div>
        <Link href="/fiscal/creditos?f=confirmar" className="kpi"><div className="rotulo">A confirmar</div><div className="v at">{pendentes.length}</div><div className="s">itens · ICMS {brl(pendentes.reduce((a, i) => a + i.icms, 0))}</div></Link>
        <div className="kpi"><div className="rotulo">Saldo credor de ICMS</div><div className="v">{brl(ultimo?.saldoCredor || 0)}</div><div className="s">{ultimo ? `após ${mes(ultimo.comp)}` : 'sem apuração'}</div></div>
      </div>

      {emp.uf === 'AM' && (
        <div className="aviso" style={{ marginBottom: 16 }}>
          Empresa no Amazonas: confira se há incentivo da Zona Franca de Manaus (Lei estadual 2.826/2003). Com crédito estímulo, o crédito das compras pode ter regra própria, e entradas de outros estados com isenção (Convênio 65/88) trazem crédito presumido que não aparece destacado na NF. O ZARO usa o ICMS destacado no XML.
        </div>
      )}

      <div className="grade g2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Como o crédito entra</h2>
          <p className="pequeno">Na compra: <b>D 1.1.4.01 Tributos a recuperar</b> / C conta de custo da compra (o imposto recuperável não é custo). No fim do mês: <b>D 2.1.4.01 ICMS a recolher</b> / C 1.1.4.01 até o valor do ICMS das vendas; o que sobra fica como saldo credor para o mês seguinte.</p>
          <p className="pequeno mudo">Compras da época do Simples Nacional não geram crédito. Itens “a confirmar” só creditam depois da sua decisão. Imobilizado credita 1/48 por mês no CIAP, que é controlado à parte.</p>
          {edita && (
            <form action={ipiAcao} className="linha" style={{ marginTop: 8 }}>
              <input type="hidden" name="volta" value={volta} />
              <div><label>A empresa é contribuinte do IPI (indústria ou equiparada)?</label>
                <select name="ipi" defaultValue={d.config.contribuinteIpi ? 'sim' : 'nao'}><option value="sim">Sim: o IPI das compras de insumo é crédito</option><option value="nao">Não: o IPI das compras é custo</option></select>
              </div>
              <button className="btn" style={{ alignSelf: 'flex-end' }}>Salvar</button>
            </form>
          )}
        </div>
        <div className="card">
          <h2>Itens por classificação</h2>
          <div className="tabela-wrap"><table>
            <thead><tr><th>Classe</th><th className="num">Itens</th><th className="num">ICMS destacado</th></tr></thead>
            <tbody>{porClasse.map(([k, v]) => <tr key={k}><td>{NOME_CLASSE[k as keyof typeof NOME_CLASSE]}</td><td className="num">{v.n}</td><td className="num">{brl(v.icms)}</td></tr>)}</tbody>
          </table></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Apuração mensal do ICMS</h2>
        <p className="pequeno mudo">Débito: ICMS destacado nas NF de saída lançadas (fora do Simples). Crédito: ICMS das compras que creditam. Confira com a apuração da SEFAZ-AM antes de gerar o DAR.</p>
        <div className="tabela-wrap"><table>
          <thead><tr><th>Mês</th><th className="num">Débito (vendas)</th><th className="num">Crédito (compras)</th><th className="num">Saldo anterior</th><th className="num">Compensado</th><th className="num">ICMS a recolher</th><th className="num">Saldo credor</th></tr></thead>
          <tbody>{d.apuracao.map((m) => (
            <tr key={m.comp}><td>{mes(m.comp)}</td><td className="num">{brl(m.debito)}</td><td className="num">{brl(m.credito)}</td><td className="num">{brl(m.saldoAnterior)}</td><td className="num">{brl(m.compensado)}</td><td className="num"><b>{brl(m.aRecolher)}</b></td><td className="num">{brl(m.saldoCredor)}</td></tr>
          ))}{!d.apuracao.length && <tr><td colSpan={7} className="vazio">Sem NF com ICMS no período fora do Simples.</td></tr>}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h2>Itens das NF de compra</h2>
        <div className="abas" style={{ marginBottom: 8 }}>{FILTROS.map(([k, n]) => <Link key={k} href={`/fiscal/creditos?f=${k}`} className={k === f ? 'ativo' : ''}>{n}</Link>)}</div>
        <div className="tabela-wrap"><table>
          <thead><tr><th>NF / data</th><th>Item</th><th>NCM · CFOP · CST</th><th className="num">Valor</th><th className="num">ICMS</th><th className="num">IPI</th><th>Classificação</th><th className="num">Crédito</th>{edita && <th>Decisão</th>}</tr></thead>
          <tbody>{mostrar.map((i) => (
            <tr key={i.chave}>
              <td>NF {i.nota.nf}<div className="pequeno mudo">{dataBr(i.nota.data)} · {i.nota.fornecedor}</div></td>
              <td>{i.desc}</td>
              <td className="pequeno">{i.ncm || '—'} · {i.cfop || '—'} · {i.cst || '—'}</td>
              <td className="num">{brl(i.total)}</td><td className="num">{brl(i.icms)}</td><td className="num">{brl(i.ipi)}</td>
              <td><span className={`tag ${i.credita ? 'pos' : i.credita === null ? 'at' : ''}`}>{i.credita === null ? 'A confirmar' : NOME_CLASSE[i.classe]}</span>
                <div className="pequeno mudo">{i.decididoPor ? `Decisão do contador${i.decididoPor === 'ncm' ? ' (pelo NCM)' : ''} · ` : ''}{i.motivo}</div></td>
              <td className="num">{i.credIcms + i.credIpi > 0 ? brl(i.credIcms + i.credIpi) : '—'}</td>
              {edita && (
                <td>{i.classe !== 'simples' && i.classe !== 'sem_destaque' && (
                  <form action={decidirAcao} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    <input type="hidden" name="volta" value={volta} /><input type="hidden" name="item" value={i.chave} /><input type="hidden" name="ncm" value={i.ncm} />
                    <button className="btn" name="decisao" value="credita">Credita</button>
                    <button className="btn" name="decisao" value="nao">Não credita</button>
                    {i.decididoPor && <button className="btn" name="decisao" value="auto">Automático</button>}
                    {i.ncm && <label className="pequeno"><input type="checkbox" name="todosNcm" /> todo o NCM {i.ncm}</label>}
                  </form>
                )}</td>
              )}
            </tr>
          ))}{!mostrar.length && <tr><td colSpan={edita ? 9 : 8} className="vazio">Nenhum item nesta lista.</td></tr>}</tbody>
        </table></div>
        {lista.length > mostrar.length && <p className="pequeno mudo">Mostrando {mostrar.length} de {lista.length} itens.</p>}
      </div>
    </>
  );
}
