# Handoff: ZARO — Sistema contábil inteligente

## Visão geral
O ZARO é um sistema contábil, fiscal e financeiro para escritório de contabilidade com várias empresas clientes. A primeira empresa em uso real é a **A B S Industrial da Amazônia Ltda** (CNPJ 08.201.911/0001-99, Manaus/AM). Ela trabalha com usinagem e ferramentaria sob encomenda, sem estoque, e está no **Lucro Presumido desde 01/01/2026**. Antes disso estava no **Simples Nacional**, de onde foi excluída de ofício (fato motivador em 28/07/2025).

O protótipo cobre:
- dashboard;
- Autopilot: entrada inteligente de documentos;
- Contas a Pagar e Contas a Receber;
- conciliação bancária;
- empréstimos;
- folha;
- comercial: orçamentos e pedidos;
- contabilidade: motor de lançamentos, Balanço, Balancete, DRE e pacote em PDF;
- fiscal: Simples, Presumido, SEFAZ, e-CAC/PGFN e certidões;
- auditorias da IA;
- cobrança de documentos;
- Conselho ZARO.

## Sobre os arquivos deste pacote
`prototipo/ZARO.dc.html` é uma **referência de design e de regras de negócio feita em HTML**. É um protótipo que mostra a aparência e o comportamento esperados, **não é código de produção**. Ele roda inteiro no navegador e guarda os dados no `localStorage`, que hoje ocupa ~3,9 MB. Por isso ficou lento e corre o risco de perder dados.

**A tarefa é recriar o ZARO em uma aplicação de verdade**, com banco de dados, servidor e login, usando este HTML como especificação visual e funcional.

### Stack recomendada
- **Front-end:** Next.js (App Router) + TypeScript + Tailwind ou CSS Modules.
- **Banco:** PostgreSQL (Supabase ou Neon). Todos os dados com `tenant_id` (escritório), `empresa_id` e, quando for o caso, `filial_id`.
- **Backend e jobs:** rotas de API do Next ou Node/Fastify, com uma fila (BullMQ ou pg-boss) para:
  - importar XML, OFX e PDF;
  - recalcular lançamentos contábeis;
  - sincronizar com a SEFAZ.
- **Arquivos:** XML, PDF e comprovantes em storage (Supabase Storage ou S3), não no banco.
- **Integração SEFAZ:** o serviço em `servidor-sefaz/` (Node, certificado A1) já faz distribuição DF-e, consulta pela chave e manifestação. Deve virar um worker do backend.
- **IA:** a API da Anthropic é chamada **só pelo backend**. No protótipo usa-se `window.claude.complete`, que existe apenas no ambiente de prototipação.

## Fidelidade
**Alta fidelidade** para cores, tipografia, espaçamentos e hierarquia: recrie a interface fiel ao protótipo. As **regras de negócio** (classificação contábil, tratamento de retorno e cancelamento, duplicatas, regime por vigência) são a parte mais valiosa e devem ser portadas com cuidado. Estão detalhadas abaixo.

## Design tokens
| Uso | Valor |
|---|---|
| Fundo da aplicação | `#F6F1EC` (bege quente) |
| Card / superfície | `#FCFAF8`; campos `#FFFDFB` |
| Texto principal | `#34302D` |
| Texto secundário / terciário | `#5C5651`, `#7C756F`, `#9A928B`, `#A8A099` |
| Bordas | `rgba(100,90,80,.07)` em cards; `rgba(100,90,80,.14)` em campos; `#E8E1DB` em divisores |
| Acento (azul-acinzentado) | `#6786A3`; fundo `#EEF2F6`; texto forte `#45627D` |
| Positivo (verde) | fundo `#E3EFE6`, texto `#3F6E52` |
| Negativo (coral) | fundo `#F4E3E0`, texto `#8E4E48` |
| Atenção (âmbar) | fundo `#F5EDD8`, texto `#7A6235` |
| IA (lilás) | `#9B82BD`, fundo `#F7F3FB`, borda `#E3DAEE`, texto `#5B4880` |
| Botão primário escuro | `#34302D` com texto `#FFFFFF` |
| Tipografia | **Manrope** 400–800. Títulos 20–26px/600; corpo 13–14px; rótulos 10.5–11px em maiúsculas com `letter-spacing .08em` |
| Raio | cards 20–22px; campos e botões 10–14px; pills 999px |
| Sombra de card | `0 8px 20px rgba(60,50,45,.04)` |
| Números | `font-variant-numeric: tabular-nums` em todo valor monetário |

