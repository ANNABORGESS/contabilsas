import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { INICIO } from '@/domain/papeis';
import { semUsuarios, usuarioAtual } from '@/server/auth';
import FormLogin from './FormLogin';

export const dynamic = 'force-dynamic';

export default async function Login() {
  if (await semUsuarios(await getDb())) redirect('/primeiro-acesso');
  const u = await usuarioAtual();
  if (u) redirect(INICIO[u.papel]);
  return (
    <main className="acesso tema-escuro">
      <div className="cartao formulario">
        <div className="logo">
          <span className="marca">🍺</span> Bar · Pedidos na mesa
        </div>
        <p className="mudo">Entre com seu usuário. Garçom, cozinha, bar e administração usam o mesmo endereço.</p>
        <FormLogin />
      </div>
    </main>
  );
}
