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

## Status em 07/09/2026 — 2 de 3

| Fatia | Estado |
|---|---|
| 1 · comentários ancorados | ✅ **em produção**, conferida de olho no app (menos o BCF) |
| 2 · aprovação da revisão | ✅ **em produção** — publicada QUEBRADA e corrigida no mesmo dia |
| 3 · GED e Portal | ⬜ **não iniciada** |

⚠️ **A fatia 3 herda o risco que a fatia 2 materializou.** Publicar no GED e
gravar no Portal mexem em tabelas de OUTRO módulo, com RLS, triggers e `GRANT`
que este plano não conhece — exatamente a situação em que "a coluna existe" foi
confundida com "a escrita passa". Ela começa consultando `pg_policies` e
`pg_trigger` das tabelas alvo, e não termina sem uma escrita de verdade pelo app.

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

### ✅ FATIA 2 FEITA em 07/09/2026 — e o plano estava errado num ponto

**A aprovação é do SNAPSHOT, não do estudo.** O plano dizia que o estudo
ganharia `EM_REVISAO` entre `EM_EDICAO` e `PUBLICADO`. Errado: o estudo é um
continente que continua sendo editado, e um estado nele congelaria o desenho
inteiro enquanto a revisão 7 está sob análise. O snapshot é que é imutável e
carrega o hash — ele é o que se aprova, e o hash é que carimba O QUE foi
aprovado. O estudo ficou como está.

`blueprint_snapshots` ganhou as três colunas que a primitiva lê
(`approval_status`, `approval_chain`, `approval_required_levels`), aplicadas com
`db query -f` e conferidas de fora. `blueprint_snapshot` entrou no `ENTITY_META`
do `approvalService`, e `blueprintApprovalService` é o wrapper fino que injeta o
que a planta tem de diferente: `amount: 0` e `organizationId` explícitos.

⚠️ **DOIS ACHADOS que teriam virado defeito silencioso:**

1. **O dispatch da fila cai no serviço FINANCEIRO por padrão.**
   `dispatchSubmit`/`Approve`/`Reject` testam contrato e compra e, no resto,
   caem em `financialApprovalService` — que escreve em `internal_transactions`.
   Uma planta na fila seria aprovada **contra a tabela errada**, e a tela
   mostraria a ação como concluída. Os três ganharam o ramo da planta, e um
   aviso no arquivo dizendo que toda entidade nova precisa passar por ali.
2. **O `ORDER BY` da fila é do CONJUNTO.** Ele estava no fim do terceiro ramo, e
   emendar o quarto abaixo dele deixaria a ordenação valendo para uma parte só —
   que o Postgres recusa, e com razão. Movido para depois do último ramo.

**A condição do ramo novo é DIFERENTE das outras três, de propósito.** Elas
exigem que o item caia numa faixa de `financial_approval_config`, porque são
sobre dinheiro. Uma revisão de planta não tem valor: está na fila o que **alguém
enviou**. Copiar a condição de faixa traria toda revisão publicada para a fila —
ou nenhuma, conforme a organização tivesse uma faixa começando em zero.

**O carimbo sai no IFC**, em `Pset_OpuraPlanta`, ao lado do `SnapshotHash`: é o
PAR (o que foi aprovado, quem aprovou) que vale, porque o arquivo circula por
gente sem acesso ao nosso sistema para conferir. ⚠️ E **revisão sem aprovação
não menciona o assunto**: emitir "não aprovado" afirmaria que alguém olhou e
recusou.

⏳ **O carimbo no PDF ficou de fora** desta fatia — a exportação de prancha tem
carimbo próprio e mexer nele é trabalho de layout, não de aprovação.

### ⚠️ A FATIA 2 FOI PUBLICADA QUEBRADA — e a conferência de olho achou

Publiquei a aprovação com suíte verde, tsc limpo, build ok, migration aplicada e
conferida de fora. **Nada disso pegou o defeito**: clicar "Enviar para
aprovação" no app não fazia absolutamente nada.

**Duas travas bloqueavam o UPDATE, e eu não tinha perguntado por nenhuma:**

1. `blueprint_snapshots` tinha **só policy de INSERT e SELECT**. O snapshot é
   imutável de propósito, e o RLS o protege.
2. `trg_blueprint_snapshots_immutable` (de 20270905000000) recusa TODO update e
   delete, por uma função **compartilhada** com `blueprint_objects` e
   `blueprint_audit_events` — mexer nela afrouxaria as outras duas.

**E a tela não me contou.** O painel tem um slot de erro só, no rodapé, e ele
fica abaixo da dobra numa lista de versões: o serviço levantava, o estado de
erro era gravado, e não aparecia nada onde eu estava olhando. Só descobri
conferindo o banco DEPOIS de clicar.

**A correção (`aplicar_20270919000034`)**, com a divisão por operação: o DELETE
continua no guarda geral; o UPDATE passa por um guarda próprio, com escopo de
coluna, que recusa qualquer alteração fora de `approval_status`,
`approval_chain` e `approval_required_levels`. RLS não restringe coluna — quem
compara linha velha com linha nova é trigger. O snapshot segue imutável no que
importa: é o hash que faz a citação por orçamento, planejamento e IFC
significar alguma coisa.

