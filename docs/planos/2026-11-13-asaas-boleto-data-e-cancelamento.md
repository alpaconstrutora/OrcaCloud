# Asaas — data do pagamento de boleto e cancelamento que espera autorização

## Pedido original

Sessão de 13/11/2026 (Claude Code, VS Code), literal:

> Dois problemas com o Asaas:
> 1. Ao cadastrar um boleto com data de vencimento futuro eu nao consigo escolher uma data diferente, por exemplo a data do dia.
> 2. Quando clico para cancelar um boleto, tenho que entrar na conta do asaas pedir para enviar um SMS e autorizar. Isso nao poderia ser feito automaticamente sem ter que entrar na conta?

## O que foi medido (13/11/2026)

- Os 4 pagamentos de boleto do dia (vencimento 30/11) foram enviados SEM `scheduleDate` — a tela
  "Pagar boleto via Asaas" não tem campo de data. A Asaas gravou `scheduleDate = 2026-11-30`: sem a
  data, ela agenda para o VENCIMENTO (a doc diz "imediato", o comportamento real é outro).
- Cancelamento: `asaas-payment` (action `cancel`) trata qualquer 2xx como cancelado — grava
  CANCELLED e devolve o boleto a "aprovado" sem ler a resposta. Quando a Asaas exige autorização
  (token SMS/app), o OrçaCloud mostrava "cancelado" enquanto, na Asaas, o pagamento seguia agendado
  até alguém autorizar. Os 4 de hoje foram autorizados e estão CANCELLED na Asaas (GET /bill/{id}).
- Documentação da Asaas (lida 13/11): não documenta endpoint para autorizar ação crítica pela API,
  nem se o cancelamento dispara ação crítica; o desligamento do "Evento crítico em requisições de
  saque" vale para IPs da whitelist (o OrçaCloud não tem IP fixo) e não cita cancelamento.

## Decisões de desenho

1. **Data do pagamento** (`utils/asaasBoletoPagamento.ts`, puro): a tela oferece "o quanto antes"
   (a `minimumScheduleDate` da simulação — normalmente hoje) ou "agendar para" uma data até o
   vencimento. A data vai SEMPRE explícita no `scheduleDate` (cliente antigo sem data → o servidor
   simula e usa a data mínima, nunca deixa a Asaas cair no vencimento). Conta vencida segue sem
   data (pagamento imediato; a doc proíbe agendar vencida). Status local: SCHEDULED só se a data é
   depois de hoje.
2. **Cancelamento honesto**: só é "cancelado" quando a Asaas diz CANCELLED na resposta (ou 404).
   Senão o pedido fica registrado (`cancelled_by_email`/`cancelled_at`, status inalterado), a linha
   mostra "Cancelamento pedido — autorize na Asaas" e o status vira CANCELLED pelo aviso da Asaas
   (webhook-gatilho) ou pela consulta automática — o gatilho de auditoria atribui ao usuário que
   pediu (`cancelled_by_email`).
3. **Não exigir o SMS**: fora do alcance do código — depende da Asaas. Registrar as opções ao usuário
   (autorizar pelo app da Asaas em vez de SMS; pedir à Asaas a dispensa para cancelamento via API,
   já que a validação de saque por webhook está ativa; whitelist exige IP fixo).

## Itens

| # | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| 1 | `utils/asaasBoletoPagamento.ts` + teste | teste verde | ✅ 7/7 |
| 2 | `asaas-payment`: quote devolve data mínima e vencimento; pay manda data explícita; cancel só confirma com CANCELLED | deno check; publicação da Edge pelo usuário (deploy de função é barrado para mim) | ✅ deno check; ⏳ deploy pelo usuário |
| 3 | Tela: campo de data no "Pagar boleto via Asaas"; selo/aviso de cancelamento pedido | check-ui-standard; tsc | ✅ ui exit 0 nos dois; tsc 0; 143 testes Asaas/Contas a Pagar |
| 4 | PR, CI, merge | CI verde; conferir-producao | ✅ PR #400 mesclado (`53847559`); 1ª CI caiu num teste do Diário que passou 3/3 local e no `main` (intermitente); Edge publicada pelo usuário (v24) |
| 5 | Pedido do usuário em 14/11/2026, depois de analisar as páginas "Cancelar pagamento de contas" e "Webhook para Pague Contas" ("Quer que eu faça? Sim"): consultar `canBeCancelled` ANTES de pedir o cancelamento, como a doc manda. `decisaoDoCancelamento` (pura, 4 testes): já CANCELLED na Asaas → fecha aqui sem novo pedido; não cancelável → motivo legível sem disparar pedido nem SMS; consulta que falha → pede como antes | testes; deno check; Edge pelo usuário | ⏳ |
