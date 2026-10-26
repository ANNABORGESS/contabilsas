# Bar · pedidos pagos na mesa

Sistema para bar em que o cliente **paga na mesa, na hora do pedido**, na maquininha que o garçom leva. Não há comanda aberta nem dívida: a mesma mesa pode fazer quantos pedidos quiser durante a noite, cada um pago na hora.

| Aparelho | Endereço | O que faz |
|---|---|---|
| **Celular do garçom** | `/garcom` | Escolhe a mesa, os produtos e as quantidades, vê o total, recebe na maquininha e toca em **Pagamento confirmado**. Acompanha os pedidos e é avisado (som, vibração e aviso na tela) quando ficam prontos. |
| **Cozinha** (tablet/TV) | `/cozinha` | Só petiscos de pedidos **pagos**: número, mesa, itens, quantidades, horário, observação e status. |
| **Bar** (tablet/TV) | `/bar` | Só bebidas de pedidos **pagos**, por ordem de chegada, com a mesa. |
| **Computador** | `/admin` | Visão do turno, mesas e histórico, vendas, cancelamentos/estornos, cardápio, funcionários, relatórios (CSV e PDF) e auditoria. |

## Entrada (login e senha por perfil)

A primeira tela pergunta **como o aparelho vai ser usado**: Garçom, Cozinha, Bar ou Administrador. Cada opção tem seu link, para salvar nos favoritos ou na tela inicial do aparelho:

| Perfil | Link |
|---|---|
| Garçom | `http://IP-DO-COMPUTADOR:3100/login/garcom` |
| Cozinha | `http://IP-DO-COMPUTADOR:3100/login/cozinha` |
| Bar | `http://IP-DO-COMPUTADOR:3100/login/bar` |
| Administrador | `http://IP-DO-COMPUTADOR:3100/login/admin` |

Cada link pede usuário e senha (ou PIN) e só aceita quem é daquele perfil (o administrador entra em todos). Os links prontos para copiar ficam em **Administração → Funcionários → Links de acesso**. Ao sair, o aparelho volta para a entrada do mesmo perfil.

## Fluxo

1. O garçom seleciona a mesa e adiciona petiscos e bebidas com as quantidades.
2. O sistema calcula o total (sempre com os preços do cardápio, no servidor).
3. O garçom cobra na maquininha e informa a forma (crédito, débito, Pix ou dinheiro).
4. Com o pagamento aprovado, toca em **Pagamento confirmado** e confirma.
5. O pedido é gravado e enviado na mesma hora: **petiscos → cozinha**, **bebidas → bar**.
6. Cozinha e bar tocam em *Iniciar preparo* e *Marcar pronto*.
7. O celular do garçom avisa que está pronto; ele entrega e marca *Entreguei*.
8. O pedido fica no histórico da mesa e nos relatórios.

## Regras garantidas

- **Nada vai para preparo antes da confirmação do pagamento.** Até lá o pedido é só um rascunho no celular. Pedido, itens, envio para cada setor e registro são gravados juntos, numa transação.
- **Confirmação manual, não conciliação.** Fica registrado quem confirmou, data, hora, valor e forma *informada*. As telas e o CSV deixam claro que isso não substitui conferir o extrato da maquininha/adquirente.
- **Sem envio duplicado.** Cada cobrança tem uma chave gerada no celular e guardada nele; toque duplo, rede caindo ou reenvio devolvem o mesmo pedido (a chave é única no banco). O botão também trava enquanto envia.
- **Preço mudou no meio do atendimento?** O pedido é gravado com o valor que foi cobrado (o dinheiro já entrou) e marcado com *divergência de preço* para o administrador conferir.
- **Cancelamento e estorno só com o administrador.** O garçom pode apenas *solicitar* (com motivo); o administrador autoriza ou recusa. Antes do preparo é *cancelamento*; depois, *estorno*. O pedido sai dos painéis e o valor sai das vendas líquidas. A devolução do dinheiro é feita na maquininha.
- **Rastreabilidade.** Todo pedido tem linha do tempo (pago, enviado, em preparo, pronto, entregue, solicitações, cancelamento) com pessoa e horário, e a Auditoria mostra também mudanças de cardápio, equipe e acessos.
- **Tempo real.** Garçom, cozinha, bar e computador recebem as mudanças na hora (Server-Sent Events). Se a conexão cair, a tela mostra “Reconectando” e continua atualizando a cada 10 s.
- **Turno.** Vendas de madrugada contam na noite anterior (virada às 6h, ajustável).

## Como usar no bar (rede local)

O computador do caixa vira o servidor. Os celulares e tablets só precisam estar no **mesmo Wi-Fi**.

1. Instale o Node.js (versão LTS) em https://nodejs.org.
2. No Windows, dê dois cliques em `INICIAR-BAR.bat`. Ele instala, prepara e abre o sistema.
3. No primeiro acesso, crie o administrador, diga quantas mesas o bar tem e (se quiser) um cardápio de exemplo.
4. Em **Funcionários**, crie um usuário para cada garçom e um para a cozinha e outro para o bar.
5. Nos celulares e tablets, abra `http://IP-DO-COMPUTADOR:3100` (o `.bat` mostra o IP). No celular, “Adicionar à tela inicial” deixa com cara de aplicativo.

Os dados ficam em `app/dados`. Faça cópia dessa pasta para ter backup.

## Desenvolvimento

```
cd app
npm install
npm test          # regras de negócio e fluxo completo num PostgreSQL embutido
npm run typecheck
npm run dev       # http://localhost:3100
npm run db:generate   # depois de mudar src/db/schema.ts
```

- Next.js 15 + TypeScript, PostgreSQL com Drizzle ORM. Sem `DATABASE_URL`, usa PGlite (PostgreSQL embutido) em `./dados`; com ela, qualquer PostgreSQL (Supabase, Neon, servidor próprio). As migrações rodam sozinhas.
- `src/domain`: regras puras e testadas (total, separação cozinha/bar, status do preparo, cancelamento/estorno, turno, relatórios).
- `src/server`: serviços (login, pedidos, preparo, cancelamentos, cadastros, relatórios, eventos).
- `src/app/api`: API JSON e `/api/sync` (tempo real). `src/app/garcom`, `cozinha`, `bar`, `admin`: telas.

Variáveis em `app/.env.example`.

## Próximos passos possíveis

- Integração com a maquininha/adquirente (TEF ou API) para confirmar automaticamente e conciliar.
- Cancelamento de um item só (hoje é o pedido inteiro).
- Impressão de comanda de preparo na cozinha.
