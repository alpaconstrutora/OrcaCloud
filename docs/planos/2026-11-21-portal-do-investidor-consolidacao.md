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

**Fase A: 9 de 9 — NO AR** (PR #637, squash ff6e617; migration 998000 APLICADA em 21/11 com OK do usuário; ACLs sem PUBLIC conferidas). Migration
`aplicar_20271121998000_portal_investidor_seguranca.sql` (o prefixo 996000 já era de outra frente — a CI pegou a
colisão). Ensaio no banco (migration + prova numa transação desfeita):
- A1: UPDATE direto do admin em tokens → 42501; revogar pela RPC funciona.
- A2: relatório sem destinatário não sai pelo link.
- A3: o settings da obra sai sem bdi/wbs/cliente.
- A4: o cadastro sai sem `document`.
- A6: só com a chave entra no marketplace, sem custo nem terreno.
- A7: INSERT direto de ciência → 42501.
- A8: de outra org sai `nome=NULL` + a org.
- A9: 2 interesses viram 1 (valor atualizado); texto longo recusado.

Mudanças em relação à tabela:
- A4 não devolve o documento nem mascarado (a tela não usa).
- A8 vale para qualquer membro de organização (quem cadastra investidor não é só o gestor); de outra org vem só o
  nome da org.
- A5 sem gatilho na escrita: as 111 versões do GED já estão na pasta da org; a trava fica na leitura do link.

**Fase B: 6 de 6 — NO AR** (PR #638, squash d2b3d32; migration 999000 APLICADA em 21/11 com OK do usuário). Migration
`aplicar_20271121999000_portal_investidor_numeros.sql`. Ensaio (A + B + prova, desfeito):
- B1: sócio sem participação digitada aparece; o resumo do link traz a obra da SPE.
- B2: sem versão só o integralizado (800 mil); com versão o lucro de 5 mi e o rótulo.
- O gestor lê pela RPC autenticada; um usuário estranho vê 0.
- B6: o espelho roda com o vendido pela parte de cada unidade.

Em código:
- `utils/investidorCarteira.ts` (`carteiraDoInvestidor`, `resumoDaCarteira`) é a única conta da carteira e dos
  KPIs, no portal e no gestor; as duas cópias do `InvestorDashboard` e `getInvestorSummary` saíram (C9 antecipado
  em parte).
- `utils/informeDeRendimentos.ts` serve o PortalFiscal e o TaxReport. B5 seguiu a regra da declaração:
  rendimentos pagos no ano e custo = posição em 31/12, com a do ano anterior ao lado.

**Fase C: 10 de 10 itens feitos** na frente `portal-investidor-fc`. Migration
`aplicar_20271121999500_portal_investidor_fase_c.sql` e Edge Function nova `investor-monthly-reports`.
- C1: rotina do dia 1º → `generate_monthly_investor_reports()` chama a Edge Function, que gera o PDF de cada
  investidor. O módulo `utils/relatorioMensalDoInvestidor.ts` é o mesmo do "Gerar Agora" e não importa nada (Deno).
  O agendamento (`cron.job`) não muda. A função deixou de ser executável por `authenticated`. Tem modo
  `{ensaio:true}`, que gera sem gravar.
- C2: o "Chamar/Pagar" manual saiu do SpeManager (e `speService.addCapitalPayment`, sem chamador); o sócio nasce
  com chamado/integralizado 0.
- C3: o "Tenho interesse" do portal pede o valor, com o ticket mínimo como piso; o botão desligado diz por quê.
- C4: o lançamento tem forma de pagamento e comprovante; o portal baixa pela `portal-documentos-download`.
  Mudança em relação à sugestão: o comprovante fica no bucket privado dos relatórios do investidor
  (`reports/<org>/comprovantes/…`), não no GED. Assim o link baixa pela mesma trava dos relatórios; pelo GED seria
  preciso uma terceira trava de download.
- C5: o lançamento tem "Pago em" próprio (obrigatório quando liquidado).
- C6: `cancelado` aceito no banco, com o rótulo no gestor.
- C7: a aba Simulador simula a oportunidade escolhida (`SimuladorDaOportunidade`) e some para o investidor sem
  oportunidade simulável; `components/InvestmentSimulator.tsx` (genérico) apagado.
- C8: `ApresentacaoDaOportunidade` é a mesma no gestor (Detalhes) e no portal (aba nova "Apresentação"); a obra
  vem pela RPC nova `fn_investor_portal_get_obra`.
- C9: a carteira já era uma função só desde a Fase B.
- C10: saíram:
  - índices fixos (Selic/IPCA/IGPM), CUB a cada carga e o modal de texto sem uso;
  - os ramos de token que nunca rodavam (OpportunityDetail/OpportunitiesTab) e o "Atualizado hoje" fixo;
  - o recurso do gráfico pelo diário × valor de obra digitado (contrariava a D2);
  - `fn_investor_portal_get_milestones`, sem chamador (DROP).
