// Relatório Financeiro mensal no modelo em PDF (A4 deitado). O navegador gera o PDF pela impressão.
import { getDb } from '@/db';
import { brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { nomeMes, semanasDoMes } from '@/domain/relatorio';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { dadosRelatorioMensal } from '@/server/relatorio-mensal';
import { mesAtivo } from '@/server/mes';
import { Acoes } from './Acoes';
import './relatorio.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes || '') ? sp.mes! : (await mesAtivo()) || new Date().toISOString().slice(0, 7);
  // o título vira o nome do arquivo ao salvar em PDF
  return { title: `Financeiro_${nomeMes(mes)[0].toUpperCase()}${nomeMes(mes).slice(1)}_${mes.slice(0, 4)}_${emp.razao.replace(/[^\w]+/g, '_')}` };
}

const COR_STATUS: Record<string, string> = { VENCIDO: 'st-venc', 'A PAGAR': 'st-aberto', 'A RECEBER': 'st-aberto', PAGO: 'st-ok', RECEBIDO: 'st-ok' };

export default async function RelatorioMensal({ searchParams }: { searchParams: Promise<{ mes?: string; pdf?: string; tipo?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const hoje = new Date().toISOString().slice(0, 10);
  const mes = /^\d{4}-\d{2}$/.test(sp.mes || '') ? sp.mes! : (await mesAtivo()) || hoje.slice(0, 7);
  const d = await dadosRelatorioMensal(await getDb(), emp, mes, hoje);
  const agora = new Date();
  const quando = `${agora.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })} às ${agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit' })}`;
  const titMes = `${nomeMes(mes).toUpperCase()} ${mes.slice(0, 4)}`;
  const iniciais = u.tenantNome.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'Z';
  const rodape = `${u.tenantNome.toUpperCase()} · Relatório Financeiro Mensal · ${emp.razao} · ${nomeMes(mes)[0].toUpperCase()}${nomeMes(mes).slice(1)} / ${mes.slice(0, 4)}`;
  const maxSem = Math.max(1, ...d.semanas.flatMap((s) => [s.receber, s.pagar]));
  const sem = semanasDoMes(mes);

  const tabela = (tipo: 'receber' | 'pagar') => {
    const bloco = tipo === 'receber' ? d.receber : d.pagar;
    return (
      <section className="rf-secao">
        <div className="rf-secao-tit"><h2>{tipo === 'receber' ? 'Contas a Receber' : 'Contas a Pagar'}</h2><span>Total: <b>{brl(bloco.total)}</b></span></div>
        {!bloco.grupos.length && <p className="rf-vazio">Nenhum título {tipo === 'receber' ? 'a receber' : 'a pagar'} com vencimento neste mês.</p>}
        {bloco.grupos.map((g) => (
          <div key={g.nome} className="rf-grupo">
            <div className={`rf-grupo-tit ${g.nome === 'Vencidos' ? 'venc' : ''}`}><i />{g.nome} <span>— {g.itens.length} título{g.itens.length === 1 ? '' : 's'} · {brl(g.total)}</span></div>
            <table>
              <thead><tr><th>{tipo === 'receber' ? 'Cliente' : 'Fornecedor'}</th><th>Documento</th><th>Descrição</th><th className="n">Valor</th><th>Vencimento</th><th className="n">{tipo === 'receber' ? 'Recebido' : 'Pago'}</th><th className="n">Saldo</th><th>Status</th></tr></thead>
              <tbody>{g.itens.map((l) => (
                <tr key={l.id}>
                  <td className="forte">{l.nome}</td>
                  <td>{l.documento}</td>
                  <td>{l.descricao}{l.detalhe && <div className="sub">{l.detalhe}</div>}</td>
                  <td className="n forte">{brl(l.valor)}</td>
                  <td className={l.grupo === 'Vencidos' ? 'venc' : ''}>{dataBr(l.venc)}</td>
                  <td className="n">{brl(l.pago)}</td>
                  <td className="n">{brl(l.saldo)}</td>
                  <td><span className={`rf-st ${COR_STATUS[l.status]}`}>{l.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
        {bloco.grupos.length > 0 && (
          <div className="rf-total"><span>TOTAL {tipo === 'receber' ? 'A RECEBER' : 'A PAGAR'}</span><span className="sub">{tipo === 'receber' ? 'Recebido' : 'Pago'} {brl(tipo === 'receber' ? d.receber.recebido : d.pagar.pago)} · Saldo {brl(bloco.saldo)}</span><b>{brl(bloco.total)}</b></div>
        )}
      </section>
    );
  };

  return (
    <div className="rf">
      <Acoes mes={mes} auto={sp.pdf === '1'} voltar={`/financeiro?tipo=${sp.tipo === 'receber' ? 'receber' : 'pagar'}`} />
      {/* rodapé de cada página impressa (a margem da página não pode ler o texto da tela) */}
      <style>{`@page { @bottom-left { content: ${JSON.stringify(rodape)}; font: 7.5pt 'Manrope', sans-serif; color: #4b5563; } }`}</style>
      <header className="rf-cab">
        <div className="rf-marca"><span className="rf-logo">{iniciais}</span><div><b>{u.tenantNome.toUpperCase()}</b><div>{emp.razao}</div><div className="sub">CNPJ: {formatarCnpj(emp.cnpj)}</div></div></div>
        <div className="rf-titulo"><h1>RELATÓRIO FINANCEIRO</h1><div>{titMes}</div></div>
        <div className="rf-gerado">Gerado em <b>{quando}</b><br />Responsável: <b>{u.nome} · {u.perfil}</b></div>
      </header>

      <div className="rf-kpis">
        <div className="rf-kpi"><div className="rot"><i className="verde" />A RECEBER</div><div className="v verde">{brl(d.receber.total)}</div></div>
        <div className="rf-kpi"><div className="rot"><i className="azul" />A PAGAR</div><div className="v">{brl(d.pagar.total)}</div></div>
        <div className="rf-kpi"><div className="rot"><i className="escuro" />SALDO PREVISTO</div><div className={`v ${d.previsto < 0 ? 'vermelho' : ''}`}>{brl(d.previsto)}</div></div>
        <div className="rf-sub"><span>Já recebido</span><b>{brl(d.receber.recebido)}</b></div>
        <div className="rf-sub"><span>Já pago</span><b>{brl(d.pagar.pago)}</b></div>
        <div className="rf-sub"><span>Saldo realizado</span><b>{brl(d.realizado)}</b></div>
      </div>
      <div className="rf-posicao"><b>Posição financeira prevista do mês</b><span>Receber <b>{brl(d.receber.total)}</b></span><em>MENOS</em><span>Pagar <b>{brl(d.pagar.total)}</b></span><em className="dir">IGUAL A</em><span>Saldo projetado <b className="grande">{brl(d.previsto)}</b></span></div>

      <div className="rf-dois">
        <div className="rf-caixa">
          <h3>Fluxo financeiro do mês</h3>
          <table className="rf-fluxo">
            <thead><tr><th>Período</th><th className="n">Receber</th><th className="n">Pagar</th><th className="n">Saldo</th></tr></thead>
            <tbody>{d.semanas.map((s) => <tr key={s.de}><td>{s.rotulo}</td><td className="n verde">{brl(s.receber)}</td><td className="n vermelho">{brl(s.pagar)}</td><td className="n forte">{brl(s.saldo)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="rf-caixa">
          <div className="rf-graf-tit"><h3>Receber × Pagar por semana</h3><span><i className="verde" />Receber <i className="azul" />Pagar</span></div>
          <svg viewBox="0 0 360 120" className="rf-graf" role="img" aria-label="Receber e pagar por semana">
            <line x1="10" x2="350" y1="100" y2="100" stroke="#d9dee5" />
            {[25, 50, 75].map((y) => <line key={y} x1="10" x2="350" y1={y} y2={y} stroke="#eef1f4" />)}
            {d.semanas.map((s, i) => {
              const x = 30 + i * 85;
              const hr = (s.receber / maxSem) * 90, hp = (s.pagar / maxSem) * 90;
              return (
                <g key={s.de}>
                  <rect x={x} y={100 - hr} width="16" height={hr} rx="2" fill="#4f9d76" />
                  <rect x={x + 20} y={100 - hp} width="16" height={hp} rx="2" fill="#2f5b8a" />
                  <text x={x + 18} y="114" textAnchor="middle" fontSize="7" fill="#6b7280">{sem[i].rotulo}</text>
                </g>
              );
            })}
          </svg>
          <div className="rf-destaques">
            <div><span>Maior entrada prevista · {d.maiorEntrada.rotulo}</span><b>{brl(d.maiorEntrada.receber)}</b></div>
            <div><span>Maior volume de pagamentos · {d.maiorSaida.rotulo}</span><b>{brl(d.maiorSaida.pagar)}</b></div>
          </div>
        </div>
      </div>

      {tabela('receber')}
      {tabela('pagar')}

      <section className="rf-secao">
        <div className="rf-secao-tit"><h2>Empréstimos e financiamentos do mês</h2><span>Total: <b>{brl(d.totEmprestimos.valor)}</b></span></div>
        {d.emprestimos.length ? (
          <>
            <table>
              <thead><tr><th>Instituição</th><th>Contrato</th><th>Parcela</th><th className="n">Principal</th><th className="n">Juros</th><th className="n">Valor</th><th>Vencimento</th></tr></thead>
              <tbody>{d.emprestimos.map((e, i) => <tr key={i}><td className="forte">{e.instituicao}</td><td>{e.contrato}</td><td>{e.parcela}</td><td className="n">{e.principal == null ? 'a definir' : brl(e.principal)}</td><td className="n">{e.juros == null ? 'a definir' : brl(e.juros)}</td><td className="n forte">{brl(e.valor)}</td><td>{dataBr(e.venc)}</td></tr>)}</tbody>
            </table>
            <div className="rf-total"><span>PARCELAS DE EMPRÉSTIMOS NO MÊS</span><span className="sub">Principal {brl(d.totEmprestimos.principal)} · Juros {brl(d.totEmprestimos.juros)}{d.totEmprestimos.parcial ? ' (parcial — taxa não cadastrada)' : ''}</span><b>{brl(d.totEmprestimos.valor)}</b></div>
          </>
        ) : <p className="rf-vazio">Nenhuma parcela de empréstimo ou financiamento vence neste mês.</p>}
      </section>

      <section className="rf-secao">
        <div className="rf-secao-tit"><h2>Folha de pagamento do mês</h2><span>Total: <b>{brl(d.folha.reduce((a, l) => a + l.valor, 0))}</b></span></div>
        {d.folha.length ? (
          <table>
            <thead><tr><th>Favorecido</th><th>Descrição</th><th className="n">Valor</th><th>Vencimento</th><th>Status</th></tr></thead>
            <tbody>{d.folha.map((l) => <tr key={l.id}><td className="forte">{l.nome}</td><td>{l.descricao}</td><td className="n">{brl(l.valor)}</td><td>{dataBr(l.venc)}</td><td><span className={`rf-st ${COR_STATUS[l.status]}`}>{l.status}</span></td></tr>)}</tbody>
          </table>
        ) : <p className="rf-vazio">Nenhum título de folha vence neste mês. Os salários e encargos entram aqui quando a folha da competência anterior é fechada.</p>}
      </section>

      <section className="rf-secao rf-resumo">
        <div className="rf-secao-tit"><h2>Resumo do mês</h2></div>
        <div className="rf-resumo-grade">
          <div><span>TOTAL A RECEBER</span><b>{brl(d.receber.total)}</b></div>
          <div><span>TOTAL A PAGAR</span><b>{brl(d.pagar.total)}</b></div>
          <div><span>SALDO PREVISTO</span><b>{brl(d.previsto)}</b></div>
          <div><span>TÍTULOS VENCIDOS</span><b>{d.resumo.vencidos} <small>({d.resumo.vencidosReceber} receber · {d.resumo.vencidosPagar} pagar)</small></b></div>
          <div><span>VALORES VENCIDOS</span><b className="vermelho">{brl(d.resumo.valoresVencidos)}</b></div>
          <div><span>PRÓXIMO VENCIMENTO</span><b>{dataBr(d.resumo.proximo)}</b></div>
        </div>
        <p className="sub">Parcelas de empréstimos no mês: <b>{brl(d.totEmprestimos.valor)}</b> · principal {brl(d.totEmprestimos.principal)} · juros {brl(d.totEmprestimos.juros)}</p>
        {d.canceladas.n > 0 && <p className="sub">NFs canceladas no mês: <b>{d.canceladas.n}</b> · valor original {brl(d.canceladas.valor)} — informativo, não compõe o saldo previsto</p>}
      </section>
    </div>
  );
}
