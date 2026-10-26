'use client';
import { useRef, useState, useTransition } from 'react';
import type { DadosCnpj } from '@/server/cnpj';

export type ParceiroEdit = { id?: string; razao?: string; fantasia?: string | null; doc?: string | null; categoria?: string | null; dados?: Record<string, unknown> };

/** Formulário de cliente/fornecedor; com CNPJ, "Consultar" traz razão social, fantasia e cidade da Receita. */
export function ParceiroForm({ tipo, parceiro, salvar, consultar }: {
  tipo: 'cliente' | 'fornecedor';
  parceiro: ParceiroEdit;
  salvar: (f: FormData) => Promise<void>;
  consultar: (cnpj: string) => Promise<{ ok: true; dados: DadosCnpj } | { ok: false; erro: string }>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [msg, setMsg] = useState('');
  const [pend, start] = useTransition();
  const d = (parceiro.dados || {}) as Record<string, string>;
  const buscar = () => start(async () => {
    const f = form.current!;
    const r = await consultar((f.elements.namedItem('doc') as HTMLInputElement).value);
    if (!r.ok) { setMsg(r.erro); return; }
    const set = (k: string, v: string) => { const el = f.elements.namedItem(k) as HTMLInputElement | null; if (el && v && !el.value) el.value = v; };
    set('razao', r.dados.razao); set('fantasia', r.dados.fantasia); set('cidade', r.dados.cidade); set('uf', r.dados.uf);
    setMsg(`Dados de ${r.dados.fonte}. Situação: ${r.dados.situacao || '—'}. Confira e salve.`);
  });
  return (
    <form ref={form} action={salvar} className="campos">
      <input type="hidden" name="tipo" value={tipo} />
      {parceiro.id && <input type="hidden" name="id" value={parceiro.id} />}
      <div className="grade g3">
        <div>
          <label htmlFor="p-doc">CNPJ ou CPF</label>
          <div className="linha" style={{ flexWrap: 'nowrap' }}>
            <input id="p-doc" name="doc" defaultValue={parceiro.doc || ''} inputMode="numeric" />
            <button type="button" className="btn" onClick={buscar} disabled={pend}>{pend ? 'Consultando…' : 'Consultar'}</button>
          </div>
        </div>
        <div><label htmlFor="p-razao">Razão social / nome</label><input id="p-razao" name="razao" defaultValue={parceiro.razao || ''} required /></div>
        <div><label htmlFor="p-fant">Nome fantasia</label><input id="p-fant" name="fantasia" defaultValue={parceiro.fantasia || ''} /></div>
      </div>
      {msg && <div className="aviso">{msg}</div>}
      <div className="grade g4">
        <div><label htmlFor="p-cat">Categoria</label><input id="p-cat" name="categoria" defaultValue={parceiro.categoria || ''} placeholder={tipo === 'cliente' ? 'Ex.: Indústria, Revenda' : 'Ex.: Matéria-prima, Serviços'} /></div>
        <div><label htmlFor="p-contato">Contato</label><input id="p-contato" name="contato" defaultValue={d.contato || ''} placeholder="Nome de quem atende" /></div>
        <div><label htmlFor="p-email">E-mail</label><input id="p-email" name="email" type="email" defaultValue={d.email || ''} /></div>
        <div><label htmlFor="p-tel">Telefone / WhatsApp</label><input id="p-tel" name="telefone" defaultValue={d.telefone || ''} /></div>
        <div><label htmlFor="p-cid">Cidade</label><input id="p-cid" name="cidade" defaultValue={d.cidade || ''} /></div>
        <div><label htmlFor="p-uf">UF</label><input id="p-uf" name="uf" maxLength={2} defaultValue={d.uf || ''} /></div>
        <div style={{ gridColumn: 'span 2' }}><label htmlFor="p-obs">Observação</label><input id="p-obs" name="obs" defaultValue={d.obs || ''} placeholder="Condição de pagamento combinada, prazo…" /></div>
      </div>
      <div><button className="btn primario" type="submit">{parceiro.id ? 'Salvar alterações' : tipo === 'cliente' ? 'Cadastrar cliente' : 'Cadastrar fornecedor'}</button></div>
    </form>
  );
}
