# Emendas ao PRD ÒPURA Planta Inteligente v1.0 → v1.1

Documento de aplicação. Cada emenda traz a seção-alvo, a ação e o **texto exato** a inserir ou
substituir. Baseado nas decisões de portão tomadas em 2026-08-06 (§0 abaixo).

Complementa: [`2026-08-06-reconciliacao-prd-planta-inteligente.md`](./2026-08-06-reconciliacao-prd-planta-inteligente.md)

> O arquivo do PRD não está versionado no repositório — veio como anexo de conversa. Estas
> emendas são para aplicar no documento original, que passa a ser **v1.1**.

---

## 0. Decisões de portão tomadas

| ID | Decisão | Escolha |
|:---|:---|:---|
| DR-01 | Kernel topológico substitui ou complementa o gerador atual? | **Coexistência.** O `plant_*` segue como Gerador de estudo de massa. O novo módulo nasce como Digitalizador, sem migrar dado existente |
| DR-02 | Nomenclatura do novo módulo | **`blueprint_*`.** Nunca `plan_*` |
| DR-03 | Onde vive a regra urbanística | `rule_packages`/`rule_definitions` **absorvem** o Mapa Regulatório; não convivem com ele |
| DR-04 | Kernel Rust/WASM | **Não aprovado ainda.** Spike A ganha braço TypeScript puro; Rust só se o TS falhar |

**Nota sobre DR-02.** Na reconciliação eu havia sugerido `dwg_*` como primeira opção. Descartado:
`DWG` é o formato nativo do AutoCAD, e o Digitalizador **não** ingere DWG (§8.1 RF-003: PDF, PNG,
JPEG e TIFF convertido). O prefixo prometeria uma capacidade que o módulo não tem. `blueprint_*`
não colide com nenhum formato nem com `plant_*`.

---

## Emenda 1 — §2 Resumo executivo

**Ação:** inserir novo parágrafo imediatamente após a lista numerada dos dois casos de uso
(Digitalizador / Gerador Inteligente), antes do parágrafo "O primeiro reduz trabalho manual…".

**Texto a inserir:**

> **Relação com o Planta AI v1 já em produção.** O ÒPURA já possui um módulo de geração de
> estudos preliminares (`plant_*`) que resolve o segundo caso de uso numa representação
> **paramétrica por retângulo**: terreno, regras urbanísticas e briefing produzem cenários cujas
> unidades são retângulos posicionados numa grade, sem paredes, aberturas ou topologia. Este PRD
> trata da geração e da edição **topológicas** — parede como objeto primário, ambiente como face
> derivada de grafo planar — que habilitam quantitativos construtivos que a representação atual
> não alcança. As duas coexistem: o Planta AI v1 permanece responsável pelo estudo de massa e
> pela materialização em Torres/Unidades do módulo de Incorporação, e nenhum dado seu é migrado
> por este ciclo. Consequentemente, o Digitalizador (R1) é o único componente deste PRD sem
> substituto em produção e deve concentrar o investimento inicial.

---

## Emenda 2 — §4.2 Não objetivos do primeiro ciclo

**Ação:** acrescentar dois itens ao final da lista.

**Texto a inserir:**

> - Substituir, migrar ou aposentar o motor de geração paramétrica atual (`plant_scenarios` →
>   materialização em `plant_floors`/`plant_units` → Torres/Unidades do Empreendimento). Os dois
>   modelos coexistem e nenhuma conversão de dado existente faz parte deste ciclo.
> - Converter geometria topológica de volta para a representação por retângulo do Planta AI v1.
>   A conversão é de mão única: um retângulo vira quatro paredes deterministicamente, mas quatro
>   paredes de um estudo real não retornam a retângulo sem perda.

---

## Emenda 3 — §6 Escopo e estratégia de releases

**Ação (3a):** substituir a nota "Fora do MVP" ao final da seção.

**Texto que sai:**

> **Fora do MVP.** Incluir o Gerador na primeira entrega aumentaria simultaneamente o risco de
> geometria, UX, regras e otimização. A recomendação é validar o ciclo "importar → corrigir →
> publicar → quantificar" antes de financiar síntese automática.

**Texto que entra:**

> **Fora do MVP, e por dois motivos.** O primeiro é de risco: incluir o Gerador na primeira
> entrega aumentaria simultaneamente o risco de geometria, UX, regras e otimização. O segundo é
> de prioridade: o trabalho "estudar o aproveitamento de um terreno" **já tem resposta em
> produção** no Planta AI v1, ainda que numa representação mais simples. O Digitalizador não tem.
> Investir primeiro onde não há substituto. A recomendação é validar o ciclo "importar → corrigir
> → publicar → quantificar" antes de financiar síntese topológica automática.

