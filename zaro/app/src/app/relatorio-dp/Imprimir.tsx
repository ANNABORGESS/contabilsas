'use client';

export function Imprimir() {
  return (
    <div className="rd-acoes">
      <a href="/pessoal?aba=relatorios">← Voltar</a>
      <button type="button" onClick={() => window.print()}>Salvar em PDF / Imprimir</button>
      <span>Na janela de impressão escolha “Salvar como PDF”, papel A4.</span>
    </div>
  );
}
