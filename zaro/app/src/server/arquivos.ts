// Arquivos (XML, PDF, comprovantes) ficam em disco, fora do banco. Em produção, troque por
// um storage (S3, Supabase Storage) mantendo estas duas funções.
import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '@/db';
import { PASTA_DADOS, schema } from '@/db';

const PASTA = path.join(PASTA_DADOS, 'arquivos');

export async function guardarArquivo(db: Db, tenantId: string, nome: string, mime: string, conteudo: Buffer) {
  const limpo = nome.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'arquivo';
  const rel = path.join(tenantId, `${crypto.randomUUID()}-${limpo}`);
  await fs.mkdir(path.join(PASTA, tenantId), { recursive: true });
  await fs.writeFile(path.join(PASTA, rel), conteudo);
  const [a] = await db.insert(schema.arquivos).values({ tenantId, nome, mime, tamanho: conteudo.length, caminho: rel }).returning();
  return a;
}

export async function lerArquivo(caminho: string): Promise<Buffer> {
  const alvo = path.resolve(PASTA, caminho);
  if (!alvo.startsWith(PASTA + path.sep)) throw new Error('Caminho de arquivo inválido.');
  return fs.readFile(alvo);
}
