# Diário de Obras mobile — ocupar a tela de um celular de verdade

## Pedido original

Sessão de 14/10/2026.

> availe: operacional > diario de obra > versao mobile

A avaliação listou, como item 3 (grave): *"Num celular de verdade, o app abre
dentro do layout normal do sistema"* — dentro do `<main className="p-4">` com o
cabeçalho do sistema por cima, com `h-screen`: mais alto que a tela, rolagem
dupla, barra inferior/FAB fora do visível, `100vh` do iOS escondendo o rodapé,
sem área segura, e uma barra de status falsa (hora congelada, bateria 70%) sob a
barra real do telefone. Itens 1 e 2 foram feitos antes no mesmo dia. Pedido:

> Item 3

## Itens — 3 de 3 concluídos em 14/10/2026

### 1. ✅ `DiaryMobileApp` com dois modos
- `previa` (só dentro do `MobilePreviewFrame`): como era — `h-screen` do iframe
  e barra de status falsa (a moldura desenha o notch por cima dos 24px do topo).
- celular: fica DENTRO do Layout (o cabeçalho com menu e seletor de organização
  — REGRA #5 — continua valendo) e ocupa o `<main>` inteiro, anulando o gutter
  §20.2 (`-m-4 md:-m-6`, altura `calc(100% + 2rem|3rem)`); sem barra falsa.
- rodapés (navegação, folha, confirmação), FAB e toast somam
  `env(safe-area-inset-bottom)` (vale 0 no iframe).

**Pronto quando:** harness no formato do Layout, 390×664: app em top 60,
largura toda, barra inferior no fundo, `main` sem rolar, sem relógio falso.

### 2. ✅ Layout: altura visível da tela
Casca `h-screen supports-[height:100dvh]:h-dvh`. No celular `100vh` é a altura
com a barra do navegador recolhida; com ela à vista o fundo de qualquer tela
fica escondido. Navegador sem `dvh` continua com `h-screen`.

**Pronto quando:** o CSS do build traz `@supports (height:100dvh)`; desktop
inalterado (`dvh` = `vh` sem barra dinâmica).

### 3. ✅ Verificação
Ver abaixo.

## Como foi verificado (14/10/2026)

- Harness isolado (`__ui_harness.*`, apagado antes do commit) com a MESMA
  estrutura do Layout no celular (casca, cabeçalho 60px, `main` `p-4 md:p-6`,
  invólucro `h-full` de App.tsx) + Playwright `isMobile/hasTouch`, PostgREST stub.
  As duas direções, cada uma com servidor novo e cache do vite apagado:
  - **com a correção: 16/16** — top 60, left 0/right 390, barra inferior em 664
    de 664, `main` 604/604, página sem rolar, 0 relógio; FAB acima da barra;
    folha com título a 72px e "Salvar registro" terminando em 652; deitado
    (844×390, gutter de 24px) o app ocupa o `main` e a barra fica em 390; prévia
    mantém 1 relógio (2 com a folha aberta) e a barra no fundo.
  - **sem a correção: 8/16** — top 76, left 16/right 374, barra inferior em
    **740 numa tela de 664**, `main` 680/604 (rolagem dupla), relógio falso,
    "Salvar registro" em 724 (fora da tela), deitado top 8/left 24.
  - PNGs conferidos (antes: gutter + relógio falso + barra cortada; depois: app
    encostado no cabeçalho e no fundo).
- `tsc` 0 erros; `orgContextGuard` + `diaryPlanningLink` 29/29;
  `check-ui-standard.sh` 0 violação nos 4 arquivos; `check-org-selector-guard.sh`
  ok; `vite build` ✓ e as classes novas presentes no CSS gerado.
- **Não visto num aparelho físico.** A área segura (`env()`) não se simula no
  Chromium — vale 0 no teste.

## Fora deste plano
`TasksMobileApp` (Minhas Tarefas) tem o mesmo arranjo e o mesmo defeito; o
`h-dvh` do Layout já ajuda ela, o resto não foi tocado.
