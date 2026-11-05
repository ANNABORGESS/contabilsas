'use client';
// Fechamento de caixa do turno: o que o sistema registrou em cada forma × o dinheiro contado na
// gaveta e o relatório da maquininha. A diferença mostra se sobrou ou faltou. Fica guardado.
import { useEffect, useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { dataBr, dataHora, reais } from '@/cliente/formato';
import { Aviso } from '@/cliente/ui';
import { paraCentavos } from '@/domain/dinheiro';
import { conferirCaixa } from '@/domain/pagamento';
import { FORMAS_PAGAMENTO, NOME_FORMA, type FormaPagamento } from '@/domain/pedido';
import { Cabecalho } from '../comum';

interface Fechamento {
  data: string;
  trocoInicialCentavos: number;
  sistema: Record<FormaPagamento, number>;
  conferido: Partial<Record<FormaPagamento, number>>;
  observacao: string | null;
  fechadoEm: string;
  fechadoPor: string | null;
}
interface Dados {
  data: string;
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
  const trocoC = paraCentavos(troco) ?? 0;
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
      <Cabecalho titulo="Fechamento de caixa" sub={dados ? `Turno de ${dataBr(dados.data)} · ${dados.pedidos} pedido(s) pago(s)${dados.divididos ? ` · ${dados.divididos} com conta dividida` : ''}` : ''}>
        <input type="date" value={data || dados?.data || ''} onChange={(e) => setData(e.target.value)} style={{ width: 170 }} />
        <button className="btn" onClick={() => window.print()}>
          Imprimir
        </button>
      </Cabecalho>
      {(erro || msg) && <Aviso tipo={msg?.tipo === 'ok' ? 'ok' : 'erro'}>{msg?.texto || erro}</Aviso>}
      {dados?.fechamento && (
        <Aviso tipo="info">
          Fechado em {dataHora(dados.fechamento.fechadoEm)} por {dados.fechamento.fechadoPor}. Você pode corrigir e gravar de novo.
        </Aviso>
      )}
      {dados && r && (
        <div className="cartao">
          <div className="linha-campos nao-imprimir" style={{ marginBottom: 12 }}>
            <label className="campo">
              💵 Troco inicial na gaveta (R$)
              <input inputMode="decimal" placeholder="0,00" value={troco} onChange={(e) => setTroco(e.target.value)} />
            </label>
          </div>
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
                      {l.forma === 'dinheiro' && trocoC > 0 && <div className="fraco">com troco</div>}
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
            O sistema já desconta cancelamentos, estornos e itens cancelados. Conta dividida entra em cada forma pelo valor de cada parte. As formas são as informadas pelos garçons:
            confira com o relatório da maquininha.
          </p>
        </div>
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