**Ação (3b):** acrescentar coluna de justificativa de prioridade à tabela de releases, ou — se a
tabela não comportar — inserir o parágrafo abaixo logo depois dela.

**Texto a inserir:**

> A ordem R0→R4 permanece, mas a intensidade de investimento não é uniforme. R0 e R1 são
> caminho crítico: entregam capacidade inexistente hoje (kernel topológico, editor paramétrico,
> digitalização). R3 é o de menor urgência marginal, por ter substituto parcial em produção, e
> só deve ser financiado depois que R2 provar que regras e quantitativos são reproduzíveis.

---

## Emenda 4 — §13 Motor de regras

**Ação:** inserir nova subseção **§13.5** ao final da seção 13.

**Texto a inserir:**

> ### 13.5 Consolidação das fontes de regra urbanística
>
> Hoje o ÒPURA guarda parâmetro urbanístico em dois lugares: `plant_urban_rulesets` (uma linha
> por estudo do Planta AI) e `empreendimento_regulatory_zones` (Mapa Regulatório, compartilhado
> entre módulos e alimentado por cadastro por cidade). Nenhum dos dois tem vigência, versão ou
> rastreabilidade de fonte no nível exigido por §13.3.
>
> Os `rule_packages`/`rule_definitions` deste PRD **DEVEM absorver** o Mapa Regulatório, não
> conviver com ele. Concretamente:
>
> - O Mapa Regulatório passa a ser uma **projeção de leitura** de um pacote vigente por
>   jurisdição, não um cadastro independente.
> - `plant_urban_rulesets` permanece como está enquanto o Planta AI v1 existir, mas passa a ser
>   tratado como *entrada do usuário para um estudo específico*, jamais como fonte normativa.
> - Nenhuma release DEVE introduzir uma terceira resposta possível para "qual é o recuo frontal
>   desta zona". Antes de R2 entrar em produção, a rota de leitura de parâmetro urbanístico DEVE
>   ser única e documentada.
>
> O plano de absorção — incluindo o que acontece com zonas já cadastradas manualmente — é
> pré-requisito de Ready do épico E5.

---

## Emenda 5 — §15 Modelo de dados

**Ação (5a):** renomear todo o prefixo `plan_*` para `blueprint_*` na tabela §15.1 e em todas as
citações ao longo do documento (§10, §16, §22, §31, apêndices).

**Mapa de renomeação:**

| PRD v1.0 | PRD v1.1 | Motivo |
|:---|:---|:---|
| `plan_studies` | `blueprint_studies` | Colidia com `plant_studies` por uma letra |
| `plan_levels` | `blueprint_levels` | idem |
| `plan_sources` | `blueprint_sources` | idem |
| `source_pages` | `blueprint_source_pages` | Nome genérico demais para tabela de topo |
| `source_transforms` | `blueprint_source_transforms` | idem |
| `model_branches` | `blueprint_branches` | Consistência de prefixo |
| `model_snapshots` | `blueprint_snapshots` | idem |
| `model_objects` | `blueprint_objects` | idem |
| `inference_runs` | `blueprint_inference_runs` | idem |
| `inference_candidates` | `blueprint_inference_candidates` | idem |
| `quantity_snapshots` | `blueprint_quantity_snapshots` | idem |
| `generation_problems` / `_runs` / `_variants` | `blueprint_generation_*` | idem |
| `rule_packages` / `rule_definitions` | mantidos sem prefixo | São compartilhados entre módulos por decisão DR-03 |
| `validation_runs` / `validation_results` / `rule_overrides` | mantidos sem prefixo | idem |
| `audit_events` / `integration_outbox` | mantidos sem prefixo | Infraestrutura transversal do ÒPURA |

**Ação (5b):** inserir nota ao final de §15.1.

**Texto a inserir:**

> **Nota de nomenclatura.** O prefixo `plant_*` está ocupado pelo Planta AI v1 e não DEVE ser
> reutilizado nem estendido por este módulo. Diferenças de uma letra entre nomes de tabela
> (`plan_` × `plant_`) são armadilha em busca, em revisão de código e em migration; o prefixo
> `blueprint_*` foi escolhido por não colidir com o módulo existente nem com qualquer formato de
> arquivo que o Digitalizador ingere.

