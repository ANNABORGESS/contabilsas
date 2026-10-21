# ZARO · Conexão com a SEFAZ

Servidor que roda no seu computador (Windows) e liga o ZARO à SEFAZ usando o certificado A1 da empresa. Ele:

- baixa as NF-e emitidas contra o CNPJ do certificado (Distribuição DF-e do Ambiente Nacional);
- guarda cada XML na pasta `xml/` e o último NSU em `nsu.json`;
- envia a manifestação do destinatário (ciência, confirmação, desconhecimento, operação não realizada).

## Como usar

1. Instale o Node.js LTS (https://nodejs.org).
2. Dê dois cliques em `INICIAR-ZARO-SEFAZ.bat`.
3. Na primeira vez ele pede o arquivo do certificado (.pfx) e a senha, e gera o token.
4. Copie o **Endereço** e o **Token** que aparecem na janela para o ZARO: Configurações > Integrações > SEFAZ.
5. Deixe a janela aberta enquanto usa.

Começa em **homologação** (teste). Para valer, troque para `AMBIENTE=producao` no arquivo `.env`.

## Rotas (todas pedem `Authorization: Bearer <token>`, menos a `/`)

| Rota | O que faz |
| --- | --- |
| `GET /status` | empresa, CNPJ, validade do certificado e último NSU |
| `POST /dfe/sincronizar` | baixa tudo desde o último NSU |
| `GET /dfe/nsu/:nsu` | busca um documento pelo NSU |
| `GET /dfe/chave/:chave` | busca uma nota pela chave de 44 dígitos |
| `POST /manifestacao` | `{ "chave": "...", "tipo": "ciencia" \| "confirmacao" \| "desconhecimento" \| "nao_realizada", "justificativa": "..." }` |

Quando não há notas novas, a SEFAZ pede **1 hora de intervalo**. O servidor respeita isso sozinho (responde 429 até lá).

## Ajustes opcionais no `.env`

- `CNPJ=`: use se o CNPJ não estiver no nome do certificado.
- `SEFAZ_CA_PATH=`: arquivo .pem com a cadeia ICP-Brasil, para validar o certificado do servidor da SEFAZ. Sem ele a conexão funciona, mas sem essa verificação.
- `XML_DIR=`: pasta dos XMLs (padrão `./xml`).
- `FUSO=`: fuso do horário dos eventos (padrão `-04:00`, Amazonas).

## Nunca envie para o GitHub

`.env`, `certificado.pfx` e `TOKEN-ZARO.txt` (já estão no `.gitignore`).

## Cobrança de documentos (n8n)

`n8n-cobranca-documentos.json` é um fluxo para importar no n8n. Ele chama `/cobranca/pendencias` e `/cobranca/enviado` no **ZARO** (não neste servidor) e precisa das variáveis `ZARO_URL`, `ZARO_TOKEN`, `WA_PHONE_ID`, `WA_TOKEN`, `WA_TEMPLATE` e `ZARO_EMAIL_FROM`.
