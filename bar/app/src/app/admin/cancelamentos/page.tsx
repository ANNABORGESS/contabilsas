'use client';
import { nomeLocal } from '@/domain/mesas';
import { useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { dataHora, reais } from '@/cliente/formato';
import { Aviso } from '@/cliente/ui';
import { NOME_FORMA, type FormaPagamento } from '@/domain/pedido';
import { Cabecalho, DetalhePedidoAdmin } from '../comum';

interface Solicitacao {
  id: string;
  pedidoId: string;
  motivo: string;
  status: string;
  criadoEm: string;
  decididoEm: string | null;
  solicitante: string;
  numero: number;
  totalCentavos: number;
  formaPagamento: string;
  mesa: number;
}

export default function Cancelamentos() {
  const { dados, erro } = useDados<{ solicitacoes: Solicitacao[] }>('/api/solicitacoes');
  const [aberto, setAberto] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const pendentes = (dados?.solicitacoes || []).filter((s) => s.status === 'pendente');
  const decididas = (dados?.solicitacoes || []).filter((s) => s.status !== 'pendente');

  async function decidir(s: Solicitacao, decisao: 'aprovar' | 'recusar') {
    if (decisao === 'aprovar' && !confirm(`Autorizar o cancelamento/estorno do pedido #${s.numero} (${reais(s.totalCentavos)})? Lembre de devolver o valor na maquininha.`)) return;
    setOcupado(s.id);
    setMsg(null);
    try {
      const r = await api<{ tipo?: string }>(`/api/solicitacoes/${s.id}`, 'POST', { decisao });
      setMsg({ tipo: 'ok', texto: decisao === 'recusar' ? `Solicitação do pedido #${s.numero} recusada.` : `${r.tipo === 'estornado' ? 'Estorno' : 'Cancelamento'} do pedido #${s.numero} autorizado. Devolva ${reais(s.totalCentavos)} no ${NOME_FORMA[s.formaPagamento as FormaPagamento]}.` });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <Cabecalho titulo="Cancelamentos e estornos" sub="Garçons solicitam; só o administrador autoriza. Tudo fica registrado com motivo, data e responsável." />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="pilha">
        {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
        <div className="cartao">
          <header>
            <h2>Aguardando decisão ({pendentes.length})</h2>
          </header>
          {pendentes.map((s) => (
            <div key={s.id} className="fila entre" style={{ padding: '12px 0', borderBottom: '1px solid var(--borda)' }}>
              <div>
                <b>
                  Pedido #{s.numero} · {nomeLocal(s.mesa)} · {reais(s.totalCentavos)} ({NOME_FORMA[s.formaPagamento as FormaPagamento]})
                </b>
                <div className="mudo">
                  {s.solicitante} em {dataHora(s.criadoEm)}: “{s.motivo}”
                </div>
              </div>
              <div className="fila">
                <button className="btn pequeno" onClick={() => setAberto(s.pedidoId)}>
                  Ver pedido
                </button>
                <button className="btn pequeno" disabled={ocupado === s.id} onClick={() => decidir(s, 'recusar')}>
                  Recusar
                </button>
                <button className="btn perigo pequeno" disabled={ocupado === s.id} onClick={() => decidir(s, 'aprovar')}>
                  Autorizar
                </button>
              </div>
            </div>
          ))}
          {!pendentes.length && <div className="vazio">Nenhuma solicitação pendente.</div>}
        </div>
        <div className="cartao">
          <header>
            <h2>Decididas</h2>
          </header>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Solicitado por</th>
                  <th>Motivo</th>
                  <th>Decisão</th>
                  <th>Em</th>
                </tr>
              </thead>
              <tbody>
                {decididas.map((s) => (
                  <tr key={s.id} className="clicavel" onClick={() => setAberto(s.pedidoId)}>
                    <td>
                      #{s.numero} · {nomeLocal(s.mesa).toLowerCase()} · {reais(s.totalCentavos)}
                    </td>
                    <td>{s.solicitante}</td>
                    <td>{s.motivo}</td>
                    <td>
                      <span className={`chip ${s.status === 'aprovada' ? 'ped-cancelado' : ''}`}>{s.status === 'aprovada' ? 'Autorizada' : 'Recusada'}</span>
                    </td>
                    <td>{dataHora(s.decididoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!decididas.length && <div className="vazio">Nada por aqui ainda.</div>}
          </div>
        </div>
        <Aviso tipo="info">Para cancelar ou estornar diretamente, abra o pedido em Vendas. O estorno do dinheiro é feito na maquininha; aqui fica o registro e a autorização.</Aviso>
      </div>
      {aberto && <DetalhePedidoAdmin id={aberto} fechar={() => setAberto(null)} />}
    </>
  );
}
