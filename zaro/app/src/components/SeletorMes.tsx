'use client';
import { useRef } from 'react';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nome = (m: string) => `${MESES[Number(m.slice(5)) - 1]} de ${m.slice(0, 4)}`;

/** Mês do topo: filtra listas e relatórios pelo mês escolhido (ou todos). */
export function SeletorMes({ mes, opcoes, acao }: { mes: string | null; opcoes: string[]; acao: (f: FormData) => void }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={acao} className="seletor seletor-mes">
      <label htmlFor="mes-topo" className="rotulo">Mês</label>
      <select id="mes-topo" name="mes" defaultValue={mes || ''} onChange={() => form.current?.requestSubmit()}>
        <option value="">Todos os meses</option>
        {opcoes.map((m) => <option key={m} value={m}>{nome(m)}</option>)}
      </select>
    </form>
  );
}
