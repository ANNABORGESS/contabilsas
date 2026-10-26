import type { Papel } from '@/domain/papeis';

/** Os quatro jeitos de entrar, cada um com link próprio (/login/garcom etc.) para salvar no aparelho. */
export const PERFIS: { papel: Papel; titulo: string; icone: string; texto: string }[] = [
  { papel: 'garcom', titulo: 'Garçom', icone: '📱', texto: 'Celular: mesas, pedidos e pagamento' },
  { papel: 'cozinha', titulo: 'Cozinha', icone: '🍟', texto: 'Painel dos petiscos' },
  { papel: 'bar', titulo: 'Bar', icone: '🍺', texto: 'Painel das bebidas' },
  { papel: 'admin', titulo: 'Administrador', icone: '💼', texto: 'Computador: vendas, cardápio e relatórios' },
];