E o erro passou a aparecer **onde a ação foi pedida**, dentro da caixa de
aprovação.

**Provado no app e no banco, nas quatro direções:**

| | resultado |
|---|---|
| enviar para aprovação | tela mostra **PENDENTE**, banco confirma |
| alterar conteúdo do snapshot | **recusado** pelo guarda de coluna |
| apagar snapshot | **recusado** pelo guarda geral |
| `blueprint_objects` | **segue 100% imutável** |

O snapshot real usado na prova foi revertido: zero linhas com status.

**A lição, e ela é maior que esta fatia:** migration aplicada e conferida por
`information_schema` prova que a COLUNA existe, não que a ESCRITA passa. Coluna
nova em tabela protegida precisa de uma escrita de verdade antes de ser
declarada pronta.

### Fatia 3 — GED e Portal

- `blueprintExportService` ganha um caminho que, em vez de baixar, chama
  `documentService.uploadNewDocument` — mesma disciplina de `cnoService`.
- Portal do Cliente: a planta autorizada aparece como documento compartilhado
  (`opura_document_portal_shares`), que é o caminho que já existe, em vez de uma
  aba nova com RPC própria.

### ✅ FATIA 3 FEITA em 08/09/2026

**A montagem foi separada do destino.** Cada formato agora monta
`ArtefatoExportado[]` (`montarIfc`, `montarDxf`, `montarQuantitativoXlsx`,
`montarPdf`) e quem chama decide para onde vai; `exportarX` virou "montar e
baixar". Sem essa separação, publicar no GED pediria copiar a montagem inteira
num segundo caminho — e dois caminhos que montam "o mesmo" arquivo divergem: um
ganha a cobertura, o outro não; um usa o nome com a versão, o outro o do `xlsx`.

`services/blueprintGedService.ts` leva o artefato ao GED pelo
`documentService.uploadNewDocument` que o resto do sistema já usa. **Nenhuma
tabela nova, nenhuma RPC nova.**

**O que os testes travam, e por que cada um existe:**

- **A COBERTURA vai junto**, como documento próprio. Ela é o `.txt` que declara
  o que o arquivo NÃO contém, e é o único motivo pelo qual exportar um IFC
  parcial é honesto. Publicar o desenho e deixá-la para trás faria no GED
  exatamente o que o download evita.
- **A REVISÃO está no NOME**, e não só na coluna: quem procura no GED lê a
  lista, não abre o registro. Dois "Planta Térreo" na mesma pasta são
  indistinguíveis justo quando importa saber qual é o mais novo.
- **O HASH vai na descrição.** Sem ele, "rev. 7" é um número que alguém digitou;
  com ele, dá para provar que este arquivo saiu deste desenho.
- ⚠️ **Publicar NÃO compartilha com o portal.** São duas decisões, e é de
  propósito que sejam duas chamadas: fundi-las faria toda revisão de estudo
  publicada chegar ao cliente por omissão.
- **O autor sai da SESSÃO**, não de parâmetro — recebê-lo de fora abriria a
  porta para a tela mandar o de outra pessoa, e o campo existe para a auditoria.
- ⚠️ **A FALHA aparece AO LADO DO BOTÃO.** Foi o rodapé abaixo da dobra que
  escondeu a fatia 2 quebrada.

### ⚠️ A ESCRITA DE VERDADE, que era a condição desta fatia

O plano dizia que ela "não termina sem uma escrita de verdade pelo app", porque
a anterior foi publicada quebrada confundindo "a coluna existe" com "a escrita
passa". Duas medições, nesta ordem:

**1. O que o banco declara** (antes de escrever uma linha de código):

| tabela | RLS | policies | triggers |
|---|---|---|---|
| `opura_documents` | on | 3 | 2 — ambos `BEFORE UPDATE` |
| `opura_document_versions` | on | 3 | 0 |
| `opura_document_portal_shares` | on | 2 | 0 |

**2. O que uma sessão de usuário consegue fazer.** ⚠️ Rodar SQL pelo `db query`
NÃO responde isso — ele roda como `postgres` e bypassa a RLS. Então a prova foi
uma sessão autenticada de verdade, contra a produção, revertida no fim:

```
login ok
documento criado ✓
arquivo no storage ✓
versão criada ✓
active_version_id gravado ✓ (passou pelos 2 triggers de UPDATE)
compartilhamento com o portal ✓
lido de volta: {"nome":"… — rev. 7 — IFC","revisao":"7","categoria":"engenharia", …}
REVERTIDO — documentos de teste restantes: 0
```

E o Storage conferido de fora: `0` objetos de teste restantes.

⏳ **O que esta fatia NÃO fez**: o botão "compartilhar com o cliente" na tela da
planta. `compartilharComCliente` existe e a escrita foi provada, mas escolher o
cliente pede uma tela — e o caminho que já existe (Documentos → compartilhar com
o Portal) funciona sobre o documento recém-publicado sem nada novo.

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
