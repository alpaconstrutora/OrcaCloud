# Módulo ÒPURA Riscos

## Pedido original

> *(anexo: "ÒPURA Riscos - Especificação funcional.pdf", 19 páginas, 13/11/2026)*
> avelie para criarmos novo modulo
>
> continue

Sessão: 0a085d50-aa53-4f26-a1e2-4e6e58976184 · 13/11/2026

### Decisões do usuário após a avaliação (14/11/2026, mesma sessão)

> Preciso de três decisões suas
> 1. Unificar? riscos de Oportunidade e Imovib permancem em Oportunidade e Imovib.
> 2. SST: continua no RH, só com um vínculo entre os dois
> 3. Catálogo enriquecido: quer que eu rascunhe causa, consequência e controles para os 312 itens, para um engenheiro e o técnico de segurança revisarem? sim

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/11 | O registro novo absorve `opportunity_risks` (Investidor) e `imovib_risks`? | **Não.** Continuam em Oportunidade e Imovib. O módulo Riscos cuida do risco do empreendimento/obra/contrato. |
| 14/11 | SST/PGR entra no módulo Riscos? | **Não.** Continua no RH (`LaborSST`). O módulo Riscos só tem um **vínculo** com ele. |
| 14/11 | Rascunhar causa/consequência/controles dos 312 itens para revisão técnica? | **Sim.** Em `2026-11-13-modulo-riscos/catalogo/`. |

## Avaliação (13/11) — o que já existe e pesa no desenho

Lido de `origin/main` e do banco em 13/11/2026.

- **Cadastros de risco paralelos, todos vazios:** `opportunity_risks` (0 linhas), `imovib_risks` (0),
  `risk_assessments` do SST (0), `contract_risk_assessments` (1). Pelas decisões acima, os três
  primeiros ficam onde estão; nenhum é migrado.
- **Nomes ocupados:** a tabela `risk_assessments` é do SST (usada por `laborService.ts`,
  `documentService.ts`), e o enum `risk_level` vem da Governança. O módulo novo **não** usa esses nomes.
- **Não há motor de alertas:** cada alerta é uma função SQL + `pg_cron` gravando em `notifications`
  (modelo: `fn_opura_docs_vencimento_alerts`). O slug novo é registrado em
  `components/notifications/notificationTypes.ts`.
- **A alçada é genérica** (`services/approvalService.ts`, `approval_approvers.entity_type` com CHECK,
  no máximo 2 níveis).
- **Não há `audit_log` genérico:** o modelo é `empreendimento_audit_logs` (um evento por campo,
  gravado pelo serviço).
- **O mapa de calor 5×5 existe uma vez só:** em `components/ImovibRiscosCard.tsx`.
- **Diário:** fica em `projects.settings.diaryEntries` (JSONB) e só se grava pelas RPCs
  `diary_upsert_entry`/`diary_delete_entry`. Qualquer integração lê dali e nunca escreve fora das RPCs.
- **Escala:** 8 organizações, 19 obras.

Fora do escopo deste plano (decidido ou adiado): Método C (Monte Carlo), BIM/3D, alertas
preditivos, Portal do Investidor, motor de regras de alerta configurável. Ficam como "Depois", no fim.

## Desenho

### Tabelas novas (prefixo `risk_`; nenhum nome colide com o banco atual)

| tabela | papel | observação |
|---|---|---|
| `risk_categories` | taxonomia R01–R25 | `organization_id NULL` = sistema; org pode criar subcategoria |
| `risk_catalog` | biblioteca mestre | `organization_id NULL` = os 312 do sistema (seed); org cria **riscos próprios**. Campos do `FORMATO.md` + `versao`, `ativo`, `revisao_tecnica` (rascunho/revisado/aprovado) |
| `project_risks` | risco contextualizado | org obrigatória; `empreendimento_id`, `project_id` (só OBRA), `contract_id`, frente/localização, fase. Guarda `catalog_id` + `catalog_versao` + **cópia** dos textos (CA02: editar o risco da obra nunca altera o mestre) |
| `risk_evaluations` | avaliação inerente e residual | **append-only** (trigger recusa UPDATE/DELETE, CA05): probabilidade 1–5, impactos por dimensão (jsonb 1–5), impacto consolidado = **máximo** das dimensões (nunca média), pontuação P×I, nível, premissas, justificativa, evidência, autor e data |
| `risk_actions` | ações de tratamento | responsável, prazo, custo, estado, evidência (documento do GED), verificação de eficácia (quem/quando/resultado), `task_id` opcional (espelho em Tarefas via `create_task`) |
| `risk_matrix_config` | faixas da matriz por organização | padrão = o da especificação: baixo 1–4, médio 5–10, alto 12–16, crítico 20–25 |
| `risk_audit_logs` | trilha | formato de `empreendimento_audit_logs` |
| *(F2)* `risk_events` | ocorrências/materialização | preserva a avaliação anterior ao evento (CA08) |
| *(F2)* `risk_links` | vínculos externos | módulo + id externo + versão (CA10) |
| *(F2)* `risk_templates` | modelos por tipologia | usa `tipologias`/`condicoes_sugestao` do catálogo |

