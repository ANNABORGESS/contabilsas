/** Cor da etiqueta de status de um título (classes .tag em globals.css). */
export function corStatus(s: string, venc: string | null, hoje: string) {
  if (/cancel/i.test(s)) return '';
  if (/pago|recebido|quitad/i.test(s)) return 'pos';
  if (/retorno/i.test(s)) return 'acento';
  if (venc && venc < hoje) return 'neg';
  if (/parcial|revis/i.test(s)) return 'at';
  return 'acento';
}
