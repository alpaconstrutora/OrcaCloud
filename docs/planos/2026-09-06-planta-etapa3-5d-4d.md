# Planta Inteligente — Etapa 3: o 5D e o 4D ligados ao ÒPURA

## Pedido original

> das etapas em aberto, qual recomenda iniciarmos?

Recomendei a Etapa 3, começando pela fatia 5D, e o usuário pediu o plano
detalhado:

> sim

Fatiamento combinado na conversa: **primeiro a trava de reconciliação (que é
defeito), depois custo por elemento, e só então o 4D.**

## O que foi MEDIDO no código antes de planejar

Tudo abaixo foi conferido em 06/09/2026, não suposto:

1. **`aplicarNoProjeto` não olha estado de aprovação.** Ele lê `projects.budget`,
   substitui as linhas com prefixo `bp:` e grava
   (`services/blueprintBudgetService.ts` ~242–263). Não há consulta a
   `settings.budgetStatus`.
2. **Existe o conceito de orçamento fechado, e ele é respeitado só na tela.**
   `components/BudgetEditor.tsx:263` faz `const isLocked = settings.budgetStatus
   === 'Fechado'`. Os dois valores em uso são `'Em Andamento'` e `'Fechado'`.
   Ou seja: a pessoa fecha o orçamento, o editor trava, e a Planta continua
   reescrevendo por baixo.
3. **O id da linha de orçamento não usa a identidade da Etapa 1.** Ele é
   `bp:<studyId>:<mapeamentoId>:<ref>` (`utils/blueprintBudget.ts:662`), e `ref`
   é `wallId`, `spaceId`, `openingId`, `structuralId`, `escadaId` ou `aguaId` —
   todos o **`id` posicional do kernel**, reatribuído a cada publish. O `uid`,
   que existe justamente para sobreviver a isso, não entra.
4. **O quantitativo não carrega `uid`.** `utils/blueprintKernel/quantities.ts`
   expõe `wallId`/`spaceId`, e nenhum `uid`. É por aí que o 5D tem de começar.
5. **O item de cronograma É uma linha de orçamento.**
   `types/operational-control.ts:74` define `PlanningItemRef.itemScheduleId` como
   "`= BudgetEntry.id` no projeto de planejamento", e `PlanningVersion.schedule`
   (`types/project.ts:313`) guarda o cronograma como snapshot dentro de
   `projects.settings`.
6. **Não existe outbox** de eventos de domínio (RF-128) — nenhuma ocorrência em
   `services/` nem em `supabase/migrations/`.

### A consequência do item 5, que muda o desenho do 4D

O roadmap previa uma tabela nova (`blueprint_element_links`, ou o desenho
"Objeto Digital" do BIM LAB) para ligar elemento a tarefa. **Talvez não seja
preciso.** A cadeia já existe:

```
elemento da planta → linha de orçamento (bp:…:<ref>) → item do cronograma (itemScheduleId = BudgetEntry.id)
```

Se `<ref>` passar a ser o `uid`, a cadeia inteira fica estável entre revisões, e
o 4D vira uma consulta em cima do que já está gravado, em vez de uma tabela de
vínculo para o usuário preencher à mão.

⚠️ **Isto é uma hipótese com base forte, não um fato verificado.** Falta
confirmar que os itens do cronograma de fato preservam o `BudgetEntry.id` das
linhas geradas pela Planta ao entrarem no `ProjectSchedule` — se o planejamento
copiar a linha com id novo, a cadeia se rompe e a tabela de vínculo volta a ser
necessária. **É o primeiro passo da Fatia 3**, e ele decide o desenho dela.

---

## Fatia 1 — A trava de reconciliação (o defeito) · ~2 d

Republicar a planta reescreve o orçamento sem avisar, inclusive um fechado. É
dinheiro mudando em silêncio, e vem antes de qualquer funcionalidade nova.

### O que fazer

- `aplicarNoProjeto` passa a ler `settings.budgetStatus` e **recusar** quando for
  `'Fechado'`, devolvendo um erro que diz o que houve — não um `throw` genérico.
  A recusa é do serviço, não da tela: quem chama pode ser outra tela amanhã.
- `preverLancamentos` ganha, no `contexto`, o estado do orçamento de destino,
  para a prévia poder **avisar antes** em vez de deixar a pessoa descobrir no
  clique. A tela de prévia mostra o aviso e desabilita o "Aplicar".
