import Link from 'next/link';
import { getDb } from '@/db';
import { brl, dataBr } from '@/domain/dinheiro';
import { dadosCaixa } from '@/server/inteligencia';
import { dadosSplit } from '@/server/split-payment';
import { SimuladorCaixa } from '@/components/painel/Inteligencia';
import { salvarCaixaMinimo, salvarSaldoConta } from './acoes';
import { Card, type Props } from './comum';

export async function Caixa({ u, emp, hoje, edita }: Props) {
  const d = await dadosCaixa(await getDb(), u, emp, hoje);
  const split = await dadosSplit(await getDb(), emp, hoje);
  return (
    <>
      {!d.temSaldo && <div className="aviso">Sem saldo bancário: informe o saldo inicial em <Link href="/financeiro?tipo=extrato#saldo">Financeiro → Extrato</Link>. Até lá, a projeção parte de zero.</div>}
      <div className="indicadores quatro">
        <Card rotulo="Saldo bancário atual" cor="menta" valor={d.temSaldo ? brl(d.saldoInicial) : '—'} fonte="saldo inicial + extrato (realizado)">
          <span>{d.bancos.length} conta(s) no extrato{d.banco ? ` · até ${dataBr(d.banco.ultimoMovimento)}` : ''}</span>
        </Card>
        <Card rotulo="A receber em 90 dias" cor="ceu" valor={brl(d.receber90)} fonte="títulos em aberto por vencimento (previsto)">
          <span>{d.nReceber90} título(s) · vencidos fora: {brl(d.receberVencido)}</span>
        </Card>
        <Card rotulo="A pagar em 90 dias" cor="pessego" valor={brl(d.pagar90)} fonte="títulos em aberto (inclui vencidos)">
          <span>{d.nPagar90} título(s) · folha em 30 dias: {brl(d.folha30)}</span>
        </Card>
        <Card rotulo="Menor saldo projetado" cor="lavanda" valor={d.menor ? <span className={d.menor.saldo < 0 ? 'neg' : ''}>{brl(d.menor.saldo)}</span> : '—'} fonte="projeção diária, 90 dias">
          <span>{d.menor ? `em ${dataBr(d.menor.data)}` : ''}{d.negativo ? <b className="neg"> · negativo a partir de {dataBr(d.negativo)}</b> : ''}</span>
        </Card>
      </div>
      <div style={{ marginTop: 16 }}><SimuladorCaixa itens={d.itens} saldoInicial={d.saldoInicial} minimo={d.minimo} hoje={hoje} temSaldo={d.temSaldo} /></div>
      <div className="painel-grade" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Saldo por banco</h2>
          <p className="pequeno mudo">Somente contas desta empresa. Conciliado = movimento do extrato com lançamento aprovado na Contabilidade.</p>
          {d.bancos.length ? (
            <div className="tabela-wrap"><table className="compacta">
              <thead><tr><th>Conta</th><th className="num">Saldo</th><th>Última atualização</th><th>Conciliação</th></tr></thead>
              <tbody>{d.bancos.map((b) => <tr key={b.conta}><td>{b.conta}</td><td className="num">{b.saldo == null ? <span className="mudo">informe o saldo</span> : brl(b.saldo)}</td><td>{dataBr(b.ultimo)}</td><td>{b.pendentes ? <span className="tag at">{b.pendentes} de {b.movimentos} pendentes</span> : <span className="tag pos">Conciliada</span>}</td></tr>)}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhum extrato importado. O saldo por banco aparece quando houver extrato.</div>}
          {edita && d.bancos.length > 0 && (
            <form action={salvarSaldoConta} className="linha" style={{ marginTop: 10 }}>
              <input type="hidden" name="volta" value="/inteligencia?aba=caixa" />
              <div><label>Conta</label><select name="conta">{d.bancos.map((b) => <option key={b.conta}>{b.conta}</option>)}</select></div>
              <div><label>Data</label><input type="date" name="data" required /></div>
              <div><label>Saldo no fim do dia</label><input name="valor" inputMode="decimal" required /></div>
              <button className="btn mini" type="submit">Gravar saldo da conta</button>
            </form>
          )}
        </div>
        <div className="card">
          <h2>Caixa mínimo</h2>
          <p className="pequeno mudo">Linha tracejada no gráfico. A ZARO avisa a primeira data em que o saldo projetado fica abaixo dela.</p>
          <p>Atual: <b>{brl(d.minimo)}</b>{d.abaixoDoMinimo && <span className="tag at" style={{ marginLeft: 8 }}>abaixo em {dataBr(d.abaixoDoMinimo)}</span>}</p>
          {edita && (
            <form action={salvarCaixaMinimo} className="linha">
              <input type="hidden" name="volta" value="/inteligencia?aba=caixa" />
              <input name="minimo" inputMode="decimal" placeholder="0,00" aria-label="Caixa mínimo" style={{ maxWidth: 180 }} />
              <button className="btn mini" type="submit">Gravar</button>
            </form>
          )}
          <p className="pequeno mudo" style={{ marginTop: 10 }}>Empréstimos ativos contratados: {brl(d.emprestimosAtivos)} (<Link href="/financeiro?tipo=emprestimos">ver contratos</Link>).</p>
        </div>
        <div className="card largo">
          <h2>Maiores saídas previstas (90 dias)</h2>
          {d.maioresSaidas.length ? (
            <div className="tabela-wrap"><table className="compacta">
              <thead><tr><th>Data</th><th>Descrição</th><th>Favorecido</th><th>Categoria</th><th className="num">Valor</th><th>Situação</th></tr></thead>
              <tbody>{d.maioresSaidas.map((s) => <tr key={s.id}><td>{dataBr(s.data)}</td><td><Link href={`/financeiro?tipo=pagar&f=todos&q=${encodeURIComponent(s.codigo)}`}>{s.descricao}</Link></td><td>{s.favorecido}</td><td><span className="tag">{s.categoria}</span></td><td className="num">{brl(s.valor)}</td><td><span className={`tag ${s.situacao === 'Vencido' ? 'neg' : s.situacao === 'Agendado' ? 'pos' : ''}`}>{s.situacao}</span></td></tr>)}</tbody>
            </table></div>
          ) : <div className="vazio">Nenhuma saída prevista nos próximos 90 dias.</div>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="linha" style={{ justifyContent: 'space-between' }}><h2>Split Payment · impacto estimado nos recebimentos</h2><Link className="pequeno" href="/fiscal/reforma">Abrir Split Payment</Link></div>
        <p className="pequeno mudo" style={{ margin: '4px 0 10px' }}>Estimativa pelos IBS/CBS destacados nas NFs dos títulos a receber. Ainda não está em operação; tributo segregado não é despesa bancária.</p>
        <div className="tabela-wrap"><table>
          <thead><tr><th>Horizonte</th><th className="num">Recebimento bruto previsto</th><th className="num">Segregação estimada</th><th className="num">Recebimento líquido previsto</th></tr></thead>
          <tbody>{split.projecao.map((p) => <tr key={p.dias}><td>{p.dias} dias</td><td className="num">{brl(p.bruto)}</td><td className="num">{brl(p.segregacao)}</td><td className="num">{brl(p.liquido)}</td></tr>)}</tbody>
        </table></div>
      </div>
    </>
  );
}
