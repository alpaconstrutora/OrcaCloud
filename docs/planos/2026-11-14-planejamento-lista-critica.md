# Engenharia › Planejamento (lista) — correções da crítica de design

## Pedido original

Sessão 98868220 (Claude Code), 14/11/2026, ~20h50 (Brasília):

> /impeccable critique engenharia > planejamento

Respostas às perguntas do fim da crítica (mesma sessão):

> Por onde começamos? → **"Corrigir o que mente"**
> Sobre "Importar Excel" nesta tela → **"Importar cronograma de verdade"**
> Quanto quer resolver agora? → **"Tudo, incluindo menores"**

E logo depois:

> um de cada vez

Crítica registrada em `.impeccable/critique/2026-11-14T23-46-23Z__components-planningdashboard-tsx.md`
(feita na frente `critica-planejamento`, não versionada): 16/40, três P1.

## Itens

Ordem combinada: um de cada vez, primeiro o que mente.

### 1. KPIs que mentem → recortes clicáveis com a conta da Central de Comando — ✅ feito (este PR)

**O que muda**
- `PlanningDashboard` sai. "Progresso Médio 5.4%" era o default fixo `obraProgress`
  (`constants.ts`), nunca recalculado; "Atividades Críticas" contava itens órfãos do
  cronograma (Divino: 132 itens de cronograma × 37 itens vivos do orçamento);
  "Próximo Vencimento" virava "atraso" eterno; nenhum card filtrava nem seguia a busca.
- Quatro recortes no `ProjectList` (contexto PLANEJAMENTO), botões com `aria-pressed`, que
  filtram a lista e contam sobre a lista já buscada/filtrada: *Com tarefa atrasada*,
  *Terminam em 30 dias*, *Com tarefa crítica em aberto*, *Sem cronograma*.
- Conta única em `utils/planejamentoIndicadores.ts`, extraída da Central de Comando
  (`CommandCenterPanel` passa a usá-la): avanço físico ponderado pelo orçado, EV/PV/SPI,
  atrasadas, críticas, término previsto, desvio da linha de base. "Hoje" passa a ser o dia
  local (antes UTC: depois das 21h o painel já contava o dia seguinte).
- `useIndicadoresDosPlanejamentos`: busca leve `id, budget` dos planejamentos da lista (a
  lista não carrega `budget`); estados calculando / falhou (clique tenta de novo) / pronto.
- Rota `eng-planejamento` passa `isExternalLoading` (antes mostrava "Cadastre o primeiro"
  enquanto sincronizava).

**Como sei que terminou**
- `__tests__/planejamentoIndicadores.test.ts` verde (7 testes).
- `tsc --noEmit` 0 erros; `check-ui-standard.sh` limpo em ProjectList, AppRouter e
  CommandCenterPanel; `orgContextGuard` verde.
- Tela local (14/11, escrita bloqueada, 0 tentativas): cards 2 / 1 / 2 / 0 de 2; Divino na
  Central = 33 de 37 atrasadas, término 02/12/2026 (entra em "Terminam em 30 dias"); Garden =
  2 de 2 atrasadas, término 15/04/2026; cada recorte filtra; busca "garden" recorta os cards
  para "de 1"; Enter no card liga/desliga.

### 2. "Importar Excel" cria ORÇAMENTO → importação de cronograma de verdade — ⏳ brief aguardando confirmação

