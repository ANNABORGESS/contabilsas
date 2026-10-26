'use client';
// Celular do garçom. O pedido só é gravado quando o garçom toca em "Pagamento confirmado",
// depois de a maquininha aprovar. Até lá ele fica só neste aparelho (rascunho). A chave do
// envio fica guardada: se a rede cair e o garçom tentar de novo, o pedido não é duplicado.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, bipar, liberarSom, novaChave, useDados } from '@/cliente/api';
import { decorrido, hora, reais } from '@/cliente/formato';
import { Aviso, BotaoSair, ChipPedido, ChipPreparo, ChipSituacao, Conexao, Modal, useAgora } from '@/cliente/ui';
import { FORMAS_PAGAMENTO, NOME_FORMA, NOME_SETOR, type FormaPagamento, type Setor } from '@/domain/pedido';
import type { DetalhePedido, PedidoLista } from '@/server/pedidos';

interface Produto {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  setor: Setor;
  precoCentavos: number;
}
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
interface Pronto {
  id: string;
  setor: Setor;
  prontoEm: string;
  pedidoId: string;
  numero: number;
  mesa: number;
  garcomId: string;
}
interface Previa {
  mesa: { id: string; numero: number };
  linhas: { produtoId: string; nome: string; setor: Setor; quantidade: number; precoCentavos: number; subtotalCentavos: number }[];
  totalCentavos: number;
  setores: Setor[];
}
interface Tentativa {
  mesaId: string;
  chave: string;
  previa: Previa;
  forma: FormaPagamento | null;
  observacao: string;
}

type Carrinhos = Record<string, Record<string, number>>;
type Tela = { t: 'inicio' } | { t: 'pedido'; mesaId: string } | { t: 'pagamento' } | { t: 'enviado'; pedido: DetalhePedido; duplicado: boolean };
type Aba = 'mesas' | 'pedidos' | 'prontos';

const ler = <T,>(k: string, padrao: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
};
const gravar = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

