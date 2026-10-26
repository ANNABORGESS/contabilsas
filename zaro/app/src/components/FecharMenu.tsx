'use client';
import { useEffect } from 'react';

/** Botão X que fecha a caixa aberta pelo botão (details) em que está. */
export function FecharMenu() {
  return (
    <button type="button" className="fechar-menu" aria-label="Fechar" title="Fechar" onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}>×</button>
  );
}

/** Fecha as caixas abertas (.menu-acao) ao clicar fora, ao apertar Esc e ao abrir outra. */
export function MenusAcao() {
  useEffect(() => {
    const abertos = () => [...document.querySelectorAll<HTMLDetailsElement>('details.menu-acao[open], details.personalizar[open], details.cobrar[open]')];
    const clique = (e: MouseEvent) => abertos().forEach((d) => { if (!d.contains(e.target as Node)) d.removeAttribute('open'); });
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') abertos().forEach((d) => d.removeAttribute('open')); };
    document.addEventListener('click', clique);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('click', clique); document.removeEventListener('keydown', tecla); };
  }, []);
  return null;
}
