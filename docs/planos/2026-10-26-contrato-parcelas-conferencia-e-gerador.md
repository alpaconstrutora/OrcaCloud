# Contrato › Financeiro › Parcelas — conferência com o valor do contrato, correção e gerador

## Pedido original

> pode fazer uma melhoria:
> 1. o valor total do contrato deve bater com o valor das parcelas. entao implemente um aviso de divercencia e em parcelas mostre o saldo a mais ou a menos.
> 2. implemente  acao para corrigir o valor do contrato ou o valor das parcelas.
> 3. implemente gerador de parcelas a partir do valor do contrato por numero de parcelas
> 4. sugira melhorias

Sessão `28d65126-a526-45e0-8d6a-3e30e5f1eef2` · 26/10/2026. Veio do caso CTS-042-0001
(Suprimentos › Contratos): Valor Atual R$ 2.850,00, parcelas R$ 2.700,00.

## Fato medido (26/10/2026)

CTS-042-0001: `original_value` 2.700 · `current_value` 2.850 · `payment_schedule`
[1.000 em 11/05, 1.700 em 11/06] · aditivo **AD-001 "Pintura Interna", `value_impact` 150,
Aprovado em 30/05**. O aditivo subiu o Valor Atual (`updateContract`: atual = original +
Σ aditivos aprovados) e **não gerou parcela** — é a divergência.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 26/10 | As parcelas devem igualar qual valor? | **Valor Atual** (original + aditivos aprovados + reajustes) |
| 26/10 | Gerador num contrato que já tem parcelas | **Mantém as pagas, refaz as abertas** (base = Atual − pago), com prévia |
| 26/10 | Aditivo aprovado com valor gera parcela sozinho? | **Não agora** — só o aviso e as ações; fica como sugestão |
| 26/10 | Parte 1 (regra e aviso) | Aprovada |
| 26/10 | Parte 2 (correção, gerador, sugestões) | Aprovada |

Decorrências registradas no desenho aprovado:
- Vale para contrato **À Vista ou Parcelado**, a pagar ou a receber (`CONTRACT_AVISTA`,
  `CONTRACT_PARCELADO`); recorrente e medição ficam fora (não têm total a casar).
- Soma das parcelas = não canceladas, valor BRUTO (`original_amount ?? amount`, como o
  "Alterar valor" já faz), pagas ou em aberto. Tolerância R$ 0,01.
- Toda gravação passa pelo **cronograma** (`payment_schedule`) + a sincronização existente
  (`planejarSyncParcelas`): um caminho de gravação só.
- Parcela cujo valor muda volta a **"Aguardando aprovação"** — automático: a sincronização
  apaga e recria a aberta, e o gatilho `fn_titulo_nasce_na_alcada` só restaura APROVADO com
  o MESMO valor.

## Riscos conhecidos (do código lido)

1. **Valor manual vence o cronograma.** `planejarSyncParcelas` mantém o `amount` da parcela
   aberta com `valor_manual` (e a data com `vencimento_manual`). Distribuir/gerar sem limpar
   essas marcas nas abertas tocadas não mudaria nada — em silêncio. → limpar a marca das
   abertas que a ação reescreve (C1/C3).
2. **Casamento por posição.** Baixada fica pela referência `:pN` (índice no cronograma). Se
   houver aberta ANTES de uma paga, remontar o cronograma descasa. → o gerador e a
   distribuição só operam quando as pagas formam um prefixo (`:p1…:pk`); senão recusam com
   o motivo.
3. Parcela com pagamento Asaas em curso (`supplier_payments` APPROVED/PENDING/SCHEDULED) não
   se reescreve → recusa com o motivo.

## Plano

### Regra pura

