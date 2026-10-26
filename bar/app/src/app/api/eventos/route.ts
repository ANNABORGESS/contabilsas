import { desc, eq } from 'drizzle-orm';
import { schema } from '@/db';
import { rota } from '@/server/http';

/** Últimos acontecimentos (auditoria). */
export const GET = rota(['admin'], async ({ db }) => ({
  eventos: await db
    .select({ id: schema.eventos.id, tipo: schema.eventos.tipo, descricao: schema.eventos.descricao, criadoEm: schema.eventos.criadoEm, pedidoId: schema.eventos.pedidoId, usuario: schema.usuarios.nome })
    .from(schema.eventos)
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.eventos.usuarioId))
    .orderBy(desc(schema.eventos.id))
    .limit(300),
}));
