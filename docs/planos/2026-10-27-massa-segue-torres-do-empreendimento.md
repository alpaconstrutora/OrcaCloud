# Planta: blocos da massa seguem Torres e Unidades do Empreendimento

## Pedido original (27/10/2026, literal)

> ao conectar com empreendimento deve-se trazer tudo conforme esta no emprendimento da aba torres e unidades.
> verifique como esta a conexão.
> Por exemplo a planta (Planta 26/10/2026) esta conectado ao empreendimento 011 - Garden Cambuhy.
> então os dados do empreendimento 011 - Garden Cambuhy.> aba torres e unidades deve-se ser vinculados. Torre A e
> Torre B, quantidadede de pavimentos, nome do pavimentos etc etc

## Contexto

### Como está a conexão hoje (verificado no banco e no código, origin/main 617c78e)

- **Vínculo:**
  - A "Planta 26/10/2026" chega ao Garden pela **zona urbanística** (`blueprint_study_urban_context.empreendimento_id`).
  - A planta vinculada oficialmente (`empreendimentos.blueprint_study_id`) é a "Garden".
  - O editor resolve o empreendimento em cascata, `empreendimentoVinculado?.id || zona.empreendimentoId || sugerido`
    (`BlueprintEditor.tsx:~9131`), então o Garden vale para as duas.
- **Dados do Garden (Torres e Unidades):**
  - Nenhuma linha em `empreendimento_floors`; os pavimentos só existem pelos andares das unidades.
  - **Torre A** (17 un.): `floors_count` vazio. Andares -2 e -1 (GARAGEM), 0 (Térreo), 1–3 (TIPO), ou seja,
    4 acima do solo + 2 garagens.
  - **Torre B** (24 un.): `floors_count` 6, 4/andar, andares 0–5.
  - Inconsistências do cadastro, a avisar e não corrigir: andar 2 da Torre B marcado TERREO; andar 3 da Torre A
    com unidades 303/204/201/202 (repetidas do 2º).
- **O que a massa usa hoje:**
  - O "Seguir o Empreendimento" do Gerar massa (`utils/blueprintMassaDoEmpreendimento.ts`) lê só a quantidade de
    torres e uma faixa mín–máx de `floors_count`. Por isso a Torre A saiu com 6 pavimentos: só a B tinha número.
  - Ignora o nome das torres, os pavimentos por torre, o nome dos pavimentos e as garagens.
  - Os nomes "Torre A/B" da massa são os nomes fixos do gerador. Nenhum bloco é ligado a uma torre.
  - O `Bloco` não guarda nome por pavimento.

Decisões do usuário:
- **Quando:** o Gerar massa já sai seguindo as torres, e os blocos existentes ganham a comparação + o botão
  **"Ajustar ao Empreendimento"** (Ctrl+Z desfaz). Nada muda sozinho.
- **Garagens:** um **subsolo sob cada torre** que tem garagem.

## Abordagem

Ligar bloco ↔ torre **pelo nome**: bloco "Torre A" = torre "Torre A", e o subsolo dela se chama
"Torre A · Garagem". É a mesma regra de adoção da sincronização inversa (`services/sync/planner.ts`). Não mexe no
kernel (o `Bloco.parametros` não é gravável por comando) e o vínculo fica visível para quem lê.

### 1. Estrutura da torre (puro, novo): `utils/blueprintEstruturaDaTorre.ts`

`estruturaDaTorre(torre, pavimentos: EmpreendimentoFloor[]): EstruturaDaTorre`, que devolve
`{ nome, acima: Piso[], garagens: Piso[], fonte: 'CADASTRO'|'UNIDADES'|'FLOORS_COUNT', avisos }`,
com `Piso = { numero, nome, tipo }`.

- **Fonte dos pavimentos, em ordem de prioridade:**
  1. `empreendimento_floors`, expandindo `repeat_count`, como já faz `montarEstudoDoEmpreendimento`
     (`utils/blueprintEstudoDoEmpreendimento.ts:76-100`). Extrair esse laço para cá e fazer o estudo declarado
     usar a mesma função.
  2. Os andares distintos das unidades (`floor`/`floor_tipo`).
  3. `floors_count`, que vira Térreo + Pavimento 1..N-1.