- [ ] **U1. `utils/conferenciaParcelasContrato.ts`** — `conferirParcelas(contrato, parcelas,
  aditivos)` → `{ aplica, valorContrato, somaParcelas, saldo, situacao: 'confere'|'faltam'|'excedem',
  aditivosSemParcela: [{numero, valor}] }`; `planoDeDistribuicao(parcelas, saldo)` →
  novos valores das abertas (iguais, centavos na última) ou `{ motivo }` (zera/negativa,
  sem aberta, Asaas em curso, pagas fora de prefixo); `planoDoGerador(contrato, parcelas,
  gerador)` → cronograma novo (pagas mantidas + N novas sobre `Atual − pago`) ou `{ motivo }`;
  `parcelaComplementar(cronograma, saldo, vencimento, descricao)`.
  Teste `__tests__/conferenciaParcelasContrato.test.ts`: CTS-042-0001 (faltam 150, causa
  AD-001), confere, excedem, recorrente não aplica, cancelada fora da soma, bruto vs líquido,
  distribuição com centavos, recusa por negativo, recusa por paga fora de prefixo, gerador
  com 1 paga + 3 novas.
  **Pronto quando:** teste verde, visto vermelho antes.

### Serviço

- [ ] **S1. `services/contractService.ts`** — `corrigirParcelas(contrato, acao)` com
  `acao = { tipo: 'complementar', vencimento, descricao } | { tipo: 'distribuir' } |
  { tipo: 'gerar', gerador }`: monta o cronograma pela U1, limpa `valor_manual`/
  `vencimento_manual` das abertas reescritas, grava `payment_schedule`
  (+ `payment_term_type: 'Parcelado'` e `payment_installments` no gerar) e chama a
  sincronização existente; `ajustarValorAoTotalDasParcelas(contrato)`: Valor Original =
  soma − Σ aditivos aprovados (o `updateContract` recalcula o Atual).
  **Pronto quando:** teste do serviço (supabase simulado) cobre os 4 caminhos e a limpeza
  da marca manual; prova no banco com o CTS-042-0001 em transação desfeita (complementar →
  3 parcelas, soma 2.850, a nova PENDENTE).

### Telas (REGRA #1: guia lido; `check-ui-standard.sh` em cada arquivo; REGRA #4: painel lateral)

- [ ] **T1. `components/ContractDetailView.tsx`** — sub-aba Parcelas: 4º card "Saldo vs.
  contrato" (Confere verde / Faltam ou Excedem vermelho, `sub` "Contrato R$ X · Parcelas R$ Y");
  faixa de aviso abaixo dos cards com a causa provável (aditivo sem parcela) e o botão
  "Corrigir divergência"; linha de total no rodapé da tabela (Soma · Contrato · Saldo);
  botão "Gerar parcelas". Não aparece em recorrente/medição.
  **Pronto quando:** no navegador, o CTS-042-0001 mostra "Faltam R$ 150,00" e a causa AD-001.
- [ ] **T2. `components/contracts/CorrigirDivergenciaSheet.tsx`** (novo) — `Sheet` com as 3
  opções (complementar, distribuir, ajustar o contrato), prévia antes/depois, botão
  desligado com o motivo.
  **Pronto quando:** cada opção mostra a prévia certa e grava; recusas dizem o motivo.
- [ ] **T3. `components/contracts/GerarParcelasSheet.tsx`** (novo) — `Sheet` com nº de
  parcelas, periodicidade, 1º vencimento, entrada; base = Atual − pago; prévia; recusa com motivo.
  **Pronto quando:** gerar 3 parcelas num contrato de teste deixa a soma = Valor Atual.

## Sugestões registradas (fora do escopo, item 4 do pedido)

1. Aditivo com impacto de valor gerar a parcela ao ser aprovado (ataca a causa do CTS-042-0001).
2. Coluna/filtro "Divergência" na lista de Contratos + card "Contratos com divergência".
3. Aviso ao ativar/assinar contrato com divergência.
4. Retenção de garantia: mostrar quanto do saldo é retenção.
5. Histórico de ajustes (quem, quando, antes/depois).
6. Contrato por medição: "saldo a medir" (Atual − medido).

## Estado

- [x] Desenho aprovado (Partes 1 e 2)
- [ ] Plano aprovado pelo usuário
- Implementação: 0 de 5 itens

## Verificação

1. `npx vitest run __tests__/conferenciaParcelasContrato.test.ts` + teste do serviço.
2. `npm run typecheck` (grep `error TS`) e suíte completa.
3. Banco: CTS-042-0001 em transação desfeita (complementar → soma 2.850, nova parcela PENDENTE).
4. Navegador: contrato com divergência (aviso + 3 ações), contrato que confere (verde), recorrente (sem card), gerar parcelas.
5. `check-ui-standard.sh` nos 3 componentes; `orgContextGuard.test.ts`.
