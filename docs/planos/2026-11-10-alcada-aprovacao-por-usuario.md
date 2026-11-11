# Alçada de aprovação por usuário

## Pedido original

> assista este video para criarmos nosssa tela de bom dia ao usuário: https://www.instagram.com/reel/DfQBn-BBG1Y/?utm_source=ig_web_copy_link&xtok=NTc4MTIwNjQ2YQ==
>
> Sessão: 0def919a-cb9d-4de6-b7d1-efd5d79d3424 · 10/11/2026

Este plano nasceu **dentro** do pedido acima. Ao desenhar a "Minha fila" da tela Bom
dia (plano irmão: `2026-11-10-central-bom-dia.md`), o usuário escolheu "Aprovações que
esperam por mim → só as da minha alçada". Na verificação descobri que **não existe
alçada por usuário**: `financial_approval_config` guarda só faixa de valor, número de
níveis e os RÓTULOS dos níveis ("Gestor", "Financeiro / Diretoria"); qualquer pessoa
que abra Aprovações aprova qualquer nível (`FinancialApprovalModule.tsx:65` só calcula
o próximo nível). Apresentada a correção, o usuário escolheu:

> "Criar alçada por usuário agora" (10/11/2026)

e depois aprovou o desenho abaixo com "sim" (10/11/2026).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 10/11 | Como definir quem aprova cada nível? | **Por faixa de valor**: cada faixa ganha aprovadores do nível 1 e do nível 2 |
| 10/11 | Itens sem valor (planta, ofício, SC sem preço)? | **Aprovadores por tipo** (lista própria por tipo) |
| 10/11 | Travar no banco ou só organizar a fila? | **Travar no banco**; nível sem ninguém cadastrado continua liberado a todos |
| 10/11 | A mesma pessoa pode aprovar os dois níveis? | **Pode**, se estiver nas duas listas |
| 10/11 | Quem edita faixas e aprovadores? | **Só dono/admin da organização** (+ desenvolvedor@ / superadmin). Hoje qualquer membro edita as faixas (`fac_v3_*`) |
| 10/11 | Solicitação de compra: faixa ou tipo? | **Sempre por tipo** (o pedido e o título que nascem dela passam pela faixa) |

## Fatos levantados (10/11/2026, `origin/main` 3a727a82)

- Tabelas com `approval_chain` (7): `internal_transactions`, `contracts`,
  `purchase_orders`, `process_instance_steps`, `blueprint_snapshots`,
  `purchase_requests`, `doc_gen_documentos`.
- Caminhos de escrita de um passo da cadeia:
  - **UPDATE do navegador** por `approvalService.approve/reject` (títulos, contratos,
    pedidos, planta, ofício, SC, etapa de processo; e `ProlaboreReconciliationPanel`);
  - **RPC `fn_darf_aprovar` / `fn_darf_rejeitar`**: grava a cadeia em TODOS os
    títulos-membro do DARF (`internal_transactions.darf_id`). Para a faixa, o valor é o
    TOTAL do DARF, não o do membro.
  - Nenhum outro escritor de `'action','APROVADO'` no banco nem nas Edge Functions.
- `approved_by` é **e-mail** (texto vindo do cliente). Gatilhos do sistema também
  ESVAZIAM a cadeia (reenvio, edição de título); isso não é aprovação e tem de passar.
- Fila: `fn_approval_action_queue` (última versão em
  `aplicar_20271109300000_tributo_so_com_darf_fechado.sql`) tem 5 ramos: transaction,
  darf, blueprint_snapshot, purchase_request, doc_gen_documento.

## Desenho

1. **Dados**: tabela `approval_approvers`: `organization_id`, `faixa_id`
   (→ `financial_approval_config.id`, ON DELETE CASCADE) **ou** `entity_type`
   (`blueprint_snapshot` · `doc_gen_documento` · `purchase_request` · `process_step`),
   `level` (1|2), `user_id`, `created_at`, `created_by`. CHECK: exatamente um de
   `faixa_id`/`entity_type`. Únicos por (alvo, nível, usuário).
2. **Regra** `fn_alcada_pode_aprovar(org, entity, valor, nível, email) → boolean`:
   - entity com valor (transaction, darf, contract, purchase_order) → faixa que contém
     o valor; entity por tipo → linhas do tipo;
   - lista vazia para aquele nível → `true` (liberado, como hoje);
   - senão → `true` só se o e-mail é de um `user_id` da lista (via `organization_members`).
3. **Trava**: gatilho `BEFORE UPDATE OF approval_chain` nas 7 tabelas →
   `fn_alcada_trava_passo()`. Só age quando a cadeia CRESCE com passo novo
   `APROVADO`/`REJEITADO` e há usuário autenticado (`auth.uid()` não nulo). Exige
   `approved_by` = e-mail do JWT e `fn_alcada_pode_aprovar(...)`. Rejeição usa a lista
   do nível da vez. Esvaziar a cadeia e escrita de `service_role` passam.
4. **Fila**: `fn_approval_action_queue` ganha `pode_aprovar boolean` e `vez_de text[]`
   (nomes de quem pode aprovar o nível da vez; vazio = qualquer um).
5. **Tela de configuração** (Aprovações › Faixas): coluna/drawer "Aprova o nível 1" e
   "Aprova o nível 2" por faixa; seção "Itens sem valor" com uma linha por tipo. Só
   dono/admin vê os controles de edição; os outros veem só leitura com o motivo.
