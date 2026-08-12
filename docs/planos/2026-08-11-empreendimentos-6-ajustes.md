# Incorporação › Empreendimentos — 6 ajustes

## Pedido original

> incorporação > Empreendimentos:
> 1.	Coluna Ações, incluir botões, editar e duplicar
> 2.	Criar obra a partir de empreendimento
> 3.	Bug em vinculações: Nenhuma obra disponível. Todas as obras desta organização já estão vinculadas, ou ainda não há obras cadastradas.
> 4.	Criar coluna Organização
> 5.	Excluir kpis cards das páginas Empreendimentos; Espelho de Vendas; Espelho de Locações; Vinculações; histórico)
> 6.	Incluir coluna empreendimento em:
> comercial > Gestão de Locações
> comercial > Venda de Ativos
> Suprimentos > Gestão de Contratos
> Suprimentos > Cotações de Suprimentos
> Suprimentos > Pedidos de Compra
> Suprimentos > Gerenciamento de Recebimento

Sessão: `cd2fd363-c06a-4540-821a-3510f62989d0` · 2026-08-11

## Contexto

Seis pedidos independentes que compartilham um tema: o Empreendimento hoje é uma
ilha. A lista só deixa excluir (abrir é clique na linha; editar só existe dentro
do detalhe); não há como criar a obra que ele precisa ter; a aba Vinculações diz
que não há obras quando há; e o empreendimento não aparece como coluna em nenhuma
das telas operacionais que dependem dele.

**Item 3 — causa raiz** (`VinculacoesTab.tsx:168-175`): a lista de obras do painel
"Vincular obra" sai de `useStore().projects`, que **já vem recortado pelo seletor
de organização do topo** (`store/useStore.ts:286`), e sobre isso a tela aplica um
**segundo** filtro exigindo que a obra seja exatamente da organização do
empreendimento. Como cada empreendimento costuma ser uma **SPE própria** enquanto
as obras vivem na organização do grupo (mesmo padrão que esvaziava o dropdown de
Corretor), a interseção dá zero. Defeito secundário: `used` só contém as obras
**deste** empreendimento, então "todas as obras já estão vinculadas" nunca é o que
a tela realmente sabe.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-11 | O que "Duplicar" copia? | Estrutura completa (torres, pavimentos, unidades, áreas comuns), **abrindo o formulário pré-preenchido antes de salvar** |
| 2026-08-11 | De onde parte "Criar obra"? | **Coluna Ações da lista E aba Vinculações** |
| 2026-08-11 | Como a obra é criada? | Abre o **ProjectModal pré-preenchido**; nasce ao salvar e é vinculada em seguida |
| 2026-08-11 | Como corrigir o bug de vinculações? | Listar obras de **todas as organizações do usuário**, com o nome da organização ao lado e destaque quando difere da do empreendimento |

## Plano

### Fase 1 — Lista de Empreendimentos (itens 1, 4 e parte do 5)

**1.1 — `components/empreendimento/EmpreendimentoModule.tsx` · coluna Ações**
Adicionar `<ActionIconButton kind="edit">` (liga em `setEditing`/`setIsFormOpen`,
que já existem) e `kind="duplicate"`. Subir `DEFAULT_COL_WIDTHS.actions`.
**Pronto quando:** a linha mostra os botões alinhados à direita, Editar abre o
Sheet do empreendimento clicado e o clique não navega para o detalhe.

**1.2 — mesmo arquivo · coluna Organização**
`COLUMNS` + `DEFAULT_COL_WIDTHS` + `EMPREENDIMENTO_COLUMN_HEADERS` +
`renderEmpreendimentoCell` + soma de `tableTotalWidth` + `switch` de ordenação +
busca. Nome via `useStore().organizations` (padrão de `PayrollRunList.tsx:135`).
**Pronto quando:** com o topo em "Todas as organizações" a coluna mostra nomes
diferentes por linha, ordena nos dois sentidos e a busca por nome da org acha.

