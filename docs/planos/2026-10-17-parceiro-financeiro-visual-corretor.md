# Portal do Parceiro › Financeiro no desenho das Comissões do Corretor

## Pedido original
> portal do parceiro (visão do parceiro) veja print. Compare com o portal do corretor (visão do corretor), veja print.
> Aplique o mesmo Design

Sessão: 9ea12c8b-828e-4f89-ac20-c7b47427a8fc · 17/10/2026, ~13:05.
Prints: Financeiro do Parceiro (Débora Cristina Duarte, 5 KPIs + tabela de 73 parcelas)
e Comissões do Corretor (Geleia, 3 cards com barra + chips + cartão que abre com
"Marcos de liberação").

### 2º pedido — 17/10/2026, ~14:20 (CORRIGE O RUMO)
> voce fez tudo errado.
> Era para aplicar o design no portal do parceiro no portal do corretor e nao o contrato.

⚠️ O 1º pedido foi lido ao contrário: o certo era levar o desenho do **Parceiro ›
Financeiro** (faixa de KPIs, abas de filtro, tabela, pílula) para as **Comissões do
Corretor** — não o das Comissões para o parceiro. O que está abaixo de "Plano" (itens
1–7) é a execução errada, publicada em `b21f8f41`/`d3c3c78f` e **revertida** pelo 2º plano.

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 17/10/2026 | Como organizar as parcelas: um cartão por contrato, ou a mesma lista solta no visual do corretor? | **Um cartão por contrato** (abre e mostra as parcelas) — o banco passa a devolver o contrato de cada parcela |
| 17/10/2026 | E o card de Medições? | **Mesmo visual também** |
| 17/10/2026 (2º) | Nas Comissões, com o desenho do parceiro, qual é a linha da tabela? | **Uma linha por parcela** (marco) de cada comissão |

Decisões de execução (não perguntadas, registradas):
- Com **um contrato só**, o cartão já nasce aberto — fechado, a aba mostraria só um cabeçalho.
- KPIs viram 4: Total dos contratos / Recebido / Em aberto / Vencido. "Próximo vencimento"
  fica numa faixa de uma linha; "Saldo retido" vai para o cabeçalho de Medições.
- Chips: Todas / A vencer / Vencidas / Pagas (mutuamente exclusivos, como no corretor). A
  cancelada só aparece em "Todas".
- Medição **não abre**: é uma linha fixa (`StaticItem`) para a ação "Anexar NF" ficar sempre
  à vista (e o passo `financeiro-anexar-nf` do tour achar a âncora).

## Plano

1. **Banco** — `supabase/migrations/aplicar_20271017900000_partner_ws_financials_contract_id.sql`:
   `partner_ws_financials` devolve `installments[].contract_id` (o EXISTS do filtro vira
   CROSS JOIN LATERAL com o mesmo predicado). Reescrita a partir da versão viva.
   *Terminou quando:* ws da Débora = 73 parcelas, 73 com `contract_id`, `anon` sem EXECUTE.
2. **Kit** — `components/portal/PortalCardsKit.tsx` (novo), classes literais das Comissões.
   *Terminou quando:* `BrokerCommissions.tsx` usa só o kit e a tela do corretor não muda (print).
3. **Corretor** — `components/broker/BrokerCommissions.tsx` refatorado sobre o kit.
   *Terminou quando:* print desktop e celular iguais aos de antes.
4. **Parceiro** — `components/partner/PartnerPortalFinanceiro.tsx` reescrito no kit, com
   `agruparParcelasPorContrato()` pura. Props e âncoras `data-tour` iguais.
   *Terminou quando:* print bate com o do corretor; 73 parcelas e KPIs com os mesmos valores.
5. **Ajuda/tour** — `utils/portalHelpDefaults.ts`: textos do tour e do artigo do Financeiro
   descrevem cartões por contrato e chips.
6. **Documentação da exceção** — `docs/ui_ux_guia_unificado.md` §24 (tabela + §24.1) e o
   cabeçalho de `components/portal/PortalKit.tsx`.
7. **Testes** — `__tests__/partnerPortalFinanceiro.test.ts` (agrupamento) e
   `__tests__/components/PartnerPortalFinanceiro.test.tsx` (novo, jsdom).

## Estado
- [x] 1. Banco — aplicado em 17/10/2026; conferido: 73/73 com `contract_id`, `anon_exec=false`.
      Renomeada `…500000` → `…700000` → `…900000` (prefixo colidiu com duas frentes; `migrationsPrefixo.test.ts`)
