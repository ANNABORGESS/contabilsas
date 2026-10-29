import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/db';
import { semUsuarios } from '@/server/auth';
import { PERFIS } from '../../login/perfis';
import FormCadastro from './FormCadastro';

export const dynamic = 'force-dynamic';

/** Garçom ou bar criam a própria conta; o administrador aprova em Funcionários. */
export default async function Cadastro({ params }: { params: Promise<{ perfil: string }> }) {
  const { perfil } = await params;
  // a cozinha entra pelo link sem senha, então não cria conta
  const p = PERFIS.find((x) => x.papel === perfil && x.papel !== 'admin' && x.papel !== 'cozinha');
  if (!p) notFound();
  if (await semUsuarios(await getDb())) redirect('/primeiro-acesso');
  return (
    <main className="acesso tema-escuro">
      <div className="cartao formulario">
        <img src="/logo.jpg" alt="Vikings Restaurante" className="logo-media" />
        <div className="logo">
          <span className="marca">{p.icone}</span> Criar conta · {p.titulo}
        </div>
        <p className="mudo">Crie seu usuário e senha. Você consegue entrar assim que o administrador aprovar a sua conta.</p>
        <FormCadastro perfil={p.papel} />
        <a href={`/login/${p.papel}`} className="btn fantasma bloco">
          ‹ Já tenho conta
        </a>
      </div>
    </main>
  );
}
