'use client';
// Chamadas à API e sincronização em tempo real do lado do navegador.
import { useCallback, useEffect, useRef, useState } from 'react';

export class ErroApi extends Error {
  constructor(msg: string, readonly status: number) {
    super(msg);
  }
}

export async function api<T = unknown>(url: string, metodo: 'GET' | 'POST' | 'PATCH' = 'GET', corpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Confira o Wi-Fi e tente de novo.', 0);
  }
  const dados = (await r.json().catch(() => ({}))) as { erro?: string };
  if (r.status === 401 && typeof window !== 'undefined') {
    const area = window.location.pathname.split('/')[1];
    window.location.href = ['garcom', 'cozinha', 'bar', 'admin'].includes(area) ? `/login/${area}` : '/login';
  }
  if (!r.ok) throw new ErroApi(dados.erro || 'Não foi possível concluir.', r.status);
  return dados as T;
}

type Ouvinte = (v: number) => void;
const ouvintes = new Set<Ouvinte>();
const conexao = new Set<(ok: boolean) => void>();
let fonte: EventSource | null = null;
let versao = 0;
let conectado = false;

function abrir() {
  if (fonte || typeof window === 'undefined') return;
  fonte = new EventSource('/api/sync');
  fonte.onmessage = (e) => {
    const v = Number(e.data);
    if (!conectado) {
      conectado = true;
      conexao.forEach((f) => f(true));
    }
    if (Number.isFinite(v) && v !== versao) {
      versao = v;
      ouvintes.forEach((f) => f(v));
    }
  };
  fonte.onerror = () => {
    conectado = false;
    conexao.forEach((f) => f(false));
  };
}

/** Contador que avança sempre que algo muda no servidor (pedido, status, cardápio...). */
export function useVersao(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    abrir();
    const avancar = () => setN((x) => x + 1);
    ouvintes.add(avancar);
    // se a conexão em tempo real cair, ainda atualiza a cada 10 s
    const t = setInterval(() => !conectado && avancar(), 10000);
    return () => {
      ouvintes.delete(avancar);
      clearInterval(t);
    };
  }, []);
  return n;
}

export function useConectado(): boolean {
  const [ok, setOk] = useState(conectado);
  useEffect(() => {
    abrir();
    conexao.add(setOk);
    return () => {
      conexao.delete(setOk);
    };
  }, []);
  return ok;
}

/** Busca dados e busca de novo quando algo muda no servidor. */
export function useDados<T>(url: string | null) {
  const v = useVersao();
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const seq = useRef(0);
  const recarregar = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    try {
      const d = await api<T>(url);
      if (n === seq.current) {
        setDados(d);
        setErro(null);
      }
    } catch (e) {
      if (n === seq.current) setErro((e as Error).message);
    } finally {
      if (n === seq.current) setCarregando(false);
    }
  }, [url]);
  useEffect(() => {
    void recarregar();
  }, [recarregar, v]);
  return { dados, erro, carregando, recarregar };
}

/** UUID que funciona também em http na rede local (randomUUID exige https). */
export function novaChave(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let audio: AudioContext | null = null;
/** Libera o som no primeiro toque (os navegadores exigem um gesto). */
export function liberarSom() {
  try {
    audio ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
  } catch {}
}

export function bipar(vezes = 2) {
  try {
    liberarSom();
    if (!audio) return;
    for (let i = 0; i < vezes; i++) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      o.type = 'sine';
      const t = audio.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.22);
    }
  } catch {}
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {}
}

export async function sairDoSistema() {
  await api('/api/auth/sair', 'POST', {}).catch(() => {});
  const area = window.location.pathname.split('/')[1];
  window.location.href = ['garcom', 'cozinha', 'bar', 'admin'].includes(area) ? `/login/${area}` : '/login';
}
