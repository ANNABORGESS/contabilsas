# ZARO · Servidor SEFAZ

Servidor que fica entre o ZARO e os webservices da NF-e. O certificado A1 fica só aqui.

```
ZARO (navegador) → este servidor (HTTPS + token) → SEFAZ (TLS mútuo com o A1)
```

## O que faz
| Rota | Serviço SEFAZ | Uso no ZARO |
|---|---|---|
| `GET /status` | — | Testar conexão, ver titular e validade do certificado |
| `POST /nfe/distribuicao` `{cnpj}` | NFeDistribuicaoDFe (Ambiente Nacional) | Baixar NF-e emitidas contra o CNPJ, por NSU |
| `POST /nfe/chave` `{cnpj, chave}` | NFeDistribuicaoDFe · consChNFe | XML completo pela chave |
| `POST /am/status` | NfeStatusServico4 (SEFAZ-AM) | **Primeiro teste**: a SEFAZ-AM está operando? |
| `POST /nfe/consulta` `{chave}` | NfeConsulta4 (SEFAZ-AM) | Situação, protocolo e eventos da NF |
| `POST /am/cadastro` `{cnpj}` | CadConsultaCadastro4 (SEFAZ-AM) | IE, situação e regime do contribuinte |
| `POST /am/cancelamento` | RecepcaoEvento4 (SEFAZ-AM) · 110111 | Cancelar NF emitida pela empresa (exige `confirmar: true`) |
| `POST /am/inutilizacao` | NfeInutilizacao4 (SEFAZ-AM) | Inutilizar numeração (exige `confirmar: true`) |
| `POST /nfe/manifestacao` `{cnpj, chave, tipo}` | NFeRecepcaoEvento4 (Ambiente Nacional) | Ciência, confirmação, desconhecimento, não realizada |

**Ainda não implementado:** emissão (NfeAutorizacao4 / NfeRetAutorizacao4) e CT-e — respondem 501.

Endpoints SEFAZ-AM 4.00: produção `https://nfe.sefaz.am.gov.br/services2/services/…`, homologação `https://homnfe.sefaz.am.gov.br/services2/services/…`. A distribuição DF-e usa o Ambiente Nacional, não a SEFAZ-AM.

## Jeito fácil (Windows)
1. Instale o Node LTS (nodejs.org).
2. Extraia esta pasta e dê **dois cliques em `INICIAR-ZARO-SEFAZ.bat`**.
3. Na primeira vez ele pede o arquivo do certificado A1 e a senha, cria o `.env` e mostra o **token**.
4. No ZARO, cole o endereço `http://localhost:8787` e o token e clique em **Testar SEFAZ-AM**.

## Como subir (manual)
1. Node 20.6 ou mais novo.
2. `npm install`
3. Copie `.env.example` para `.env`. Coloque o caminho do `.pfx`, a senha e um `ZARO_TOKEN` longo.
4. Comece com `AMBIENTE=homologacao`.
5. `npm start`
6. Publique atrás de HTTPS, por exemplo com um proxy reverso ou um serviço de hospedagem.
7. No ZARO, abra **Configurações → Integrações → SEFAZ**. Informe o endereço e o token e clique em **Testar conexão**.

## Regras da SEFAZ que o servidor respeita
- Quando não há documentos novos (cStat 137 ou 656), a distribuição fica bloqueada por 1 hora por CNPJ. O último NSU de cada CNPJ fica salvo em `nsu.json`.
- Para notas de fornecedores, a distribuição primeiro devolve só um **resumo**. O XML completo vem depois da manifestação de **ciência** ou **confirmação**.

## Antes de produção
- Confira as URLs em `server.js` na relação de WebServices do Portal Nacional da NF-e.
- Restrinja `CORS_ORIGIN` ao endereço do ZARO.
- Guarde o `.pfx` e o `.env` fora do repositório, com acesso restrito.


## Cobrança de documentos (n8n) — versão 7
O servidor também guarda as pendências de documentos que o ZARO envia (Autopilot → Cobrança de documentos → **Enviar pendências para o n8n**).

| Rota | Quem usa |
|---|---|
| `POST /cobranca/snapshot` | ZARO envia o que falta por empresa e competência |
| `GET /cobranca/pendencias` | n8n busca só as cobranças da etapa do dia que ainda não foram enviadas |
| `POST /cobranca/enviado` | n8n registra o resultado do envio. A mesma cobrança não sai duas vezes |
| `GET /cobranca/log` | ZARO mostra o histórico |

**No n8n**
1. Importe `n8n-cobranca-documentos.json`.
2. Crie as variáveis de ambiente:
   - `ZARO_URL`: endereço público deste servidor.
   - `ZARO_TOKEN`: mesmo token do `.env`.
   - `ZARO_EMAIL_FROM`: remetente dos e-mails.
   - Para WhatsApp: `WA_PHONE_ID`, `WA_TOKEN` e `WA_TEMPLATE` (nome do modelo aprovado na Meta, com 3 variáveis: empresa, competência e documentos).
3. Configure a credencial SMTP no nó **E-mail**.
4. Teste primeiro com o seu próprio número ou e-mail. Depois ative o fluxo.

O fluxo roda todo dia útil às 9h. Ele só envia nas datas configuradas no ZARO, que por padrão são os dias 3, 7, 10 e 15. A última data vai para o escalonamento.
