'use client';
import { useState } from 'react';
import { api } from '@/cliente/api';
import { Aviso } from '@/cliente/ui';
import type { Papel } from '@/domain/papeis';

export default function FormLogin({ perfil }: { perfil: Papel }) {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEnviando(true);
    setErro('');
    try {
      const r = await api<{ destino: string }>('/api/auth/entrar', 'POST', { usuario: f.get('usuario'), senha: f.get('senha'), perfil });
      window.location.href = r.destino;
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }
  return (
    <form className="formulario" onSubmit={enviar}>
      <label className="campo">
        Usuário
        <input name="usuario" autoComplete="username" autoCapitalize="none" autoCorrect="off" required autoFocus />
      </label>
      <label className="campo">
        Senha ou PIN
        <input name="senha" type="password" autoComplete="current-password" required />
      </label>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="btn primario grande bloco" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
