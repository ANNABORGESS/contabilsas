'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Icone } from './Icone';
import { BotaoIa } from './ZaroIa';

/** Busca do topo: Ctrl K (ou ⌘K) põe o cursor nela; Enter abre a página de resultados. */
export function Busca({ inicial = '' }: { inicial?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus(); ref.current?.select(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
  return (
    <form className="busca" role="search" onSubmit={(e) => { e.preventDefault(); const q = ref.current?.value.trim(); if (q) router.push(`/busca?q=${encodeURIComponent(q)}`); }}>
      <Icone nome="busca" tam={17} cor="var(--texto-3)" />
      <input ref={ref} name="q" defaultValue={inicial} placeholder="Buscar NF, cliente, fornecedor, contrato, pedido…" aria-label="Buscar" />
      <kbd>Ctrl K</kbd>
    </form>
  );
}

export function Alertas({ vencidos, documentos }: { vencidos: number; documentos: number }) {
  const n = vencidos + documentos;
  const destino = documentos && !vencidos ? '/autopilot' : '/financeiro?tipo=pagar&f=vencidos';
  const dica = [vencidos && `${vencidos} título(s) a pagar vencido(s)`, documentos && `${documentos} documento(s) novo(s) no Autopilot`].filter(Boolean).join(' · ') || 'Nenhum alerta';
  return (
    <>
      <BotaoIa />
      <Link href={destino} className="icone-topo" title={dica} aria-label={dica}>
        <Icone nome="sino" tam={18} />
        {n > 0 && <span className="selo">{n > 99 ? '99+' : n}</span>}
      </Link>
    </>
  );
}

/** Botão "O que você quer fazer?" do Dashboard: leva o cursor para a busca do topo. */
export function AtalhoBusca() {
  return (
    <button type="button" className="atalho" onClick={() => document.querySelector<HTMLInputElement>('.busca input')?.focus()}>
      O que você quer fazer? <kbd>Ctrl K</kbd>
    </button>
  );
}
