# Planta Inteligente — ribbon, painel enxuto e dock de relatórios

## Pedido original

> o painel lateral direito esta ficando muito extenso e confuso. Talvez seria
> melhor organizar em menubar no estilo do revit. Faça uma sugestao

E, à proposta recomendada (ribbon + painel enxuto + dock inferior):

> vamos com a proposta recomendada

## Diagnóstico (13/09/2026)

O painel direito empilhava, num acordeão só, **15 seções de quatro naturezas
diferentes**:

| natureza | seções de hoje |
|---|---|
| navegação | Pavimentos, Componentes, Ambientes |
| propriedades da seleção | parede, abertura, estrutura, escada, corte, água, trecho, quadro, seleção múltipla (dentro de Componentes) |
| comandos / tarefas | Do PDF, Do IFC, Do DXF, Do BCF, Gerar paredes, Distribuir tomadas, Terreno · Georreferência · Zona · Topografia · Terraplenagem (dentro de Ambientes) |
| relatórios | Conflitos, Quadro de cargas, Medições, Quantitativos, Orçamento, Versões, Comentários |

O Revit separa exatamente essas quatro: **ribbon** (comandos por disciplina),
**Properties** (seleção), **Project Browser** (hierarquia) e **vistas de
tabela** (relatórios). É isso que se copia aqui.

## Desenho

```
┌ Voltar  Casa de prova · Salvo                              [Publicar versão] ┐
│ [Planta▾] │ Arquitetura │ Terreno │ Instalações │ Inserir │ Analisar │ Vista │  ↶ ↷ ⧉ 📋 🗑  ← abas + acesso rápido
│ [Selecionar][Componentes▾][Juntar] │ [Área][Linha][Contar] │ [Corte]        │  ← painel da aba ativa (role=toolbar)
│ Parede:  Espessura [150] Clique [face à direita]  ·  [Orto] [Manter junções] │  ← barra de opções da ferramenta
├──────────────────────────────────────────────┬───────────────────────────────┤
│                                              │ NAVEGADOR                     │
│                 canvas                       │  pavimentos · componentes ·   │
│                                              │  ambientes                    │
│                                              ├───────────────────────────────┤
│                                              │ PROPRIEDADES / TAREFA         │
├──────────────────────────────────────────────┴───────────────────────────────┤
│ Quadro de cargas ×  │ tabela larga, altura arrastável                        │  ← dock (um relatório por vez)
└──────────────────────────────────────────────────────────────────────────────┘
```

Decisões:

- **Seletor de vista fora das abas**, à esquerda delas: troca-se de vista o
  tempo todo; enterrá-lo numa aba "Vista" custaria dois cliques por troca.
- **Acesso rápido** (desfazer, refazer, copiar, colar, excluir) à direita da
  linha de abas, sempre visível — o equivalente da Quick Access Toolbar.
- **Barra de opções** (Revit Options Bar): a terceira linha, só quando a
  ferramenta ativa tem opções — espessura/clique/lados da parede, largura/tipo
  salvo/folha da abertura, medidas da estrutura, escada, telhado — mais Orto e
  Manter junções, que são opções do gesto e não comandos.
- **Aba vazia não aparece.** As abas existem em função do conteúdo que a vista
  atual admite: em elevação/corte/3D sobram Vista (e, nas fatias seguintes,
  Analisar/Colaborar). A aba persistida que deixou de existir cai na primeira.
- **Nada em tela cheia** (memória `feedback_nunca_tela_cheia_para_paineis`).
- Componentes `Painel*` são **reaproveitados como estão**; só mudam de morada.

Mapa das seções → destino:

