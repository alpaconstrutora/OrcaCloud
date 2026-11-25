# Qualidade (SiAC / PBQP-H) — roteiro em 6 fases + desenho da Fase 1

## Pedido original

> **25/11/2026 13:56** — [anexo: `Regimento-Geral-do-SIAC-Atualizado-Portaria-577-de-marco-de-2021-Revisado.pdf`] "avalie"
>
> **25/11/2026 14:00** — "seguir com plano dessas frentes por fase"
>
> Sessão: `c3015bbd-c4c3-4c7d-9bca-95fa2943cdac`

As "frentes" são as 4 lacunas apontadas na avaliação do Regimento contra o app:

1. listas de serviços e materiais controlados por obra, com ficha de verificação de serviço (FVS) na tarefa do Controle Operacional e ficha de verificação de material (FVM) no recebimento, mais a conta de % por nível (B: 40% dos serviços e 50% dos materiais; A: 100%);
2. fornecedores: qualificação antes da compra, avaliação após cada entrega, bloqueio do reprovado (8.4.1.1);
3. controle tecnológico: ensaios, laudos e rastreabilidade do lote até onde foi aplicado;
4. ciclo de gestão: auditoria interna, análise crítica pela direção, pesquisa de satisfação, indicadores de água/energia/resíduos por m², e o Plano da Qualidade da Obra (PQO) montado com o que o app já tem.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 25/11 15:05 | O Controle Operacional tem 14 OEs, 1 resposta de checklist e 1 NC; o Recebimento tem 5 registros. Ancorar as fichas ali é ancorar numa tela que ninguém abre? | "Ainda nao está em uso pois não treinei os colabodores." — vale para os dois. **As fichas ficam onde o trabalho acontece; o treinamento vem junto.** |
| 25/11 15:05 | Por que isso agora? | "Preparar a ALPA e colaboradores nas boas praticas e futuramente buscar certificacao" |
| 25/11 17:48 | Abordagem A (tudo espalhado nos módulos), B (módulo próprio que duplica) ou C (registro onde o trabalho acontece + módulo Qualidade como casa)? | "vamos de C" |
| 25/11 | Revisão do desenho: só curso EAD/híbrido tem versão; treinamento de obra é presencial. Procedimento = curso, ou separar procedimento escrito (GED) de treinamento (curso de qualquer modalidade)? | "separar as duas coisas" |
| 25/11 | Quem executa os serviços: equipe própria, empreiteiros ou os dois? | "os dois" — a conta de treinados inclui pessoal de empreiteira |

## Por que existe

A Alpa quer **aprender a trabalhar como o PBQP-H pede** — com a equipe treinada nos
procedimentos — antes de ir atrás do certificado. Sucesso não é "ter as telas"; é a
obra gerar, no dia a dia, os registros que uma auditoria pediria, sem planilha paralela.

O SiAC é cumulativo e auditado por evidência: procedimento escrito → pessoal treinado →
registro de aplicação em obra. O app já tem peças disso soltas (Riscos, Garantia,
Treinamentos, GED, Controle Operacional, Recebimento); falta o fio que liga e a conta
que diz "falta quanto para o nível B".

## Objetivos, não objetivos, anti-objetivos

**Objetivos (roteiro):** cada requisito de produto do SiAC nível B tem um lugar no app onde
o registro nasce e uma tela onde ele é conferido; o nível A fica possível sem refazer nada.

**Não objetivos:**
- Não é um sistema para certificadora nem para outras construtoras (decisão do usuário:
  é para a Alpa). Não se constrói configuração "para qualquer cliente do SaaS" além do
  que o multi-tenant já dá de graça.
- Não substitui o Controle Operacional, o Recebimento, o Treinamentos nem o GED: lê e
  amarra o que eles registram.
- Não integra com sistemas externos do PBQP-H (lista de PSQ, DATec, FAD) — dado externo
  entra digitado ou como link.

**Anti-objetivos (seria fracasso mesmo funcionando):**
- **Módulo que nasce vazio e morre.** O antigo "Qualidade & Entrega" nunca funcionou porque a
  taxonomia dependia de um seed que ninguém rodou (`docs/planos/2026-08-26-consolidar-qualidade-em-garantia.md`).
  Aqui, a carga inicial é um botão na tela vazia, não um script.
