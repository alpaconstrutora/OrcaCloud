# RH › Configurações Fiscais — uma aba por tabela, em tabela padrão

## Pedido original

> recursos humanos > Configurações Fiscais:
> 1.	Transformar em tabela e aplicar o padrão ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas
> 2. Crie uma aba para cada tabela  (Tabela INSS, Tabela IRRF e Fundo de Garantia (FGTS))

Sessão: 2b8ed8df-27be-45af-86c1-182d930b1a00 · 25/10/2026

## Decisões tomadas

| Data | Pergunta | Resposta |
|---|---|---|
| 25/10/2026 | "Botão de ajuste de colunas" é a engrenagem ou o autofit? | Autofit (`MoveHorizontal`) — memória `toolbar-botoes-colunas-vs-largura`. O `StandardTable` traz os dois. |
| 25/10/2026 | Edição em modo "tabela inteira" (Editar → Salvar tudo) ou por linha? | Por linha, como em RH › Encargos Sociais (`LaborEncargos.tsx`): lápis na linha → campos na própria linha → confirmar grava só aquela faixa e atualiza o array local (§22). |
| 25/10/2026 | O `prompt()` nativo de "Clonar tabelas" fica? | Não: vira `useConfirm()` (§14) com o ano de origem escolhido num `<select>` dentro da mensagem. |
| 25/10/2026 | Botão "Ver Histórico" (sem `onClick`) fica? | Sai — não fazia nada. |

## Plano

1. **`components/LaborFiscalSettings.tsx`**
   - O que muda: título §20 + `TabsBar` §19.1 com três abas (Tabela INSS, Tabela IRRF,
     Fundo de Garantia (FGTS)) com contador de faixas; à direita da barra o escopo §5.3
     (ano de referência), "Clonar tabelas" e a ação primária §17 da aba ("Nova faixa").
     Cada aba é um `StandardTable` §6.10 (busca persistida, engrenagem, autofit,
     redimensionar, espaçador antes de Ações, cabeçalho branco). Edição inline §7.1 por
     linha; exclusão com `useConfirm()` sempre visível (§9). Os cards escuros, a grade de
     dois cards e o card FGTS somem. Lista de anos passa a ir até o ano seguinte ao atual
     (era fixa 2023–2026).
   - Como sei que terminou: `bash scripts/check-ui-standard.sh components/LaborFiscalSettings.tsx`
     sem achado; `tsc` sem erro no arquivo; na tela, as três abas trocam a tabela, a toolbar
     acoplada mostra busca + engrenagem + autofit, e editar/criar/excluir uma faixa grava.

## Estado

- [x] item 1 — `check-ui-standard.sh` sem achado; `tsc` 0 erros; travas `orgContextGuard`,
  `cabecalhoSemCinzaGuard`, `valorDeCampoSemCinzaGuard` verdes; harness
  `docs/spikes/configuracoes-fiscais/passeio.mjs` com 32 portões verdes (abas, toolbar acoplada,
  autofit, edição/criação/exclusão por linha gravando só a linha, FGTS, clonar sem `prompt()`).

## Verificação

Sem senha do usuário de leitura: subir o vite da frente e rodar o harness (PostgREST em memória,
nada chega ao Supabase):

```bash
npx vite --port 3141 --strictPort --host 127.0.0.1
PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core node docs/spikes/configuracoes-fiscais/passeio.mjs http://127.0.0.1:3141 <pasta-dos-prints>
```


Abrir RH › Configurações Fiscais no app local, alternar as três abas, editar uma faixa e
conferir no banco (`inss_brackets`/`irrf_brackets`/`fgts_config`) que só a linha editada mudou.
