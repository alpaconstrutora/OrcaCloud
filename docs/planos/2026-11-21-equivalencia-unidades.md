# Equivalência de unidades nas composições/insumos

## Pedido original

Sessão Claude Code de 21/11/2026, manhã:

> precisamos criar uma uma equivalencia para as unidades de medidas das composições.
> por exemplo, o item 32, ACO CA-50, 6,3 MM, VERGALHAO com unidade KG, porem ele pode ser por m (metro).

Respostas às perguntas do plano (mesma sessão):
- Onde vale: **Orçamento, Compras, Quantitativos da planta**.
- Quem cadastra: **Global, do sistema** (superadmin).
- Aço: **pré-preencher** os vergalhões que o app conhece.

## Decisão do seed (21/11, ao ler o banco)

O SINAPI tem 11 vergalhões; 6 citam VÁRIAS bitolas no mesmo código ("12,5 MM OU 16,0 MM") —
kg/m ambíguo, ficam **sem seed** (superadmin cadastra se quiser). Os de bitola única
(32, 33, 34, 34341, 43057) recebem M e BR pela massa nominal NBR 7480 = 0,006165·d² (a
mesma `theoreticalLinearWeight` de `utils/rebarEngine.ts`; bate com `structural_steel_catalog`
nas 3 casas), barra de 12 m.

## Contexto
Cada item SINAPI ou da base própria tem uma única unidade. Exemplo: o insumo 32, "ACO CA-50, 6,3 MM, VERGALHAO", é cotado em KG. Na obra, porém, o aço é medido e comprado em metro ou em barra.

Hoje o app não converte unidade em lugar nenhum. A planta chega a **recusar** a linha quando a medida sai numa grandeza e o item está em outra (`utils/blueprintBudget.ts:1451`).

O pedido:
- **Onde vale:** a equivalência precisa fazer efeito no **Orçamento**, em **Compras** e nos **Quantitativos da planta**.
- **Quem cadastra:** o cadastro é **global**, mantido por superadmin.
- **Aço:** os vergalhões já entram pré-preenchidos.

