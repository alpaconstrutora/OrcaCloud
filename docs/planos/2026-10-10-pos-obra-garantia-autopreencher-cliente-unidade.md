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

### Pedido seguinte — 2026-10-10, mesma sessão (com dois prints do drawer)

> No drawer Abrir chamado de garantia (veja prints):
> 1. ordenar os itens do  dropdown empreendimento
> 2. vincular o dropdown obra ao empreendimento, ou seja, ao selecionar determinado empreendimento, traga somente as obras vinculadas ao empreendimento selecionar

(Os prints eram da versão anterior, ainda servida quando foram tirados; os dois pedidos
valem para a nova — ver Item 8.)

### Terceiro pedido — 2026-10-10, mesma sessão

> 1. vamos ordenar na seguinte ordem o drawer Abrir chamado de garantia:
> primeiro: empreendimento.
> segundo: Obra.
> terceiro: unidade
> Quarto: cliente
>
> 2. falta centro de custo e plano de contas

(Ver Itens 9 e 10.)

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

## Item 8 — Empreendimento ordenado; Obra recortada pelo empreendimento (pedido seguinte) ✅

- `WarrantyModule`: catálogo de empreendimentos ordenado por nome (`localeCompare` pt-BR,
  numérico — "007" antes de "010").
- Obra mostra só as obras do empreendimento escolhido, pelo mesmo mapa que a tela já carrega
  (`mapObrasToEmpreendimentos`: `empreendimentos.project_id` + `empreendimento_towers.project_id`).
  Sem empreendimento → todas. Empreendimento sem obra vinculada → só "Sem obra vinculada", com
  o aviso de onde vincular.
- `applyDevelopmentChoice` (puro): trocar o empreendimento tira a obra que não é dele e a
  unidade que não é dele; com UMA obra vinculada, preenche a obra (regra geral do pedido 1).
- **Pronto quando:** testes da regra verdes; componente mostra só as obras do empreendimento;
  navegador confere ordenação e recorte; publicado e conferido.
- Conferido em 10/10: `warrantyAutofill.test.ts` 23/23; `WarrantyModule.test.tsx` 18/18 (caso
  novo: ordem dos empreendimentos e Obra só com "Residencial Beta" ao escolher emp2); tsc 0;
  check-ui-standard 0. Navegador (Alpa, sem salvar): 14 empreendimentos em ordem 004→018;
  "007 - Bella Vista" → só a obra "Bella Vista" (de 15); "012 - Edifício Ferraz" → nenhuma, com o
  aviso; sem empreendimento → as 15 de volta; 0 erro de console/HTTP.
- ⚠️ Observado: as obras "Bella Vista - Assistência Técnica" e "Condomínio - Bella Vista" NÃO
  são vinculadas ao empreendimento 007 no cadastro (nem como obra principal nem de torre), então
  não aparecem no recorte. Se devem aparecer, o vínculo é em Incorporação › Empreendimento.

## Item 9 — Ordem Empreendimento › Obra › Unidade › Cliente ✅

- `ClaimLinkFieldsBlock` (abrir e editar) na ordem pedida, seguida de Centro de custo e Plano
  de contas.
- A lista de Unidade abre recortada pelo empreendimento escolhido (e pelo cliente, se houver),
  com "Ver todas as unidades".
- Unidade de outro empreendimento que o escolhido à mão passa a mandar: empreendimento e obra
  seguem a unidade (os campos não podem se contradizer). Mesmo empreendimento: obra manual fica.
- **Pronto quando / conferido:** testes da regra (2 casos novos); navegador mostra os rótulos na
  ordem Empreendimento | Obra | Unidade | Cliente | Centro de custo | Plano de contas.

## Item 10 — Centro de custo e Plano de contas ✅

- `aplicar_20271010001000_warranty_cc_plano_de_contas.sql`: `warranty_claims.cost_center_id`
  (→ `cost_centers_v2`) e `plano_de_contas_id` (→ `plano_de_contas`), FKs `ON DELETE SET NULL`,
  índices; `open_warranty_claim` dropada (15) e recriada com 17 args a partir da vigente, com
  trava de organização para os dois; REVOKE PUBLIC/anon.
- Tela: `CostCenterSelect` / `PlanoContasSelect` (drawer padrão §7.1.1) com as linhas cruas de
  `costCenterService.list(org)` / `financialRegistryService.listPlanoContas(org)`; painel de
  informações mostra os dois.
- **CC sugerido** (`centroDeCustoSugerido`/`applyCostCenterSuggestion`, puros): o CC-filho da
  obra; sem CC de obra, o do empreendimento; só quando há UM. Manual nunca é trocado.
- **Plano de contas é manual:** o app não tem de onde deduzi-lo (nenhum padrão por obra, CC ou
  empreendimento; o resolvedor de categoria é do DRE, outra dimensão).
- **Conferido em 10/10:** migration aplicada; `pg_proc` = 1 função, 17 args, ACL sem PUBLIC/anon;
  RPC num bloco que aborta no fim gravou os dois (`cc_ok=t pc_ok=t`) e recusou CC de outra org
  (`InvariantViolation`); total de chamados seguiu 5. Testes: regra 29/29, componente 18/18 (CC
  da obra aparece ao escolher o empreendimento). Navegador: "006 - Coronel Lambert 316" →
  obra e CC "022 Comercial › Coronel Lambert 316" preenchidos; "007 - Bella Vista" (3 CCs na
  obra) → sem chute, sugerido anterior limpo; Plano de contas abre em accordion; 0 erro.

---

## Fora de escopo (anotado)

- "Abrir chamado" continua modal central; REGRA #4 preferiria drawer.
- Não existe data de entrega própria por unidade no schema (a função usa a melhor disponível).
- `warrantyService.update()` grava `unit_id` direto na tabela, sem a trava de org da RPC —
  mesma postura que `development_id` já tinha.
