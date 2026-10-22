import { count } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb, schema } from '@/db';
import { criarPrimeiroAcesso } from '../acoes';

export const dynamic = 'force-dynamic';

export default async function PrimeiroAcesso({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.usuarios);
  if (n > 0) redirect('/login');
  const { erro } = await searchParams;
  return (
    <main className="acesso">
      <div className="card">
        <h1 style={{ fontSize: 22 }}>Bem-vindo ao ZARO</h1>
        <p className="mudo">Primeiro acesso: crie o escritório e o seu usuário de administrador.</p>
        {erro && <div className="aviso erro">{erro}</div>}
        <form action={criarPrimeiroAcesso} className="campos">
          <div><label htmlFor="escritorio">Nome do escritório</label><input id="escritorio" name="escritorio" required /></div>
          <div><label htmlFor="nome">Seu nome</label><input id="nome" name="nome" required /></div>
          <div><label htmlFor="email">E-mail (usado para entrar)</label><input id="email" name="email" type="email" required /></div>
          <div><label htmlFor="senha">Senha (mínimo 8 caracteres)</label><input id="senha" name="senha" type="password" minLength={8} required /></div>
          <div><label htmlFor="senha2">Repita a senha</label><input id="senha2" name="senha2" type="password" minLength={8} required /></div>
          <button className="btn primario" type="submit">Criar e entrar</button>
        </form>
      </div>
    </main>
  );
}