| hoje | destino | fatia |
|---|---|---|
| barra de ferramentas (Selecionar, Componentes, Juntar) | aba **Arquitetura** | F1 |
| Área, Linha, Contar | aba **Analisar** › Medir | F1 |
| Corte | aba **Arquitetura** › Vistas | F1 |
| Terreno, Divisa, Perfil, Drenagem | aba **Terreno** | F1 |
| menu Componentes › Instalações e Elétrica | aba **Instalações** (o mesmo menu, filtrado) | F1 |
| Fundo (PDF/imagem, calibrar, opacidade) | aba **Inserir** › Fundo | F1 |
| Exibir, Encaixe, Grade, Precisão, Enquadrar, Inverter o lado, toggles do 3D | aba **Vista** | F1 |
| Orto, Manter junções, campos da ferramenta | **barra de opções** | F1 |
| Desfazer/Refazer/Copiar/Colar/Excluir, contagem | **acesso rápido** | F1 |
| Do PDF (gerar paredes), Do IFC, Do DXF, Do BCF | aba **Inserir** → abre **tarefa** no painel | F2 |
| Terreno › georreferência, zona, topografia, terraplenagem, gravar área | aba **Terreno** → tarefa | F2 |
| Distribuir/Completar tomadas, Conferência NBR 5410, emissão elétrica | aba **Instalações** → tarefa | F2 |
| Pavimentos, Componentes (lista), Ambientes (lista) | painel › **Navegador** | F2 |
| painéis de seleção | painel › **Propriedades** (mesmo slot da tarefa) | F2 |
| Conflitos, Quadro de cargas, Medições, Quantitativos, Orçamento, Versões, Comentários | aba **Analisar** / **Colaborar** → **dock inferior** | F3 |
| mover, duplicar, dividir, unir, excluir, inverter o lado | aba contextual **Modificar** | F4 |

## Fatias

| fatia | entrega | portão |
|---|---|---|
| F1 ribbon + barra de opções | `Ribbon.tsx` (abas, grupos com rótulo, acesso rápido) e `BarraDeOpcoes`; a barra atual redistribuída; painel lateral **intocado** | `BlueprintEditor.test.tsx` verde (helpers trocam de aba); teste novo do ribbon (aba vazia some, persistência, fallback); screenshot do app real com escritas bloqueadas |
| F2 painel enxuto | Navegador (pavimentos + componentes + ambientes) em cima, Propriedades/Tarefa embaixo; tarefas abertas pelo ribbon; chave de persistência `:v3` | testes de seção existentes adaptados; screenshot |
| F3 dock | `DockDeRelatorios` (um por vez, altura arrastável e persistida, fechável); relatórios saem do painel | testes de quantitativos/orçamento/versões via dock; screenshot com Quadro de cargas na largura inteira |
| F4 Modificar | aba contextual com a seleção; some ao desselecionar | teste: seleciona → aba aparece com as ações; desseleciona → some |

## Status de implementação

| fatia | estado | onde |
|---|---|---|
| F1 | ✅ 13/09 | `components/blueprint/Ribbon.tsx` (`Ribbon`, `GrupoDoRibbon`, `BarraDeOpcoes`, `abaEfetiva`); `ABAS_DO_RIBBON` e `ROTULO_DA_FERRAMENTA` no `BlueprintEditor`; `MenuComponentes` ganhou `familia` (CONSTRUCAO \| INSTALACOES), `rotulo` e passa a acender trecho/ponto/quadro ativos; aba persistida em `blueprint:abaDoRibbon`. Testes: `Ribbon.test.tsx` (4) e `BlueprintEditor · ribbon` (6); os testes de Exibir/Grade/Precisão abrem a aba Vista antes (`abrirAba`). **Painel lateral intocado.** Prova no app real com escritas bloqueadas (14 abortadas, 0 erros JS): as seis abas, menu de Instalações em 2 colunas, barra de opções trocando de "Parede" para "Divisa" e "Trecho de rede", 3D só com Vista, tela de 1100 px quebrando linha sem sumir botão |

