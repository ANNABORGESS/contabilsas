// Lê pacotes de skills (pasta com SKILL.md) e de agentes (.md com cabeçalho name/description)
// e devolve os especialistas que a ZARO guarda no banco. Roda no navegador e no servidor.

export interface Arquivo {
  caminho: string;
  texto: string;
}

export interface Especialista {
  tipo: 'skill' | 'agente';
  slug: string;
  nome: string;
  descricao: string;
  conteudo: string;
  pacote: string;
}

const LIMITE = 120_000;
const IGNORAR = /(^|\/)(node_modules|interface|\.git)\//;
const NAO_E_ESPECIALISTA = /^(readme|como-instalar|como_usar|mestre|license|licenca|changelog|contadores-readme|claude)\.md$/i;

/** Cabeçalho YAML simples (chave: valor numa linha só) e o corpo depois dele. */
export function lerCabecalho(texto: string): { campos: Record<string, string>; corpo: string } {
  const t = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  // tolera sujeira antes do primeiro --- (há pacote com "E---" na 1ª linha)
  const m = t.match(/^[^\n]{0,3}---\n([\s\S]*?)\n---\n?/);
  if (!m) return { campos: {}, corpo: t };
  const campos: Record<string, string> = {};
  for (const l of m[1].split('\n')) {
    const k = l.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (k) campos[k[1].toLowerCase()] = k[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
  return { campos, corpo: t.slice(m[0].length) };
}

const base = (c: string) => c.split('/').pop() || c;
const pasta = (c: string) => c.split('/').slice(0, -1).join('/');

/** Nomes que os próprios pacotes dão no catálogo: "### 01 — DAS Simples Nacional" + "**Slug:** `x`",
 *  ou listas "01 Simples Nacional · 02 Lucro Presumido". Chave: slug ou número de 2 dígitos. */
export function nomesDoCatalogo(textos: string[]) {
  const nomes = new Map<string, string>();
  for (const t of textos) {
    const linhas = t.replace(/\r\n/g, '\n').split('\n');
    linhas.forEach((l, i) => {
      const h = l.match(/^#{2,4}\s+(\d{2})\s+[—–-]\s+(.+?)\s*$/);
      if (h) {
        const titulo = h[2].replace(/[*_`]/g, '').trim();
        if (!nomes.has(h[1])) nomes.set(h[1], titulo);
        const slug = linhas.slice(i + 1, i + 4).join('\n').match(/\*\*Slug:\*\*\s*`([^`]+)`/)?.[1];
        if (slug) nomes.set(slug, titulo);
      }
      if (/^\s*[-*]\s+\d{2}\s/.test(l)) {
        for (const parte of l.replace(/^\s*[-*]\s+/, '').split('·')) {
          const m = parte.trim().match(/^(\d{2})\s+(.+)$/);
          if (m && !nomes.has(m[1])) nomes.set(m[1], m[2].replace(/[*_`]/g, '').trim());
        }
      }
    });
  }
  return nomes;
}

function nomeDe(corpo: string, slug: string, arquivo: string, catalogo: Map<string, string>) {
  const num = arquivo.match(/^(\d{2})[-_]/)?.[1];
  const doCatalogo = catalogo.get(slug) || (num ? catalogo.get(num) : undefined);
  if (doCatalogo) return doCatalogo;
  const h = corpo.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, '').replace(/^Skill:\s*/i, '').trim();
  if (h && h.length <= 80) return h;
  const s = slug.replace(/^\d+[-_]/, '').replace(/[-_]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function extrairEspecialistas(arquivos: Arquivo[], pacote: string): Especialista[] {
  const mds = arquivos
    .map((a) => ({ ...a, caminho: a.caminho.replace(/\\/g, '/').replace(/^\/+/, '') }))
    .filter((a) => /\.md$/i.test(a.caminho) && !IGNORAR.test(a.caminho));
  const pastasSkill = mds.filter((a) => base(a.caminho).toUpperCase() === 'SKILL.MD').map((a) => pasta(a.caminho));
  const dentroDeSkill = (c: string) => pastasSkill.some((p) => c === `${p}/${base(c)}` || c.startsWith(`${p}/`));
  const saida: Especialista[] = [];
  const catalogo = nomesDoCatalogo(mds.filter((a) => NAO_E_ESPECIALISTA.test(base(a.caminho))).map((a) => a.texto));

  for (const p of pastasSkill) {
    const principal = mds.find((a) => a.caminho === (p ? `${p}/SKILL.md` : 'SKILL.md') || (pasta(a.caminho) === p && base(a.caminho).toUpperCase() === 'SKILL.MD'))!;
    const { campos, corpo } = lerCabecalho(principal.texto);
    const slug = (campos.name || base(p) || 'skill').trim();
    const extras = mds
      .filter((a) => a !== principal && a.caminho.startsWith(`${p}/`) && !pastasSkill.some((q) => q !== p && q.startsWith(`${p}/`) && a.caminho.startsWith(`${q}/`)))
      .map((a) => `\n\n## Arquivo de apoio: ${a.caminho.slice(p.length + 1)}\n\n${lerCabecalho(a.texto).corpo}`);
    saida.push({ tipo: 'skill', slug, nome: nomeDe(corpo, slug, base(p), catalogo), descricao: campos.description || '', conteudo: (corpo + extras.join('')).slice(0, LIMITE), pacote });
  }

  for (const a of mds) {
    if (dentroDeSkill(a.caminho) || NAO_E_ESPECIALISTA.test(base(a.caminho))) continue;
    const { campos, corpo } = lerCabecalho(a.texto);
    if (!campos.name || !campos.description) continue;
    saida.push({ tipo: 'agente', slug: campos.name.trim(), nome: nomeDe(corpo, campos.name.trim(), base(a.caminho), catalogo), descricao: campos.description, conteudo: corpo.slice(0, LIMITE), pacote });
  }

  // o mesmo especialista pode vir repetido no pacote: fica o de conteúdo maior
  const unicos = new Map<string, Especialista>();
  for (const e of saida) {
    const k = `${e.tipo}|${e.slug}`;
    if (!unicos.has(k) || unicos.get(k)!.conteudo.length < e.conteudo.length) unicos.set(k, e);
  }
  return [...unicos.values()].sort((x, y) => x.slug.localeCompare(y.slug));
}
