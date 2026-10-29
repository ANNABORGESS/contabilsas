'use client';
// Campo de busca de mesa (número, apelido ou cliente) com filtro por situação.
import type { FiltroMesa } from '@/domain/mesas';

export function BuscaMesa(props: { busca: string; setBusca: (v: string) => void; filtro: FiltroMesa; setFiltro: (f: FiltroMesa) => void; total: number; achadas: number }) {
  return (
    <div className="busca-mesa">
      <input
        type="search"
        inputMode="search"
        placeholder="🔍 Buscar mesa ou cliente"
        value={props.busca}
        onChange={(e) => props.setBusca(e.target.value)}
        aria-label="Buscar mesa"
      />
      <div className="filtros-rolagem">
        {(
          [
            ['todas', 'Todas'],
            ['com-pedido', 'Com pedido'],
            ['livres', 'Livres'],
          ] as const
        ).map(([k, nome]) => (
          <button key={k} type="button" className={props.filtro === k ? 'ativo' : ''} onClick={() => props.setFiltro(k)}>
            {nome}
          </button>
        ))}
        <span className="fraco" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>
          {props.achadas === props.total ? `${props.total} mesas` : `${props.achadas} de ${props.total}`}
        </span>
      </div>
    </div>
  );
}
