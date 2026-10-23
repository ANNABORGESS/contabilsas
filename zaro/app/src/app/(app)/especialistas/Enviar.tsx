'use client';
import { strFromU8, unzipSync } from 'fflate';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { extrairEspecialistas, type Arquivo, type Especialista } from '@/domain/especialistas';
import { enviarLote } from './acoes';

const LOTE = 700_000; // caracteres por envio, abaixo do limite de upload da Vercel

/** Abre os zips no próprio navegador e manda só os textos das skills e agentes, em lotes. */
export function Enviar() {
  const [estado, setEstado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();

  async function aoEscolher(lista: FileList | null) {
    if (!lista?.length) return;
    setOcupado(true);
    let total = 0;
    try {
      for (const f of Array.from(lista)) {
        setEstado(`Abrindo ${f.name}…`);
        let arquivos: Arquivo[] = [];
        if (/\.zip$/i.test(f.name)) {
          const zip = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (x) => /\.md$/i.test(x.name) && !/(^|\/)(node_modules|interface)\//.test(x.name) && x.originalSize < 600_000 });
          arquivos = Object.entries(zip).map(([caminho, b]) => ({ caminho, texto: strFromU8(b) }));
        } else if (/\.md$/i.test(f.name)) {
          arquivos = [{ caminho: f.name, texto: await f.text() }];
        }
        const achados = extrairEspecialistas(arquivos, f.name);
        if (!achados.length) { setEstado(`${f.name}: nenhuma skill ou agente encontrado.`); continue; }
        const lotes: Especialista[][] = [[]];
        let tam = 0;
        for (const e of achados) {
          if (tam + e.conteudo.length > LOTE && lotes[lotes.length - 1].length) { lotes.push([]); tam = 0; }
          lotes[lotes.length - 1].push(e);
          tam += e.conteudo.length;
        }
        for (const [k, l] of lotes.entries()) {
          setEstado(`${f.name}: enviando parte ${k + 1} de ${lotes.length}…`);
          const r = await enviarLote(l, f.name);
          if ('erro' in r) throw new Error(r.erro);
          total += r.n;
        }
      }
      setEstado(`Pronto: ${total} especialista(s) guardado(s) na ZARO.`);
      router.refresh();
    } catch (e) {
      setEstado(`Erro: ${(e as Error).message}`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="campos">
      <label htmlFor="pacotes">Pacotes de skills e agentes (.zip ou .md)</label>
      <input id="pacotes" type="file" accept=".zip,.md" multiple disabled={ocupado} onChange={(e) => aoEscolher(e.target.files)} />
      {estado && <div className={`aviso ${estado.startsWith('Erro') ? 'erro' : estado.startsWith('Pronto') ? 'ok' : ''}`} style={{ margin: 0 }}>{estado}</div>}
    </div>
  );
}
