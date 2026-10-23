/** Esqueleto mostrado enquanto os dados carregam (também usado pelos blocos do Dashboard). */
export function Esqueleto() {
  return (
    <div className="painel-grade" aria-busy="true" aria-label="Carregando">
      <div className="largo indicadores">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="card esqueleto" style={{ height: 150 }} />)}</div>
      {[1, 2, 3, 4].map((i) => <div key={i} className="card esqueleto" style={{ height: 280 }} />)}
    </div>
  );
}

export default function Carregando() {
  return <Esqueleto />;
}
