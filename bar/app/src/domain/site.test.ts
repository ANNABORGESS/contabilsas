import { describe, expect, it } from 'vitest';
import { linkMapa, linkWhatsapp, normalizarSite, SITE_PADRAO } from './site';

describe('site público', () => {
  it('limpa os dados do formulário', () => {
    const s = normalizarSite({ nome: '  ', whatsapp: '(92) 99999-1234', instagram: '@vikings.bar!', slogan: 'Oi', mostrarPrecos: false });
    expect(s.nome).toBe(SITE_PADRAO.nome);
    expect(s.whatsapp).toBe('92999991234');
    expect(s.instagram).toBe('vikings.bar');
    expect(s.mostrarPrecos).toBe(false);
  });
  it('sem nada salvo usa os textos padrão; vazio de propósito fica vazio', () => {
    expect(normalizarSite(null).slogan).toBe(SITE_PADRAO.slogan);
    expect(normalizarSite({}).horario).toBe(SITE_PADRAO.horario);
    expect(normalizarSite({ sobre: '' }).sobre).toBe('');
  });
  it('monta os links de WhatsApp e mapa', () => {
    expect(linkWhatsapp('92999991234', 'Olá')).toBe('https://wa.me/5592999991234?text=Ol%C3%A1');
    expect(linkWhatsapp('5592999991234')).toBe('https://wa.me/5592999991234');
    expect(linkWhatsapp('123')).toBeNull();
    expect(linkMapa('Rua A, 10', 'Manaus')).toContain('Rua%20A%2C%2010%2C%20Manaus');
    expect(linkMapa('', '')).toBeNull();
  });
});
