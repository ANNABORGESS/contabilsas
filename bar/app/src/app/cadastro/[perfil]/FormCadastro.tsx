'use client';
import { useState } from 'react';
import { api } from '@/cliente/api';
import { Aviso } from '@/cliente/ui';

export default function FormCadastro({ perfil }: { perfil: string }) {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<{ usuario: string } | null>(null);
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get('senha') !== f.get('senha2')) return setErro('As senhas não conferem.');
    setEnviando(true);
    setErro('');
    try {
      const r = await api<{ conta: { usuario: string } }>('/api/auth/cadastro', 'POST', { nome: f.get('nome'), usuario: f.get('usuario'), senha: f.get('senha'), papel: perfil });
      setPronto(r.conta);
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }
  if (pronto)
    return (
      <div className="formulario">
        <Aviso tipo="ok">
          Conta criada! Seu usuário é <b>{pronto.usuario}</b>. Agora peça ao administrador para <b>aprovar</b> a sua conta em Funcionários. Depois disso é só entrar.
        </Aviso>
        <a href={`/login/${perfil}`} className="btn primario grande bloco">
          Ir para a entrada
        </a>
      </div>
    );
  return (
    <form className="formulario" onSubmit={enviar}>
      <label className="campo">
        Seu nome
        <input name="nome" required maxLength={60} autoFocus autoCapitalize="words" />
      </label>
      <label className="campo">
        Usuário (para entrar)
        <input name="usuario" required autoCapitalize="none" autoCorrect="off" placeholder="ex.: joao, ana.paula" />
      </label>
      <div className="linha-campos">
        <label className="campo">
          Senha ou PIN
          <input name="senha" type="password" minLength={4} required autoComplete="new-password" />
        </label>
        <label className="campo">
          Repita
          <input name="senha2" type="password" minLength={4} required autoComplete="new-password" />
        </label>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="btn primario grande bloco" disabled={enviando}>
        {enviando ? 'Criando…' : 'Criar minha conta'}
      </button>
    </form>
  );
}
