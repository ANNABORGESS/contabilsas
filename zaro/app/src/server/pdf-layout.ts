// Texto de PDF preservando as colunas: junta os pedaços pela linha (y) e separa pela distância (x).
// Extratos bancários dependem disso para distinguir histórico, valor e saldo.
import 'server-only';

export async function textoComLayout(conteudo: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(conteudo);
  const paginas: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const pedacos = (items as { str: string; transform: number[]; width: number }[])
      .filter((i) => i.str.trim())
      .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
    // agrupa por linha (tolerância de 2 pontos), de cima para baixo
    pedacos.sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas: (typeof pedacos)[] = [];
    for (const it of pedacos) {
      const l = linhas.find((ls) => Math.abs(ls[0].y - it.y) <= 2);
      if (l) l.push(it);
      else linhas.push([it]);
    }
    linhas.sort((a, b) => b[0].y - a[0].y);
    paginas.push(linhas.map((l) => {
      l.sort((a, b) => a.x - b.x);
      let out = '';
      let fim = 0;
      for (const it of l) {
        const col = Math.round(it.x / 4); // ~4 pontos por caractere
        out += out ? ' '.repeat(Math.max(1, col - fim)) : ' '.repeat(Math.max(0, col));
        out += it.s;
        fim = col + Math.max(it.s.length, Math.round(it.w / 4));
      }
      return out.replace(/\s+$/, '');
    }).join('\n'));
  }
  return paginas.join('\n\f\n');
}
