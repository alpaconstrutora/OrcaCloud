# Imovib › Premissas: tirar as abas que moram na Planta Inteligente, e ligar a Viabilidade a ela

## Pedido original

Sessão `4d99919b-99fd-431d-8392-2c229dc3a12a`, 2026-10-19:

> incorporacao > premissas: abas 2. blocos e tipologia, torres & unidades e 4. mapa regulatorio, ja existem em incoporação > planta inteligente. Então, incorporacao > premissas: abas 2. blocos e tipologia, torres & unidades e 4. mapa regulatorio, devem ser removidos

Mesma sessão, em resposta ao aviso de que "Blocos e Tipologia" era o único editor de
`imovib_blocks`/`imovib_units` (de onde saem CAPEX, Viabilidade Estática e Espelho):

> Como eu ja disse anteriomente, essas funcionalidades existem na planta inteligente. Estão proponha uma literconexão

## Como está hoje (levantado em 2026-10-19, `main` 313a978c)

A corrente tem três elos, e só os dois primeiros existem:

```
Planta Inteligente ──(já existe)──► Empreendimento ──(FALTA)──► Imovib (cálculo)
```

**Planta Inteligente → Empreendimento (já existe):**

| O quê | Como chega ao empreendimento |
|---|---|
| Blocos → torres, tipologias → unidades (`typology`, `private_area`, `common_area`, `floor`) | `services/massaEmpreendimentoSync.ts` (estudo de massa, da versão PUBLICADA) |
| Quadras/lotes | `services/blueprintEmpreendimentoSync.ts` |
| Terreno (área, frente, fundos, laterais) | `gravarAreaNoEmpreendimento` em `BlueprintEditor.tsx` → `empreendimentos.terreno_*` |
| Zona urbanística | `empreendimento_regulatory_zones` + `blueprint_study_urban_context` |

**Empreendimento → Imovib (o elo que falta):** o cálculo do Imovib não lê o empreendimento.
Ele lê as tabelas próprias do estudo:

- **`study.blocks`** (`imovib_blocks` + `imovib_units`), em quatro lugares:
  - `ImovibCapexForm.tsx`
  - `ImovibStaticViability.tsx`
  - `ImovibSalesMapTab.tsx`
  - `hooks/useImovibMath.ts`

  Os quatro calculam a área de jeitos diferentes: a Estática e o CAPEX usam T.O. × terreno × pavimentos, e o motor usa (privativa + comum) × custo/m².
- **`study.terreno_area`**: é a coluna do estudo, não a do empreendimento. A Planta grava o terreno no empreendimento, e a viabilidade nunca recebe esse valor.

O caminho manual que existe (`writeBackImovib.ts`, em Empreendimento › Central de Sync)
cria o bloco e as instâncias do espelho, mas **não cria tipologia** (`imovib_units`) nem
leva o terreno. Por isso ele não alimenta a Estática nem o CAPEX.

**Dados no banco:**

| Estudo | Empreendimento vinculado | Torres | Unidades | Blocos Imovib |
|---|---|---|---|---|
| Garden Cambuhy | 011 - Garden Cambuhy | 2 | 41 (8 tipologias) | 1 |
| Davi Bueno | — | — | — | 1 (2 tipologias) |
| Córrego do Bom Jesus | — | — | — | 1 (1 tipologia) |
| Bruninho | — | — | — | 1 (2 tipologias) |

Três dos quatro estudos **não têm empreendimento vinculado**. Nesses estudos, as abas
Torres & Unidades e Mapa Regulatório já não mostravam nada além do aviso "vincule um
empreendimento". O vínculo é `empreendimentos.imovib_study_id`, e hoje só se grava pelo
formulário do Empreendimento.

## Proposta de interconexão

**O Imovib passa a LER a estrutura do empreendimento vinculado, sem copiar.** A divisão fica assim:

- **O que vem do empreendimento**, e portanto da Planta Inteligente: blocos, tipologias, áreas, pavimentos, terreno e zona.
- **O que continua sendo do estudo**, porque é simulação e não fato: custo/m², preço/m², CAPEX, premissas financeiras e espelho de vendas.

Por que ler em vez de copiar: a cópia é o que já existe três vezes e falha do mesmo jeito.

- `sendToViabilidade` apaga os blocos e recria um bloco único.
- `writeBackImovib` não cria tipologia.
- `imovibAdapter` empurra na direção contrária.

Cada cópia é uma segunda verdade que diverge em silêncio. Com leitura, o que se publica
na Planta aparece na Viabilidade na próxima abertura, sem botão.

Em diagrama:

