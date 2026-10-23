'use client';
// Gráfico de barras e linhas em SVG puro (sem biblioteca): um eixo só, marcas finas, legenda,
// dica ao passar o cursor e alternância para tabela. As cores vêm das séries; o texto usa os tokens.
import { useMemo, useState } from 'react';

export interface Serie {
  nome: string;
  cor: string;
  tipo: 'barra' | 'linha';
  valores: (number | null)[];
  /** a partir deste índice a linha é projeção (tracejada) */
  projetadoDesde?: number;
}

type Formato = 'brl' | 'pct';

const fmt = (v: number, f: Formato) =>
  f === 'pct' ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const curto = (v: number, f: Formato) => {
  if (f === 'pct') return `${Math.round(v)}%`;
  const a = Math.abs(v);
  return (v < 0 ? '−' : '') + (a >= 1e6 ? `${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : a >= 1e3 ? `${Math.round(a / 1e3)} mil` : `${Math.round(a)}`);
};

function escala(min: number, max: number) {
  const lo = Math.min(0, min), hi = Math.max(0, max);
  const passo0 = (hi - lo || 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(passo0));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= passo0)!;
  const ini = Math.floor(lo / passo) * passo, fim = Math.ceil(hi / passo) * passo;
  const ticks: number[] = [];
  for (let t = ini; t <= fim + passo / 2; t += passo) ticks.push(Math.round(t * 100) / 100);
  return { ini, fim: fim === ini ? ini + passo : fim, ticks };
}

export function Grafico({
  titulo, categorias, series, formato = 'brl', referencia, janelas, janelaInicial, altura = 240, rotulos,
}: {
  titulo: string;
  categorias: string[];
  series: Serie[];
  formato?: Formato;
  referencia?: { valor: number; rotulo: string };
  /** opções de "últimos N" (ex.: 3, 6, 12) */
  janelas?: number[];
  janelaInicial?: number;
  altura?: number;
  /** rótulo completo de cada categoria para a dica e a tabela */
  rotulos?: string[];
}) {
  const [n, setN] = useState(janelaInicial || categorias.length);
  const [tabela, setTabela] = useState(false);
  const [foco, setFoco] = useState<number | null>(null);
  const ini = Math.max(0, categorias.length - n);
  const cats = categorias.slice(ini);
  const nomes = (rotulos || categorias).slice(ini);
  const ss = series.map((s) => ({ ...s, valores: s.valores.slice(ini), projetadoDesde: s.projetadoDesde != null ? s.projetadoDesde - ini : undefined }));
  const todos = ss.flatMap((s) => s.valores.filter((v): v is number => v != null)).concat(referencia ? [referencia.valor] : []);
  const { ini: y0, fim: y1, ticks } = useMemo(() => escala(Math.min(0, ...todos), Math.max(0, ...todos)), [todos.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const L = 56, R = 12, T = 12, B = 28, W = 640, H = altura;
  const larg = (W - L - R) / Math.max(1, cats.length);
  const y = (v: number) => T + ((y1 - v) / (y1 - y0)) * (H - T - B);
  const barras = ss.filter((s) => s.tipo === 'barra');
  const lb = Math.min(24, Math.max(6, (larg * 0.7) / Math.max(1, barras.length) - 2));
  const passoRotulo = Math.ceil(cats.length / 12);
  const vazio = !todos.some((v) => v !== 0);

  return (
    <div className="grafico">
      <div className="grafico-topo">
        <div className="legenda" aria-hidden={tabela}>
          {ss.map((s) => (
            <span key={s.nome}><i style={{ background: s.cor, height: s.tipo === 'linha' ? 3 : 10, borderRadius: s.tipo === 'linha' ? 2 : 3 }} />{s.nome}</span>
          ))}
          {referencia && <span><i className="ref" />{referencia.rotulo}</span>}
        </div>
        <div className="grafico-acoes">
          {janelas && janelas.map((j) => <button key={j} type="button" className={`chip ${n === j ? 'ativo' : ''}`} onClick={() => setN(j)} aria-pressed={n === j}>{j}m</button>)}
          <button type="button" className="chip" onClick={() => setTabela(!tabela)} aria-pressed={tabela}>{tabela ? 'Gráfico' : 'Tabela'}</button>
        </div>
      </div>
      {tabela ? (
        <div className="tabela-wrap"><table>
          <thead><tr><th>Período</th>{ss.map((s) => <th key={s.nome} className="num">{s.nome}</th>)}</tr></thead>
          <tbody>{nomes.map((c, i) => <tr key={c + i}><td>{c}</td>{ss.map((s) => <td key={s.nome} className={`num ${(s.valores[i] ?? 0) < 0 ? 'neg' : ''}`}>{s.valores[i] == null ? '—' : fmt(s.valores[i]!, formato)}{s.projetadoDesde != null && i >= s.projetadoDesde ? ' (proj.)' : ''}</td>)}</tr>)}</tbody>
        </table></div>
      ) : vazio ? (
        <div className="vazio">Sem movimentos no período para desenhar o gráfico.</div>
      ) : (
        <div className="grafico-area">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo} onMouseLeave={() => setFoco(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--grafico-zero)' : 'var(--grafico-grade)'} strokeWidth={1} />
                <text x={L - 8} y={y(t) + 4} textAnchor="end" className="eixo">{curto(t, formato)}</text>
              </g>
            ))}
            {referencia && (
              <g>
                <line x1={L} x2={W - R} y1={y(referencia.valor)} y2={y(referencia.valor)} stroke="var(--texto-3)" strokeDasharray="4 4" strokeWidth={1.5} />
              </g>
            )}
            {cats.map((c, i) => {
              const cx = L + larg * i + larg / 2;
              return (
                <g key={c + i}>
                  {foco === i && <rect x={L + larg * i} y={T} width={larg} height={H - T - B} fill="var(--grafico-foco)" />}
                  {barras.map((s, k) => {
                    const v = s.valores[i];
                    if (v == null || v === 0) return null;
                    const x = cx - (barras.length * (lb + 2)) / 2 + k * (lb + 2) + 1;
                    const top = y(Math.max(0, v)), base = y(Math.min(0, v));
                    const h = Math.max(1, base - top);
                    const r = Math.min(4, h / 2, lb / 2);
                    // ponta arredondada só do lado oposto à linha de base
                    const d = v >= 0
                      ? `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + lb - r}Q${x + lb},${top} ${x + lb},${top + r}V${base}Z`
                      : `M${x},${top}V${base - r}Q${x},${base} ${x + r},${base}H${x + lb - r}Q${x + lb},${base} ${x + lb},${base - r}V${top}Z`;
                    return <path key={s.nome} d={d} fill={s.cor} opacity={s.projetadoDesde != null && i >= s.projetadoDesde ? 0.55 : 1} />;
                  })}
                  {i % passoRotulo === 0 && <text x={cx} y={H - 8} textAnchor="middle" className="eixo">{c}</text>}
                </g>
              );
            })}
            {ss.filter((s) => s.tipo === 'linha').map((s) => {
              const pts = s.valores.map((v, i) => (v == null ? null : ([L + larg * i + larg / 2, y(v)] as const)));
              const seg = (de: number, ate: number) => pts.slice(de, ate).filter(Boolean).map((p, k) => `${k ? 'L' : 'M'}${p![0]},${p![1]}`).join('');
              const corte = s.projetadoDesde ?? pts.length;
              return (
                <g key={s.nome}>
                  <path d={seg(0, corte)} fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" />
                  {corte < pts.length && <path d={seg(Math.max(0, corte - 1), pts.length)} fill="none" stroke={s.cor} strokeWidth={2} strokeDasharray="5 4" />}
                  {pts.map((p, i) => p && (foco === i || (s.valores[i]! < 0) || pts.length <= 14) && (
                    <circle key={i} cx={p[0]} cy={p[1]} r={s.valores[i]! < 0 ? 5 : 4} fill={s.valores[i]! < 0 ? 'var(--neg)' : s.cor} stroke="var(--card)" strokeWidth={2} />
                  ))}
                </g>
              );
            })}
            {cats.map((c, i) => (
              <rect key={'h' + i} x={L + larg * i} y={T} width={larg} height={H - T - B} fill="transparent" onMouseEnter={() => setFoco(i)} onFocus={() => setFoco(i)} tabIndex={-1} />
            ))}
          </svg>
          {foco != null && (
            <div className="dica" style={{ left: `${((L + larg * foco + larg / 2) / W) * 100}%` }}>
              <b>{nomes[foco]}</b>
              {ss.map((s) => s.valores[foco] != null && (
                <div key={s.nome}><i style={{ background: s.cor }} />{s.nome}: <b>{fmt(s.valores[foco]!, formato)}</b>{s.projetadoDesde != null && foco >= s.projetadoDesde ? ' · previsto' : ''}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Barras horizontais (composição, faixas, desvios): rótulo, barra e valor; sem eixo duplo. */
export function BarrasH({ itens, formato = 'brl', total }: { itens: { rotulo: string; valor: number; cor: string; extra?: string; href?: string }[]; formato?: Formato; total?: number }) {
  const max = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  if (!itens.length) return <div className="vazio">Sem dados para mostrar.</div>;
  return (
    <div className="barrash">
      {itens.map((i) => {
        const pct = (Math.abs(i.valor) / max) * 100;
        const conteudo = (
          <>
            <span className="r">{i.rotulo}</span>
            <span className="trilho"><span style={{ width: `${Math.max(1, pct)}%`, background: i.cor }} /></span>
            <span className={`v ${i.valor < 0 ? 'neg' : ''}`}>{fmt(i.valor, formato)}{total ? <small> · {Math.round((i.valor / total) * 1000) / 10}%</small> : null}{i.extra ? <small> · {i.extra}</small> : null}</span>
          </>
        );
        return i.href ? <a key={i.rotulo} href={i.href} className="barrash-l">{conteudo}</a> : <div key={i.rotulo} className="barrash-l">{conteudo}</div>;
      })}
    </div>
  );
}
