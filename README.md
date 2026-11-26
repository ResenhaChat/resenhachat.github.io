# Resenha (frontend)

Chat em tempo real dos estagiários, em SAP UI5 (TypeScript, UI5 1.136+, OData V4, tema Horizon claro/escuro).
O backend (SAP CAP) fica em `../resenhachat`.

## Rodar local

1. Suba o backend CAP em `http://localhost:4004` (em `../resenhachat`: `npm run watch`).
2. Neste repositório:

```bash
npm install
npm start          # ts-typecheck + ui5 serve (ui5-local.yaml) e abre o navegador
```

O servidor local faz proxy de `/service` e `/auth` para o CAP em `localhost:4004`. O WebSocket conecta direto em
`ws://localhost:4004/ws`.

Outros comandos: `npm run ts-typecheck`, `npm run lint`, `npm run build` (gera `dist/` para o GitHub Pages).

## Configuração de runtime

`webapp/config/runtime-config.json`:

```json
{ "chatService": "/service/Chat/", "authBase": "/auth", "wsUrl": "" }
```

Em `localhost` o app ignora o arquivo e usa esses valores locais (proxy e WebSocket direto em `ws://localhost:4004/ws`).

**Deploy (GitHub Pages):** o arquivo publicado deve trazer as URLs absolutas do BTP em `chatService` (ex.: `https://<host-btp>/service/Chat/`)
e em `authBase` (ex.: `https://<host-btp>/auth`). `wsUrl` fica vazio e é derivado de `chatService` (`https` vira `wss`, caminho `/ws`).
Hoje a troca é manual; na fase 6 ela será automatizada no build.

## Usuários de teste

| E-mail | Senha |
|---|---|
| `davi@resenha.dev` | `123456` |
| `ana@resenha.dev` | `123456` |
| `joao@resenha.dev` | `123456` |

Abra duas abas (ou dois navegadores) com usuários diferentes para ver mensagens, presença e "digitando…" em tempo real.
