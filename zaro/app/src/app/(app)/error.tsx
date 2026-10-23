'use client';
// Erro inesperado numa tela: mostra a mensagem e permite tentar de novo, sem derrubar o menu.
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" role="alert">
      <h2>Não foi possível carregar esta tela</h2>
      <p className="mudo">Os dados não foram alterados. Tente de novo; se continuar, avise o suporte com o código abaixo.</p>
      {error.digest && <p className="pequeno mudo">Código: {error.digest}</p>}
      <button type="button" className="btn primario" onClick={reset}>Tentar de novo</button>
    </div>
  );
}
