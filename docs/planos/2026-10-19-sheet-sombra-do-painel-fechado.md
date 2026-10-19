# Painel lateral fechado: a sombra vaza sobre a barra de rolagem

## Pedido original
> veja print, na lateral direita, parece que existe uma camada cinza em cima da barra de rolagem

Sessão c7448b3f · 19/10/2026 (print da aba Financeiro › Parcelas de um contrato, com um degradê escuro
ao longo de toda a borda direita da janela, por cima da barra de rolagem do app)

## Causa (medida, não suposta)
Medido no Chrome real (1600×1000, dpr 2) com `elementsFromPoint` e `getComputedStyle`:

- nenhum elemento fica por cima da borda — o primeiro elemento em x = largura−2 é o próprio `<main>`;
- o culpado é a **sombra** de um painel lateral FECHADO: `components/ui/sheet.tsx` esconde o painel só
  com `translate-x` (rect `left=1616`, 16 px além da borda), mas ele mantém `shadow-2xl`
  (`0 25px 50px -12px rgb(0 0 0 / .25)`). O desfoque de 50 px vaza ~20 px para DENTRO da tela, e o
  wrapper do Sheet é `fixed inset-0` com z-50 — a sombra é pintada por cima de tudo, inclusive da
  barra de rolagem do `<main>` (8 px, `scrollbar-gutter: stable`);
- cada `Sheet` montado fechado soma a sua sombra. Uma tela de contrato monta vários (retenção,
  garantia, penalidade, matrizes…), por isso no print o degradê é bem mais escuro que numa tela
  com um só.

O defeito nasceu com o painel solto (§26, 04/09/2026): antes o painel fechado ficava colado na
borda (`translate-x-full`), e a sombra saía junto.

## Decisões
| Data | Pergunta | Resposta |
|---|---|---|
| 19/10/2026 | Corrigir só o `Sheet`? | Não: o `OfficesAI` (painel feito à mão, citado no §26) tem o mesmo padrão e o mesmo vazamento — corrigido junto. |

## Andamento
- [x] 1. `Sheet`: sombra só com o painel aberto (`shadow-2xl` ↔ `shadow-none`, transição em `transform` + `box-shadow`)
- [x] 2. `OfficesAI`: idem
- [x] 3. Teste de regressão — `__tests__/components/SheetSombraFechado.test.tsx`: 3 dos 4 testes FALHAM com o código antigo (o 4º, "aberto mantém a sombra", já passava) e os 4 passam com o novo
- [x] 4. Guia §26 — nova subseção "Painel fechado NÃO projeta sombra"
- [ ] 5. Verificação — 4 de 5:
  - [x] Chrome real, tela de contrato (a do print): 13 painéis fechados montados; ANTES os 13 projetavam sombra e o canal vermelho da borda caía de 255 para 183; DEPOIS nenhum projeta e a borda fica lisa em 249 (= fundo). Lista de contratos: 246→231 antes, 249 liso depois.
  - [x] `check-ui-standard.sh` exit 0 em `sheet.tsx` e `OfficesAI.tsx`; tipos dos arquivos tocados exit 0.
  - [ ] Suíte inteira (rodando) e CI em Linux.
  - [x] Servidores locais derrubados.

## Plano

### 1. `components/ui/sheet.tsx`
- **O que muda:** `shadow-2xl` sai da lista fixa de classes e vira condicional: `open ? 'shadow-2xl' : 'shadow-none'`.
  `transition-transform` vira `transition-[transform,box-shadow]`, para a sombra sumir junto com o
  deslizar de saída (300 ms) em vez de estalar.
- **Pronto quando:** no navegador, todo painel fechado tem `box-shadow: none` e a borda direita volta a
  ficar lisa.

### 2. `components/OfficesAI.tsx`
- **O que muda:** mesma troca no painel do assistente.
- **Pronto quando:** idem.

### 3. Teste
- **Arquivo novo:** `__tests__/components/SheetSombraFechado.test.tsx` — painel fechado sem `shadow-2xl`
  (com `shadow-none`), aberto com `shadow-2xl`, e a transição cobrindo `box-shadow`.
- **Pronto quando:** falha com o `sheet.tsx` antigo e passa com o novo.

### 4. `docs/ui_ux_guia_unificado.md` §26
- **O que muda:** nota curta — painel fechado não projeta sombra; vale também para o painel feito à mão.

### 5. Verificação
- Medir na tela (contrato aberto): `box-shadow` dos painéis fechados e o recorte da borda direita,
  antes × depois; `check-ui-standard.sh`, tipos e suíte.
