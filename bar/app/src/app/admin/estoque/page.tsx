'use client';
// Estoque de bebidas e comidas. A venda baixa sozinha e o cancelamento antes de preparar devolve.
// Aqui o administrador dá entrada (chegou), saída (perda, quebra, consumo) e grava a contagem.
// Comida pode começar sem estoque inicial: só registra e não trava a venda (a trava é opcional).
import { useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { dataHora } from '@/cliente/formato';
import { Aviso, Modal } from '@/cliente/ui';
import { ESTOQUE_BAIXO, situacaoEstoque } from '@/domain/estoque';
import { Cabecalho } from '../comum';

interface Produto {
  id: string;
  nome: string;
  categoria: string;
  setor: 'cozinha' | 'bar';
  ativo: boolean;
  estoque: number | null;
  estoqueTrava: boolean;
}
interface Movimento {
  id: string;
  tipo: 'entrada' | 'saida' | 'venda' | 'cancelamento' | 'ajuste';
  quantidade: number;
  saldo: number;
  motivo: string | null;
  criadoEm: string;
  produto: string;
  setor: string;
  usuario: string | null;
}
type Acao = 'entrada' | 'saida' | 'ajustar';

const ROTULO = { esgotado: 'Acabou', baixo: 'Baixo', ok: 'Ok', 'sem-controle': 'Sem controle' } as const;
const NOME_MOV: Record<Movimento['tipo'], string> = { entrada: 'Entrada', saida: 'Saída', venda: 'Venda', cancelamento: 'Cancelamento', ajuste: 'Contagem' };
const SETORES = [
  ['bar', '🍺 Bebidas'],
  ['cozinha', '🍟 Comidas'],
] as const;

export default function Estoque() {
  const { dados, erro } = useDados<{ produtos: Produto[] }>('/api/cardapio?todos=1');
  const movs = useDados<{ movimentos: Movimento[] }>('/api/estoque/movimentos');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [mexendo, setMexendo] = useState<{ p: Produto; acao: Acao } | null>(null);
  const [filtroMov, setFiltroMov] = useState<'' | 'bar' | 'cozinha'>('');
  const produtos = dados?.produtos || [];

  async function enviar(p: Produto, acao: string, quantidade?: number | boolean, motivo?: string) {
    setMsg(null);
    try {
      const r = await api<{ estoque: number | null }>(`/api/estoque/${p.id}`, 'POST', { acao, quantidade, motivo });
      setMsg({ tipo: 'ok', texto: r.estoque === null ? `${p.nome}: estoque desligado.` : `${p.nome}: saldo agora ${r.estoque}.` });
      void movs.recarregar();
      return true;
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
      return false;
    }
  }

  const lista = (movs.dados?.movimentos || []).filter((m) => !filtroMov || m.setor === filtroMov);

  return (
    <>
      <Cabecalho titulo="Estoque" sub="Bebidas e comidas. A venda baixa sozinha; o cancelamento antes de preparar devolve." />
      {(erro || msg) && <Aviso tipo={msg?.tipo === 'ok' ? 'ok' : 'erro'}>{msg?.texto || erro}</Aviso>}

      {SETORES.map(([setor, titulo]) => {
        const doSetor = produtos.filter((p) => p.setor === setor);
        const controlados = doSetor.filter((p) => p.estoque !== null);
        return (
          <div key={setor} className="cartao" style={{ marginBottom: 14 }}>
            <header>
              <h2>{titulo}</h2>
              <span className="fraco">
                {controlados.length} controlado(s) · {controlados.reduce((a, p) => a + Math.max(0, p.estoque || 0), 0)} un. em estoque
              </span>
            </header>
            {setor === 'cozinha' && (
              <p className="fraco" style={{ marginBottom: 8 }}>
                Comida pode começar sem estoque inicial: dê entrada quando comprar. Ela não trava a venda (o saldo pode ficar negativo); ligue “Trava” se quiser impedir a venda
                quando acabar.
              </p>
            )}
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="direita">Saldo</th>
                    <th>Situação</th>
                    <th>Movimentar</th>
                    <th>Trava a venda</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {doSetor.map((p) => {
                    const sit = situacaoEstoque(p.estoque);
                    return (
                      <tr key={p.id} className={p.ativo ? '' : 'apagado'}>
                        <td>
                          <b>{p.nome}</b>
                          <div className="fraco">{p.categoria}</div>
                        </td>
                        <td className="direita num" style={{ fontSize: 20, color: (p.estoque ?? 0) < 0 ? 'var(--vermelho)' : undefined }}>
                          {p.estoque === null ? '—' : p.estoque}
                        </td>
                        <td>
                          <span className={`chip estoque-${sit}`}>{ROTULO[sit]}</span>
                        </td>
                        <td>
                          <div className="fila" style={{ flexWrap: 'wrap', gap: 6 }}>
                            <button className="btn pequeno" onClick={() => setMexendo({ p, acao: 'entrada' })}>
                              + Entrada
                            </button>
                            <button className="btn pequeno" disabled={p.estoque === null} onClick={() => setMexendo({ p, acao: 'saida' })}>
                              − Saída
                            </button>
                            <button className="btn pequeno fantasma" onClick={() => setMexendo({ p, acao: 'ajustar' })}>
                              Contagem
                            </button>
                          </div>
                        </td>
                        <td>
                          {p.estoque !== null && (
                            <label className="fila" style={{ gap: 6 }}>
                              <input type="checkbox" checked={p.estoqueTrava} onChange={(e) => enviar(p, 'trava', e.target.checked)} />
                              <span className="fraco">{p.estoqueTrava ? 'sim' : 'não'}</span>
                            </label>
                          )}
                        </td>
                        <td>
                          {p.estoque !== null && (
                            <button className="btn fantasma pequeno" onClick={() => confirm(`Parar de controlar o estoque de ${p.nome}?`) && enviar(p, 'desligar')}>
                              Parar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {dados && !doSetor.length && <div className="vazio">Nenhum produto neste setor.</div>}
            </div>
          </div>
        );
      })}

      <div className="cartao">
        <header>
          <h2>Movimentações</h2>
          <div className="filtros-rolagem">
            {(
              [
                ['', 'Todas'],
                ['bar', 'Bebidas'],
                ['cozinha', 'Comidas'],
              ] as const
            ).map(([k, nome]) => (
              <button key={k} className={filtroMov === k ? 'ativo' : ''} onClick={() => setFiltroMov(k)}>
                {nome}
              </button>
            ))}
          </div>
        </header>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Produto</th>
                <th>Tipo</th>
                <th className="direita">Qtd.</th>
                <th className="direita">Saldo</th>
                <th>Motivo</th>
                <th>Quem</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td>{dataHora(m.criadoEm)}</td>
                  <td>{m.produto}</td>
                  <td>
                    <span className={`chip mov-${m.tipo}`}>{NOME_MOV[m.tipo]}</span>
                  </td>
                  <td className="direita num" style={{ color: m.quantidade < 0 ? 'var(--vermelho)' : 'var(--verde)', fontWeight: 600 }}>
                    {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                  </td>
                  <td className="direita num">{m.saldo}</td>
                  <td className="fraco">{m.motivo || '—'}</td>
                  <td className="fraco">{m.usuario || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movs.dados && !lista.length && <div className="vazio">Nenhuma movimentação ainda.</div>}
        </div>
      </div>
      {mexendo && <Movimentar p={mexendo.p} acao={mexendo.acao} fechar={() => setMexendo(null)} enviar={enviar} />}
    </>
  );
}

const MOTIVOS_SAIDA = ['Quebrou', 'Venceu', 'Consumo da casa', 'Cortesia', 'Erro de contagem'];

function Movimentar({ p, acao, fechar, enviar }: { p: Produto; acao: Acao; fechar: () => void; enviar: (p: Produto, acao: string, q?: number, motivo?: string) => Promise<boolean> }) {
  const [qtd, setQtd] = useState('');
  const [motivo, setMotivo] = useState('');
  const [indo, setIndo] = useState(false);
  const n = Number(qtd.replace(/\D/g, ''));
  const titulo = acao === 'entrada' ? `Entrada · ${p.nome}` : acao === 'saida' ? `Saída · ${p.nome}` : `Contagem · ${p.nome}`;
  const pode = acao === 'ajustar' ? qtd.trim() !== '' : n > 0 && (acao !== 'saida' || motivo.trim().length > 0);
  return (
    <Modal titulo={titulo} aoFechar={fechar}>
      <p className="fraco">
        Saldo atual: <b>{p.estoque === null ? 'sem controle (começa do zero)' : p.estoque}</b>
        {acao === 'ajustar' && ' · grave o número que você contou'}
      </p>
      <label className="campo">
        {acao === 'entrada' ? 'Quantas unidades chegaram?' : acao === 'saida' ? 'Quantas unidades saíram?' : 'Quantas unidades tem agora?'}
        <input inputMode="numeric" autoFocus value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder={acao === 'entrada' ? 'ex.: 24' : 'ex.: 2'} />
      </label>
      {acao === 'saida' && (
        <div className="filtros-rolagem" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
          {MOTIVOS_SAIDA.map((m) => (
            <button key={m} type="button" className={motivo === m ? 'ativo' : ''} onClick={() => setMotivo(m)}>
              {m}
            </button>
          ))}
        </div>
      )}
      <label className="campo">
        {acao === 'saida' ? 'Motivo (obrigatório)' : 'Observação (opcional)'}
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} placeholder={acao === 'entrada' ? 'ex.: nota do fornecedor, compra no mercado' : acao === 'saida' ? 'ex.: quebrou 2 garrafas' : 'ex.: contagem de sexta'} />
      </label>
      {acao === 'entrada' && p.estoque === null && p.setor === 'cozinha' && <Aviso tipo="info">Começa o controle do zero e não trava a venda. Você pode ligar a trava depois.</Aviso>}
      {acao === 'saida' && p.estoque !== null && n > p.estoque && <Aviso tipo="alerta">É mais do que o saldo ({p.estoque}): o saldo vai ficar negativo.</Aviso>}
      <button
        className={`btn grande bloco ${acao === 'saida' ? 'perigo' : 'primario'}`}
        disabled={!pode || indo}
        onClick={async () => {
          setIndo(true);
          if (await enviar(p, acao, n, motivo)) fechar();
          else setIndo(false);
        }}
      >
        {acao === 'entrada' ? `Somar ${n || ''} un.` : acao === 'saida' ? `Tirar ${n || ''} un.` : `Gravar ${qtd || ''}`}
      </button>
      <p className="fraco" style={{ marginTop: 8 }}>
        Fica no histórico de movimentações e na Auditoria. Abaixo de {ESTOQUE_BAIXO} aparece como baixo.
      </p>
    </Modal>
  );
}
