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

**Fase C: 10 de 10 — NO AR** (PR #639, squash 6295273; migration 999500 APLICADA e Edge Function `investor-monthly-reports` publicada em 21/11 com OK do usuário: 401 sem credencial; ensaio pela rotina gerou o PDF no servidor, 4,4 KB, sem gravar nada). Migration
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

**Fase D: 3 de 3 — NO AR** (PR #641, squash 7ed1ec4; migration 999800 APLICADA em 21/11 com OK do usuário). Migration
`aplicar_20271121999800_portal_investidor_fase_d.sql`. Ensaio (migration + prova, desfeito):
- D2: R$ 1.000 entre 33,33% e 66,67% deu 333,30 + 666,70 (soma exata); a SPE sem obra é recusada com o motivo.
- D3: relatórios e comunicados de todas as orgs do investidor, com `organization_name`.
- D1: Garden Cambuhy com 38 unidades vendáveis, custo realizado R$ 1.561,65 e avanço de 5,4%.

Em código:
- D2: `DistribuirResultadoPanel` no SpeManager, com a prévia do rateio pela regra do banco.
- D3: Comunicados e Documentos mostram a org quando há mais de uma.
- D1: aba "Acompanhamento" no detalhe da oportunidade do portal (`utils/acompanhamentoDoInvestidor.ts`).

**Fase E: 3 de 3 análises feitas.**

E1 — ciclo de vida, no banco (transação desfeita, 21/11, com as Fases A–D aplicadas):
- Interesse pelo link: lead, R$ 200 mil.
- Tornar sócio: 20 cotas, 20%.
- Chamada de R$ 200 mil, paga em 10/03/2026: vira aporte liquidado no extrato; chamado e integralizado do sócio
  ficam em 200 mil.
- Distribuição de R$ 50 mil em 30/09/2026 pela SPE: lançamento liquidado no extrato.
- O resumo do link traz a obra da SPE.
- A vitrine mostra a captação: chamado e integralizado de 200 mil, com SPE.

As telas com esses dados exatos (`__tests__/cicloDoInvestidor.test.ts`, regressão do ciclo):
- Carteira: 20%, aportado 200 mil, recebido 50 mil, patrimônio 200 mil "integralizado (sem versão)".
- Resumo: retorno total 25% e em caixa 25%.
- Fiscal 2026: custo 200 mil, rendimentos 50 mil; 2025 vazio.
**Nenhuma divergência entre banco e tela.**

E2 — informe de rendimentos: o que falta para o padrão da declaração. Fontes consultadas em 21/11: perguntas e
respostas IRPF da Receita; ficha de rendimentos isentos, código 09 para lucros e dividendos, isenção do art. 10 da
Lei 9.249/1995. **Confirmar com o contador antes de virar regra.**
1. **Fonte pagadora por linha:** a declaração pede o CNPJ e o nome de quem pagou (a SPE). O informe agrupa por obra;
   deveria agrupar pela SPE, com CNPJ (`spe_entities.cnpj` já existe).
2. **Natureza do valor:** dividendo é isento (código 09). "Distribuição" pode ser lucro (isento) ou devolução de
   capital (não é rendimento, reduz o custo). O sistema não distingue, e o TaxReport sugere "código 26" para tudo —
   provavelmente errado para dividendos.
3. **Imposto retido:** não há campo de IRRF no lançamento. A Lei 15.270/2025 prevê retenção de 10% sobre dividendos
   acima de R$ 50 mil por mês da mesma fonte, a partir de 2026 (fonte secundária; conferir na Receita).
4. **Bens e Direitos:** a participação na SPE vai no grupo 03 (participações societárias), com CNPJ e quantidade de
   cotas (`spe_partners.quota_count` existe) — o informe mostra só o custo por obra.
5. **Aporte pela chamada de capital:** custo de aquisição das cotas — já entra (Fase 7.1).
→ Itens 1, 2 e 4 cabem no sistema sem decisão fiscal nova (agrupar pela SPE, separar a natureza, mostrar CNPJ e
cotas). O item 3 e a regra do código para "distribuição" pedem decisão do contador. **Aguardam o usuário.**

E3 — confirmação de e-mail no Auth: **não conferida direto.** Ler a configuração pela API de gestão exigiria o token
da conta do usuário (o modo automático bloqueou). Evidência indireta no banco: 13 de 23 usuários com
`email_confirmed_at` nulo, o que não aconteceria com confirmação automática ligada.
Achado mais amplo que o da análise: o login por e-mail de **todos** os portais (`portal_token_para_mim`: cliente,
fornecedor, corretor, investidor) e a perna "pelo e-mail" de `fn_investor_get_espelho` confiam no e-mail da sessão.
Isso só é seguro com "Confirm email" ligado.
→ **Pendência do usuário:** conferir em Supabase › Authentication › Providers › Email que "Confirm email" está
ligado (e se o cadastro aberto, "Allow new users to sign up", precisa estar).
→ **Conferido pelo usuário em 22/11: "Confirm email" está ligado.** O login por e-mail dos portais fica seguro como
está; nada a mudar no código.

### Pendências do plano (21/11)
| # | Pendência | Quem | Situação |
|---|---|---|---|
| PE1 | Conferir "Confirm email" ligado no Auth (o login por e-mail de todos os portais depende disso) | usuário, painel do Supabase | ✅ ligado (conferido pelo usuário em 22/11) |
| PE2 | Decidir com o contador a natureza de "distribuição" (isenta × devolução de capital) e o campo de IR retido (Lei 15.270/2025) | usuário | ⏳ o usuário vai verificar com o contador e retornar (22/11). Ver E2; itens 1, 2 e 4 da E2 cabem sem decisão fiscal |
| PE3 | Roteiro de tela do portal no navegador (junto do P2 do plano Imovib × Oportunidades) | usuário faz o login; eu conduzo | ⏳ |

