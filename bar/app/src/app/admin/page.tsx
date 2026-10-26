'use client';
import { useState } from 'react';
import { useDados } from '@/cliente/api';
import { hora, reais } from '@/cliente/formato';
import { Aviso, ChipPedido, ChipSituacao } from '@/cliente/ui';
import { NOME_FORMA, type FormaPagamento } from '@/domain/pedido';
import type { Resumo } from '@/domain/relatorio';
import type { PedidoLista } from '@/server/pedidos';
import { AvisoConfirmacaoManual, Cabecalho, DetalhePedidoAdmin } from './comum';

interface Visao {
  data: string;
  resumo: Resumo;
  fila: Record<'cozinha' | 'bar', { novo: number; preparando: number; pronto: number }>;
  solicitacoesPendentes: number;
}

export default function VisaoGeral() {
  const { dados: v, erro } = useDados<Visao>('/api/visao');
  const { dados: ped } = useDados<{ pedidos: PedidoLista[] }>('/api/pedidos');
  const [aberto, setAberto] = useState<string | null>(null);
  const r = v?.resumo;
  const maxForma = Math.max(1, ...(r?.porForma.map((f) => f.valorCentavos) || []));
  return (
    <>
      <Cabecalho titulo="Visão geral do turno" sub={v ? `Turno de ${v.data.split('-').reverse().join('/')} · atualiza sozinho` : 'Carregando…'} />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {v && r && (
        <div className="pilha">
          {v.solicitacoesPendentes > 0 && (
            <Aviso tipo="alerta">
              {v.solicitacoesPendentes} solicitação(ões) de cancelamento esperando sua decisão. <a href="/admin/cancelamentos">Ver agora</a>
            </Aviso>
          )}
          <div className="grade g4">
            <div className="cartao kpi">
              <span className="rotulo">Vendas líquidas</span>
              <span className="valor">{reais(r.liquidoCentavos)}</span>
              <span className="det">Bruto {reais(r.brutoCentavos)}</span>
            </div>
            <div className="cartao kpi">
              <span className="rotulo">Pedidos pagos</span>
              <span className="valor">{r.pedidos}</span>
              <span className="det">Ticket médio {reais(r.ticketMedioCentavos)}</span>
            </div>
            <div className="cartao kpi">
              <span className="rotulo">Cancelados / estornados</span>
              <span className="valor">{r.encerrados}</span>
              <span className="det">{reais(r.canceladoCentavos + r.estornadoCentavos)}</span>
            </div>
            <div className="cartao kpi">
              <span className="rotulo">Tempo médio até ficar pronto</span>
              <span className="valor">{r.tempoMedioMin.cozinha ?? '—'} / {r.tempoMedioMin.bar ?? '—'}</span>
              <span className="det">minutos · cozinha / bar</span>
            </div>
          </div>
          <div className="grade g3">
            {(['cozinha', 'bar'] as const).map((s) => (
              <div key={s} className="cartao">
                <header>
                  <h2>{s === 'cozinha' ? '🍟 Cozinha agora' : '🍺 Bar agora'}</h2>
                  <a className="btn pequeno" href={`/${s}`} target="_blank" rel="noreferrer">
                    Abrir painel ↗
                  </a>
                </header>
                <div className="fila">
                  <span className="chip st-novo">{v.fila[s].novo} novos</span>
                  <span className="chip st-preparando">{v.fila[s].preparando} em preparo</span>
                  <span className="chip st-pronto">{v.fila[s].pronto} prontos</span>
                </div>
              </div>
            ))}
            <div className="cartao">
              <header>
                <h2>Por forma de pagamento</h2>
              </header>
              <div className="barras-h">
                {r.porForma.map((f) => (
                  <div key={f.chave} className="item" style={{ gridTemplateColumns: '70px 1fr auto' }}>
                    <span>{NOME_FORMA[f.chave as FormaPagamento] || f.chave}</span>
                    <div className="barra">
                      <i style={{ width: `${(f.valorCentavos / maxForma) * 100}%` }} />
                    </div>
                    <span className="num">{reais(f.valorCentavos)}</span>
                  </div>
                ))}
                {!r.porForma.length && <span className="fraco">Sem vendas ainda.</span>}
              </div>
            </div>
          </div>
          <div className="cartao">
            <header>
              <h2>Últimos pedidos</h2>
              <a className="btn pequeno" href="/admin/vendas">
                Ver todas as vendas
              </a>
            </header>
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Hora</th>
                    <th>Mesa</th>
                    <th>Garçom</th>
                    <th>Forma</th>
                    <th className="direita">Total</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {(ped?.pedidos || []).slice(0, 12).map((p) => (
                    <tr key={p.id} className={`clicavel ${p.status !== 'pago' ? 'apagado' : ''}`} onClick={() => setAberto(p.id)}>
                      <td>
                        <b>{p.numero}</b>
                      </td>
                      <td>{hora(p.pagoEm)}</td>
                      <td>{p.mesa}</td>
                      <td>{p.garcom}</td>
                      <td>{NOME_FORMA[p.formaPagamento as FormaPagamento]}</td>
                      <td className="direita num">{reais(p.totalCentavos)}</td>
                      <td>{p.status === 'pago' ? <ChipSituacao s={p.situacao} /> : <ChipPedido status={p.status} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ped && !ped.pedidos.length && <div className="vazio">Nenhum pedido neste turno ainda.</div>}
            </div>
          </div>
          <AvisoConfirmacaoManual />
        </div>
      )}
      {aberto && <DetalhePedidoAdmin id={aberto} fechar={() => setAberto(null)} />}
    </>
  );
}