**Ação (5c):** acrescentar nova subseção **§15.4**.

**Texto a inserir:**

> ### 15.4 Fronteira com o Planta AI v1
>
> Nenhuma tabela `plant_*` DEVE ser alterada, migrada ou lida em escrita por este módulo neste
> ciclo. Se uma ponte entre os dois vier a ser desejada em release futura, ela DEVE seguir o
> padrão de proveniência já usado no sistema — coluna dedicada com FK `ON DELETE SET NULL` no
> lado que recebe, mais índice parcial — e nunca acoplamento por convenção de nome ou por
> reinterpretação de `geometry_json`.
>
> Duas armadilhas conhecidas do Planta AI v1, registradas aqui para que o modelo novo não as
> repita:
>
> - `plant_scenarios.selected` é **coluna morta**. A fonte de verdade do cenário escolhido é
>   `plant_studies.selected_scenario_id`. O modelo novo DEVE ter uma única coluna de seleção, do
>   lado do pai.
> - A materialização assume **1 cenário = 1 torre**. Essa é uma regra de produto, não uma
>   limitação técnica, e não DEVE ser herdada implicitamente pelo modelo novo.

---

## Emenda 6 — §24 Migração, rollout e suporte

**Ação:** inserir nova subseção **§24.5** ao final da seção 24.

**Texto a inserir:**

> ### 24.5 Ausência de migração de dado existente
>
> Por decisão de portão (coexistência com o Planta AI v1), **este ciclo não converte nenhum dado
> em produção**. Não há migração de `plant_scenarios`, `plant_floors` ou `plant_units`, e nenhuma
> coluna de proveniência do módulo de Incorporação (`empreendimentos.planta_ai_study_id`,
> `empreendimento_towers.planta_ai_scenario_id`, `empreendimento_units.planta_ai_unit_id`) é
> tocada. Todo o schema `blueprint_*` nasce vazio.
>
> Consequência para rollback: desabilitar o módulo por feature flag é suficiente e não deixa dado
> órfão em nenhum outro módulo. Essa propriedade DEVE ser preservada enquanto os dois modelos
> coexistirem — a primeira release que criar uma escrita cruzada perde esse rollback barato e
> passa a exigir plano de conversão próprio, com ensaio documentado.

---

## Emenda 7 — §30 Spike A — Kernel

**Ação:** substituir o parágrafo inteiro do Spike A.

**Texto que sai:**

> Implementar conjunto de 25 casos: junções T/L/X, paredes curvas futuras tratadas como fora de
> escopo, split/merge, aberturas próximas às pontas, ambientes com ilha, tolerâncias e undo.
> Critério: igualdade bit a bit de payload canônico entre navegador e servidor.

**Texto que entra:**

> Implementar conjunto de 25 casos: junções T/L/X, paredes curvas futuras tratadas como fora de
> escopo, split/merge, aberturas próximas às pontas, ambientes com ilha, tolerâncias e undo.
>
> O spike DEVE rodar o **mesmo conjunto de casos em duas implementações**:
>
> 1. **TypeScript puro**, com coordenadas em milímetros inteiros e política de arredondamento
>    explícita conforme §9.2.
> 2. **Rust compilado para WASM**, conforme ADR-02.
>
> Justificativa: não existe uma linha de Rust no ÒPURA — o stack é integralmente
> TypeScript/React/Supabase, inclusive o spike de BIM já realizado. Adotar Rust adiciona uma
> segunda linguagem, um segundo toolchain de build e uma segunda superfície de contratação e
> manutenção. Esse custo só se justifica por evidência, não por preferência arquitetural.
>
> **Critério de aprovação:** igualdade bit a bit do payload canônico entre navegador e servidor,
> em ambas as implementações. **Critério de escolha:** o braço Rust/WASM só DEVE ser adotado se o
> braço TypeScript falhar no determinismo ou não atingir o RNF-003 no hardware-alvo. Empate
> técnico resolve a favor do TypeScript, por custo de equipe. A decisão DP-04 fica bloqueada até
> a conclusão deste spike.

---

## Emenda 8 — Novo Apêndice E

**Ação:** acrescentar após o Apêndice D (Glossário técnico).

**Texto a inserir:**

