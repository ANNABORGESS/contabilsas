'use client';
// Painel lateral da ZARO IA. Abre pelo botão do topo ou por qualquer elemento que dispare
// o evento "zaro-ia" (ex.: perguntas sugeridas no Dashboard). O histórico fica só nesta aba do navegador.
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { perguntarIa } from '@/app/(app)/acoes-ia';
import { Icone } from './Icone';
import { Markdown } from './Markdown';

type Msg = { papel: 'usuario' | 'ia'; texto: string; erro?: boolean };

export const SUGESTOES = [
  'Como está meu caixa hoje?',
  'O que vence nos próximos 7 dias?',
  'Quais impostos estão em aberto?',
  'O fechamento da competência está atrasado?',
  'O que falta para a conciliação bancária?',
  'Quais despesas pesam mais no resultado?',
  'Qual foi o resultado do mês?',
  'Como está o endividamento da empresa?',
  'O balanço da competência está fechado?',
];

/** Abre o painel, opcionalmente já enviando uma pergunta. */
export function abrirIa(pergunta?: string, area?: string) {
  window.dispatchEvent(new CustomEvent('zaro-ia', { detail: { pergunta, area } }));
}

export function BotaoIa() {
  return (
    <button type="button" className="icone-topo ia brilho-ia" title="ZARO IA" aria-label="Abrir ZARO IA" onClick={() => abrirIa()}>
      <Icone nome="brilho" tam={18} />
    </button>
  );
}

/** Botões de perguntas sugeridas (usado nos cards de IA das telas). */
export function PerguntasIa({ perguntas = SUGESTOES, area }: { perguntas?: string[]; area?: string }) {
  return (
    <div className="sugestoes-ia">
      {perguntas.map((p) => <button key={p} type="button" className="chip ia" onClick={() => abrirIa(p, area)}>{p}</button>)}
    </div>
  );
}

export function PainelIa({ empresa }: { empresa: string }) {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [area, setArea] = useState<string | undefined>();
  const [pendente, iniciar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);
  const caminho = usePathname();

  // conversa é por empresa: ao trocar de empresa, começa do zero
  useEffect(() => { setMsgs([]); }, [empresa]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs, pendente]);

  const enviar = (pergunta: string, a?: string) => {
    const q = pergunta.trim();
    if (!q || pendente) return;
    const hist: Msg[] = [...msgs.filter((m) => !m.erro), { papel: 'usuario', texto: q }];
    setMsgs(hist);
    setTexto('');
    iniciar(async () => {
      const r = await perguntarIa(hist.map(({ papel, texto }) => ({ papel, texto })), a ?? area);
      setMsgs((m) => [...m, r.erro ? { papel: 'ia', texto: r.erro, erro: true } : { papel: 'ia', texto: r.texto! }]);
    });
  };

  useEffect(() => {
    const abrir = (e: Event) => {
      const d = (e as CustomEvent<{ pergunta?: string; area?: string }>).detail || {};
      setAberto(true);
      setArea(d.area);
      if (d.pergunta) enviar(d.pergunta, d.area);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('zaro-ia', abrir);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('zaro-ia', abrir); window.removeEventListener('keydown', esc); };
  });
  useEffect(() => { setAberto(false); }, [caminho]);

  if (!aberto) return null;
  return (
    <>
      <div className="ia-fundo" onClick={() => setAberto(false)} aria-hidden="true" />
      <aside className="ia-painel" role="dialog" aria-label="ZARO IA">
        <header>
          <span className="ia-marca"><Icone nome="brilho" tam={18} /> ZARO IA</span>
          <span className="pequeno mudo">{empresa}</span>
          <button type="button" className="btn mini" onClick={() => setAberto(false)} aria-label="Fechar">Fechar</button>
        </header>
        <div className="ia-msgs">
          {!msgs.length && (
            <>
              <p className="mudo pequeno">Respondo com os números da empresa selecionada, dizendo a fonte, o período e onde conferir. Quando um dado não existe na ZARO, eu aviso.</p>
              <PerguntasIa />
            </>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`ia-msg ${m.papel} ${m.erro ? 'erro' : ''}`}>{m.papel === 'ia' && !m.erro ? <Markdown texto={m.texto} /> : m.texto}</div>
          ))}
          {pendente && <div className="ia-msg ia carregando"><span /><span /><span /></div>}
          <div ref={fim} />
        </div>
        <form className="ia-envio" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pergunte sobre caixa, vencimentos, tributos, fechamento…" rows={2}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} aria-label="Pergunta para a ZARO IA" />
          <button className="btn primario" type="submit" disabled={pendente || !texto.trim()}>Enviar</button>
        </form>
      </aside>
    </>
  );
}
