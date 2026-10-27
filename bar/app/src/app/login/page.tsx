import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { semUsuarios } from '@/server/auth';
import { PERFIS } from './perfis';

export const dynamic = 'force-dynamic';

/** Escolha do perfil. Cada botão leva à entrada com usuário e senha daquele perfil. */
export default async function Login() {
  if (await semUsuarios(await getDb())) redirect('/primeiro-acesso');
  return (
    <main className="acesso tema-escuro">
      <div className="cartao formulario" style={{ maxWidth: 520 }}>
        <img src="/logo.jpg" alt="Vikings Restaurante" className="logo-grande" />
        <p className="mudo">Como você vai usar este aparelho?</p>
        <div className="perfis">
          {PERFIS.map((p) => (
            <a key={p.papel} href={`/login/${p.papel}`} className="perfil">
              <span className="icone">{p.icone}</span>
              <b>{p.titulo}</b>
              <span className="fraco">{p.texto}</span>
            </a>
          ))}
        </div>
        <p className="fraco">Dica: depois de escolher, salve a página nos favoritos (ou “Adicionar à tela inicial” no celular) para entrar direto da próxima vez.</p>
      </div>
    </main>
  );
}
