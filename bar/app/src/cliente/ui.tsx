'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { NOME_SITUACAO, NOME_STATUS, type SituacaoPedido, type StatusPreparo } from '@/domain/preparo';
import { NOME_SETOR, type Setor } from '@/domain/pedido';
import { sairDoSistema, useConectado } from './api';

export function Conexao() {
  const ok = useConectado();
  return (
    <span className={`conexao ${ok ? 'ok' : ''}`} title={ok ? 'Sincronizado em tempo real' : 'Reconectando…'}>
      <i />
      {ok ? 'Ao vivo' : 'Reconectando'}
    </span>
  );
}

export function BotaoSair() {
  return (
    <button type="button" className="btn fantasma pequeno" onClick={() => void sairDoSistema()}>
      Sair
    </button>
  );
}

export function Modal({ titulo, aoFechar, children, largura }: { titulo: string; aoFechar: () => void; children: ReactNode; largura?: number }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aoFechar]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={largura ? { maxWidth: largura } : undefined}>
        <header>
          <h2>{titulo}</h2>
          <button type="button" className="fechar" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </header>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'erro' | 'ok' | 'alerta'; children: ReactNode }) {
  return <div className={`aviso ${tipo}`}>{children}</div>;
}

export function ChipSituacao({ s }: { s: SituacaoPedido | string }) {
  return <span className={`chip sit-${s}`}>{NOME_SITUACAO[s as SituacaoPedido] || s}</span>;
}

export function ChipPreparo({ setor, status }: { setor: string; status: string }) {
  return (
    <span className={`chip st-${status}`}>
      {NOME_SETOR[setor as Setor] || setor}: {NOME_STATUS[status as StatusPreparo] || status}
    </span>
  );
}

const NOME_PEDIDO: Record<string, string> = { pago: 'Pago', cancelado: 'Cancelado', estornado: 'Estornado' };
export function ChipPedido({ status }: { status: string }) {
  return <span className={`chip ped-${status}`}>{NOME_PEDIDO[status] || status}</span>;
}

/** Relógio que atualiza a cada 20 s (para "há X min"). */
export function useAgora(ms = 20000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}

export { sairDoSistema };
