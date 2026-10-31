'use client';
import { useState } from 'react';
import { BuscaMesa } from '@/cliente/BuscaMesa';
import { BALCAO, filtrarMesas, nomeLocal, type FiltroMesa } from '@/domain/mesas';
import { api, useDados } from '@/cliente/api';
import { dataBr, hora, reais } from '@/cliente/formato';
import { Aviso, ChipPedido, ChipSituacao, Modal } from '@/cliente/ui';
import { NOME_FORMA, textoItem, type FormaPagamento } from '@/domain/pedido';
import type { PedidoLista } from '@/server/pedidos';
import { Cabecalho, DetalhePedidoAdmin } from '../comum';

interface MesaTurno {
  id: string;
  numero: number;
  nome: string | null;
  pedidos: number;
  totalCentavos: number;
  ultimoEm: string | null;
  clientes: string[];
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
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroMesa>('todas');
  const total = (dados?.mesas || []).reduce((a, m) => a + m.totalCentavos, 0);
  const visiveis = filtrarMesas(dados?.mesas || [], busca, filtro);
  return (
    <>
      <Cabecalho titulo="Mesas" sub={dados ? `Turno de ${dataBr(dados.data)} · ${dados.mesas.filter((m) => m.pedidos).length} mesa(s) com pedido · ${reais(total)}` : ''}>
        <button className="btn" onClick={() => setGerenciar(true)}>
          Cadastrar e editar mesas
        </button>
      </Cabecalho>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {dados && dados.mesas.length > 0 && <BuscaMesa busca={busca} setBusca={setBusca} filtro={filtro} setFiltro={setFiltro} total={dados.mesas.length} achadas={visiveis.length} />}
      <div className="mesas-grade" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {visiveis.map((m) => (
          <button key={m.id} className={`mesa ${m.pedidos ? 'ocupada' : ''} ${m.numero === BALCAO ? 'balcao' : ''}`} onClick={() => setHistorico(m)}>
            <span className="n">{nomeLocal(m.numero)}</span>
            {m.nome && m.numero !== BALCAO && <span className="fraco">{m.nome}</span>}
            {m.clientes.length > 0 && <span className="cliente-mesa">👤 {m.clientes.join(', ')}</span>}
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
      {dados && dados.mesas.length > 0 && !visiveis.length && <div className="vazio">Nenhuma mesa encontrada.</div>}
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
    <Modal titulo={`${nomeLocal(mesa.numero)} · histórico`} aoFechar={fechar} largura={720}>
      <div className="fila entre">
        <input type="date" value={data || dados?.de || ''} onChange={(e) => setData(e.target.value)} style={{ width: 170 }} />
        <b className="num">
          {pagos.length} pago(s) · {reais(pagos.reduce((a, p) => a + p.liquidoCentavos, 0))}
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
              <td>
                {p.cliente && <b>{p.cliente}: </b>}
                {p.itens.map(textoItem).join(', ')}
              </td>
              <td>{p.garcom}</td>
              <td>{NOME_FORMA[p.formaPagamento as FormaPagamento]}</td>
              <td className="direita num">{reais(p.liquidoCentavos)}</td>
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
  const [busca, setBusca] = useState('');
  async function criar(a = Number(de), b = Number(ate || de)) {
    try {
      const r = await api<{ criadas: number }>('/api/mesas', 'POST', { de: a, ate: b });
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
        <button className="btn primario" disabled={!de} onClick={() => criar()}>
          Criar
        </button>
        <button className="btn" onClick={() => criar(1, 200)}>
          Criar 1 a 200
        </button>
      </div>
      <input type="search" placeholder="🔍 Buscar mesa: número ou apelido" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ margin: '12px 0' }} />
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
          {filtrarMesas(dados?.mesas || [], busca).map((m) => (
            <tr key={m.id} className={m.ativa ? '' : 'apagado'}>
              <td>
                <b>{nomeLocal(m.numero)}</b>
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
