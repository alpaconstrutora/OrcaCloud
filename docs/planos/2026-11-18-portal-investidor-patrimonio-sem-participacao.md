# Portal do Investidor — patrimônio sem participação registrada

## Pedido original

> de onde veio esse valor de patrimonio?

(print do Resumo do Portal do Investidor pelo link do Tiago: "Patrimônio R$ 230.000 · 1 empreendimento",
Aportado R$ 0, participação Garden Cambuhy com cota "1x" e patrimônio R$ 230.000.)

Resposta dada: R$ 230.000 = 100 m² × R$ 2.300/m². A área é o valor inicial do formulário de projeto
(`ProjectModal`, `area: 100`), o CUB é a tabela fixa por estado em `constants.ts` (`'MG': 2300.00`) e,
sem participação registrada, o código atribuía 100% do empreendimento ao investidor ("1x"). Proposta:
sem participação registrada, o card mostra "—" com "participação não registrada", e área × CUB deixa
de ser usado como valor do empreendimento.

> sim

Sessão `21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0` · 18/11/2026 ~11h.

## Dado real (lido em 18/11, só leitura)

| Dado | Valor |
|---|---|
| Garden Cambuhy (OBRA) `settings.financialInfo.totalValue` | 0 |
| `settings.area` × `settings.cubRate` | 100 × 2300 = 230.000 |
| Participações do Tiago (`investor_participations`) | 0 |
| Lançamentos do Tiago (`investor_contributions`) | 0 |
| Ligação Tiago ↔ obra | só `projects.investor_id` (campo antigo) |

## Regra nova

Patrimônio = valor do empreendimento (`settings.financialInfo.totalValue`) × participação registrada
(`investor_participations.ownership_pct`). Faltando qualquer um dos dois, o patrimônio é `null` e a tela
mostra "—" com o motivo ("Participação não registrada" / "Valor do empreendimento não informado").
Área × CUB não vira mais valor de empreendimento; "1x" não aparece mais.

## Itens

- [x] `utils/investidorCarteira.ts` (novo): `itemDaCarteira` (o mapa projeto → item da carteira que
  vivia dentro do `InvestorDashboard`) e `totalDaCarteira` (soma só o conhecido, conta e explica o resto).
  **Pronto quando:** `__tests__/investidorCarteira.test.ts` — o Garden como está no banco sai com
  `equity null`, cota "—", motivo "Participação não registrada"; com participação e sem valor sai
  "Valor do empreendimento não informado"; com os dois sai valor × %.
- [x] `components/InvestorDashboard.tsx`: `stats` usa as duas funções; total sem nada conhecido = "—".
- [x] Portal (link): `PortalOverview` (KPI Patrimônio e coluna) e `PortalHoldings` (subtítulo, coluna,
  total, detalhe "Patrimônio estimado", cartão do celular) mostram "—"/motivo em vez de "R$ 0".
  **Pronto quando:** `__tests__/components/PortalPatrimonioSemParticipacao.test.tsx` verde (era vermelho
  com "R$ 0" na linha e no KPI).
- [x] Gestor: `HoldingsList` ("—"), `InvestorSummaryDashboard` (KPI com o motivo; gráfico sem barra
  em vez de zero) e `AssetDetailModal` ("Valor atual" "—" com o motivo, sem "valorização" negativa).
- [ ] Produção: o link do Tiago mostra "Patrimônio —" e "Participação não registrada" no Resumo, "—" na
  coluna Cota/Patrimônio, sem "R$ 230.000" em lugar nenhum. **Pronto quando:** conferido pelo link
  real, no computador e no celular.

## Fora deste plano

- Cadastrar a participação do Tiago no Garden (percentual e valor comprometido) e o valor do
  empreendimento é dado de negócio, feito no app por quem gere o investidor. Sem isso o Garden segue "—".
