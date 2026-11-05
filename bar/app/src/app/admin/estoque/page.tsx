'use client';
// Estoque: quanto tem de cada produto controlado. A venda baixa sozinha; aqui o administrador dá
// entrada quando chega mercadoria, ajusta depois de contar e liga ou desliga o controle.
import { useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { Aviso } from '@/cliente/ui';
import { ESTOQUE_BAIXO, situacaoEstoque } from '@/domain/estoque';
import { Cabecalho } from '../comum';

interface Produto {
  id: string;
  nome: string;
  categoria: string;
  setor: 'cozinha' | 'bar';
  ativo: boolean;
  estoque: number | null;
}

const ROTULO = { esgotado: 'Esgotado', baixo: 'Baixo', ok: 'Ok', 'sem-controle': 'Sem controle' } as const;

export default function Estoque() {
  const { dados, erro } = useDados<{ produtos: Produto[] }>('/api/cardapio?todos=1');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const produtos = dados?.produtos || [];
  const controlados = produtos.filter((p) => p.estoque !== null);
  const lista = verTodos ? produtos : controlados;
  const total = controlados.reduce((a, p) => a + Math.max(0, p.estoque || 0), 0);
  const alerta = controlados.filter((p) => (p.estoque ?? 0) <= ESTOQUE_BAIXO);

  async function mexer(p: Produto, acao: 'entrada' | 'ajustar' | 'desligar', quantidade?: number) {
    setMsg(null);
    try {
      const r = await api<{ estoque: number | null }>(`/api/estoque/${p.id}`, 'POST', { acao, quantidade });
      setMsg({ tipo: 'ok', texto: r.estoque === null ? `${p.nome}: estoque desligado.` : `${p.nome}: estoque agora ${r.estoque} un.` });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  return (
    <>
      <Cabecalho titulo="Estoque" sub="A venda baixa o estoque sozinha. O cancelamento antes de preparar devolve.">
        <button className="btn" onClick={() => setVerTodos((v) => !v)}>
          {verTodos ? 'Só os controlados' : '+ Controlar outro produto'}
        </button>
      </Cabecalho>
      {(erro || msg) && <Aviso tipo={msg?.tipo === 'ok' ? 'ok' : 'erro'}>{msg?.texto || erro}</Aviso>}
      <div className="grade g3" style={{ marginBottom: 14 }}>
        <div className="cartao kpi">
          <span className="rotulo">Total em estoque</span>
          <span className="valor">{total} un.</span>
          <span className="det">{controlados.length} produto(s) controlado(s)</span>
        </div>
        <div className="cartao kpi">
          <span className="rotulo">Baixo ou esgotado</span>
          <span className="valor" style={{ color: alerta.length ? 'var(--vermelho)' : undefined }}>
            {alerta.length}
          </span>
          <span className="det">{alerta.length ? alerta.map((p) => p.nome).join(', ') : `nenhum com ${ESTOQUE_BAIXO} ou menos`}</span>
        </div>
        <div className="cartao kpi">
          <span className="rotulo">Como funciona</span>
          <span className="det" style={{ marginTop: 6 }}>
            <b>Entrada</b>: chegou mercadoria, soma. <b>Ajustar</b>: depois de contar, grava o número certo. Esgotado não deixa vender.
          </span>
        </div>
      </div>
      <div className="cartao">
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="direita">Estoque</th>
                <th>Situação</th>
                <th>Entrada (chegou)</th>
                <th>Ajustar (contagem)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <LinhaEstoque key={p.id} p={p} mexer={mexer} />
              ))}
            </tbody>
          </table>
          {dados && !lista.length && <div className="vazio">Nenhum produto com estoque controlado. Toque em “+ Controlar outro produto”.</div>}
        </div>
      </div>
    </>
  );
}

function LinhaEstoque({ p, mexer }: { p: Produto; mexer: (p: Produto, acao: 'entrada' | 'ajustar' | 'desligar', q?: number) => Promise<void> }) {
  const [entrada, setEntrada] = useState('');
  const [ajuste, setAjuste] = useState('');
  const sit = situacaoEstoque(p.estoque);
  const n = (t: string) => Number(t.replace(/\D/g, ''));
  return (
    <tr className={p.ativo ? '' : 'apagado'}>
      <td>
        <b>{p.nome}</b>
        <div className="fraco">{p.categoria}</div>
      </td>
      <td className="direita num" style={{ fontSize: 20 }}>
        {p.estoque === null ? '—' : p.estoque}
      </td>
      <td>
        <span className={`chip estoque-${sit}`}>{ROTULO[sit]}</span>
      </td>
      <td>
        <div className="fila">
          <input inputMode="numeric" placeholder="ex.: 24" value={entrada} onChange={(e) => setEntrada(e.target.value)} style={{ width: 80 }} />
          <button
            className="btn pequeno"
            disabled={!n(entrada)}
            onClick={async () => {
              await mexer(p, 'entrada', n(entrada));
              setEntrada('');
            }}
          >
            + Somar
          </button>
        </div>
      </td>
      <td>
        <div className="fila">
          <input inputMode="numeric" placeholder={p.estoque === null ? 'começar' : String(p.estoque)} value={ajuste} onChange={(e) => setAjuste(e.target.value)} style={{ width: 80 }} />
          <button
            className="btn pequeno"
            disabled={ajuste.trim() === ''}
            onClick={async () => {
              await mexer(p, 'ajustar', n(ajuste));
              setAjuste('');
            }}
          >
            {p.estoque === null ? 'Controlar' : 'Gravar'}
          </button>
        </div>
      </td>
      <td>
        {p.estoque !== null && (
          <button className="btn fantasma pequeno" onClick={() => confirm(`Parar de controlar o estoque de ${p.nome}?`) && mexer(p, 'desligar')}>
            Parar de controlar
          </button>
        )}
      </td>
    </tr>
  );
}
