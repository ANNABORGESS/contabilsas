'use client';
// Celular do garçom. O pedido só é gravado quando o garçom toca em "Pagamento confirmado",
// depois de a maquininha aprovar. Até lá ele fica só neste aparelho (rascunho). A chave do
// envio fica guardada: se a rede cair e o garçom tentar de novo, o pedido não é duplicado.
import { dividirIgual, nomeForma } from '@/domain/pagamento';
import { paraCentavos } from '@/domain/dinheiro';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, bipar, liberarSom, novaChave, sairDoSistema, useDados } from '@/cliente/api';
import { decorrido, hora, reais } from '@/cliente/formato';
import { Aviso, BotaoSair, ChipPedido, ChipPreparo, ChipSituacao, Conexao, Modal, useAgora } from '@/cliente/ui';
import { FORMAS_PAGAMENTO, MAX_BALDE, NOME_FORMA, NOME_SETOR, agruparBaldes, textoItem, type FormaPagamento, type Setor } from '@/domain/pedido';
import type { DetalhePedido, PedidoLista } from '@/server/pedidos';
import { BuscaMesa } from '@/cliente/BuscaMesa';
import { BALCAO, ehBalcao, filtrarMesas, nomeLocal, type FiltroMesa } from '@/domain/mesas';
import { ESTOQUE_BAIXO } from '@/domain/estoque';
import { textoRestante } from '@/domain/promocao';
import { INICIO, ehGestao, type Papel } from '@/domain/papeis';

interface Produto {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  setor: Setor;
  precoCentavos: number;
  balde?: boolean;
  estoque?: number | null; // vazio = sem controle de estoque
  estoqueTrava?: boolean; // false: só registra, não impede a venda
}
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
  abertos: number;
}
interface Pronto {
  id: string;
  setor: Setor;
  prontoEm: string;
  pedidoId: string;
  numero: number;
  mesa: number;
  cliente: string | null;
  garcomId: string;
}
/** Logo do Porão Vikings no topo do garçom. */
function MarcaVikings() {
  return (
    <div className="marca-vikings" aria-label="Porão Vikings">
      <img src="/logo.png" alt="" />
    </div>
  );
}

const ICONES: Record<string, React.ReactNode> = {
  engrenagem: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  sair: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  grade: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  lista: <path d="M4 6h16M4 12h16M4 18h16" />,
  sino: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
};

function Icone({ nome }: { nome: keyof typeof ICONES }) {
  return (
    <svg className="icone" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONES[nome]}
    </svg>
  );
}

interface PromoAgora {
  id: string;
  nome: string;
  produtoId: string;
  quantidadeCombo: number;
  precoComboCentavos: number;
  destaque: string | null;
  fim: string;
  terminaEm: string;
}

/** Preço de q unidades com a promoção valendo: cada combo pelo preço dele, o resto no normal. */
const precoComPromo = (preco: number, q: number, promo?: PromoAgora) => (promo ? Math.floor(q / promo.quantidadeCombo) * promo.precoComboCentavos + (q % promo.quantidadeCombo) * preco : preco * q);

/** Faixa no topo: "🔥 Original em dobro até as 20h · termina em 1h 23min". Some sozinha no fim. */
function FaixaPromocoes({ promocoes }: { promocoes: PromoAgora[] }) {
  const agora = useAgora(15000);
  const valendo = promocoes.filter((p) => Date.parse(p.terminaEm) > agora);
  if (!valendo.length) return null;
  return (
    <div className="faixa-promo">
      {valendo.map((p) => (
        <div key={p.id}>
          🔥 <b>{p.destaque || `${p.nome} até as ${p.fim}`}</b> · {reais(p.precoComboCentavos)} por {p.quantidadeCombo} · termina em <b className="num">{textoRestante(Date.parse(p.terminaEm) - agora)}</b>
        </div>
      ))}
    </div>
  );
}

interface Previa {
  mesa: { id: string; numero: number };
  linhas: { produtoId: string; nome: string; setor: Setor; quantidade: number; precoCentavos: number; subtotalCentavos: number; balde: number | null; unidades?: number; promocaoId?: string | null }[];
  totalCentavos: number;
  setores: Setor[];
}
interface Tentativa {
  mesaId: string;
  chave: string;
  previa: Previa;
  forma: FormaPagamento | null;
  observacao: string;
  cliente?: string;
  /** conta dividida: cada parte com valor em centavos, forma e (opcional) quem pagou */
  partes?: Parte[];
}
interface Parte {
  valor: number;
  texto: string; // o que o garçom digitou no valor
  forma: FormaPagamento | null;
  pessoa: string;
}

