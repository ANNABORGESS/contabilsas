'use client';
import { useState } from 'react';
import { useDados } from '@/cliente/api';
import { dataBr, hora, reais } from '@/cliente/formato';
import { Aviso, ChipPedido, ChipSituacao } from '@/cliente/ui';
import { NOME_FORMA, type FormaPagamento } from '@/domain/pedido';
import type { PedidoLista } from '@/server/pedidos';
import { AvisoConfirmacaoManual, Cabecalho, DetalhePedidoAdmin, Periodo } from '../comum';

export default function Vendas() {
  const [periodo, setPeriodo] = useState<{ de: string; ate: string } | null>(null);
  const [status, setStatus] = useState('');
  const [garcom, setGarcom] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const q = new URLSearchParams();
  if (periodo) {
    q.set('de', periodo.de);
    q.set('ate', periodo.ate);
  }
  if (status) q.set('status', status);
  if (garcom) q.set('garcom', garcom);
  const { dados, erro } = useDados<{ de: string; ate: string; pedidos: PedidoLista[] }>(`/api/pedidos?${q}`);
  const { dados: equipe } = useDados<{ equipe: { id: string; nome: string; papel: string }[] }>('/api/equipe');
  const de = periodo?.de || dados?.de || '';
  const ate = periodo?.ate || dados?.ate || '';
  const lista = (dados?.pedidos || []).filter((p) => !busca || String(p.numero) === busca.replace('#', '') || String(p.mesa) === busca || p.itens.some((i) => i.nome.toLowerCase().includes(busca.toLowerCase())));
  const pagos = lista.filter((p) => p.status === 'pago');
  const csv = `/api/relatorios/csv?de=${de}&ate=${ate}`;
  return (
    <>
      <Cabecalho titulo="Vendas" sub="Todos os pedidos pagos, com quem confirmou, quando e como.">
        <a className="btn" href={csv}>
          Exportar CSV (Excel)
        </a>
      </Cabecalho>
      <div className="pilha">
        <div className="cartao pilha">
          {de && <Periodo de={de} ate={ate} mudar={(a, b) => setPeriodo({ de: a, ate: b })} />}
          <div className="linha-campos">
            <label className="campo">
              Situação
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todas</option>
                <option value="pago">Pagos</option>
                <option value="cancelado">Cancelados</option>
                <option value="estornado">Estornados</option>
              </select>
            </label>
            <label className="campo">
              Garçom
              <select value={garcom} onChange={(e) => setGarcom(e.target.value)}>
                <option value="">Todos</option>
                {equipe?.equipe
                  .filter((u) => u.papel === 'garcom' || u.papel === 'admin')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
              </select>
            </label>
            <label className="campo">
              Buscar
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nº do pedido, mesa ou produto" />
            </label>
          </div>
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="cartao">
          <header>
            <h2>
              {lista.length} pedido(s){de && ` · ${dataBr(de)}${ate !== de ? ` a ${dataBr(ate)}` : ''}`}
            </h2>
            <b className="num">Pagos: {reais(pagos.reduce((a, p) => a + p.totalCentavos, 0))}</b>
          </header>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Turno</th>
                  <th>Hora</th>
                  <th>Mesa</th>
                  <th>Itens</th>
                  <th>Garçom</th>
                  <th>Forma</th>
                  <th className="direita">Total</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className={`clicavel ${p.status !== 'pago' ? 'apagado' : ''}`} onClick={() => setAberto(p.id)}>
                    <td>
                      <b>{p.numero}</b>
                    </td>
                    <td>{dataBr(p.dataOperacional)}</td>
                    <td>{hora(p.pagoEm)}</td>
                    <td>{p.mesa}</td>
                    <td style={{ maxWidth: 280 }}>{p.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}</td>
                    <td>{p.garcom}</td>
                    <td>{NOME_FORMA[p.formaPagamento as FormaPagamento]}</td>
                    <td className="direita num">
                      {reais(p.totalCentavos)}
                      {p.divergenciaPreco && <div className="chip st-preparando">preço divergente</div>}
                    </td>
                    <td>
                      {p.status === 'pago' ? <ChipSituacao s={p.situacao} /> : <ChipPedido status={p.status} />}
                      {p.solicitacaoPendente && <div className="chip st-preparando" style={{ marginTop: 4 }}>cancel. pedido</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dados && !lista.length && <div className="vazio">Nenhum pedido no período.</div>}
          </div>
        </div>
        <AvisoConfirmacaoManual />
      </div>
      {aberto && <DetalhePedidoAdmin id={aberto} fechar={() => setAberto(null)} />}
    </>
  );
}
