# Orçamento Analítico: menu e botões iguais aos da Planta Inteligente

## Pedido original

> engenharia > orçamentos: implemente menu e botões como foi implementado em incorporação >planta inteligente

Sessão: 839d9a9b-e851-4794-a7e3-3ae07ef79ea3 · 21/11/2026. Anexo: print do editor do
Planejamento (Gantt), que recebeu o mesmo pedido em 16/11/2026 (PR #498).

## Contexto

O Orçamento Analítico (`components/BudgetEditor.tsx`, view `analytic`) tinha:

- uma linha de título "Orçamento Analítico" + nome/base de preço, com os KPIs (Preço Final,
  Custo Direto, BDI) e o ícone de pendências técnicas à direita (§20.4);
- uma barra com BDI global, os menus **Exibir ▾ · Versões ▾ · Ferramentas ▾ · Gerenciar
  EAP ▾** e o botão **Novo Grupo** (§5.3);
- na régua da tabela: busca, filtro de grupo, ordem dos grupos, Expandir/Recolher e ajustar
  largura.

A Planta Inteligente e o Planejamento usam o ribbon (§19.5): voltar dentro da faixa, abas de
comandos, acesso rápido em grupos arrastáveis, faixa recolhível, tela cheia.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 21/11 | Título e KPIs: tirar o título e pôr os KPIs no ribbon, ou manter a linha do título? | **KPIs no ribbon** (título fica só para leitor de tela) |
| 21/11 | Abas: 4 (Estrutura · Orçamento · Análise · Vista) ou 3 (sem Análise)? | **4 abas** |

Decisões minhas, registradas:

- O **ajuste de largura** das colunas fica na régua da tabela, não na aba Vista: o §6.1.2
  manda o autofit morar na régua.
- **Nome e base de preço** (o antigo subtítulo, pedido da 2ª crítica) vão para a `cauda` do
  acesso rápido — onde a Planta mostra as contagens — e para o `title` do Preço Final.
- O grupo da aba Estrutura com Importar/Exportar se chama "Importar e exportar", para não
  repetir o nome do grupo "Arquivo" do acesso rápido (dois `role=group` iguais).
- Comportamento de trava do orçamento **fechado** não mudou: só o BDI trava, como antes.

## Arranjo

```
[←] Estrutura Orçamento Análise Vista [^]   [Fechado][v3·…] Preço Final R$… Custo Direto R$… BDI +R$… [📋1][+ Novo grupo]
⋮ ⇕ ⇳ │⋮ ▦ ABC ⚖ 📋 │⋮ ⤒ ⤓ ⤢                                   Garden · SINAPI 10/2026 · MG · sem desoneração
[Expandir][Recolher] │ [Modelos de EAP] │ [Importar EAP][Exportar EAP] │ [Limpar toda EAP]
┌ card da tabela: [busca][grupo ▾][ordem ▾][↔]
```

## Plano

1. **`components/BudgetRibbon.tsx`** (novo) — o cromo inteiro: `Ribbon`, `AcessoRapido`,
   `BotaoDoRibbon`, `BotaoDoAcessoRapido` de `blueprint/`; preferências em
   `orcamento:abaDoRibbon`, `orcamento:ribbonRecolhido`, `orcamento:ordemDoAcessoRapido`.
   Só desenho e cliques; estado e handlers vêm do editor.
   *Pronto quando:* as 4 abas, os 3 grupos do acesso rápido, KPIs/pendências/Novo grupo no
   slot `direita` aparecem e chamam os handlers (testes do item 5).
2. **`components/BudgetEditor.tsx`** — sai a linha de título/KPIs, a barra de menus com seus
   estados/refs/efeito de foco/Esc, e o Expandir/Recolher da régua; entra `<BudgetRibbon>`,
   a prop `onBack` e a tela cheia (`useTelaCheia`, raiz `fixed inset-0 z-40`).
   *Pronto quando:* `tsc` limpo e os testes do editor verdes.
3. **`components/AppRouter.tsx`** — `onBack={() => setActiveView('eng-orcamentos')}` no
   `case 'analytic'`. *Pronto quando:* o ← volta para a lista na tela de verdade.
4. **`components/ui/KpiCard.tsx`** — `size="xs"`: linha única h-9 para faixa de ferramentas.
   *Pronto quando:* `KpiCardXs.test.tsx` verde.
5. **Testes** — `BudgetEditor.test.tsx` (cromo, abas, acesso rápido, recolher, voltar, tela
   cheia, BDI/fechado, teclado das abas, Limpar EAP), `BudgetEditorTable.test.tsx` (régua sem
   Expandir/Recolher; comandos fora do card), `KpiCardXs.test.tsx`.
6. **Guia** — §4.6 (KPI `xs`), §19.5 (terceiro editor com ribbon), §20.4 (superada no
   Orçamento).

## Estado

- [x] 1. BudgetRibbon
- [x] 2. BudgetEditor
- [x] 3. AppRouter
- [x] 4. KpiCard xs
- [x] 5. Testes
- [x] 6. Guia
- [x] Conferência na tela de verdade (Playwright só leitura, 18 pontos ok; achou e corrigiu `relative`+`fixed` na tela cheia)
- [ ] Publicado

## Verificação

- `bash scripts/check-ui-standard.sh components/BudgetEditor.tsx components/BudgetRibbon.tsx components/ui/KpiCard.tsx`
  (os 7 achados §3 do `BudgetEditor` são o estado do drawer de busca SINAPI, já existentes
  no `origin/main` — exceção §3.1).
- `tsc --noEmit`; vitest de `BudgetEditor`, `BudgetEditorTable`, `PainelOrcamento`, `Ribbon`,
  `KpiCardXs`, `KpiCardDestaque`, `orgContextGuard`; `vite build`.
- Tela de verdade (Playwright, só leitura): orçamento real aberto, 4 abas, acesso rápido,
  recolher e recarregar, tela cheia, ←, KPIs iguais aos de antes, 1366 px e celular.

## Riscos

- Em tela cheia o shell some, e com ele o "Salvar"/estado de gravação do topo (`Layout.tsx`).
  O autosave continua; se fizer falta, o estado de gravação pode entrar no slot `direita`.