type Carrinhos = Record<string, Record<string, number>>;
/** Baldes de cada mesa: cada balde é { produtoId: quantidade }, até MAX_BALDE cervejas. */
type Balde = Record<string, number>;
type Baldes = Record<string, Balde[]>;
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
  const [baldes, setBaldes] = useState<Baldes>({});
  const [tentativa, setTentativa] = useState<Tentativa | null>(null);
  const [toast, setToast] = useState<{ texto: string; pedidoId?: string } | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [buscaMesa, setBuscaMesa] = useState('');
  const [filtroMesa, setFiltroMesa] = useState<FiltroMesa>('todas');

  // rascunhos e tentativa de pagamento sobrevivem a recarregar a página
  useEffect(() => {
    setCarrinhos(ler('bar:carrinhos', {}));
    setBaldes(ler('bar:baldes', {}));
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
    if (pronto) gravar('bar:baldes', baldes);
  }, [baldes, pronto]);
  useEffect(() => {
    if (pronto) gravar('bar:tentativa', tentativa);
  }, [tentativa, pronto]);

  const cardapio = useDados<{ produtos: Produto[] }>('/api/cardapio');
  const mesas = useDados<{ data: string; mesas: MesaTurno[] }>('/api/mesas/turno');
  const prontos = useDados<{ prontos: Pronto[] }>('/api/prontos');
  const promos = useDados<{ promocoes: PromoAgora[] }>('/api/promocoes/agora');
  // no horário de encerramento a lista é pedida de novo: a promoção some e o preço volta ao normal
  const relogio = useAgora(15000);
  const promocoes = useMemo(() => (promos.dados?.promocoes || []).filter((p) => Date.parse(p.terminaEm) > relogio), [promos.dados, relogio]);
  const recarregarPromos = promos.recarregar;
  const vencidas = (promos.dados?.promocoes || []).length - promocoes.length;
  useEffect(() => {
    if (vencidas > 0) void recarregarPromos();
  }, [vencidas, recarregarPromos]);

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
      setToast({ texto: `✅ ${nomeLocal(p.mesa)}${p.cliente ? ` (${p.cliente})` : ''}: ${p.setor === 'cozinha' ? 'petiscos' : 'bebidas'} do pedido #${p.numero} prontos${meus.length > 1 ? ` (+${meus.length - 1})` : ''}`, pedidoId: p.pedidoId });
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

  const definirBaldes = useCallback((mesaId: string, lista: Balde[]) => {
    setBaldes((b) => {
      const novo = { ...b, [mesaId]: lista };
      if (!lista.length) delete novo[mesaId];
      return novo;
    });
  }, []);
  const limparMesa = (mesaId: string) => {
    setCarrinhos((c) => {
      const n = { ...c };
      delete n[mesaId];
      return n;
    });
    definirBaldes(mesaId, []);
  };

  async function irParaPagamento(mesaId: string) {
    const itens = [
      ...Object.entries(carrinhos[mesaId] || {}).map(([produtoId, quantidade]) => ({ produtoId, quantidade })),
      ...(baldes[mesaId] || []).flatMap((b, i) => Object.entries(b).map(([produtoId, quantidade]) => ({ produtoId, quantidade, balde: i + 1 }))),
    ];
    const previa = await api<Previa>('/api/pedidos/previa', 'POST', { mesaId, itens });
    // sugere o nome do último cliente da mesa no turno; o garçom pode trocar ou apagar
    // no balcão cada pedido é de um cliente diferente: o nome começa vazio
    // mesa já finalizada também começa vazia: provavelmente é outro cliente
    const m = mesaPorId.get(mesaId);
    const sugestao = previa.mesa.numero === BALCAO || !m?.abertos ? '' : (m.clientes[0] ?? '');
    setTentativa({ mesaId, chave: novaChave(), previa, forma: null, observacao: '', cliente: sugestao });
    setTela({ t: 'pagamento' });
  }

  function aposEnvio(pedido: DetalhePedido, duplicado: boolean) {
    if (tentativa) limparMesa(tentativa.mesaId);
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
      <div className="tema-escuro garcom-viking" onPointerDown={liberarSom}>
        <TelaProdutos
          mesaNumero={mesa?.numero}
          mesaInfo={mesa}
          produtos={cardapio.dados?.produtos || []}
          carregando={cardapio.carregando}
          promocoes={promocoes}
          carrinho={carrinhos[tela.mesaId] || {}}
          definir={(p, q) => definirQtd(tela.mesaId, p, q)}
          baldes={baldes[tela.mesaId] || []}
          definirBaldes={(l) => definirBaldes(tela.mesaId, l)}
          limpar={() => limparMesa(tela.mesaId)}
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
      <div className="tema-escuro garcom-viking" onPointerDown={liberarSom}>
        <TelaPagamento tentativa={tentativa} atualizar={setTentativa} voltar={desistirDoPagamento} enviado={aposEnvio} />
      </div>
    );
  }
  if (tela.t === 'enviado') {
    const p = tela.pedido;
    return (
      <div className="tema-escuro garcom-viking">
        <div className="app-garcom">
          <div className="corpo-garcom">
            <div className="sucesso-envio">
              <div className="icone">✓</div>
              <h1>Pedido #{p.numero} registrado</h1>
              <p className="mudo">
                {nomeLocal(p.mesa)}
                {p.cliente && ` · ${p.cliente}`} · {reais(p.totalCentavos)} · {nomeForma(p.formaPagamento)}
              </p>
              {tela.duplicado && <Aviso tipo="info">Este pagamento já estava registrado. Nenhum pedido novo foi criado.</Aviso>}
              <div className="fila" style={{ justifyContent: 'center' }}>
                {p.preparos.map((x) =>
                  x.status === 'entregue' ? (
                    <span key={x.id} className="chip st-pronto">
                      ⚡ Bebidas: entregue direto
                    </span>
                  ) : (
                    <span key={x.id} className="chip st-novo">
                      Enviado para {NOME_SETOR[x.setor as Setor]}
                    </span>
                  ),
                )}
              </div>
              <p className="fraco">Você será avisado aqui quando ficar pronto.</p>
            </div>
            <button className="btn primario grande bloco" onClick={() => setTela({ t: 'pedido', mesaId: p.mesaId })}>
              Novo pedido: {nomeLocal(p.mesa).toLowerCase()}
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
    <div className="tema-escuro garcom-viking" onPointerDown={liberarSom}>
      <div className="app-garcom">
        <header className="topo-garcom topo-viking">
          <div className="fila" style={{ gap: 14, minWidth: 0 }}>
            <MarcaVikings />
            <div className="titulo-topo">
              <div className="t">{aba === 'mesas' ? 'Mesas' : aba === 'pedidos' ? 'Pedidos' : 'Prontos'}</div>
              <div className="fraco">{usuario.nome}</div>
            </div>
          </div>
          <div className="fila acoes-topo">
            <Conexao />
            {ehGestao(usuario.papel) && (
              <a className="acao-topo" href={INICIO[usuario.papel as Papel]}>
                <Icone nome="engrenagem" /> <span>Admin</span>
              </a>
            )}
            <button type="button" className="acao-topo" onClick={() => void sairDoSistema()}>
              <Icone nome="sair" /> <span>Sair</span>
            </button>
          </div>
        </header>
        <main className="corpo-garcom">
          <FaixaPromocoes promocoes={promocoes} />
          {aba === 'mesas' && (
            <>
              {mesas.erro && <Aviso tipo="erro">{mesas.erro}</Aviso>}
              {(mesas.dados?.mesas.length || 0) > 0 && (
                <BuscaMesa
                  busca={buscaMesa}
                  setBusca={setBuscaMesa}
                  filtro={filtroMesa}
                  setFiltro={setFiltroMesa}
                  total={mesas.dados!.mesas.length}
                  achadas={filtrarMesas(mesas.dados!.mesas, buscaMesa, filtroMesa).length}
                />
              )}
              <div className="mesas-grade" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {filtrarMesas(mesas.dados?.mesas || [], buscaMesa, filtroMesa).map((m) => {
                  const rascunho = Object.values(carrinhos[m.id] || {}).reduce((a, b) => a + b, 0) + (baldes[m.id] || []).length;
                  return (
                    <button key={m.id} className={`mesa ${m.abertos ? 'ocupada' : ''} ${ehBalcao(m.numero) ? 'balcao' : ''} ${m.numero === BALCAO ? 'balcao-geral' : ''}`} onClick={() => setTela({ t: 'pedido', mesaId: m.id })}>
                      <span className="n">{nomeLocal(m.numero)}</span>
                      {m.nome && !ehBalcao(m.numero) && <span className="fraco">{m.nome}</span>}
                      {m.abertos > 0 && m.clientes.length > 0 && <span className="cliente-mesa">👤 {m.clientes.join(', ')}</span>}
                      <span className="fraco num">{m.abertos ? `Aberta · ${m.abertos} pedido${m.abertos > 1 ? 's' : ''} · ${reais(m.totalCentavos)}` : 'Livre'}</span>
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
              {mesas.dados && mesas.dados.mesas.length > 0 && !filtrarMesas(mesas.dados.mesas, buscaMesa, filtroMesa).length && <div className="vazio">Nenhuma mesa encontrada.</div>}
            </>
          )}
          {aba === 'pedidos' && <ListaPedidos usuarioId={usuario.id} abrir={(id) => setDetalhe(id)} />}
          {aba === 'prontos' && <ListaProntos prontos={prontos.dados?.prontos || []} usuarioId={usuario.id} abrir={(id) => setDetalhe(id)} />}
        </main>
        <nav className="abas-baixo">
          <div>
            <button className={aba === 'mesas' ? 'ativo' : ''} onClick={() => setAba('mesas')}>
              <Icone nome="grade" />
              Mesas
            </button>
            <button className={aba === 'pedidos' ? 'ativo' : ''} onClick={() => setAba('pedidos')}>
              <Icone nome="lista" />
              Pedidos
            </button>
            <button className={aba === 'prontos' ? 'ativo' : ''} onClick={() => setAba('prontos')}>
              <Icone nome="sino" />
              Prontos
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
  promocoes: PromoAgora[];
  carrinho: Record<string, number>;
  definir: (produtoId: string, qtd: number) => void;
  baldes: Balde[];
  definirBaldes: (lista: Balde[]) => void;
  limpar: () => void;
  voltar: () => void;
  cobrar: () => Promise<void>;
  abrirHistorico: () => void;
}) {
  const { produtos, carrinho, definir, baldes } = props;
  const [filtro, setFiltro] = useState<string>('todos');
  const [editandoBalde, setEditandoBalde] = useState<number | null>(null); // índice; baldes.length = novo
  const deBalde = produtos.filter((p) => p.balde);
  // quanto deste produto já está no rascunho (solto e nos baldes), para não passar do estoque
  const noRascunho = (id: string, exceto?: number) => (carrinho[id] || 0) + baldes.reduce((a, b, i) => a + (i === exceto ? 0 : b[id] || 0), 0);
  const travado = (p: Produto) => p.estoque !== null && p.estoque !== undefined && p.estoqueTrava !== false;
  const sobra = (p: Produto, exceto?: number) => (travado(p) ? p.estoque! - noRascunho(p.id, exceto) : Infinity);
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
  const promoDe = new Map(props.promocoes.map((x) => [x.produtoId, x]));
  const somaBalde = (b: Balde) => Object.entries(b).reduce((a, [id, q]) => a + precoComPromo(porId.get(id)?.precoCentavos || 0, q, promoDe.get(id)), 0);
  const qtdTotal = itens.reduce((a, [, q]) => a + q, 0) + baldes.length;
  // estimativa na tela; o valor que vale é o da prévia, calculado no servidor com o horário de lá
  const total = itens.reduce((a, [id, q]) => a + precoComPromo(porId.get(id)!.precoCentavos, q, promoDe.get(id)), 0) + baldes.reduce((a, b) => a + somaBalde(b), 0);

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
            <div style={{ fontWeight: 800, fontSize: 18 }}>{props.mesaNumero === undefined ? '…' : nomeLocal(props.mesaNumero)}</div>
            <div className="fraco">{props.mesaInfo?.pedidos ? `Conta aberta · ${props.mesaInfo.pedidos} pedido(s)` : 'Novo pedido'}</div>
          </div>
        </div>
        <div className="fila">
          {!!props.mesaInfo?.pedidos && (
            <button className="btn pequeno" onClick={props.abrirHistorico}>
              Conta atual
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
        <FaixaPromocoes promocoes={props.promocoes} />
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
        {deBalde.length > 0 && (
          <div className="cartao balde-cartao">
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700 }}>🪣 Balde de cerveja</div>
                <div className="fraco">Até {MAX_BALDE} cervejas pequenas por balde, pode misturar</div>
              </div>
              <button className="btn primario" onClick={() => setEditandoBalde(baldes.length)}>
                + Montar balde
              </button>
            </div>
            {baldes.map((b, i) => (
              <div key={i} className="balde-linha">
                <div>
                  <b>Balde {i + 1}</b> · {Object.values(b).reduce((a, q) => a + q, 0)} cervejas
                  <div className="fraco">
                    {Object.entries(b)
                      .filter(([id]) => porId.has(id))
                      .map(([id, q]) => `${q}× ${porId.get(id)!.nome}`)
                      .join(', ')}
                  </div>
                </div>
                <div className="fila">
                  <span className="num">{reais(somaBalde(b))}</span>
                  <button className="btn pequeno" onClick={() => setEditandoBalde(i)}>
                    Editar
                  </button>
                  <button className="btn fantasma pequeno" onClick={() => props.definirBaldes(baldes.filter((_, k) => k !== i))} aria-label={`Tirar balde ${i + 1}`}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {visiveis.map((p) => {
          const q = carrinho[p.id] || 0;
          const promo = promoDe.get(p.id);
          // na promoção cada toque soma o combo (2 Original): o cliente pede 1 e leva 2
          const passo = promo && sobra(p) >= promo.quantidadeCombo ? promo.quantidadeCombo : 1;
          const podeMais = sobra(p) > 0;
          const esgotado = travado(p) && p.estoque! <= 0;
          return (
            <div key={p.id} className={`produto ${q ? 'escolhido' : ''} ${esgotado ? 'esgotado' : ''} ${promo ? 'em-promo' : ''}`}>
              <div className="info" onClick={() => podeMais && definir(p.id, q + passo)}>
                <div className="nome">{p.nome}</div>
                {promo && (
                  <div className="selo-promo">
                    🔥 {promo.quantidadeCombo} por {reais(promo.precoComboCentavos)} até {promo.fim}
                  </div>
                )}
                <div className="preco">
                  {reais(p.precoCentavos)} · {p.setor === 'cozinha' ? 'Cozinha' : 'Bar'}
                  {promo && q > 0 && <> · {reais(precoComPromo(p.precoCentavos, q, promo))} por {q}</>}
                </div>
                {promo && q % promo.quantidadeCombo !== 0 && (
                  <div className="restam">
                    {q % promo.quantidadeCombo} fora do combo de {promo.quantidadeCombo}: {q % promo.quantidadeCombo === 1 ? 'sai' : 'saem'} no preço normal
                  </div>
                )}
                {esgotado ? (
                  <div className="restam">Esgotado</div>
                ) : (
                  travado(p) && p.estoque! <= ESTOQUE_BAIXO && <div className="restam">Restam {p.estoque}</div>
                )}
                {p.descricao && <div className="fraco">{p.descricao}</div>}
              </div>
              <div className="qtd">
                {q > 0 && (
                  <>
                    <button onClick={() => definir(p.id, Math.max(0, q - (promo && q >= promo.quantidadeCombo && q % promo.quantidadeCombo === 0 ? promo.quantidadeCombo : 1)))} aria-label={`Tirar um ${p.nome}`}>
                      −
                    </button>
                    <span>{q}</span>
                  </>
                )}
                <button className="mais" disabled={!podeMais} onClick={() => definir(p.id, q + passo)} aria-label={`Adicionar ${p.nome}`}>
                  {passo > 1 ? `+${passo}` : '+'}
                </button>
              </div>
            </div>
          );
        })}
        {!props.carregando && !visiveis.length && <div className="vazio">Nenhum produto aqui.</div>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </main>
      {editandoBalde !== null && (
        <MontarBalde
          numero={editandoBalde + 1}
          produtos={deBalde}
          disponivel={Object.fromEntries(deBalde.map((p) => [p.id, sobra(p, editandoBalde)]))}
          inicial={baldes[editandoBalde] || {}}
          fechar={() => setEditandoBalde(null)}
          salvar={(b) => {
            const lista = [...baldes];
            lista[editandoBalde] = b;
            props.definirBaldes(lista);
            setEditandoBalde(null);
          }}
        />
      )}
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

/** Escolhe as cervejas de um balde: até MAX_BALDE no total, pode misturar marcas. */
function MontarBalde({ numero, produtos, disponivel, inicial, fechar, salvar }: { numero: number; produtos: Produto[]; disponivel: Record<string, number>; inicial: Balde; fechar: () => void; salvar: (b: Balde) => void }) {
  const [b, setB] = useState<Balde>(inicial);
  const n = Object.values(b).reduce((a, q) => a + q, 0);
  const total = Object.entries(b).reduce((a, [id, q]) => a + (produtos.find((p) => p.id === id)?.precoCentavos || 0) * q, 0);
  const mudar = (id: string, q: number) =>
    setB((atual) => {
      const novo = { ...atual };
      if (q <= 0) delete novo[id];
      else novo[id] = q;
      return novo;
    });
  return (
    <Modal titulo={`🪣 Balde ${numero}`} aoFechar={fechar}>
      <div className="balde-contador">
        <span className="num">
          {n}/{MAX_BALDE}
        </span>
        <span className="fraco">{n >= MAX_BALDE ? 'Balde cheio' : `cabem mais ${MAX_BALDE - n}`}</span>
      </div>
      {produtos.map((p) => {
        const q = b[p.id] || 0;
        return (
          <div key={p.id} className={`produto ${q ? 'escolhido' : ''}`}>
            <div className="info" onClick={() => n < MAX_BALDE && q < disponivel[p.id] && mudar(p.id, q + 1)}>
              <div className="nome">{p.nome}</div>
              <div className="preco">{reais(p.precoCentavos)} cada</div>
              {disponivel[p.id] !== Infinity && disponivel[p.id] - q <= ESTOQUE_BAIXO && (
                <div className="restam">{disponivel[p.id] - q <= 0 ? 'Sem mais no estoque' : `Restam ${disponivel[p.id] - q}`}</div>
              )}
            </div>
            <div className="qtd">
              {q > 0 && (
                <>
                  <button onClick={() => mudar(p.id, q - 1)} aria-label={`Tirar um ${p.nome}`}>
                    −
                  </button>
                  <span>{q}</span>
                </>
              )}
              <button className="mais" disabled={n >= MAX_BALDE || q >= disponivel[p.id]} onClick={() => mudar(p.id, q + 1)} aria-label={`Adicionar ${p.nome}`}>
                +
              </button>
            </div>
          </div>
        );
      })}
      <button className="btn primario grande bloco" disabled={!n} onClick={() => salvar(b)}>
        {n ? `Colocar no pedido · ${n} ${n === 1 ? 'cerveja' : 'cervejas'} · ${reais(total)}` : 'Escolha as cervejas'}
      </button>
    </Modal>
  );
}

// ---------- pagamento na maquininha ----------

const emReais = (c: number) => (c / 100).toFixed(2).replace('.', ',');

function TelaPagamento({ tentativa, atualizar, voltar, enviado }: { tentativa: Tentativa; atualizar: (t: Tentativa) => void; voltar: () => void; enviado: (p: DetalhePedido, dup: boolean) => void }) {
  const { previa, forma } = tentativa;
  const partes = tentativa.partes;
  const dividindo = !!partes && partes.length > 0;
  const somaPartes = (partes || []).reduce((a, x) => a + x.valor, 0);
  const faltaPartes = previa.totalCentavos - somaPartes;
  const partesOk = dividindo && faltaPartes === 0 && partes!.every((x) => x.forma && x.valor > 0);
  const pagamentoOk = dividindo ? partesOk : !!forma;
  const dividirEm = (n: number) =>
    atualizar({ ...tentativa, partes: dividirIgual(previa.totalCentavos, n).map((valor, i) => ({ valor, texto: emReais(valor), forma: partes?.[i]?.forma ?? null, pessoa: partes?.[i]?.pessoa ?? '' })) });
  const mudarParte = (i: number, d: Partial<Parte>) => atualizar({ ...tentativa, partes: partes!.map((x, k) => (k === i ? { ...x, ...d } : x)) });
  const noBalcao = ehBalcao(previa.mesa.numero);
  const nomeOk = !!tentativa.cliente?.trim();
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [falhouRede, setFalhouRede] = useState(false);
  const travado = useRef(false);

  async function enviar() {
    if (travado.current || !pagamentoOk) return; // impede toque duplo
    travado.current = true;
    setEnviando(true);
    setErro('');
    try {
      const r = await api<{ pedido: DetalhePedido; duplicado: boolean }>('/api/pedidos', 'POST', {
        chave: tentativa.chave,
        mesaId: tentativa.mesaId,
        // unidades de verdade: no combo da promoção cada linha leva várias (o servidor remonta o combo)
        itens: previa.linhas.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade * (l.unidades ?? 1), balde: l.balde })),
        formaPagamento: dividindo ? null : forma,
        pagamentos: dividindo ? partes!.map((x) => ({ forma: x.forma, valorCentavos: x.valor, pessoa: x.pessoa })) : undefined,
        totalCobradoCentavos: previa.totalCentavos,
        precosCobrados: previa.linhas.map((l) => ({ produtoId: l.produtoId, precoCentavos: l.precoCentavos, promocaoId: l.promocaoId ?? null })),
        observacao: tentativa.observacao,
        cliente: tentativa.cliente ?? '',
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
            <div style={{ fontWeight: 800, fontSize: 18 }}>{nomeLocal(previa.mesa.numero)} · Pagamento</div>
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
        <label className={`campo nome-cliente ${noBalcao && !nomeOk ? 'pedindo' : ''}`}>
          {noBalcao ? '👤 Nome do cliente (obrigatório no balcão, para chamar quando ficar pronto)' : '👤 Nome do cliente'}
          <input
            value={tentativa.cliente ?? ''}
            maxLength={60}
            placeholder="ex.: João, Mariana"
            autoCapitalize="words"
            autoFocus={noBalcao}
            onChange={(e) => atualizar({ ...tentativa, cliente: e.target.value })}
            disabled={enviando}
          />
        </label>
        <div className="cartao resumo-itens">
          {previa.linhas.map((l) => (
            <div key={`${l.produtoId}-${l.balde ?? ''}`}>
              <span>
                <b>{l.quantidade}×</b> {l.nome} <span className="fraco">· {l.balde ? `🪣 Balde ${l.balde}` : NOME_SETOR[l.setor]}</span>
              </span>
              <span className="num">{reais(l.subtotalCentavos)}</span>
            </div>
          ))}
        </div>
        {!dividindo ? (
          <div>
            <div className="fila entre" style={{ marginBottom: 8 }}>
              <span className="mudo" style={{ fontWeight: 700 }}>
                Forma de pagamento informada
              </span>
              <button className="btn pequeno" onClick={() => dividirEm(2)} disabled={enviando}>
                ➗ Dividir conta
              </button>
            </div>
            <div className="formas">
              {FORMAS_PAGAMENTO.map((f) => (
                <button key={f} className={forma === f ? 'ativo' : ''} onClick={() => atualizar({ ...tentativa, forma: f })} disabled={enviando}>
                  {NOME_FORMA[f]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="cartao divisao">
            <div className="fila entre">
              <b>➗ Conta dividida</b>
              <button className="btn fantasma pequeno" onClick={() => atualizar({ ...tentativa, partes: undefined })} disabled={enviando}>
                Não dividir
              </button>
            </div>
            <div className="fila" style={{ flexWrap: 'wrap', gap: 6 }}>
              <span className="fraco">Dividir igual em</span>
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} className={`btn pequeno ${partes!.length === n ? 'primario' : ''}`} onClick={() => dividirEm(n)} disabled={enviando}>
                  {n}
                </button>
              ))}
            </div>
            {partes!.map((x, i) => (
              <div key={i} className="parte">
                <div className="fila entre">
                  <input className="parte-pessoa" value={x.pessoa} placeholder={`Pessoa ${i + 1} (opcional)`} maxLength={40} onChange={(e) => mudarParte(i, { pessoa: e.target.value })} disabled={enviando} />
                  <input
                    className="parte-valor num"
                    inputMode="decimal"
                    value={x.texto}
                    onChange={(e) => mudarParte(i, { texto: e.target.value, valor: paraCentavos(e.target.value) ?? 0 })}
                    disabled={enviando}
                    aria-label={`Valor da parte ${i + 1}`}
                  />
                  {partes!.length > 1 && (
                    <button className="btn fantasma pequeno" onClick={() => atualizar({ ...tentativa, partes: partes!.filter((_, k) => k !== i) })} aria-label={`Tirar parte ${i + 1}`} disabled={enviando}>
                      ✕
                    </button>
                  )}
                </div>
                <div className="formas pequenas">
                  {FORMAS_PAGAMENTO.map((f) => (
                    <button key={f} className={x.forma === f ? 'ativo' : ''} onClick={() => mudarParte(i, { forma: f })} disabled={enviando}>
                      {NOME_FORMA[f]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="fila entre">
              <button className="btn pequeno" onClick={() => atualizar({ ...tentativa, partes: [...partes!, { valor: Math.max(0, faltaPartes), texto: emReais(Math.max(0, faltaPartes)), forma: null, pessoa: '' }] })} disabled={enviando || partes!.length >= 20}>
                + Parte
              </button>
              <b className="num" style={{ color: faltaPartes === 0 ? 'var(--verde)' : 'var(--vermelho)' }}>
                {faltaPartes === 0 ? '✓ Fecha o total' : faltaPartes > 0 ? `Falta ${reais(faltaPartes)}` : `Passou ${reais(-faltaPartes)}`}
              </b>
            </div>
          </div>
        )}
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
          <button className="btn sucesso grande bloco" disabled={!pagamentoOk || enviando || (noBalcao && !nomeOk)} onClick={() => setConfirmar(true)}>
            {enviando
              ? 'Registrando…'
              : falhouRede
                ? 'Tentar de novo'
                : noBalcao && !nomeOk
                  ? 'Escreva o nome do cliente'
                  : dividindo && !partesOk
                    ? faltaPartes !== 0
                      ? 'As partes precisam fechar o total'
                      : 'Escolha a forma de cada parte'
                    : 'Pagamento confirmado'}
          </button>
        </div>
      </div>
      {confirmar && pagamentoOk && (
        <Modal titulo={dividindo ? 'Todas as partes foram pagas?' : 'A maquininha aprovou?'} aoFechar={() => !enviando && setConfirmar(false)}>
          {dividindo && (
            <div className="resumo-itens" style={{ marginBottom: 10 }}>
              {partes!.map((x, i) => (
                <div key={i}>
                  <span>
                    {x.pessoa.trim() || `Parte ${i + 1}`} · <b>{NOME_FORMA[x.forma!]}</b>
                  </span>
                  <span className="num">{reais(x.valor)}</span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 17 }}>
            Confirme que o pagamento de <b>{reais(previa.totalCentavos)}</b> {dividindo ? <>em <b>{partes!.length} partes</b></> : <>no <b>{NOME_FORMA[forma!]}</b></>} foi aprovado para <b>{nomeLocal(previa.mesa.numero).toLowerCase()}</b>
            {tentativa.cliente?.trim() && (
              <>
                {' '}
                (<b>{tentativa.cliente.trim()}</b>)
              </>
            )}
            .
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
              #{p.numero} · {nomeLocal(p.mesa)}
              {p.cliente && ` · ${p.cliente}`}
            </b>
            {p.status === 'pago' ? <ChipSituacao s={p.situacao} /> : <ChipPedido status={p.status} />}
          </div>
          <div className="fraco">
            {hora(p.pagoEm)} ({decorrido(p.pagoEm, agora)}) · {reais(p.totalCentavos)} · {nomeForma(p.formaPagamento)}
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
              {nomeLocal(p.mesa)} · {p.setor === 'cozinha' ? '🍟 Petiscos' : '🍺 Bebidas'}
            </b>
            {p.cliente && <span className="cliente-mesa">👤 {p.cliente}</span>}
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
  // só a conta atual: pedidos ainda na cozinha ou no bar (mesa finalizada fica limpa)
  const conta = (dados?.pedidos || []).filter((p) => p.status === 'pago' && p.preparos.some((x) => ['novo', 'preparando', 'pronto'].includes(x.status)));
  return (
    <Modal titulo={`${dados?.pedidos[0] ? nomeLocal(dados.pedidos[0].mesa) : 'Mesa'} · conta atual`} aoFechar={fechar}>
      <div className="fila entre">
        <span className="mudo">{conta.length} pedido(s) em aberto</span>
        <b className="num">{reais(conta.reduce((a, p) => a + p.liquidoCentavos, 0))}</b>
      </div>
      {conta.map((p) => (
        <button key={p.id} className="pedido-cartao" onClick={() => abrir(p.id)}>
          <div className="fila entre">
            <b>
              #{p.numero} · {hora(p.pagoEm)}
              {p.cliente && ` · ${p.cliente}`}
            </b>
            <ChipSituacao s={p.situacao} />
          </div>
          <div className="fraco">{p.itens.map(textoItem).join(', ')}</div>
          <div className="fraco">
            {reais(p.liquidoCentavos)} · {nomeForma(p.formaPagamento)} · {p.garcom}
          </div>
        </button>
      ))}
      {dados && !conta.length && <div className="vazio">Mesa livre: nenhuma conta aberta.</div>}
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
    <Modal titulo={p ? `Pedido #${p.numero} · ${nomeLocal(p.mesa)}` : 'Pedido'} aoFechar={fechar}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {p && (
        <>
          <div className="fila entre">
            <span className="mudo">
              {p.cliente && <b style={{ color: 'var(--texto)' }}>👤 {p.cliente} · </b>}
              {hora(p.pagoEm)} · {nomeForma(p.formaPagamento)} · {p.garcom}
              {p.garcomId === usuarioId && ' (você)'}
            </span>
            {p.status === 'pago' ? <ChipSituacao s={p.situacao} /> : <ChipPedido status={p.status} />}
          </div>
          <div className="resumo-itens">
            {p.itens.map((i) => (
              <div key={i.id}>
                <span>
                  <b>{i.quantidade}×</b> {i.nome}
                  {i.balde && <span className="fraco"> · 🪣 Balde {i.balde}</span>}
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
              Pedir cancelamento ao administrador
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
