'use client';
import { useRef, useState, useTransition } from 'react';
import type { DadosCnpj } from '@/server/cnpj';

type Empresa = {
  id?: string; cnpj?: string; razao?: string; fantasia?: string | null; regime?: string | null; regimeHist?: { regime: string; de?: string | null; ate?: string | null }[];
  ie?: string | null; im?: string | null; cidade?: string | null; uf?: string | null; cnae?: string | null; contador?: string | null; crc?: string | null; semEstoque?: boolean;
};
const REGIMES = ['', 'Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI'];

export function EmpresaForm({ empresa, salvar, consultar }: {
  empresa: Empresa;
  salvar: (f: FormData) => void;
  consultar: (cnpj: string) => Promise<{ ok: true; dados: DadosCnpj } | { ok: false; erro: string }>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [msg, setMsg] = useState('');
  const [pend, start] = useTransition();
  const hist = [...(empresa.regimeHist || []), {}, {}, {}, {}].slice(0, 4) as { regime?: string; de?: string | null; ate?: string | null }[];

  const buscar = () => start(async () => {
    const f = form.current!;
    const r = await consultar((f.elements.namedItem('cnpj') as HTMLInputElement).value);
    if (!r.ok) { setMsg(r.erro); return; }
    const set = (k: string, v: string) => { const el = f.elements.namedItem(k) as HTMLInputElement | null; if (el && v && !el.value) el.value = v; };
    set('razao', r.dados.razao); set('fantasia', r.dados.fantasia); set('cidade', r.dados.cidade); set('uf', r.dados.uf); set('cnae', r.dados.cnae); set('regime', r.dados.regime);
    setMsg(`Dados de ${r.dados.fonte}. Situação: ${r.dados.situacao || '—'}. Confira e salve.`);
  });

  return (
    <form ref={form} action={salvar} className="campos">
      {empresa.id && <input type="hidden" name="id" value={empresa.id} />}
      <div className="grade g3">
        <div>
          <label htmlFor="cnpj">CNPJ</label>
          <div className="linha" style={{ flexWrap: 'nowrap' }}>
            <input id="cnpj" name="cnpj" defaultValue={empresa.cnpj} required />
            <button type="button" className="btn" onClick={buscar} disabled={pend}>{pend ? 'Consultando…' : 'Consultar'}</button>
          </div>
        </div>
        <div><label htmlFor="razao">Razão social</label><input id="razao" name="razao" defaultValue={empresa.razao} required /></div>
        <div><label htmlFor="fantasia">Nome fantasia</label><input id="fantasia" name="fantasia" defaultValue={empresa.fantasia || ''} /></div>
      </div>
      {msg && <div className="aviso">{msg}</div>}
      <div className="grade g4">
        <div><label htmlFor="regime">Regime atual</label><select id="regime" name="regime" defaultValue={empresa.regime || ''}>{REGIMES.map((r) => <option key={r} value={r}>{r || '—'}</option>)}</select></div>
        <div><label htmlFor="ie">Inscrição estadual</label><input id="ie" name="ie" defaultValue={empresa.ie || ''} /></div>
        <div><label htmlFor="im">Inscrição municipal</label><input id="im" name="im" defaultValue={empresa.im || ''} /></div>
        <div><label htmlFor="cnae">CNAE</label><input id="cnae" name="cnae" defaultValue={empresa.cnae || ''} /></div>
        <div><label htmlFor="cidade">Cidade</label><input id="cidade" name="cidade" defaultValue={empresa.cidade || ''} /></div>
        <div><label htmlFor="uf">UF</label><input id="uf" name="uf" maxLength={2} defaultValue={empresa.uf || ''} /></div>
        <div><label htmlFor="contador">Contador responsável</label><input id="contador" name="contador" defaultValue={empresa.contador || ''} /></div>
        <div><label htmlFor="crc">CRC</label><input id="crc" name="crc" defaultValue={empresa.crc || ''} /></div>
      </div>
      <label className="linha" style={{ fontWeight: 500 }}>
        <input type="checkbox" name="semEstoque" defaultChecked={empresa.semEstoque !== false} /> Trabalha sob encomenda, sem estoque (compra de material vai direto para custo)
      </label>
      <div>
        <div className="rotulo" style={{ margin: '6px 0' }}>Histórico de regime (decide o regime de cada competência)</div>
        {hist.map((h, i) => (
          <div key={i} className="grade g3" style={{ marginBottom: 8 }}>
            <select name={`hr${i}`} defaultValue={h.regime || ''} aria-label="Regime">{REGIMES.map((r) => <option key={r} value={r}>{r || '—'}</option>)}</select>
            <input name={`hd${i}`} type="date" defaultValue={h.de || ''} aria-label="Desde" />
            <input name={`ha${i}`} type="date" defaultValue={h.ate || ''} aria-label="Até" />
          </div>
        ))}
        <p className="pequeno mudo">Ex.: Simples Nacional até 31/12/2025 e Lucro Presumido desde 01/01/2026. Deixe a data em branco quando não houver limite.</p>
      </div>
      <div><button className="btn primario" type="submit">Salvar empresa</button></div>
    </form>
  );
}
