'use client';
// Campos do período que mudam conforme a escolha: ano só pede o ano; mês pede o mês; trimestre pede ano e
// trimestre; personalizado pede de/até. Tudo vira os mesmos parâmetros (per, ref, de, ate) do filtro.
import { useState } from 'react';

export function CamposPeriodo({ per, refMes, de, ate, anos }: { per: string; refMes: string; de?: string; ate?: string; anos: string[] }) {
  const [p, setP] = useState(per);
  const [ano, setAno] = useState(refMes.slice(0, 4));
  const [tri, setTri] = useState(String(Math.floor((+refMes.slice(5, 7) - 1) / 3) + 1));
  const refAno = `${ano}-12`;
  const refTri = `${ano}-${String(+tri * 3).padStart(2, '0')}`;
  const seletorAno = (
    <div><label>Ano</label><select value={ano} onChange={(e) => setAno(e.target.value)}>{anos.map((a) => <option key={a}>{a}</option>)}</select></div>
  );
  return (
    <>
      <div><label>Período</label>
        <select name="per" value={p} onChange={(e) => setP(e.target.value)}>
          <option value="mes">Mês</option><option value="tri">Trimestre</option><option value="ano">Ano</option><option value="pers">Personalizado</option>
        </select>
      </div>
      {p === 'mes' && <div><label>Mês</label><input type="month" name="ref" defaultValue={refMes} /></div>}
      {p === 'ano' && <>{seletorAno}<input type="hidden" name="ref" value={refAno} /></>}
      {p === 'tri' && (
        <>
          {seletorAno}
          <div><label>Trimestre</label><select value={tri} onChange={(e) => setTri(e.target.value)}>{['1', '2', '3', '4'].map((t) => <option key={t} value={t}>{t}º trimestre</option>)}</select></div>
          <input type="hidden" name="ref" value={refTri} />
        </>
      )}
      {p === 'pers' && (
        <>
          <div><label>De</label><input type="month" name="de" defaultValue={de} /></div>
          <div><label>Até</label><input type="month" name="ate" defaultValue={ate} /></div>
        </>
      )}
    </>
  );
}