> ## Apêndice E — Estado do Planta AI v1 (módulo pré-existente)
>
> Registro do que já existe em produção, para que a decomposição em épicos não reconstrua nem
> colida com ele.
>
> ### E.1 Tabelas
>
> | Tabela | Papel |
> |:---|:---|
> | `plant_studies` | Raiz de autorização: organização + projeto opcional + cenário selecionado |
> | `plant_terrains` | Terreno (1:1 com estudo): área, frente, profundidade, esquina, declive |
> | `plant_urban_rulesets` | Parâmetros urbanísticos (1:1): TO, CA básico/máx, permeabilidade, quatro recuos, gabarito, vagas, nível de confiança |
> | `plant_briefings` | Programa (1:1): tipologias, área-alvo, unidades por pavimento, pavimentos, padrão, objetivo |
> | `plant_scenarios` | Alternativa gerada: contagens, áreas, seis scores, VGV e custo estimados, `materialized_at` |
> | `plant_floors` | Pavimento do cenário, com `geometry_json` |
> | `plant_units` | Unidade do pavimento, `geometry_json` = `{x, y, width, height, color}` |
> | `plant_validations` | Resultado de regra: tipo, severidade, valor permitido × real, recomendação |
>
> RLS org-scoped nas oito; políticas `anon` de desenvolvimento já removidas.
>
> ### E.2 Capacidades e limites
>
> - **Gera:** três cenários por template paramétrico (Conservador, Equilibrado, Máximo
>   aproveitamento) a partir de envelope construtivo calculado por recuos, taxa de ocupação e
>   coeficiente de aproveitamento.
> - **Valida:** gabarito máximo, uso do potencial construtivo e conflito entre vagas desejadas e
>   exigidas.
> - **Visualiza:** planta 2D em SVG e volumetria 3D, ambas derivadas da mesma função de layout.
> - **Materializa:** cenário → pavimentos → unidades → Torres/Unidades do Empreendimento, de
>   forma idempotente.
> - **Não faz:** editar geometria (o canvas 2D é visualizador — apenas zoom, pan e rotação);
>   representar paredes ou aberturas; derivar ambiente por topologia; produzir quantitativo
>   construtivo; versionar imutavelmente; registrar seed ou execução de geração.
>
> ### E.3 Pontes já aplicadas
>
> - **Incorporação:** `empreendimentos.planta_ai_study_id`,
>   `empreendimento_towers.planta_ai_scenario_id`, `empreendimento_units.planta_ai_unit_id`, com
>   índices únicos de idempotência na materialização.
> - **Mapa Regulatório:** os parâmetros de `plant_urban_rulesets` foram espelhados em
>   `empreendimento_regulatory_zones` de forma não destrutiva.
>
> ### E.4 Armadilhas conhecidas
>
> - `plant_scenarios.selected` é coluna morta; a verdade é `plant_studies.selected_scenario_id`.
> - A materialização assume 1 cenário = 1 torre.
> - Estimativas de VGV e custo usam constantes fixas por m², declaradas como provisórias no
>   código.

---

## Critério de pronto

- [x] Decisões DR-01 a DR-04 registradas com justificativa
- [x] Emenda 1 — §2 Resumo executivo
- [x] Emenda 2 — §4.2 Não objetivos
- [x] Emenda 3 — §6 Releases
- [x] Emenda 4 — §13 Motor de regras (nova §13.5)
- [x] Emenda 5 — §15 Modelo de dados (renomeação + §15.4)
- [x] Emenda 6 — §24 Migração (nova §24.5)
- [x] Emenda 7 — §30 Spike A
- [x] Emenda 8 — Novo Apêndice E
- [x] Aplicado em `docs/PRD_Tecnico_OPURA_Planta_Inteligente_v1.1.md` (2026-08-06)
- [x] §1.1 Histórico de versões com a linha da v1.1; v1.0 marcada "Substituída"
- [x] **Extra, para consistência com DR-04:** §10.1 (tabela de camadas), ADR-02 e DP-04 deixaram
      de afirmar Rust como decidido — passam a apontar o Spike A como bloqueador
- [x] **Extra, para consistência com DR-02:** rotas REST (`/plan-studies` → `/blueprint-studies`,
      `/source-pages` → `/blueprint-source-pages`, `/model-branches` → `/blueprint-branches`) e
      eventos de domínio (`plan.*.v1` → `blueprint.*.v1`) renomeados junto com as tabelas

### Deixado como está, por decisão

- Os eventos de **analytics de produto** de §23.1 (`study_created`, `source_uploaded`,
  `generation_started`…) seguem sem prefixo. São eventos de telemetria, não de domínio, e o
  próprio §23.1 já exige propriedade de release/módulo para desambiguar. Prefixá-los sairia do
  escopo das emendas — fica como observação para a decomposição.
