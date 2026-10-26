import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { semUsuarios } from '@/server/auth';
import FormPrimeiroAcesso from './FormPrimeiroAcesso';

export const dynamic = 'force-dynamic';

export default async function PrimeiroAcesso() {
  if (!(await semUsuarios(await getDb()))) redirect('/login');
  return (
    <main className="acesso tema-escuro">
      <div className="cartao formulario">
        <div className="logo">
          <span className="marca">🍺</span> Configurar o bar
        </div>
        <p className="mudo">Crie o usuário do administrador. Depois você cadastra garçons, cozinha e bar em Funcionários.</p>
        <FormPrimeiroAcesso />
      </div>
    </main>
  );
}
