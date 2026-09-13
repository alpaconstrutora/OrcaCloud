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
| F2 | ⏳ | — |
| F3 | ⏳ | — |
| F4 | ⏳ | — |
