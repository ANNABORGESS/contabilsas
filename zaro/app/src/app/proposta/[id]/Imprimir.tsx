'use client';

export function Imprimir({ voltar }: { voltar: string }) {
  return (
    <div className="pp-acoes">
      <a href={voltar}>← Voltar</a>
      <button type="button" onClick={() => window.print()}>Salvar em PDF / Imprimir</button>
      <span>Na janela de impressão escolha “Salvar como PDF”, papel A4.</span>
    </div>
  );
}
