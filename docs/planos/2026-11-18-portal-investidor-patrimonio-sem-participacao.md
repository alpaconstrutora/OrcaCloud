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
- [x] Produção: o link do Tiago mostra "Patrimônio —" e "Participação não registrada" no Resumo, "—" na
  coluna Cota/Patrimônio, sem "R$ 230.000" em lugar nenhum. **Pronto quando:** conferido pelo link
  real, no computador e no celular. — **Publicado no PR #570** (squash `ea740975c`; o domínio serviu
  `6fd6816`, que o contém). Conferido 18/11 em produção, 1920 px e 390 px: KPI "Patrimônio — Participação
  não registrada", linha "Garden Cambuhy — —", detalhe "Patrimônio estimado: Participação não registrada",
  nenhum "230.000" nem "1x", 0 erros de console.

## Pedido posterior (18/11) — o card "Parecer da Inteligência Artificial"

Depois do merge do #570, o verificador de design apontou o card de gradiente índigo do
`AssetDetailModal` (linha 148, de maio) e ofereci revisá-lo como pedido à parte. Resposta:

> sim

Ao abrir o card: não era IA. `aiService.analyzeAsset` esperava 1,5 s e devolvia texto fixo com números
inventados, mostrado ao investidor pelo "Ver empreendimento" do portal: "Yield on Cost de 12.5%, o que é
excelente para o setor" quando não há rendimento (`0 * 100 || '12.5'`), progresso × 100 (5,4% → "540%"
no Garden) e "infraestrutura municipal prevista para o próximo semestre". Trocar a cor deixaria o texto
falso no ar; a revisão é tirar o card.

- [x] `AssetDetailModal`: sai o card (estado, botão "Gerar Análise IA", ícones); a galeria da obra sobe para
  a coluna da direita, ao lado da linha do tempo. `aiService.analyzeAsset` removida (sem outro chamador).
  **Pronto quando:** `__tests__/components/AssetDetailSemParecerSimulado.test.tsx` verde (era vermelho
  achando o título do parecer).
- [x] Produção: "Ver empreendimento" pelo link do Tiago sem o card. **Pronto quando:** conferido pelo link real.
  — **Publicado no PR #579** (squash `d32eb5052`, servido pelo domínio; "Parecer da Intelig" ausente do bundle).
  Conferido 18/11 em produção, 1920 px: sem parecer nem "Gerar Análise IA", galeria "Evolução Visual" na
  coluna da direita, "Valor Atual — Participação não registrada", 0 erros de console.

Encontrado e **não** mexido (registrar, decidir depois): `aiService.analyzePortfolio` gera o card do Resumo
— com menos de 2 participações é uma dica genérica ("Dica de Diversificação"); com 2 ou mais diz "Seu
patrimônio de 0 … está 15% acima do CUB do período", número inventado. `rankOpportunities` (nota aleatória
80–100) não tem chamador.

## Fora deste plano

- Cadastrar a participação do Tiago no Garden (percentual e valor comprometido) e o valor do
  empreendimento é dado de negócio, feito no app por quem gere o investidor. Sem isso o Garden segue "—".
