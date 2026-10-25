import Link from 'next/link';
import { getDb } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import type { Empresa } from '@/server/auth';
import { dadosEndividamento } from '@/server/financeiro-analises';
import { BarrasH, Grafico } from '@/components/painel/Grafico';
import { COR } from '@/components/painel/cores';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (m: string) => (m === 'Vencido' ? 'Vencido' : `${MESES[+m.slice(5) - 1]}/${m.slice(2, 4)}`);
const vezes = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR')}x`);
const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR')}%`);

export async function Endividamento({ emp, hoje, cabeca }: { emp: Empresa; hoje: string; cabeca: React.ReactNode }) {
  const d = await dadosEndividamento(await getDb(), emp, hoje);
  const i = d.indicadores, c = d.composicao, b = d.base12;
  return (
    <>
      {cabeca}
      <div className={`aviso ${i.nivel === 'Crítico' ? 'erro' : i.nivel === 'Atenção' ? '' : 'ok'}`}>
        <b>Situação: {i.nivel}.</b> {i.motivos.length ? i.motivos.join('; ') + '.' : i.nivel === 'Sem dados' ? 'Sem dívidas nem faturamento registrados para analisar.' : 'Os índices estão dentro das faixas de referência.'}
        {' '}<Link href="/especialistas?q=crise">Pedir diagnóstico ao especialista em crises →</Link>
      </div>
      <div className="indicadores quatro">
        <div className="card indicador" data-cor="rosa"><span className="rotulo">Endividamento total</span><div className="v">{brl(d.total)}</div><div className="ind-info"><span>oneroso {brl(d.onerosa)} · vencido com fornecedores e tributos {brl(c.fornecedoresVencidos + c.tributosVencidos)}</span></div><div className="pequeno mudo">Fonte: Contas a Pagar, contratos e PGFN</div></div>
        <div className="card indicador" data-cor="lavanda"><span className="rotulo">Dívida / EBITDA (12m)</span><div className="v">{vezes(i.dividaEbitda)}</div><div className="ind-info"><span>EBITDA 12 meses {brl(b.ebitda)}{b.previa ? ' (prévia)' : ''}</span></div><div className="pequeno mudo">Referência: até 2,5x</div></div>
        <div className="card indicador" data-cor="ceu"><span className="rotulo">Cobertura de juros</span><div className="v">{vezes(i.coberturaJuros)}</div><div className="ind-info"><span>juros e encargos 12 meses {brl(b.juros)}</span></div><div className="pequeno mudo">EBITDA ÷ despesas financeiras · referência: acima de 3x</div></div>
        <div className="card indicador" data-cor="pessego"><span className="rotulo">Curto prazo (12 meses)</span><div className="v">{pct(i.curtoPct)}</div><div className="ind-info"><span>{brl(d.curtoPrazo)} vence em até 12 meses ou já venceu · longo prazo {brl(d.longoPrazo)}</span></div><div className="pequeno mudo">Referência: até 60%</div></div>
      </div>
      <div className="painel-grade" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Composição da dívida</h2>
          <BarrasH total={d.total || undefined} itens={[
            { rotulo: 'Empréstimos e financiamentos', valor: c.emprestimos, cor: '#a48fd6', href: '/financeiro?tipo=emprestimos' },
            { rotulo: `Dívida ativa PGFN (${c.nPgfn})`, valor: c.pgfn, cor: '#e992ab', href: '/fiscal' },
            { rotulo: `Tributos vencidos (${c.nTrib})`, valor: c.tributosVencidos, cor: '#e8956a', href: '/financeiro?tipo=pagar&f=vencidos' },
            { rotulo: `Fornecedores vencidos (${c.nForn})`, valor: c.fornecedoresVencidos, cor: '#5f9fdc', href: '/financeiro?tipo=pagar&f=vencidos' },
          ].filter((x) => x.valor > 0)} />
          <table className="posicao"><tbody>
            <tr><td>Dívida / faturamento 12 meses</td><td className="num">{pct(i.dividaFaturamento)}</td></tr>
            <tr><td>Parcelas dos próximos 12 meses / faturamento</td><td className="num">{pct(i.comprometimento)}</td></tr>
            <tr><td>Custo médio dos contratos</td><td className="num">{d.custoMedio == null ? 'taxas não informadas' : `${d.custoMedio.toLocaleString('pt-BR')}% a.m.`}</td></tr>
            <tr><td>Dívida ativa exigível já (ajuizada / em cobrança)</td><td className="num">{brl(c.pgfnCurto)}<div className="pequeno mudo">negociada/parcelada conta como longo prazo</div></td></tr>
            <tr><td>Faturamento 12 meses</td><td className="num">{brl(b.faturamento)}</td></tr>
          </tbody></table>
        </div>
        <div className="card">
          <h2>Cronograma de parcelas</h2>
          <p className="pequeno mudo">Parcelas de empréstimos e financiamentos lançadas no Contas a Pagar: vencidas e próximos 12 meses.</p>
          <Grafico titulo="Parcelas por mês" categorias={d.cronograma.map((x) => mesCurto(x.mes))} rotulos={d.cronograma.map((x) => (x.mes === 'Vencido' ? 'Já vencido' : x.mes.split('-').reverse().join('/')))}
            series={[{ nome: 'Parcelas', cor: COR.saida, tipo: 'barra', valores: d.cronograma.map((x) => x.valor) }]} />
        </div>
        <div className="card largo">
          <h2>Por credor</h2>
          {d.credores.length ? (
            <div className="tabela-wrap"><table className="compacta">
              <thead><tr><th>Credor</th><th>Tipo</th><th className="num">Contratado</th><th className="num">Saldo em aberto</th><th className="num">Vencido</th><th className="num">Parcelas</th><th>Próxima</th><th className="num">Taxa</th></tr></thead>
              <tbody>{d.credores.map((g) => (
                <tr key={`${g.credor}-${g.contrato}`}>
                  <td><Link href={`/financeiro?tipo=pagar&f=abertos&q=${encodeURIComponent(g.contrato || g.credor)}`}>{g.credor}</Link>{g.contrato && <div className="pequeno mudo">contrato {g.contrato}</div>}</td>
                  <td>{g.tipo}</td>
                  <td className="num">{g.contratado == null ? '—' : brl(g.contratado)}</td>
                  <td className="num">{brl(g.saldo)}{g.semCronograma && <div className="pequeno at">sem parcelas lançadas: usando o contratado</div>}</td>
                  <td className={`num ${g.vencido ? 'neg' : ''}`}>{g.vencido ? brl(g.vencido) : '—'}</td>
                  <td className="num">{g.parcelas || '—'}</td>
                  <td>{g.proxima ? `${dataBr(g.proxima.venc)} · ${brl(g.proxima.valor)}` : '—'}</td>
                  <td className="num">{g.taxa == null ? '—' : `${String(g.taxa).replace('.', ',')}% a.m.`}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhum empréstimo ou financiamento registrado.</div>}
        </div>
        {d.pgfn.length > 0 && (
          <div className="card largo">
            <h2>Dívida ativa (PGFN)</h2>
            <div className="tabela-wrap"><table className="compacta">
              <thead><tr><th>Inscrição</th><th>Natureza</th><th>Situação</th><th className="num">Valor</th><th>Atualizado em</th></tr></thead>
              <tbody>{d.pgfn.map((p) => <tr key={p.inscricao}><td>{p.inscricao}</td><td>{p.natureza || '—'}</td><td>{p.situacao || '—'}</td><td className="num">{brl(p.valor)}</td><td>{dataBr(p.atualizadoEm)}</td></tr>)}</tbody>
            </table></div>
          </div>
        )}
      </div>
      <p className="pequeno mudo" style={{ marginTop: 12 }}>EBITDA e juros vêm dos lançamentos dos últimos 12 meses (inclui prévia). Para o saldo devedor exato dos empréstimos, as parcelas futuras precisam estar lançadas no Contas a Pagar.</p>
    </>
  );
}
