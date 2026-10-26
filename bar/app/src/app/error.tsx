'use client';
// Quando algo falha no servidor, mostra o caminho para o diagnóstico em vez de uma tela em branco.
export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="acesso tema-escuro">
      <div className="cartao formulario">
        <h2>Não foi possível abrir o sistema</h2>
        <p className="mudo">Abra o diagnóstico para ver o motivo e mande um print para o suporte.</p>
        <a className="btn primario bloco" href="/saude">
          Ver diagnóstico
        </a>
        <button className="btn bloco" onClick={reset}>
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
