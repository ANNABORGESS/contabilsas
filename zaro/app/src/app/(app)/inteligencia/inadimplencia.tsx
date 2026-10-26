import Link from 'next/link';
import { getDb } from '@/db';
import { brl, dataBr, formatarCnpj, soDigitos } from '@/domain/dinheiro';
import { STATUS_COBRANCA } from '@/domain/inteligencia';
import { dadosInadimplencia } from '@/server/inteligencia';
import { BarrasH, Grafico } from '@/components/painel/Grafico';
import { COR } from '@/components/painel/cores';
import { novaCobranca } from './acoes';
import { FecharMenu } from '@/components/FecharMenu';
import { Card, compBr, mesCurto, type Props } from './comum';

const FAIXA_COR = ['#c5d3e0', '#a48fd6', '#e8956a', '#e992ab', '#ea9585'];

export async function Inadimplencia({ u, emp, hoje, edita, sp }: Props) {
  const d = await dadosInadimplencia(await getDb(), u, emp, hoje);
  const ponderado = sp.pond === '1';
  const volta = '/inteligencia?aba=inadimplencia';
  return (
    <>
      <div className="indicadores quatro">
        <Card rotulo="Total vencido em aberto" cor="rosa" valor={<span className={d.totalVencido ? 'neg' : ''}>{brl(d.totalVencido)}</span>} fonte="títulos a receber vencidos, saldo após baixas" />
        <Card rotulo="Taxa de inadimplência" cor="pessego" valor={d.taxa == null ? '—' : `${d.taxa.toLocaleString('pt-BR')}%`} fonte="vencido em aberto ÷ total em aberto a receber">
          <span>{brl(d.totalVencido)} ÷ {brl(d.totalAberto)}</span>
        </Card>
        <Card rotulo="Clientes em atraso" cor="lavanda" valor={d.clientes} fonte="clientes com ao menos 1 título vencido" />
        <Card rotulo={`Atraso médio${ponderado ? ' (ponderado por valor)' : ''}`} cor="ceu" valor={(ponderado ? d.atrasoMedioPonderado : d.atrasoMedio) == null ? '—' : `${ponderado ? d.atrasoMedioPonderado : d.atrasoMedio} dias`} fonte="só títulos vencidos e em aberto">
          <Link href={`${volta}${ponderado ? '' : '&pond=1'}`}>{ponderado ? 'Ver média simples' : 'Ponderar por valor'}</Link>
        </Card>
      </div>
      <div className="painel-grade" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Vencido por faixa de atraso</h2>
          <BarrasH itens={d.faixas.map((f, i) => ({ rotulo: f.rotulo, valor: f.valor, cor: FAIXA_COR[i], extra: `${f.n} título(s) · ${f.pct.toLocaleString('pt-BR')}%` }))} />
        </div>
        <div className="card">
          <h2>Evolução da inadimplência</h2>
          <p className="pequeno mudo">Foto da carteira guardada a cada mês em que a aba é aberta. Meses sem foto ficam em branco: o passado não é refeito com a carteira de hoje.</p>
          <Grafico titulo="Valor vencido por mês" categorias={d.historico.map((h) => mesCurto(h.mes))} rotulos={d.historico.map((h) => compBr(h.mes) + (h.em ? ` (foto de ${dataBr(h.em)})` : ' (sem foto)'))}
            series={[{ nome: 'Valor vencido', cor: COR.saida, tipo: 'barra', valores: d.historico.map((h) => h.vencido) }]} />
          <div className="tabela-wrap"><table className="compacta">
            <thead><tr><th>Mês</th><th className="num">Vencido</th><th className="num">Taxa</th><th className="num">Variação</th></tr></thead>
            <tbody>{d.historico.filter((h) => h.em).map((h, i, arr) => { const ant = arr[i - 1]; return <tr key={h.mes}><td>{compBr(h.mes)}</td><td className="num">{brl(h.vencido)}</td><td className="num">{h.taxa == null ? '—' : `${h.taxa}%`}</td><td className="num">{ant?.vencido ? `${Math.round(((h.vencido! - ant.vencido) / ant.vencido) * 100)}%` : '—'}</td></tr>; })}</tbody>
          </table></div>
        </div>
        <div className="card largo">
          <h2>Maiores devedores</h2>
          <p className="pequeno mudo">Só saldos em aberto (títulos liquidados não entram). E-mail e WhatsApp abrem no seu aplicativo para você enviar: a ZARO não envia mensagem sozinha. Respeite a política de cobrança e a preferência de contato do cliente.</p>
          {d.ranking.length ? (
            <div className="tabela-wrap"><table className="compacta">
              <thead><tr><th>Cliente</th><th>CNPJ/CPF</th><th className="num">Em atraso</th><th className="num">Dias</th><th className="num">Títulos</th><th>Status</th><th>Próxima ação</th><th></th></tr></thead>
              <tbody>{d.ranking.map((c) => (
                <tr key={c.chave}>
                  <td><Link href={`/financeiro?tipo=receber&f=vencidos&q=${encodeURIComponent(c.cliente)}`}>{c.cliente}</Link>{c.recorrente > 1 && <div className="pequeno at">{c.recorrente} pagamentos anteriores com atraso</div>}</td>
                  <td className="pequeno">{c.doc ? formatarCnpj(c.doc) : '—'}</td>
                  <td className="num neg">{brl(c.valor)}</td><td className="num">{c.maiorAtraso}</td><td className="num">{c.titulos}</td>
                  <td><span className={`tag ${c.status === 'Revisão necessária' ? 'neg' : c.status === 'Ainda não contatado' ? 'at' : 'acento'}`}>{c.status}</span>{c.ultimoContato && <div className="pequeno mudo">último: {new Date(c.ultimoContato).toLocaleDateString('pt-BR')}</div>}</td>
                  <td className="pequeno">{c.proxima}</td>
                  <td>
                    <details className="cobrar">
                      <summary className="btn mini">Cobrança</summary>
                      <div className="card cobrar-caixa">
                        <FecharMenu />
                        <div className="linha pequeno">
                          {c.email && <a className="btn mini" href={`mailto:${c.email}?subject=${encodeURIComponent(`Títulos em aberto · ${emp.fantasia || emp.razao}`)}`}>E-mail</a>}
                          {c.telefone && <a className="btn mini" target="_blank" rel="noreferrer" href={`https://wa.me/55${soDigitos(c.telefone).replace(/^55/, '')}`}>WhatsApp</a>}
                          {!c.email && !c.telefone && <span className="mudo">Sem e-mail ou telefone no cadastro do cliente.</span>}
                        </div>
                        {edita ? (
                          <form action={novaCobranca}>
                            <input type="hidden" name="volta" value={volta} /><input type="hidden" name="cliente" value={c.chave} /><input type="hidden" name="nomeCliente" value={c.cliente} />
                            <div className="linha">
                              <div><label>Status</label><select name="status" defaultValue={c.status === 'Ainda não contatado' ? 'Em cobrança' : c.status}>{STATUS_COBRANCA.map((s) => <option key={s}>{s}</option>)}</select></div>
                              <div><label>Registro</label><select name="tipo"><option>Contato</option><option>Acordo</option><option>Promessa</option><option>Observação</option></select></div>
                              <div><label>Canal</label><select name="canal"><option>Telefone</option><option>E-mail</option><option>WhatsApp</option><option>Presencial</option></select></div>
                            </div>
                            <div className="linha">
                              <div><label>Valor acordado/prometido</label><input name="valor" inputMode="decimal" /></div>
                              <div><label>Data prometida</label><input type="date" name="dataPrometida" min={hoje} /></div>
                            </div>
                            <label>Observação</label><textarea name="obs" rows={2} />
                            <button className="btn primario mini" type="submit" style={{ marginTop: 8 }}>Registrar</button>
                          </form>
                        ) : <p className="pequeno mudo">Perfil de consulta: sem permissão para registrar cobrança.</p>}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhum cliente em atraso.</div>}
        </div>
        <div className="card">
          <h2>Impacto no caixa</h2>
          <p>Dos <b>{brl(d.impacto.previsto90)}</b> previstos para os próximos 90 dias, <b className={d.impacto.deAtrasados ? 'at' : ''}>{brl(d.impacto.deAtrasados)}</b> são de clientes que já estão em atraso ({d.impacto.previsto90 ? Math.round((d.impacto.deAtrasados / d.impacto.previsto90) * 100) : 0}%).</p>
          <h3>Cenários de recuperação do vencido</h3>
          <BarrasH itens={d.impacto.cenarios.map((c) => ({ rotulo: `Recuperar ${c.pct}%`, valor: c.valor, cor: '#6fc196' }))} />
          <p className="pequeno mudo">Nenhum cenário é usado como garantido na aba Caixa: lá o vencido só entra se você simular a recuperação.</p>
        </div>
        <div className="card">
          <h2>Histórico de cobrança</h2>
          {d.cobrancas.length ? (
            <ul className="alertas">{d.cobrancas.map((c) => <li key={c.id}><span><b>{c.nomeCliente}</b> · {c.tipo} · {c.status}{c.dataPrometida ? ` · promessa ${dataBr(c.dataPrometida)}` : ''}{c.valor ? ` · ${brl(c.valor)}` : ''}<span className="pequeno mudo"> · {c.usuario}, {new Date(c.criadoEm).toLocaleDateString('pt-BR')}{c.obs ? ` · ${c.obs}` : ''}</span></span></li>)}</ul>
          ) : <div className="vazio">Nenhum contato registrado ainda.</div>}
        </div>
      </div>
    </>
  );
}
