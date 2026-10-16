# Tempo limite das Edge Functions no navegador — 16/10/2026

## Pedido original

> analise essa mensagem de erro: Failed to send a request to the Edge Function

Diagnóstico entregue (resumo): `lib/supabase.ts` cortava TODA chamada do client em 20 s — inclusive
Edge Function. A busca por período da captura de boletos (01/05–16/10, um remetente) começou às
09:48:09 UTC, leu 6 faturas a 4–7 s cada e terminou às 09:48:41 (32 s): o navegador abortou aos 20 s
e mostrou a mensagem (é o `FunctionsFetchError` do supabase-js), com o trabalho feito no servidor
(16 e-mails, 6 boletos, 0 erros, nenhum duplicado). A função se dava 100 s por chamada (`PRAZO_MS`).
Outras funções longas do app (IA, importação) estavam sob o mesmo corte.

Proposta: (1) Edge Function espera 150 s no navegador, resto segue com 20 s; (2) na captura, chamada
da tela em lotes de ~15 s, com o painel chamando de novo. Resposta do usuário, literal:

> Faça os dois itens

## Plano

1. `lib/tempoLimiteRequisicao.ts` (novo, puro) — `tempoLimiteDaRequisicao(input)`: caminho
   `/functions/v1/` → 150 s (o gateway das Edge Functions corta em 150 s); resto → 20 s.
   `lib/supabase.ts` usa no `fetchWithTimeout`. As chamadas com fetch próprio (motor de conciliação
   180 s, import do ÒPURA Market) não passam por ele e não mudam.
   Pronto: `__tests__/tempoLimiteRequisicao.test.ts` (string/URL/Request; rest/rpc/auth/storage em 20 s;
   "functions" fora do caminho da API não engana).
2. `email-capture-sync` — `PRAZO_INTERATIVO_MS = 15_000` nos modos `agora` e `periodo`; o cron
   (`agendado`) segue com 100 s. Resposta ganha `pendente` (o lote parou com mensagem na fila).
   `emailCaptureService.sincronizarAgora` repete enquanto `pendente`, até 6 rodadas, e soma; o aviso
   na tela diz quando ainda ficou fila. O painel de busca já repetia enquanto a busca está ativa.
   Pronto: `__tests__/emailCaptureService.test.ts` (soma e para; limite de rodadas; função antiga sem
   `pendente` = uma rodada); `deno check` da função.

## Estado

- [x] 1 e 2 implementados com testes (92 verdes nos arquivos tocados), `deno check`, typecheck parcial,
  `check-ui-standard` limpo.
- [x] Publicado: função `email-capture-sync` (401 sem header) e push `9837357d`. Resposta do cron das
  10:00 UTC (lida em `net._http_response`) já traz `"pendente":false` (16 s, 6 releituras, prazo do cron).
- [ ] Prova pela tela (usuário): "Sincronizar agora" ou "Buscar período" sem o erro — o modo da tela
  exige membro da org; o usuário de leitura não dispara.
