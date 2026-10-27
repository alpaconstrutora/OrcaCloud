---
name: Portal do Colaborador
description: Portal do colaborador de obra no celular — a marca da empresa dele, a paleta Alpa e o holerite como tela de abertura.
colors:
  alpa-orange: "#FF884C"
  orange-ink: "#A84A1C"
  graphite: "#4B4B4D"
  graphite-hover: "#3A3A3C"
  graphite-active: "#2F2F31"
  slate-secondary: "#566375"
  offwhite-ground: "#EDEDE8"
  card-white: "#FFFFFF"
  row-hover: "#F7F7F4"
  alpa-slate-blue: "#808EA1"
  espera-fill: "#CCD2D9"
  alerta-fill: "#FFE7DB"
typography:
  hero-value:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
  body-strong:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
  nav-label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.01em"
rounded:
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    height: "48px"
    typography: "{typography.body-strong}"
  button-primary-hover:
    backgroundColor: "{colors.graphite-hover}"
  button-primary-active:
    backgroundColor: "{colors.graphite-active}"
  button-text-orange:
    textColor: "{colors.orange-ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 12px"
  button-eye:
    textColor: "{colors.graphite}"
    rounded: "{rounded.full}"
    size: "44px"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "12px"
  card-hero:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.xl}"
    padding: "20px"
  list-row:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "64px"
  list-row-hover:
    backgroundColor: "{colors.row-hover}"
  nav-pill-active:
    backgroundColor: "{colors.alpa-orange}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.full}"
    width: "48px"
    height: "28px"
  status-ok:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  status-espera:
    backgroundColor: "{colors.espera-fill}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  status-alerta:
    backgroundColor: "{colors.alerta-fill}"
    textColor: "{colors.orange-ink}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  status-recusado:
    backgroundColor: "{colors.orange-ink}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  status-neutro:
    backgroundColor: "{colors.offwhite-ground}"
    textColor: "{colors.slate-secondary}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Portal do Colaborador

> **Escopo.** Este arquivo documenta SÓ o mundo do **Portal do Colaborador** — o portal externo, no celular, do colaborador de obra (`PortalView` e `components/portalColaborador/PortalMarca.tsx`). A marca aqui é a **logo da organização do colaborador** (`organizations.logo_url`, ou o nome dela) com a **paleta Alpa**. O sistema visual do resto da ÒPURA (acento azul, neutros cinza, Tailwind padrão, telas do RH como Gestão de Acessos e Prévia) vive em `docs/ui_ux_guia_unificado.md` e **não** é descrito nem alterado aqui.

## Overview

**Creative North Star: "O contracheque no bolso"**

O portal abre no dinheiro do colaborador: o último holerite é a tela, não um atalho. É uma coluna de celular (até 448px) sobre um chão off-white quente, com cartões brancos de cantos largos — o mesmo arredondado generoso do símbolo da Alpa — e texto grafite. O laranja Alpa aparece pouco e só como preenchimento: a faixa no topo do cartão do holerite e a pílula do item ativo do rodapé. Tudo o mais é grafite, cinza-azulado e branco.

A densidade é baixa e o toque é grosso: alvos de 44px ou mais, linhas de lista de 64px, botão principal de 48px. O público lê ao sol e perto de colegas, então o contraste de texto é sempre ≥ 4,5:1 e o valor em reais fica escondido até a pessoa pedir. A profundidade é quase plana: uma sombra de 1px quente em todo cartão, e uma sombra ambiente maior só no cartão do holerite.

Rejeições confirmadas pela direção: cabeçalho-dashboard de indicadores coloridos, degradê, glass, índigo e abas no topo.

**Key Characteristics:**
- Logo da empresa do colaborador no cabeçalho branco (altura fixa 48px, largura livre); sem logo, o nome da empresa em texto.
- Chão `offwhite-ground`, cartões brancos, texto grafite.
- Laranja Alpa só preenche; texto em laranja é sempre `orange-ink`.
- Rodapé fixo de cinco itens com pílula laranja no ativo.
- Valor escondido por padrão; revelado com um desfoque curto que assenta.
- Status por selos com texto, cor só reforça.

## Colors

Paleta Alpa quente e contida: grafite carrega o texto e a ação, o laranja marca presença em poucas áreas preenchidas, o cinza-azulado e o off-white fazem o resto.

### Primary
- **Laranja Alpa** (alpa-orange): só preenchimento — faixa de 8px no topo do cartão do último holerite, pílula do item ativo do rodapé, barra de progresso dos cursos da Academia. Dá 2,37:1 sobre branco: nunca é cor de texto nem de ícone que precise ser lido.
- **Laranja-tinta** (orange-ink): o laranja que pode ser lido (5,74:1 sobre branco). Texto "Sair", código de NR, chamada "Começar/Continuar", validade vencida, ícone de alerta, ponto de aviso no rodapé, anel de foco e o selo `recusado`.

