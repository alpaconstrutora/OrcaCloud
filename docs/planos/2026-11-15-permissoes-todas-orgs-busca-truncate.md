# Permissões em "Todas as organizações", busca rápida por permissão e TRUNCATE

## Pedido original

> 4

Sessão: 0a085d50-aa53-4f26-a1e2-4e6e58976184 · 15/11/2026. Resposta à lista de pendências do módulo
Riscos, em que o item 4 era: *"Três ajustes do app inteiro, fora do módulo: a permissão de esvaziar
tabela (TRUNCATE) ainda está liberada em tabelas antigas; com o topo em 'Todas as organizações',
qualquer módulo fica liberado; a busca rápida (Ctrl+K) não filtra os itens por permissão."*
Os três achados vieram do teste do módulo Riscos (`docs/planos/2026-11-13-modulo-riscos.md`).

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 15/11 | Em "Todas", qual módulo aparece/abre? | **O que o usuário tem em pelo menos uma organização de que é membro** (união). Decidido por mim como padrão e informado ao usuário, que pode pedir outra regra. Ninguém perde o que usa em alguma org; ninguém ganha o que não tem em nenhuma. |
| 15/11 | TRUNCATE: aplicar no banco? | **"Sim"** — aplicada em 15/11. |

## Plano

- [x] **1. Regra única por organização** — `permitidoNaOrg` em `utils/modulosPermitidos.ts` (era inline no
  guard do `AppRouter`); a herança (`padrao`) passa a ser decidida na MESMA organização.
  *Pronto quando:* teste cobre admin, permissão do membro, matriz por produto, sem nada gravado e herança.
- [x] **2. "Todas as organizações" no menu e na Central** — `modulosPermitidosNoContexto` (união das
  orgs do usuário via `vinculosDoUsuario` + `uniaoDeModulos`); `Layout` e `useModulosPermitidos` usam.
  Sem vínculo conhecido (organizações carregando) mantém a leitura antiga.
  *Pronto quando:* teste prova que módulo desligado em todas as orgs some e ligado em alguma aparece.
- [x] **3. "Todas" no guard de rota** — `isModuleAllowed` deixa de liberar tudo sem organização:
  `vinculos.some(permitidoNaOrg)`.
  *Pronto quando:* tsc 0, `orgContextGuard` verde, rotas de módulo abrem em "Todas" para usuário real.
- [x] **4. Busca rápida filtra por permissão** — `MODULO_DO_ITEM_DE_BUSCA` (tela → chave do menu, mesma
  condição dos itens do menu); item sem entrada é geral e sempre aparece.
  *Pronto quando:* teste confere que toda tela mapeada existe na busca e toda chave existe no menu.
- [x] **5. TRUNCATE** — `aplicar_20271115463000_revoke_truncate_authenticated_anon.sql`: REVOKE em todas as
  tabelas de public + default privileges do `postgres`.
  *Pronto quando:* aplicada; a conferência devolve 1 | 1 (só `spatial_ref_sys`, do PostGIS).

## Estado

- 15/11: medido no banco — TRUNCATE para authenticated em 538 de 659 tabelas, anon em 387; causa = default
  privileges `arwdDxtm`. Única função com TRUNCATE (`fn_condominio_migracao_plano`, invoker) só trunca
  tabelas temporárias da sessão (não depende de GRANT). **Ensaio em transação com ROLLBACK:** sobra 1 tabela
  (`spatial_ref_sys`, dona supabase_admin — postgres não revoga), padrão do postgres sem `D`, CRUD intacto.
- 15/11: itens 1–4 em código; `modulosPermitidosTodasOrgs.test.ts` (11 testes) + menu/permissões/Riscos
  verdes (44); tsc exit 0; `check-ui-standard` e `check-org-selector-guard` ok. Navegador (agente-leitura,
  membro na Alpa e admin na Garden Cambuhy): "Todas" mostra a união (Riscos visível pela Garden), busca
  rápida normal, rotas de módulo abrem, console sem erro. O caso "esconder em Todas" não tem usuário real
  disponível (o agente-leitura é admin numa org) — provado pelos testes.
- 15/11: **migration aplicada** — conferência 1 | 1 (`spatial_ref_sys`); padrão do postgres `anon=arwdxtm`/`authenticated=arwdxtm`
  (sem `D`); 588 tabelas com SELECT+INSERT para authenticated, iguais a antes; app recarregado: Pedidos com 23 linhas,
  console sem erro de permissão.
- Fora do escopo, anotado: `podeEditarRiscos` em "Todas" sem membro resolvido continua editando (a escrita
  já pergunta a organização).

## Verificação

`npx vitest run __tests__/modulosPermitidosTodasOrgs.test.ts __tests__/orgContextGuard.test.ts`; no app,
um usuário sem um módulo em nenhuma org não vê o item em "Todas" nem na busca, e a rota cai no dashboard.