Item 1 no ar em 14/11/2026 (PR #446, a3c7923).

**Decisões do usuário (`/impeccable shape`, 14/11/2026, respostas literais):**

> Qual é o caso real? → **"Os dois"** (criar a partir do arquivo E atualizar um existente)
> Que arquivo chega? → **"MS Project em XML, MS Project .mpp direto, Planilha Excel do modelo"**
> Tarefa sem item no orçamento → **"Usuário decide na prévia"**
> Botão atual enquanto isso → **"Sair da tela já (Recomendado)"**
> Avanço ao atualizar → **"Avanço também, item a item na prévia"**
> Linha de base → **"Ao criar, vira a baseline (Recomendado)"**
> .mpp → **"XML + Excel primeiro, .mpp depois (Recomendado)"**

**Brief**

1. *Quem e para quê* — engenheiro/planejador no escritório (desktop), com um cronograma feito
   fora do app (MS Project ou planilha). Quer que o planejamento do app reflita esse arquivo
   sem redigitar tarefa por tarefa. Modo Operate.
2. *Dois caminhos, uma prévia*
   - **Criar** (lista Planejamento, botão "Importar cronograma"): escolhe a obra (a
     organização vem da obra — REGRA #5, nunca pergunta com o topo apontando), o orçamento
     base para casar os itens, e o arquivo. Nasce `PLANEJAMENTO` com `linkedProjectId` da obra
     e **baseline ativa = datas do arquivo**.
   - **Atualizar** (dentro do planejamento aberto): mesmo arquivo, mesma prévia. Troca datas e
     predecessoras; **avanço só onde a pessoa marcar, item a item** (app × arquivo lado a lado
     onde diferem; padrão desmarcado, para não apagar o que veio do Diário). Baseline não muda —
     o desvio aparece na Central.
3. *Prévia (o coração)* — tabela em painel lateral largo (`Sheet`, REGRA #4), três passos:
   arquivo → casamento → confirmar. Cada tarefa do arquivo aparece casada com um item do
   orçamento (por código da EAP/item e descrição normalizada) ou **sem par**; para as sem par a
   pessoa escolhe: casar com um item, criar como tarefa sem custo, ou ignorar — com ação em lote
   ("ignorar todas sem par"). Nada grava antes de "Confirmar"; contagem do que entra, muda e fica
   de fora antes do botão.
4. *Formatos* — fase A: **MS Project XML** (Salvar como → XML: EAP, início, término, duração,
   % concluído, marcos, predecessoras com tipo e defasagem) e **modelo Excel** do app (baixar →
   preencher → subir; mesmas colunas). Fase B: **.mpp**, depois de um spike de conversor no
   servidor (as bibliotecas que leem .mpp são Java/.NET; Edge Function não roda).
5. *Estados* — arquivo que não é cronograma (diz o que esperava e qual formato), arquivo vazio,
   nenhum casamento, 500+ tarefas (prévia não pode travar), datas faltando, predecessora apontando
   para tarefa ignorada, erro ao gravar (nada fica pela metade).
6. *Interino (já combinado)* — o "Importar Excel" atual sai da tela de Planejamento (continua em
   Orçamentos, onde a ficha faz sentido).

**Decisões tomadas na confirmação do brief (14/11/2026, respostas literais)**

> Tarefa sem custo no avanço → **"Não entra no avanço (Recomendado)"** — peso zero; aparece no
> Gantt e conta em atrasadas/críticas, não move o % físico (a conta única não muda).
> Datas depois de importar → **"Ficam como no arquivo (Recomendado)"** — o motor só recalcula
> quando alguém editar depois.
> Brief → **"Confirmado, seguir pela 2a"**

**Arquivos de exemplo (15/11/2026):** o usuário não tinha um XML nem uma planilha à mão e pediu
(literal): *"Estou sem os arquivos xml e planilha agora. consegue gerar um para voce testar?"*.
Gerados a partir da EAP real do Divino (nome anonimizado) em `__tests__/fixtures/cronograma/`
(LEIAME.md explica cada caso). São sintéticos: um XML real do Project continua bem-vindo como teste
a mais, mas não bloqueia.

**Fases e como sei que terminou**
- 2a. Botão atual sai de Planejamento → a tela não tem mais "Importar Excel"; Orçamentos mantém.
- 2b. Leitores XML + modelo Excel (funções puras, testadas com os arquivos de exemplo) → teste
  verde lendo EAP, datas, % e predecessoras do arquivo real. — ✅ **feito 15/11/2026**:
  `utils/cronogramaLeitura.ts` (`lerMsProjectXml`, `lerModeloExcel`, `lerLinhasDoModelo`,
  `lerPredecessorasDoTexto`), sobre o `utils/xmlLeve.ts` existente (roda no navegador e no Node).
  12 testes: os 58 itens do gabarito no XML; o Excel devolve exatamente o mesmo que o XML; os 4
  tipos de vínculo e defasagens −1/+2/+5; erros com mensagem do que fazer; vínculo para tarefa
  ausente sai com aviso. Prova de que o teste morde: um % alterado no XML derruba 2 testes.
- 2c. Criar a partir do arquivo → numa org descartável, o planejamento nasce na lista com as
  datas do arquivo e baseline ativa; nada nasce como ORCAMENTO. — ✅ **feito 15/11/2026**
  (pedido: *"comece"*; teste com gravação *"Autorizado"* pelo usuário, criar → conferir → apagar):
  - `utils/cronogramaCasamento.ts` (EAP, depois nome normalizado; cada item uma vez);
    `utils/cronogramaMontagem.ts` (schedule pronto: itens a partir do padrão do
    `ensureFullScheduleList`, datas do arquivo com MSO, tarefa sem custo = nó `activity` perto de onde
    estava no arquivo, predecessoras, linha de base ativa com a cascata de valor do app);
    `services/importarCronogramaService.ts` (liga no ORÇAMENTO base, org herdada dele, orçamento
    congelado em `basedOnBudgetSnapshot` + `budget`); `components/ImportarCronogramaSheet.tsx`
    (painel 4xl, 3 passos; modelo Excel para baixar em `utils/cronogramaModelo.ts`); botão
    "Importar cronograma" no cabeçalho de Planejamento.
  - **Convenção de datas descoberta:** no app término = início + duração (sex→seg = 1); no Project
    Finish = último dia trabalhado. A montagem usa a `Duration` do arquivo (o leitor passou a lê-la);
    sem ela, dias úteis do início ao término. Duração 0 sem marco existe ("Seguros") e é respeitada.
  - **Medido no 1º teste com gravação e corrigido:** (a) "desvio de custo −R$ 416 mil" ao abrir —
    itens casados sem `totalLaborCost`; (b) "+2d" ao abrir — o arquivo de TESTE tinha vínculos
    violados e o motor do app (que roda ao abrir) empurrou as sucessoras. Arquivos de teste refeitos
    com replanejamento consistente; dois testes novos travam os dois casos ("sem desvio de custo",
    "o motor não move nenhuma data").
  - **Limite (dito ao usuário):** as datas ficam como no arquivo enquanto o arquivo respeitar os
    próprios vínculos (o Project garante); se não, ao abrir o app empurra as sucessoras.
  - Como sei que terminou: 32 testes de importação + 99 dos módulos tocados verdes; tela local (escrita
    bloqueada) nos 3 passos; teste com gravação: nasceu PLANEJAMENTO, código 002 da org do orçamento,
    vínculo com o orçamento, 37 itens congelados, 39 tarefas (38 com MSO), 2 `activity`, linha de base
    ativa; Central de Comando ao abrir: término 03/12 "no prazo da baseline", desvio 0d e R$ 0. Os
    dois registros de teste foram apagados (0 referências em outras tabelas; 0 restantes).
- 2d. Atualizar existente → datas trocadas, avanço só nos itens marcados, baseline intacta.
- 2e. .mpp → spike decide o conversor; depois, o mesmo fluxo aceita .mpp.

### 3. Tabela com forma de cronograma — ✅ feito

(2a — botão "Importar Excel" fora de Planejamento — no ar em 15/11/2026, PR #449. 2b aguarda
arquivos reais de exemplo do usuário; o item 3 seguiu antes por não depender deles.)

**O que muda:** Planejamento ganha conjunto de colunas próprio (`COLUMNS_PLANEJAMENTO`, chave
`projectListColumns:planejamento`): Código, Planejamento, **Avanço** (real em `SegmentedProgress`
tom neutro + "previsto X%"), **Prazo** (régua da Central: SPI ≥ 1 = no prazo; "Atrasado · N
tarefas"; SPI no title), **Término** (desvio da linha de base no title), **Início**, Obra
Vinculada, Cliente, Atualização; Data de Criação oculta por padrão. Saem Status, Status Obra,
Pedidos e Tipo de Obra. Ações 152 px. As quatro colunas novas ordenam pela mesma conta.
O utilitário ganhou `inicioPrevisto` e `previstoPct` (PV ÷ total orçado).
**Como sei que terminou (15/11, servidor local, escrita bloqueada, 0 tentativas):** em 1440 px
Avanço/Prazo/Término/Início ficam entre 643 e 1303 px (área visível até 1407); Divino = 5% ×
previsto 94%, "Atrasado · 33 tarefas" (Central: 5,2%, SPI 0,06, 33 de 37); Garden = 24% × 100%,
2 tarefas; ordenar por Avanço/Prazo/Término dá a ordem certa; Orçamentos mantém as colunas antigas.

### 4. O que Orçamentos ganhou em 14/11 também em Planejamento — ✅ feito

(Item 3 no ar em 15/11/2026, PR #450.)

**O que muda:**
- Colunas fixas (Código + Planejamento) também em Planejamento.
- Agrupar em Planejamento (`utils/planejamentoGrupos.ts`, chave `projectListGroupBy:planejamento`):
  Prazo (Atrasado → No prazo → Não começou → Sem datas → Concluído), Mês de término, Obra
  Vinculada, Cliente. A situação de prazo saiu do ProjectList para esse utilitário: célula e
  grupo leem o mesmo texto.
- O AppRouter deixa de desenhar o próprio cabeçalho (duplicado, frase de marketing em gray-400
  2,5:1): Planejamento usa o do ProjectList — subtítulo "Clique em um planejamento para abrir o
  cronograma; o lápis edita os dados cadastrais." em gray-500. "Importar Excel" escondido em
  Planejamento também nesse cabeçalho (decisão da 2a).
**Como sei que terminou (15/11, servidor local, escrita bloqueada, 0 tentativas):** um h1 só;
subtítulo oklch(0.551…) = gray-500; 0 botões "Importar"; rolada até o fim, Código e "Garden
Cambuhy" seguem dentro da área visível; Agrupar → Prazo dá "Atrasado 2" com as duas linhas;
Orçamentos mantém título e "Importar Excel"; 26 testes verdes.

### 5. Acessibilidade — ✅ feito

(Item 4 no ar em 15/11/2026, PR #452.)

**O que muda:**
- Modal de criação (`ProjectModal`, modo create — vale para obra/orçamento/planejamento/diário):
  `role="dialog"` + `aria-modal` + nome ("Novo Planejamento"); foco entra no 1º campo; Tab preso
  dentro; Esc nascido dentro = Cancelar; ao fechar o foco volta a quem abriu (ou ao "Novo …" da
  lista, `data-abre-novo-projeto`, se o botão foi redesenhado). O modal de importar não existe
  mais em Planejamento (2a).
- Foco volta à linha de onde a pessoa saiu ao voltar do planejamento (sessionStorage por contexto,
  `data-project-id` na linha e no card da grade).
- Contraste: traço de vazio e "—" gray-400 (2,6:1) → gray-500; "Com pedidos" amber-600 (3,2:1) →
  amber-700; ícones de Colunas e Ajustar largura gray-400 → gray-500. O subtítulo já saiu no item 4.
- Nomes acessíveis: busca com `aria-label`; Atualizar, Ajustar largura e Configurar colunas com
  `aria-label` (Colunas também `aria-expanded`); `ActionIconButton` passa a pôr o `title` também em
  `aria-label` (o app inteiro); Filtro avançado com `aria-expanded` + `aria-haspopup="dialog"`.
- Vazio: `h2` em vez de `h3` (não salta nível depois do `h1`).
**Como sei que terminou (15/11, servidor local, escrita bloqueada, 0 tentativas):** dialog "Novo
Planejamento" com foco dentro; 80 Tabs e Shift+Tab continuam dentro; Esc fecha e o foco volta ao
botão "Novo planejamento"; Enter na linha do Divino → planejamento → "Voltar para Gestão de
Planejamento" → foco na linha do Divino; Filtro avançado aria-expanded false→true; traço e
engrenagem em oklch(0.551…) = gray-500. 26 testes do plano + 60 dos componentes tocados verdes.
`check-ui-standard` no ProjectModal acusa o `searchTerm` em useState (l. 276) — já existia no
main; é a busca do seletor de cliente do formulário (exceção §3.1).

### 6. Textos — ✅ feito

(Item 5 no ar em 15/11/2026, PR #453.)

**O que muda:**
- Modal "Novo …" (criação): saem o selo "OBRA/PLAN/DIAR/BUDG" (sigla em inglês, mono) e o chip
  "Tipo: Escopo Temporal/Controle de Campo/…"; sai a caixa "Planejamento Ativo — Este registro
  gerencia dados dinâmicos do projeto"; subtítulo diz o que vem depois ("Dados do planejamento. O
  cronograma você monta depois de criar, ao abrir o planejamento."; Diário tinha "do orçamento" —
  corrigido); rodapé "Sincronização ativa: 01/2025 (SP)" (não havia sincronização) vira "Base
  SINAPI 01/2025 · SP", só em Orçamento.
- Filtro avançado: "FILTROS" sem caixa alta; "Salvar como…" desligado diz o motivo ("Adicione um
  filtro para poder salvá-lo", no span — botão desabilitado não mostra title).
- Janela de Colunas usa o rótulo do cabeçalho em todos os contextos ("Orçamento"/"Obra
  Vinculada", não "Nome"/"Vinculado").
- "5.4%" e "Próximo Vencimento" saíram no item 1; o subtítulo de marketing, no item 4.

**Não é bug (registrado):** código "001" repetido — `get_next_planejamento_code` numera POR
ORGANIZAÇÃO (Garden e Divino estão em orgs diferentes); com o topo em "Todas" o Novo ainda não
sabe a org e sugere 001.

**Visto para o item 8 (polish), no mesmo modal:** código sugerido em azul-claro (§32), selo
"HERDADO DA OBRA" em caixa alta, "Empresa do grupo responsável por esta obra" em Planejamento.

**Como sei que terminou (15/11, servidor local, escrita bloqueada, 0 tentativas):** no dialog
"Novo Planejamento" nenhum de PLAN / Escopo Temporal / Planejamento Ativo / dados dinâmicos /
Sincronização ativa; tem "O cronograma você monta depois"; "Filtros" com text-transform none;
title do Salvar como presente; janela de Colunas com "Planejamento" e "Obra Vinculada", sem
"Nome". 208 testes de 22 arquivos verdes.

### 7. Celular — ✅ feito

**O que muda:**
- **Cartão da grade em Planejamento** (o modo cartões, que é o natural no celular) mostrava "Em
  andamento / Não Iniciado / Com pedidos" — a mesma contradição que o item 3 tirou da tabela.
  Agora: situação de prazo no topo ("Atrasado · 2 tarefas"), Avanço real × previsto
  (`SegmentedProgress`) e Término no lugar de "Criado em"; sem o chip de Tipo de Obra.
- Cards de recorte em 2×2 no celular (antes 4 empilhados = 360 px); legendas curtas ("de 2 ·
  filtrar"; a dica longa fica no title).
- Barra de ferramentas no celular: busca na 1ª linha e os controles quebrando em linhas alinhadas
  à esquerda (antes um controle por linha, centralizado). Desktop igual (uma linha).
- Cabeçalho "Ações" em gray-700 como os demais (§6.11). A coluna espaçadora já tinha aria-hidden.
- Alvos de toque: o app interno segue WCAG AA (24 px, PRODUCT.md); 8 controles abaixo de 24 px
  ficam para o polish (item 8) — não são desta lista só (setas de ordenação do `SortableHeader`).
**Como sei que terminou (15/11, servidor local, 390×844 com toque, escrita bloqueada, 0
tentativas):** cards em duas linhas (234–450 px); a primeira linha da tabela passou de y=960 para
y=690 (dentro da tela); cartão do Garden = "Atrasado · 2 tarefas · 24% previsto 100% · Término
15/04/2026"; 1440 px sem mudança (barra em uma linha, tabela em y=314 em Planejamento e Orçamentos).

### 8. Passada final (`/impeccable polish`) — ✅ feito

(Item 7 no ar em 15/11/2026, PR #455.) O registro da crítica apontava para
`PlanningDashboard.tsx`, apagado no item 1 — passada independente, sem backlog do snapshot.

**O que muda:**
- Falha ao carregar o orçamento dos planejamentos: UMA mensagem (`role="alert"`) com "Tentar de
  novo" no lugar dos 4 cards repetindo "Falhou" (guia §4.5.1); células com "—".
- Modal "Novo": o "001" em azul-claro era o PLACEHOLDER, que parecia valor (e com o topo em "Todas"
  nada é sugerido) — campo de código no padrão dos demais (valor gray-900, placeholder "Ex.: 001");
  a dica diz a verdade quando vazio ("Em branco, o código é gerado ao salvar, na sequência da
  organização" — `projectService` gera); "HERDADO DA OBRA" (caixa alta, fundo) vira "· herdado da
  obra" em texto; "Empresa do grupo responsável por este planejamento/diário"; dicas sob os campos
  gray-400 → gray-500.

**Decidido não mexer:** setas de ordenação com 19 px de altura passam pela exceção de espaçamento
da WCAG 2.5.8 (nenhum alvo acima/abaixo); aumentar mudaria o cabeçalho de TODAS as tabelas do app.
O seletor de contexto do topo continuar "Obra X" depois de abrir um planejamento é da casca, fora
desta tela.

**Como sei que terminou (15/11, servidor local, escrita bloqueada, 0 tentativas):** falha forçada
→ 1 alerta, 0 cards, células "—"; "Tentar de novo" → "Calculando…" com aria-busy → 2/1/2/0; código
do Novo com valor gray-900 e placeholder "Ex.: 001"; revisão do caminho inteiro (itens 1, 4 e 5
reexecutados) sem regressão.

**Plano concluído, exceto o item 2:** 2a no ar; 2b–2e aguardam arquivos reais de exemplo (XML do
MS Project e planilha usada pela equipe).
