// Dados do site público (tabela configuracoes, chave "site").
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { normalizarSite, type DadosSite } from '@/domain/site';
import type { Usuario } from './auth';
import { registrar } from './eventos';

const CHAVE = 'site';

export async function lerSite(db: Db): Promise<DadosSite> {
  const [r] = await db.select().from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE));
  return normalizarSite(r?.valor as Partial<DadosSite> | undefined);
}

export async function salvarSite(db: Db, u: Usuario, corpo: Record<string, unknown>) {
  const valor = normalizarSite(corpo);
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE, valor })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor, atualizadoEm: new Date() } });
  await registrar(db, { tipo: 'site_alterado', usuarioId: u.id, descricao: `${u.nome} atualizou os dados do site` });
  return valor;
}