```
Planta Inteligente ─► Empreendimento (torres, unidades, terreno, zona)
                              │  leitura (novo, sem cópia)
                              ▼
                   estruturaDoEstudo(estudo)  ◄── imovib_blocks: custo/m², preço/m² por torre
                              │
              CAPEX · Estática · Espelho · motor (um formato só)
```

## Decisões do usuário

2026-10-19, mesma sessão:

> Decisões suas
> 1. Ler ou copiar? Ler.
> 2. de acordo

- **D1 — ler × copiar → LER.** Recomendado: **ler** (acima). A alternativa é estender o
  `writeBackImovib` para criar as tipologias e levar o terreno, disparado ao publicar na
  Planta. É mais rápido de fazer, mas mantém duas verdades.
- **D2 — estudo sem empreendimento** (Davi Bueno, Córrego do Bom Jesus, Bruninho).
  Recomendado: continua lendo os blocos e tipologias que já tem, **só leitura**, com o
  aviso "vincule um empreendimento para editar a estrutura na Planta Inteligente". Nada é
  apagado. A alternativa é criar um empreendimento para cada um com a estrutura atual, o
  que gera cadastros reais que talvez ninguém queira. → **De acordo (só leitura).**

## Itens

### Fase 0 — remover as abas (feita nesta sessão)

- [x] **`components/ImovibPremisesForm.tsx`**: saem as abas 2. Blocos e Tipologia, 3.
  Torres & Unidades e 4. Mapa Regulatório. Sobram 0. Identificação e 1. Mercado, as duas do
  formulário, então a guarda de troca de sub-aba e a condição do botão Salvar saíram junto.
  *Pronto quando:* `tsc` limpo e a tela Premissas mostra só as duas abas.
- [x] **`components/ImovibBlocksTypologyTab.tsx`**: apagado, porque ficou sem uso.
  `EstudoTorresUnidades` e `EstudoMapaRegulatorio` **ficam**: o Estudo de Massa
  (`planta_ai/PlantaAiStudyDetail.tsx`) também usa os dois.
  *Pronto quando:* `grep ImovibBlocksTypologyTab` só encontra este plano e o comentário
  histórico em `utils/regulatoryValue.ts`.
- [x] **`components/ImovibForm.tsx:21,235`**: o texto ainda manda o usuário para
  "Premissas › 4. Mapa Regulatório". Trocar por "Planta Inteligente › Zona (do
  empreendimento vinculado)".
  *Pronto quando:* `grep "4. Mapa Regulatório" components` não acha nada.

### Fase 1 — vínculo visível

- [x] **`ImovibPremisesForm.tsx` › Identificação** (componente `ImovibVinculoEmpreendimento.tsx`): novo campo **Empreendimento
  vinculado**.
  - O seletor lista os empreendimentos da organização do estudo e grava `empreendimentos.imovib_study_id`.
  - Recusa empreendimento de outra organização: a lista só traz os da org do estudo, e a leitura ignora vínculo cruzado.
  - Empreendimento já ligado a outro estudo não aparece na lista, e o serviço também o recusa.
  - Com o empreendimento vinculado, mostra o link **Abrir na Planta Inteligente** (`blueprint_study_id`).

  *Pronto quando:* vincular Davi Bueno a um empreendimento de teste grava a coluna, e o
  link abre o estudo da Planta certo. → Gravação coberta em `__tests__/imovibVinculo.test.ts`
  (banco falso). Na tela (19/10): o seletor lista os empreendimentos da org, e o Garden mostra
  "2 torre(s) · 41 unidade(s) · Terreno 1.229 m²" e "Ainda sem planta" (o empreendimento não
  tem `blueprint_study_id`). **O link para a Planta não foi exercitado**: nenhum
  empreendimento vinculado tem planta ainda. A gravação do vínculo pela tela também não,
  porque a prova roda com as escritas bloqueadas.
- [x] **`services/imovibService.ts`**: `vincularEmpreendimento(studyId, empreendimentoId | null)`.
  Desvincula o anterior na mesma operação, porque a coluna não tem UNIQUE e todos os leitores usam `.maybeSingle()`.
  *Pronto quando:* há um teste que cobre "trocar de empreendimento não deixa dois apontando para o estudo".
  → `imovibVinculo.test.ts`: troca, recusa de empreendimento de outro estudo, desvincular,
  e UPDATE recusado em silêncio pela RLS virando erro.

### Fase 2 — a leitura

