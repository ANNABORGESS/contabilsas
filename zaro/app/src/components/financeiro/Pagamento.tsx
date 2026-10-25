'use client';
// Contas a Pagar: painel "Planejar pagamento" (seleção, simulação de caixa e ações) e a janela
// "Registrar pagamento" (forma, desconto, juros, multa e comprovante). Nada aqui paga no banco.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ETAPAS_FLUXO, FORMAS, TIPOS_CHAVE_PIX, valorFinal, type Forma } from '@/domain/pagamento';
import { Icone } from '../Icone';

const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (d: string | null | undefined) => (d ? d.split('-').reverse().join('/') : '—');
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;

export interface TituloPlano {
  id: string;
  codigo: string;
  nome: string;
  nf: string | null;
  venc: string | null;
  saldo: number;
  prioridade: 'Alta' | 'Média' | 'Baixa';
  motivo: string;
  etapa: string;
  etapaIdx: number;
  conta: string | null;
  agendadoPara: string | null;
}
type Acao = (f: FormData) => void | Promise<void>;
export interface AcoesPlano { aprovar: Acao; programar: Acao; rejeitar: Acao; reagendar: Acao; parcelar: Acao; renegociar: Acao; prioritario: Acao; conta: Acao; comprovante: Acao }

const marcados = () => [...document.querySelectorAll<HTMLInputElement>('input[form=planejar][name=id]:checked')].map((i) => i.value);

