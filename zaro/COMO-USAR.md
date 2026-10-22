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

## Ainda falta
- Leitura de PDF (DANFE, guias, extratos) e importação de OFX pelo próprio sistema.
- Cálculo da folha, orçamentos e pedidos, emissão de NF-e e CT-e.
- Saldos de abertura (bancos, empréstimos, PGFN) e IRPJ/CSLL na DRE.
- O protótipo (`prototipo/`) continua aqui como referência visual e de regras.

## Fica só no seu computador
`app\dados`, `app\.env`, `prototipo\uploads\_folha*.txt`, `servidor-sefaz\.env` e o certificado `.pfx` não vão para o GitHub.