- [x] 2. Kit
- [x] 3. Corretor (refatoração) — print local × produção: **0 pixels diferentes** (desktop 1600×1000 e celular 390×844)
- [x] 4. Parceiro
- [x] 5. Ajuda/tour
- [x] 6. Documentação da exceção
- [x] 7. Testes — 51 passed nos 5 arquivos relacionados
- [x] Verificação visual — Playwright no link público, local × produção, sem erro de console/HTTP:
      parceiro com 73 parcelas, Recebido R$ 15.600, Em aberto R$ 28.200, Vencido R$ 22.200
      (mesmos números da produção), chips 73/10/37/26; `check-ui-standard` limpo nos 3 `.tsx`; `tsc` 0 erros
- [x] Suíte inteira — após rebase em e3ec3f0b: 10.130 passed / 0 failed; `npm run build` rc=0, 0 erros TS
      (1ª rodada: `PainelVersoes` caiu por timeout sob carga — 26/26 isolado — e a colisão de prefixo, corrigida)
- [x] Publicação — main `d3c3c78f`; domínio serve d3c3c78 (`conferir-producao` ✅); check-run `ci` = success;
      Playwright na produção: parceiro com o desenho novo, mesmos números, sem erro de console/HTTP

## Verificação
1. `bash scripts/check-ui-standard.sh` nos `.tsx` tocados (acusações textuais do §24.1 são esperadas).
2. `npx tsc --noEmit` (lido por grep) e `npx vitest run` inteiro.
3. Playwright (skill `rodar-app`): Parceiro pelo link da Débora — KPIs, chips, cartão
   CTS-010-036-0001 aberto, recibo Nº 000001, Medições; Corretor › Comissões no desktop e no celular.

## Pendências fora deste pedido
- **Portal do Parceiro no celular**: a CASCA (barra lateral fixa + cabeçalho) não tem versão
  de celular — em 390 px a aba fica espremida, e já ficava na produção antes desta mudança
  (pior: a faixa de 5 KPIs virava letras soltas). O corretor tem `BrokerPortalMobile`; o
  parceiro precisaria do equivalente. Não feito — não foi pedido.

---

## 2º plano (17/10/2026) — Comissões do Corretor no desenho do Parceiro

1. **Reverter a 1ª execução** — `git revert` de `b21f8f41` + `d3c3c78f`, exceto a
   migration `aplicar_20271017900000_partner_ws_financials_contract_id.sql` (já aplicada,
   só acrescenta `installments[].contract_id`, inofensiva) e este plano.
   `PortalCardsKit.tsx` apagado. *Terminou quando:* parceiro, corretor, PortalKit e o teste
   iguais ao `e9c86243`; guia/ajuda só com as mudanças da frente de Documentos (`a149f991`).
2. **Banco** — `aplicar_20271017950000_comissao_marco_released.sql`: `fn_broker_comissoes_lista`
   devolve `milestones[].released` (mesma regra do `liberado` agregado), a partir do ARQUIVO
   `20271017600000`. *Terminou quando:* Geleia — 6 marcos `released` = R$ 700 = `commission_released`.
3. **Corretor** — `components/broker/BrokerCommissions.tsx` com o `PortalKit`: `KpiStrip`
   (Prevista / A liberar / Liberada / Paga / Próxima liberação), faixa da próxima liberação,
   `PortalCard`+`CardHeader`+`PortalTabs` (Todas/Pendentes/Liberadas/Pagas) e tabela
   PARCELA/NEGOCIAÇÃO/DATA/VALOR/STATUS com `StatusPill`. Celular (`compacto`): lista empilhada.
4. **Tipo** — `types/broker.ts`: `milestones[].released?`.
5. **Ajuda/tour** — `utils/portalHelpDefaults.ts`: textos de Comissões do corretor.
6. **Exceção** — guia §24 (linha "Corretor") e cabeçalho do `PortalKit.tsx`.
7. **Testes** — `__tests__/components/BrokerCommissions.test.tsx` (novo).

### Estado (2º plano)
- [x] 1. Reversão — parceiro local × print da produção ANTES da 1ª execução: **0 pixels diferentes**
- [x] 2. Banco — aplicado; 6 marcos `released` somam R$ 700 (= agregado)
- [x] 3. Corretor — Playwright no link da Geleia, desktop e celular, sem erro de console/HTTP:
      Prevista R$ 5.200, A liberar R$ 4.500, Liberada R$ 700, Paga R$ 0; abas 21/15/6/0
- [x] 4. Tipo · [x] 5. Ajuda/tour · [x] 6. Exceção · [x] 7. Testes (48 passed nos relacionados)
- [ ] Suíte inteira e build
- [ ] Publicação
