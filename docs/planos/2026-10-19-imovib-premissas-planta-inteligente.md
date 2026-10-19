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

## Decisões em aberto (do usuário)

- **D1 — ler × copiar.** Recomendado: **ler** (acima). A alternativa é estender o
  `writeBackImovib` para criar as tipologias e levar o terreno, disparado ao publicar na
  Planta. É mais rápido de fazer, mas mantém duas verdades.
- **D2 — estudo sem empreendimento** (Davi Bueno, Córrego do Bom Jesus, Bruninho).
  Recomendado: continua lendo os blocos e tipologias que já tem, **só leitura**, com o
  aviso "vincule um empreendimento para editar a estrutura na Planta Inteligente". Nada é
  apagado. A alternativa é criar um empreendimento para cada um com a estrutura atual, o
  que gera cadastros reais que talvez ninguém queira.

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

### Fase 1 — vínculo visível (depende de D1)

- [ ] **`ImovibPremisesForm.tsx` › Identificação**: novo campo **Empreendimento
  vinculado**.
  - O seletor lista os empreendimentos da organização do estudo e grava `empreendimentos.imovib_study_id`.
  - Recusa empreendimento de outra organização (a mesma trava do `imovibAdapter`).
  - Com o empreendimento vinculado, mostra o link **Abrir na Planta Inteligente** (`blueprint_study_id`).

  *Pronto quando:* vincular Davi Bueno a um empreendimento de teste grava a coluna, e o
  link abre o estudo da Planta certo.
- [ ] **`services/imovibService.ts`**: `vincularEmpreendimento(studyId, empreendimentoId | null)`.
  Desvincula o anterior na mesma operação, porque a coluna não tem UNIQUE e todos os leitores usam `.maybeSingle()`.
  *Pronto quando:* há um teste que cobre "trocar de empreendimento não deixa dois apontando para o estudo".

### Fase 2 — a leitura (depende de D1 = ler)

- [ ] **`services/imovibEstrutura.ts`** (novo, função pura com teste) recebe o estudo, o
  empreendimento, as torres e as unidades, e devolve um formato só:
  `{ origem: 'empreendimento' | 'estudo', terrenoM2, blocos: [{ torreId, blocoId?, nome, custoM2, precoM2, pavimentos, tipologias: [{ nome, unidades, privativaMedia, comumMedia, vendavel }] }] }`.
  - Tipologia = unidades da torre agrupadas por `typology`.
  - `unidades` é o total (não quantidade × pavimentos, que hoje cada consumidor interpreta diferente).
  - Terreno = `empreendimentos.terreno_area`.
  - Sem empreendimento: devolve a forma atual de `imovib_blocks`/`imovib_units` com `origem: 'estudo'`.

  *Pronto quando:* existe um teste com o Garden Cambuhy (2 torres, 41 unidades, 8 tipologias) e um com o caso sem empreendimento.
- [ ] **`ImovibCapexForm.tsx`, `ImovibStaticViability.tsx`, `ImovibSalesMapTab.tsx`,
  `hooks/useImovibMath.ts`**: os quatro passam a consumir `estruturaDoEstudo`. A área
  construída fica a mesma nos quatro: Σ (privativa + comum) das unidades. Isso também
  fecha o achado "Estática, espelho e motor calculam diferente" (avaliação de 12/10).
  *Pronto quando:* VGV, custo e área do Garden batem nas quatro telas, com teste em `computeImovibMath`.
- [ ] **Custo/m² e preço/m² por torre**:
  - Gravados em `imovib_blocks`, ligados pela `empreendimento_towers.imovib_block_id` que já existe.
  - A linha nasce no **primeiro salvar**, nunca na leitura.
  - O preço/m² abre pré-preenchido com Σ preço ÷ Σ privativa das unidades da torre (vindo do produto da Planta), sem sobrescrever o que já foi digitado.

  *Pronto quando:* abrir o estudo não escreve nada (conferido no Network) e salvar o custo de uma torre cria exatamente uma linha.

### Fase 3 — estudo sem empreendimento (depende de D2)

- [ ] Em CAPEX, Estática e Espelho, um aviso com `origem: 'estudo'`: "estrutura antiga
  deste estudo, só leitura — vincule um empreendimento para editar na Planta Inteligente".
  *Pronto quando:* Davi Bueno mostra os mesmos números de antes da mudança, mais o aviso.

### Fase 4 — aposentar as cópias (depois da Fase 2 no ar)

- [ ] **`services/sync/imovibAdapter.ts`** (Imovib → Empreendimento): com a leitura, ele vira
  circular. Desligar para estudo com `origem: 'empreendimento'`.
- [ ] **`services/sync/writeBackImovib.ts`** e **`plantaAiIntegration.sendToViabilidade`**:
  deixam de criar ou apagar blocos para estudo vinculado. O `sendToViabilidade` apaga
  todos os blocos hoje.
  *Pronto quando:* a Central de Sync do Garden não oferece mais "Enviar ao estudo"
  estrutural, e reenviar da Planta IA não apaga custo/preço digitados.

## Andamento

- 2026-10-19: Fase 0 com 3 de 3 itens feitos na frente `imovib-premissas-abas` (`tsc` limpo,
  `check-ui-standard` sem violação, `orgContextGuard` 14/14). Proposta das Fases 1–4
  apresentada; D1 e D2 aguardam o usuário.
