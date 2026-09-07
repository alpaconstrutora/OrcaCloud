# Etapa 5 do roadmap BIM — colaboração e governança

## Pedido original

> iniciar implementacao da etapa 5

A Etapa 5 do roadmap BIM (`2026-09-04-planta-inteligente-identidade-e-ifc.md`),
até aqui não iniciada. Três itens: **comentários ancorados em elemento (+BCF)**,
**aprovação** e **publicar no GED / mostrar no Portal do Cliente**.

## O que foi MEDIDO antes de planejar (07/09/2026)

Um levantamento no repositório inteiro, para não construir o que já existe.

| pergunta | resposta |
|---|---|
| existe sistema genérico de comentários? | **NÃO.** Só dois fechados no próprio módulo: `process_comments` (Processos) e `opura_document_markups` (rabisco sobre PDF, não thread) |
| existe comentário em `blueprint_*`? | **NÃO** — as 13 tabelas não têm nada de anotação |
| como se grava no GED? | `documentService.uploadNewDocument(docData, file, email)`; precedentes de outro módulo em `cnoService.uploadAndAttach` |
| o que a Planta faz ao exportar? | **só download local** — `blueprintExportService` termina em `URL.createObjectURL` + `<a download>`; nada é persistido |
| o Portal do Cliente mostra planta? | **NÃO** — zero ocorrência de `planta`/`blueprint` em `ClientArea.tsx` |
| existe fluxo de aprovação reusável? | **SIM**, e é o achado que muda a fatia 2 |

### O achado que muda a fatia da aprovação

`services/approvalService.ts` se declara "primitiva ÚNICA de aprovação" e já
serve quatro entidades (`transaction`, `contract`, `purchase_order`,
`process_step`) por um registro em `ENTITY_META`. E — o que importa aqui — o
próprio código documenta o caminho **não monetário**: passar `amount: 0` com o
`organizationId` explícito.

**Decisão: a aprovação da planta ENTRA nessa primitiva, não numa nova.** Um
segundo fluxo de aprovação daria duas filas de ação, dois vocabulários de status
e duas telas — e a segunda seria a pior.

### O que NÃO existe e terá de nascer

- `blueprint_comments` — nenhuma tabela serve de base; `process_comments` está
  amarrada a `process_instances` por FK.
- Estado de revisão no estudo: hoje `RASCUNHO | EM_EDICAO | PUBLICADO |
  ARQUIVADO`, sem nada entre editar e publicar. `EM_REVISAO` não existe em lugar
  nenhum do código.
- Qualquer ponte da Planta com o GED ou com o Portal.

## Ordem: da que sustenta as outras para a que depende delas

### Fatia 1 — comentários ancorados em elemento

`blueprint_comments`: `id`, `organization_id`, `study_id`, `snapshot_id`,
`element_uid`, `ponto` (x, y do plano, para o comentário que não é de peça
nenhuma), `level_id`, `texto`, `autor`, `resolvido_em`, `resolvido_por`,
`created_at`.

⚠️ **A âncora é o `element_uid`, e é por isso que esta fatia só é possível
agora.** Até a Etapa 1 o id de cada elemento era reatribuído por posição a cada
publicação — um comentário ancorado teria mudado de parede sozinho na revisão
seguinte. O `uid` estável é o que torna a âncora honesta.

⚠️ **E o comentário aponta para o SNAPSHOT em que foi feito.** Sem isso, um
comentário sobre uma parede que depois foi apagada vira órfão silencioso; com
ele, a tela sabe dizer "este comentário é da revisão 7, e o elemento não existe
mais na 9".

**BCF fica para o fim da fatia**, e só se couber: é o formato que Revit,
Navisworks e Solibri usam para trocar pendência, e o valor dele é sair do nosso
sistema — mas é um zip com XML e uma câmera por tópico, e a câmera exige decidir
o que é "a vista" de um comentário 2D.

### ✅ FATIA 1 FEITA em 07/09/2026 (menos o BCF)