**1.3 — `services/empreendimentoService.ts` + `EmpreendimentoForm.tsx` · duplicar**
`copyStructure(sourceId, targetId)` usando só primitivas existentes
(`listTowers`/`createTower`, `listFloors`/`createFloor`,
`listUnits`/`bulkUpsertUnits`, `listCommonAreas`/`upsertCommonAreas`), com mapas
`oldTowerId→newTowerId` e `oldFloorId→newFloorId`. Não copia `project_id`,
`imovib_*`, `commercial_property_id`, `rental_property_id`; unidades nascem
`DISPONIVEL` nos dois eixos. `EmpreendimentoForm` ganha `duplicateFrom`.
**Pronto quando:** duplicar um empreendimento com torres/pavimentos/unidades abre
o formulário preenchido e, ao salvar, a cópia tem as **mesmas contagens** e as
abas Espelho mostram **zero** unidades publicadas.

**1.4 — `EmpreendimentoModule.tsx` · remover KPI cards**
Apagar o grid, o memo `kpis` e o import de `KpiCard`.
**Pronto quando:** a tela vai do `<h1>` ao card da tabela e `npm run build` passa.

### Fase 2 — Criar obra a partir do empreendimento (item 2)

**2.1 — `components/empreendimento/CriarObraSheet.tsx` (novo)**
Instância **local** de `ProjectModal` (`mode="create"`,
`initialClassification="OBRA"`, `initialData` pré-preenchido com nome,
organização e endereço do empreendimento). Grava por
`projectService.saveProject` — não por `createObraForTower`, que não gera código
sequencial — e vincula com `setObraPrincipal` ou `linkTowerObra`.
**Pronto quando:** a obra aparece em Engenharia › Obras **com código sequencial**
e o vínculo já aparece na aba Vinculações sem recarregar a página.

**2.2 — pontos de entrada**
Botão na coluna Ações da lista e na aba Vinculações (header da seção Obras e
linha de torre sem obra).
**Pronto quando:** os dois caminhos abrem o modal preenchido e criam+vinculam.

### Fase 3 — Bug "Nenhuma obra disponível" (item 3) · `VinculacoesTab.tsx`

- **3.1** `availableObras` deixa de sair do store e passa a carregar via
  `projectService.listProjects(undefined, undefined, true)` + `onlyObras()`, com
  estado de carregamento próprio no Sheet.
- **3.2** Cada linha mostra o nome da organização; obras de organização diferente
  ganham marcação em texto (§8) e vêm depois das da organização do empreendimento.
- **3.3** `mapObrasToEmpreendimentos(undefined)` desabilita obra já vinculada a
  **outro** empreendimento, com o motivo.
- **3.4** Empty state reescrito para distinguir "não há obra cadastrada" de "todas
  já vinculadas", com atalho para "Criar obra".
- **3.5** Busca por nome/código dentro do Sheet.

**Pronto quando:** no cenário real (empreendimento em SPE, obras na org do grupo)
o painel lista as obras com o nome da organização e vincular funciona — testado
com o seletor do topo nas três posições (org do empreendimento, org do grupo,
"Todas").

### Fase 4 — Remover KPI cards das 4 abas (item 5)

| Aba | Arquivo | O que sai |
|---|---|---|
| Espelho de Vendas | `EspelhoVendasTab.tsx` | grid de KPIs + componente `KpiCard` **local** + cálculos órfãos |
| Espelho de Locações | `EspelhoLocacoesTab.tsx` | idem |
| Vinculações | `VinculacoesTab.tsx` | grid + import + `contratosAtivos`/`ACTIVE_CONTRACT_STATUSES` se ficarem sem uso |
| Histórico | `HistoricoTab.tsx` | grid + memo `kpis` + import |

Remover só o cálculo que ficar sem consumidor (roll-ups e blocos de distribuição
continuam). Revisar o ritmo §20.1 depois da remoção.
**Pronto quando:** nenhuma das 5 telas (com a 1.4) tem card de indicador no topo,
o build passa e `check-ui-standard.sh` não acusa nada novo.

### Fase 5 — Coluna "Empreendimento" em 6 telas (item 6)

Nenhuma das 6 tabelas tem `empreendimento_id` — a coluna é **derivada em runtime**.
**Sem migration.**

