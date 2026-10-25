'use client';
import { useEffect } from 'react';

/** Barra da tela (some na impressão): escolher o mês e salvar em PDF. Com ?pdf=1 abre a impressão sozinha. */
export function Acoes({ mes, auto, voltar }: { mes: string; auto: boolean; voltar: string }) {
  useEffect(() => { if (auto) setTimeout(() => window.print(), 600); }, [auto]);
  return (
    <form className="rf-acoes" action="/relatorio-mensal">
      <a href={voltar}>← Voltar</a>
      <label>Mês <input type="month" name="mes" defaultValue={mes} onChange={(e) => e.currentTarget.form?.requestSubmit()} /></label>
      <button type="button" onClick={() => window.print()}>Salvar em PDF / Imprimir</button>
      <span>Na janela de impressão escolha “Salvar como PDF”, papel A4 deitado.</span>
    </form>
  );
}
