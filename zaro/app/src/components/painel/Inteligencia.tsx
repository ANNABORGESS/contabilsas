'use client';
// Partes interativas da Inteligência Financeira: simulador de caixa, editor de orçamento e conferência de boleto.
import { useMemo, useState } from 'react';
import { distribuirAnual, lerLinhaDigitavel, porSemana, projecaoCaixa, type Premissas, type Previsto } from '@/domain/inteligencia';
import { COR } from './cores';
import { Grafico } from './Grafico';

const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (d: string | null | undefined) => (d ? d.split('-').reverse().join('/') : '—');

export function SimuladorCaixa({ itens, saldoInicial, minimo, hoje, temSaldo }: { itens: Previsto[]; saldoInicial: number; minimo: number; hoje: string; temSaldo: boolean }) {
  const [horizonte, setHorizonte] = useState(90);
  const [semanal, setSemanal] = useState(true);
  const [p, setP] = useState<Premissas>({});
  const [fin, setFin] = useState({ valor: 0, data: hoje });
  const prem: Premissas = { ...p, financiamento: fin.valor > 0 ? fin : null };
  const ativo = Object.values(p).some((v) => !!v) || fin.valor > 0;
  const base = useMemo(() => projecaoCaixa(saldoInicial, itens, hoje, horizonte, {}, minimo), [itens, saldoInicial, hoje, horizonte, minimo]);
  const sim = useMemo(() => projecaoCaixa(saldoInicial, itens, hoje, horizonte, prem, minimo), [itens, saldoInicial, hoje, horizonte, minimo, JSON.stringify(prem)]); // eslint-disable-line react-hooks/exhaustive-deps
  const sem = porSemana(sim.pontos);
  const pts = semanal ? sem.map((s) => ({ rot: dataBr(s.de).slice(0, 5), nome: `${dataBr(s.de)} a ${dataBr(s.ate)}`, ...s })) : sim.pontos.map((x) => ({ rot: dataBr(x.data).slice(0, 5), nome: dataBr(x.data), ...x }));
  const campo = (k: keyof Premissas, rotulo: string, max: number, suf: string) => (
    <label className="sim-campo">{rotulo}<span><input type="range" min={0} max={max} step={1} value={Number(p[k] || 0)} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} /> <b>{Number(p[k] || 0)}{suf}</b></span></label>
  );
  return (
    <div className="grade g2 simulador">
      <div className="card">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>Projeção de caixa</h2>
          <div className="grafico-acoes">
            {[30, 60, 90, 180].map((h) => <button key={h} type="button" className={`chip ${horizonte === h ? 'ativo' : ''}`} onClick={() => setHorizonte(h)}>{h} dias</button>)}
            <button type="button" className="chip" onClick={() => setSemanal(!semanal)}>{semanal ? 'Diário' : 'Semanal'}</button>
          </div>
        </div>
        <p className="pequeno mudo">{temSaldo ? `Parte do saldo bancário de hoje (${brl(saldoInicial)}, realizado).` : 'Sem saldo bancário informado: a projeção parte de zero e mostra só o efeito dos vencimentos.'} Entradas e saídas são previstas pelos vencimentos dos títulos em aberto; recebimentos já vencidos ficam fora, salvo a premissa de recuperação.{ativo ? ' Cenário simulado aplicado.' : ''}</p>
        <Grafico titulo="Saldo projetado" categorias={['Hoje', ...pts.map((x) => x.rot)]} rotulos={['Hoje (realizado)', ...pts.map((x) => x.nome)]} referencia={minimo ? { valor: minimo, rotulo: `Caixa mínimo ${brl(minimo)}` } : undefined}
          series={[{ nome: ativo ? 'Saldo no cenário' : 'Saldo projetado', cor: COR.saldo, tipo: 'linha', valores: [saldoInicial, ...pts.map((x) => x.saldo)], projetadoDesde: 1 }]} />
        <h3 style={{ marginTop: 18 }}>Entradas e saídas por semana</h3>
        <Grafico titulo="Entradas e saídas previstas por semana" categorias={sem.map((s) => dataBr(s.de).slice(0, 5))} rotulos={sem.map((s) => `${dataBr(s.de)} a ${dataBr(s.ate)}`)}
          series={[{ nome: 'Entradas previstas', cor: COR.entrada, tipo: 'barra', valores: sem.map((s) => s.entradas) }, { nome: 'Saídas previstas', cor: COR.saida, tipo: 'barra', valores: sem.map((s) => s.saidas) }]} />
      </div>
      <div className="card">
        <h2>Cenários</h2>
        <p className="pequeno mudo">Simulação só na tela: nada é gravado.</p>
        {campo('atrasoRecebimentos', 'Atraso dos recebimentos', 60, ' dias')}
        {campo('reducaoFaturamento', 'Redução dos recebimentos', 50, '%')}
        {campo('aumentoDespesas', 'Aumento das despesas', 50, '%')}
        {campo('anteciparPagamentosDias', 'Antecipar pagamentos dos próximos', 30, ' dias')}
        {campo('recuperacaoVencidos', 'Recuperar recebimentos vencidos (em 30 dias)', 100, '%')}
        <div className="linha" style={{ marginTop: 8 }}>
          <div><label>Novo financiamento (R$)</label><input inputMode="decimal" value={fin.valor || ''} onChange={(e) => setFin({ ...fin, valor: Number(e.target.value.replace(/\./g, '').replace(',', '.')) || 0 })} /></div>
          <div><label>Data da liberação</label><input type="date" value={fin.data} min={hoje} onChange={(e) => setFin({ ...fin, data: e.target.value })} /></div>
        </div>
        <table className="posicao"><tbody>
          <tr><td>Menor saldo</td><td className="num">{base.menor ? brl(base.menor.saldo) : '—'}</td><td className={`num ${sim.menor && sim.menor.saldo < 0 ? 'neg' : ''}`}>{sim.menor ? `${brl(sim.menor.saldo)} em ${dataBr(sim.menor.data)}` : '—'}</td></tr>
          <tr><td>Saldo fica negativo</td><td className="num">{dataBr(base.negativo) === '—' ? 'não' : dataBr(base.negativo)}</td><td className="num">{sim.negativo ? <b className="neg">{dataBr(sim.negativo)}</b> : 'não'}</td></tr>
          <tr><td>Abaixo do caixa mínimo</td><td className="num">{base.abaixoDoMinimo ? dataBr(base.abaixoDoMinimo) : 'não'}</td><td className="num">{sim.abaixoDoMinimo ? <b className="at">{dataBr(sim.abaixoDoMinimo)}</b> : 'não'}</td></tr>
          <tr><td>Entradas / saídas</td><td className="num pequeno">{brl(base.entradas)} / {brl(base.saidas)}</td><td className="num pequeno">{brl(sim.entradas)} / {brl(sim.saidas)}</td></tr>
        </tbody><thead><tr><th></th><th className="num pequeno">Sem cenário</th><th className="num pequeno">Com cenário</th></tr></thead></table>
        {ativo && <button type="button" className="btn mini" style={{ marginTop: 10 }} onClick={() => { setP({}); setFin({ valor: 0, data: hoje }); }}>Limpar cenário</button>}
      </div>
    </div>
  );
}