`blueprint_comments` aplicada no banco com `db query -f`, conferida de fora (13
colunas, RLS ligado, 4 policies). `services/blueprintCommentService.ts`,
`utils/blueprintComentarios.ts` (puro) e `components/blueprint/PainelComentarios.tsx`,
montado como seção "Comentários" no editor.

**O que os testes travam, e por que cada um existe:**

- **O comentário SOBREVIVE À PUBLICAÇÃO**, que renumera os ids. É a prova de
  que a feature depende da Etapa 1: ancorado num `id`, ele mudaria de parede
  sozinho na revisão seguinte — sem aviso, porque a parede nova também existe.
- **Ele SEGUE A PEÇA QUANDO ELA É MOVIDA.** O ponto do elemento vence o ponto
  guardado: um marcador parado onde a parede estava é pior que nenhum, porque
  aponta para o lugar errado com confiança.
- ⚠️ **Quando a peça é APAGADA, o comentário NÃO SOME.** Volta como
  `ELEMENTO_SUMIU` e a tela diz isso. Escondê-lo apagaria uma pendência que
  ninguém decidiu apagar, e quem comentou nunca saberia.
- **A abertura fica no eixo da parede, no meio do vão.** Sem essa conta, o
  comentário de uma porta cairia na origem do desenho — longe da porta, e num
  lugar que parece proposital.
- **Órfão só conta entre os ABERTOS**: um comentário resolvido cujo elemento
  sumiu não é pendência; provavelmente a peça sumiu porque ele foi resolvido.

**Resolver não apaga**, de propósito: a pendência e a decisão de fechá-la são as
duas metades do registro, e é a discussão que alguém vai procurar daqui a seis
meses quando perguntarem por que a parede mudou.

⏳ **BCF ficou de fora desta fatia** e continua no plano: é um zip com XML e uma
câmera por tópico, e a câmera exige decidir o que é "a vista" de um comentário
2D. Sai como fatia própria, com o pedido que a exija.

### Fatia 2 — aprovação do snapshot

Registrar `blueprint_snapshot` em `ENTITY_META` do `approvalService` e usar
`submit`/`approve`/`reject` com `amount: 0`.

O estudo ganha `EM_REVISAO` entre `EM_EDICAO` e `PUBLICADO`. ⚠️ **Sem bloquear
nada por padrão**: a memória do projeto é explícita em que organização nunca
bloqueia leitura nem trabalho. Aprovação aqui é CARIMBO — quem aprovou, quando,
sobre qual hash —, e o carimbo sai no IFC (`Pset_OpuraPlanta`) e no PDF.

### Fatia 3 — GED e Portal

- `blueprintExportService` ganha um caminho que, em vez de baixar, chama
  `documentService.uploadNewDocument` — mesma disciplina de `cnoService`.
- Portal do Cliente: a planta autorizada aparece como documento compartilhado
  (`opura_document_portal_shares`), que é o caminho que já existe, em vez de uma
  aba nova com RPC própria.

## Verificação

| Fatia | Prova |
|---|---|
| 1 | migration aplicada com `db query -f` (NUNCA `db push`), `migrationsPrefixo` e `segurancaMigrations` verdes, RLS por organização, comentário sobrevive a nova revisão e sabe dizer que o elemento sumiu |
| 2 | o carimbo aparece no IFC e no PDF; a fila de ação do `approvalService` mostra a planta junto do resto |
| 3 | o arquivo exportado aparece no GED com a revisão certa; o portal mostra o que foi compartilhado e nada mais |
| todas | suíte, build, `check-ui-standard`, harness |

## Fora do escopo, e por quê

- **Marcação gráfica sobre a planta** (rabisco): existe para PDF no GED
  (`opura_document_markups`) e é outra coisa — comentário ancorado em ELEMENTO
  segue o elemento quando ele se move; rabisco fica onde foi desenhado.
- **Notificação por e-mail** de comentário novo: o `notificationService` existe
  e a ponte é fácil, mas decidir quem recebe o quê é assunto de outro plano.
