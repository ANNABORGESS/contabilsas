'use client';
import { useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { dataBr, hora, reais } from '@/cliente/formato';
import { Aviso, ChipPedido, ChipSituacao, Modal } from '@/cliente/ui';
import { NOME_FORMA, type FormaPagamento } from '@/domain/pedido';
import type { PedidoLista } from '@/server/pedidos';
import { Cabecalho, DetalhePedidoAdmin } from '../comum';

interface MesaTurno {
  id: string;
  numero: number;
  nome: string | null;
  pedidos: number;
  totalCentavos: number;
  ultimoEm: string | null;
  emPreparo: number;
  prontos: number;
}
interface Mesa {
  id: string;
  numero: number;
  nome: string | null;
  ativa: boolean;
}

export default function Mesas() {
  const { dados, erro } = useDados<{ data: string; mesas: MesaTurno[] }>('/api/mesas/turno');
  const [historico, setHistorico] = useState<MesaTurno | null>(null);
  const [gerenciar, setGerenciar] = useState(false);
  const total = (dados?.mesas || []).reduce((a, m) => a + m.totalCentavos, 0);
  return (
    <>
      <Cabecalho titulo="Mesas" sub={dados ? `Turno de ${dataBr(dados.data)} · ${dados.mesas.filter((m) => m.pedidos).length} mesa(s) com pedido · ${reais(total)}` : ''}>
        <button className="btn" onClick={() => setGerenciar(true)}>
          Cadastrar e editar mesas
        </button>
      </Cabecalho>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="mesas-grade" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {dados?.mesas.map((m) => (
          <button key={m.id} className={`mesa ${m.pedidos ? 'ocupada' : ''}`} onClick={() => setHistorico(m)}>
            <span className="n">Mesa {m.numero}</span>
            {m.nome && <span className="fraco">{m.nome}</span>}
            <span className="num" style={{ fontWeight: 700 }}>
              {m.pedidos ? reais(m.totalCentavos) : 'Sem pedidos'}
            </span>
            <span className="fraco">{m.pedidos ? `${m.pedidos} pedido(s) · último ${hora(m.ultimoEm)}` : '—'}</span>
            <span className="marcas">
              {m.emPreparo > 0 && <span className="chip st-preparando">Em andamento {m.emPreparo}</span>}
              {m.prontos > 0 && <span className="chip st-pronto">Pronto {m.prontos}</span>}
            </span>
          </button>
        ))}
      </div>
      {historico && <HistoricoMesa mesa={historico} fechar={() => setHistorico(null)} />}
      {gerenciar && <GerenciarMesas fechar={() => setGerenciar(false)} />}
    </>
  );
}

function HistoricoMesa({ mesa, fechar }: { mesa: MesaTurno; fechar: () => void }) {
  const [data, setData] = useState('');
  const { dados } = useDados<{ de: string; pedidos: PedidoLista[] }>(`/api/pedidos?mesa=${mesa.id}${data ? `&de=${data}&ate=${data}` : ''}`);
  const [aberto, setAberto] = useState<string | null>(null);
  const pagos = (dados?.pedidos || []).filter((p) => p.status === 'pago');
  return (
    <Modal titulo={`Mesa ${mesa.numero} · histórico`} aoFechar={fechar} largura={720}>
      <div className="fila entre">
        <input type="date" value={data || dados?.de || ''} onChange={(e) => setData(e.target.value)} style={{ width: 170 }} />
        <b className="num">
          {pagos.length} pago(s) · {reais(pagos.reduce((a, p) => a + p.totalCentavos, 0))}
        </b>
      </div>
      <table className="tabela">
        <thead>
          <tr>
            <th>#</th>
            <th>Hora</th>
            <th>Itens</th>
            <th>Garçom</th>
            <th>Forma</th>
            <th className="direita">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {dados?.pedidos.map((p) => (
            <tr key={p.id} className={`clicavel ${p.status !== 'pago' ? 'apagado' : ''}`} onClick={() => setAberto(p.id)}>
              <td>{p.numero}</td>
              <td>{hora(p.pagoEm)}</td>
              <td>{p.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}</td>
              <td>{p.garcom}</td>
              <td>{NOME_FORMA[p.formaPagamento as FormaPagamento]}</td>
              <td className="direita num">{reais(p.totalCentavos)}</td>
              <td>{p.status === 'pago' ? <ChipSituacao s={p.situacao} /> : <ChipPedido status={p.status} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {dados && !dados.pedidos.length && <div className="vazio">Nenhum pedido nesta data.</div>}
      {aberto && <DetalhePedidoAdmin id={aberto} fechar={() => setAberto(null)} />}
    </Modal>
  );
}

function GerenciarMesas({ fechar }: { fechar: () => void }) {
  const { dados } = useDados<{ mesas: Mesa[] }>('/api/mesas?todas=1');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  async function criar() {
    try {
      const r = await api<{ criadas: number }>('/api/mesas', 'POST', { de: Number(de), ate: Number(ate || de) });
      setMsg({ tipo: 'ok', texto: r.criadas ? `${r.criadas} mesa(s) criada(s).` : 'Essas mesas já existem.' });
      setDe('');
      setAte('');
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  }
  async function alterar(id: string, d: Partial<Mesa>) {
    try {
      await api(`/api/mesas/${id}`, 'PATCH', d);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  }
  return (
    <Modal titulo="Cadastrar e editar mesas" aoFechar={fechar} largura={620}>
      <div className="linha-campos">
        <label className="campo">
          Da mesa
          <input type="number" min={1} value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="campo">
          Até a mesa (opcional)
          <input type="number" min={1} value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
        <button className="btn primario" disabled={!de} onClick={criar}>
          Criar
        </button>
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <table className="tabela">
        <thead>
          <tr>
            <th>Mesa</th>
            <th>Apelido (opcional)</th>
            <th>Ativa</th>
          </tr>
        </thead>
        <tbody>
          {dados?.mesas.map((m) => (
            <tr key={m.id} className={m.ativa ? '' : 'apagado'}>
              <td>
                <b>{m.numero}</b>
              </td>
              <td>
                <input defaultValue={m.nome || ''} placeholder="ex.: Varanda" onBlur={(e) => e.target.value !== (m.nome || '') && alterar(m.id, { nome: e.target.value })} />
              </td>
              <td>
                <input type="checkbox" checked={m.ativa} onChange={(e) => alterar(m.id, { ativa: e.target.checked })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fraco">Mesas desativadas somem do celular do garçom, mas o histórico continua guardado.</p>
    </Modal>
  );
}