6. **Tela de aprovação**: "Vez de: Fulano, Beltrano" no item; aprovar/rejeitar
   desligados para quem não pode, com `title` dizendo o motivo.

## Plano

Um item por arquivo. **O que muda** · **como sei que terminou**.

1. `supabase/migrations/aplicar_<prefixo>_alcada_por_usuario.sql`. **Muda**: tabela
   `approval_approvers` + RLS (SELECT membro da org; INSERT/UPDATE/DELETE só
   dono/admin ou `is_superadmin()`); RLS de `financial_approval_config` restringe
   escrita a dono/admin; `fn_alcada_pode_aprovar`; `fn_alcada_trava_passo` + 7
   gatilhos; `fn_approval_action_queue` com `pode_aprovar`/`vez_de`. Respostas da
   REGRA #7 escritas no cabeçalho; `REVOKE … FROM PUBLIC, anon` em toda função nova.
   **Pronto quando**: aplicada com `db query --linked -f` (nunca `db push`); prefixo
   conferido contra TODOS os nomes (memória: colisões) e `migrationsPrefixo.test`
   verde; as consultas da seção Verificação dão o resultado esperado.
2. `types/financial.ts`. **Muda**: tipo `ApprovalApprover`; `pode_aprovar`/`vez_de`
   em `ActionQueueItem` (em `services/approvalService.ts`). **Pronto quando**:
   `npm run typecheck` verde.
3. `services/approvalApproversService.ts` (novo). **Muda**: listar/adicionar/remover
   aprovadores por faixa e por tipo. **Pronto quando**: teste unitário do mapeamento
   e typecheck verdes.
4. `services/approvalService.ts`. **Muda**: o erro do gatilho
   (`ALCADA_NAO_PERMITE`) vira mensagem legível ("Este nível é aprovado por …").
   **Pronto quando**: teste cobre a tradução do erro.
5. `components/FinancialApprovalModule.tsx`. **Muda**: aprovadores por faixa e
   seção "Itens sem valor" (escolha de usuário por drawer, padrão do guia); "Vez de"
   na fila; botões desligados com motivo. **Pronto quando**:
   `bash scripts/check-ui-standard.sh components/FinancialApprovalModule.tsx` sem
   achado; conferido no navegador (dono edita; membro comum vê só leitura com motivo;
   usuário fora da lista vê o botão desligado com o motivo).
6. `components/CentralControle.tsx`. **Muda**: a fila atual da Central respeita
   `pode_aprovar` (desliga e explica), até o plano irmão redesenhar a tela.
   **Pronto quando**: conferido no navegador.
7. `__tests__/alcadaPorUsuario.test.ts` (novo). **Muda**: regra de faixa × tipo,
   lista vazia = liberado, mesma pessoa nos dois níveis, valor do DARF = total.
   **Pronto quando**: `npx vitest run __tests__/alcadaPorUsuario.test.ts` verde.

## Estado

10/11/2026, commits 26a50411 + 50c42c0e (branch `feat/alcada-aprovacao-por-usuario`, sem push):

- [ ] 1 migration: **escrita** (`aplicar_20271111150000_alcada_por_usuario.sql`, prefixo
  conferido, `migrationsPrefixo.test` verde), **NÃO aplicada**. O teste a seco no banco
  remoto (transação desfeita no fim) foi barrado pelo classificador de permissões:
  aguarda autorização do usuário para (a) o teste a seco e (b) a aplicação.
- [x] 2 tipos: `ApprovalApprover`, `MembroAprovador`; `pode_aprovar`/`vez_de` em `ActionQueueItem`.
- [x] 3 serviço: `services/approvalApproversService.ts` (aceita org `null` = "Todas", REGRA #5).
- [x] 4 erro legível: `utils/alcada.mensagemDaAlcada` em `approvalService` e `darfService`;
  faixa de não-admin explica em vez do `PGRST116`/`42501`.
- [ ] 5 tela de Aprovações: código pronto (Vez de, botões desligados com motivo, colunas
  "Aprova o nível 1/2", drawer `QuemAprovaSheet`, seção "Itens sem valor"); `check-ui-standard`
  limpo. **Falta conferir no navegador** — depende do item 1 aplicado.
- [ ] 6 Central: botões desligados com motivo; **falta conferir no navegador**.
- [x] 7 testes: `__tests__/alcadaPorUsuario.test.ts` (14) cobre a parte da tela; a regra
  em si é do banco e fica na seção Verificação (não roda no Vitest).

Desvio registrado: `fn_alcada_pode_aprovar` não recebe e-mail (o desenho dizia
`(org, entity, valor, nível, email)`): usa a identidade de quem chama (`auth.uid()` /
e-mail do JWT), que é o que o gatilho precisa e não deixa perguntar "fulano pode?".

## Verificação

No banco (como usuário autenticado, não como `postgres`, que pula a RLS e não tem JWT):

- faixa sem aprovadores → aprovar funciona como hoje;
- faixa com aprovador A no nível 1 → B recebe `ALCADA_NAO_PERMITE`; A aprova;
- A nas duas listas de um item de 2 níveis → A aprova o 1 e o 2;
- `approved_by` diferente do e-mail logado → recusado;
- DARF: faixa decidida pelo total do DARF;
- reenvio/edição que esvazia a cadeia continua funcionando;
- membro comum não consegue inserir em `approval_approvers` nem alterar faixa.

Na tela: os três perfis do item 5. Suíte inteira (`npm run ci`) verde antes do merge.
