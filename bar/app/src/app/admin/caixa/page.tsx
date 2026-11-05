'use client';
// Fechamento de caixa do turno: o que o sistema registrou em cada forma × o dinheiro contado na
// gaveta e o relatório da maquininha. A diferença mostra se sobrou ou faltou. Fica guardado.
import { useEffect, useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { dataBr, dataHora, reais } from '@/cliente/formato';
import { Aviso, Modal } from '@/cliente/ui';
import { paraCentavos } from '@/domain/dinheiro';
import { NOME_TIPO_CAIXA, conferirCaixa, type TipoCaixa } from '@/domain/pagamento';
import { FORMAS_PAGAMENTO, NOME_FORMA, type FormaPagamento } from '@/domain/pedido';
import { Cabecalho, EstornosPendentes } from '../comum';
import { nomeLocal } from '@/domain/mesas';

interface Fechamento {
  data: string;
  trocoInicialCentavos: number;
  sistema: Record<FormaPagamento, number>;
  conferido: Partial<Record<FormaPagamento, number>>;
  observacao: string | null;
  fechadoEm: string;
  fechadoPor: string | null;
}
interface Movimento {
  id: string;
  tipo: TipoCaixa;
  valorCentavos: number;
  motivo: string | null;
  criadoEm: string;
  usuario: string | null;
}
interface MesaCaixa {
  mesa: number;
  pedidos: number;
  totalCentavos: number;
  taxaCentavos: number;
  clientes: string[];
  porForma: Record<string, number>;
}
interface Dados {
  data: string;
  porMesa: MesaCaixa[];
  hoje: string;
  /** último turno com vendas que ainda não foi fechado */
  semFechar: string | null;
  movimentos: Movimento[];
  aberto: boolean;
  fundoCentavos: number;
  estornosPendentes: import('../comum').EstornoPendente[];
  pedidos: number;
  encerrados: number;
  divididos: number;
  sistema: Record<FormaPagamento, number>;
  totalCentavos: number;
  fechamento: Fechamento | null;
  historico: Fechamento[];
}

const ONDE: Record<FormaPagamento, string> = {
  dinheiro: 'contado na gaveta',
  pix: 'extrato do Pix / maquininha',
  credito: 'relatório da maquininha',
  debito: 'relatório da maquininha',
};
const emReais = (c: number | undefined) => (c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','));
const sinal = (v: number) => (v > 0 ? `+${reais(v)}` : reais(v));

