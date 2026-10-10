# Pós-Obra & Garantia — escolher Cliente/Unidade preenche o resto

## Pedido original

Sessão de 2026-10-10, ~07:40. Mensagem do usuário, transcrita literalmente:

> Pós-Obra & Garantia: carregar todos os dados ao selecionar uma cliente e ou  unidades.
> Regra geral: se o app ja tem as informações não vamos obrigar o usuário prencher manualmente

### Decisões tomadas com o usuário na mesma sessão

| Pergunta | Resposta |
|---|---|
| Como o chamado guarda a unidade? | **Vínculo real**: `warranty_claims.unit_id` + `p_unit_id` na RPC; o texto `unidade_ref` fica como instantâneo |
| Corrigir o vencimento (hoje = HOJE + prazo)? | **Sim, junto**: entrega da unidade + prazo, com a fonte da data exibida |

---

## Contexto

O formulário de abrir chamado (`components/WarrantyModule.tsx`, `WarrantyClaimModal`) e o
de editar (`WarrantyClaimDetail`, modo edição) pediam Empreendimento, Obra, Cliente e
Unidade como quatro campos independentes — Unidade era texto livre. Mas o app já sabe:

- **Unidade → empreendimento/obra:** `empreendimento_units → empreendimento_towers →
  empreendimentos`; obra = `COALESCE(tower.project_id, emp.project_id)` (mesma regra de
  `vw_unit_property_map` e de `empreendimentoService.mapObrasToEmpreendimentos`).
- **Cliente ↔ unidade**, duas fontes:
  1. `unit_occupancies` (atual = `ended_at IS NULL` ou futuro);
  2. negociações efetivadas — `commercial_deal_buyers` ∪ `commercial_deals.client_id`, status
     `CONTRATO|ASSINATURA|COMPLETED` (régua de `services/occupancyImportService.ts:43`);
     venda pela `commercial_property_id`, locação vigente pela `rental_property_id`.
- **Cliente → empreendimento** sem unidade: `client_empreendimentos`.
- **Data de entrega** (não existe por unidade), nesta ordem: posse do 1º PROPRIETARIO
  (`unit_occupancies.started_at`) → `company_incorporacao.habite_se_data` →
  `empreendimentos.condominio_instalado_em` → `empreendimentos.expected_delivery_date`.

Bug no caminho: `handleTriage` calculava `warranty_expires_at = hoje + prazo_meses`; o
comentário da coluna (`20260708000000:72`) sempre disse "data_entrega + prazo_meses".

Medido no banco (Alpa, 10/10, antes de aplicar): 28 unidades no diretório, 21 com cliente
(4 com mais de um — casais compradores), 24 com obra, 9 com data de entrega.

Frente: `C:\D\frentes\pos-obra-autopreencher` (branch `feat/pos-obra-autopreencher`).

---

## Item 1 — `supabase/migrations/aplicar_20271010000200_warranty_unit_link.sql` ✅

- Coluna `warranty_claims.unit_id` (FK `empreendimento_units`, `ON DELETE SET NULL`) + índice parcial.
- `open_warranty_claim`: assinatura de 14 args **dropada** e recriada com `p_unit_id` (15º,
  default NULL — o front antigo continua funcionando), a partir da definição VIGENTE lida
  por `pg_get_functiondef`. Trava nova: a unidade tem de ser de um empreendimento da mesma org.
- `warranty_unit_directory(org)` — `LANGUAGE sql STABLE SECURITY INVOKER`, uma linha por
  unidade com empreendimento, obra, `clients` (jsonb, papel mais forte primeiro, deduplicado)
  e `entrega_data`/`entrega_fonte`.
- `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` nas duas.
- **Pronto quando / conferido em 10/10:** aplicada por `db query --linked -f`; `pg_proc` mostra
  **uma** `open_warranty_claim` com 15 args; ACL das duas
  `{postgres, authenticated, service_role}` (sem PUBLIC/anon); coluna `unit_id` existe;
  corpo do diretório rodado contra a Alpa antes de aplicar (números acima);
  `segurancaMigrations.test.ts` verde.

## Item 2 — `types/warranty.ts` ✅