**5.0 Helpers**
- (a) `empreendimentoService.mapObrasToEmpreendimentos(orgId?)` — **já existe**
  (`:203`), cobre `empreendimentos.project_id` e `empreendimento_towers.project_id`.
  Serve às 4 telas de Suprimentos.
- (b) `mapPropertiesToEmpreendimentos(orgId?, purpose?)` — **novo**, lendo a view
  `public.vw_unit_property_map` (migration `20270842000000`, já aplicada e sem
  consumidor em TS), mais uma query em `empreendimentos` por
  `commercial_building_id`/`commercial_rental_building_id` para o modo edifício.

**5.1 Padrão por tela (5 pontos):** `COLUMNS`, `DEFAULT_COL_WIDTHS`,
`*_COLUMN_HEADERS`, `render*Cell`, e **`tableTotalWidth`** (array hardcoded em
todas — esquecer quebra o `table-layout:fixed`), mais o `switch` de ordenação.
`loadPersistedTableState` já faz merge de coluna nova: nasce visível, sem migração
de localStorage.

| Tela | Arquivo | Chave | Extras |
|---|---|---|---|
| Gestão de Locações | `RentalsModule.tsx` | `property.id` / `deal.property_id` → (b) RENTAL | 2 tabelas, 2 mapas de header, 2 listas de chaves, modo grade |
| Venda de Ativos | `SalesModule.tsx` | idem → (b) SALE | `INVENTORY_COLUMNS` tem `context`; modo grade |
| Gestão de Contratos | `SupplyChainContractList.tsx` | `contract.project_id` → (a) | ⚠️ mesmo componente é Contratos de Serviço e compartilha a storage key |
| Cotações | `SupplyChainQuotationList.tsx` | `req.projectId` → (a) | filtro avançado + modo grade |
| Pedidos de Compra | `SupplyChainOrderList.tsx` | `order.projectId` → (a) | `tableTotalWidth` começa em 40; filtro avançado; ver 5.3 |
| Recebimento | `SupplyChainReceiptManager.tsx` | idem | sem grade nem filtro avançado |

**5.3 Pedido lançado em ORÇAMENTO:** `orderService.listOrders` expõe só
`linkedProjectName` — acrescentar `linkedProjectId` ao mapper e ao tipo
`PurchaseOrder`, e resolver `mapa[linkedProjectId ?? projectId]`. Sem isso, todo
pedido de orçamento mostra "—".

**5.4 Organização:** `RentalsModule`, `SalesModule` e `SupplyChainContractList`
recebem por prop; as outras três usam `useOrgContext()`. Nunca `if (!orgId) return`.

**Pronto quando:** cada tela mostra a coluna preenchida para ao menos um registro
real, o `ColumnConfigButton` oculta e a preferência sobrevive ao reload, a
ordenação funciona nos dois sentidos, e o modo grade também mostra o dado.

## Estado

Implementação concluída em 2026-08-12 (código). **Nada foi verificado no
navegador ainda** — ver "Verificação" abaixo.

- [x] Fase 1 — lista (Ações, Organização, KPIs) — `components/empreendimento/EmpreendimentoModule.tsx`
- [x] Fase 1.3 — duplicar — `empreendimentoService.copyStructure` + `EmpreendimentoForm.duplicateFrom`
- [x] Fase 4 — KPIs das 4 abas — Espelho Vendas/Locações, Vinculações, Histórico
- [x] Fase 3 — bug de vinculações — `VinculacoesTab.tsx`
- [x] Fase 2 — criar obra — `components/empreendimento/CriarObraDoEmpreendimento.tsx` (novo)
- [x] Fase 5 — coluna Empreendimento nas 6 telas + `EmpreendimentoCell.tsx` (novo)

### Decisões de implementação registradas

- **Coluna Ações:** Editar e Duplicar ficam visíveis; "Criar obra" e "Excluir"
  foram para um `InlineActionTray` (kebab), porque §9/§9.2 não permite 4 ícones
  soltos na fileira. Excluir mantém o `useConfirm()` com a mensagem original.
