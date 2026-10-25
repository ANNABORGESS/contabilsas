'use client';
/** Perguntas prontas: um clique preenche o campo da pergunta. */
export function PerguntasProntas({ perguntas }: { perguntas: string[] }) {
  return (
    <div className="sugestoes-ia">
      {perguntas.map((p) => (
        <button key={p} type="button" className="chip ia" onClick={() => { const t = document.querySelector<HTMLTextAreaElement>('#pergunta'); if (t) { t.value = p; t.focus(); } }}>{p}</button>
      ))}
    </div>
  );
}
