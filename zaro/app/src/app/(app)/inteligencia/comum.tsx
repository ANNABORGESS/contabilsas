import type { ReactNode } from 'react';
import type { Empresa, Usuario } from '@/server/auth';
import type { SP } from './page';

export type Props = { u: Usuario; emp: Empresa; sp: SP; hoje: string; edita: boolean };

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const mesCurto = (m: string) => `${MESES[+m.slice(5) - 1]}/${m.slice(2, 4)}`;
export const compBr = (c: string) => c.split('-').reverse().join('/');

/** Card de indicador das abas: rótulo, valor, variação/fonte e link de detalhe. */
export function Card({ rotulo, valor, cor, children, fonte }: { rotulo: string; valor: ReactNode; cor: string; children?: ReactNode; fonte: string }) {
  return (
    <div className="card indicador" data-cor={cor}>
      <div className="ind-topo"><span className="rotulo">{rotulo}</span></div>
      <div className="v">{valor}</div>
      <div className="ind-info">{children}</div>
      <div className="pequeno mudo">Fonte: {fonte}</div>
    </div>
  );
}

export function Var({ atual, antes, inverso, rotulo }: { atual: number | null; antes: number | null | undefined; inverso?: boolean; rotulo: string }) {
  if (atual == null || antes == null) return <span className="var mudo">sem base de comparação</span>;
  const d = atual - antes;
  const pct = antes ? Math.round((d / Math.abs(antes)) * 100) : null;
  const bom = inverso ? d < 0 : d > 0;
  return <span className={`var ${d === 0 ? 'mudo' : bom ? 'pos' : 'neg'}`}>{d > 0 ? '▲' : d < 0 ? '▼' : '='} {pct != null ? `${Math.abs(pct)}%` : '—'} <span className="mudo">{rotulo}</span></span>;
}
