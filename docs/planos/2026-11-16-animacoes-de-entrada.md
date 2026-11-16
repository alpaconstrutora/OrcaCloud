# Animações de entrada do app (`animate-in` e companheiras) passam a valer

## Pedido original

> Corrija  pendência

Sessão `21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0`, 16/11/2026, ~17h. A pendência é a que eu tinha
registrado ao terminar o movimento do Portal do Investidor (guia §24.2), nas palavras da mensagem
anterior: *"cerca de 437 usos, no resto do app, de classes de animação que não têm efeito nenhum"*.

## Diagnóstico

- `animate-in`, `fade-in`, `zoom-in-95`, `slide-in-from-*` são classes do plugin de animação
  (`tailwindcss-animate` no v3; `tw-animate-css` no Tailwind v4). O `index.css` só tinha
  `@import "tailwindcss"` — sem plugin, nenhuma regra é gerada, e o build não reclama de classe
  desconhecida. Conferido no CSS de produção em 16/11: zero regras.
- Recenseamento (fora de testes e docs): **436 `animate-in`**, todas de **entrada** (nenhum
  `animate-out`, nenhuma variante `data-[state]`). 153 `slide-in-from-bottom-4`, 57 `zoom-in-95`,
  24 `slide-in-from-top-2`; durações 300 ms (201), 200 ms (112), 500 ms (86), 700 ms (15).
- Achados no caminho: 12 `zoom-in` **sem número** (escala 0 — o modal cresceria do nada) e três
  classes inventadas que não existem em lugar nenhum: `animate-fade-in` (3), `animate-slide-up` (1),
  `animate-pulse-subtle` (1).
- Risco ao ligar: o html2canvas 1.4 fotografa uma cópia do documento onde as animações recomeçam e lê
  o estilo **antes** de zerá-las (`ElementContainer`) — um `fade-in` dentro da área capturada sairia
  transparente no PDF.

## Itens

- [x] **`package.json`** — `tw-animate-css@^1.4.0` (MIT, só CSS, sem script de instalação) e
  `@tailwindcss/node@4.3.0` em devDependencies (o teste compila com ele; antes só vinha como
  dependência do plugin do Vite). *Pronto quando:* `npm ci` instala e o teste importa.
- [x] **`index.css`** — `@import "tw-animate-css"` + bloco `prefers-reduced-motion: reduce` que zera
  deslocamento/escala da `.animate-in` (fica só o esmaecimento). *Pronto quando:* o CSS do build traz
  `.animate-in{`, `@keyframes enter`, `.zoom-in-95{`, `.slide-in-from-bottom-4{` e o bloco de menos
  movimento (conferido: 1 de cada em `dist/assets/index-*.css`).
- [x] **`utils/html2canvasCores.ts`** — `coresCompativeisNaCopia` injeta na cópia
  `*, *::before, *::after { animation: none !important; }` (uma vez). *Pronto quando:*
  `__tests__/html2canvasCopiaSemAnimacao.test.ts` verde (vermelho antes).
- [x] **12 `zoom-in` → `zoom-in-95`** (MaterialModal, OrderReceiptModal, OrganizationUsers ×3,
  PayrollEventModal, RentalsModule, SalesModule, BaselineModal, ConfigModal, CrewClassificationModal,
  OutlineRowMenu). *Pronto quando:* o teste "zoom-in sem número" acha zero.
- [x] **Classes inventadas** — `animate-fade-in` → `animate-in fade-in duration-300` (AssetImportModal,
  DataTablePrototype, ImovibDetailView); `animate-slide-up` → `animate-in fade-in
  slide-in-from-bottom-4 duration-300` (PWAInstallPrompt, igual aos avisos do pé); `animate-pulse-subtle`
  removida (OrderLifeline: o marcador da etapa atual sempre foi parado; laço para destacar estado não
  entra). *Pronto quando:* o teste "toda classe da família gera regra" acha zero sem regra.
- [x] **Trava** — `__tests__/animacoesDeEntrada.test.ts`: compila o `index.css` com
  `@tailwindcss/node` e exige regra para toda classe `animate-*`/`fade-in*`/`zoom-in*`/`slide-in-from-*`
  usada no código; confere a animação `enter`, o bloco de menos movimento e zero `zoom-in` puro.
  *Pronto quando:* vermelho sem o import (25 classes sem regra), verde com ele.
- [x] **Guia** — §35 nova (vocabulário, duração, menos movimento, `fixed` dentro de quem anima, PDF);
  itens nos dois checklists; nota do §24.2 deixa de ser pendência. *Pronto quando:* a seção existe e o
  §24.2 aponta para ela.
- [x] **Navegador** — com o CSS de produção do build, no Chromium: modal a 60 ms com opacidade 0,58 e
  escala 0,979 → 1 / `transform: none`; conteúdo de aba sobe 13,6 px → 0; aviso centralizado com
  `-translate-x-1/2` fica em x = 640 (centro de 1280) do começo ao fim; menos movimento = matriz
  identidade, só esmaece. No app (visão do investidor pelo link, `vite preview` do build): o esqueleto
  de carregamento esmaece 0 → 0,22 → 0,58 (`enter`, 0,3 s); depois de carregar, nenhum elemento preso;
  0 erros de console.
- [ ] **Produção** — PR, CI verde, merge, `conferir-producao.sh` com texto novo do bundle.

## Fora do escopo (registrado, não feito)

- Durações de 500/700 ms em conteúdo de aba ficaram como os autores escreveram (o guia pede
  200–300 ms para código novo; reduzir as existentes seria varredura sem pedido).