**PDF de Balanço, Balancete, DRE e Pacote:** azul + branco + cinza, A4, com logo da empresa. No período **Ano**, o título é "Anual AAAA". Não há bloco de assinatura.

## Telas (menu lateral)
1. **Dashboard:** saudação, fechamento contábil (anel %), vencidos, a aprovar, posição financeira do mês, atividade recente, prioridades e alertas da IA.
2. **ZARO Autopilot:** caixa de entrada única para XML, PDF, ZIP e chave de acesso.
   - Classifica o tipo do documento: NF-e de entrada ou saída, NFS-e, DARF, DAS, DAR-AM, GDD, boleto ou extrato.
   - Extrai os dados, valida, bloqueia duplicados (pela chave de 44 dígitos, ou por nome + tamanho) e encaminha ao módulo certo.
   - **Aprovar uma NF de saída cria o título no Contas a Receber.** Guias de tributo criam título no Contas a Pagar e um registro no fiscal.
   - Tem ainda: Planilha dos XMLs (CFOP, tributos, retenções, alertas), Auditorias inteligentes (10 auditorias + auditoria preventiva do fechamento) e Cobrança de documentos (integra com n8n).
3. **Empresas e Filiais:**
   - cadastro com histórico de regime por vigência (`regimeHist`);
   - certificado digital;
   - imobilizado: máquinas com valor, data, taxa e origem "abertura" ou "compra com NF".
4. **Departamento Pessoal:** funcionários, folha mensal (INSS, IRRF, FGTS) e guias.
5. **Financeiro:**
   - **Contas a Pagar:** títulos com parcelas iguais às duplicatas do XML, status, anexos, NF e fornecedor.
   - **Contas a Receber:** o mesmo para vendas. Notas de retorno ficam com valor zero no caixa.
   - **Conciliação bancária:** extrato OFX, CSV ou PDF (Itaú e Bradesco) × baixas.
   - **Empréstimos e financiamentos:** cronograma, separação principal × juros e análise de endividamento.
   - **Planilha mensal**.
6. **Comercial:** clientes e fornecedores (cadastro preenchido pela consulta de CNPJ), orçamentos com PDF e produtos sob pedido vindos das NFs de venda.
7. **Custos e Preços**.
8. **Contabilidade:**
   - plano de contas;
   - lançamentos e livros com seletor de período e exportação do balancete em PDF/Excel;
   - **Demonstrações:** DRE, Balanço (com indicadores e AV/AH), Balancete de Verificação (modelo saldo devedor × saldo credor), DFC, DRA, DLPA, DMPL, DVA e Notas. Período Mês, Trimestre, Ano ou Personalizado, comparativo e drill-down até o documento.
9. **Fiscal e Tributário:**
   - visão fiscal com tributação corrente × passivo histórico do Simples;
   - saúde fiscal e alíquotas;
   - Simples Nacional, só como histórico até 12/2025;
   - e-CAC e PGFN, certidões, obrigações, DCTFWeb e documentos fiscais.
10. **Conselho ZARO:** 7 conselheiros inspirados nas ideias públicas de empresários (retratos em `prototipo/conselho/`). Cada um vota (a favor, contra ou depende) sobre uma decisão, usando os números da empresa. Um moderador escreve o veredito. As consultas à IA são feitas uma de cada vez, com novas tentativas.
11. **Documentos (Cofre fiscal)** e **Configurações → Integrações**: SEFAZ (endereço + token do servidor), Receita, bancos, n8n.

## Regras de negócio essenciais
- **Isolamento por empresa:** toda consulta, cálculo e tela respeita a empresa ativa. As telas do escritório podem consolidar várias empresas.
- **Regime por vigência:** `regimeEm(empresa, data)` decide o regime. Para a A B S: Simples até 31/12/2025, Presumido a partir de 01/01/2026. Nunca usar DAS, anexos ou Fator R em competências do Presumido.
- **NF de saída da empresa** (emitente = CNPJ da empresa) → Contas a Receber. **NF de fornecedor** → Contas a Pagar.
- **Retorno, remessa, conserto e industrialização** (CFOP 5/6.90x, 91x, 92x, 949, 55x ou natureza "remessa/retorno/devolução") **não geram caixa nem receita**. Ficam como "Retorno", com o valor fiscal informativo.
- **Nota cancelada** (vNF = 0 ou evento 110111): o título é excluído. Nunca entra em totais.
- **Duplicatas:** o título é desdobrado nas parcelas do `<dup>` do XML (vencimento e valor). Sem duplicata, o vencimento é estimado em emissão + 30 dias e marcado para revisão.
- **Empresa sob encomenda, sem estoque:** compra de material vai para custo (`4.1.1.01`), não para estoque.
- **Motor contábil:** toda operação gera lançamentos (débito, crédito, valor, competência, origem, motivo e confiança), que precisam de aprovação. Demonstrações só consideram lançamentos aprovados (com opção de prévia).
  - **Venda:** D Clientes / C Receita; tributos destacados vão para Deduções. **Recebimento:** D Bancos / C Clientes.
  - **Compra:** D Custo / C Fornecedores. **Pagamento:** D Fornecedores / C Bancos.
  - **Extrato bancário:** cada movimento é classificado por regras (tarifa, juros e IOF, tributo, empréstimo, empresa ligada A B S, sócios, fornecedor, cliente).
  - **Sem dupla contagem:** saída do extrato que corresponde a título pago vira baixa de fornecedor. Entrada que corresponde a NF recebida vira baixa de clientes.
  - **Imobilizado:** D Máquinas (`1.2.3.01`) / C Capital ou saldos de abertura (`2.3.1.01`). Depreciação mensal: D `4.1.3.10` / C `1.2.3.91`.
