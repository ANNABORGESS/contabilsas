'use client';
// Painel da cozinha ou do bar: só pedidos pagos, do mais antigo para o mais novo.
// Feito para tablet ou TV: letras grandes, um toque para avançar o status.
import { useEffect, useRef, useState } from 'react';
import type { Setor } from '@/domain/pedido';
import { api, bipar, liberarSom, useDados } from './api';
import { decorrido, hora, minutosDesde } from './formato';
import { Aviso, BotaoSair, Conexao, useAgora } from './ui';

interface Ticket {
  id: string;
  status: 'novo' | 'preparando' | 'pronto';
  criadoEm: string;
  iniciadoEm: string | null;
  prontoEm: string | null;
  pedidoId: string;
  numero: number;
  mesa: number;
  garcom: string;
  observacao: string | null;
  itens: { nome: string; quantidade: number }[];
}
interface Painel {
  setor: Setor;
  preparos: Ticket[];
  recentes: { id: string; numero: number; mesa: number; entregueEm: string }[];
}

const COLUNAS = [
  { status: 'novo', titulo: 'Novos', acao: 'Iniciar preparo', para: 'preparando', volta: null },
  { status: 'preparando', titulo: 'Em preparo', acao: 'Marcar pronto', para: 'pronto', volta: 'novo' },
  { status: 'pronto', titulo: 'Prontos · aguardando garçom', acao: null, para: null, volta: 'preparando' },
] as const;

const ALERTA_MIN = 10;
const CRITICO_MIN = 20;

export default function PainelPreparo({ setor, usuario }: { setor: Setor; usuario: { nome: string; papel: string } }) {
  const { dados, erro } = useDados<Painel>(`/api/preparos?setor=${setor}`);
  const agora = useAgora(10000);
  const [aba, setAba] = useState<'novo' | 'preparando' | 'pronto'>('novo');
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [chegaram, setChegaram] = useState<Set<string>>(new Set());
  const conhecidos = useRef<Set<string> | null>(null);

  // som e destaque quando chega pedido novo
  useEffect(() => {
    if (!dados) return;
    const ids = dados.preparos.map((p) => p.id);
    if (!conhecidos.current) {
      conhecidos.current = new Set(ids);
      return;
    }
    const novos = ids.filter((i) => !conhecidos.current!.has(i));
    ids.forEach((i) => conhecidos.current!.add(i));
    if (novos.length) {
      bipar(2);
      setChegaram(new Set(novos));
      const t = setTimeout(() => setChegaram(new Set()), 4000);
      return () => clearTimeout(t);
    }
  }, [dados]);

  async function mudar(id: string, status: string) {
    setOcupado(id);
    setFalha('');
    try {
      await api(`/api/preparos/${id}`, 'PATCH', { status });
    } catch (e) {
      setFalha((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const lista = dados?.preparos || [];
  const por = (s: string) => lista.filter((p) => p.status === s);

  return (
    <div className="tema-escuro painel" onPointerDown={liberarSom}>
      <header className="painel-topo">
        <div className="fila" style={{ gap: 16 }}>
          <h1>{setor === 'cozinha' ? '🍟 Cozinha' : '🍺 Bar'}</h1>
          <span className="chip st-novo">{por('novo').length} novos</span>
          <span className="chip st-preparando">{por('preparando').length} em preparo</span>
          <span className="chip st-pronto">{por('pronto').length} prontos</span>
        </div>
        <div className="fila" style={{ gap: 16 }}>
          <Conexao />
          <span className="relogio">{hora(new Date(agora))}</span>
          <span className="fraco">{usuario.nome}</span>
          {usuario.papel === 'admin' && (
            <a className="btn fantasma pequeno" href="/admin">
              Admin
            </a>
          )}
          <BotaoSair />
        </div>
      </header>
      {(erro || falha) && (
        <div style={{ padding: '12px 14px 0' }}>
          <Aviso tipo="erro">{falha || erro}</Aviso>
        </div>
      )}
      <div className="abas-painel">
        {COLUNAS.map((c) => (
          <button key={c.status} className={`btn ${aba === c.status ? 'primario' : ''}`} onClick={() => setAba(c.status)}>
            {c.titulo.split(' ·')[0]} ({por(c.status).length})
          </button>
        ))}
      </div>
      <div className="colunas">
        {COLUNAS.map((c) => (
          <section key={c.status} className={`coluna ${aba === c.status ? 'visivel' : ''}`}>
            <header>
              <span>{c.titulo}</span>
              <span className="chip">{por(c.status).length}</span>
            </header>
            <div className="lista">
              {por(c.status).map((t) => {
                const min = minutosDesde(t.criadoEm, agora);
                const nivel = t.status !== 'pronto' && min >= CRITICO_MIN ? 'critico' : t.status !== 'pronto' && min >= ALERTA_MIN ? 'alerta' : '';
                return (
                  <article key={t.id} className={`ticket ${t.status} ${nivel === 'critico' ? 'atrasado' : ''} ${chegaram.has(t.id) ? 'novo-chegou' : ''}`}>
                    <div className="cab">
                      <span className="numero">#{t.numero}</span>
                      <span className="mesa-n">Mesa {t.mesa}</span>
                    </div>
                    <ul>
                      {t.itens.map((i, k) => (
                        <li key={k}>
                          <b>{i.quantidade}×</b>
                          {i.nome}
                        </li>
                      ))}
                    </ul>
                    {t.observacao && <div className="obs">Obs.: {t.observacao}</div>}
                    <div className={`tempo ${nivel}`}>
                      Pago às {hora(t.criadoEm)} · {t.status === 'pronto' && t.prontoEm ? `pronto ${decorrido(t.prontoEm, agora)}` : decorrido(t.criadoEm, agora)} · {t.garcom}
                    </div>
                    <div className="fila">
                      {c.para && (
                        <button className={`btn ${c.para === 'pronto' ? 'sucesso' : 'primario'} grande`} style={{ flex: 1 }} disabled={ocupado === t.id} onClick={() => mudar(t.id, c.para!)}>
                          {c.acao}
                        </button>
                      )}
                      {c.volta && (
                        <button className="btn fantasma pequeno" disabled={ocupado === t.id} onClick={() => mudar(t.id, c.volta!)} title="Desfazer o último toque">
                          ↶ Voltar
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {!por(c.status).length && <div className="vazio">{c.status === 'novo' ? 'Nenhum pedido novo.' : 'Nada aqui.'}</div>}
            </div>
          </section>
        ))}
      </div>
      {!!dados?.recentes.length && (
        <footer className="fraco" style={{ padding: '0 18px 16px' }}>
          Entregues nos últimos 30 min: {dados.recentes.map((r) => `#${r.numero} (mesa ${r.mesa})`).join(' · ')}
        </footer>
      )}
    </div>
  );
}