export default function Caixa() {
  const [data, setData] = useState('');
  const { dados, erro } = useDados<Dados>(`/api/caixa${data ? `?data=${data}` : ''}`);
  const [troco, setTroco] = useState('');
  const [conf, setConf] = useState<Record<string, string>>({});
  const [obs, setObs] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  // ao abrir um turno já fechado, mostra o que foi gravado
  useEffect(() => {
    const f = dados?.fechamento;
    setTroco(f ? emReais(f.trocoInicialCentavos) : '');
    setConf(f ? Object.fromEntries(FORMAS_PAGAMENTO.map((x) => [x, emReais(f.conferido[x])])) : {});
    setObs(f?.observacao ?? '');
  }, [dados?.data, dados?.fechamento?.fechadoEm]); // eslint-disable-line react-hooks/exhaustive-deps

  const conferido = Object.fromEntries(
    FORMAS_PAGAMENTO.filter((f) => (conf[f] ?? '').trim() !== '').map((f) => [f, paraCentavos(conf[f]) ?? 0]),
  ) as Partial<Record<FormaPagamento, number>>;
  const [lancando, setLancando] = useState<TipoCaixa | null>(null);
  // com abertura/sangria/suprimento lançados, o fundo da gaveta vem deles
  const trocoC = dados?.movimentos.length ? dados.fundoCentavos : (paraCentavos(troco) ?? 0);
  const r = dados ? conferirCaixa(dados.sistema, conferido, trocoC) : null;

  async function fechar() {
    setSalvando(true);
    setMsg(null);
    try {
      await api('/api/caixa', 'POST', { data: dados!.data, trocoInicialCentavos: trocoC, conferido, observacao: obs });
      setMsg({ tipo: 'ok', texto: `Caixa do turno ${dataBr(dados!.data)} fechado e guardado.` });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Cabecalho titulo="Caixa do turno" sub={dados ? `Turno de ${dataBr(dados.data)} · ${dados.pedidos} pedido(s) pago(s)${dados.divididos ? ` · ${dados.divididos} com conta dividida` : ''}` : ''}>
        <input type="date" value={data || dados?.data || ''} onChange={(e) => setData(e.target.value)} style={{ width: 170 }} />
        <button className="btn" onClick={() => window.print()}>
          Imprimir
        </button>
      </Cabecalho>
      {dados && dados.semFechar && dados.semFechar !== dados.data && (
        <div className="cartao fila entre" style={{ marginBottom: 14, borderColor: 'var(--marca)' }}>
          <span>
            {dados.pedidos === 0 ? 'Este turno ainda não tem vendas. ' : ''}O turno de <b>{dataBr(dados.semFechar)}</b> tem vendas e o caixa ainda não foi fechado.
          </span>
          <button className="btn primario" onClick={() => setData(dados.semFechar!)}>
            Abrir o turno de {dataBr(dados.semFechar)}
          </button>
        </div>
      )}
      {(erro || msg) && <Aviso tipo={msg?.tipo === 'ok' ? 'ok' : 'erro'}>{msg?.texto || erro}</Aviso>}
      {dados?.fechamento && (
        <Aviso tipo="info">
          Fechado em {dataHora(dados.fechamento.fechadoEm)} por {dados.fechamento.fechadoPor}. Você pode corrigir e gravar de novo.
        </Aviso>
      )}
      {dados && (
        <div className="cartao" style={{ marginBottom: 14 }}>
          <header>
            <h2>💵 Gaveta do turno</h2>
            <span className={`chip ${dados.aberto ? 'ped-pago' : ''}`}>{dados.aberto ? `Aberto · fundo ${reais(dados.fundoCentavos)}` : 'Caixa não aberto'}</span>
          </header>
          <div className="fila nao-imprimir" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            {!dados.aberto && (
              <button className="btn primario" onClick={() => setLancando('abertura')}>
                Abrir caixa (troco inicial)
              </button>
            )}
            <button className="btn" disabled={!dados.aberto} onClick={() => setLancando('suprimento')}>
              + Suprimento
            </button>
            <button className="btn perigo" disabled={!dados.aberto} onClick={() => setLancando('sangria')}>
              − Sangria
            </button>
          </div>
          {dados.movimentos.length > 0 ? (
            <table className="tabela">
              <tbody>
                {dados.movimentos.map((m) => (
                  <tr key={m.id}>
                    <td>{dataHora(m.criadoEm)}</td>
                    <td>
                      <b>{NOME_TIPO_CAIXA[m.tipo]}</b>
                      {m.motivo && <div className="fraco">{m.motivo}</div>}
                    </td>
                    <td className="direita num" style={{ color: m.tipo === 'sangria' ? 'var(--vermelho)' : undefined, fontWeight: 600 }}>
                      {m.tipo === 'sangria' ? `−${reais(m.valorCentavos)}` : reais(m.valorCentavos)}
                    </td>
                    <td className="fraco">{m.usuario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="fraco">Abra o caixa com o troco que está na gaveta. Sangria (retirada) e suprimento (dinheiro que entra) ficam registrados com quem fez e entram na conta do dinheiro esperado.</p>
          )}
        </div>
      )}
      {dados && dados.estornosPendentes.length > 0 && <EstornosPendentes lista={dados.estornosPendentes} aviso={setMsg} />}
      {dados && r && (
        <div className="cartao">
          {!dados.movimentos.length && (
            <div className="linha-campos nao-imprimir" style={{ marginBottom: 12 }}>
              <label className="campo">
                💵 Troco inicial na gaveta (R$)
                <input inputMode="decimal" placeholder="0,00" value={troco} onChange={(e) => setTroco(e.target.value)} />
              </label>
            </div>
          )}
          <div className="tabela-rolagem">
            <table className="tabela caixa">
              <thead>
                <tr>
                  <th>Forma</th>
                  <th className="direita">Sistema</th>
                  <th className="direita">Esperado</th>
                  <th>Conferido</th>
                  <th className="direita">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {r.linhas.map((l) => (
                  <tr key={l.forma}>
                    <td>
                      <b>{NOME_FORMA[l.forma]}</b>
                      <div className="fraco">{ONDE[l.forma]}</div>
                    </td>
                    <td className="direita num">{reais(l.sistema)}</td>
                    <td className="direita num">
                      {reais(l.esperado)}
                      {l.forma === 'dinheiro' && trocoC !== 0 && <div className="fraco">{dados.movimentos.length ? 'com troco, suprimentos e sangrias' : 'com troco'}</div>}
                    </td>
                    <td>
                      <input inputMode="decimal" placeholder="0,00" value={conf[l.forma] ?? ''} onChange={(e) => setConf({ ...conf, [l.forma]: e.target.value })} style={{ width: 120 }} />
                    </td>
                    <td className="direita num" style={{ fontWeight: 700, color: l.diferenca === null ? undefined : l.diferenca === 0 ? 'var(--verde)' : 'var(--vermelho)' }}>
                      {l.diferenca === null ? '—' : l.diferenca === 0 ? '✓ confere' : sinal(l.diferenca)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>Total</b>
                  </td>
                  <td className="direita num">
                    <b>{reais(dados.totalCentavos)}</b>
                  </td>
                  <td className="direita num">
                    <b>{reais(dados.totalCentavos + trocoC)}</b>
                  </td>
                  <td></td>
                  <td className="direita num" style={{ fontWeight: 800, color: r.conferidas === 0 ? undefined : r.diferencaTotal === 0 ? 'var(--verde)' : 'var(--vermelho)' }}>
                    {r.conferidas === 0 ? '—' : r.diferencaTotal === 0 ? '✓ confere' : sinal(r.diferencaTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <label className="campo" style={{ marginTop: 12 }}>
            Observação (opcional)
            <input value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} placeholder="ex.: faltou R$ 5 de troco, sangria de R$ 200 às 22h" />
          </label>
          <button className="btn primario grande bloco nao-imprimir" style={{ marginTop: 12 }} disabled={salvando || r.conferidas === 0} onClick={fechar}>
            {salvando ? 'Gravando…' : dados.fechamento ? 'Gravar correção do fechamento' : '✓ Fechar o caixa'}
          </button>
          <p className="fraco" style={{ marginTop: 8 }}>
            O sistema já desconta cancelamentos, estornos e itens cancelados. Conta dividida entra em cada forma pelo valor de cada parte. Até fechar, os valores são os{' '}
            <b>informados pelos garçons</b>; depois de fechado, o turno fica como <b>conferido no fechamento</b>, com o que foi contado e o relatório da maquininha.
          </p>
        </div>
      )}
      {dados && (
        <div className="cartao" style={{ marginTop: 14 }}>
          <header>
            <h2>O que cada mesa lançou no turno</h2>
            <span className="fraco">
              {dados.porMesa.length} mesa(s)/lugar(es) · {reais(dados.porMesa.reduce((a, m) => a + m.totalCentavos, 0))}
            </span>
          </header>
          {dados.porMesa.length ? (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Mesa</th>
                    <th className="direita">Pedidos</th>
                    {FORMAS_PAGAMENTO.map((f) => (
                      <th key={f} className="direita">
                        {NOME_FORMA[f]}
                      </th>
                    ))}
                    <th className="direita">10% garçom</th>
                    <th className="direita">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.porMesa.map((m) => (
                    <tr key={m.mesa}>
                      <td>
                        <b>{nomeLocal(m.mesa)}</b>
                        {m.clientes.length > 0 && <div className="fraco">{m.clientes.join(', ')}</div>}
                      </td>
                      <td className="direita num">{m.pedidos}</td>
                      {FORMAS_PAGAMENTO.map((f) => (
                        <td key={f} className="direita num">
                          {m.porForma[f] ? reais(m.porForma[f]) : '—'}
                        </td>
                      ))}
                      <td className="direita num">{m.taxaCentavos ? reais(m.taxaCentavos) : '—'}</td>
                      <td className="direita num">
                        <b>{reais(m.totalCentavos)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="vazio">Nenhuma venda neste turno ainda.</div>
          )}
          <p className="fraco" style={{ marginTop: 8 }}>
            Soma tudo o que foi pago nas mesas e no balcão neste turno (sem cancelados, estornos e itens cancelados). É o mesmo valor do “Sistema” do fechamento acima.
          </p>
        </div>
      )}
      {lancando && dados && (
        <LancarCaixa
          tipo={lancando}
          data={dados.data}
          fechar={() => setLancando(null)}
          feito={(t) => {
            setLancando(null);
            setMsg({ tipo: 'ok', texto: t });
          }}
        />
      )}
      {dados && dados.historico.length > 0 && (
        <div className="cartao nao-imprimir" style={{ marginTop: 14 }}>
          <header>
            <h2>Fechamentos anteriores</h2>
          </header>
          <table className="tabela">
            <thead>
              <tr>
                <th>Turno</th>
                <th className="direita">Sistema</th>
                <th className="direita">Diferença</th>
                <th>Quem fechou</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dados.historico.map((h) => {
                const c = conferirCaixa(h.sistema, h.conferido, h.trocoInicialCentavos);
                const total = Object.values(h.sistema).reduce((a, v) => a + v, 0);
                return (
                  <tr key={h.data} className="clicavel" onClick={() => setData(h.data)}>
                    <td>{dataBr(h.data)}</td>
                    <td className="direita num">{reais(total)}</td>
                    <td className="direita num" style={{ color: c.diferencaTotal === 0 ? 'var(--verde)' : 'var(--vermelho)', fontWeight: 700 }}>
                      {c.diferencaTotal === 0 ? '✓ confere' : sinal(c.diferencaTotal)}
                    </td>
                    <td className="fraco">
                      {h.fechadoPor} · {dataHora(h.fechadoEm)}
                    </td>
                    <td className="fraco">{h.observacao}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function LancarCaixa({ tipo, data, fechar, feito }: { tipo: TipoCaixa; data: string; fechar: () => void; feito: (t: string) => void }) {
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const c = paraCentavos(valor);
  async function enviar() {
    setIndo(true);
    setErro('');
    try {
      await api('/api/caixa/movimento', 'POST', { data, tipo, valorCentavos: c, motivo });
      feito(`${NOME_TIPO_CAIXA[tipo]} de ${reais(c ?? 0)} registrada.`);
    } catch (e) {
      setErro((e as Error).message);
      setIndo(false);
    }
  }
  return (
    <Modal titulo={NOME_TIPO_CAIXA[tipo]} aoFechar={fechar}>
      <label className="campo">
        {tipo === 'abertura' ? 'Troco que está na gaveta (R$)' : tipo === 'sangria' ? 'Quanto foi retirado (R$)' : 'Quanto entrou na gaveta (R$)'}
        <input inputMode="decimal" autoFocus placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
      </label>
      <label className="campo">
        {tipo === 'sangria' ? 'Motivo (obrigatório)' : 'Observação (opcional)'}
        <input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === 'sangria' ? 'ex.: depósito no banco, pagamento do gelo' : 'ex.: troco trazido do cofre'} />
      </label>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className={`btn grande bloco ${tipo === 'sangria' ? 'perigo' : 'primario'}`} disabled={indo || c === null || (tipo !== 'abertura' && !c) || (tipo === 'sangria' && motivo.trim().length < 3)} onClick={enviar}>
        Registrar {c ? reais(c) : ''}
      </button>
      <p className="fraco" style={{ marginTop: 8 }}>
        Fica no caixa do turno e na Auditoria, com seu nome e a hora.
      </p>
    </Modal>
  );
}