**F1 — o que a captura pegou antes de publicar**: grupo "Navegar" vazio no
3D (Enquadrar e Inverter só existem em elevação/corte) — passou a só existir
com conteúdo; rótulo do grupo repetindo o do botão "Planta de fundo" —
virou "Referência". Espessura/Clique agora só aparecem para as ferramentas de
parede (antes apareciam em Selecionar, Juntar, Terreno e medições).
| F2 | ✅ 13/09 | Painel = **Navegador** (Pavimentos, Componentes, Ambientes — `SECOES_DO_PAINEL` caiu de 15 para 3) em cima e **Propriedades / Tarefa** embaixo (`PainelDeTarefa.tsx`, `max-h-[62%]`, só na planta, só com seleção ou tarefa). Tarefas (`ROTULO_DA_TAREFA`): Dados do lote (aba Terreno; o `PainelTerreno` inteiro, também usado como propriedades da divisa selecionada), Do PDF, Do IFC, Do DXF, Do BCF (aba Inserir › Importar). Uma por vez; tarefa aberta + seleção mostra a faixa "Selecionado: … [Propriedades]". A região do Do PDF agora morre com a tarefa (era com a seção) |
| F3 | ✅ 13/09 | `DockDeRelatorios.tsx` embaixo do canvas, na largura dele: altura arrastável e persistida (`blueprint:alturaDoDock`, 160–720 px, duplo clique restaura, setas ↑↓), um relatório por vez, × fecha. `RELATORIOS_DO_DOCK` com os mesmos recortes `naVista`/`no3d` das seções: Conflitos, Medições, Quantitativos, Orçamento (aba Analisar › Relatórios), Comentários e Versões (aba **Colaborar**, nova), Quadro de cargas e NBR 5410 (aba Instalações › Elétrica). Botões do ribbon com `aria-pressed` e contagem (`BotaoDoRibbon`). `abaEfetiva` ganhou `preferida`: fora da planta cai em Vista |

**F2–F3 — o que os testes e a captura pegaram**: `regiaoArmada`/`regiao` do
canvas ainda liam `secoes.vetor` (seção extinta) — passaram a ler a tarefa;
ao sair da planta a aba salva caía na primeira disponível (Instalações), e o
que se quer ali é olhar — `preferida: 'vista'`; Quantitativos continua
visível no 3D, como a seção era (meu teste supunha o contrário). Prova no app
real com escritas bloqueadas (14 abortadas, 0 erros JS): Propriedades da
parede sob o navegador, tarefa "Dados do lote" com a faixa da seleção, Do IFC,
dock com Quadro de cargas + NBR 5410, Quantitativos, Versões, e Conflitos no
3D. Suíte: 4046 verdes; as 2 falhas restantes são de migration de OUTRA frente
já em `origin/main` (`20270919000029` repetido; `vw_fact_financial_tx` sem
REVOKE) — não tocadas aqui.

**Fica para a F4**: aba contextual "Modificar" (mover, duplicar, dividir,
unir, excluir, inverter o lado) — hoje essas ações continuam no painel de
Propriedades da peça.
| F4 | ✅ 13/09 | Aba contextual **Modificar** (verde, última, só com seleção na planta): grupo da seleção (rótulo da peça ou "N selecionados") com Copiar e Excluir; Parede → Dividir/Unir; Porta e de correr → Girar/Espelhar (sem Espelhar na embutida); Estrutura → Cortar paredes (n)/Emendar pontas (n); Corte → Ver o corte/Inverter o lado. `emModificar` é estado de sessão separado da aba salva: **não pula sozinha na primeira seleção** (quem está em Instalações clicando pontos não quer o ribbon pulando), mas quem a escolheu uma vez a recebe de volta a cada seleção; sem seleção o ribbon volta à aba de trabalho. As ações continuam também nos painéis de Propriedades |