**Mudança em relação à proposta:** a função devolve o `ImovibBlock[]` que o motor JÁ lê, e
não um formato novo. Com `quantity` = total de unidades e `pavimentos` = 1, a conta do motor
(quantidade × pavimentos × área) dá exatamente a soma das unidades. Assim os consumidores não
precisaram ser reescritos: a troca acontece num ponto só, nos dois carregadores do
`imovibService` (`getStudyById` e `getStudiesWithMetrics`). O terreno do empreendimento
**não** sobrescreve `study.terreno_area` em memória, porque o "Salvar Premissas" espalha o
estudo no UPDATE e gravaria o valor na coluna sem ninguém pedir. Ele aparece só no cartão do
vínculo, e o motor não usa terreno.

- [x] **`utils/imovibEstrutura.ts`** (novo, função pura com teste) recebe o estudo, o
  empreendimento, as torres e as unidades, e devolve um formato só:
  `{ origem: 'empreendimento' | 'estudo', terrenoM2, blocos: [{ torreId, blocoId?, nome, custoM2, precoM2, pavimentos, tipologias: [{ nome, unidades, privativaMedia, comumMedia, vendavel }] }] }`.
  - Tipologia = unidades da torre agrupadas por `typology`.
  - `unidades` é o total (não quantidade × pavimentos, que hoje cada consumidor interpreta diferente).
  - Terreno = `empreendimentos.terreno_area`.
  - Sem empreendimento: devolve a forma atual de `imovib_blocks`/`imovib_units` com `origem: 'estudo'`.

  *Pronto quando:* existe um teste com o Garden Cambuhy (2 torres, 41 unidades, 8 tipologias) e um com o caso sem empreendimento.
  → `__tests__/imovibEstrutura.test.ts` (6 testes) usa o FORMATO do Garden: Torre A ligada
  ao bloco, Torre B sem bloco, unidade sem tipologia, vendável e não vendável. Não usa os 41
  números reais. O caso sem empreendimento está em `imovibVinculo.test.ts`. Os números reais
  do Garden ficam para a prova na tela.
- [x] **`ImovibCapexForm.tsx`, `ImovibStaticViability.tsx`, `ImovibSalesMapTab.tsx`,
  `hooks/useImovibMath.ts`**: os quatro passam a consumir `estruturaDoEstudo`. A área
  construída fica a mesma nos quatro: Σ (privativa + comum) das unidades. Isso também
  fecha o achado "Estática, espelho e motor calculam diferente" (avaliação de 12/10).
  *Pronto quando:* VGV, custo e área do Garden batem nas quatro telas, com teste em `computeImovibMath`.
  → Estática, Resumo, Espelho e listagem já liam do motor (fase de 12/10). O CAPEX tinha
  conta própria, "Área Total = T.O. × terreno × pavimentos", que saiu. No lugar entrou a
  área construída do motor, e o custo de cada torre agora é a área dela × custo/m². O teste
  do motor sobre a estrutura derivada está em `imovibEstrutura.test.ts`. Na tela, o Garden mostra
  VGV R$ 11.648.000 e custo R$ 4.518.000 no Resumo e na Estática, e área de 4.122 m² no CAPEX.
  Isso é 1.506 + 2.616 m² de 41 unidades. A listagem não foi conferida na tela; ela usa o
  mesmo carregador (`getStudiesWithMetrics` → `aplicarEstrutura`).
- [x] **Custo/m² e preço/m² por torre** (CAPEX › "Por torre"; o preço/m² editado na aba Blocos veio para cá):
  - Gravados em `imovib_blocks`, ligados pela `empreendimento_towers.imovib_block_id` que já existe.
  - A linha nasce no **primeiro salvar**, nunca na leitura.
  - O preço/m² abre pré-preenchido com Σ preço ÷ Σ privativa das unidades da torre (vindo do produto da Planta), sem sobrescrever o que já foi digitado.

  *Pronto quando:* abrir o estudo não escreve nada (conferido no Network) e salvar o custo de uma torre cria exatamente uma linha.
  → "Uma linha" e "desfaz se a torre não ligar" estão em `imovibVinculo.test.ts`. Sair do
  campo sem mudar o valor não grava. "Abrir não escreve": a prova abriu Garden, Davi e Bruninho
  em Resumo, Estática, CAPEX, Premissas e Receitas & Capital com as escritas interceptadas, e
  foram **0 tentativas**.
- [x] **Avisos do motor** (`hooks/useImovibMath.ts`):
  - `bloco_sem_preco`: torre com área vendável e VGV zero.
  - `estrutura_do_estudo`: estudo sem vínculo.
  - `blocos_fora_do_calculo`: bloco antigo que nenhuma torre reivindica.
  - `sem_area` e `sem_preco` agora dizem onde corrigir (Planta, ou Orçamento › Por torre).
