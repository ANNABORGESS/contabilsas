// Mostra o Markdown das respostas da IA (títulos, listas, tabelas, código, negrito) sem usar HTML cru.
import { Fragment, type ReactNode } from 'react';

function inline(texto: string, k = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index! > ultimo) out.push(texto.slice(ultimo, m.index));
    const t = m[0];
    const chave = `${k}-${m.index}`;
    if (t.startsWith('**')) out.push(<b key={chave}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={chave}>{t.slice(1, -1)}</code>);
    else out.push(<i key={chave}>{t.slice(1, -1)}</i>);
    ultimo = m.index! + t.length;
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo));
  return out;
}

const celulas = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r\n/g, '\n').split('\n');
  const blocos: ReactNode[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('```')) {
      const ini = ++i;
      while (i < linhas.length && !linhas[i].startsWith('```')) i++;
      blocos.push(<pre key={i} className="md-pre">{linhas.slice(ini, i).join('\n')}</pre>);
      i++;
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const n = Math.min(h[1].length + 1, 4);
      const Tag = (`h${n}`) as 'h2' | 'h3' | 'h4';
      blocos.push(<Tag key={i} className="md-h">{inline(h[2], i)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] || '')) {
      const cab = celulas(l);
      i += 2;
      const corpo: string[][] = [];
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) corpo.push(celulas(linhas[i++]));
      const ehNum = (c: string) => /^[-R$\s\d.,%()]+$/.test(c) && /\d/.test(c);
      // coluna de números (todas as células preenchidas são valores) fica alinhada à direita, com o título junto
      const colNum = cab.map((_, k) => corpo.some((r) => r[k]) && corpo.every((r) => !r[k] || ehNum(r[k])));
      blocos.push(
        <div key={i} className="tabela-wrap md-tabela"><table>
          <thead><tr>{cab.map((c, k) => <th key={k} className={colNum[k] ? 'num' : undefined}>{inline(c, k)}</th>)}</tr></thead>
          <tbody>{corpo.map((r, a) => <tr key={a}>{r.map((c, k) => <td key={k} className={colNum[k] ? 'num' : undefined}>{inline(c, k)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordenada = /^\s*\d+[.)]/.test(l);
      const itens: string[] = [];
      while (i < linhas.length && /^\s*([-*+]|\d+[.)])\s+/.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
      const Lista = ordenada ? 'ol' : 'ul';
      blocos.push(<Lista key={i} className="md-lista">{itens.map((t, k) => <li key={k}>{inline(t, k)}</li>)}</Lista>);
      continue;
    }
    if (/^>\s?/.test(l)) {
      const cit: string[] = [];
      while (i < linhas.length && /^>\s?/.test(linhas[i])) cit.push(linhas[i++].replace(/^>\s?/, ''));
      blocos.push(<blockquote key={i} className="md-cit">{inline(cit.join(' '), i)}</blockquote>);
      continue;
    }
    if (/^-{3,}\s*$/.test(l)) { blocos.push(<hr key={i} />); i++; continue; }
    const par: string[] = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,4}\s|```|\s*([-*+]|\d+[.)])\s+|>\s?|\s*\|.*\|\s*$)/.test(linhas[i])) par.push(linhas[i++]);
    if (!par.length) par.push(linhas[i++]);
    blocos.push(<p key={i}>{par.map((t, k) => <Fragment key={k}>{k > 0 && <br />}{inline(t, k)}</Fragment>)}</p>);
  }
  return <div className="md">{blocos}</div>;
}