### Secondary
- **Cinza-azulado Alpa** (alpa-slate-blue): cor da marca usada só como preenchimento decorativo (ícone do estado vazio, acompanhado de texto). A 40% sobre branco vira `espera-fill`, fundo do selo `espera`, com texto grafite a 5,7:1.

### Neutral
- **Grafite** (graphite): todo texto principal (8,70:1 sobre branco; 7,41:1 sobre o chão) e o fundo do botão primário e do selo `ok`. Escurece para `graphite-hover` e `graphite-active` ao passar e pressionar.
- **Cinza secundário** (slate-secondary): subtítulos, legendas, rótulos de seção ("Anteriores", "Histórico"), ícones e rótulos inativos do rodapé (6,11:1 sobre branco; 5,20:1 sobre o chão).
- **Off-white** (offwhite-ground): o chão da tela inteira, inclusive as bordas que sobram no computador; fundo dos botões fantasmas ao passar; trilho da barra de progresso; fundo do selo `neutro`.
- **Branco** (card-white): cabeçalho, rodapé e todo cartão.
- **Branco-quente** (row-hover): fundo de linha/cartão clicável ao passar.
- **Fio** (grafite a 10%): borda inferior do cabeçalho e superior do rodapé, única linha divisória do mundo.

### Status
| Tom | Fundo | Texto | Contraste |
|---|---|---|---|
| ok | graphite | branco | 8,70:1 |
| espera | espera-fill | graphite | 5,7:1 |
| alerta | alerta-fill | orange-ink | 4,84:1 |
| recusado | orange-ink | branco | 5,74:1 |
| neutro | offwhite-ground | slate-secondary | 5,20:1 |

### Exceção: moldura da prévia do RH
A faixa "Prévia · vendo como {nome}" e o aviso "Na prévia os cursos não abrem" usam âmbar do Tailwind (fundo amber-50, borda amber-200, texto amber-900). É moldura do RH, não do colaborador: nunca aparece no link real e **não faz parte da paleta**. Não usar âmbar em nenhuma superfície do colaborador.

### Named Rules
**The Fill-Only Orange Rule.** `alpa-orange` só preenche áreas; qualquer laranja que precise ser lido (texto, ícone, ponto, foco) é `orange-ink`.

**The Text-Says-It Rule.** Status sempre com rótulo escrito; a cor do selo só reforça. Cada tom tem matiz próprio para que "em análise", "aprovado" e "vencendo" não virem três cinzas iguais.

## Typography

**Provisório.** Faces e pesos serão definidos no item 5 do plano; o que segue é o que o código usa hoje, não uma decisão.

**Body Font:** Inter (herdada do app; fallback system-ui, -apple-system, sans-serif)

**Character:** sem-serifa neutra, números tabulares no valor em reais.

### Hierarchy
- **Hero value** (700, 30px): o líquido a receber no cartão do último holerite.
- **Title** (700, 20px, leading justo): nome do colaborador no cabeçalho e "Último holerite · {Mês de AAAA}".
- **Body strong** (600, 16px): competência nas linhas de holerite, rótulo do botão primário.
- **Body** (400–600, 14px): textos, legendas, rótulos de seção em 600 `slate-secondary`.
- **Label** (600, 12px): selos de status; legendas de linha em 400.
- **Nav label** (500, 11px, -0.01em, sem quebra): rótulo do rodapé; mesmo peso ativo e inativo para "Treinamentos" não cortar em 360px.

## Layout

Coluna única de celular, `max-width` 448px centrada, chão off-white ocupando a viewport inteira (`100dvh`); no computador sobra chão dos lados. Estrutura fixa: cabeçalho branco (20px laterais) → conteúdo com 16px de respiro → rodapé fixo no fundo com área segura do iPhone.

Ritmo: 12px entre cartões de lista e seções de abas; 20px entre o cartão do holerite e "Anteriores"; 20px de respiro interno no cartão grande, 12px nos cartões de lista. Rótulos de seção recuados 4px do cartão.

O rodapé distribui cinco colunas do tamanho do rótulo (não cinco iguais), para "Documentos" e "Treinamentos" caberem em 360px.

## Elevation & Depth

Quase plano, com sombra quente tingida de grafite (nunca preta). Todo cartão tem um traço de 1px; só o cartão do último holerite ganha profundidade ambiente, porque é a tela.

### Shadow Vocabulary
- **Traço de cartão** (`box-shadow: 0 1px 2px rgba(75,75,77,0.08)`): todo cartão, linha de lista, aviso e erro.
- **Cartão herói** (`box-shadow: 0 1px 2px rgba(75,75,77,0.08), 0 12px 32px -16px rgba(75,75,77,0.35)`): só o cartão do último holerite.

