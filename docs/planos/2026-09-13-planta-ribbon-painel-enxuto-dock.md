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

**F4 — prova**: teste com duas paredes selecionadas pela lista de vãos (aba
aparece, não é auto-selecionada, "2 selecionados", sem Dividir/Unir, Excluir
esvazia e a aba some); app real com escritas bloqueadas: Parede 1 selecionada →
Modificar com Copiar, Excluir, Dividir, Unir.