- **Busca do painel "Vincular obra":** virou `usePersistedState` (§3 obriga) e
  por isso NÃO é zerada ao reabrir o painel — o termo continua visível no campo.
- **Obra já vinculada a outro empreendimento** aparece na lista, porém
  desabilitada e com o motivo. Bloqueio, não aviso: uma obra em dois
  empreendimentos deixa `mapObrasToEmpreendimentos` ambíguo.
- **`SheetPanel` ganhou `p-6`** no painel de vínculo — ele não traz padding
  próprio, e a busca nova colaria na borda.
- **Ritmo §20.1:** a barra de abas do `EmpreendimentoDetail` mantém `mb-3`. Ela
  já era 12px até o conteúdo nas 5 abas que nunca tiveram KPI; mudar para 24px
  seria alterar o espaçamento do módulo inteiro, além do pedido.
- **Cards de grade** (Locações, Venda de Ativos, Cotações, Pedidos) também
  mostram o empreendimento. Nos dois do Comercial o bloco novo usa a tipografia
  do §21 (sentence case, peso normal), não o `font-black uppercase` do card
  legado em volta — código novo não reproduz estilo deprecado.

### Achados fora do escopo (não corrigidos)

- `renderDealCell` e `DEALS_COLUMN_HEADERS` em `SalesModule.tsx` são **código
  morto**: a tabela de Negociações monta cada coluna em JSX explícito. Foram
  mantidos consistentes com `DEALS_COLUMNS`, mas ninguém os chama.
- `createObraForTower` (`empreendimentoService.ts`) segue inserindo direto no
  Supabase, sem código sequencial e sem gravar `organization_id` na coluna nativa.
- `taxPayableService.enrichWithEmpreendimento` segue com a cadeia manual de 4
  queries que `vw_unit_property_map` agora substitui.

## Verificação

### Mecânica — executada em 2026-08-12, tudo passou

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit -p .` | ✅ limpo |
| `npm run build` | ✅ `built in 15.62s` + PWA gerado |
| `npx vitest run __tests__/orgContextGuard.test.ts` | ✅ 14/14 |
| `bash scripts/check-project-classification.sh` | ✅ nenhuma comparação literal |
| `bash scripts/check-system-projects.sh` | ✅ nenhum filtro manual |
| `bash scripts/check-ui-standard.sh` (14 arquivos) | ✅ 8 arquivos novos/do módulo com **0**; as 6 telas ficaram **exatamente no baseline do HEAD** (Contratos 3, Cotações 1, Pedidos 3, Recebimento 1, Locações 14, Vendas 13) |

⚠️ Os números de baseline acima são o **falso positivo conhecido** do §7 do
checador: o awk trata `<h1>`/`<h3>`/`<button>` fora de `<td>` como se estivessem
dentro, porque um `<td>` anterior (ou um comentário) deixa o parser aberto.
Conferido rodando o script na versão do HEAD de cada arquivo — mesma contagem,
mesmas linhas. Nenhuma violação nova foi introduzida.

### No navegador — PENDENTE

Nada foi aberto na aplicação. Os itens abaixo continuam por verificar:
1. Lista: botões Editar/Duplicar/Criar obra/Excluir; coluna Organização com o topo
   em "Todas"; nenhum KPI card.
2. Duplicar: contagens iguais, zero unidades publicadas na cópia.
3. Criar obra pelos dois pontos de entrada; código sequencial em Engenharia › Obras.
4. Vincular obra com o seletor do topo nas 3 posições.
5. Abas Espelho/Vinculações/Histórico sem cards, com o resto intacto.
6. As 6 telas do item 6 — incluindo um pedido lançado em orçamento (5.3) e o modo
   edifício das duas telas do Comercial (helper b).

## Fora de escopo (registrado, não feito)

- `taxPayableService.enrichWithEmpreendimento` (`:161-240`) segue com a cadeia
  manual de 4 queries mesmo depois de a view ganhar wrapper.
- `createObraForTower` (`empreendimentoService.ts:528`) segue inserindo direto no
  Supabase, sem código sequencial e sem gravar `organization_id` na coluna nativa.
