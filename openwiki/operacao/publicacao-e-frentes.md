---
type: operação
title: Frentes de trabalho, publicação e conferência de produção
description: Como se trabalha e publica neste repositório — cada frente numa worktree própria a partir de origin/main (nova-frente/fechar-frente), hooks versionados que recusam commit no checkout de integração, push/merge em main como única forma de publicar no Vercel, o portão do build que recusa produção fora do topo de main e a conferência de fora que compara o domínio com origin/main a cada 15 minutos.
tags: [deployment, vercel, git-worktree, ci, githooks, operations, release]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-bf5be0c9253ed1d07b502e10
    resource: repo://.githooks/pre-commit
  - id: openwiki-source-baf30c604828cfde90a8ab63
    resource: repo://.githooks/pre-push
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-a7e66c8aeac5e4460b1b2d44
    resource: repo://.github/workflows/conferir-producao.yml
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-a0b7d7d73d5f27cb5748c320
    resource: repo://scripts/check-origem-do-deploy.sh
  - id: openwiki-source-405ebe9a3982e1952bac1127
    resource: repo://scripts/conferir-producao.sh
  - id: openwiki-source-d5463b41042bdde160e4ed23
    resource: repo://scripts/fechar-frente.sh
  - id: openwiki-source-49cd468a00fe1ef6d6aad31e
    resource: repo://scripts/nova-frente.sh
  - id: openwiki-source-55831e92f29f8b3e9d43f58b
    resource: repo://vercel.json
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Frentes de trabalho, publicação e conferência de produção

