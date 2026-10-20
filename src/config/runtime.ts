/**
 * Versão "artifact" (link para abrir no celular): roda dentro de um frame restrito,
 * sem downloads nem impressão, então a exportação fica oculta e o roteamento é em memória.
 */
export const IS_ARTIFACT = import.meta.env.VITE_ARTIFACT === '1'