- **Auditoria:** toda ação relevante gera registro (quem, quando, o quê, antes, depois, justificativa).

## Modelo de dados (chaves do protótipo → tabelas sugeridas)
| Chave no protótipo | Tabela | Campos principais |
|---|---|---|
| `empresasList` | `empresas` | id, cnpj, razao, fantasia, regime, regimeHist[], ie, im, cidade, uf, cnae, contador, crc |
| `novos` (tipo Pagar/Receber) | `titulos` | tipo, empresa_id, nome, doc, nf, serie, nfChave, cnpjForn/cliDoc, parc, vencIso, totalNum, status, pago, categoria, centro, contaContabil, competencia, nfEmissao, retorno, impostosNF[], anexos[] |
| `foNovos` / `clNovos` | `fornecedores` / `clientes` | doc (CNPJ), razao, fantasia, endereço, contato, categoria, origem |
| `bkTx` | `extrato_movimentos` | conta, data, valor, memo, fitid, arquivo, empresa_id |
| `inbox` | `documentos_entrada` | tipo, chave, xml/arquivo, status, valor, venc, destino, confiança |
| `cntSt`, `cntOv`, `cntRegras` | `lancamentos` + `regras_classificacao` | status de aprovação por lançamento, conta sobrescrita, regra aprendida |
| `imob` | `imobilizado` | desc, qtd, valor, data, taxa, origem, nf |
| `emprestimos` | `contratos_divida` | instituição, contrato, valor, taxa, sistema, parcelas |
| `dpFunc`, `dpFolhas` | `funcionarios`, `folhas` | — |
| `cfEcac` | `dividas_ativas` | inscrição, natureza, situação, valor |
| `relEmit`, `auditExtra` | `relatorios_emitidos`, `auditoria` | — |

## Migração dos dados reais
O backup `ZARO_backup_AAAA-MM-DD.json` (baixado do navegador do usuário) tem **todo** o estado atual.
- **Volume:** 1.984 títulos, 4.705 movimentos de extrato, 178 fornecedores, 13 clientes e 313 documentos do Autopilot, entre outros.
- **O que fazer:** escrever um script de importação que leia esse JSON e popule as tabelas acima.
- **O que descartar:** chaves terminadas em `Seed`, flags booleanas de migração e estados de UI (`pc`, `pp`, `cb`, `cm`, `sim`, `modos`).

## Pendências conhecidas (não implementadas no protótipo)
- Saldo de abertura e cronograma dos empréstimos. Sem isso, Empréstimos aparece com saldo negativo no Balanço.
- Extratos de 2023 (Itaú e Bradesco). Sem eles, o caixa de 2023 fica inflado e as despesas de 2023 não aparecem.
- Contabilizar o passivo histórico da PGFN (~R$ 2,66 mi) como saldo de abertura no passivo não circulante.
- Deduções sobre vendas e IRPJ/CSLL do Presumido na DRE.
- Emissão de NF-e e CT-e (o servidor SEFAZ responde 501).
- Exportação no leiaute do Domínio (precisa do arquivo modelo).

## Arquivos
- `prototipo/ZARO.dc.html`: o protótipo completo (template + lógica). Abra com `support.js` ao lado.
- `prototipo/conselho/*.webp`: retratos do Conselho ZARO.
- `prototipo/uploads/abs-logo.png`: logo da A B S usado nos PDFs.
- `servidor-sefaz/`: servidor Node (v7) para SEFAZ e cobrança de documentos. Inclui README, `.env.example` e o fluxo `n8n-cobranca-documentos.json`.
