import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { lerArquivo } from '@/server/arquivos';
import { usuarioAtual } from '@/server/auth';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u) return new Response('Faça login.', { status: 401 });
  const { id } = await params;
  const db = await getDb();
  const [a] = await db.select().from(schema.arquivos).where(and(eq(schema.arquivos.id, id), eq(schema.arquivos.tenantId, u.tenantId)));
  if (!a) return new Response('Arquivo não encontrado.', { status: 404 });
  const conteudo = await lerArquivo(a);
  return new Response(new Uint8Array(conteudo), {
    headers: {
      'Content-Type': a.mime || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