type Linha = { area: string; natureza: string; mes: number; valor: number };
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function EditorOrcamento({ versao, linhas: iniciais, areas, acao, volta, bloqueado }: { versao: string; linhas: Linha[]; areas: string[]; acao: (f: FormData) => void; volta: string; bloqueado: boolean }) {
  const [linhas, setLinhas] = useState(iniciais);
  const [nat, setNat] = useState<'despesa' | 'receita'>('despesa');
  const [nova, setNova] = useState('');
  const doNat = [...new Set(linhas.filter((l) => l.natureza === nat).map((l) => l.area))];
  const valor = (area: string, mes: number) => linhas.find((l) => l.area === area && l.natureza === nat && l.mes === mes)?.valor || 0;
  const definir = (area: string, mes: number, v: number) => setLinhas((ls) => [...ls.filter((l) => !(l.area === area && l.natureza === nat && l.mes === mes)), { area, natureza: nat, mes, valor: v }]);
  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  return (
    <form action={acao} className="card editor-orc">
      <input type="hidden" name="versao" value={versao} />
      <input type="hidden" name="volta" value={volta} />
      <input type="hidden" name="linhas" value={JSON.stringify(linhas.filter((l) => l.valor))} />
      <div className="linha" style={{ justifyContent: 'space-between' }}>
        <h2>Valores orçados</h2>
        <div className="grafico-acoes">{(['despesa', 'receita'] as const).map((n) => <button key={n} type="button" className={`chip ${nat === n ? 'ativo' : ''}`} onClick={() => setNat(n)}>{n === 'despesa' ? 'Despesas' : 'Receitas'}</button>)}</div>
      </div>
      {bloqueado && <p className="aviso">Versão aprovada: os valores ficam congelados. Crie uma revisão para alterar.</p>}
      <div className="tabela-wrap"><table className="compacta">
        <thead><tr><th>Área</th>{MESES.map((m) => <th key={m} className="num">{m}</th>)}<th className="num">Ano</th><th>Distribuir anual</th></tr></thead>
        <tbody>{doNat.map((a) => (
          <tr key={a}>
            <td>{a}</td>
            {MESES.map((_, i) => <td key={i}><input className="cel" disabled={bloqueado} inputMode="decimal" defaultValue={valor(a, i + 1) ? String(valor(a, i + 1)).replace('.', ',') : ''} key={`${a}-${i}-${valor(a, i + 1)}`} onBlur={(e) => definir(a, i + 1, num(e.target.value))} aria-label={`${a} ${MESES[i]}`} /></td>)}
            <td className="num">{brl(MESES.reduce((s, _, i) => s + valor(a, i + 1), 0))}</td>
            <td><input className="cel" disabled={bloqueado} placeholder="total" inputMode="decimal" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const m = distribuirAnual(num(e.currentTarget.value)); m.forEach((v, i) => definir(a, i + 1, v)); e.currentTarget.value = ''; } }} aria-label={`Distribuir anual de ${a}`} /></td>
          </tr>
        ))}</tbody>
      </table></div>
      {!bloqueado && (
        <div className="linha" style={{ marginTop: 10 }}>
          <select value={nova} onChange={(e) => setNova(e.target.value)} aria-label="Área para incluir">
            <option value="">Incluir área cadastrada…</option>
            {areas.filter((a) => !doNat.includes(a)).map((a) => <option key={a}>{a}</option>)}
          </select>
          <button type="button" className="btn mini" disabled={!nova} onClick={() => { setLinhas((ls) => [...ls, { area: nova, natureza: nat, mes: 1, valor: 0 }]); setNova(''); }}>Incluir</button>
          <span className="pequeno mudo">Áreas = centros de custo (ou categorias) já usados nos títulos. Para distribuir um total anual, digite na última coluna e tecle Enter.</span>
          <button className="btn primario" type="submit" style={{ marginLeft: 'auto' }}>Salvar orçamento</button>
        </div>
      )}
    </form>
  );
}

