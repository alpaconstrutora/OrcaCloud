# Remover a Planta AI (v1) do app: código, telas e tabelas

## Pedido original

Sessão `4d99919b-99fd-431d-8392-2c229dc3a12a`, 2026-10-19 (com print do cabeçalho do estudo
Bruninho):

> no topo da tela do lado direito, existe um botão chamado, modificar arquitetura planta AI.
> Planta AI foi removida do app. bom pelo ao achei que havia sido removido, pois continua funcional. verifique

Pergunta feita: "Até onde tiro a Planta AI do app?". Resposta, escolhida entre três opções
("Tirar todas as entradas", "Só os botões da Viabilidade", "Remover tudo"):

> Remover tudo, inclusive código e tabelas

## Por que ela ainda funcionava

- **DR-05 (01/10, plano `2026-10-01-estudo-de-massa.md`)**: saiu só o item de menu. A rota
  `planta-ai` ficou viva "para os links internos".
- **DR-06 (03/10)**: os caminhos do **Empreendimento** passaram para a Planta Inteligente, e
  a Planta AI virou "legado" que só aparece com vínculo antigo.
- **Ficaram de fora do levantamento:**
  - os dois botões do **Estudo de Viabilidade**. Ambos GRAVAM na Planta AI: "Modificar"
    copia terreno e regras para ela; "Gerar" cria um estudo novo.
  - os links do Comercial.
  - o "Importar do Planta AI" na tela Unidades da própria Planta Inteligente.

## O que existe (levantado em 2026-10-19, `main` 9daddbc2)

**Banco**
- 8 tabelas: `plant_studies` (2 estudos), `plant_scenarios` (41), `plant_floors`,
  `plant_units`, `plant_terrains`, `plant_briefings`, `plant_urban_rulesets`,
  `plant_validations`. Cada uma tem só a própria policy `org_access_*` e o gatilho
  `set_updated_at_*`.
- 5 colunas de vínculo, cada uma com FK:
  - `imovib_studies.planta_ai_study_id`: Garden Cambuhy e Bruninho
  - `empreendimentos.planta_ai_study_id`: 011 - Garden Cambuhy
  - `commercial_properties.planta_ai_study_id`: 0 linhas
  - `empreendimento_towers.planta_ai_scenario_id`: 2 torres do Garden
  - `empreendimento_units.planta_ai_unit_id`: 0 linhas
- Nenhuma função, view, cron ou objeto de storage usa essas tabelas.
- Propostas de curadoria com `origin='planta_ai'`: 0. Auditoria com `source='sync_planta'`: 0.
- 2 membros com as chaves de permissão `canViewPlantaAi`/`canEditPlantaAi` no JSON.

**Código**: inventário completo (cerca de 4.200 linhas só do módulo) feito por
varredura `git grep`; os itens abaixo seguem ele.

**Fica, apesar do nome parecido:**
- `services/plantaIaService.ts` e as Edge Functions `planta-ia`, `planta-api` e
  `planta-webhooks`, que são da Planta **Inteligente**.
- `PlantaAiSyncReport`: é renomeado para `ArquiteturaSyncReport`, porque os syncs da massa
  e do loteamento usam esse tipo.
- `sync_planta` no CHECK da auditoria e o rótulo dele no Histórico: é registro do passado.

## Itens

### Fase 1: código (uma publicação)

- [ ] **Apagar o módulo**:
  - `components/planta_ai/**`
  - `services/plantaAiEngine.ts`, `plantaAiMaterializeService.ts`, `plantaAiFromTowersService.ts`,
    `plantaAiIntegration.ts`, `plantaEmpreendimentoSync.ts`, `blueprintUnidadesPlantaAiService.ts`
  - `services/sync/plantaAdapter.ts` e `services/sync/regulatoryAdapter.ts`
  - `types/plantaAi.ts`
  - `components/torres/EstudoTorresUnidades.tsx` e `components/EstudoMapaRegulatorio.tsx`
    (o único consumidor era a Planta AI)
  - `docs/spikes/planta-ai-3d/`
  - scripts soltos `test_db.js`, `test_insert.js`, `test_insert2.js`, `unlink_db.js`, e
    `MAPA_DADOS_EMP_PLANTA_VIABILIDADE.md`

  *Pronto quando:* `git grep -n "planta_ai\|plantaAi\|PlantaAi\|planta-ai\|plant_"` em
  código (fora de migrations e planos) só acha comentário histórico ou o rótulo `sync_planta`.
