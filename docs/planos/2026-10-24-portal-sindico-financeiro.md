# Portal do Síndico › Financeiro do condomínio (consultar e operar)

Continuação de `docs/planos/2026-10-20-portal-do-sindico.md`. Frente
`portal-sindico-financeiro` (REGRA #8).

## Pedido original

Sessão de 24/10/2026, transcrito literalmente:

```
portais < portal do condomínio >Ver como o síndico:
O sindico sera o gestor do condomínio, entao no portal dele deve estar disponivel o Financeiro relativo ao condomínio
```

## Decisões do usuário (24/10/2026)

| Pergunta | Resposta |
|---|---|
| Acompanhar ou agir | **Operar pelo portal** |
| Conteúdo | Resumo do mês · Contas a pagar · Contas a receber · Prestação de contas (os rateios, como antes) |
| Operações v1 | Lançar conta a pagar · Dar baixa · Cadastrar fornecedor · Editar e cancelar título |
| Gravação | **Só com login** (modo `'sessao'`); pelo link só consulta, botão desligado com o motivo |
| Alçada | **Não passa por alçada** — o síndico é o gestor; o título nasce `APROVADO` e marcado como lançado por ele |

## Contexto medido (24/10/2026)

- A aba do portal se chamava "Prestação de contas" e mostrava só os rateios.
- 010 opera em organização própria (`condominio_org_id` 672fa190…): 94 títulos a pagar
  (73 contrato recorrente, 21 boleto, 0 manual); nenhuma cota emitida (Contas a receber vazio).
- 007 tem síndico (o mesmo ALTAIR) mas segue na org da Alpa.
- Org do 010: 0 plano de contas, 0 contas de pagamento que a atendam, 5 fornecedores visíveis,
  0 faixas de alçada.

## Decisões de desenho

- **Recorte = centros de custo do condomínio** (`cost_centers_v2.empreendimento_id`), o mesmo
  da aba Despesas do admin. Gravação na org que opera o condomínio.
- **Só opera condomínio com organização própria.** 007: consulta, com o motivo.
- **Editar/cancelar só título MANUAL em aberto** (contrato/boleto se corrigem na origem; o
  botão diz isso). Cancelar nunca apaga. Baixa vale para qualquer origem a pagar, menos alçada
  `PENDENTE` e pagamento Asaas em curso.
- **Fornecedor com CPF/CNPJ existente em qualquer org não duplica**: vira
  `supplier_org_shares` para a org do condomínio (como a migração do 010 fez).
- **Conta Financeira obrigatória; Plano de contas opcional** (só aparece se a org tiver).
- **Auditoria:** `lancado_por_sindico_client_id` (títulos e fornecedores) + log imutável
  `sindico_financeiro_eventos`.
- **Caminho de arquivo nunca vai ao navegador.** Uma Edge própria
  (`sindico-portal-financeiro`) resolve código/nome com `_shared/origemDoLancamento.ts`
  (`resolverOrigens`, o mesmo da aba Despesas e do PDF do rateio) e assina no clique.
  *Mudança em relação ao rascunho:* em vez de estender `client-portal-condominio-download`
  (que o Portal do Cliente também usa), a Edge é separada.

## Itens

| Arquivo | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| `supabase/migrations/aplicar_20271024400000_portal_sindico_financeiro.sql` | Colunas de autoria, log com RLS só-leitura, 7 funções privadas, leitura `sindico_portal_financeiro` + `sindico_portal_titulos_autorizados` (modo `ler`), `sindico_portal_autorizar_upload` e 5 escritas (modo `sessao`) com `fn_period_is_closed` explícito e trava Asaas | Prova em bloco desfeito: 24 sondas; conferência de que nada ficou; aplicada; ACL sem PUBLIC | ✅ aplicada em 24/10 |
| `supabase/functions/sindico-portal-financeiro/index.ts` | upload · descartar · documentos · abrir | `curl` sem header → 401; token falso → 403 | ✅ publicada em 24/10 (autorizada pelo usuário) |
| `utils/sindicoPortalTabs.ts` + teste | "Prestação de contas" → "Financeiro"; sub-abas | teste verde | ✅ |
| `utils/financeiroDoSindico.ts` + `__tests__/financeiroDoSindico.test.ts` | situação, resumo do mês, motivos (espelho das RPCs) | teste verde | ✅ |
| `utils/origemLabel.ts` | rótulo de origem extraído de `ContasPagarParcelas` (reexportado lá) para o portal não carregar a tela inteira | tsc 0 | ✅ |
| `services/sindicoPortalService.ts` | tipos + 9 chamadas | tsc 0 | ✅ |
| `components/sindico/PainelFinanceiroDoSindico.tsx` | casca: sub-abas, mês, resumo, prestação de contas movida | teste de componente | ✅ |
| `components/sindico/TabelaTitulosDoSindico.tsx` | tabela PortalKit com filtros, busca persistida, documento e ações | teste de componente | ✅ |
| `components/sindico/LancarContaSheet.tsx`, `BaixaDoTituloSheet.tsx`, `FornecedorDoSindicoSheet.tsx` | lançar/editar, baixa, cancelar, fornecedor | teste de componente (baixa) + Playwright | ✅ código; Playwright ⏳ |
| `components/sindico/SindicoPortal.tsx` | aba Financeiro usa o painel novo | prévia do admin mostra tudo só leitura | ✅ |
| `services/condominioRateioService.ts` + `components/condominio/FinanceiroTab.tsx` | Despesas do admin: origem "· Síndico" | check-ui-standard | ✅ |
| `__tests__/components/SindicoPortal.test.tsx` | casos 7–10 (link, login, prévia, sem org própria); 6 ajustado à sub-aba | teste verde | ✅ |

Não feito (registrado): KPI "A pagar vencido" na Visão geral — exigiria uma segunda leitura
na abertura do portal; o número está no Resumo do mês do Financeiro.

## Riscos e limitações

- Processos (`payable.approved`/`payable.settled`) não disparam em título lançado pelo portal
  (o gatilho mora no navegador do app interno).
- Sem estorno de baixa pelo portal (a equipe estorna).
- Contas a receber só leitura e vazio no 010 até a primeira cota emitida.
- 007 só opera depois de ganhar organização própria.
- Sem conta bancária própria do condomínio (F4 do plano de 21/10), a baixa sai sem conta.

## Verificação

- [x] Prova da migration em bloco desfeito (24/10): 24 de 24 sondas com o resultado esperado —
  lançar 3 parcelas (org certa, APROVADO, autoria, categoria), editar, baixar, cancelar,
  fornecedor novo (com conta PIX) e existente (compartilhado, sem duplicar); recusas: cancelar
  pago, baixa futura, 007, centro de outro condomínio, título da Alpa, título de contrato,
  já pago sem conta, anexo fora da pasta, mês fechado, link sem login, prévia do admin, token
  falso. Achado na 1ª rodada e corrigido: `supplier_bank_accounts.account_type` é NOT NULL.
  Depois: nada ficou no banco (0 colunas, 0 funções, 0 linhas de prova).
- [x] Aplicada (24/10): 2 colunas, 8 RPCs, RLS no log; ACL sem `=X` de PUBLIC; escritas só
  `authenticated`.
- [x] `segurancaMigrations`, `migrationsPrefixo`, `orgContextGuard`, `orgDoCondominioGuard` verdes.
- [x] Testes do portal: 55 de 55 (5 arquivos).
- [x] `tsc --noEmit` completo: exit 0, nenhum `error TS`.
- [x] **Vazamento achado na extração dos dados e corrigido (24/10):** para o 007 (ainda na org
  da Alpa), a leitura entregava ao síndico os 296 fornecedores e 59 contas financeiras da
  Alpa. Os catálogos agora só vêm para condomínio com organização própria (o 007 não grava
  nada pelo portal). Migration reaplicada; conferido: 007 = 0/0/0/0, 010 = 46 contas, 5 fornecedores.
- [x] Playwright (`c:\tmp\pwtest\sindico_financeiro_prova.cjs`, servidor da frente, dados REAIS
  do 010/007 servidos por interceptação, escritas do síndico capturadas e respondidas sem
  gravar): **26 de 26**, 0 erro de JS/console, 0 escrita abortada. Pelo link: aba "Financeiro",
  4 sub-abas, 34 títulos, "Lançar conta"/"Pagar" desligados com o motivo. Logado (harness
  temporário com a casca real + `onLogout`, apagado depois): lançar 3 parcelas (corpo sem
  org/origem/status/alçada), baixa, fornecedor novo já escolhido; contrato com "Editar"
  desligado dizendo a origem; 007 todo desligado com o motivo. Celular sem rolagem lateral.
  **Os prints acharam 4 defeitos, corrigidos:** KPI "Contas em atraso" cortado ("R$ 14.95…");
  conta financeira de RECEITA oferecida em conta a pagar; toast cobrindo o botão do painel
  seguinte (foi para o topo); no celular, sub-aba ativa fora da tela (abas e mês empilhados).
- [x] `check-ui-standard.sh` limpo nos 8 arquivos tocados; `check-system-projects` limpo;
  `check-project-classification` acusa só `utils/diaryPlanningLink.ts` (já em `main`, não é desta frente).
- [x] Deploy da Edge (24/10, autorizado pelo usuário depois de o classificador barrar a 1ª
  tentativa). Sondas de fora: sem header → 401; anon + token falso → 403 "Link inválido";
  upload pelo link SEM login → 403; link real → código e nome de 3 boletos do 010 (200);
  "abrir" com o link real → URL assinada que baixa o PDF (200, application/pdf, 570 KB);
  "abrir" um título da Alpa com o mesmo link → 403 "Título não disponível para este acesso".
- [ ] Prévia do admin no app real (Portais › Portal do Condomínio › Ver como o síndico) — exige
  login de membro; coberta pelo teste de componente 9.

**Achado de DADO (não de código), para o usuário:** o Resumo mostra R$ 14.952,45 "em atraso" —
são títulos de 2017–2022 (boletos e contrato recorrente do 010/007) em aberto, sem baixa. O
síndico vai vê-los como contas vencidas; o mesmo aparece em Contas a Pagar do admin.
- [x] Suíte inteira: 11.139 = 11.095 + 10 (worker do V8 caiu; `blueprintCasaDeBombas` sozinho
  11/11) + 34 pulados, 0 falha. PR #129: CI verde, squash `5f8fff0`, CI de main verde;
  `conferir-producao.sh`: o domínio serve 5f8fff0 com "Lançar conta a pagar".
- [ ] Escrita real com o síndico do 010 — combinar com o usuário.

## Pedido de 24/10/2026 (tarde) — lançamentos de outro condomínio

> "veja print que no portal do condominio > portal do sindico > aba financeiro esta trazendo
> lancamentos que nao são do centro de custo do condominio"

**Causa (conferida no banco):** o recorte da RPC está certo — cada título vem de um centro de
custo com `empreendimento_id` de um prédio do síndico. Mas o ALTAIR é síndico do **007 - Bella
Vista** (centro 011) **e** do **010 - Galeria Altavista** (centros 010 e 029), e a tela somava os
dois: o banner falava do 007, enquanto o Resumo listava as "Fatura Contrato CTS-010-036-0001" (centro
029, do 010) e os KPIs davam R$ 14.952,45 em atraso (= 3.393,07 do 007 + 11.559,38 do 010). O
Resumo nem tinha a coluna Condomínio que as tabelas tinham.

**Decisão:** um condomínio por vez. Somar dois condomínios num KPI não descreve nenhum deles
(caixa, inadimplência e prestação de contas são de cada condomínio).

- [x] `condominioDoFinanceiro` + `doCondominio` em `utils/financeiroDoSindico.ts`, com teste
  (escolhido vale enquanto estiver no mandato; senão o primeiro; KPIs só do escolhido).
- [x] Seletor "Condomínio" ao lado do "Mês" (só com 2+ prédios, persistido), aplicado às 4
  sub-abas: Resumo, Pagar, Receber, Prestação (rateios e aprovação), banner e "Lançar conta".
- [x] Prova com o link REAL do ALTAIR (Playwright, servidor da frente; a leitura só atualiza
  o `last_used_at` do token): 007 → 14 contas, R$ 3.393,07, nenhuma fatura CTS-010; 010 → 20
  contas, R$ 11.559,38; Prestação do 007 = rateio 07/2026, do 010 = rateio 08/2026; celular
  390px empilha sem rolagem lateral; 0 erro de JS.
- [x] `tsc --noEmit` exit 0; `check-ui-standard.sh` limpo.
- [ ] PR + CI + publicação.

**Achado de DADO, para o usuário:** no 007 continua "NEW GRAN ROCHAS-ALPA CONSTRUTORA
2311-02-20170309.pdf" (R$ 896,56, venc. 30/04/2017, boleto capturado em 10/09/2026,
AGUARDANDO_APROVACAO) no centro 011 do condomínio — pelo nome, despesa da construtora
classificada no centro do condomínio. Não alterado.
