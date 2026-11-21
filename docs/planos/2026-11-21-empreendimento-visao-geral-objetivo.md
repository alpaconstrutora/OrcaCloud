# Empreendimento: Visão Geral editável, Objetivo e ajustes de abas

> Frente: `bash scripts/nova-frente.sh empreendimento-visao-geral` (REGRA #8). Toda leitura vem
> da frente ou de `origin/main`, porque o checkout de integração está 1645 commits atrás.

## Pedido original (21/11/2026, sessão Claude Code no VS Code, madrugada)

> incorporação > empreendimento:
> 1. Aba Visão Geral: transformar em campos editáveis no estilo do recursos humanos > Colaboradores > Editar Colaborador. Bloquear edição caso as informações tenham outro origem, por exemplo de planta inteligente.
> 2. Aba receitas: Switches das abas publicar e vendável: implementar um tamanho menor do switch
> 3. Aba sincronização:
> 3.1 Mover aba sincronização para lago apos a aba vinculações.
> 3.2 card Arquitetura qual a função?
> 4. Aba Histórico: implementar filtro Grupo + botoes classificação e expandir/recolher. Incluir também botão de ajuste automático de largura de colunas
> 5. Aba Mapa regulatório: implementar filtro Grupo + botoes classificação e expandir/recolher. Incluir também botão de ajuste automático de largura de colunas
> 6. Aba vinculações: Implementar accordion em cada sessao.
> 7. Criar funcionalidade objetivo. Finalidade é dar ao objetivo do empreendimento que são 3 (vendas, locação, Misto (venda e locação).
> 7.1. Incluir em editar.
> 7.2. Incluir na tabela
> 8. Dentro de empreendimento existem duas abas (Espelho de Vendas e Espelho de Locações)
> 8.1. Se o objetivo for Vendas: ocultar aba Espelho de Locações;
> 8.2. Se o objetivo for Locação: ocultar aba Espelho de Vendas;
> 8.3. Se o objetivo for Misto: exibir as duas abas Espelho de Vendas e Espelho de Locações;

### Decisões do usuário (mesma sessão)
- **Botão "Editar" do topo sai.** A Visão Geral é o único lugar de edição da ficha. O painel lateral
  (`EmpreendimentoForm`) fica só para Novo e Duplicar.
- **Trava por origem:** fica travado só o campo do terreno que a Planta vinculada traz. A trava mostra
  um cadeado, o texto "Vem da Planta Inteligente" e um link para a Planta. A mesma trava vale na seção
  Terreno da aba Torres & Unidades.
- **Objetivo:** os empreendimentos existentes nascem como Misto. Trocar para um objetivo que esconde
  um espelho com unidades publicadas mostra um aviso, mas a troca é permitida.

### Leitura do pedido
- **Item 2:** "Aba receitas" é a aba **Espelho de Vendas**. É lá que ficam os switches Publicar e
  Vendável (`EspelhoVendasTab.tsx:569-606`, 44×24 feitos à mão). "Receitas" só existe na Viabilidade,
  e lá não há esses switches.
- **"Botões de classificação" (itens 4 e 5):** o guia §6.4 proíbe um "Ordenar por" fora do `<thead>`.
  Por isso a classificação fica assim: ordenação pelo cabeçalho (as duas tabelas já têm) mais o
  seletor Crescente/Decrescente da ordem dos grupos, que vem dentro do `AgruparControles`.
- **Item 3.2** é uma pergunta. A resposta está no fim deste plano e vai na mensagem ao usuário. Não muda código.

## Peças que já existem e serão reusadas
- Agrupamento: `components/ui/Agrupamento.tsx` (`AgruparControles`, `LinhaDeGrupo` com `semTotal`),
  `hooks/useAgrupamento.ts` e `utils/agruparLinhas.ts` (`chavePorNome`, `chavePorRotulo`, `chavePorMes`).
  Referências de tabela feita à mão: `CostCenterModule.tsx` e `BudgetEditor.tsx` (~2731).
- Largura: `useResizableColumns` + `autoFit()` com o botão `MoveHorizontal`
  (`ui/TableUtils.tsx`; modelo em `EmpreendimentoModule.tsx`, toolbar).
- Switch: `components/ui/TableSwitch.tsx` (36×20, já é o padrão "pequeno" da tabela).
- Formulário estilo RH: `LaborEmployeeForm.tsx`, que traz `InputGroup` (rótulo `text-xs font-semibold`
  em cima), `inputCls` h-9, seções com ícone + `h3 text-sm font-semibold` + `border-b`, grid de 2 a 3
  colunas, `useUnsavedChanges`, `SaveStatus`, Ctrl+S e um Salvar que não fecha a tela.
- Terreno da Planta: `services/blueprintTerrenoDaPlanta.ts` (`terrenoDaPlantaVinculada`) e
  `utils/blueprintTerrenoDaFicha.ts` (`compararComFicha`, `CAMPOS_DA_FICHA`, `patchDaPlantaParaFicha`).
  É a mesma fonte que a `TerrenoSecao` já usa.
- Accordion: as convenções de `components/blueprint/SecaoAccordion.tsx` (`<button aria-expanded
  aria-controls>`, `ChevronRight` que gira, ações fora do botão), aplicadas ao `LinkSection` local.

---

## Itens

### 1. Objetivo: coluna, tipo e serviço (base dos itens 7 e 8)
**Muda:**
- Migration `supabase/migrations/aplicar_20271121900000_empreendimento_objetivo.sql`. Antes de criar,
  conferir todos os nomes da pasta (memória do prefixo). Conteúdo:
  `ALTER TABLE empreendimentos ADD COLUMN IF NOT EXISTS objetivo text NOT NULL DEFAULT 'MISTO'`
  + `CHECK (objetivo IN ('VENDAS','LOCACAO','MISTO'))` (com o nome da constraint, criada só se não existir).
  - Não cria policy nem função, então a REGRA #7 não se aplica.
  - Rollback: `DROP COLUMN objetivo`.
  - Aplicar com `npx supabase db query --linked -f` **antes** do push. O front velho ignora a coluna.
- `types/empreendimento.ts`: `EmpreendimentoObjetivo = 'VENDAS'|'LOCACAO'|'MISTO'` e o campo
  `objetivo` em `Empreendimento`, Insert e Update.
- `services/empreendimentoService.ts`: `objetivo` em `EMPREENDIMENTO_COLS`, mais create, update e
  copyStructure/duplicar.
- `utils/empreendimentoObjetivo.ts` (puro), com dois exports:
  - `ROTULO_DO_OBJETIVO` (Vendas / Locação / Misto (venda e locação)).
  - `espelhosDoObjetivo(obj) → { vendas: boolean; locacoes: boolean }`. Nulo ou desconhecido conta como MISTO.

**Pronto quando:**
- `SELECT objetivo, count(*) FROM empreendimentos GROUP BY 1` devolve só MISTO.
- O vitest de `espelhosDoObjetivo` passa nos 3 valores + nulo.

### 2. Visão Geral editável (item 1 + 7.1)
**Muda:**
- Novo `components/empreendimento/VisaoGeralFicha.tsx`, que sai de dentro do `EmpreendimentoDetail`.
  - É um card único no estilo `LaborEmployeeForm`. As seções são: **Identificação** (Nome, Código,
    Status, Tipo, **Objetivo**, Empresa, Organização), **Dados Gerais**, **SPE**, **Endereço**
    (`CityStateSelect`), **Terreno**, **Comercial** (VGV com `MoneyCentsInput`, Lançamento, Previsão
    de entrega) e **Vínculos**.
  - Vínculos fica só leitura, com a frase "gerencie na aba Vinculações" e um botão que leva à aba.
    Os estudos e a obra são escritos por lá.
  - Salvar fica no topo do card, com `SaveStatus` à esquerda. Ctrl+S salva. `useUnsavedChanges`
    pergunta antes de sair da aba ou voltar com alteração pendente.
- A Organização herda o comportamento que o painel tinha em modo edição (`EmpreendimentoForm.tsx` ~143):
  as mesmas orgs graváveis e a mesma confirmação ao trocar.
- Consolidar em `utils/empreendimentoFicha.ts` o `fichaDe(e)` e o `payloadDaFicha(form)`, que hoje
  vivem dentro do `EmpreendimentoForm` (~122 e ~253-281). O painel (Novo/Duplicar) e a Visão Geral
  passam a montar o payload pela mesma função.
- **Objetivo com aviso:** ao escolher um objetivo que esconde um espelho, conta as unidades com
  `rental_property_id` (ao esconder Locações) ou `commercial_property_id` (ao esconder Vendas). Se
  houver alguma, mostra sob o campo "N unidade(s) seguem publicadas em Locações; a aba fica oculta".
  A troca continua permitida.
- **Trava por origem (terreno):** novo hook `hooks/useTerrenoDaPlanta.ts`, extraído do que a
  `TerrenoSecao` já faz (~114-161). Ele devolve a comparação e `travado(campo)`, que é verdadeiro
  quando a Planta vinculada traz valor para aquele campo.
  - Campo travado: `readOnly`, com o valor em cor normal (memória "valor nunca cinza"), cadeado e
    `title` "Vem da Planta Inteligente — altere na Planta", mais o link `#/blueprint?studyId=…`.
  - Se a ficha diverge da Planta, aparece a dica "Planta: X · diferente" e fica disponível
    "Usar valores da Planta", que é o caminho que já existe para alinhar.
  - A `TerrenoSecao` passa a usar o mesmo hook e a mesma trava.
- `EmpreendimentoDetail.tsx`: o botão "Editar" do topo e o prop `onEdit` saem.
- `EmpreendimentoModule.tsx`: a ação "Editar" da linha abre a ficha na Visão Geral. O painel perde o
  ramo `editing`, e a "Obra por Torre" já existe em Vinculações › Torres sem obra própria.

**Desvios ao implementar (21/11/2026), registrados aqui em vez de reescrever o item:**
- **Sem `VisaoGeralFicha.tsx` novo:** o próprio `EmpreendimentoForm` ganhou `modo="embutido"`. O
  painel (Novo/Duplicar) e a Visão Geral são duas cascas do MESMO formulário, para não haver dois
  formulários com os mesmos campos.
- **Vínculos continuam EDITÁVEIS na Visão Geral (não só leitura):** a aba Vinculações só
  *desvincula* estudos. Vincular Viabilidade, Planta e obra principal só existia no painel de
  edição, que saiu. Sem os três seletores aqui, a função se perderia. A "Obra por Torre" saiu, porque
  Vinculações › Torres sem obra própria já faz isso.
- **Sem `hooks/useTerrenoDaPlanta.ts`:** a Visão Geral monta a própria `TerrenoSecao`, a mesma da
  aba Torres, e a trava foi feita nela. Assim é um dono só, e a trava vale nas duas abas sem cópia.
  No **Lote**, a Visão Geral aponta para a aba Lote: lá, salvar o terreno leva área e testada à
  unidade (`levarTerrenoAoLote`), e duplicar essa ponte aqui seria uma segunda porta.
- **Salvar manda só o que mudou** (`mudancasDaFicha`). Assim não reescreve com valor velho o que
  outra aba gravou enquanto a ficha estava aberta, e campo apagado vai como `null`. Antes, no
  painel, `|| undefined` fazia o valor apagado voltar.
- Status ganhou "Em Operação" nas opções. O condomínio grava esse status, e o select o mostrava vazio.

**Pronto quando:**
- Na ficha aberta, editar Nome, Matrícula ou VGV e salvar faz o valor sobreviver ao F5.
- O Histórico registra a alteração.
- Num empreendimento com Planta vinculada que traz área e testada, esses dois campos ficam travados
  com o cadeado (na Visão Geral e na aba Torres). Os campos que a Planta não traz continuam editáveis.
- Sem Planta vinculada, nada fica travado.
- Não existe mais o botão Editar no topo. Novo e Duplicar continuam abrindo o painel.
- Os testes de `payloadDaFicha` passam.

### 3. Tabela da lista com Objetivo (item 7.2)
**Muda:** `EmpreendimentoModule.tsx` ganha a coluna `objetivo`, depois de Tipo, em 6 lugares:
`COLUMNS`, `DEFAULT_COL_WIDTHS`, `EMPREENDIMENTO_COLUMN_HEADERS`, `renderEmpreendimentoCell`, o sort e
a opção "Objetivo" no Agrupar (`GROUP_BY_OPTIONS` + `keyOf`/`labelOf`). A célula usa
`text-sm font-normal text-gray-700`.

**Pronto quando:** a coluna aparece também para quem já tinha layout salvo (merge do
`useTableColumns`), ordena e agrupa.

### 4. Abas: ordem e visibilidade pelo Objetivo (itens 3.1, 8)
**Muda:** `EmpreendimentoDetail.tsx`.
- Nova ordem: Visão Geral, Torres/Lote/Unidade, Características, Mapa Regulatório, Espelho de Vendas,
  Espelho de Locações, Documentos, Vinculações, **Sincronização**, Histórico. A Sincronização mantém
  o badge da Curadoria.
- O rótulo "Mapa Regulatorio" passa a "Mapa Regulatório".
- As abas `comercial` e `locacoes` entram ou saem conforme `espelhosDoObjetivo(e.objetivo)`.
- Se a aba ativa sumir (porque o objetivo foi trocado), a tela volta para a Visão Geral.
- O `onAbrirEspelho` do `UnidadeUnicaEditor` (~466) leva ao espelho que estiver visível.
- O aviso da `SyncCenterTab` (~611) que manda para "as abas Espelho" cita só as que existem.

**Pronto quando:** com Vendas, Locações some; com Locação, Vendas some; com Misto, aparecem as
duas. Trocar o objetivo na Visão Geral e salvar já reflete no trilho, sem F5.

### 5. Switches menores no Espelho de Vendas (item 2)
**Muda:**
- `EspelhoVendasTab.tsx`: os dois switches feitos à mão passam a ser `TableSwitch` (36×20). Vendável
  usa `onColor="peer-checked:bg-emerald-600"`.
- O anel âmbar de "alteração pendente" vira uma prop opcional `destaque?: boolean` no `TableSwitch`,
  para não criar uma terceira cópia à mão.

**Pronto quando:** os dois switches medem 36×20 no navegador, ligam e desligam, e o anel âmbar
aparece quando há pendência.

### 6. Histórico: agrupar, ordem, expandir/recolher e ajustar largura (item 4)
**Muda:** `HistoricoTab.tsx`.
- `useAgrupamento('empreendimento:historico')` + `AgruparControles` na toolbar, depois dos filtros (§5.2).
- As opções são Dia (`chavePorMes`/dia de `created_at`), Entidade, Ação, Origem e Usuário.
- `LinhaDeGrupo semTotal`, com contagem por grupo.
- Entra o `useResizableColumns` (a tabela não tem hoje): `<colgroup>` com `data-col-key`, o
  espaçador e o botão `MoveHorizontal` → `autoFit()`.
- O agrupamento cobre as linhas já carregadas pelo "Carregar mais". O resumo diz isso quando houver mais páginas.

**Pronto quando:** dá para agrupar por cada opção, inverter a ordem dos grupos, recolher e expandir
todos (o botão fica desligado e explica o motivo quando não há grupo), e o ajuste de largura muda as
colunas. Campo e direção persistem no F5, os grupos recolhidos não.

### 7. Mapa Regulatório: o mesmo conjunto (item 5)
**Muda:** `components/RegulatoryZoneTable.tsx`. É a tabela compartilhada também pela Planta
Inteligente › Mapa Regulatório e pelo cadastro de mapas por cidade, então o ganho vale nas três
telas, de propósito.
- Agrupar por Macroárea, Zona, Uso permitido e Nível de confiança.
- Ordem dos grupos e expandir/recolher todos.
- O `autoFit` já existe e só é conferido.
- Sem coluna ordenada e sem grupo, a ordem do documento legal (`sort_order`) continua valendo.

**Pronto quando:** as três telas agrupam, recolhem e expandem, a edição inline continua funcionando
dentro de um grupo, e o `sort_order` original fica intacto sem agrupamento.

### 8. Vinculações em accordion (item 6)
**Muda:** `VinculacoesTab.tsx`.
- `LinkSection` ganha um cabeçalho clicável (`button aria-expanded aria-controls` + chevron), com o
  botão de ação fora dele.
- O card "Torres sem obra própria" (~553), hoje com o markup copiado, passa a usar `LinkSection`.
- O estado aberto/fechado fica num `usePersistedState('empreendimento:vinculacoes:abertas')`. Todas
  começam abertas e mostram a contagem quando recolhidas.

**Pronto quando:** cada uma das 9 seções recolhe e expande pelo teclado e pelo mouse, e o estado
sobrevive ao F5.

### 9. Verificação e publicação
- `npx tsc --noEmit` limpo na frente.
- Vitest dos helpers novos: `espelhosDoObjetivo`, `payloadDaFicha` e a trava do terreno.
- Ler `docs/ui_ux_guia_unificado.md` inteiro antes de editar (REGRA #1). Rodar
  `bash scripts/check-ui-standard.sh` em cada `.tsx` tocado e `bash scripts/check-org-selector-guard.sh`.
  No relatório, listar os itens do CHECKLIST DE APLICAÇÃO.
- Conferir no app local com Playwright (index_harness_navegador), em quatro cenários:
  - Um empreendimento com Planta vinculada: trava do terreno.
  - Um Lote (unidade única): o `onAbrirEspelho`.
  - A troca de objetivo, nos 3 valores, com o aviso.
  - Os itens 4 a 8, com prints.
- A migration é aplicada antes do push. Depois, PR → CI → eu faço o merge → `bash scripts/publicar-producao.sh`.

---

## Resposta ao 3.2: o que o card Arquitetura faz
Ele representa o estudo da **Planta Inteligente** ligado ao empreendimento (`blueprint_study_id`).

**O que mostra:**
- Se há estudo vinculado.
- Quantas divergências existem.
- Quantas aguardam a Curadoria.
- A data do último envio.
- Quantas unidades a massa publicada tem, ou quantos lotes o desenho publicado tem.

**Os botões, que fazem o dado ir da Planta para o Empreendimento, nunca ao contrário, e só a partir
da versão publicada:**
- **Trazer da massa:** os blocos viram torres e as unidades derivadas viram unidades, com pavimento,
  tipologia, áreas e dormitórios.
- **Trazer o loteamento:** as quadras viram torres e os lotes viram unidades, só com geometria (área,
  testada, confrontantes).
- **Trazer o terreno:** grava as medidas do terreno na ficha.
- **Abrir na planta:** só navega.

**As regras nos três casos:**
- Um campo vazio na ficha é preenchido direto.
- Um campo com valor diferente não é sobrescrito: vira proposta na Curadoria.
- Preço e status nunca são tocados.
- Uma unidade que sumiu da Planta fica como órfã e nunca é apagada.

O card **Viabilidade**, ao lado, faz o caminho inverso: envia a estrutura do Empreendimento para o
estudo Imovib.