- [ ] **Rota e menu**: sai o `case 'planta-ai'` do `AppRouter`, e `'planta-ai'` sai do
  `hasActiveChild` do `Layout`. *Pronto quando:* `#/planta-ai` cai no padrão do roteador.
- [ ] **Estudo de Viabilidade**: saem "Modificar/Gerar arquitetura (Planta AI)" do topo.
  *Pronto quando:* o cabeçalho do Bruninho e do Davi mostra só "Editar".
- [ ] **Empreendimento**: saem o card "Planta IA (legado)" e a aresta direta
  Arquitetura↔Viabilidade da Central de Sync, o vínculo Planta IA das Vinculações, e o
  campo e a linha legados do Formulário e do Detalhe.
- [ ] **Comercial**: saem o selo "Ver Projeto Origem" (`CommercialModule`) e o botão
  "Gerado via Planta AI" (`PropertyModal`).
- [ ] **Planta Inteligente › Unidades**: saem o botão "Importar do Planta AI", a coluna
  "Planta AI (m²)" e as funções de ponte em `utils/blueprintUnidades.ts`.
- [ ] **Permissões**: `canViewPlantaAi`/`canEditPlantaAi` saem de `types/users.ts`, dos
  padrões e da matriz em `OrganizationUsers`.
- [ ] **Sync**: `SyncOrigin` perde `'planta_ai'` (em `types`, `fieldRegistry`, `PROVENANCE` e
  `ORIGIN_LABEL`). `PlantaAiSyncReport` vira `ArquiteturaSyncReport`.
- [ ] **Colunas lidas**: `planta_ai_*` saem dos tipos e de `EMPREENDIMENTO_COLS`,
  `TOWER_COLS` e `UNIT_COLS`. **Isto tem de ir ao ar ANTES do DROP**, senão o site em produção
  pede uma coluna que não existe (42703).
- [ ] **Testes ajustados**: `SyncCenterTabArquitetura`, `blueprintUnidades`,
  `TelaAreasNbr12721`, `syncPlantaInteligenteTravas`, `syncPlanner`, `proposalHash`.

*Pronto quando (fase):* `tsc` limpo, suíte inteira com a conta fechando, push, e
`conferir-producao.sh` provando o commit no domínio.

### Fase 2: banco (só depois da Fase 1 no ar)

- [ ] **Cópia antes de apagar**: o schema `arquivo_planta_ai` recebe `CREATE TABLE … AS`
  das 8 tabelas e das 5 colunas de vínculo (id + valor). Fica até o usuário decidir apagar.
  *Pronto quando:* as contagens da cópia batem com as de origem.
- [ ] **Migration `aplicar_<prefixo>_remover_planta_ai.sql`**, aplicada por
  `db query -f`, nunca `db push`:
  - `DROP COLUMN` das 5 colunas (as FKs e os índices parciais caem junto);
  - `DROP TABLE` das 8 tabelas;
  - CHECK de `empreendimento_field_proposals.origin` sem `'planta_ai'`;
  - limpeza das 2 chaves de permissão no JSON dos membros.

  *Pronto quando:* nenhuma tabela `plant_*` e nenhuma coluna `planta_ai_*` em
  `information_schema`; `segurancaMigrations` e `migrationsPrefixo` verdes; o site no ar
  sem erro 42703 (Empreendimento, Viabilidade e Planta Inteligente abertos).

## Andamento

- 2026-10-19: inventário de banco e código feito; plano escrito na frente `remover-planta-ai`.
