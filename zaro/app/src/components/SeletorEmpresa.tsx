'use client';
import { useRef } from 'react';

export function SeletorEmpresa({ empresas, ativa, acao }: { empresas: { id: string; nome: string }[]; ativa?: string; acao: (f: FormData) => void }) {
  const form = useRef<HTMLFormElement>(null);
  if (!empresas.length) return <span className="mudo">Nenhuma empresa cadastrada</span>;
  return (
    <form ref={form} action={acao} className="seletor">
      <label htmlFor="empresa" className="rotulo">Empresa</label>
      <select id="empresa" name="empresa" defaultValue={ativa} onChange={() => form.current?.requestSubmit()}>
        {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
      </select>
    </form>
  );
}
