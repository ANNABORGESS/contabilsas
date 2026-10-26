'use client';
import { useState } from 'react';
import { api } from '@/cliente/api';
import { Aviso } from '@/cliente/ui';

export default function FormPrimeiroAcesso() {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get('senha') !== f.get('senha2')) return setErro('As senhas não conferem.');
    setEnviando(true);
    setErro('');
    try {
      const r = await api<{ destino: string }>('/api/auth/primeiro-acesso', 'POST', {
        nome: f.get('nome'),
        usuario: f.get('usuario'),
        senha: f.get('senha'),
        mesas: Number(f.get('mesas')),
        exemplo: f.get('exemplo') === 'on',
      });
      window.location.href = r.destino;
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }
  return (
    <form className="formulario" onSubmit={enviar}>
      <label className="campo">
        Seu nome
        <input name="nome" required autoFocus />
      </label>
      <label className="campo">
        Usuário (para entrar)
        <input name="usuario" autoCapitalize="none" autoCorrect="off" placeholder="ex.: admin" required />
      </label>
      <div className="linha-campos">
        <label className="campo">
          Senha
          <input name="senha" type="password" minLength={4} required />
        </label>
        <label className="campo">
          Repita a senha
          <input name="senha2" type="password" minLength={4} required />
        </label>
      </div>
      <label className="campo">
        Quantas mesas o bar tem?
        <input name="mesas" type="number" min={1} max={200} defaultValue={10} required />
      </label>
      <label className="fila">
        <input type="checkbox" name="exemplo" defaultChecked /> Criar um cardápio de exemplo (petiscos e bebidas) para testar
      </label>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="btn primario grande bloco" disabled={enviando}>
        {enviando ? 'Configurando…' : 'Começar'}
      </button>
    </form>
  );
}