- **Segunda lista de checklist / segunda tabela de NC.** O Controle Operacional já tem
  `oe_checklist_*` e `non_conformances`; a fase 2 estende, não duplica.
- **Contador que mente.** Se a FVS ainda não existe, a coluna "aplicado com registro"
  mostra que começa na fase 2 — nunca um zero que parece resultado.
- **Registro só para auditor.** Se a ficha não ajuda o encarregado a não errar, ela vai
  ser preenchida depois, de memória — e isso é exatamente o que o SiAC chama de registro inválido.

## Restrições

- Todas as REGRAS OBRIGATÓRIAS de `CLAUDE.md`: org do topo manda (#5), "obra" = só `OBRA`
  e nunca o projeto de sistema (#2/#3), migration com policy/função passa pelas 3 perguntas (#7),
  plano vivo neste arquivo (#6), deploy = push em main (#8).
- Banco: nunca `supabase db push`; migration aplicada com `db query --linked -f`.
- RLS nova já nasce por conjunto: `organization_id IN (SELECT minhas_orgs_membro())`;
  `REVOKE TRUNCATE` explícito (default privileges dão TRUNCATE a `authenticated`).
- UI: `docs/ui_ux_guia_unificado.md`; painel lateral (`Sheet`) para editar; **nada abaixo de tabela**
  (painel/resumo vai acima); campo h-9; rótulo sem caixa alta; botão desligado diz o motivo.

## Abordagens consideradas

| | Como | Troca | |
|---|---|---|---|
| **A** | Tudo dentro dos módulos existentes (FVS no checklist da OE, FVM no recebimento, nota no fornecedor) | Menos tela nova; mas a qualidade fica em 5 lugares e ninguém enxerga o conjunto que a auditoria pede | descartada |
| **B** | Módulo Qualidade próprio com fichas, NC e fornecedores próprios | Um lugar para ensinar; mas duplica checklist/NC, a ficha fica desligada da tarefa e do recebimento — repete o fim do antigo "Qualidade & Entrega" | descartada |
| **C** | **Registro acontece onde o trabalho acontece** (OE, recebimento, compra); o **módulo Qualidade é a casa**: listas controladas, procedimentos (GED) e treinamentos (Treinamentos), conta do nível, fornecedores, ensaios, auditoria, análise crítica, satisfação, indicadores, PQO | Um lugar de conferência alimentado pelo dia a dia; exige ligar as telas existentes por código de item | **escolhida pelo usuário** |

## O que já existe e será reaproveitado (conferido em `origin/main` e no banco, 25/11)

| Peça | Onde | Uso hoje (prod.) | Papel no SiAC |
|---|---|---|---|
| Controle Operacional (OE, checklist por gate `pre_start`/`pre_completion`/`free`, evidências, NC) | `supabase/migrations/20260630000001_create_work_orders_module.sql`, `components/Operacional*.tsx`, `services/workOrderService.ts` | 14 OEs, 2 modelos, 1 resposta, 1 NC (última OE 01/08) | FVS (8.6.1), NC (8.7/10.2) — fase 2 |
| OE guarda o item de orçamento | `work_orders.budget_item_ref` (JSONB snapshot com `sinapiCode`) — `types/operational-control.ts:60` | — | liga a OE ao serviço controlado pelo código — fase 2 |
| Recebimento | `purchase_receipts` / `purchase_receipt_items` (`order_item_code` TEXT, sem FK de item) | 5 recebimentos (último 19/10) | FVM (8.4.3, 8.6.1) — fase 3 |
| Base de dados (insumos e composições) | `sinapi_items` (15.867), `custom_items` (25), tela `components/DatabaseExplorer.tsx` | — | catálogo de códigos para ligar item controlado a OE e recebimento |
| Treinamentos | `training_courses` (`modalidade` PRESENCIAL/EAD/HIBRIDO, padrão PRESENCIAL); registro de quem foi treinado em `employee_trainings` (`employee_id` NOT NULL, `data_realizacao`, `aprovado`, `origem`); versões só em EAD/híbrido (`academy_course_versions`) | 3 cursos, 1 registro manual, 4 matrículas | treinamento (7.2/7.3) — fase 1 |
| Terceiro no Treinamentos | o Portal de Treinamentos já cria ficha própria em `employees` para terceirizado (`contract_type = 'EMPREITEIRO'`, `academy_externo = TRUE`) — `supabase/migrations/aplicar_20271015000100_academy_portal_users.sql`; a RPC exige e-mail (dá acesso ao portal) | 1 ficha EMPREITEIRO | pessoal de empreiteira treinado — fase 1 |
| GED com versões e aprovação | `opura_documents` (`active_version_id`, `revisao`, `approval_status`, `opura_document_approvals`) / `opura_document_versions` (`created_at`, `sha256`, `congelada`) | 112 documentos, todos `rascunho` | **procedimento escrito (7.5)** — fase 1; PQO e laudos — fases 3 e 6 |
| Avaliação de fornecedor por contrato | `contract_evaluations`, `components/ContractEvaluationModal.tsx` (notas qualidade/prazo/SST/conformidade) | **0 avaliações** | base da avaliação 8.4.1.2 — fase 4 |
| Fornecedores | `suppliers` — só `cnpj_status`, **sem coluna de qualificação/bloqueio** | — | fase 4 |
| Riscos | `components/riscos/*` | no ar desde 14/11 | 6.1 riscos e oportunidades; modelo de módulo novo (menu, rota, permissão) |
| Pós-Obra & Garantia | `WarrantyModule` | — | 8.5.5 pós-entrega. ⚠️ **ocupa a chave `quality` / `canViewQuality`** — o módulo novo precisa de chave própria |

## Roteiro — 6 fases

Cada fase ganha **seu próprio desenho** (seção nova neste arquivo) antes de ser construída.
Abaixo, o que cada uma entrega e o que já se sabe que ela terá de resolver.

### Fase 1 — Base: listas controladas, procedimentos, conta do nível
Desenho completo na próxima seção. Usuário: engenheiro / responsável pela qualidade, no
computador. Ainda não toca a obra.

### Fase 2 — FVS na tarefa (Controle Operacional) + NC com ação corretiva
- OE cujo `budget_item_ref.sinapiCode` está entre os códigos de um serviço controlado nasce
  marcada "serviço controlado"; também dá para marcar à mão.
- O item controlado traz o modelo de inspeção (itens, tolerância, método) — vira o checklist
  do gate da OE. A OE **não conclui** sem FVS aprovada (8.6.1).
- Item reprovado abre NC; `non_conformances` ganha causa, ação corretiva e verificação de
  eficácia (10.2), em vez de tabela nova.
- Alimenta as colunas "aplicado com registro" e "em obra em andamento" da conta do nível.
- **A resolver no desenho:** não conferi se o gate de checklist trava o avanço de status hoje;
  quem preenche (encarregado no celular via PWA? estagiário?); como a FVS fica útil para o
  encarregado, não só para o auditor.

### Fase 3 — FVM no recebimento + controle tecnológico + rastreabilidade
- Item de recebimento cujo `order_item_code` está entre os códigos de um material controlado
  pede FVM (critérios de aceitação, NF, lote, aprovado / reprovado / aprovado com restrição).
- Ensaios: laboratório, laudo (PDF no GED), resultado × especificação; concreto: corpos de
  prova 7/28 dias amarrados à concretagem (FVS da fase 2).
- Rastreabilidade (8.5.2): a FVS registra o lote usado → do lote se chega ao local aplicado.
- Equipamentos de medição e calibração (7.1.5.2) entram aqui.
- **A resolver:** recebimento guarda código como texto, sem FK; a policy de `purchase_receipts`
  nasceu `USING (true)` — não conferi se foi corrigida depois.

### Fase 4 — Fornecedores
- Situação do fornecedor por material/serviço controlado: em qualificação / qualificado / bloqueado,
  com critério e evidência (inclui "consta como qualificado no PSQ" — link, não integração).
- Avaliação após cada entrega, puxada da FVM (aprovado? no prazo?) + avaliação de contrato
  (`contract_evaluations`, hoje sem uso).
- Compra de item controlado recusa fornecedor bloqueado (8.4.1.1), com o motivo no botão.

### Fase 5 — Ciclo de gestão
- Auditoria interna: programa, checklist por requisito, constatações viram NC.
- Análise crítica pela direção: ata com as entradas de 9.3.2 preenchidas sozinhas (NCs,
  auditorias, desempenho de fornecedor, satisfação).
- Pesquisa de satisfação do cliente (9.1.2) — canal a decidir (Portal do Cliente?).
- Indicadores de sustentabilidade por m²: **fonte provável** = contas de água/energia que já
  entram em Boletos e lançamentos de caçamba/CTR — não conferi.

### Fase 6 — PQO montado
- Plano da Qualidade da Obra (8.1.1) gerado por obra a partir do que as fases 1–5 registram
  (lista controlada da obra, procedimentos e versões, responsáveis, plano de ensaios,
  fornecedores, riscos), salvo no GED com versão.

## Fase 1 — desenho

### Quem usa e para quê
O responsável pela qualidade (hoje, o próprio usuário / engenharia) monta a lista de serviços
e materiais controlados da Alpa, liga cada um ao **procedimento escrito** (documento no GED) e
ao **treinamento** (curso no Treinamentos, de qualquer modalidade), diz em cada obra o que não
se aplica, e vê **quanto falta para o nível escolhido**. A equipe de obra — própria e de
empreiteira — não usa telas da fase 1; ela é treinada, quase sempre presencialmente na obra, e
esse treinamento é registrado.

### O que o SiAC pede (Anexo 4, texto literal conferido no PDF)

**Serviços** — lista própria que abranja **no mínimo** estes 27 (item 1):

| Etapa | Nº | Serviço |
|---|---|---|
| Serviços preliminares | 1 | compactação de aterro |
| | 2 | locação de obra |
| Fundações | 3 | execução de fundação |
| Estrutura | 4 | execução de fôrma |
| | 5 | montagem de armadura |
| | 6 | concretagem de peça estrutural |
| | 7 | execução de alvenaria estrutural |
| Vedações verticais | 8 | execução de alvenaria não estrutural e de divisória leve |
| | 9 | execução de revestimento interno de área seca, incluindo produção de argamassa em obra, quando aplicável |
| | 10 | execução de revestimento interno de área úmida |
| | 11 | execução de revestimento externo |
| Vedações horizontais | 12 | execução de contrapiso |
| | 13 | execução de revestimento de piso interno de área seca |
| | 14 | execução de revestimento de piso interno de área úmida |
| | 15 | execução de revestimento de piso externo |
| | 16 | execução de forro |
| | 17 | execução de impermeabilização |
| | 18 | execução de cobertura em telhado (estrutura e telhamento) |
| Esquadrias | 19 | colocação de batente e porta |
| | 20 | colocação de janela |
| | 21 | colocação de guarda-corpo |
| Pintura | 22 | execução de pintura interna |
| | 23 | execução de pintura externa |
| Sistemas prediais | 24 | execução de instalação elétrica |
| | 25 | execução de instalação hidrossanitária |
| | 26 | execução de instalação de gás |
| | 27 | colocação de bancada, louça e metal sanitário |

Regras que vêm junto: serviço do mínimo que o sistema construtivo não usa pode sair **com
justificativa**; serviço próprio que **substitui** um do mínimo é controlado; produção em obra
(concreto, graute, blocos, argamassa…) entra na lista; serviço com inspeção exigida pelo
cliente e serviço ligado a FAD/DATec (obra habitacional) entram obrigatoriamente.

**Materiais** — o Anexo 4 **não traz lista**: a construtora monta a dela, com **no mínimo 20**,
a partir dos materiais empregados nos serviços controlados (item 3).

**Conta por nível** (itens 2, 4 e 5). N = tamanho da lista da empresa (pode diferir de 27/20
se justificado; os percentuais valem sobre N). Percentual p: serviços B 40%, A 100%;
materiais B 50%, A 100%. Arredondamento **sempre para cima**:

| Exigência | Fórmula | 27 serviços, B | 20 materiais, B | 27 serviços, A | 20 materiais, A |
|---|---|---|---|---|---|
| com procedimento documentado | ⌈N·p⌉ | 11 | 10 | 27 | 20 |
| aplicados em obra, com pessoal treinado e registro | ⌈N·p·½⌉ | 6 | 5 | 14 | 10 |
| observáveis em obra em andamento | ⌈N·p·¼⌉ | 3 | 3 | 7 | 5 |

### Telas (rascunho)

Módulo **Qualidade** no grupo Engenharia do menu, ao lado de Riscos.

```
Qualidade                                              Nível alvo: [B ▾]
[ Lista controlada ] [ Por obra ] 

┌ Quanto falta para o nível B ───────────────────────────────────────────┐
│ Serviços (27)   procedimento aprovado 4/11 · aplicados c/ registro —   │
│                 (começa na fase 2) · em obra em andamento — (fase 2)   │
│ Materiais (0)   lista abaixo do mínimo: 0 de 20                        │
└────────────────────────────────────────────────────────────────────────┘
 Serviços | Materiais                                   [+ Novo serviço]
 Nº  Serviço                    Etapa      Origem   Procedimento        Treinados (rev. vigente)   Códigos
 6   Concretagem de peça estr.  Estrutura  Anexo 4  PES-06 rev.2 aprov. 8 (5 próprios, 3 empreit.) 3
 9   Revestimento int. seco     Vedações   Anexo 4  PES-09 rev.1 rascunho  —                       0
 7   Alvenaria estrutural       Estrutura  Anexo 4  Dispensado — "não usamos alvenaria estrutural"
 …
```

- **Tela vazia** = um botão grande "Carregar a lista mínima do Anexo 4 (27 serviços)". Em
  Materiais: "Carregar sugestão de materiais (editável)" (lista na seção Chamadas minhas).
- Clicar na linha abre `Sheet` do item: nome, etapa, origem (Anexo 4 / próprio / exigido pelo
  cliente / FAD-DATec), "substitui o item nº" (opcional), situação (ativo / dispensado com
  justificativa obrigatória), **procedimento escrito** = escolher documento do GED (ou "enviar
  procedimento" que cria o documento no GED já com nome e categoria), **treinamento** = escolher
  curso do Treinamentos (ou "criar curso", presencial por padrão, com nome preenchido),
  **códigos** (buscar na Base: composição para serviço, insumo para material).
- No `Sheet`, a seção **Treinados** lista quem tem registro no curso: nome, próprio/empreiteira
  (e qual empreiteira), data, e se foi na revisão vigente do procedimento ou numa anterior.
  Botão **"Registrar treinamento em obra"**: data, instrutor, local (obra) e a lista de presentes —
  colaboradores próprios e pessoal de empreiteira; pessoa de empreiteira que ainda não tem ficha
  é cadastrada ali mesmo (nome, CPF, empreiteira), **sem e-mail e sem acesso ao portal**.
- **Por obra:** escolhe a obra (só `OBRA`, sem projeto de sistema); lista os itens ativos,
  todos "aplica" por padrão; marcar "não se aplica nesta obra" pede motivo.

### Dados (proposta — nomes são do construtor)

- `quality_settings` — por organização: `nivel_alvo` (`B` | `A`, padrão `B`).
- `quality_controlled_items` — `organization_id NOT NULL`, `tipo` (`SERVICO`|`MATERIAL`), `nome`,
  `etapa`, `origem` (`ANEXO4`|`PROPRIO`|`CLIENTE`|`FAD_DATEC`), `anexo4_numero` (1–27, nulo se
  não for do mínimo), `substitui_item_id`, `situacao` (`ATIVO`|`DISPENSADO`|`ARQUIVADO`),
  `justificativa` (obrigatória quando `DISPENSADO` — CHECK), `procedure_document_id` (FK
  `opura_documents`, nulo), `training_course_id` (FK `training_courses`, nulo), `ordem`. Único `(organization_id, anexo4_numero)` quando não nulo —
  carregar a lista duas vezes não duplica.
- `quality_controlled_item_codes` — `(item_id, item_code)` único. Código no mesmo formato de
  `item_unit_equivalences.item_code`.
- `quality_project_exclusions` — só a exceção: `(project_id, item_id, motivo)`. Sem linha = aplica.

### Regras de cálculo da tela

- **N** = itens `ATIVO` do tipo. `DISPENSADO` sai de N e aparece na lista com a justificativa.
- **Com procedimento** = item ativo cujo documento do GED tem versão ativa e está **aprovado**
  (7.5.2 pede documento analisado e aprovado). Documento em rascunho aparece na linha
  ("rev.1 rascunho"), mas não conta.
- **Treinados** = pessoas distintas com registro aprovado em `employee_trainings` no curso do item
  (presencial, EAD ou híbrido — a matrícula EAD concluída já gera esse registro), com
  `data_realizacao` **igual ou posterior** à data da versão ativa do procedimento. Registro anterior
  aparece à parte como "treinado em revisão anterior". Separado em próprios × empreiteira
  (`academy_externo` / `contract_type = 'EMPREITEIRO'`).
- **Sem fração** na fase 1: mostra quantos foram treinados, não "x de y". O "quem deveria" só
  existe quando a FVS (fase 2) registrar quem executou o serviço em cada obra — inventar o
  denominador antes disso seria o contador que mente.
- **Aplicados com registro** e **em obra em andamento**: aparecem com o rótulo "começa na
  fase 2" (serviços) / "fase 3" (materiais) até essas fases existirem. Nunca zero.
- Lista de materiais com menos de 20 ativos mostra o aviso "abaixo do mínimo do Anexo 4".

### Organização (REGRA #5)

- Leitura com o topo em "Todas" = união das orgs do usuário; nunca bloqueia.
- "Carregar lista mínima" e "Novo item" usam `resolveWriteOrg('all-allowed')` + `forEachTargetOrg`:
  em "Todas" replica em cada org; o único por `anexo4_numero` faz a carga repetida não duplicar.
- Nível alvo é por organização: com o topo em "Todas", o painel mostra uma linha por org.

### Menu e permissão

Segue o modelo do Riscos (`components/AppRouter.tsx:391`, `utils/modulosPermitidos.ts`,
`components/Layout.tsx:949`): view própria (não `quality`, que cai no Pós-Obra), permissões
próprias de ver/editar, padrão herdado de Obras. Cadastrar na tela de permissões do usuário
(`components/OrganizationUsers.tsx`).

### Critério de pronto da Fase 1

1. Na org Alpa, tela vazia → "Carregar lista mínima" → 27 serviços na ordem e etapas do Anexo 4;
   clicar de novo não cria nenhum.
2. Marcar um serviço como dispensado sem justificativa é recusado pelo banco (não só pela tela).
3. Ligar um serviço a um documento do GED aprovado → painel passa de "procedimento aprovado 0/11"
   para "1/11"; o mesmo documento em rascunho não conta.
3b. "Registrar treinamento em obra" com 2 colaboradores próprios e 1 pessoa de empreiteira nova
   (sem e-mail) → a linha mostra "3 (2 próprios, 1 empreit.)"; subir nova revisão do procedimento
   → os 3 passam a "treinado em revisão anterior" e a contagem vigente volta a 0.
4. Com 27 serviços e nível B o painel mostra 11 / 6 / 3; trocar para A mostra 27 / 14 / 7;
   dispensar 2 (N=25) em B mostra 10 / 5 / 3.
5. Carregar a sugestão de materiais, apagar até 19 → aviso "abaixo do mínimo".
6. "Por obra" lista só obras reais (nenhum orçamento, planejamento, diário nem "Gestão Comercial");
   marcar "não se aplica" pede motivo.
7. Usuário de outra organização não lê nem grava nenhum dos itens (teste com sessão real).
8. `check-ui-standard.sh`, `check-org-selector-guard.sh`, `check-project-classification.sh`,
   `check-system-projects.sh`, `segurancaMigrations.test.ts` verdes; CI inteiro verde.

## Chamadas minhas (o usuário pode corrigir)

- **Nível alvo padrão B**, configurável — "futuramente certificação" sugere começar pelo B.
- **A carga do Anexo 4 é cópia para a org** (linhas da própria org, editáveis), não registro
  global com `organization_id NULL` — mantém a REGRA #5 simples e deixa cada org editar.
- ~~Procedimento = curso do Treinamentos~~ — **trocado em 25/11** pela decisão do usuário
  ("separar as duas coisas"): procedimento escrito no GED, treinamento no Treinamentos.
- **Só procedimento aprovado no GED conta** (7.5.2). Os 112 documentos do GED estão em `rascunho` —
  o fluxo de aprovação nunca foi usado; a Alpa vai aprender a aprovar procedimento.
- **"Treinado" vale para a revisão vigente**: registro anterior à versão ativa do procedimento
  conta como revisão anterior. É o que obriga a retreinar quando o procedimento muda.
- **Pessoa de empreiteira sem e-mail** ganha ficha `EMPREITEIRO` + `academy_externo` sem acesso ao
  portal — reaproveita o mesmo tipo de ficha que o Portal de Treinamentos já cria, sem exigir e-mail
  de quem só vai ser treinado em roda na obra.
- **Sugestão de materiais** (24, editável, só para não começar do zero): cimento Portland; areia;
  brita; aço para armadura (CA-50/CA-60); concreto usinado; bloco cerâmico; bloco de concreto;
  argamassa industrializada; cal hidratada; argamassa colante; placa cerâmica / porcelanato;
  rejunte; tinta; madeira e compensado para fôrma; telha; impermeabilizante (manta/membrana);
  tubos e conexões de PVC; fios e cabos elétricos; eletrodutos; disjuntores e quadros; janelas;
  portas e batentes; louças e metais sanitários; gesso / placa de drywall.
- **Exceção por obra guardada como exceção** (sem linha = aplica), para obra nova já nascer com a lista inteira.
- **View e permissão próprias**, padrão herdado de Obras, como o Riscos.

## Deixado ao construtor

Nomes de tabela/coluna, forma exata do seletor de códigos (busca na Base; sugestão automática
por palavra-chave é bem-vinda), layout fino segundo o guia de UI, onde guardar `nivel_alvo`
se já existir tabela de configuração por org que sirva.

## Pontos não conferidos

- **Se o fluxo de aprovação do GED funciona**: os 112 documentos têm `approval_status = 'rascunho'`
  (minúsculo), e os CHECKs que achei nas migrations são em maiúsculo (`'RASCUNHO','PENDENTE','APROVADO','REJEITADO'`).
  Primeiro item do plano da fase 1: provar aprovar um documento de ponta a ponta; se estiver
  quebrado, consertar entra na fase 1 (a conta depende disso).
- Se a tela de registro de treinamento presencial do RH já aceita escolher ficha `academy_externo`
  (se aceitar, o "Registrar treinamento em obra" reaproveita; se não, é extensão dela).
- Se códigos de `custom_items` podem colidir com códigos SINAPI (afeta a fase 2/3 casar por código).
- Se o gate de checklist da OE trava o avanço de status hoje (fase 2).
- Se a policy `USING (true)` de `purchase_receipts` foi corrigida depois (fase 3).
- Se alguma portaria posterior a 2021 substituiu a 577.

## Estado

- [x] Desenho da Fase 1 aprovado pelo usuário ("ok", 25/11)
- [x] Plano de implementação da Fase 1 — `docs/planos/2026-11-25-qualidade-siac-fase1-implementacao.md` (decisões da execução e verificação na tela registradas lá)
- [ ] Fase 1 no ar
- [ ] Desenho da Fase 2 … Fase 6 (um por vez)

## Verificação

Ver "Critério de pronto da Fase 1". Ponta a ponta: logado como usuário da Alpa em produção,
carregar a lista, ligar um serviço ao curso publicado, conferir o painel e a lista de uma obra real.
