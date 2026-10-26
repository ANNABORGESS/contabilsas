# ZARO · como usar

Precisa do Node.js LTS instalado (https://nodejs.org).

## O sistema novo (use este)
1. Dê dois cliques em **`INICIAR-ZARO.bat`**. Na primeira vez ele instala os componentes (alguns minutos).
2. O navegador abre em `http://localhost:3000`. Deixe a janela preta aberta enquanto usa.
3. No primeiro acesso, crie o escritório e o seu usuário (você vira Administrador).
4. Cadastre a empresa em **Empresas e Filiais** (o botão Consultar puxa os dados pelo CNPJ), com o histórico de regime.

Os dados ficam na pasta **`app\dados`**. Para ter backup, copie essa pasta com o ZARO fechado.

### Trazer os dados do protótipo
1. Dê dois cliques em `ABRIR-ZARO.bat` (abre o protótipo antigo) e, **no mesmo navegador em que você usava o ZARO**, acesse `http://localhost:5500/exportar-backup.html`.
2. Clique em **Baixar backup**.
3. No sistema novo: **Configurações → Importar backup do protótipo** e envie o arquivo. Pode repetir: o que já entrou é pulado.

Entram: empresas, títulos e baixas, clientes e fornecedores, extratos, imobilizado, empréstimos, funcionários, dívida ativa, decisões e regras contábeis e o histórico de auditoria. Os anexos guardados no navegador não vêm, só o nome deles. Dados de telas que ainda não existem (orçamentos, pedidos, folhas e outros) ficam guardados para as próximas versões.

### Ligar a SEFAZ
Em `servidor-sefaz`, dê dois cliques em `INICIAR-ZARO-SEFAZ.bat` (pede o certificado A1 na primeira vez). No ZARO: **Configurações → Integração SEFAZ**, endereço `http://localhost:8787` e o token que aparece na janela. Depois use **Buscar NF-e**: as notas completas vão para o Autopilot e os resumos ficam esperando a sua manifestação.

### Conselho ZARO (IA)
Crie o arquivo `app\.env` (copie de `app\.env.example`) e coloque a sua chave da Anthropic em `ANTHROPIC_API_KEY`. Reinicie o ZARO.

## O que já funciona
- **Login** com usuários e perfis (Consulta só vê, não altera).
- **Autopilot**: envie XML de NF-e, NFS-e e eventos de cancelamento. Identifica venda ou compra, retorno (sem caixa), nota cancelada e duplicada. Ao aprovar, cria os títulos com as parcelas das duplicatas.
- **Financeiro**: contas a pagar e a receber, baixa, estorno de baixa, revisão de vencimento, cancelamento, lançamento manual, extrato e empréstimos.
- **Contabilidade**: lançamentos gerados automaticamente (títulos, extrato, imobilizado e depreciação, empréstimos), aprovação, troca de conta que aprende a regra, estorno; Balancete, DRE e Balanço por mês, trimestre, ano ou período, com prévia e impressão em PDF.
- **Fiscal**: regime por vigência, estimativa do Lucro Presumido por trimestre e a dívida ativa.
- **Comercial, Estoque, Custos, Pessoal e Documentos**: consultas a partir dos dados lançados.
- **Auditoria** de todas as ações.

## Novidades
- **SEFAZ no ZARO online**: em Configurações → Integração SEFAZ, guarde o certificado A1 (.pfx + senha) da empresa ativa — ou marque “Guardar o certificado” ao cadastrar a empresa. Ele fica criptografado (AES-256) e o ZARO passa a buscar sozinho as NF-e emitidas contra o CNPJ (vão para o Autopilot), fazer a manifestação (ciência, confirmação, desconhecimento) e testar a SEFAZ-AM, sem precisar do servidor no computador. O servidor local continua como opção. A conexão confere o certificado do servidor da SEFAZ: se aparecer aviso de cadeia ICP-Brasil, é preciso cadastrar essa cadeia oficial (variável SEFAZ_CA_PEM).
- **Comercial unificado**: o menu lateral tem um só **Comercial** com Visão Geral, Clientes e Fornecedores, Compras e Cotações, Orçamentos (com versões e histórico), Pedidos Aprovados (com andamento da produção), Vendas e Faturamento, Produtos e Estoque (produtos vendidos, produtos e custos, movimentações), Custos e Rentabilidade (visão geral, custo por pedido, rentabilidade por cliente e produto, orçado × realizado) e Preços e Simulações (histórico de preços das NFs e simulador). Os endereços antigos /estoque e /custos levam para o lugar novo. **Documentos** saiu do menu (o endereço /documentos continua funcionando).
- **Produtos e Estoque (sob encomenda)**: a aba **Produtos vendidos nas NFs** junta os itens de todas as notas de venda do Contas a Receber (código do cliente, NCM, clientes, pedidos, NFs, quantidade, faturado, preço médio e último preço). A empresa não controla estoque: produz por pedido. O botão **Trazer produtos das NFs para o cadastro** leva os itens para o cadastro usado em orçamentos e pedidos. NFs sem itens aparecem no fim da tela para você mandar o XML.
- **Comercial com submenu**: Clientes e Fornecedores (cadastro com **+ Novo cliente** e **+ Novo fornecedor**, consulta de CNPJ na Receita, contato, busca e edição), **Compras e cotação** (solicitação → aprovação → cotação de até 3 fornecedores com recomendação → pedido de compra → recebimento que lança no Contas a Pagar), **Orçamentos** (itens com margem, enviar, aprovar, PDF da proposta e converter em pedido), **Pedidos aprovados** (faturar em parcelas no Contas a Receber; também lista os pedidos que vieram nas NFs emitidas) e **Vendas e faturamento**.
- **Cadastro com certificado digital A1**: em Empresas e Filiais → Nova empresa (ou Editar), escolha o arquivo .pfx, digite a senha e clique em **Ler certificado**. O ZARO preenche CNPJ e razão social, busca o resto na Receita e, ao salvar, guarda só a validade. O arquivo e a senha não ficam gravados. A lista mostra a validade e o Dashboard avisa 30 dias antes de vencer.
- **Dashboard executivo**: saldo bancário, contas a receber e a pagar, tributos e resultado (com variação), gráficos de evolução e de fluxo projetado, fechamento da competência por área, alertas e atividades. Botão **Personalizar** para esconder e reordenar blocos (fica salvo no seu usuário). Para ver o saldo do banco, informe o **saldo inicial** em Financeiro → Extrato.
- **ZARO IA**: botão de brilho no topo abre o assistente; ele responde só com os números da empresa ativa, dizendo fonte, período e link. Precisa da chave ANTHROPIC_API_KEY.
- **Inteligência Financeira** (menu): abas Executivo (faturamento, lucro, margem, EBITDA), Caixa (projeção de 30 a 180 dias com cenários e caixa mínimo), Inadimplência (faixas de atraso, devedores e registro de cobrança), Pagamentos (conferência de documentos, aprovação e agendamento, leitura de linha digitável) e Orçamento (versões, orçado x realizado por centro de custo, semáforo e exportação).
- **Especialistas** (menu): envie os zips de skills e agentes (skills-contadores, 57-Agentes, contabilidade) pela própria tela. Eles ficam só no banco do seu escritório. Escolha um especialista e pergunte; ele responde com os números da empresa ativa. Precisa da chave ANTHROPIC_API_KEY (na Vercel ou no `.env`).
- **Comercial → Vendas**: lance a venda e as parcelas viram títulos no Contas a Receber. **Produtos e Estoque** tem o cadastro de produtos e serviços.
- **Financeiro**: botões **Excel** e **PDF** baixam a lista filtrada.
- **Fiscal → NF da SEFAZ**: importe a planilha do portal da SEFAZ-AM, confirme o recebimento (com pedido) e marque o lançamento. Mostra o que está fora da ZARO.
- **Lucro Presumido 2026**: a estimativa aplica a majoração da LC 224/2025 sobre a receita acima de R$ 5 milhões no ano.

## Ainda falta
- Leitura de PDF (DANFE, guias, extratos) e importação de OFX pelo próprio sistema.
- Cálculo da folha, orçamentos e pedidos, emissão de NF-e e CT-e.
- Cadastro de filiais; saldos de abertura de empréstimos e PGFN; conta própria de IRPJ/CSLL na DRE.
- Captura automática de boletos por e-mail/PDF e envio de cobrança por integração (hoje o e-mail e o WhatsApp abrem no seu aplicativo).
- O protótipo (`prototipo/`) continua aqui como referência visual e de regras.

## Fica só no seu computador
`app\dados`, `app\.env`, `prototipo\uploads\_folha*.txt`, `servidor-sefaz\.env` e o certificado `.pfx` não vão para o GitHub.

## Skills para contadores no Claude Code
As 57 skills (Lucro Presumido, Simples, folha, SPED, conciliações e outras) não vão para o GitHub: a licença proíbe redistribuir e este repositório é público. No seu computador, copie as pastas de `skills-contadores-main\skills\` para **`C:\ZARO\.claude\skills\`**. Depois, abra o Claude Code dentro de `C:\ZARO` (`cd C:\ZARO` e `claude`) e peça, por exemplo: "apure o Lucro Presumido do 2º trimestre da A B S".

## 57 agentes de contabilidade no Claude Code
São especialistas que o Claude Code chama sozinho quando o assunto bate (DAS, Lucro Presumido, folha, rescisão, conciliação, SPED, eSocial, cobrança de honorários e outros). Também não vão para o GitHub: o pacote não tem licença de redistribuição e este repositório é público.

No seu computador, copie os arquivos `.md` de cada pasta de `57-Agentes-Contabilidade-main\MODELOS\` (menos os `COMO-INSTALAR.md`) para **`C:\ZARO\.claude\agents\`**. Abra o Claude Code dentro de `C:\ZARO` e confira com `/agents`. Para usar um específico: "use o agente apuracao-simples-nacional para apurar o DAS de 09/2026".

A interface DigIAna (pasta `interface`, para Windows) é opcional: mostra os agentes em cartões e abre o Claude Code num terminal. Ela é instalada à parte, seguindo o README do pacote.
