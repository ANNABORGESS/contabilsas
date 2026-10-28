'use client';
// Dados do site público: nome, frase, endereço, WhatsApp, Instagram e horário.
import { useEffect, useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { Aviso } from '@/cliente/ui';
import type { DadosSite } from '@/domain/site';
import { Cabecalho } from '../comum';

export default function SiteAdmin() {
  const { dados, erro } = useDados<{ site: DadosSite }>('/api/site');
  const [form, setForm] = useState<DadosSite | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (dados && !form) setForm(dados.site);
  }, [dados, form]);
  const muda = (k: keyof DadosSite) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => form && setForm({ ...form, [k]: e.target.value });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSalvando(true);
    setMsg(null);
    try {
      const r = await api<{ site: DadosSite }>('/api/site', 'PATCH', form);
      setForm(r.site);
      setMsg({ tipo: 'ok', texto: 'Site atualizado. Abra o site para ver como ficou.' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Cabecalho titulo="Site do restaurante" sub="O que os clientes veem em sistemabar-nu.vercel.app. O cardápio do site é o mesmo do sistema e atualiza sozinho.">
        <a className="btn" href="/" target="_blank" rel="noreferrer">
          Ver o site ↗
        </a>
      </Cabecalho>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {form && (
        <form className="cartao formulario" onSubmit={salvar} style={{ maxWidth: 760 }}>
          <div className="linha-campos">
            <label className="campo">
              Nome do restaurante
              <input value={form.nome} onChange={muda('nome')} maxLength={60} required />
            </label>
            <label className="campo">
              WhatsApp (com DDD)
              <input value={form.whatsapp} onChange={muda('whatsapp')} inputMode="tel" placeholder="ex.: (92) 99999-0000" />
            </label>
            <label className="campo">
              Instagram
              <input value={form.instagram} onChange={muda('instagram')} placeholder="ex.: @vikingsrestaurante" />
            </label>
          </div>
          <label className="campo">
            Frase de destaque
            <input value={form.slogan} onChange={muda('slogan')} maxLength={160} />
          </label>
          <div className="linha-campos">
            <label className="campo">
              Endereço
              <input value={form.endereco} onChange={muda('endereco')} maxLength={160} placeholder="ex.: Rua das Flores, 123 - Centro" />
            </label>
            <label className="campo">
              Cidade
              <input value={form.cidade} onChange={muda('cidade')} maxLength={80} placeholder="ex.: Manaus - AM" />
            </label>
          </div>
          <label className="campo">
            Horário de funcionamento (uma linha por dia ou faixa)
            <textarea rows={4} value={form.horario} onChange={muda('horario')} maxLength={400} />
          </label>
          <label className="campo">
            Sobre o restaurante (opcional)
            <textarea rows={3} value={form.sobre} onChange={muda('sobre')} maxLength={600} />
          </label>
          <label className="fila">
            <input type="checkbox" checked={form.mostrarPrecos} onChange={(e) => setForm({ ...form, mostrarPrecos: e.target.checked })} /> Mostrar os preços no cardápio do site
          </label>
          {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
          <div className="fila">
            <button className="btn primario" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
