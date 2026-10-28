// Dados do site público do restaurante, editados pelo administrador.

export interface DadosSite {
  nome: string;
  slogan: string;
  sobre: string;
  endereco: string;
  cidade: string;
  whatsapp: string; // só números, com DDD
  instagram: string; // sem @
  horario: string; // uma linha por dia/faixa
  mostrarPrecos: boolean;
}

export const SITE_PADRAO: DadosSite = {
  nome: 'Vikings Restaurante',
  slogan: 'Petiscos, chopp gelado e drinks. Peça na mesa e pague na hora, sem comanda.',
  sobre: 'Um lugar para chegar com os amigos, pedir sem fila e curtir. Cada pedido vai direto do celular do garçom para a cozinha e o bar.',
  endereco: '',
  cidade: '',
  whatsapp: '',
  instagram: '',
  horario: 'Terça a quinta: 17h às 00h\nSexta e sábado: 17h às 02h\nDomingo: 12h às 22h',
  mostrarPrecos: true,
};

/** Campo de texto: ausente usa o padrão; vazio de propósito continua vazio. */
const campo = (v: unknown, max: number, padrao: string) => (typeof v === 'string' ? v.trim().slice(0, max) : padrao);

/** Junta o que veio do formulário com o padrão, limpando e limitando cada campo. */
export function normalizarSite(d: Partial<Record<keyof DadosSite, unknown>> | null | undefined): DadosSite {
  const x = d || {};
  return {
    nome: campo(x.nome, 60, SITE_PADRAO.nome) || SITE_PADRAO.nome,
    slogan: campo(x.slogan, 160, SITE_PADRAO.slogan),
    sobre: campo(x.sobre, 600, SITE_PADRAO.sobre),
    endereco: campo(x.endereco, 160, ''),
    cidade: campo(x.cidade, 80, ''),
    whatsapp: campo(x.whatsapp, 30, '').replace(/\D/g, '').slice(0, 15),
    instagram: campo(x.instagram, 60, '').replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, ''),
    horario: campo(x.horario, 400, SITE_PADRAO.horario),
    mostrarPrecos: typeof x.mostrarPrecos === 'boolean' ? x.mostrarPrecos : SITE_PADRAO.mostrarPrecos,
  };
}

/** Link do WhatsApp (Brasil): acrescenta 55 quando faltar. */
export function linkWhatsapp(numero: string, texto?: string): string | null {
  const n = numero.replace(/\D/g, '');
  if (n.length < 10) return null;
  const completo = n.startsWith('55') && n.length >= 12 ? n : `55${n}`;
  return `https://wa.me/${completo}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

export function linkMapa(endereco: string, cidade: string): string | null {
  const q = [endereco, cidade].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}