Regra do projeto (CLAUDE.md, REGRA #8): **uma frente, uma pasta — deploy é
push.** Cada frase dessa regra tem uma trava mecânica, porque a regra só como
texto foi violada por três sessões diferentes.

| A regra | O que a faz valer | Quando dispara |
|---|---|---|
| não trabalhe no checkout de integração | `.githooks/pre-commit` e `pre-push` | ao commitar/empurrar de lá |
| push em `main` é a publicação | `.githooks/pre-push` mostra o que vai ao ar | ao empurrar para `main` |
| não publique árvore atrasada | `scripts/check-origem-do-deploy.sh` | dentro do build do Vercel |
| frente só fecha depois de publicada | `scripts/fechar-frente.sh` | ao fechar a frente |
| produção não diverge em silêncio | `.github/workflows/conferir-producao.yml` | a cada 15 min |

## Frentes (worktrees)

```bash
bash scripts/nova-frente.sh <nome>      # C:/D/frentes/<nome>, branch feat/<nome>, a partir de origin/main
bash scripts/fechar-frente.sh <nome>    # ao terminar
```

`nova-frente.sh`:

- recusa nome fora de `[a-z0-9-]`, pasta existente ou branch existente;
- faz `git fetch` e cria a worktree **sempre a partir de `origin/main`**, nunca
  do estado local (partir de ponto errado gerou uma branch 59 commits atrás);
- roda `npm ci` (com fallback para `npm install`) — `node_modules` **próprio**;
- religa os hooks (`scripts/instalar-hooks.sh`) e copia o `.env` (não
  versionado; o app não sobe sem ele).

⚠️ **Nunca ligue `node_modules` por junção do Windows.** `git worktree remove
--force` desce pela junção e apaga o `node_modules` do repositório real
(aconteceu duas vezes), e o `vitest` não roda com junção (falha idêntica em
todos os arquivos). Instalação própria custa ~800 MB por frente e elimina os
dois problemas.

`fechar-frente.sh` remove a worktree sem seguir junção (só o
`(Get-Item …).Delete()` do PowerShell faz isso; `rmdir` do Git Bash falha em
silêncio) e exige que o trabalho tenha sido publicado. Quando o PR foi mesclado
por squash, o conteúdo está em `main` com outro hash: use `--sem-publicar` só
depois de provar que o conteúdo é idêntico.

### O checkout de integração

`C:\D\ORÇACLOUD\orçacloud-saas` é o checkout principal. Ele costuma ficar
**muito atrás** de `origin/main` (já esteve 150 commits atrás, com 15 commits
duplicados e 48 mil deleções de diferença). Os hooks recusam commit e push
nele. A detecção é **estrutural**, não por caminho (o caminho tem "Ç"/"ç" e a
codificação varia): no checkout principal `git rev-parse --git-dir` e
`--git-common-dir` são o mesmo diretório; numa worktree, o primeiro aponta para
`.git/worktrees/<nome>`. Emergência real tem porta explícita:
`ORCACLOUD_PERMITIR_INTEGRACAO=1 git commit …`.

Os hooks são versionados em `.githooks/` e ligados por `core.hooksPath`
(`.git/hooks` não é versionado). `.gitattributes` força LF em `.githooks/*`:
com CRLF, o `\r` no shebang mata o hook antes da primeira linha.

Para **ler** o código atual, use uma frente nova ou `git show origin/main:<arquivo>`
— nunca o checkout de integração.

## Publicação = chegar em `main`

**Não existe comando de deploy no fluxo normal.** O Vercel está ligado ao GitHub
por webhook (invisível em `.github/`): push em `main` dispara o build de
produção; push em qualquer outra branch **não gera build nenhum**:

```json
"git": { "deploymentEnabled": { "main": true, "**": false } }
```

Na prática o trabalho vai por PR a partir da branch da frente; o merge em `main`
**é** a publicação. O `pre-push` avisa isso no momento do push para `main`. Não
há preview por branch (gerava builds duplicados na mesma fila); se precisar,
`vercel deploy` sem `--prod` a partir da frente.

### O portão do build

`vercel.json`:

```json
"buildCommand": "npm run verificar:build && vite build"
```

`verificar:build` = `check-origem-do-deploy.sh` + `typecheck` +
`check-xss-sinks.sh`. Build que falha não troca o domínio.

`scripts/check-origem-do-deploy.sh`, em `VERCEL_ENV=production`, só deixa passar:

1. build vindo do Git com `VERCEL_GIT_COMMIT_SHA` e ref `main`, **e** que seja o
   **topo atual** de `main` (consultado na API do GitHub com
   `GITHUB_READ_TOKEN`, fine-grained, só Contents:Read); ou
2. recuperação deliberada com `BUILD_COMMIT` carimbado
   (`vercel deploy --prod --build-env BUILD_COMMIT=$(git rev-parse HEAD)`).

Detalhes de desenho:

- "ser ancestral do topo" **não basta**: o incidente original foi exatamente um
  ancestral 59 commits atrás;
- se outra sessão empurrar entre o push e o início do build, este build é
  recusado — está certo, ele já nasceu obsoleto e o build seguinte publica a
  versão nova;
- **sem o token, a verificação avisa no log e deixa passar** — uma trava que
  derruba todo build no dia em que o token expira seria arrancada na primeira
  urgência.

⚠️ **Nunca `vercel deploy --prod` no fluxo normal.** Publicar por CLI
**substitui** o que está no ar. Já aconteceu: quatro deploys por CLI de uma pasta
atrasada em 21 minutos tiraram do ar uma funcionalidade publicada e provada,
enquanto o painel dizia "Ready". A assinatura estava no bundle:
`window.__BUILD_COMMIT__=""`.

### O carimbo do commit

O `vite.config.ts` injeta `__BUILD_COMMIT__` (de `BUILD_COMMIT`,
`VERCEL_GIT_COMMIT_SHA` ou `git rev-parse HEAD`). Comparar nome de bundle local
com o do site não prova nada (o Vercel compila na infraestrutura dele e os hashes
diferem); procurar o SHA dentro do que o domínio entrega prova.

## Conferir o que está no ar

```bash
bash scripts/publicar-producao.sh                         # espera o build do push e prova pelo SHA servido
bash scripts/conferir-producao.sh                         # o domínio serve o topo de origin/main?
bash scripts/conferir-producao.sh "Rastreamento logístico"  # e esta tela é a versão nova?
```

"O painel do Vercel diz Ready / Production" **não prova** que o site serve aquilo.
`.github/workflows/conferir-producao.yml` roda `conferir-producao.sh` a cada
15 min, com uma segunda tentativa 4 min depois (para não acusar um build em
voo) que é a que decide.

## CI

`.github/workflows/ci.yml` roda em push e PR para `main`: `npm ci`,
`tsc --noEmit`, `check-xss-sinks.sh`, `vitest run`, `vite build`. **Roda em
paralelo** ao build do Vercel — não é portão de publicação; o portão é o
`buildCommand`. O `tsc` precisa de heap ampliado (`NODE_OPTIONS
--max-old-space-size`). O CI usa Node 20, enquanto o projeto declara Node 24.
Ver [Testes e travas](../testes/suite-e-travas.md).

## Edge Functions e banco

O push publica **só o front-end**. Edge Functions têm deploy próprio
(`supabase functions deploy`), seguido da prova do 401 sem header quando a
função faz a própria autorização. Migrations são aplicadas à mão — e precisam
estar no banco **antes** do código que as usa. Ver
[Banco e migrations](./banco-e-migrations.md) e
[Edge Functions](../integracoes/edge-functions.md).

Detalhes e exceções: `RUNBOOK_DEPLOY.md`.
