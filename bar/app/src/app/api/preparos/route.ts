import { pode } from '@/domain/papeis';
import { ehSetor } from '@/domain/pedido';
import { ErroRegra } from '@/server/erros';
import { rota } from '@/server/http';
import { painelSetor } from '@/server/preparo';

export const GET = rota(['cozinha', 'bar'], async ({ db, u, req }) => {
  const setor = req.nextUrl.searchParams.get('setor');
  if (!ehSetor(setor)) throw new ErroRegra('Setor inválido.');
  if (!pode(u.papel, setor)) throw new ErroRegra('Seu perfil é de outro setor.', 403);
  return painelSetor(db, setor);
});