export function PlanejarPagamento({ titulos, sim, hoje, volta, acoes }: {
  titulos: Record<string, TituloPlano>;
  sim: { saldoAtual: number | null; recebimentos30: number; pagamentos30: number; caixaMinimo: number; contas: string[] };
  hoje: string;
  volta: string;
  acoes: AcoesPlano;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const [extra, setExtra] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    const ler = () => setSel(marcados());
    ler();
    document.addEventListener('change', ler);
    return () => document.removeEventListener('change', ler);
  }, []);
  const lista = sel.map((id) => titulos[id]).filter(Boolean);
  if (!lista.length) return <p className="pequeno mudo planejar-dica">Marque títulos na lista para planejar o pagamento: simular o caixa, aprovar, programar, parcelar ou registrar.</p>;

  const total = lista.reduce((a, t) => a + t.saldo, 0);
  const vencs = lista.map((t) => t.venc).filter(Boolean).sort() as string[];
  const altas = lista.filter((t) => t.prioridade === 'Alta').length;
  const contaSugerida = lista.find((t) => t.conta)?.conta || sim.contas[0] || null;
  const projetado = (sim.saldoAtual ?? 0) - total + sim.recebimentos30;
  const etapaMin = Math.min(...lista.map((t) => t.etapaIdx));
  const desmarcar = (id?: string) => {
    document.querySelectorAll<HTMLInputElement>('input[form=planejar][name=id]').forEach((i) => { if (!id || i.value === id) i.checked = false; });
    setSel(marcados());
  };
  const dias = (v: string) => Math.round((Date.parse(hoje) - Date.parse(v)) / 864e5);
  const botao = (k: string, rotulo: string) => <button type="button" className={`btn ${extra === k ? 'ativo' : ''}`} onClick={() => setExtra(extra === k ? null : k)}>{rotulo}</button>;

  return (
    <form id="planejar" className="card planejar" encType="multipart/form-data">
      <input type="hidden" name="volta" value={volta} />
      <div className="planejar-topo">
        <span className="ind-icone"><Icone nome="cal" tam={18} /></span>
        <div>
          <h2>Planejar pagamento <span className="contador">{lista.length}</span></h2>
          <div className="pequeno mudo">Vencimentos {dataBr(vencs[0])}{vencs.length > 1 ? ` a ${dataBr(vencs[vencs.length - 1])}` : ''} · {altas} alta{altas === 1 ? '' : 's'}{contaSugerida ? ` · conta sugerida ${contaSugerida}` : ''}</div>
        </div>
        <div className="planejar-total"><span>Total selecionado</span><b>{brl(total)}</b></div>
      </div>
      <div className="planejar-corpo">
        <ul className="planejar-lista">
          {lista.map((t) => (
            <li key={t.id}>
              <div>
                <b>{t.nome}</b>
                <div className="pequeno mudo">{t.nf ? `NF ${t.nf} · ` : ''}{t.codigo} · {dataBr(t.venc)}{t.venc && t.venc < hoje ? ` · vencido há ${dias(t.venc)}d` : ''}</div>
                <div className="pequeno etapa-txt">{t.etapa === 'Título preparado' ? 'Aguarda aprovação' : t.etapa}{t.agendadoPara ? ` · programado para ${dataBr(t.agendadoPara)}` : ''}</div>
              </div>
              <span className={`tag prio-${t.prioridade}`} title={t.motivo}>{t.prioridade}</span>
              <b className="num">{brl(t.saldo)}</b>
              <button type="button" className="x" onClick={() => desmarcar(t.id)} aria-label={`Tirar ${t.codigo} da seleção`}>×</button>
            </li>
          ))}
        </ul>
        <div className="simulacao">
          <b>Simulação de caixa</b>
          <div className="lin"><span>Saldo atual</span><span>{sim.saldoAtual == null ? <Link href="/financeiro?tipo=extrato#saldo">informar saldo</Link> : brl(sim.saldoAtual)}</span></div>
          <div className="lin"><span>(−) Títulos selecionados</span><span className="neg">−{brl(total)}</span></div>
          <div className="lin"><span>(+) Recebimentos previstos (30 dias)</span><span className="pos">+{brl(sim.recebimentos30)}</span></div>
          <div className="lin total"><span>= Saldo projetado</span><b className={projetado < sim.caixaMinimo ? 'neg' : ''}>{brl(projetado)}</b></div>
          <div className="pequeno mudo">Caixa mínimo {brl(sim.caixaMinimo)} · pagamentos previstos em 30 dias {brl(sim.pagamentos30)}{sim.saldoAtual == null ? ' · sem saldo bancário, a conta parte de zero' : ''}</div>
          {projetado < sim.caixaMinimo && <div className="pequeno neg">O saldo projetado fica abaixo do caixa mínimo.</div>}
          <div className="linha links">
            <Link href="/inteligencia?aba=caixa">Simular</Link>
            <button type="button" className="link" onClick={() => setExtra('programar')}>Reprogramar</button>
            <Link href="/inteligencia?aba=pagamentos&f=revisao">Ver prioridades</Link>
          </div>
        </div>
      </div>
      <div className="planejar-acoes">
        <button type="button" className="btn primario" onClick={() => router.push(`${volta}${volta.includes('?') ? '&' : '?'}pagar=${sel.join(',')}`)}><Icone nome="fin" tam={16} /> Registrar pagamento</button>
        <button type="submit" className="btn" formAction={acoes.aprovar}>Aprovar</button>
        {botao('rejeitar', 'Rejeitar')}
        {botao('programar', 'Programar')}
        <button type="submit" className="btn" formAction={acoes.reagendar}>Reagendar +7d</button>
        {botao('parcelar', 'Parcelar')}
        {botao('renegociar', 'Renegociar')}
        <button type="submit" className="btn" formAction={acoes.prioritario}>Marcar prioritário</button>
        {botao('conta', 'Trocar conta')}
        {botao('comprovante', 'Anexar comprovante')}
        <button type="button" className="link" onClick={() => { desmarcar(); setExtra(null); }}>Limpar seleção</button>
      </div>
      {extra && (
        <div className="planejar-extra linha">
          {extra === 'rejeitar' && <><input name="motivo" placeholder="Motivo da rejeição" required /><button className="btn primario mini" formAction={acoes.rejeitar}>Rejeitar</button></>}
          {extra === 'programar' && <><label className="linha">Pagar em <input type="date" name="dataProgramada" min={hoje} required /></label><button className="btn primario mini" formAction={acoes.programar}>Programar</button><span className="pequeno mudo">Só títulos aprovados podem ser programados.</span></>}
          {extra === 'parcelar' && (lista.length === 1
            ? <><label className="linha">Parcelas <input name="parcelas" type="number" min={2} max={60} defaultValue={2} style={{ width: 80 }} /></label><label className="linha">1º vencimento <input type="date" name="primeiroVenc" defaultValue={lista[0].venc && lista[0].venc > hoje ? lista[0].venc : hoje} /></label><button className="btn primario mini" formAction={acoes.parcelar}>Parcelar</button></>
            : <span className="pequeno at">Selecione um título só para parcelar.</span>)}
          {extra === 'renegociar' && <><label className="linha">Novo vencimento <input type="date" name="novoVenc" required /></label>{lista.length === 1 && <input name="novoValor" placeholder="Novo valor (opcional)" inputMode="decimal" style={{ width: 170 }} />}<input name="motivoReneg" placeholder="Motivo / acordo" required /><button className="btn primario mini" formAction={acoes.renegociar}>Renegociar</button></>}
          {extra === 'conta' && <><input name="novaConta" list="contas-pagamento" placeholder="Conta ou caixa de origem" defaultValue={contaSugerida || ''} required /><datalist id="contas-pagamento">{sim.contas.map((c) => <option key={c} value={c} />)}</datalist><button className="btn primario mini" formAction={acoes.conta}>Trocar conta</button></>}
          {extra === 'comprovante' && <><input type="file" name="arquivo" accept="application/pdf,image/*" required /><button className="btn primario mini" formAction={acoes.comprovante}>Anexar</button></>}
        </div>
      )}
      <div className="etapas-fluxo">
        {ETAPAS_FLUXO.map((e, i) => <span key={e} className={`chip-etapa ${i < etapaMin ? 'feito' : i === etapaMin ? 'atual' : ''}`}><i />{e}</span>)}
      </div>
    </form>
  );
}

export interface TituloPagamento { id: string; codigo: string; nome: string; nf: string | null; parcela: string; valor: number; saldo: number; venc: string | null }

