# Negociação › aba Financeiro — correções da crítica de design

## Pedido original

> `/impeccable` + print da aba Financeiro de "Gerenciar Negociação" (Lote Vale do Sol)
>
> "comercial < venda de ativos > aba financeiro."
>
> `/impeccable critique financeiro da negociação`
>
> Sessão: d3e313ef-9762-4a65-a196-87c950d401a4 · 10/11/2026

Depois da crítica (nota 20/40, 3 problemas P1), o usuário respondeu às perguntas e pediu:

> "um de cada vez" — 10/11/2026

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 10/11/2026 | Qual frente atacar primeiro? | Proteger o plano (harden) |
| 10/11/2026 | Montador × tabela "Plano de pagamento" | **Editar na própria tabela** — o montador separado deixa de existir |
| 10/11/2026 | Escopo | Tudo, inclusive os menores |
| 10/11/2026 | Ritmo | Um comando de cada vez |

Crítica completa: `.impeccable/critique/2026-11-10T14-26-00Z__components-dealmodal-tsx.md`
(não versionada; frente `design/negociacao-financeiro`).

## Plano

Um item por comando, na ordem pedida. Todos em `components/DealModal.tsx`, salvo indicação.

### 1. `/impeccable harden` — proteger o plano

- **1a. Alterações não salvas (§25).** Dirty por diff contra o último estado salvo/carregado
  (variante do `ProjectModal`); ajustes do próprio sistema após abrir (plano do cofre, total
  semeado, organização, código regerado, status de assinatura) entram no snapshot via
  `ajustarDoSistema`. `SaveStatus` no rodapé (edição); "Cancelar" vira "Voltar" em edição;
  seta do cabeçalho, fundo e Voltar/Cancelar perguntam (`CONFIRMAR_SAIDA`); menu, voltar do
  navegador e fechar a aba também (`registrarPendencia`, só com o modal aberto).
  **Pronto quando:** abrir uma negociação existente não mostra "Alterações não salvas";
  mudar um campo mostra; "Voltar" pergunta; salvar mostra "Salvo" e "Voltar" sai direto.
- **1b. "Lançar no Financeiro" com pendência** vira "Salvar e lançar no Financeiro": salva
  antes e só lança se gravou. Negociação nova (sem id): botão desligado com o motivo escrito.
  **Pronto quando:** com campo alterado, o rótulo e a confirmação dizem "Salvar e lançar"; sem
  alteração, "Lançar no Financeiro" como antes.
- **1c. Enter num campo não envia o formulário** (`onKeyDown` no `<form>`, só campos dele).
  **Pronto quando:** Enter no Nº de parcelas não salva a negociação.
- **1d. Montador zera a cada abertura e nasce do plano gravado** — `serieDoPlanoGravado`
  (`utils/paymentPlan.ts`, testada em `__tests__/paymentPlan.test.ts`): entrada = sinal;
  nº, periodicidade e 1º vencimento = a série principal. O digitado prevalece.
  **Pronto quando:** num plano sinal + 60, o montador abre com entrada do sinal e 60 parcelas,
  e "Vai gerar" descreve o plano atual. (Provisório: o item 2 tira o montador.)

### 2. `/impeccable shape` — editar o plano na própria tabela

Planejar a troca do montador pela edição inline do bloco ("Parcelas 2–60": nº, valor,
periodicidade), onde ficam entrada e juros (Price/SAC, preço sem juros) e a primeira montagem
de uma venda sem plano. **Pronto quando:** o desenho estiver registrado neste arquivo e aprovado.

### 3. `/impeccable clarify`

Proposta × cobranças; vazio da aba Parcelas orienta e oferece "Lançar"; ponto da aba com texto;
"Data Efetiva abaixo" (gaveta do sinal); DOC fora da lista; os três sentidos de "Forma de pagamento".

### 4. `/impeccable distill`

Só "Salvar alterações" sólido; "Lançar" vira ação principal da aba Parcelas; sai "Ver plano de
pagamento"; "Total do plano" + "Plano fechado" numa linha; datas reduzidas.

### 5. `/impeccable audit`

`id`/`htmlFor` nos campos; abas `tablist` + `aria-selected` + setas; `size="sm"` em CC e Plano
de Contas; contraste AA (prefixos, placeholders, dicas, aviso do rodapé sem `truncate`, âmbar).

### 6. `/impeccable polish`

"R$" no lugar de "BRL"; "Nº de parcelas"; "ANÁLISE DE CRÉDITO" sem caixa alta; foco azul nos
seletores; fonte de 11 px; fecha a crítica.

## Estado

- [ ] 1. harden — 1a, 1b, 1c, 1d implementados na frente; falta conferência na tela
- [ ] 2. shape
- [ ] 3. clarify
- [ ] 4. distill
- [ ] 5. audit
- [ ] 6. polish

## Desvios registrados

- §25 pede "Salvar" desligado sem pendência. **Não aplicado no item 1:** o salvar desta tela
  reexecuta efeitos próprios (status do imóvel, tributos da venda —
  `services/commercialService.ts`, `saveDeal`), e desligar o botão sem mapear quem depende de
  "salvar de novo" arrisca botão morto. Reavaliar no item 6.

## Verificação

`npx vitest run __tests__/paymentPlan.test.ts`; `npm run typecheck`;
`bash scripts/check-ui-standard.sh components/DealModal.tsx`; tela no navegador (dev local,
negociação de venda com plano): abrir sem "não salvo", mudar campo, Voltar pergunta, Enter não
salva, montador com o plano atual, "Salvar e lançar" só com pendência.