- [x] **Espelho de vendas** (`ImovibSalesMapTab.tsx`): num estudo vinculado, Gerar e Alinhar
  trazem as unidades REAIS do empreendimento pelo `writeBackImovib`, em vez de multiplicar
  tipologias. Atualiza só estrutura, nunca preço nem status, e nunca apaga.

### Fase 3 — estudo sem empreendimento

- [x] Em CAPEX, Estática e Espelho, um aviso com `origem: 'estudo'`: "estrutura antiga
  deste estudo, só leitura — vincule um empreendimento para editar na Planta Inteligente".
  *Pronto quando:* Davi Bueno mostra os mesmos números de antes da mudança, mais o aviso.
  → O aviso `estrutura_do_estudo` aparece no banner (Estática, Resumo, Fluxo, Sensibilidade).
  O CAPEX diz "tipologias antigas do estudo" e o Espelho manda vincular. Antes × depois na
  tela: Davi R$ 0 → R$ 0; Bruninho VGV R$ 9.999.998 e custo R$ 5.390.000 nos dois. Os números
  são iguais e só o aviso é novo. O Córrego do Bom Jesus foi **apagado pelo usuário** em 19/10.

### Fase 4 — aposentar as cópias

**Mudança em relação à proposta:** feita junto com a Fase 2, não depois. Publicar a leitura
com o sync Imovib → Empreendimento ainda ativo deixaria um botão capaz de empurrar blocos
antigos de volta como torres.

- [x] **`services/sync/imovibAdapter.ts`** (Imovib → Empreendimento): **apagado**, em vez de
  desligado. Saíram junto `empreendimentoService.previewSync`/`syncFromStudy`, o
  `SyncFromStudyModal.tsx` e o botão "Sincronizar do estudo" da Central de Sync.
  Ninguém mais chamava esse código.
- [x] **`services/sync/writeBackImovib.ts`** **fica**: virou o caminho do Espelho. Ele cria o
  bloco de uma torre sem bloco, que é a linha de custo/preço daquela torre, sem duplicar a
  estrutura. "Enviar ao estudo" na Central de Sync continua, rotulado "Espelho de vendas do estudo".
- [x] **`plantaAiIntegration.sendToViabilidade`**: com o estudo ligado a um empreendimento,
  não apaga nem recria blocos; só atualiza os campos escalares.
  *Pronto quando:* reenviar da Planta IA não apaga custo/preço digitados. → Pelo código; não
  testado contra o banco.

## Andamento

- 2026-10-19: Fase 0 com 3 de 3 itens feitos na frente `imovib-premissas-abas` (`tsc` limpo,
  `check-ui-standard` sem violação, `orgContextGuard` 14/14). Proposta das Fases 1–4
  apresentada; D1 e D2 aguardam o usuário.
- 2026-10-19 (tarde): D1 = ler, D2 = de acordo. Fases 1–4 implementadas na frente. `tsc` limpo.
  - Testes: 11 arquivos, 125 testes (`imovibEstrutura` 6 e `imovibVinculo` 10 novos, mais
    `imovibMath`, `imovibEspelho`, `writeBackImovib`, `syncPlanner`, `syncPlantaInteligenteTravas`,
    `blueprintEmpreendimentoSync`, `empreendimentoTipos`, `imovibEdicao`, `orgContextGuard`).
  - `check-ui-standard` sem violação nas 7 telas tocadas.
  - Prova na tela, antes (produção) e depois (frente), com `c:/tmp/pwtest/imovib_estrutura_planta.js`:
    - Os números batem com o esperado.
    - 0 escritas ao abrir.
    - 1 erro de console `ERR_NO_BUFFER_SPACE`, da rede local, não do app.
    - **Achado e corrigido:** no CAPEX simplificado (Bruninho), a linha por torre mostrava
      "2.173,5 m² × custo = R$ 7.607.250", um valor que não entra no cálculo. Agora diz que,
      nesse modo, o custo por torre fica fora (`acef29c5`).
  - Refeito sobre `origin/main` 4b44ddf9: `tsc` limpo; 13 arquivos e 130 testes, incluindo
    `orgContextGuard`, `segurancaMigrations` e `migrationsPrefixo`. A suíte inteira, antes do
    rebase: 1.033 arquivos, 10.461 testes, 0 falhas, 34 pulados.
  - Números que vão mudar no Garden Cambuhy. Hoje: 1 bloco digitado, 4.800 m² × R$ 8.000 = VGV
    R$ 38,4 mi. Lendo do empreendimento:
    - Torre A: 1.456 m² privativos, VGV R$ 11,65 mi.
    - Torre B: 2.616 m², sem preço/m², VGV 0 até alguém informar o preço.