export default function AppGarcom({ usuario }: { usuario: { id: string; nome: string; papel: string } }) {
  const [tela, setTela] = useState<Tela>({ t: 'inicio' });
  const [aba, setAba] = useState<Aba>('mesas');
  const [carrinhos, setCarrinhos] = useState<Carrinhos>({});
  const [tentativa, setTentativa] = useState<Tentativa | null>(null);
  const [toast, setToast] = useState<{ texto: string; pedidoId?: string } | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  // rascunhos e tentativa de pagamento sobrevivem a recarregar a página
  useEffect(() => {
    setCarrinhos(ler('bar:carrinhos', {}));
    const t = ler<Tentativa | null>('bar:tentativa', null);
    if (t) {
      setTentativa(t);
      setTela({ t: 'pagamento' });
    }
    setPronto(true);
  }, []);
  useEffect(() => {
    if (pronto) gravar('bar:carrinhos', carrinhos);
  }, [carrinhos, pronto]);
  useEffect(() => {
    if (pronto) gravar('bar:tentativa', tentativa);
  }, [tentativa, pronto]);

  const cardapio = useDados<{ produtos: Produto[] }>('/api/cardapio');
  const mesas = useDados<{ data: string; mesas: MesaTurno[] }>('/api/mesas/turno');
  const prontos = useDados<{ prontos: Pronto[] }>('/api/prontos');

  // aviso quando um pedido do garçom fica pronto
  const vistos = useRef<Set<string> | null>(null);
  useEffect(() => {
    const lista = prontos.dados?.prontos;
    if (!lista) return;
    if (!vistos.current) {
      vistos.current = new Set(lista.map((p) => p.id));
      return;
    }
    const novos = lista.filter((p) => !vistos.current!.has(p.id));
    novos.forEach((p) => vistos.current!.add(p.id));
    const meus = novos.filter((p) => p.garcomId === usuario.id);
    if (meus.length) {
      const p = meus[0];
      setToast({ texto: `✅ Mesa ${p.mesa}: ${p.setor === 'cozinha' ? 'petiscos' : 'bebidas'} do pedido #${p.numero} prontos${meus.length > 1 ? ` (+${meus.length - 1})` : ''}`, pedidoId: p.pedidoId });
      bipar(3);
    }
  }, [prontos.dados, usuario.id]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const meusProntos = (prontos.dados?.prontos || []).filter((p) => p.garcomId === usuario.id).length;
  const mesaPorId = useMemo(() => new Map((mesas.dados?.mesas || []).map((m) => [m.id, m])), [mesas.dados]);

  const definirQtd = useCallback((mesaId: string, produtoId: string, qtd: number) => {
    setCarrinhos((c) => {
      const da = { ...(c[mesaId] || {}) };
      if (qtd <= 0) delete da[produtoId];
      else da[produtoId] = Math.min(qtd, 99);
      const novo = { ...c, [mesaId]: da };
      if (!Object.keys(da).length) delete novo[mesaId];
      return novo;
    });
  }, []);

  async function irParaPagamento(mesaId: string) {
    const itens = Object.entries(carrinhos[mesaId] || {}).map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
    const previa = await api<Previa>('/api/pedidos/previa', 'POST', { mesaId, itens });
    setTentativa({ mesaId, chave: novaChave(), previa, forma: null, observacao: '' });
    setTela({ t: 'pagamento' });
  }

  function aposEnvio(pedido: DetalhePedido, duplicado: boolean) {
    if (tentativa) setCarrinhos((c) => {
      const n = { ...c };
      delete n[tentativa.mesaId];
      return n;
    });
    setTentativa(null);
    setTela({ t: 'enviado', pedido, duplicado });
  }

  function desistirDoPagamento() {
    const mesaId = tentativa?.mesaId;
    setTentativa(null);
    setTela(mesaId ? { t: 'pedido', mesaId } : { t: 'inicio' });
  }

  // ---------- telas de fluxo (sem abas embaixo) ----------
  if (tela.t === 'pedido') {
    const mesa = mesaPorId.get(tela.mesaId);
    return (
      <div className="tema-escuro" onPointerDown={liberarSom}>
        <TelaProdutos
          mesaNumero={mesa?.numero}
          mesaInfo={mesa}
          produtos={cardapio.dados?.produtos || []}
          carregando={cardapio.carregando}
          carrinho={carrinhos[tela.mesaId] || {}}
          definir={(p, q) => definirQtd(tela.mesaId, p, q)}
          limpar={() => setCarrinhos((c) => {
            const n = { ...c };
            delete n[tela.mesaId];
            return n;
          })}
          voltar={() => setTela({ t: 'inicio' })}
          cobrar={() => irParaPagamento(tela.mesaId)}
          abrirHistorico={() => setDetalhe(`mesa:${tela.mesaId}`)}
        />
        {detalhe && <Detalhes chave={detalhe} fechar={() => setDetalhe(null)} abrir={setDetalhe} usuarioId={usuario.id} />}
      </div>
    );
  }
  if (tela.t === 'pagamento' && tentativa) {
    return (
      <div className="tema-escuro" onPointerDown={liberarSom}>
        <TelaPagamento tentativa={tentativa} atualizar={setTentativa} voltar={desistirDoPagamento} enviado={aposEnvio} />
      </div>
    );
  }
  if (tela.t === 'enviado') {
    const p = tela.pedido;
    return (
      <div className="tema-escuro">
        <div className="app-garcom">
          <div className="corpo-garcom">
            <div className="sucesso-envio">
              <div className="icone">✓</div>
              <h1>Pedido #{p.numero} registrado</h1>
              <p className="mudo">
                Mesa {p.mesa} · {reais(p.totalCentavos)} · {NOME_FORMA[p.formaPagamento as FormaPagamento]}
              </p>
              {tela.duplicado && <Aviso tipo="info">Este pagamento já estava registrado. Nenhum pedido novo foi criado.</Aviso>}
              <div className="fila" style={{ justifyContent: 'center' }}>
                {p.preparos.map((x) => (
                  <span key={x.id} className="chip st-novo">
                    Enviado para {NOME_SETOR[x.setor as Setor]}
                  </span>
                ))}
              </div>
              <p className="fraco">Você será avisado aqui quando ficar pronto.</p>
            </div>
            <button className="btn primario grande bloco" onClick={() => setTela({ t: 'pedido', mesaId: p.mesaId })}>
              Novo pedido na mesa {p.mesa}
            </button>
            <button className="btn grande bloco" onClick={() => setTela({ t: 'inicio' })}>
              Voltar às mesas
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- tela inicial com abas ----------
  return (
    <div className="tema-escuro" onPointerDown={liberarSom}>
      <div className="app-garcom">
        <header className="topo-garcom">
          <div>
            <div style={{ fontWeight: 800 }}>{aba === 'mesas' ? 'Mesas' : aba === 'pedidos' ? 'Pedidos do turno' : 'Prontos para entregar'}</div>
            <div className="fraco">{usuario.nome}</div>
          </div>
          <div className="fila">
            <Conexao />
            {usuario.papel === 'admin' && (
              <a className="btn fantasma pequeno" href="/admin">
                Admin
              </a>
            )}
            <BotaoSair />
          </div>
        </header>
        <main className="corpo-garcom">
          {aba === 'mesas' && (
            <>
              {mesas.erro && <Aviso tipo="erro">{mesas.erro}</Aviso>}
              <div className="mesas-grade" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {(mesas.dados?.mesas || []).map((m) => {
                  const rascunho = Object.values(carrinhos[m.id] || {}).reduce((a, b) => a + b, 0);
                  return (
                    <button key={m.id} className={`mesa ${m.pedidos ? 'ocupada' : ''}`} onClick={() => setTela({ t: 'pedido', mesaId: m.id })}>
                      <span className="n">Mesa {m.numero}</span>
                      {m.nome && <span className="fraco">{m.nome}</span>}
                      <span className="fraco num">{m.pedidos ? `${m.pedidos} pedido${m.pedidos > 1 ? 's' : ''} · ${reais(m.totalCentavos)}` : 'Livre'}</span>
                      <span className="marcas">
                        {rascunho > 0 && <span className="chip" style={{ color: 'var(--marca)' }}>Rascunho: {rascunho}</span>}
                        {m.emPreparo > 0 && <span className="chip st-preparando">Em andamento {m.emPreparo}</span>}
                        {m.prontos > 0 && <span className="chip st-pronto">Pronto {m.prontos}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              {mesas.dados && !mesas.dados.mesas.length && <div className="vazio">Nenhuma mesa ativa. Peça ao administrador para cadastrar.</div>}
            </>
          )}
          {aba === 'pedidos' && <ListaPedidos usuarioId={usuario.id} abrir={(id) => setDetalhe(id)} />}
          {aba === 'prontos' && <ListaProntos prontos={prontos.dados?.prontos || []} usuarioId={usuario.id} abrir={(id) => setDetalhe(id)} />}
        </main>
        <nav className="abas-baixo">
          <div>
            <button className={aba === 'mesas' ? 'ativo' : ''} onClick={() => setAba('mesas')}>
              <span className="ic">▦</span>Mesas
            </button>
            <button className={aba === 'pedidos' ? 'ativo' : ''} onClick={() => setAba('pedidos')}>
              <span className="ic">☰</span>Pedidos
            </button>
            <button className={aba === 'prontos' ? 'ativo' : ''} onClick={() => setAba('prontos')}>
              <span className="ic">🔔</span>Prontos
              {meusProntos > 0 && <span className="selo">{meusProntos}</span>}
            </button>
          </div>
        </nav>
      </div>
      {toast && (
        <div
          className="toast"
          role="status"
          onClick={() => {
            if (toast.pedidoId) setDetalhe(toast.pedidoId);
            setToast(null);
          }}
        >
          {toast.texto}
        </div>
      )}
      {detalhe && <Detalhes chave={detalhe} fechar={() => setDetalhe(null)} abrir={setDetalhe} usuarioId={usuario.id} />}
    </div>
  );
}

// ---------- produtos e quantidades ----------

function TelaProdutos(props: {
  mesaNumero?: number;
  mesaInfo?: MesaTurno;
  produtos: Produto[];
  carregando: boolean;
  carrinho: Record<string, number>;
  definir: (produtoId: string, qtd: number) => void;
  limpar: () => void;
  voltar: () => void;
  cobrar: () => Promise<void>;
  abrirHistorico: () => void;
}) {
  const { produtos, carrinho, definir } = props;
  const [filtro, setFiltro] = useState<string>('todos');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const categorias = useMemo(() => [...new Set(produtos.map((p) => p.categoria))], [produtos]);
  const visiveis = produtos.filter((p) => {
    if (filtro === 'escolhidos') return (carrinho[p.id] || 0) > 0;
    if (filtro === 'cozinha' || filtro === 'bar') {
      if (p.setor !== filtro) return false;
    } else if (filtro !== 'todos' && p.categoria !== filtro) return false;
    return !busca || p.nome.toLowerCase().includes(busca.toLowerCase());
  });
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const itens = Object.entries(carrinho).filter(([id]) => porId.has(id));
  const qtdTotal = itens.reduce((a, [, q]) => a + q, 0);
  const total = itens.reduce((a, [id, q]) => a + porId.get(id)!.precoCentavos * q, 0);

  async function cobrar() {
    setIndo(true);
    setErro('');
    try {
      await props.cobrar();
    } catch (e) {
      setErro((e as Error).message);
      setIndo(false);
    }
  }

  return (
    <div className="app-garcom">
      <header className="topo-garcom">
        <div className="fila" style={{ gap: 4 }}>
          <button className="voltar" onClick={props.voltar} aria-label="Voltar">
            ‹
          </button>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Mesa {props.mesaNumero ?? '…'}</div>
            <div className="fraco">{props.mesaInfo?.pedidos ? `${props.mesaInfo.pedidos} pedido(s) pago(s) no turno` : 'Novo pedido'}</div>
          </div>
        </div>
        <div className="fila">
          {!!props.mesaInfo?.pedidos && (
            <button className="btn pequeno" onClick={props.abrirHistorico}>
              Histórico
            </button>
          )}
          {qtdTotal > 0 && (
            <button className="btn fantasma pequeno" onClick={props.limpar}>
              Limpar
            </button>
          )}
        </div>
      </header>
      <main className="corpo-garcom">
        <input type="search" placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="filtros-rolagem">
          {[
            ['todos', 'Todos'],
            ['cozinha', '🍟 Petiscos'],
            ['bar', '🍺 Bebidas'],
            ...(qtdTotal ? [['escolhidos', `✓ Escolhidos (${qtdTotal})`]] : []),
            ...categorias.map((c) => [c, c]),
          ].map(([k, nome]) => (
            <button key={k} className={filtro === k ? 'ativo' : ''} onClick={() => setFiltro(k)}>
              {nome}
            </button>
          ))}
        </div>
        {props.carregando && <div className="vazio">Carregando cardápio…</div>}
        {visiveis.map((p) => {
          const q = carrinho[p.id] || 0;
          return (
            <div key={p.id} className={`produto ${q ? 'escolhido' : ''}`}>
              <div className="info" onClick={() => definir(p.id, q + 1)}>
                <div className="nome">{p.nome}</div>
                <div className="preco">
                  {reais(p.precoCentavos)} · {p.setor === 'cozinha' ? 'Cozinha' : 'Bar'}
                </div>
                {p.descricao && <div className="fraco">{p.descricao}</div>}
              </div>
              <div className="qtd">
                {q > 0 && (
                  <>
                    <button onClick={() => definir(p.id, q - 1)} aria-label={`Tirar um ${p.nome}`}>
                      −
                    </button>
                    <span>{q}</span>
                  </>
                )}
                <button className="mais" onClick={() => definir(p.id, q + 1)} aria-label={`Adicionar ${p.nome}`}>
                  +
                </button>
              </div>
            </div>
          );
        })}
        {!props.carregando && !visiveis.length && <div className="vazio">Nenhum produto aqui.</div>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </main>
      <div className="barra-acao">
        <div>
          <div style={{ flex: 1 }}>
            <div className="fraco">{qtdTotal ? `${qtdTotal} ${qtdTotal > 1 ? 'itens' : 'item'}` : 'Nenhum item'}</div>
            <div style={{ fontSize: 24, fontWeight: 900 }} className="num">
              {reais(total)}
            </div>
          </div>
          <button className="btn primario grande" disabled={!qtdTotal || indo} onClick={cobrar}>
            {indo ? 'Conferindo…' : 'Cobrar →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- pagamento na maquininha ----------

function TelaPagamento({ tentativa, atualizar, voltar, enviado }: { tentativa: Tentativa; atualizar: (t: Tentativa) => void; voltar: () => void; enviado: (p: DetalhePedido, dup: boolean) => void }) {
  const { previa, forma } = tentativa;
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [falhouRede, setFalhouRede] = useState(false);
  const travado = useRef(false);

  async function enviar() {
    if (travado.current || !forma) return; // impede toque duplo
    travado.current = true;
    setEnviando(true);
    setErro('');
    try {
      const r = await api<{ pedido: DetalhePedido; duplicado: boolean }>('/api/pedidos', 'POST', {
        chave: tentativa.chave,
        mesaId: tentativa.mesaId,
        itens: previa.linhas.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade })),
        formaPagamento: forma,
        totalCobradoCentavos: previa.totalCentavos,
        precosCobrados: previa.linhas.map((l) => ({ produtoId: l.produtoId, precoCentavos: l.precoCentavos })),
        observacao: tentativa.observacao,
      });
      enviado(r.pedido, r.duplicado);
    } catch (e) {
      const st = (e as { status?: number }).status;
      setFalhouRede(st === 0 || (st !== undefined && st >= 500));
      setErro((e as Error).message);
      setConfirmar(false);
    } finally {
      travado.current = false;
      setEnviando(false);
    }
  }

  return (
    <div className="app-garcom">
      <header className="topo-garcom">
        <div className="fila" style={{ gap: 4 }}>
          <button className="voltar" onClick={voltar} aria-label="Voltar" disabled={enviando}>
            ‹
          </button>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Mesa {previa.mesa.numero} · Pagamento</div>
            <div className="fraco">Receba na maquininha e confirme aqui</div>
          </div>
        </div>
        <Conexao />
      </header>
      <main className="corpo-garcom">
        <div className="cartao" style={{ textAlign: 'center' }}>
          <div className="mudo" style={{ fontWeight: 700 }}>
            Cobrar na maquininha
          </div>
          <div className="total-grande">{reais(previa.totalCentavos)}</div>
        </div>
        <div className="cartao resumo-itens">
          {previa.linhas.map((l) => (
            <div key={l.produtoId}>
              <span>
                <b>{l.quantidade}×</b> {l.nome} <span className="fraco">· {NOME_SETOR[l.setor]}</span>
              </span>
              <span className="num">{reais(l.subtotalCentavos)}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="mudo" style={{ fontWeight: 700, marginBottom: 8 }}>
            Forma de pagamento informada
          </div>
          <div className="formas">
            {FORMAS_PAGAMENTO.map((f) => (
              <button key={f} className={forma === f ? 'ativo' : ''} onClick={() => atualizar({ ...tentativa, forma: f })} disabled={enviando}>
                {NOME_FORMA[f]}
              </button>
            ))}
          </div>
        </div>
        <label className="campo">
          Observação para o preparo (opcional)
          <input value={tentativa.observacao} maxLength={300} placeholder="ex.: sem cebola, copo com gelo" onChange={(e) => atualizar({ ...tentativa, observacao: e.target.value })} disabled={enviando} />
        </label>
        {erro && (
          <Aviso tipo="erro">
            {erro}
            {falhouRede && <div style={{ marginTop: 6, color: 'var(--texto)' }}>Pode tentar de novo com segurança: o mesmo pagamento não vira dois pedidos.</div>}
          </Aviso>
        )}
        <Aviso tipo="info">O pedido só vai para a cozinha e o bar depois que você confirmar o pagamento aprovado.</Aviso>
      </main>
      <div className="barra-acao">
        <div>
          <button className="btn sucesso grande bloco" disabled={!forma || enviando} onClick={() => setConfirmar(true)}>
            {enviando ? 'Registrando…' : falhouRede ? 'Tentar de novo' : 'Pagamento confirmado'}
          </button>
        </div>
      </div>
      {confirmar && forma && (
        <Modal titulo="A maquininha aprovou?" aoFechar={() => !enviando && setConfirmar(false)}>
          <p style={{ fontSize: 17 }}>
            Confirme que o pagamento de <b>{reais(previa.totalCentavos)}</b> no <b>{NOME_FORMA[forma]}</b> foi aprovado para a mesa <b>{previa.mesa.numero}</b>.
          </p>
          <p className="fraco">Registro manual seu, com data e hora. Não é conferência com o banco ou a adquirente.</p>
          <button className="btn sucesso grande bloco" disabled={enviando} onClick={enviar}>
            {enviando ? 'Registrando…' : 'Sim, pagamento aprovado'}
          </button>
          <button className="btn grande bloco" disabled={enviando} onClick={() => setConfirmar(false)}>
            Ainda não
          </button>
        </Modal>
      )}
    </div>
  );
}

// ---------- pedidos e prontos ----------

function ListaPedidos({ usuarioId, abrir }: { usuarioId: string; abrir: (id: string) => void }) {
  const [todos, setTodos] = useState(false);
  const { dados, erro } = useDados<{ pedidos: PedidoLista[] }>(`/api/pedidos${todos ? '' : '?meus=1'}`);
  const agora = useAgora();
  return (
    <>
      <div className="filtros-rolagem">
        <button className={!todos ? 'ativo' : ''} onClick={() => setTodos(false)}>
          Meus pedidos
        </button>
        <button className={todos ? 'ativo' : ''} onClick={() => setTodos(true)}>
          Todos do turno
        </button>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {dados?.pedidos.map((p) => (
        <button key={p.id} className="pedido-cartao" onClick={() => abrir(p.id)}>
          <div className="fila entre">
            <b>
              #{p.numero} · Mesa {p.mesa}
            </b>
            {p.status === 'pago' ? <ChipSituacao s={p.situacao} /> : <ChipPedido status={p.status} />}
          </div>
          <div className="fraco">
            {hora(p.pagoEm)} ({decorrido(p.pagoEm, agora)}) · {reais(p.totalCentavos)} · {NOME_FORMA[p.formaPagamento as FormaPagamento]}
            {p.garcomId !== usuarioId && ` · ${p.garcom}`}
          </div>
          <div className="fila">
            {p.status === 'pago' && p.preparos.map((x) => <ChipPreparo key={x.id} setor={x.setor} status={x.status} />)}
            {p.solicitacaoPendente && <span className="chip st-preparando">Cancelamento solicitado</span>}
          </div>
        </button>
      ))}
      {dados && !dados.pedidos.length && <div className="vazio">Nenhum pedido neste turno ainda.</div>}
    </>
  );
}

function ListaProntos({ prontos, usuarioId, abrir }: { prontos: Pronto[]; usuarioId: string; abrir: (id: string) => void }) {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const agora = useAgora();
  const ordenados = [...prontos].sort((a, b) => Number(b.garcomId === usuarioId) - Number(a.garcomId === usuarioId));
  async function entregar(id: string) {
    setEnviando(id);
    setErro('');
    try {
      await api(`/api/preparos/${id}`, 'PATCH', { status: 'entregue' });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(null);
    }
  }
  return (
    <>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ordenados.map((p) => (
        <div key={p.id} className={`pedido-cartao ${p.garcomId === usuarioId ? 'destaque' : ''}`}>
          <div className="fila entre" onClick={() => abrir(p.pedidoId)}>
            <b style={{ fontSize: 18 }}>
              Mesa {p.mesa} · {p.setor === 'cozinha' ? '🍟 Petiscos' : '🍺 Bebidas'}
            </b>
            <span className="fraco">#{p.numero}</span>
          </div>
          <div className="fraco">
            Pronto {decorrido(p.prontoEm, agora)}
            {p.garcomId !== usuarioId && ' · pedido de outro garçom'}
          </div>
          <button className="btn sucesso bloco" disabled={enviando === p.id} onClick={() => entregar(p.id)}>
            {enviando === p.id ? 'Registrando…' : 'Entreguei na mesa'}
          </button>
        </div>
      ))}
      {!prontos.length && <div className="vazio">Nada pronto esperando entrega. Você será avisado aqui.</div>}
    </>
  );
}

/** Detalhe de um pedido (id) ou histórico de uma mesa ("mesa:<id>"). */
function Detalhes({ chave, fechar, abrir, usuarioId }: { chave: string; fechar: () => void; abrir: (id: string) => void; usuarioId: string }) {
  if (chave.startsWith('mesa:')) return <HistoricoMesa mesaId={chave.slice(5)} fechar={fechar} abrir={abrir} />;
  return <DetalhePedidoModal id={chave} fechar={fechar} usuarioId={usuarioId} />;
}

function HistoricoMesa({ mesaId, fechar, abrir }: { mesaId: string; fechar: () => void; abrir: (id: string) => void }) {
  const { dados } = useDados<{ pedidos: PedidoLista[] }>(`/api/pedidos?mesa=${mesaId}`);
  const pagos = (dados?.pedidos || []).filter((p) => p.status === 'pago');
  return (
    <Modal titulo={`Mesa ${dados?.pedidos[0]?.mesa ?? ''} · pedidos do turno`} aoFechar={fechar}>
      <div className="fila entre">
        <span className="mudo">{pagos.length} pedido(s) pago(s)</span>
        <b className="num">{reais(pagos.reduce((a, p) => a + p.totalCentavos, 0))}</b>
      </div>
      {dados?.pedidos.map((p) => (
        <button key={p.id} className="pedido-cartao" onClick={() => abrir(p.id)}>
          <div className="fila entre">
            <b>
              #{p.numero} · {hora(p.pagoEm)}
            </b>
            {p.status === 'pago' ? <ChipSituacao s={p.situacao} /> : <ChipPedido status={p.status} />}
          </div>
          <div className="fraco">{p.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}</div>
          <div className="fraco">
            {reais(p.totalCentavos)} · {NOME_FORMA[p.formaPagamento as FormaPagamento]} · {p.garcom}
          </div>
        </button>
      ))}
    </Modal>
  );
}

function DetalhePedidoModal({ id, fechar, usuarioId }: { id: string; fechar: () => void; usuarioId: string }) {
  const { dados, erro } = useDados<{ pedido: DetalhePedido }>(`/api/pedidos/${id}`);
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const p = dados?.pedido;

  async function entregar(preparoId: string) {
    setOcupado(true);
    try {
      await api(`/api/preparos/${preparoId}`, 'PATCH', { status: 'entregue' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }
  async function pedirCancelamento() {
    setOcupado(true);
    try {
      const r = await api<{ feito: boolean }>(`/api/pedidos/${id}/cancelamento`, 'POST', { motivo });
      setMsg({ tipo: 'ok', texto: r.feito ? 'Pedido cancelado. Devolva o valor na maquininha.' : 'Solicitação enviada ao administrador.' });
      setCancelar(false);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal titulo={p ? `Pedido #${p.numero} · Mesa ${p.mesa}` : 'Pedido'} aoFechar={fechar}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {p && (
        <>
          <div className="fila entre">
            <span className="mudo">
              {hora(p.pagoEm)} · {NOME_FORMA[p.formaPagamento as FormaPagamento]} · {p.garcom}
              {p.garcomId === usuarioId && ' (você)'}
            </span>
            {p.status === 'pago' ? <ChipSituacao s={p.situacao} /> : <ChipPedido status={p.status} />}
          </div>
          <div className="resumo-itens">
            {p.itens.map((i) => (
              <div key={i.id}>
                <span>
                  <b>{i.quantidade}×</b> {i.nome}
                </span>
                <span className="num">{reais(i.subtotalCentavos)}</span>
              </div>
            ))}
            <div style={{ fontWeight: 800, borderTop: '1px solid var(--borda)', paddingTop: 6 }}>
              <span>Total pago</span>
              <span className="num">{reais(p.totalCentavos)}</span>
            </div>
          </div>
          {p.observacao && <Aviso tipo="alerta">Obs.: {p.observacao}</Aviso>}
          {p.status === 'pago' &&
            p.preparos.map((x) => (
              <div key={x.id} className="fila entre">
                <ChipPreparo setor={x.setor} status={x.status} />
                {x.status === 'pronto' && (
                  <button className="btn sucesso pequeno" disabled={ocupado} onClick={() => entregar(x.id)}>
                    Entreguei
                  </button>
                )}
              </div>
            ))}
          {p.status !== 'pago' && (
            <Aviso tipo="erro">
              {p.status === 'cancelado' ? 'Cancelado' : 'Estornado'} por {p.encerradoPor}: {p.motivoEncerramento}
            </Aviso>
          )}
          {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
          {p.status === 'pago' && !p.solicitacaoPendente && !cancelar && (
            <button className="btn contorno-perigo" onClick={() => setCancelar(true)}>
              Solicitar cancelamento / estorno
            </button>
          )}
          {p.solicitacaoPendente && <Aviso tipo="alerta">Cancelamento aguardando autorização do administrador.</Aviso>}
          {cancelar && (
            <div className="formulario">
              <label className="campo">
                Motivo
                <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: cliente desistiu antes do preparo" />
              </label>
              <div className="fila">
                <button className="btn perigo" disabled={ocupado || motivo.trim().length < 5} onClick={pedirCancelamento}>
                  Enviar ao administrador
                </button>
                <button className="btn" onClick={() => setCancelar(false)}>
                  Voltar
                </button>
              </div>
            </div>
          )}
          <details>
            <summary className="fraco" style={{ cursor: 'pointer' }}>
              Histórico do pedido
            </summary>
            <ul className="linha-tempo" style={{ marginTop: 10 }}>
              {p.linhaDoTempo.map((e) => (
                <li key={e.id}>
                  <span className="fraco">{hora(e.criadoEm)}</span> {e.descricao}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </Modal>
  );
}