`WarrantyClaim.unit_id`, `OpenWarrantyClaimCommand.unit_id`, `WarrantyUnitOption`,
`WarrantyUnitClient`, `WarrantyEntregaFonte`.

## Item 3 — `services/warrantyService.ts` ✅

`open()` manda `p_unit_id`; `getUnitDirectory(org)`. `update()` já aceitava `Partial<WarrantyClaim>`.
- **Pronto quando:** chamado aberto pela tela grava `unit_id` ✅ — conferido no banco em 10/10
  (2 chamados de teste com `unit_id`, `unidade_ref` "Torre Única · 22", empreendimento e obra;
  apagados depois pela `delete_warranty_claim`, total voltou a 5).

## Item 4 — `utils/warrantyAutofill.ts` + `__tests__/warrantyAutofill.test.ts` ✅

Regras puras: `applyClientChoice`, `applyUnitChoice`, `unitsOfClient`, `clientToFill`,
`markManual`, `unitLabel`, `resolveWarrantyExpiry`, `entregaDoChamado`.
Nunca sobrescreve escolha manual (conjunto `auto`); trocar cliente/unidade limpa só o que
o autopreenchimento tinha escrito; casal comprador não é deduzido (pede o cliente).
- **Pronto quando:** 17/17 testes verdes (cliente 1/várias/nenhuma unidade, unidade 0/1/2
  clientes, manual preservado, troca limpa, vencimento por data pura com fim de mês).

## Item 5 — `components/UnitSelect.tsx` ✅

Drawer no molde do `ClientSelect`: Unidade · Empreendimento · Cliente(s), busca, recorte
pelas unidades do cliente escolhido com "Ver todas as unidades".
- `check-ui-standard.sh`: 1 alerta §3 (busca em `useState`) = exceção documentada **§3.1**
  (seletor de drawer, busca transitória — mesmo caso do `ClientSelect`).

## Item 6 — `components/WarrantyModule.tsx` ✅

- `ClaimLinkFieldsBlock` (compartilhado por abrir e editar): Cliente, Unidade, Empreendimento,
  Obra, com "Preenchido automaticamente" sob o que foi deduzido; unidade fora do cadastro
  continua em texto livre ("Unidade não cadastrada? Digitar").
- `useUnitDirectory(org)` + `useClaimAutofill` (lê o form por ref — updater de setState rodaria
  duas vezes no StrictMode).
- Triagem: vencimento = entrega + prazo; o card mostra a entrega (com a fonte) e "dentro do
  prazo / prazo vencido" antes do clique; sem entrega cai no cálculo antigo e diz isso.
- Painel de informações ganha a linha "Entrega".
- **Pronto quando:** check-ui-standard exit 0 ✅; `orgContextGuard` verde ✅;
  `WarrantyModule.test.tsx` 17/17 ✅ (inclui "cliente com 1 unidade preenche"); navegador real
  nos cenários ✅ (Playwright, Chrome, agente-leitura, 10/10, 0 erro de console/HTTP):
  A) Francisco Salles (1 unidade) → Torre Única · 21, 007 - Bella Vista, obra Bella Vista;
  B) trocar para Reginaldo (3 unidades) limpa o anterior, avisa "3 unidades deste cliente" e o
  drawer abre recortado nas 3; C) empreendimento/obra escolhidos à mão sobrevivem à troca de
  cliente; D) unidade 22 sem cliente → Joao do Carmo de Souza; E) unidade 41 (casal) avisa
  "2 clientes vinculados" e não chuta; F) triagem: "Entrega em 29/06/2015 (posse do
  proprietário). Prazo de 60 meses vence em 29/06/2020 — prazo vencido".

## Item 7 — Memória ✅

Feedback "se o app já tem a informação, não obrigar o usuário a preencher".

---

## Fora de escopo (anotado)

- "Abrir chamado" continua modal central; REGRA #4 preferiria drawer.
- Não existe data de entrega própria por unidade no schema (a função usa a melhor disponível).
- `warrantyService.update()` grava `unit_id` direto na tabela, sem a trava de org da RPC —
  mesma postura que `development_id` já tinha.