**RLS:** policy nova no padrão de conjunto (`organization_id IN (SELECT minhas_orgs_membro())`),
**nunca** `is_org_member(...)` por linha. As linhas de sistema (`organization_id IS NULL`) de
`risk_categories`/`risk_catalog` são só leitura para autenticados e só escritas pelo seed
(REGRA #5: NULL é reservado a seed do sistema). Toda função nova leva `REVOKE … FROM PUBLIC, anon`
(REGRA #7).

**Gatilho crítico (CA04):** vem do item do catálogo (`gatilho_critico`), copiado para o
`project_risks` e editável só para **ligar**. Um risco com gatilho é tratado como crítico
**qualquer que seja a pontuação**: entra no painel de críticos e no alerta, e exige aprovação.

**Vínculo com o SST (decisão 2):** `project_risks.sst_document_id` (nullable) aponta para
`risk_assessments` (PGR/APR da obra) ou para `sst_regulatory_docs`. A ficha de um risco R14 oferece o
PGR vigente da mesma obra, e `LaborSST` mostra quantos riscos do módulo estão ligados àquele documento.
O SST não ganha nenhuma tabela nem tela nova.

### Tela

Item de menu **Riscos** no grupo Engenharia/Operação, com abas **Painel · Registro · Matriz ·
Ações · Catálogo**. A ficha do risco abre em painel lateral (Sheet, REGRA #4). Antes de qualquer
tela: ler `docs/ui_ux_guia_unificado.md` e `UI_PATTERNS.md` inteiros. Depois: rodar
`check-ui-standard.sh` em cada arquivo tocado (REGRA #1). A obra vem do seletor do topo
(`useOrgContext`, REGRA #5) e a lista de obras vem de `useStore().projects` (REGRAS #2 e #3).

## Plano

### F0 — Catálogo enriquecido (rascunho para revisão técnica)

- [ ] **F0.1 Eventos-base.** `catalogo/eventos-base.tsv` com a transcrição literal dos 312 eventos.
  *Pronto quando:* script conta 25 categorias, 312 códigos únicos, 24 em R14 e 12 nas demais (CA01).
- [ ] **F0.2 Formato.** `catalogo/FORMATO.md`: esquema, listas fechadas e estilo.
  *Pronto quando:* existe e é a única referência usada pelos JSON.
- [ ] **F0.3 Rascunho dos 25 arquivos** `catalogo/RXX.json`.
  *Pronto quando:* o validador (F0.4) passa nos 312 itens.
- [ ] **F0.4 Validador + planilha de revisão.** `catalogo/gerar-planilha.mjs` (Node + `exceljs`,
  rodar da raiz da frente) valida o esquema e gera `catalogo/catalogo-consolidado.json` (fonte do
  seed) e `catalogo/catalogo-riscos-revisao.xlsx`, com uma linha por risco e as colunas de revisão
  (revisor, situação, comentário, texto corrigido).
  *Pronto quando:* a planilha abre com 312 linhas e a aba de resumo bate as contagens por categoria.
- [ ] **F0.5 Revisão técnica (fora do código).** O engenheiro revisa R01–R13 e R15–R25; o técnico de
  segurança revisa R14 e todos os itens com `gatilho_critico`.
  *Pronto quando:* a planilha volta com a situação de cada linha preenchida; as correções são
  aplicadas aos JSON por script e o validador passa de novo.

### F1 — MVP (P0)

- [ ] **F1.1 Migration de estrutura:** as 7 tabelas da F1, mais RLS, trigger append-only de
  `risk_evaluations`, `risk_matrix_config` padrão e REVOKE nas funções.
  *Pronto quando:* aplicada no banco; `segurancaMigrations.test.ts` verde; `check-rls-postura.sh`
  sem achado novo; um UPDATE em `risk_evaluations` é recusado.
- [ ] **F1.2 Seed do catálogo** (gerado dos JSON por script, idempotente por `codigo`).
  *Pronto quando:* `select count(*) from risk_catalog where organization_id is null` = 312, e uma
  segunda execução não duplica.
- [ ] **F1.3 `services/riskService.ts` + `types/risk.ts`:** pontuação, nível, consolidação pelo
  máximo e valor esperado em funções puras.
  *Pronto quando:* testes Vitest cobrem P×I nos 25 cruzamentos, as faixas padrão, o máximo
  multidimensional, o gatilho que escala independentemente da cor (CA04) e o valor esperado de
  30% × R$ 200 mil = R$ 60 mil (CA13).
- [ ] **F1.4 Permissões e menu:** `canViewRisks`/`canEditRisks` (`types/users.ts`, matriz de
  `OrganizationUsers.tsx`), `utils/modulosPermitidos.ts`, `Layout.tsx` (desktop, mobile e busca)
  e `AppRouter.tsx` (lazy + guard).
  *Pronto quando:* usuário sem `canViewRisks` não vê o item nem abre a rota; `orgContextGuard.test.ts` verde.
- [ ] **F1.5 Aba Catálogo:** busca/filtro por categoria, fase, tipologia e gatilho; criar risco
  próprio da org; "usar na obra".
  *Pronto quando:* os 312 aparecem filtráveis; criar um risco próprio grava com a org do topo
  (em "Todas", pergunta — REGRA #5).
- [ ] **F1.6 Ficha do risco (Sheet):** criar a partir do catálogo ou do zero; exige causa, evento,
  consequência, contexto, proprietário e próxima revisão (CA03).
  *Pronto quando:* salvar sem algum desses campos é bloqueado com o motivo; editar a ficha da obra
  não altera o `risk_catalog` (CA02, conferido no banco).
- [ ] **F1.7 Avaliação inerente/residual** na ficha, com histórico visível.
  *Pronto quando:* duas avaliações seguidas aparecem no histórico com autor, data, premissas e
  evidência, e a primeira continua intacta no banco (CA05).
- [ ] **F1.8 Ações de tratamento** com evidência no GED e verificação de eficácia; espelho
  opcional em Tarefas.
  *Pronto quando:* ação sem responsável, prazo, estado ou custo não salva; marcar "eficaz" exige
  evidência (CA06); a tarefa espelhada aparece em Minhas Tarefas com o link de volta.
- [ ] **F1.9 Registro + Matriz + Painel:** tabela padrão (StandardTable), mapa de calor 5×5
  (extraído de `ImovibRiscosCard` como componente compartilhado), os 10 principais, indicadores
  da seção 5 que já têm dado (ativos/críticos, sem responsável ou plano, tratamentos em atraso,
  exposição, riscos por fase).
  *Pronto quando:* contagens do painel batem com `select` equivalente no banco para o mesmo filtro
  (CA11); `check-ui-standard.sh` passa em cada arquivo.
- [ ] **F1.10 Alertas fixos** (função SQL + `pg_cron` → `notifications`, tipo `risco_*`): ação
  vencida, revisão vencida, crítico sem plano. Sem repetir: no máximo 1 aviso por risco/regra/dia.
  *Pronto quando:* forçar os 3 casos gera 1 notificação cada, e rodar o job de novo no mesmo dia
  não gera outra (CA07).
- [ ] **F1.11 Auditoria:** toda alteração de ficha, avaliação e ação grava em `risk_audit_logs`;
  aba Histórico na ficha.
  *Pronto quando:* alterar 2 campos gera 2 eventos com valor antigo e novo (CA12, parte auditoria).
- [ ] **F1.12 Vínculo com o SST** (decisão 2): campo na ficha dos R14 e contador na `LaborSST`.
  *Pronto quando:* ligar um risco ao PGR da obra e abrir o SST mostra "1 risco vinculado".

### F2 — Operação (P0)

- [ ] **F2.1 Ocorrências** (`risk_events`): materializar um risco preserva a última avaliação (CA08).
- [ ] **F2.2 Vínculos** (`risk_links`) com tarefa do cronograma, contrato, pedido, não conformidade
  (`non_conformances`) e documento do GED (CA10).
- [ ] **F2.3 Alçada:** `risk_item` em `approvalService` e no CHECK de `approval_approvers`; risco
  crítico e aceitação de risco exigem aprovação (CA12, parte alçada).
- [ ] **F2.4 Modelos por tipologia** e sugestão por `condicoes_sugestao` (ex.: obra com subsolo
  sugere escavação, contenção, água subterrânea e recalque).
- [ ] **F2.5 Sinais automáticos** a partir de dados existentes: tarefa crítica atrasada
  (planejamento), custo acima do orçado, documento obrigatório vencido (GED/contratos), insumo sem
  pedido (painel de abastecimento).

*(Os critérios de pronto da F2 serão detalhados neste arquivo ao fim da F1.)*

### Depois (P1/P2, sem data)

Revisões obrigatórias por fase com fechamento; valor esperado e contingência por obra (seção
3.3-C, parte simples); exportação com filtros (CA11); critérios normativos versionados (CA14);
Portal do Investidor; Monte Carlo; BIM/3D; alertas preditivos.

## Estado

- 13/11 avaliação entregue; 14/11 decisões recebidas.
- **F0: 4 de 5.** F0.1–F0.4 feitos em 14/11 (rascunho redigido em 5 lotes paralelos; `gerar-planilha.mjs`
  passa nos 312 itens; maiúscula inicial padronizada em 1.891 frases de R01–R05 e R15–R19, que vieram
  em minúscula). **F0.5 (revisão técnica) pendente**, fora do código.
- Ponto para a revisão (14/11): **86 dos 312 itens (28%) saíram com `gatilho_critico`**, concentrados em
  R14 (20/24), R15 (11/12), R18 (10/12) e R25 (9/12). Como o gatilho torna o risco crítico
  independentemente da nota e exige aprovação (F2.3), uma proporção alta infla o painel de críticos.
  Os revisores devem confirmar caso a caso; os casos de fronteira que os redatores apontaram foram
  R05.09, R04.08, R06.11, R13.08, R14.13, R14.17, R14.18, R18.05, R18.12 e R19.09.
- 14/11 "comece a Fase 1". Feito até aqui:
  - F1.1/F1.2/F1.10 escritos: `aplicar_20271114637000_modulo_riscos_estrutura.sql`,
    `…638000_…_seed_catalogo.sql` (gerado por `catalogo/gerar-seed.mjs`), `…639000_…_alertas.sql`.
    `segurancaMigrations` + `migrationsPrefixo` verdes. **Prova no banco remoto em transação com
    ROLLBACK: 18/18 asserções** (seed 25/312, R14=24, numeração RSC-0001/0002, escopo obra exige obra,
    causa obrigatória, impacto = máximo, 3×4=12, CA13 = 60.000, espelho no risco, avaliação recusa
    UPDATE e DELETE, nota inválida recusada, eficácia sem evidência recusada, 1ª rodada de alertas = 3,
    2ª rodada no dia = 0, código próprio P001, versão sobe, cron agendado); conferido depois que nada
    ficou no banco. **Ainda NÃO aplicadas** (escrita em produção depende do usuário).
  - F1.3 feito: `types/risk.ts`, `utils/riskScoring.ts`, `services/riskService.ts`; testes
    `riskScoring.test.ts` (9) e `riskService.test.ts` (3, pegou cópia de array compartilhada com o mestre).
  - Seed do rascunho: decidido aplicar o catálogo já como `revisao_tecnica = 'rascunho'` (a tela mostra
    o selo) e rodar o seed de novo (upsert) quando a planilha voltar — sem isso a F1 não tem o que testar.
  - Link de aviso `/riscos?riskId=` → foco `RISCO` (`utils/linkNotificacao.ts` + teste) e os 3 tipos
    em `notificationTypes.ts`.
- 14/11 telas e menu escritos (F1.4–F1.9, F1.11, F1.12) — **em código, sem prova no navegador** (as tabelas do
  módulo ainda não existem no banco remoto): `components/riscos/*` (casca `RiscosModule` com Painel · Registro ·
  Matriz · Ações · Catálogo; ficha em Sheet com Ficha · Avaliações · Ações · Histórico e vínculo SST),
  `utils/riskPainel.ts` (recortes do Painel = filtros do Registro, CA11), `utils/permissaoRiscos.ts`
  (`canViewRisks`/`canEditRisks`, sem valor gravado herda Obras), registro em `types/users.ts`,
  `OrganizationUsers.tsx`, `utils/modulosPermitidos.ts`, `AppRouter.tsx`, `Layout.tsx`; contador "N riscos
  vinculados" em `LaborSST.tsx` (Docs Regulatórios). Mapa 5×5 extraído para `components/riscos/MatrizCalor.tsx`
  e usado pelo Imovib (HTML idêntico, guia §28.8). Testes: `__tests__/riskPainel.test.ts`,
  `__tests__/components/RiscosModule.test.tsx`. Nenhum item da F1 está marcado: cada "pronto quando" que fala
  de banco ou de navegador continua pendente da aplicação das migrations.
- Referências a conferir com atenção: IN RFB 2.021/2021 (R10.07), artigos da Lei 14.133/2021 em R24,
  limiar de 75% do art. 59 §4º (R24.02), NBR 5682 e NR-15 anexo 12 (R25), NBR 17170 e CC art. 618 (R21),
  Decreto 10.306/2020 (R19.07).

## Verificação

Por item, conforme o "pronto quando". Ponta a ponta da F1: numa obra real, criar R05.06 a partir do
catálogo, avaliar inerente (P3 × I4 = 12, alto), criar 2 ações com evidência, reavaliar residual,
ver os dois no histórico, ver o risco na matriz e no painel, deixar uma ação vencer e receber
exatamente um aviso.

⚠️ Migrations: aplicar pelo arquivo SQL (`db query -f`), **nunca** `supabase db push`. Se o
auto mode barrar a escrita, o PR sai em rascunho e o usuário aplica.
