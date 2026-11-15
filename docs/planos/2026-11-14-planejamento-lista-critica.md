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

**Em aberto:** arquivos reais de exemplo (um XML do Project e uma planilha que vocês usam) para
os testes do leitor (2b).

**Fases e como sei que terminou**
- 2a. Botão atual sai de Planejamento → a tela não tem mais "Importar Excel"; Orçamentos mantém.
- 2b. Leitores XML + modelo Excel (funções puras, testadas com os arquivos de exemplo) → teste
  verde lendo EAP, datas, % e predecessoras do arquivo real.
- 2c. Criar a partir do arquivo → numa org descartável, o planejamento nasce na lista com as
  datas do arquivo e baseline ativa; nada nasce como ORCAMENTO.
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

### 4. O que Orçamentos ganhou em 14/11 também em Planejamento — ⏳

**O que muda:** colunas fixas, Agrupar e o subtítulo próprio (hoje escondido por
`hideHeader`) deixam de depender de `isOrcamentoContext`; cabeçalho duplicado do AppRouter sai.
**Como sei que terminou:** rolando a tabela na horizontal o nome do planejamento fica visível;
Agrupar aparece na toolbar.

### 5. Acessibilidade — ⏳

**O que muda:** Esc nos modais Novo/Importar; foco volta à linha ao voltar do planejamento;
contrastes do subtítulo (2,5:1), traço "-" (2,6:1) e "Com pedidos" (3,2:1); rótulo na busca;
`aria-label` nos botões só de ícone; `aria-expanded` no Filtro avançado; h2 no vazio.
**Como sei que terminou:** roteiro de teclado + medição de contraste na tela, todos ≥ 4,5:1.

### 6. Textos — ⏳

"5.4%"/vírgula (some com o item 1), subtítulo de marketing, modal Novo ("01/2025",
"ESCOPO TEMPORAL", "dados dinâmicos"), nomes da janela de colunas = cabeçalho, "FILTROS",
motivo do "Salvar como…", código "001" sugerido repetido.

### 7. Celular — ⏳

KPIs compactos (hoje os 4 cards empilhados ocupam a tela de 390 px inteira), alvos de 44 px,
coluna sem rótulo de largura 0.

### 8. Passada final (`/impeccable polish`) — ⏳
