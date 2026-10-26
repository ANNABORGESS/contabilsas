/** Erro de regra com mensagem para mostrar a quem está usando. */
export class ErroRegra extends Error {
  constructor(msg: string, readonly status = 400) {
    super(msg);
  }
}
