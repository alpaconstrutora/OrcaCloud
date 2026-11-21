# Plano — Imovib × Oportunidades × Portal do Investidor: o Imovib e a SPE são a fonte

> Uma frente por fase (REGRA #8). Merge é meu (`gh pr ready` + `gh pr merge`); push em `main` é o deploy.
> Migrations: aplicar só com OK do usuário (`npx supabase db query --linked -f`, nunca `db push`), com REVOKE em toda
> função nova e prova em transação desfeita.

## Pedido original (21/11/2026, sessão e7b82365)

1ª mensagem (~19h20):
> Anote como pendencia: Buckets antigos e Roteiro de tela no Garden.
>
> voce fez um analise entre imovib e oportunidades. Avalie agora imovib e oportunidades e portal do investidor.

2ª mensagem (depois da análise):
> me diga o que voce sugere para cada item

3ª mensagem (~19h55, depois das sugestões):
> 1. Segurança: corrigir todos: de acordo.
> 2. Números que se contradizem: o Imovib e a SPE são a fonte: de acordo.
> 3. Existe, mas não funciona: corrigir todos: de acordo.
> 4. No lugar errado ou duplicado: de acordo com a sua sugestão
> 5. O que deveria existir: implementar todos: de acordo.
> 6. Outras análises: fazer as três: de acordo
>
> Ordem que sugiro: de acordo

As pendências da 1ª mensagem (buckets e roteiro no Garden) foram anotadas como P1/P2 em
`docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md` (PR #634).

## Contexto

O Portal do Investidor é o próprio `components/InvestorDashboard.tsx` em modo token (11 abas). As oportunidades já
leem a versão congelada do Imovib (`naVitrine`); carteira, patrimônio e rentabilidade leem cadastros digitados à
parte (`investor_participations`, `projects.settings.financialInfo.totalValue`, `investor_contributions`), sem ligação
com o Imovib nem com a SPE. Estado do banco em 21/11: 1 investidor, 1 token ativo, 0 oportunidades publicadas,
0 SPEs, 0 aportes.

## Decisões (do usuário, 21/11) — as sugestões aprovadas

- **D1 Segurança:** corrigir S1–S9 como sugerido.
- **D2 Números:** o Imovib e a SPE são a fonte. Patrimônio = capital integralizado na SPE + resultado da versão
  publicada × % de cotas; o sócio da SPE é a participação; uma fórmula de retorno ("Retorno total" e "Retorno em
  caixa"); "Recebido" = dividendo + distribuição; Fiscal filtra o ano; espelho do investidor com a regra única.
- **D3** Corrigir o que não funciona (3.1–3.6) como sugerido.
- **D4** Duplicados e lugar errado (4.1–4.4) como sugerido.
- **D5** Implementar o que deveria existir (5.3–5.6) como sugerido.
- **D6** Fazer as três análises (6.1–6.3).
- **D7** Ordem: segurança → números → não funciona e duplicados → o que deveria existir → análises.

---

## Fase A — Segurança

| # | Item | O que muda | Pronto quando |
|---|---|---|---|
| A1 (S1) | Tokens do portal | Policy de `investor_portal_tokens` passa a só LER (gestor da org, investidor da org); escrita direta revogada; revogar vira RPC `investor_portal_revoke_token` (confere gestor e org do investidor). `investorPortalTokenService.revokeToken` usa a RPC. | Prova: INSERT/UPDATE direto como admin → recusado; gerar e revogar pela RPC funcionam |
| A2 (S2/5.5) | Relatório mensal por investidor | `generateMonthlyReportPdf(org, investidor)` só com os aportes e obras do investidor; "Gerar relatório" gera um PDF por investidor (`investor_reports.investor_id`); `fn_investor_portal_get_reports` deixa de entregar relatório sem destinatário (`category='relatorio' AND investor_id IS NULL`). | Teste do recorte; prova SQL: relatório sem destinatário não sai pelo token |
| A3 (S3) | Settings da obra | `fn_investor_portal_get_summary` devolve só as chaves que a tela usa. | Prova: o payload não tem `bdi`, `wbs`, `client`, `versions` |
| A4 (S4) | Cadastro e colunas | `investor_portal_get_data` com campos explícitos e documento mascarado; aportes e relatórios com colunas explícitas. | Prova: payload sem CPF completo; contrato TS=SQL |
| A5 (S5) | Caminho do Data Room | `fn_investor_portal_get_dataroom` só lista versão cujo caminho está na pasta da org do documento. | Prova: versão com caminho de outra org some da lista |
| A6 (S6) | Marketplace | `investor_opportunities.no_marketplace` (padrão falso); `get_public_marketplace` só lista as marcadas e só com título, local, fotos, tipo, ticket mínimo, VGV, TIR e prazo; formulário ganha a chave. | Prova como anon: sem custo/terreno/margem; não marcada não aparece |
| A7 (S7) | Ciência e voto | Sem INSERT direto em `investor_acknowledgments` (só a RPC do portal, pelo investidor do token); DELETE só admin; CHECK do voto. | Prova: INSERT direto recusado; RPC grava |
| A8 (S8) | Busca por documento | `find_investor_by_document` só para gestor e devolve só "existe em <org>". | Prova: membro comum recusado; payload sem nome/código |
| A9 (S9) | Restantes | `investors_update` sem a perna `organization_id IS NULL`; `fn_investor_portal_submit_interest` com limite de tamanho e um interesse por investidor por oportunidade (o segundo atualiza); REVOKE PUBLIC em `investor_portal_get_data`, `fn_investor_portal_get_reports`, `investors_user_org_ids`. | ACL sem `=X`; prova do upsert |

## Fase B — Números (D2)

| # | Item | O que muda | Pronto quando |
|---|---|---|---|
| B1 (2.2) | Sócio da SPE é a participação | Uma função única da carteira lê `spe_partners` (cotas, %, chamado, integralizado) das SPEs com obra; `investor_participations` só para obra sem SPE. "Tornar sócio" aparece na Carteira. | Teste: sócio da SPE aparece na Carteira sem participação digitada |
| B2 (2.1) | Patrimônio | Integralizado + lucro da versão publicada × % (a da oportunidade ligada à SPE); sem versão, só o integralizado; a tela diz a origem. | Teste da fórmula; sem `financialInfo.totalValue` |
| B3 (2.3) | Uma rentabilidade | "Retorno total" = (recebido + patrimônio − aportado) ÷ aportado; "Retorno em caixa" = recebido ÷ aportado; `getInvestorSummary` sai. | Teste; as telas usam a mesma função |
| B4 (2.4) | Recebido | dividendo + distribuição em todo KPI; retirada como linha própria. | Teste |
| B5 (2.5) | Fiscal | Seletor de ano; soma só o ano pelo `paid_date`. | Teste com dois anos |
| B6 (2.6) | Espelho do investidor | Regra do SQL igual a `vgvDoEspelho`; trava de teste TS=SQL. | Teste de contrato |

## Fase C — Não funciona (D3) e duplicados (D4)

| # | Item | O que muda | Pronto quando |
|---|---|---|---|
| C1 (3.1) | Relatório automático | A rotina gera o PDF de cada investidor de verdade e o comunicado só sai com o arquivo. | Prova: rodada do cron com investidor de teste |
| C2 (3.2) | "Pagar" manual | Sai do SpeManager; aporte avulso = chamada de um sócio só. | Teste |
| C3 (3.3) | Interesse com valor | O portal pede o valor pretendido (piso: ticket mínimo). | Teste de componente |
| C4 (3.4) | Forma e comprovante | Lançamento de aporte com forma de pagamento e comprovante (GED). | Teste |
| C5 (3.5) | Data do pagamento | Campo próprio; os antigos ficam "data não informada". | Teste |
| C6 (3.6) | Cancelado | O banco aceita `cancelado` (aporte estornado). | Prova SQL |
| C7 (4.1) | Simulador | A aba "Simulador" mostra o simulador da oportunidade escolhida (números da versão); sem oportunidade publicada, some; o genérico sai. | Teste de componente |
| C8 (4.2) | Um detalhe de oportunidade | O mesmo detalhe para gestor e investidor (o investidor vê simulador, captação, ficha técnica, fotos, equipe, distâncias, obra ao vivo). | Teste de componente |
| C9 (4.3) | Carteira em um lugar | Uma função (a de B1) usada por gestor e portal. | `git grep` das cópias = 0 |
| C10 (4.4) | Código morto | Saem índices fixos, CUB sem uso, ramos de token que não rodam, cronograma por token sem uso. | `git grep` = 0; tsc |

## Fase D — O que deveria existir (D5)

| # | Item | O que muda | Pronto quando |
|---|---|---|---|
| D1 (5.3) | Acompanhamento no portal | Aba com avanço, custo e vendas previstos pela versão publicada × realizado (totais). | Teste do recorte |
| D2 (5.4) | Distribuição pela SPE | "Distribuir resultado": valor total rateado pelas cotas → um lançamento por sócio, numa transação. | Prova SQL |
| D3 (5.6) | Várias organizações | Comunicados e relatórios de todas as orgs do investidor, com o nome da org. | Prova SQL |

## Fase E — Análises (D6)

| # | Item | Pronto quando |
|---|---|---|
| E1 (6.1) | Ciclo de vida de ponta a ponta (lead → interesse → sócio → chamada → aporte → distribuição → fiscal) em caso de teste no banco, depois na tela junto com o P2. | Relatório no plano com cada número conferido |
| E2 (6.2) | Informe de rendimentos: o que falta para o padrão da Receita. | Lista no plano; o que faltar vira item |
| E3 (6.3) | Confirmação de e-mail no Auth; se desligada, a função do Espelho autoriza pelo usuário vinculado. | Configuração conferida e registrada |

## Estado (atualizar a cada fase)

Fase A: em andamento na frente `portal-investidor-fa`.
