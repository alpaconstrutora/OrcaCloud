# Locações › aba Análise — Espelho vivo (overdrive)

## Pedido original

> `/impeccable overdrive: comercial < Gestão de Locações < aba analise`
>
> Sessão: 058a6341-a06e-4d8f-b216-f8e5d365cca4 · 26/10/2026

Entre três direções apresentadas (Espelho vivo · Tudo conversa · Transições que
explicam), o usuário escolheu **"Espelho vivo (Recomendado)"**.

Continuação de `docs/planos/2026-10-26-locacoes-analise-critica.md` (PR #182).

## Decisões tomadas

| Data | Decisão | Por quê |
|---|---|---|
| 26/10 | Espelho próprio da análise, não o `PropertyUnitMap` | O de Imóveis é cadastro/venda (outro vocabulário, outras ações); aqui é leitura analítica. Regras de domínio reaproveitadas: andar 0 = térreo, torre por `block`. |
| 26/10 | Cor segue a leitura (Operação = status; Investimento = contratado ÷ base) | Uma peça, duas perguntas — as mesmas das duas leituras aprovadas. |
| 26/10 | Atraso de contrato de várias unidades aparece em cada uma, com aviso | A parcela é do contrato, não da unidade; dividir inventaria um número. O teste de partição soma por contrato. |
| 26/10 | Movimento: só a subida dos andares ao trocar de recorte | Um momento autoral; `prefers-reduced-motion` desliga. |

## Plano

| # | O que muda | Arquivos | Como sei que terminou |
|---|---|---|---|
| 1 | Células do espelho na lib (status, dias de vaga, atraso por contrato, vence em 90 dias) e no escopo | `lib/rentalUnitMirror.ts`, `lib/rentalByEmpreendimento.ts` | `__tests__/rentalUnitMirror.test.ts` (partição: espelho fecha com composição e com o atraso) |
| 2 | Componente: torres no recorte, rua de prédios em "Todos", destaque, detalhe, teclado, subida | `components/rentals/RentalUnitMirror.tsx` | `__tests__/components/RentalUnitMirror.test.tsx`; conferido no app |
| 3 | Ligação: painel, faixa do gráfico de atraso acende o espelho, Enter abre a torre no inventário | `RentalAnalysisOverview.tsx`, `RentalsModule.tsx` | conferido no app |
| 4 | Guia §28.6 | `docs/ui_ux_guia_unificado.md` | seção escrita |

## Estado

- [x] 1 — 41 testes da lib verdes.
- [x] 2 — 6 testes de componente; no app: rua com 6 prédios (35 unidades), recorte 010 com 4 unidades com atraso = contadores; setas e cartão de detalhe no foco; subida medida (atrasos 0/45/90 ms, térreo primeiro); celular sem rolagem de página.
- [x] 3 — Enter/clique abre a torre no inventário; faixa "> 90 dias" do gráfico acende as unidades.
- [x] 4

## Verificação

Comercial › Gestão de Locações › Análise: em "Todos", a rua de prédios; clicar num
prédio recorta; no recorte, "Atraso > 90 dias" deixa acesas só as unidades com ponto
vermelho grande; Tab + setas percorrem as unidades com o detalhe visível.
