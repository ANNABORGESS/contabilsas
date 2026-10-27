'use client';
// Peças comuns da administração: detalhe do pedido com cancelamento/estorno e período.
import { useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { dataHora, hora, reais } from '@/cliente/formato';
import { Aviso, ChipPedido, ChipPreparo, ChipSituacao, Modal } from '@/cliente/ui';
import { NOME_FORMA, type FormaPagamento } from '@/domain/pedido';
import type { DetalhePedido } from '@/server/pedidos';

export function Cabecalho({ titulo, sub, children }: { titulo: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="cabecalho">
      <div>
        <h1>{titulo}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="fila nao-imprimir">{children}</div>}
    </div>
  );
}

export function AvisoConfirmacaoManual() {
  return (
    <Aviso tipo="info">
      Os pagamentos são <b>confirmados manualmente pelos garçons</b> (forma informada por eles). Isso não é conciliação bancária: confira com o extrato da maquininha/adquirente no fechamento.
    </Aviso>
  );
}

export function DetalhePedidoAdmin({ id, fechar }: { id: string; fechar: () => void }) {
  const { dados, erro } = useDados<{ pedido: DetalhePedido }>(`/api/pedidos/${id}`);
  const [encerrar, setEncerrar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const p = dados?.pedido;
  const vaiSerEstorno = p?.preparos.some((x) => x.status !== 'novo' && x.status !== 'cancelado');

  async function confirmarEncerramento() {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await api<{ tipo: string }>(`/api/pedidos/${id}/cancelamento`, 'POST', { motivo });
      setMsg({ tipo: 'ok', texto: `${r.tipo === 'cancelado' ? 'Cancelamento' : 'Estorno'} registrado. Faça a devolução do valor na maquininha.` });
      setEncerrar(false);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal titulo={p ? `Pedido #${p.numero} · Mesa ${p.mesa}` : 'Pedido'} aoFechar={fechar} largura={640}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {p && (
        <>
          <div className="grade g2">
            <div>
              <div className="fraco">Pago em</div>
              <b>{dataHora(p.pagoEm)}</b> <span className="fraco">(turno {p.dataOperacional.split('-').reverse().join('/')})</span>
            </div>
            <div>
              <div className="fraco">Garçom</div>
              <b>{p.garcom}</b>
            </div>
            <div>
              <div className="fraco">Cliente</div>
              <b>{p.cliente || '—'}</b>
            </div>
            <div>
              <div className="fraco">Forma informada</div>
              <b>{NOME_FORMA[p.formaPagamento as FormaPagamento]}</b> <span className="fraco">· confirmação manual</span>
            </div>
            <div>
              <div className="fraco">Situação</div>
              {p.status === 'pago' ? <ChipSituacao s={p.situacao} /> : <ChipPedido status={p.status} />}
            </div>
          </div>
          <table className="tabela">
            <thead>
              <tr>
                <th>Item</th>
                <th>Setor</th>
                <th className="direita">Qtd.</th>
                <th className="direita">Unit.</th>
                <th className="direita">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {p.itens.map((i) => (
                <tr key={i.id}>
                  <td>{i.nome}</td>
                  <td>{i.setor === 'cozinha' ? 'Cozinha' : 'Bar'}</td>
                  <td className="direita num">{i.quantidade}</td>
                  <td className="direita num">{reais(i.precoCentavos)}</td>
                  <td className="direita num">{reais(i.subtotalCentavos)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4}>
                  <b>Total</b>
                </td>
                <td className="direita num">
                  <b>{reais(p.totalCentavos)}</b>
                </td>
              </tr>
            </tbody>
          </table>
          {p.divergenciaPreco && <Aviso tipo="alerta">Cobrado com preço diferente do cardápio da hora da confirmação (o cardápio mudou durante o atendimento). Confira.</Aviso>}
          {p.observacao && <Aviso tipo="alerta">Obs.: {p.observacao}</Aviso>}
          <div className="fila">
            {p.preparos.map((x) => (
              <ChipPreparo key={x.id} setor={x.setor} status={x.status} />
            ))}
          </div>
          {p.status !== 'pago' && (
            <Aviso tipo="erro">
              {p.status === 'cancelado' ? 'Cancelado' : 'Estornado'} em {dataHora(p.encerradoEm)} por {p.encerradoPor}. Motivo: {p.motivoEncerramento}
            </Aviso>
          )}
          {p.solicitacaoPendente && <Aviso tipo="alerta">Há uma solicitação de cancelamento pendente para este pedido.</Aviso>}
          {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
          {p.status === 'pago' && !encerrar && (
            <button className="btn contorno-perigo" onClick={() => setEncerrar(true)}>
              {vaiSerEstorno ? 'Estornar pedido' : 'Cancelar pedido'}
            </button>
          )}
          {encerrar && (
            <div className="cartao formulario">
              <b>{vaiSerEstorno ? 'Estorno (o pedido já entrou em preparo)' : 'Cancelamento (ainda não preparado)'}</b>
              <label className="campo">
                Motivo (fica registrado)
                <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </label>
              <p className="fraco">O pedido sai dos painéis. A devolução do dinheiro é feita na maquininha, pelo procedimento da adquirente.</p>
              <div className="fila">
                <button className="btn perigo" disabled={ocupado || motivo.trim().length < 5} onClick={confirmarEncerramento}>
                  Autorizar {vaiSerEstorno ? 'estorno' : 'cancelamento'}
                </button>
                <button className="btn" onClick={() => setEncerrar(false)}>
                  Voltar
                </button>
              </div>
            </div>
          )}
          <div>
            <h3 style={{ marginBottom: 10 }}>Rastreabilidade</h3>
            <ul className="linha-tempo">
              {p.linhaDoTempo.map((e) => (
                <li key={e.id}>
                  <span className="fraco">{hora(e.criadoEm)}</span> {e.descricao}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Modal>
  );
}

export function hojeLocal() {
  const d = new Date();
  if (d.getHours() < 6) d.setDate(d.getDate() - 1); // madrugada conta na noite anterior
  return iso(d);
}
export function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function somarDias(s: string, n: number) {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function Periodo({ de, ate, mudar }: { de: string; ate: string; mudar: (de: string, ate: string) => void }) {
  const h = hojeLocal();
  const atalhos: [string, string, string][] = [
    ['Hoje', h, h],
    ['Ontem', somarDias(h, -1), somarDias(h, -1)],
    ['7 dias', somarDias(h, -6), h],
    ['Mês', `${h.slice(0, 8)}01`, h],
  ];
  return (
    <div className="fila">
      {atalhos.map(([n, a, b]) => (
        <button key={n} className={`btn pequeno ${de === a && ate === b ? 'primario' : ''}`} onClick={() => mudar(a, b)}>
          {n}
        </button>
      ))}
      <input type="date" value={de} onChange={(e) => e.target.value && mudar(e.target.value, e.target.value > ate ? e.target.value : ate)} style={{ width: 150 }} />
      <span className="fraco">até</span>
      <input type="date" value={ate} min={de} onChange={(e) => e.target.value && mudar(de, e.target.value)} style={{ width: 150 }} />
    </div>
  );
}