export function RegistrarPagamento({ titulos, empresa, hoje, contas, contaSugerida, acao, volta, fechar }: {
  titulos: TituloPagamento[];
  empresa: string;
  hoje: string;
  contas: string[];
  contaSugerida: string | null;
  acao: Acao;
  volta: string;
  fechar: string;
}) {
  const um = titulos.length === 1 ? titulos[0] : null;
  const [forma, setForma] = useState<Forma>('PIX');
  const [arquivo, setArquivo] = useState('');
  const [v, setV] = useState({ valor: um ? String(um.saldo.toFixed(2)).replace('.', ',') : '', desconto: '0', juros: '0', multa: '0' });
  const total = um ? valorFinal({ valor: num(v.valor), desconto: num(v.desconto), juros: num(v.juros), multa: num(v.multa) }) : titulos.reduce((a, t) => a + t.saldo, 0);
  const campo = (k: keyof typeof v, rotulo: string) => <div><label>{rotulo}</label><input name={k} inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} required={k === 'valor'} /></div>;
  return (
    <div className="modal-fundo" role="dialog" aria-modal="true" aria-label="Registrar pagamento">
      <form className="modal card" action={acao} encType="multipart/form-data">
        <input type="hidden" name="volta" value={volta} />
        {titulos.map((t) => <input key={t.id} type="hidden" name="id" value={t.id} />)}
        <input type="hidden" name="forma" value={forma} />
        <div className="modal-topo">
          <div><div className="sobretitulo">Registrar pagamento</div><h2>{um ? `${um.codigo} · ${um.nome}` : `${titulos.length} títulos selecionados`}</h2></div>
          <Link href={fechar} className="fechar">Fechar</Link>
        </div>
        {um ? (
          <div className="faixa-info">
            <div><span>Empresa / filial</span><b>{empresa} · matriz</b></div>
            <div><span>Fornecedor</span><b>{um.nome}</b></div>
            <div><span>Documento</span><b>{um.nf ? `NF ${um.nf}` : um.codigo} · {um.parcela}</b></div>
            <div><span>Valor original</span><b>{brl(um.valor)}</b></div>
            <div><span>Saldo em aberto</span><b>{brl(um.saldo)}</b></div>
          </div>
        ) : (
          <ul className="planejar-lista">{titulos.map((t) => <li key={t.id}><div><b>{t.nome}</b><div className="pequeno mudo">{t.codigo} · vence {dataBr(t.venc)}</div></div><b className="num">{brl(t.saldo)}</b></li>)}</ul>
        )}
        <div className="grade-pag">
          <div><label>Data do pagamento</label><input type="date" name="data" defaultValue={hoje} max={hoje} required /></div>
          {um ? <>{campo('valor', 'Valor pago (R$)')}{campo('desconto', 'Desconto (R$)')}{campo('juros', 'Juros (R$)')}{campo('multa', 'Multa (R$)')}</> : <p className="pequeno mudo" style={{ gridColumn: 'span 4' }}>Em lote, cada título é quitado pelo saldo em aberto. Para desconto, juros ou multa, registre um título por vez.</p>}
        </div>
        <div><label>Valor final (saída)</label><div className="valor-final">{brl(total)}</div></div>
        <div className="abas-forma" role="tablist">
          {(Object.keys(FORMAS) as Forma[]).map((f) => <button key={f} type="button" role="tab" aria-selected={forma === f} className={forma === f ? 'ativo' : ''} onClick={() => setForma(f)}>{f}</button>)}
        </div>
        <div className="grade-forma">
          {FORMAS[forma].map(([k, rotulo]) => (
            <div key={`${forma}-${k}`}><label>{rotulo}</label>{k === 'tipoChave' ? <select name={`det_${k}`} defaultValue=""><option value="">Selecione</option>{TIPOS_CHAVE_PIX.map((x) => <option key={x}>{x}</option>)}</select> : <input name={`det_${k}`} defaultValue={k === 'favorecido' && um ? um.nome : ''} />}</div>
          ))}
        </div>
        <div className="linha" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}><label>Conta / caixa de origem</label><input name="conta" list="contas-origem" defaultValue={contaSugerida || ''} /><datalist id="contas-origem">{contas.map((c) => <option key={c} value={c} />)}</datalist></div>
          <label className="btn anexar">{arquivo ? `📎 ${arquivo}` : 'Anexar comprovante'}<input type="file" name="comprovante" accept="application/pdf,image/*" hidden onChange={(e) => setArquivo(e.target.files?.[0]?.name || '')} /></label>
        </div>
        <div><label>Observação</label><textarea name="obs" rows={3} /></div>
        <div className="linha" style={{ justifyContent: 'flex-end' }}>
          <Link href={fechar} className="btn">Cancelar</Link>
          <button className="btn primario" type="submit">Registrar pagamento</button>
        </div>
        <p className="pequeno mudo">Registra um pagamento já feito. A ZARO não envia dinheiro ao banco.</p>
      </form>
    </div>
  );
}
