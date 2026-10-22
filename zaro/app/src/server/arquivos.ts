// Arquivos (XML, PDF, comprovantes). No computador ficam em disco; na nuvem (DATABASE_URL),
// onde o disco do servidor é apagado a cada publicação, ficam no próprio banco.
import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '@/db';
import { PASTA_DADOS, schema } from '@/db';

const PASTA = path.join(PASTA_DADOS, 'arquivos');
const NO_BANCO = !!process.env.DATABASE_URL;

export async function guardarArquivo(db: Db, tenantId: string, nome: string, mime: string, conteudo: Buffer) {
  if (NO_BANCO) {
    const [a] = await db.insert(schema.arquivos).values({ tenantId, nome, mime, tamanho: conteudo.length, caminho: '', conteudo }).returning({ id: schema.arquivos.id });
    return a;
  }
  const limpo = nome.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'arquivo';
  const rel = path.join(tenantId, `${crypto.randomUUID()}-${limpo}`);
  await fs.mkdir(path.join(PASTA, tenantId), { recursive: true });
  await fs.writeFile(path.join(PASTA, rel), conteudo);
  const [a] = await db.insert(schema.arquivos).values({ tenantId, nome, mime, tamanho: conteudo.length, caminho: rel }).returning({ id: schema.arquivos.id });
  return a;
}

export async function lerArquivo(a: { caminho: string; conteudo?: Buffer | null }): Promise<Buffer> {
  if (a.conteudo) return Buffer.from(a.conteudo);
  const alvo = path.resolve(PASTA, a.caminho);
  if (!alvo.startsWith(PASTA + path.sep)) throw new Error('Caminho de arquivo inválido.');
  return fs.readFile(alvo);
}
