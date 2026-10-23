'use client';
import { useEffect } from 'react';

/** Abre a janela de impressão ao carregar (lá dá para escolher "Salvar como PDF"). */
export function Imprimir() {
  useEffect(() => { const t = setTimeout(() => window.print(), 600); return () => clearTimeout(t); }, []);
  return <button type="button" className="btn primario nao-imprimir" onClick={() => window.print()}>Imprimir / salvar PDF</button>;
}