- **Nome do pavimento:**
  - Se o pavimento está cadastrado, vale o `name` dele.
  - Senão, reusa `rotuloDoAndar` (`blueprintEstudoDoEmpreendimento.ts:47`). Andar negativo de GARAGEM vira
    "Garagem N".
- **Separação:** `numero < 0` ou tipo SUBSOLO/GARAGEM vai para `garagens`; o resto vai para `acima`.
- **Avisos:**
  - `floors_count` vazio ou diferente do que as unidades dizem.
  - TERREO fora do andar 0.
  - Andar sem unidade (só quando a fonte é UNIDADES).
- Exclui as mesmas torres que `massaDoEmpreendimento` exclui (`blueprint_quadra_uid`).
- Torre com `blueprint_bloco_uid` (nasceu da massa) **entra**, porque o nome dela já é o do bloco.

### 2. Ajuste dos blocos (puro, novo): `utils/blueprintAjusteAoEmpreendimento.ts`

`ajusteAoEmpreendimento(model, estruturas, levelId)` devolve
`{ linhas: Comparacao[], comandos: Command[], avisos }`.

- **Correspondência:**
  - Primeiro pelo nome.
  - As torres que sobram casam com os blocos não-garagem, ainda sem par, na ordem do nome. Isso cobre "Torre" e
    "Bloco A".
  - Torre sem bloco: avisa ("desenhe ou gere a massa"); não inventa geometria.
  - Bloco sem torre: avisa e fica como está.
- **Comandos (`SetBlocoProps`):**
  - O bloco recebe `nome` = torre e `pavimentos = acima.length`.
  - O subsolo da torre com garagens nasce por `AddBloco` (ou é ajustado, se já existe pelo nome
    "Torre A · Garagem"): mesmo contorno da torre, `uso: 'GARAGEM'`, `pavimentos = garagens.length`,
    `cotaBaseMm = -garagens.length × peDireito`.
  - O subsolo de lote inteiro gerado antes ("Subsolo") **não é apagado**. O ajuste avisa que ele não é do
    empreendimento.
- **`linhas`:** Torre | no Empreendimento (n acima + n garagens, fonte) | na Planta | estado
  (OK / AJUSTAR / SEM BLOCO / SEM TORRE). É o que o painel mostra.

### 3. Nomes dos pavimentos no painel (pedido de hoje cedo, PR #203)

- `resumoDoPiso(medida, indice, nomes?)`: com a estrutura da torre casada, o título vira
  "Torre A · 2º pavimento de 4 — Pavimento 1". Os botões 1º…N ganham o nome no `title`.
- Num bloco de garagem, o piso k corresponde a `garagens` ordenadas da mais funda para a mais rasa.

### 4. Dados: `hooks/useUnidadesDoEmpreendimento.ts` + serviço

- Trazer também os pavimentos: `empreendimentoService.listFloorsDasTorres(towerIds)`, uma consulta com
  `.in('tower_id', ids)` ao lado do `listFloors` existente (`services/empreendimentoService.ts:1394`).
- Hoje o `getById(..., { includeChildren })` não traz pavimentos.
- Ligar o hook também quando a planta tem blocos (o painel do bloco precisa dele), não só com as telas abertas.

### 5. Telas

- **`PainelBlocoSelecionado`:**
  - Seção "Empreendimento «nome»" com a linha da torre casada e o botão **"Ajustar ao Empreendimento"**, que ajusta
    **todos** os blocos num `runBatch` (um Ctrl+Z).
  - Quando nada há a ajustar, o botão fica desligado e diz o motivo.
  - Aviso amarelo com os avisos do cadastro.
