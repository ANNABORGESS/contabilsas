'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { salvarPainel } from '@/app/(app)/acoes-painel';
import { FecharMenu } from '../FecharMenu';

type B = { chave: string; nome: string };

export function Personalizar({ blocos, ordem, ocultos }: { blocos: B[]; ordem: string[]; ocultos: string[] }) {
  const [o, setO] = useState(ordem);
  const [esc, setEsc] = useState(new Set(ocultos));
  const [salvando, iniciar] = useTransition();
  const router = useRouter();
  const nome = (k: string) => blocos.find((b) => b.chave === k)?.nome || k;
  const mover = (i: number, d: number) => { const n = [...o]; [n[i], n[i + d]] = [n[i + d], n[i]]; setO(n); };
  const salvar = (ord: string[], oc: Set<string>) => iniciar(async () => { await salvarPainel({ ordem: ord, ocultos: [...oc] } as never); router.refresh(); });
  return (
    <details className="personalizar">
      <summary className="btn mini">Personalizar</summary>
      <div className="personalizar-caixa card">
        <FecharMenu />
        <b>Blocos do Dashboard</b>
        <p className="pequeno mudo">Mostre, esconda e reordene. Fica salvo para o seu usuário.</p>
        <ul>
          {o.map((k, i) => (
            <li key={k}>
              <label className="linha"><input type="checkbox" checked={!esc.has(k)} onChange={(e) => { const n = new Set(esc); if (e.target.checked) n.delete(k); else n.add(k); setEsc(n); }} /> {nome(k)}</label>
              <span>
                <button type="button" className="chip" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${nome(k)}`}>↑</button>
                <button type="button" className="chip" disabled={i === o.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer ${nome(k)}`}>↓</button>
              </span>
            </li>
          ))}
        </ul>
        <div className="linha">
          <button type="button" className="btn primario mini" disabled={salvando} onClick={() => salvar(o, esc)}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          <button type="button" className="btn mini" disabled={salvando} onClick={() => { const pad = blocos.map((b) => b.chave); setO(pad); setEsc(new Set()); salvar(pad, new Set()); }}>Restaurar padrão</button>
        </div>
      </div>
    </details>
  );
}

/** Seletor de competência: troca a URL (?comp=AAAA-MM) mantendo o resto. */
export function SeletorComp({ comp, opcoes, base = '/' }: { comp: string; opcoes: string[]; base?: string }) {
  const router = useRouter();
  return (
    <select aria-label="Competência" value={comp} onChange={(e) => router.push(`${base}${base.includes('?') ? '&' : '?'}comp=${e.target.value}`)}>
      {opcoes.map((c) => <option key={c} value={c}>{c.split('-').reverse().join('/')}</option>)}
    </select>
  );
}
