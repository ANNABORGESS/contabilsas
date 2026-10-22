import { count } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb, schema } from '@/db';
import { usuarioAtual } from '@/server/auth';
import { entrar } from '../acoes';

export const dynamic = 'force-dynamic';

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.usuarios);
  if (n === 0) redirect('/primeiro-acesso');
  if (await usuarioAtual()) redirect('/');
  const { erro } = await searchParams;
  return (
    <main className="acesso">
      <div className="card">
        <div className="marca" style={{ padding: '0 0 16px' }}>
          <b>ZARO</b>
          <span>Contabilidade inteligente. Gestão conectada.</span>
        </div>
        {erro && <div className="aviso erro">{erro}</div>}
        <form action={entrar} className="campos">
          <div><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
          <div><label htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" autoComplete="current-password" required /></div>
          <button className="btn primario" type="submit">Entrar</button>
        </form>
      </div>
    </main>
  );
}