- **Gerar massa** (`TelaGeradorDeMassa` + `aplicarMassaGerada`, `BlueprintEditor.tsx:~6103`):
  - Com "Seguir o Empreendimento" ligado, a restrição usa as contagens `acima` por torre: faixa = [menor, maior]
    entre as torres. Hoje usa `floors_count`, vazio na Torre A.
  - Ao **Aplicar**, os comandos do ajuste vão no mesmo lote, depois de `comandosDoCandidato`: as torres ganham nome
    e pavimentos do empreendimento, e os subsolos por torre nascem.
  - O subsolo/pilotis do próprio gerador fica fora quando o empreendimento declara garagens.
  - O resumo da caixa mostra "Torre A: 4 + 2 garagens · Torre B: 6".
- O motor de massa remede depois de aplicar: pavimento fora do envelope ou acima do gabarito continua vermelho,
  sem esconder conflito com a zona.

## Arquivos

- **Novos:**
  - `utils/blueprintEstruturaDaTorre.ts`, `utils/blueprintAjusteAoEmpreendimento.ts`
  - `__tests__/blueprintEstruturaDaTorre.test.ts`, `__tests__/blueprintAjusteAoEmpreendimento.test.ts`
  - `__tests__/components/PainelBlocoSelecionadoEmpreendimento.test.tsx`
  - `docs/planos/2026-10-27-massa-segue-torres-do-empreendimento.md` (pedido literal)
- **Alterados:**
  - `utils/blueprintEstudoDoEmpreendimento.ts` (passa a usar a estrutura extraída)
  - `utils/blueprintMassaDoEmpreendimento.ts` (contagem por torre)
  - `utils/blueprintMassa.ts` (`resumoDoPiso` com nomes)
  - `hooks/useUnidadesDoEmpreendimento.ts`, `services/empreendimentoService.ts`
  - `components/blueprint/PainelBlocoSelecionado.tsx`, `TelaGeradorDeMassa.tsx`, `BlueprintEditor.tsx`

## Fora do escopo (dito, não feito)

- Corrigir o cadastro do Garden (floors_count da Torre A, Térreo no andar 2 da B, unidades repetidas no 3º da A).
  O app avisa; quem corrige é o usuário, na aba Torres e Unidades.
- Pé-direito por pavimento: o empreendimento não tem esse campo. Continua o do bloco (3,00 m).
- Gravar o vínculo bloco↔torre no kernel. Fica pelo nome.

## Verificação

1. TDD dos dois puros:
   - fonte CADASTRO, UNIDADES e FLOORS_COUNT, com os dados reais do Garden como fixture;
   - nomes e garagens;
   - os avisos;
   - correspondência por nome e por ordem;
   - subsolo por torre.
2. `resumoDoPiso` com nomes. Teste de componente do painel: linha da torre, botão desligado com motivo.
3. tsc, testes da massa/3D/estudo declarado, `BlueprintEditor.test.tsx` sozinho, check-ui-standard dos painéis
   tocados.
4. PR de rascunho → CI verde → eu faço o merge → `conferir-producao.sh`.
5. Chrome do usuário, "Planta 26/10/2026":
   - O painel da Torre A mostra "no Empreendimento: 4 + 2 garagens · na Planta: 6" com AJUSTAR.
   - Clicar em "Ajustar" grava no rascunho dessa planta, então só com o ok do usuário (Ctrl+Z desfaz). Depois,
     o 3D mostra Torre A com 4 pavimentos + subsolo de 2 e a Torre B com 6, e os nomes "Térreo", "Pavimento 1"…
     aparecem no painel do pavimento.

## Execução (27/10/2026)

- Desvio do plano, item 1: o estudo declarado (`montarEstudoDoEmpreendimento`) **não** passou a usar a estrutura
  extraída. Ele nomeia repetições pelo número do andar ("Tipo 3") e as garagens das unidades como "Subsolo N", e mudar
  isso mexeria em estudos já gerados. Os dois compartilham só a regra de nomes ("Térreo", "Pavimento N"). Fica para
  quando se quiser unificar.
- O hook passa a ler também com um bloco selecionado (o painel precisa) e traz `pavimentosPorTorre` numa consulta só
  (`listFloorsDasTorres`).
- Gerar massa: o "Criar alternativa" também veste os blocos, não só o "Aplicar".