Tudo foi lido de `origin/main`. O trabalho é feito numa frente nova (`bash scripts/nova-frente.sh equivalencia-unidades`). O plano vai salvo em `docs/planos/2026-11-21-equivalencia-unidades.md`, com o pedido original (REGRA #6).

## Modelo
- O fator segue o sentido **1 unidade = fator × unidade_base**. Por exemplo, 1 M = 0,245 KG e 1 BR = 2,94 KG. Para converter entre duas alternativas, passa-se pela base: BR→M = 12.
- `unidade_base` fica gravada. A equivalência só vale quando a unidade atual do item, normalizada, é igual a ela. Assim, se a unidade do item mudar de uma competência para outra, ou se a base própria sobrepuser o item com outra unidade, a equivalência fica sem efeito em vez de converter errado.
- No orçamento, `BudgetEntry.quantity` **continua sempre na unidade do item**. Isso mantém corretos, sem mudança, exportação, medição e `montarLinhas` de Suprimentos.

## Fase 0 (PR 1): tabela, util e cadastro em Composições
- **Migration** `supabase/migrations/aplicar_20271121920000_equivalencia_unidades.sql`. Antes de criar, conferir que o prefixo está livre listando todos os nomes. Aplicar com `npx supabase db query --linked -f`, nunca com `db push`.
  - Tabela `public.item_unit_equivalences`, com os campos `item_code`, `unidade_base`, `unidade`, `fator numeric > 0`, `observacao`, `created_by` e as datas.
  - CHECK de formato `^[A-Z0-9]{1,10}$` e CHECK de que `unidade <> unidade_base`.
  - UNIQUE em `(item_code, unidade_base, unidade)`.
  - Trigger `update_updated_at_column()`.
  - RLS: SELECT com `auth.uid() IS NOT NULL`. INSERT, UPDATE e DELETE só com `public.is_superadmin()`, como já se faz em `aplicar_20271007000300_…:165`.
  - REVOKE de PUBLIC e anon, e REVOKE de TRUNCATE, REFERENCES e TRIGGER para `authenticated`.
  - **Seed do aço, idempotente** com `ON CONFLICT DO NOTHING`. A fonte é a linha mais recente de cada código em `sinapi_items` cuja descrição combine com `A_O CA-%VERGALH_O%` e cuja unidade seja KG. A bitola e o tipo saem da descrição e casam com as linhas globais de `structural_steel_catalog`. Para cada código, gravar KG→M com `peso_linear_kg_m` e KG→BR com `peso × comprimento_barra_m` (12 m).
  - Antes do INSERT, rodar o SELECT dos casados sozinho e conferir: 32 deve dar 0,245.
  - Sem seed ficam os CA-60 de 4,2, 6,0, 8,0 e 9,5 mm, que não estão no catálogo de aço. O superadmin cadastra à mão.
- **`lib/unidadeDeMedida.ts`** (novo): recebe `UNIDADES` e `normalizarUnidade` vindos de `lib/pedidoFast.ts:167-184`. O `pedidoFast` passa a reexportar, com o import levando `.ts` explícito por causa da Edge Function `pedido-fast`. O arquivo também ganha a lista fechada de unidades do editor: M, M2, M3, KG, T, UN, BR, PC, SC, CX, RL, L, CJ, PAR, JG, GL, MIL. ML fica de fora porque é ambíguo.
- **`utils/equivalenciaUnidades.ts`** (novo, puro): `unidadesDoItem`, `fatorEntre`, `converterQuantidade`, `converterPreco` e `unidadeInformadaValida`. Unidade vazia ou desconhecida resulta em sem conversão.
- **`services/equivalenciaUnidadesService.ts`** e **`hooks/useEquivalencias.ts`**:
  - `listarPorCodigos`, com `.in()` em lotes e cache;
  - `salvar` (upsert) e `excluir`;
  - se a tabela não existir, devolve mapa vazio.
- **Tela:** componente novo `components/database/EquivalenciasDoItem.tsx`, dentro do modal "Ver detalhes" de `DatabaseExplorer.tsx` (insumo: acima do aviso de "insumo básico"; composição: depois da tabela da composição).
  - Mostra cada equivalência no formato "1 BR = 2,94 KG".
  - Só quem passa em `temAcessoTotal` (`DatabaseExplorer.tsx:143`) vê o formulário e o excluir. O excluir usa `useConfirm()`.
  - Para os demais, a lista é só leitura.
  - Seguir `docs/ui_ux_guia_unificado.md` (REGRA #1) e rodar `check-ui-standard.sh`.

## Fase 1 (PR 2): Orçamento
- `types/budget.ts`: incluir em `BudgetEntry` o campo opcional `unidadeInformada?: { unidade, unidadeBase, fator }`. O fator fica gravado no lançamento, para que mudar o cadastro depois não altere o orçamento.
- `BudgetEditor.tsx`:
  - criar `handleUpdateUnidade` ao lado de `handleUpdateQuantity` (`:1805`);
  - carregar `useEquivalencias` com os códigos do orçamento.
- `BudgetRow.tsx`:
  - quando o item tem equivalências e o orçamento não está travado, a unidade vira um select no padrão §7.1 do guia;
  - a quantidade é mostrada como `quantity / fator` e gravada como `valor × fator`;
  - o preço é mostrado como `price × fator`;
  - totais e composição continuam na unidade do item.
- **Pronto quando:** trocar KG por BR não muda o total; digitar 120 M grava 29,4 KG; e um `unidadeBase` que não bate com a unidade do item volta a ser mostrado em KG.

## Fase 2 (PR 3): Compras
- **Solicitação** (`SolicitacaoCompraForm.tsx:373`): quando o item tem equivalência, a unidade vira um select. Trocar a unidade converte a quantidade e o preço estimado juntos, e o total não muda.
- **Pedido** (`SupplyChainOrderForm.tsx`):
  - criar `customUnits` ao lado de `customQuantities` e `customPrices`, e liberar o select de unidade do `AvulsoItemModal` (hoje `disabled={doOrcamento}`) só com as unidades equivalentes;
  - **corrigir de passagem um defeito:** `aplicarItensGravados` (`:407`) não restaura a unidade, então um pedido gravado em BR reabriria como KG com a quantidade em BR.
- **"Já comprado"** (`quantidadesCompradasNaObra`, `:115`, e `linhasDoOrcamentoParaPedido`, `lib/orcamentoLinhas.ts:177`):
  - **muda um comportamento:** hoje a função soma `quantity` cru, seja qual for a unidade. Passa a agrupar por unidade normalizada e a converter cada grupo para a unidade da linha do orçamento.
  - uma compra que não converte fica fora da soma e a linha ganha um aviso, com tooltip, em `PedidoOrcamentoTela.tsx`.
- **Limitação:** o mesmo código não entra duas vezes no mesmo pedido em unidades diferentes. Também não há arredondamento para barra inteira.

## Fase 3 (PR 4): Planta
- Em `utils/blueprintBudget.ts`:
  - criar o helper `resolverUnidadeDaMedida(item, dimensõesAceitas, eqs)`. Ele aceita a dimensão do próprio item com fator 1 ou procura uma alternativa válida;
  - substituir a recusa por esse helper nos 6 pontos: `:1451`, `:1642`, `:1737`, `:1797`, `:1933` e `:2095`.
  - Com equivalência:
    - a quantidade passa a ser `valor × fator`;
    - o lançamento ganha `unidadeInformada`;
    - `calculationMemory` registra o fator.
  - Sem equivalência, a recusa continua, agora com a dica "cadastre a equivalência em Engenharia › Composições".
- `blueprintCoberturaOrcamento.ts:99`: com equivalência, `UNIDADE_INCOMPATIVEL` passa a `COM_PRECO`.
- `services/blueprintBudgetService.ts:234-345`: depois de `resolverItens`, carregar as equivalências e repassá-las aos geradores e à cobertura. O parâmetro é opcional e tem um mapa vazio como padrão.

## Riscos
- **Orçamentos antigos:** sem `unidadeInformada`, nada muda neles.
- **Corrigir um fator no cadastro:** muda as conversões feitas na leitura (o "já comprado"), mas não muda quantidades que já estão gravadas.
- **Arredondamento:** a quantidade canônica é gravada com 6 casas. O preço da solicitação usa `NUMERIC(15,4)`, o que pode gerar diferença de centavos.
- **Visibilidade:** o cadastro global deixa os códigos da base própria de uma organização visíveis para todas. A observação não deve conter dado de cliente.

## Verificação
- **Vitest:**
  - `__tests__/equivalenciaUnidades.test.ts` (novo), cobrindo identidade, ida e volta, BR→M = 12, base divergente dando null e total q×p conservado;
  - `pedidoFast.test.ts` sem alteração;
  - `orcamentoLinhas.test.ts`: BR somado em KG, "kg" e "KG" juntos, compra que não converte fica marcada;
  - `blueprintBudget.test.ts` e `blueprintCoberturaOrcamento.test.ts`: converte com equivalência e mantém a recusa sem ela;
  - `BudgetEditorTable.test.tsx`, `solicitacaoCompra.test.ts` e `SupplyChainOrderFormNovoItens.test.tsx`;
  - `segurancaMigrations`, `migrationsPrefixo` e `orgContextGuard`.
- **Banco:**
  - o SELECT do seed mostra 32 com 0,245 e BR com 2,94;
  - um INSERT feito por quem não é superadmin dá 42501;
  - a chave anon não lê nada;
  - `scripts/check-rls-postura.sh` passa.
- **Tela:** a cada fase, abrir no Chrome Composições › item 32 › Equivalências, um orçamento lançado em M, uma solicitação e um pedido em BR reabertos, e a planta com um de-para M→KG.
- **Publicação:** CI verde → `gh pr merge --squash` → `conferir-producao.sh` → `fechar-frente.sh`, uma vez por fase.

## Andamento

### Fase 0 — 21/11/2026
- [x] Migration aplicada no banco (2×, idempotente): 10 linhas — 32/33/34/34341/43057 × {M, BR}; 32 = 0,245 kg/m e 2,94 kg/barra.
- [x] RLS provada no banco (transação desfeita): comum lê e não grava/altera/apaga; superadmin grava; anon barrado. `check-rls-postura.sh` limpo.
- [x] `lib/unidadeDeMedida.ts` (mapa saído do pedidoFast; `pedidoFast.test.ts` sem alteração e verde).
- [x] `utils/equivalenciaUnidades.ts` + `__tests__/equivalenciaUnidades.test.ts`.
- [x] Serviço + hook; seção "Equivalência de unidades" no Ver detalhes (só superadmin edita).
- [ ] Conferida na tela em produção (item 32).