- **A saída consciente**: quem quer mesmo aplicar num orçamento fechado reabre o
  orçamento (`'Em Andamento'`) na tela dele. Não haverá "aplicar mesmo assim"
  na Planta — seria recriar o silêncio com um clique a mais.

### Decisões de projeto

- **Recusar, e não versionar.** A alternativa seria gerar uma versão nova do
  orçamento a cada publicação. É mais ambicioso e é o que o PRD §22.1 quer no
  fim, mas exige responder "quem aprova a nova versão?" — pergunta de processo,
  não de código. Recusar é a metade que já elimina o dano e não fecha porta.
- **A trava é por obra, não por estudo.** O orçamento é da obra; a mesma planta
  pode alimentar duas.

### ✅ FEITA em 06/09/2026

- `orcamentoFechado(projectId)` e `OrcamentoFechadoError` em
  `services/blueprintBudgetService.ts`; a recusa acontece dentro de
  `aplicarNoProjeto`, entre a leitura e a escrita.
- `PainelOrcamento` avisa antes, com o botão desabilitado e a saída na mensagem.
- **E2E 24/24** contra o banco real, incluindo o caso novo: com `'Fechado'` a
  aplicação é recusada e o `budget` fica **byte-idêntico** (JSON comparado antes
  e depois); reabrindo para `'Em Andamento'`, volta a aplicar. Resíduos
  conferidos depois da execução: zero.
- Componente (4 casos): avisa e desabilita; o serviço **não** é chamado; em
  andamento continua aplicando; e falha na consulta de status **não** trava a
  tela — o serviço recusa de qualquer jeito, e botão desabilitado sem motivo
  visível é indistinguível de defeito.

**Desvio do plano, deliberado:** previa passar o estado pelo `contexto` de
`preverLancamentos`, mas essa função recebe só o `snapshotId`, e a obra de
destino é escolhida no painel (podendo diferir de `study.project_id` até ser
vinculada). Uma função dedicada ficou mais simples e não mudou assinatura de
nada.

---

## Fatia 2 — Custo por elemento (5D) · ~4 d

### O que fazer

1. **`uid` no quantitativo.** `computeQuantities` passa a devolver o `uid` ao
   lado de cada `wallId`/`spaceId`/`openingId`/`structuralId`/`escadaId`/`aguaId`.
   ⚠️ Isso **bumpa a versão do quantitativo** (`QuantitiesVersion`), porque o
   registro gravado em `blueprint_quantities` muda de forma. Registros antigos
   continuam legíveis pela versão deles — a tabela já guarda a versão por linha,
   e o E2E prova que trocar de política cria outro registro sem sobrescrever.
2. **`ref` passa a ser o `uid`.** O id da linha vira
   `bp:<studyId>:<mapeamentoId>:<uid>`.
   ⚠️ **Isto muda o id de toda linha existente gerada por planta.** Na primeira
   republicação depois da mudança, as linhas antigas saem e as novas entram — o
   `aplicarNoOrcamento` já faz exatamente isso (remove as do prefixo, insere as
   novas), então não duplica; mas a linha "muda de identidade" uma vez, e quem
   tiver anotação presa ao id antigo a perde. Precisa estar no aviso da prévia.
3. **Custo por elemento no painel.** Selecionar uma parede mostra quanto ela
   custa nas linhas geradas — a soma das linhas cujo `uid` é o dela.
4. **`Pset_OpuraPlanta.Cost` no IFC**, ao lado do `ElementUid` que já sai.

### Decisões de projeto

- **O `uid` entra no quantitativo, não só na linha.** Poderia-se casar por
  posição na hora de gerar a linha, mas seria reintroduzir exatamente a fragilidade
  que a Etapa 1 removeu.
- **Não migrar linhas antigas.** Reescrever ids em `projects.budget` de todas as
  obras seria uma migração de dado de negócio para ganhar cosmética; a
  republicação faz a troca sozinha, e só quando a pessoa mandar.

### Estado em 06/09/2026 — itens 1 e 2 FEITOS, 3 e 4 em aberto

- ✅ **`uid` no quantitativo** (`quant-1.7.0 → 1.8.0`): os seis registros por
  elemento carregam `uid` ao lado do id posicional. `ambientes[].uid` é o uid da
  ETIQUETA e pode ser `null` — ambiente é derivado e sem nome não tem identidade
  estável; quem consome tem de tratar isso, não receber um id disfarçado.