### Named Rules
**The One Lift Rule.** Uma única superfície por tela recebe a sombra ambiente: o cartão do último holerite.

## Shapes

Cantos largos e macios, eco dos retângulos arredondados do símbolo Alpa. 24px no cartão herói; 16px em cartões, linhas, avisos e no botão primário; 12px em botões de texto; pílula (`full`) no selo, no item ativo do rodapé, no botão do olho e nas barras de progresso. Nenhuma borda em cartão: a separação vem do chão off-white e do traço de sombra.

## Components

### Buttons
- **Primário:** grafite sólido, texto branco 16px/600, altura 48px, canto 16px, largura total no cartão. Escurece em dois passos ao passar/pressionar.
- **Texto laranja ("Sair"):** `orange-ink` com ícone, 44px de alto, fundo off-white ao passar.
- **Olho:** círculo de 44px, ícone grafite 20px, `aria-pressed`, fundo off-white ao passar.
- **Foco (todos):** anel de 2px `orange-ink` com 2px de afastamento; sem contorno nativo.

### Cards / Containers
- **Cartão herói (último holerite):** branco, canto 24px, faixa laranja de 8px no topo, 20px de respiro, sombra herói. Título, tipo da folha, "Líquido a receber", valor + olho, botão primário.
- **Cartão de lista:** branco, canto 16px, 12px de respiro, traço de sombra. Esquerda: título 14px/700 grafite + legenda 12px `slate-secondary`; direita: número + selo.
- **Linha de holerite:** como o cartão de lista, mas é botão inteiro, mínimo 64px, chevron `slate-secondary`, `row-hover` ao passar.

### Chips (selos de status)
- **Style:** pílula, 12px/600, 2px × 8px, com o par fundo/texto da tabela de Status.

### Navigation
- **Rodapé fixo** branco com fio superior, cinco itens (Holerites · Ponto · Férias · Documentos · Treinamentos), ícone 20px sobre rótulo 11px. Ativo: pílula `alpa-orange` 48×28px atrás do ícone, ícone e rótulo grafite, `aria-current="page"`. Inativo: `slate-secondary`. Aviso: ponto `orange-ink` de 10px com anel da cor do fundo (branco, ou laranja no ativo) e texto só para leitor de tela.

### Cabeçalho
- Branco, logo da empresa 48px de altura à esquerda (até 62% da largura), "Sair" à direita só no link real; abaixo, nome (20px/700) e "cargo · desde dd/mm/aaaa" em `slate-secondary`. Logo que falha cai para o nome da empresa em texto, até duas linhas.

### Estados de leitura (carregando / erro / vazio)
- **Carregando:** indicador girando + "Carregando {o quê}..." em `slate-secondary`.
- **Erro:** cartão branco com ícone `orange-ink`, título grafite, mensagem e "Tentar de novo" em largura total.
- **Vazio:** ícone 32px `alpa-slate-blue`, título grafite, dica em `slate-secondary`.

### Valor em reais (interação-assinatura)
Escondido por padrão como "R$ ••••" (o valor não vai para o DOM; leitor de tela ouve "Valor escondido"). Ao revelar, o número assenta de `blur(6px)` e opacidade 0,4 para nítido em 300ms ease-out; sem movimento com `prefers-reduced-motion`. A escolha fica gravada no aparelho.

## Do's and Don'ts

### Do:
- **Do** usar `alpa-orange` só como preenchimento (faixa do cartão herói, pílula do rodapé, barra de progresso).
- **Do** usar `orange-ink` para todo laranja legível: texto, ícone de alerta, ponto de aviso, anel de foco.
- **Do** manter texto em `graphite` ou `slate-secondary`; nada de texto abaixo de 4,5:1.
- **Do** dar a todo alvo de toque no mínimo 44px; linhas de lista 64px; botão primário 48px.
- **Do** escrever o status no selo; a cor só reforça.
- **Do** esconder valores em reais por padrão e revelar só a pedido.
- **Do** usar a logo da organização do colaborador, nunca a da ÒPURA, no cabeçalho.

### Don't:
- **Don't** usar `alpa-orange` como cor de texto ou de ícone que precise ser lido (2,37:1).
- **Don't** usar degradê, glass, índigo nem o azul de acento do app principal neste portal.
- **Don't** pôr indicadores coloridos ou abas no topo; os números moram na aba a que se referem e o rodapé acende um ponto.
- **Don't** usar cores do Tailwind (slate, amber, emerald, rosa) em superfícies do colaborador; o âmbar existe só na moldura da prévia do RH.
- **Don't** usar sombra preta; a sombra é grafite translúcido.
