'use client';
import { useState } from 'react';
import { useDados } from '@/cliente/api';
import { dataHora } from '@/cliente/formato';
import { Aviso } from '@/cliente/ui';
import { Cabecalho, DetalhePedidoAdmin } from '../comum';

interface Evento {
  id: number;
  tipo: string;
  descricao: string;
  criadoEm: string;
  pedidoId: string | null;
  usuario: string | null;
}

export default function Auditoria() {
  const { dados, erro } = useDados<{ eventos: Evento[] }>('/api/eventos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const lista = (dados?.eventos || []).filter((e) => !busca || e.descricao.toLowerCase().includes(busca.toLowerCase()));
  return (
    <>
      <Cabecalho titulo="Auditoria" sub="Os últimos 300 acontecimentos: pagamentos confirmados, preparo, entregas, cancelamentos, cardápio, equipe e acessos." />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="cartao pilha">
        <input placeholder="Filtrar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>O quê</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className={e.pedidoId ? 'clicavel' : ''} onClick={() => e.pedidoId && setAberto(e.pedidoId)}>
                  <td style={{ whiteSpace: 'nowrap' }}>{dataHora(e.criadoEm)}</td>
                  <td>{e.usuario || '—'}</td>
                  <td>{e.descricao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {aberto && <DetalhePedidoAdmin id={aberto} fechar={() => setAberto(null)} />}
    </>
  );
}