- ✅ **`ref` passa a ser o `uid`** em `utils/blueprintBudget.ts`.
- ⬜ Custo por elemento no painel de seleção.
- ⬜ `Pset_OpuraPlanta.Cost` no IFC.

**O caso que discrimina** (`__tests__/blueprintOrcamentoIdentidade.test.ts`):
publicar, gerar linha, inserir uma parede ANTES das outras, republicar e gerar de
novo — a linha da parede intocada tem de manter o id. Falhava com
`bp:std_1:map_1:wal_0002 → wal_0003`; passa agora.

⚠️ **A primeira versão desse teste PASSOU com o defeito presente**, porque só
usava `applyCommand` em memória — os ids do kernel não mudam ali. A renumeração
acontece em `modelFromCanonicalPayload`, ou seja, no publish. O teste só
discrimina com o round-trip do payload, e ganhou um caso extra que afirma que o
id posicional de fato mudou — sem ele, o caso poderia passar por não exercitar
nada.

**Impacto medido no banco antes de mudar**: existe **1** linha de planta em
orçamento real (obra "Coronel Lambert 345"). Na próxima aplicação ela sai e
entra com o id novo; `aplicarNoOrcamento` remove por prefixo, então não duplica.

---

## Fatia 3 — 4D: elemento ↔ tarefa · ~6 d (a estimar de novo depois do passo 0)

### Passo 0, antes de qualquer código

Confirmar se o item do cronograma preserva o `BudgetEntry.id` da linha gerada
pela Planta. **O resultado decide o desenho**:

- **preserva** → o vínculo já existe; a fatia é ler a cadeia e desenhar. Barato.
- **não preserva** → volta a tabela de vínculo (`digital_objects` /
  `digital_object_links`, o desenho já decidido no BIM LAB), e a fatia cresce.

Não estimo a fatia antes disso, e não escrevo código antes disso.

### O que fazer (na hipótese "preserva")

- Consulta que resolve elemento → linha → item do cronograma → datas e status.
- **Simulação temporal no 3D**: uma régua de data colore as peças por status
  (não executado / em execução / concluído). O 3D já sabe desenhar por família e
  já tem visibilidade por peça — a cor entra pelo mesmo caminho.
- Ligar a seleção do 3D ao item do cronograma, e vice-versa.

### Risco declarado

A simulação temporal é a parte visível e a que mais tenta a "demonstração
bonita". Ela só vale se o status vier do que foi **medido**, e não de uma data
planejada — senão o 3D pinta de verde o que não foi feito. Se o dado de execução
real não estiver disponível por elemento, a régua mostra o PLANEJADO e o rótulo
tem de dizer isso na tela.

---

## O que este plano NÃO inclui, e por quê

- **Outbox de eventos (RF-128).** Estava na Etapa 3 do roadmap. Não há outbox
  nenhum no sistema, então criar o primeiro é uma decisão de arquitetura que
  ultrapassa a Planta — e nada nas três fatias acima depende dele.
- **Ponte com ferragem.** Depende de o módulo Estrutural ler snapshot publicado;
  é frente própria, já registrada como pendente.
- **Unificar os dois escritores de `projects.budget`.** Dívida registrada (a
  Medição Inteligente gera id aleatório). A Fatia 1 encosta nela — a trava de
  orçamento fechado deveria valer para os dois —, e a decisão de unificar fica
  para quando a Fatia 1 estiver de pé.

## Riscos e travas

| Risco | Trava |
|---|---|
| A trava de orçamento fechado bloquear quem legitimamente precisa aplicar | A saída é reabrir o orçamento na tela dele — explícito, auditável, e sem botão de atalho na Planta |
| Mudar `ref` para `uid` quebrar linha existente | A troca acontece só na republicação, o `aplicarNoOrcamento` já substitui por prefixo, e o aviso da prévia declara |
| Bump do `QuantitiesVersion` invalidar quantitativo gravado | A tabela versiona por linha; o E2E já prova que trocar de política cria outro registro sem sobrescrever |
| O 4D ser desenhado sobre uma cadeia que não existe | Passo 0 antes de qualquer código, e a fatia não é estimada antes dele |
| A simulação temporal mostrar planejado como se fosse executado | Rótulo na tela dizendo qual dos dois está sendo pintado |

## Ordem

1. Fatia 1 (trava) — o defeito, e o único item que já está causando dano.
2. Fatia 2 (custo por elemento) — o que faz o `element_uid` da Etapa 1 render.
3. Passo 0 da Fatia 3 — a medição que decide o desenho do 4D.
4. Fatia 3.
