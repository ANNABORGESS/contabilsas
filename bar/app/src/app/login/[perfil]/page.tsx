import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/db';
import { INICIO, ehPapel, pode } from '@/domain/papeis';
import { semUsuarios, usuarioAtual } from '@/server/auth';
import FormLogin from '../FormLogin';
import { PERFIS } from '../perfis';

export const dynamic = 'force-dynamic';

export default async function LoginPerfil({ params }: { params: Promise<{ perfil: string }> }) {
  const { perfil } = await params;
  if (!ehPapel(perfil)) notFound();
  if (await semUsuarios(await getDb())) redirect('/primeiro-acesso');
  const u = await usuarioAtual();
  if (u && pode(u.papel, perfil)) redirect(INICIO[perfil]); // já entrou com um usuário deste perfil
  const p = PERFIS.find((x) => x.papel === perfil)!;
  return (
    <main className="acesso tema-escuro">
      <div className="cartao formulario">
        <div className="logo">
          <span className="marca">{p.icone}</span> Entrar como {p.titulo}
        </div>
        <p className="mudo">{p.texto}</p>
        {u && (
          <p className="fraco">
            Este aparelho está com {u.nome}. Entre com um usuário de {p.titulo.toLowerCase()} para trocar.
          </p>
        )}
        <FormLogin perfil={perfil} />
        <a href="/login" className="btn fantasma bloco">
          ‹ Escolher outro perfil
        </a>
      </div>
    </main>
  );
}
