# ZARO · como abrir e mexer

Precisa do Node.js LTS (https://nodejs.org).

## Abrir o ZARO
Dê dois cliques em `ABRIR-ZARO.bat`. Ele abre o navegador em `http://localhost:5500`. Deixe a janela preta aberta enquanto usa.

Os dados ficam no navegador (localStorage). Faça backup pelo próprio ZARO antes de limpar o navegador.

## Ligar a SEFAZ e a cobrança
Em `servidor-sefaz/`, dê dois cliques em `INICIAR-ZARO-SEFAZ.bat` e siga o `servidor-sefaz/README.md`. Como o ZARO também está em `localhost`, pode usar o endereço `http://localhost:8787` e o token em Configurações → Integrações → SEFAZ.

## Onde mexer
- Telas e regras: `prototipo/ZARO.dc.html`
- Servidor SEFAZ e cobrança: `servidor-sefaz/server.js`
- Visão geral e plano para virar sistema de verdade: `README.md`

## Arquivos que faltam (coloque nestas pastas)
- `prototipo/uploads/abs-logo.png`: logo da A B S (aparece nos PDFs)
- `prototipo/conselho/`: retratos do Conselho, com estes nomes: `bezos.webp`, `buffett.webp`, `garyvee.webp`, `graham.webp`, `hormozi.webp`, `martell.webp`, `wickman.webp`
- `prototipo/uploads/orc/_seed.json` (opcional)

## Fica só no seu computador
`prototipo/uploads/_folha*.txt` (holerites com CPF de funcionários), `.env` e `certificado.pfx` não vão para o GitHub.