export function ConferirBoleto({ titulos, hoje }: { titulos: { codigo: string; fornecedor: string; valor: number; venc: string | null }[]; hoje: string }) {
  const [linha, setLinha] = useState('');
  const r = linha.replace(/\D/g, '').length >= 44 ? lerLinhaDigitavel(linha, hoje) : null;
  const iguais = r ? titulos.filter((t) => Math.abs(t.valor - r.valor) < 0.01) : [];
  return (
    <div className="card">
      <h2>Conferir boleto</h2>
      <p className="pequeno mudo">Cole a linha digitável. A ZARO lê valor e vencimento e procura título já lançado, para não criar conta em duplicidade. Nenhum pagamento é feito daqui.</p>
      <input value={linha} onChange={(e) => setLinha(e.target.value)} placeholder="00190.00009 01234.567890 12345.678901 2 12340000012345" aria-label="Linha digitável" />
      {linha && !r && <p className="pequeno at">A linha digitável de boleto bancário tem 47 números (convênio/concessionária com 48 ainda não é lida).</p>}
      {r && (
        <div style={{ marginTop: 10 }}>
          <p>Banco <b>{r.banco}</b> · valor <b>{brl(r.valor)}</b> · vencimento <b>{dataBr(r.venc)}</b> {!r.camposOk && <span className="tag neg">dígito verificador não confere: confira a digitação</span>}</p>
          {iguais.length ? (
            <ul className="alertas">{iguais.map((t) => <li key={t.codigo} data-g={t.venc === r.venc ? 3 : 2}><span><b>{t.codigo}</b> · {t.fornecedor}<span className="pequeno mudo"> · vence {dataBr(t.venc)}</span></span><span className={`tag ${t.venc === r.venc ? 'neg' : 'at'}`}>{t.venc === r.venc ? 'Já lançado' : 'Mesmo valor'}</span></li>)}</ul>
          ) : <p className="pequeno pos">Nenhum título em aberto com este valor: pode ser lançado em Contas a Pagar.</p>}
        </div>
      )}
    </div>
  );
}
