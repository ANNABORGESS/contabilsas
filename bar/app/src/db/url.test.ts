import { describe, expect, it } from 'vitest';
import { urlDoBanco } from './index';

describe('endereço do banco', () => {
  const certo = 'postgresql://bar_app.abc:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';
  it('aceita o valor puro ou com texto em volta', () => {
    expect(urlDoBanco(certo)).toBe(certo);
    expect(urlDoBanco(`DATABASE_URL=${certo}`)).toBe(certo);
    expect(urlDoBanco(`  "${certo}"\n`)).toBe(certo);
  });
  it('sem valor usa o banco embutido; valor sem endereço dá erro claro', () => {
    expect(urlDoBanco('')).toBeUndefined();
    expect(urlDoBanco(undefined)).toBeUndefined();
    expect(() => urlDoBanco('base de dados')).toThrow(/postgresql:\/\//);
  });
});