**Achado do usuário depois da F4** (*"não encontrei a funcionalidade de
lançamento automático de tomadas"*): a distribuição morava só dentro de cada
cartão de ambiente do navegador e na parede selecionada — comando escondido
em navegação. Entrou a tarefa **Tomadas pela NBR 5410** (aba Instalações ›
grupo Tomadas › "Distribuir tomadas", com a contagem de ambientes em déficit)
listando todos os ambientes com tipo, conferência e Completar/Distribuir, mais
o botão **"Aceitar sugeridas"** (contagem do pavimento). Os controles são uma
função só (`controlesDeTomadas`), usada no cartão e na tarefa.

**Teste de formato — drawer** (pedido de 13/09: *"o painel ainda está com
bastante informação. Vamos adotar drawer para teste em Distribuir Tomadas"*):
a tarefa de tomadas passou a abrir num `Sheet` (§26, `size="xl"`, flutuante)
por cima da tela, com a lista de ambientes no corpo e "Aceitar sugeridas" +
"Fechar" no rodapé; `tarefaNoPainel` exclui `tomadas` da metade de baixo do
painel. As demais tarefas (Dados do lote, Do PDF/IFC/DXF/BCF) continuam no
painel até o teste dizer qual formato fica. Trade-off declarado: o drawer é
modal — enquanto aberto não se clica no desenho; distribuir e fechar é o fluxo.

**Drawer aprovado → todas as tarefas** (*"migrar as outras quatro tarefas"*):
Dados do lote (`2xl`), Do PDF, Do IFC, Do DXF e Do BCF abrem no mesmo `Sheet`
(um só, conteúdo por tarefa; montado só com tarefa, porque o `Sheet` fica no
DOM mesmo fechado). A metade de baixo do painel ficou **só com Propriedades**
da seleção. Onde a tarefa precisa do canvas: **Do PDF** — armar a região
recolhe o drawer (`drawerRecolhido`, `open=false`, estado preservado) e
marcar/desistir o traz de volta; **terreno** — traçar perfil ou drenagem fecha
a tarefa (gesto longo, ferramenta própria) e a descrição do drawer avisa
"volte por Terreno › Dados do lote". `PainelDeTarefa` continua sendo o
cabeçalho das Propriedades.

**Quadro de cargas em drawer** (*"implementar drawer também no quadro de cargas
que hoje abre painel embaixo"*): `relatorioNoDock` exclui `quadro-de-cargas`
do dock; ele abre num `Sheet` `2xl` com `PainelEletrica` + Conferência NBR
5410, contagem de circuitos no título e "Selecionado: …" no rodapé. Critério
que ficou: **o que se edita (tarefas, quadro de cargas) vai para drawer; o
que se lê (Conflitos, Medições, Quantitativos, Orçamento, Comentários,
Versões) fica no dock**, com a largura do canvas.

**Os quatro de Analisar em drawer** (14/09, pedido: *"Converter em drawer:
analisar < conflitos; medições; quantitativos; orçamento"*): `RELATORIOS_EM_DRAWER`
= quadro de cargas + Conflitos, Medições, Quantitativos, Orçamento — um único
`Sheet` 2xl com título/ícone/descrição por relatório e a contagem no título
(conflitos, medições). O dock fica só com **Comentários e Versões** (Colaborar),
que se leem olhando o desenho ao lado. Critério atualizado: drawer para o que
se edita OU se consulta em tabela larga; dock para o que acompanha o desenho.
Prova no app real com escritas bloqueadas: os quatro em drawer com dock vazio,
Versões no dock sem drawer.

**Projeto executivo (ART) em drawer próprio** (14/09, *"no mesmo drawer do
quadro de cargas não tem necessidade além de tornar o drawer excessivamente
longo"*): saiu do `executivoSlot` do quadro de cargas e virou o relatório
`executivo-eletrico`, com botão próprio em Instalações › Elétrica (contagem de
emissões) e `Sheet` próprio. `PainelEletricaExecutivo` ganhou `semCabecalho`
porque o título e a descrição já estão no cabeçalho do drawer (a captura
mostrou os dois repetidos). Emite-se uma vez por revisão; o quadro se consulta
o tempo todo — separá-los é a justificativa.

**Fonte mínima nos drawers Quadro de cargas e Projeto executivo** (14/09,
pedido: *"Textos secundários e legendas: 12px; corpo de texto principal: 14px é o
limite inferior para tabelas, listas e menus"*): os cinco painéis desses
drawers (`PainelEletrica`, `PainelEletricaExecutivo`, `PainelPreDimensionamento`,
`PainelQuadroAlimentador`, `PainelConferenciaNbr`) foram escritos para o painel
lateral de 307 px em 9/10/11 px. Regra aplicada: `text-[9|10|11px]` → `text-xs`
(12 px) em legendas (código da norma, resumo recolhido, rótulo de campo) e
`text-sm` (14 px) em corpo (tabela, campos, nomes, achados, botões de ação).
Larguras das colunas da tabela e da lista de pontos subiram junto (Disj./Seção
w-16, Pts. w-14, Carga w-24; Potência w-20, Circuito w-40). Prova no app real:
medição por `getComputedStyle` em todos os nós de texto dos dois drawers = nenhum
abaixo de 12 px; tabela sem transbordo (scrollWidth = clientWidth); capturas
olhadas. Vale como padrão para drawers novos; os painéis do lateral (307 px)
continuam com a escala menor até decisão própria.

**Defeito achado pelo usuário no uso** (*"o botão excluir no painel lateral não
está funcionando. não consigo excluir TUG"*): a lixeira da lista do navegador
chamava `excluirComponente`, que só conhecia parede, abertura, estrutura, água
e escada — trecho, ponto e quadro caíam num `return` mudo. Corrigido (os três
entram; o quadro leva os circuitos, os pontos ficam sem circuito) e o painel
"Ponto/Trecho selecionado" ganhou o botão **Excluir** que os painéis irmãos já
tinham. Teste: a lixeira do TUG apaga; app real: 4 → 3 pela lixeira, 3 → 2
pelo botão do painel.

**F4 — prova**: teste com duas paredes selecionadas pela lista de vãos (aba
aparece, não é auto-selecionada, "2 selecionados", sem Dividir/Unir, Excluir
esvazia e a aba some); app real com escritas bloqueadas: Parede 1 selecionada →
Modificar com Copiar, Excluir, Dividir, Unir.

**Fonte mínima nos demais drawers (14/09, pedido: *"aplique o mesmo nos demais
drawers da planta inteligente"*)**: os outros 11 drawers (Distribuir tomadas,
Lançar eletrodutos, Dados do lote, Do PDF/IFC/DXF/BCF, Conflitos, Medições,
Quantitativos, Orçamento) somam ~330 ocorrências de 9/10/11 px espalhadas por
painéis que **também** montam no lateral de 307 px (`PainelTerreno`,
`PainelTopografia`, `PainelMedicoes`, `PainelOrcamento`…). Trocar classe a
classe imporia a escala do drawer ao lateral. A regra foi para o ponto de
montagem: `index.css` ganhou `.drawer-legivel` (9/10/11 px → 12 px; `text-xs`
→ 14 px), aplicada aos dois `SheetPanel` do editor. Os drawers do Quadro de
cargas e do Executivo, já corrigidos na fonte, não mudam com a regra.
Ajustes de layout que a fonte maior expôs: coluna Lançar da tabela de
eletrodutos w-24 → w-28 e botão `whitespace-nowrap`; rodapé de eletrodutos
encurtado ("Nenhum pendente." / "N pendente(s).") e sem quebra.
Prova no app real, escritas bloqueadas: os 13 drawers abertos um a um,
`getComputedStyle` em todo nó com texto direto/campo = nenhum abaixo de 12 px;
nenhum painel com scrollWidth > clientWidth; capturas de tomadas, eletrodutos,
quantitativos e orçamento olhadas. Suíte 313 arquivos / 4129 testes verde,
build ok.

**Mudanças visuais (14/09, pedido: *"1. Modo tela cheia 2. Aumentar 50%
símbolo tomadas"*)**:
1. **Tela cheia** — botão no acesso rápido do ribbon (único lugar visível em
   qualquer aba, porque é por ele que se SAI). Estado de sessão. A raiz do
   editor vira `fixed inset-0 z-40` (cobre sidebar z-20 e topo z-30; fica
   abaixo dos Sheets z-50, do confirm 200 e dos toasts 300) e, quando o
   navegador deixa, a janela entra em Fullscreen de verdade; sair por Esc/F11
   do navegador dispara `fullscreenchange` e o editor acompanha. Tela cheia
   aqui foi expressamente pedida e é um modo de editor CAD, não layout de
   painel. Prova: teste (liga/desliga, `aria-pressed`, classe na raiz) e app
   real com escritas bloqueadas — canvas 985×655 → 1293×726, `elementFromPoint`
   no centro da sidebar não a alcança (coberta), sair devolve 985 px.
2. **Símbolo da tomada 1,5×** — `FATOR_DO_SIMBOLO_DE_TOMADA = 1.5` no canvas,
   aplicado só ao desenho do triângulo NBR 5444 (piso 10 px → 15 px); a peça,
   o acerto do clique e o encaixe continuam na medida real. O anel tracejado
   da sugerida passou a envolver o símbolo (0,72 × tamanho + 6 px) em vez da
   peça. Prova: captura com zoom — triângulos maiores, anel fora da base.

---

## 17/09/2026 — acesso rápido: Selecionar · Mover │ seis vistas │ desfazer…

### Pedido original

> 1. na barra de botões no canto superior direito, ao lado do botão desfazer colocar um
> separador e inserir os botões (apenas os ícones) de vista que também você vê no print
> (Planta, frente, fundos, lat esquerda, lat direita e 3D)
> 2. cria lá também o botão selecionar (arquitetura < selecionar)
> 3. crie botão mover. mesma funcionalidade de mover do botão direito no mouse.

### O que mudou

- **Acesso rápido** (`Ribbon direita`): `Ferramenta: Selecionar` · `Ferramenta: Mover a
  vista` │ `Vista: Planta/Frente/Fundos/Lat. esquerda/Lat. direita/3D` (ícones de
  `VISTAS_FIXAS`, agora exportado de `SeletorDeVista.tsx` para a lista ser uma só) │
  Desfazer, Refazer, Copiar, Colar, Excluir, Tela cheia. Botões de vista com `aria-pressed`
  na atual; `SeparadorDaBarra` entre as famílias. Selecionar/Mover só na planta baixa
  (`!emVista`) — "nada de desenhar fora da planta". O seletor à esquerda continua (nome da
  vista atual + cortes).
- **Ferramenta `mover`** (`BlueprintTool`): no canvas, o botão esquerdo entra na mesma
  panorâmica que o direito/meio já faziam (`aoApertar`); cursor `grab`/`grabbing`; rodapé
  "Arraste para mover a vista…"; rótulo "Mover a vista" na barra de opções. Também no grupo
  Arquitetura › Construir, ao lado de Selecionar.

### Testes

- `blueprintFerramentaMover.test.tsx` (jsdom): mão → esquerdo agarra; seta → esquerdo não,
  direito continua agarrando.
- `BlueprintEditor.test.tsx`: acesso rápido com os oito botões, Mover acende e a barra de
  opções diz "Mover a vista", clique em `Vista: Frente` troca a vista e esconde as
  ferramentas, `Vista: Planta` as devolve. Dois `botao(/selecionar/i)` viraram `/^selecionar$/i`.

### Verificação

- tsc, check-ui-standard (Editor, SeletorDeVista, Canvas), suíte cheia (4399), build.
- App real (vite da frente, escritas bloqueadas: 14): oito botões presentes, `Vista: Planta`
  pressionado; Mover → cursor `grab`, arraste esquerdo → `grabbing` e o desenho se desloca;
  `Vista: Frente` → pressionado, seletor diz "Frente", Selecionar some da elevação.

---

## 17/09/2026 — acesso rápido completo ("implemente todos")

### Pedido original

> 4. sugira outros botões que traga boa funcionalidade ao app → (lista de 8) → **"implemente todos"**

### O que entrou (todos ícones em `BotaoBarra`, com `title` + `aria-label`)

Ordem da barra: Selecionar · Mover │ 6 vistas │ **Enquadrar · Zoom− · Zoom+ · 1:100** │
**Trava 90° · Encaixe** │ Desfazer · Refazer · Copiar · Colar · **Duplicar · Espelho H · Espelho V**
· Excluir │ **Isolar/Reexibir · Medir linha** · **Exportar a vista atual** · Tela cheia.

- **Enquadrar / Zoom ± / 1:100** — prop `navegacao {seq, acao}` do `BlueprintCanvas`
  (`AcaoDeNavegacao`); enquadrar olha paredes, divisas, estrutura (seção), telhado,
  escada, instalações e, sem nada, a prancha de fundo; zoom ± pelo centro da tela;
  1:100 = 96 dpi/25,4/100 px/mm. Em elevação/corte, Enquadrar usa o token já existente.
- **Trava 90°** (= Orto/F8, mesmo estado) e **Encaixe** (liga/desliga todos os
  `TIPOS_DE_ENCAIXE`; a escolha fina continua no menu Encaixe).
- **Duplicar (Ctrl+D)** — `comandoDeDuplicacao` em `utils/blueprintSelecao.ts`:
  `DuplicateEntities` com delta (+passo, −passo), passo = grade manual ou 500 mm;
  esquadria avulsa duplica na mesma parede logo após o vão (não cabe → aviso). A cópia
  nasce selecionada. ⚠️ Como no Ctrl+V, rótulo explícito é copiado igual ("P1" vira dois
  "P1"); numerar cópias é assunto separado.
- **Espelhar** — comando NOVO do kernel `MirrorEntities {eixo VERTICAL|HORIZONTAL, em}`:
  reflexão rígida em torno do centro da caixa da seleção; parede mantém a→b (offset das
  aberturas preservado no ponto refletido) e inverte `swingReversed`; estrutura/terminal/
  quadro negam o giro; `em` aceita meio milímetro. Sem mudança de forma canônica → sem
  bump de `KERNEL_VERSION`.
- **Isolar seleção / Reexibir tudo** — `idsParaIsolar` alimenta o mesmo `ocultosNoDesenho`
  do olho da lista (portas das paredes selecionadas ficam).
- **Medir linha** — `setTool('medir-linha')` sem trocar de aba.
- **Exportar a vista atual** — abre Versões com `pranchasIniciais=[vista]` (prop nova do
  `PainelVersoes`, `key` reinicia ao trocar de vista). A exportação continua saindo da
  versão publicada — regra do painel mantida.
- **Sheet `topPx`** (`components/ui/sheet.tsx`): o painel de propriedades sem véu nasce
  ABAIXO do ribbon (`ribbonRef` medido por ResizeObserver). Sem isso o drawer cobria o
  acesso rápido e duplicar/espelhar/isolar ficavam inalcançáveis justamente com seleção —
  achado na prova no app real.
- Contagem "N parede(s) · N ambiente(s)" só em `2xl:`; em 1600 px com sidebar a barra
  quebra em duas linhas (o `flex-wrap` do ribbon já cuidava disso).

### Testes

- `__tests__/blueprintSelecao.test.ts` (10): famílias, duplicar (delta, porta na mesma
  parede, não cabe, seleção vazia), espelhar (pilar no lugar com giro 30→330, conjunto
  com porta/offset/swing, HORIZONTAL com centro ,5, só porta, comando vazio), isolar.
- `BlueprintEditor.test.tsx`: "acesso rápido: navegar, modos, duplicar/espelhar, isolar,
  medir e exportar" e "Ctrl+D duplica". Rótulos escolhidos para não colidir com os testes
  antigos (`/orto/i`, `/espelhar/i`, `/mostrar tudo/i`): "Trava 90°", "Espelho …",
  "Reexibir tudo".

### Verificação

- tsc, check-ui-standard (Editor, Canvas, PainelVersoes, sheet), suíte cheia (4411), build.
- App real (vite da frente, escritas bloqueadas: 16): 12 botões presentes; Afastar/1:100/
  Enquadrar mudam o desenho; Trava e Encaixe alternam; painel de propriedades começa em
  y=285 com o ribbon terminando em 269; Duplicar 16→17 pilares, Espelho mantém 17, Isolar
  esconde P1 e vira Reexibir, Reexibir devolve; 2× Desfazer volta a 16; Medir muda a barra
  de opções; Exportar abre Versões.

---

## 17/09/2026 — Quantitativos vira TELA (era drawer)

### Pedido original

> Analisar < quantitativos: criar nova tela também em vez de drawer

### O que mudou

- `components/blueprint/TelaQuantitativos.tsx` (novo): faixa OFICIAL × AO VIVO (revisão 0 /
  oficial gerado / "Gerar oficial"), `TabsBar` com **Resumo** (uma grandeza por linha:
  grupo, item, quantidade, unidade, detalhe — arquitetura, material, estrutura, aço),
  **Por ambiente** (piso, eixo, pilares descontados, rodapé, fórmula), **Por peça
  estrutural** (concreto, fôrma, aço, esquema, fórmula; clique → `selecionarEAbrir`) e
  **Sobreposições** (badge "N !" quando há "contado duas vezes"). Números em pt-BR com as
  casas da política (`formatarQuantidade` do kernel devolve `toFixed` com ponto — serve ao
  payload, não à tela).
- Editor: `TelaDaEletrica` ganhou `'quantitativos'`; botão de Analisar usa `alternarTela`;
  `'quantitativos'` saiu de `RELATORIOS_EM_DRAWER`; `PainelQuantitativos`, `Linha` e
  `BotaoTexto` removidos (código morto). Conflitos, Medições e Orçamento continuam em drawer.

### Testes

- `BlueprintEditor.test.tsx` › "quantitativos": helper `abrirTelaDeQuantitativos`; tela com
  4 abas e sem dialog; textos de política/sem contorno/rascunho; Voltar devolve o editor
  com Ambientes aberto e Conflitos segue drawer; novo: com pilar, Resumo mostra "Concreto —
  pilares", Por peça lista P1 com 0,112 m³ e o clique abre as Propriedades. O teste da
  armadura passou a Voltar da tela antes de abrir Componentes.

### Verificação

- tsc, check-ui-standard (TelaQuantitativos, Editor), suíte cheia (4412), build.
- App real (Planta 14/09/2026, escritas bloqueadas: 14): tela sem dialog, abas Resumo 17 ·
  Por ambiente 4 · Por peça 67 · Sobreposições 99; clique em P1 fecha a tela e abre as
  Propriedades com "P1 · Pilar 0,157 m³…".

### 17/09/2026 — "incluir pavimentos em quantitativos"

- `utils/blueprintQuantitativosPorPavimento.ts` (novo): `pavimentoDasEntidades` (ambiente,
  parede, abertura pela parede, estrutura → nível), `quantitativosPorPavimento(model, quant,
  armadura?)` — um nível por linha na ordem da cota, com as MESMAS somas dos totais gerais
  (piso, parede 2 faces, alvenaria, rodapé, aberturas, construída, concreto, fôrma, aço), para
  a soma das linhas fechar com o total.
- `TelaQuantitativos`: prop `model`; aba **Por pavimento** (badge = nº de níveis, total no
  rodapé); coluna **Pavimento** em Por ambiente e Por peça; filtro "Filtrar por pavimento"
  nas duas abas quando há 2+ níveis (os totais das abas seguem o filtro).
- Testes: `blueprintQuantitativosPorPavimento.test.ts` (3: junção, soma fecha, mapa) e
  editor "com dois pavimentos" (linhas Térreo/Superior com o concreto de cada, coluna e
  filtro nas peças). Suíte cheia 4416; app real: Térreo e Pavimento 1 com 92,81 m² cada,
  total 185,63 m² = soma; escritas bloqueadas.

---

## 17/09/2026 — uma aba por disciplina MEP (Elétrica · Hidráulica)

### Pedido original

> menubar Instalações está agrupando todas as disciplinas. Melhor separar um menu para cada
> disciplina MEP: Elétrica; Hidráulica; Mecânica

### O que mudou

- `ABAS_DO_RIBBON`: "Instalações" saiu; entram **Elétrica** (`naVista: true` — o Quadro de
  cargas se lê no 3D) e **Hidráulica** (só na planta). **Mecânica não entra ainda**: não há
  componente mecânico no kernel (`DISCIPLINAS` = ELETRICA, AGUA_FRIA, AGUA_QUENTE, ESGOTO) e
  a regra do ribbon é "aba vazia não aparece" — entra junto com a disciplina.
- `MenuComponentes`: `FamiliaDeComponentes = 'CONSTRUCAO' | 'ELETRICA' | 'HIDRAULICA'`; os
  grupos passaram a levar a disciplina no título — "Elétrica — eletrodutos e quadro"
  (Eletroduto + Quadro, que saiu de "pontos"), "Hidráulica — trechos", "Hidráulica — pontos".
  É do título que saem a aba (`gruposDaFamilia`), a coluna do menu e o grupo do painel
  Componentes — um lugar decide os três. Aba salva "instalacoes" cai em `abaEfetiva` → Vista/
  primeira; `cabecalhoDaTela` padrão "Elétrica".
- Elétrica: menu (pontos, eletroduto, quadro) + Tomadas + Circuitos/Eletrodutos/Quadro de
  cargas/ART/Unifilar. Hidráulica: menu (água fria, quente, esgoto — trechos e pontos).

### Testes

- `BlueprintEditor.test.tsx`: lista das oito abas; 3D com Elétrica; `abrirAba(/^elétrica$/i)`
  nos testes elétricos; novo "uma aba por disciplina MEP" (menus filtrados e tarefas só na
  Elétrica). `blueprintComponentesRede`/`PainelComponentesRede`: títulos novos dos grupos.
- Suíte cheia 4418, tsc, check-ui (Editor, MenuComponentes), build. App real (escritas
  bloqueadas: 14): abas Arquitetura · Terreno · Elétrica · Hidráulica · Inserir · Analisar ·
  Colaborar · Vista; menu Elétrica com 18 itens (eletroduto, quadro, pontos), Hidráulica com 6;
  lista de Componentes com "Elétrica — eletrodutos e quadro 55" e "Hidráulica — trechos 1".
