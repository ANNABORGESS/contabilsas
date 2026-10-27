'use client';
import { useEffect } from 'react';

export function Imprimir({ voltar }: { voltar: string }) {
  useEffect(() => { const t = setTimeout(() => window.print(), 700); return () => clearTimeout(t); }, []);
  return (
    <div className="rd-acoes">
      <a href={voltar}>← Voltar</a>
      <button type="button" onClick={() => window.print()}>Salvar em PDF / Imprimir</button>
      <span>Na janela de impressão escolha “Salvar como PDF”, papel A4.</span>
    </div>
  );
}
