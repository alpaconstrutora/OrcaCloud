# Gaveta "Gerar pelo modelo" no design padrão do app

## Pedido original
> A gaveta (Gerar pelo modelo) nao esta no design padrao do app

Sessão c7448b3f · 19/10/2026 (print da gaveta de um contrato: aviso de marcadores sem mapeamento em
fundo rosado com texto amarelo, título "Pré-visualização" quase invisível, lista de marcadores em
caixa de borda escura e SEM os valores resolvidos)

## Causa (reproduzida, não suposta)
O app não tem tema escuro e não declara `@custom-variant dark` — então, no Tailwind v4, `dark:` segue
o **modo escuro do sistema operacional** (`prefers-color-scheme`). `components/EmitDocumentModal.tsx`
tem 10 classes `dark:` (`dark:text-white`, `dark:text-gray-200`, `dark:bg-amber-900/20`,
`dark:text-amber-300`, `dark:divide-gray-700/50`, `dark:border-gray-700`…) sobre uma gaveta BRANCA.

Reproduzido no site publicado com o Chrome simulando o sistema em modo escuro (mesmo contrato, mesma
gaveta do print):

| sistema em… | valor resolvido do campo | resultado |
|---|---|---|
| claro | `oklch(0.21 …)` (escuro) | gaveta legível |
| **escuro** | **`rgb(255,255,255)` — branco sobre branco** | valores INVISÍVEIS, aviso rosado/amarelo, título apagado, bordas escuras = o print |

Fora a causa, a gaveta (mesmo no modo claro) ainda destoa do guia: a pré-visualização é uma lista de
`div` à mão (não tabela §6.9), com `font-mono` e cinza-claro `text-gray-400` (§7/§32), caixa de 256 px
rolando dentro da gaveta, `rounded-lg` (8 px) em vez de `rounded-[10px]` (§16), "Cancelar" como botão
`ghost` de 44 px entre botões de 36 px (§17), botões desligados sem dizer o motivo, e o seletor de
Modelo espremido em meia largura com nomes longos.

## Decisões
| Data | Pergunta | Resposta |
|---|---|---|
| 19/10/2026 | Tirar só o `dark:` do componente ou ligar a trava global (`@custom-variant dark` por classe)? | **Só o componente** (escopo do pedido). Os outros 9 componentes com `dark:` ficam como estão e entram como achado — mudar o global muda 9 telas que o usuário não citou. |

## Andamento
- [x] 1. `EmitDocumentModal`: sem `dark:` (10 classes → 0)
- [x] 2. Pré-visualização em tabela (§6.9): Marcador · Campo do sistema · Valor, valor `text-gray-900`, vazio `text-red-600`, sem `font-mono`
- [x] 3. Avisos `rounded-[10px]`, campos em coluna única (§30), "Cancelar" `secondary` h-9 (§17), estado vazio §12
- [x] 4. Botões desligados dizem o motivo ("Escolha um modelo…" / "Gerando…") no `title` do wrapper
- [x] 5. Teste novo `EmitDocumentModalPadrao.test.tsx` (4 testes, os 4 FALHAM no código antigo e passam no novo) + guia §33
- [ ] 6. Verificação — 4 de 5:
  - [x] Chrome, contrato 010 (Alpa), só leitura: ANTES (site publicado, sistema escuro) valor com luminância 255 = branco sobre branco; DEPOIS (código novo) 19 = escuro, IGUAL nos modos claro e escuro do sistema; 0 erros de JS/HTTP. Capturas dos dois modos idênticas.
  - [x] `check-ui-standard.sh` exit 0; tipos de `EmitDocumentModal` + `ContractDetailView` + `DealModal` + teste exit 0 (2ª tentativa; a 1ª caiu por segfault da máquina).
  - [x] Testes da gaveta (14: os 4 novos + `GerarPeloModeloVersaoPdf` + `ContractEmissaoDocumentoUnico`) passam.
  - [ ] Suíte inteira e CI em Linux.
  - [x] Servidor local derrubado.

## Plano

### 1. Sem `dark:` em `components/EmitDocumentModal.tsx`
- **O que muda:** as 10 classes `dark:` saem; cada cor passa a ser a do tema claro, que é o único do app.
- **Pronto quando:** `grep "dark:" components/EmitDocumentModal.tsx` vazio; na tela, com o sistema em modo escuro, a gaveta fica idêntica à do modo claro.

### 2. Pré-visualização em tabela (§6.9 — tabela dentro de `Sheet`)
- **O que muda:** a lista de `div` vira `<table>` com Marcador · Campo do sistema · Valor; cabeçalho em
  sentence case com fundo branco (§6.2/§6.11), `px-3 py-2.5 border-r border-gray-100` (§6.9/§7.2),
  tipografia `text-sm font-normal` (§7); marcador sem `font-mono` (proibido em `<td>`), campo do sistema
  em `text-gray-600` (não `gray-400`), valor em `text-gray-900`, "(vazio…)" em `text-red-600`. Contêiner
  `rounded-[10px] border`, rolagem própria com cabeçalho fixo (§6.5) em `max-h-[50vh]`.
- **Pronto quando:** na tela, os 3 valores por linha aparecem legíveis nos dois modos do sistema.

### 3. Avisos, campos, rodapé e estado vazio
- Avisos e erro: `rounded-[10px]`, `text-sm`; campos: `gap-y-4` e Modelo/Cliente em coluna única (o nome
  do modelo é longo e truncava — §30); painel `px-6 py-6 space-y-6` (§30).
- Rodapé: "Cancelar" vira `Button variant="secondary"` (h-9, §17), como nas outras gavetas.
- Estado vazio (nenhum modelo): ícone 48 px + título + frase (§12), no lugar do texto cinza miúdo.

### 4. Botão desligado diz o motivo
- "Baixar .docx" e "Gerar versão (PDF)" ficavam desligados em silêncio quando não há modelo escolhido ou
  durante a geração: `title` no `<span>` que envolve o botão ("Escolha um modelo…" / "Gerando…").

### 5. Testes e guia
- Teste novo `__tests__/components/EmitDocumentModalPadrao.test.tsx` (sem `dark:`; tabela com os 3
  cabeçalhos; botões desligados com motivo; vazio com título). Falha com o código atual.
- Guia: seção nova **§33 — O app não tem tema escuro: nada de `dark:`** (a regra e o porquê).

### 6. Verificação
- Playwright no app local, `colorScheme: dark` e `light`: medir a cor do valor resolvido e do aviso nos
  dois e fotografar; `check-ui-standard.sh`; tipos; suíte; CI do PR.

## Achado fora do escopo
Mais 9 componentes têm `dark:` e sofrem do mesmo defeito para quem usa o sistema em modo escuro:
`services/ServicesOpportunityDetail` (63), `ServicesProposal` (28), `ServicesVisit` (23), `ServicesBudget` (23),
`BIReportScheduler` (16), `ServicesPipelineConfigModal` (15), `ServicesWonModal` (14),
`ServicesOpportunityModal` (11), `ServicesEngineeringPicker` (10). A correção estrutural é uma linha em
`index.css` (`@custom-variant dark (&:where(.dark, .dark *))`), que desligaria todos de uma vez — decisão
do usuário, porque mexe nessas 9 telas.
