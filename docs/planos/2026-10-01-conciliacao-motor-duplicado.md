# Conciliação: o motor roda em duplicata — trava, chamada longa e sugestões atômicas

## Pedido original

> Sim

Sessão df7b7923 · 2026-10-01. Resposta a "Faço essa correção?", depois do diagnóstico
abaixo. Origem: o usuário colou o aviso do Reprocessar
*"0 sugestão(ões) para revisar · falhou na memória: … bank_transactions_cost_center_id_v2_fkey … (23503)"*
e escolheu "Investigar o motor que estoura".

## Diagnóstico (medido em 01/10/2026)

- `runMatchingEngineTracked` chama a Edge `reconciliation-engine` pelo client global, que tem
  **corte de 20 s** (`lib/supabase.ts`, `REQUEST_TIMEOUT_MS`). Na Alpa a Edge leva **26 a 61 s**
  (`reconciliation_runs.duration_ms`).
- Aos 20 s o navegador aborta, cai no `catch` ("servidor indisponível") e **roda o motor no
  navegador**, enquanto a Edge continua. São dois motores na mesma conta, apagando e regravando
  sugestões e conciliando os mesmos registros. Pares no histórico: 21:55:11 e 21:55:35;
  21:58:43 e 21:59:04.
- A disputa estoura o `statement_timeout` de 8 s (o `authenticator` tem 8 s, e isso vale também
  para o service_role da Edge) e deixa execuções **presas em RUNNING** (2 hoje, em 2 contas).
  Daí a frase "Uma execução… não terminou" na Central.
- Isolados, com o banco calmo, os passos são rápidos: delete de sugestões de 100 extratos 30 ms,
  update de contraparte em 100 linhas 103 ms, leitura dos extratos da organização 7 ms.
- **Risco latente:** os dois caminhos (Edge e navegador) **apagam todas as sugestões da conta e
  só depois regravam**. Cair no meio deixa a conta sem sugestão.
- `reconciliation_suggestions` não tem índice em `bank_transaction_id`.

## Plano

### 1. `supabase/migrations/aplicar_20271001000020_motor_trava_e_sugestoes_atomicas.sql`
- RUNNING com mais de 10 min → `FAILED`, `error_code = 'INTERRUPTED'` (as 2 presas de hoje).
- Índice único parcial: no máximo **uma** execução `RUNNING` por conta. Essa é a trava, e vale
  para Edge e navegador.
- Índice em `reconciliation_suggestions(bank_transaction_id)`.
- `fn_replace_suggestions(p_bank_ids uuid[], p_rows jsonb)`: apaga e regrava numa transação só.
  SECURITY INVOKER; recusa linha fora dos extratos declarados; REVOKE PUBLIC/anon (REGRA #7).
- **Pronto quando:** aplicada; 0 RUNNING velhas; índices e função existem; ACL sem PUBLIC/anon;
  `segurancaMigrations` verde.

### 2. `supabase/functions/reconciliation-engine/index.ts`
- Antes de começar: marca como interrompida a RUNNING velha desta conta. Ao registrar a
  execução, conflito no índice único (23505) → **409 "já está rodando"**, sem rodar.
- Etapa 2.a passa a usar `fn_replace_suggestions`.
- **Pronto quando:** publicada (`supabase functions deploy`) e provada de fora: `curl` sem
  cabeçalho → 401 (REGRA #7, pergunta 3).

### 3. `services/bankReconciliationService.ts` + `lib/supabase.ts`
- A chamada da Edge sai do client global: `fetch` direto com corte de **3 min**.
- Decisão pura `decidirAposMotorServidor`, com teste: ok → usa o resultado; 409 → "já está
  rodando" (não cai para o navegador); corte de 3 min → "continua rodando no servidor" (não cai);
  rede fora / 404 / 5xx → cai para o navegador (o servidor não está rodando).
- Caminho do navegador: conflito ao registrar a execução (23505) → "já está rodando" (não roda);
  sugestões via `fn_replace_suggestions`.
- **Pronto quando:** testes da decisão verdes; typecheck; Reprocessar no navegador termina sem
  segunda execução no histórico (escrita real só com ok do usuário).

## Estado (01/10/2026)

- [x] 1. Migration **aplicada**. Testada antes em transação desfeita: troca de 741 sugestões de 5.709
  extratos em 395 ms (8 s é o limite), e sugestão de extrato fora da lista recusada. Depois de
  aplicar: 0 RUNNING; as 2 presas viraram `INTERRUPTED`; os 2 índices existem; ACL da função
  `{postgres, authenticated, service_role}` (sem PUBLIC/anon); 765 sugestões intactas;
  `segurancaMigrations` verde.
- [x] 2. Edge publicada (**v7**, `--no-verify-jwt` preservado): marca a RUNNING velha da conta como
  interrompida, devolve 409 no conflito do índice único, troca as sugestões por
  `fn_replace_suggestions`. **De carona:** o corpo passou a ser lido depois da credencial. Antes,
  `curl -d '{}'` sem cabeçalho dava 400 em vez de 401 (não vazava dado, mas é a prova da REGRA #7).
  **Provado de fora:** sem cabeçalho → 401; só chave anon → 401.
- [x] 3. Cliente: chamada da Edge por `fetch` direto com corte de 3 min. `decidirAposMotorServidor`
  (`utils/motorServidor.ts`, 5 testes) só cai para o navegador com o servidor fora (rede/404/5xx);
  corte de tempo, 409, 401 e 403 não caem. O navegador recusa quando o registro da execução bate no
  índice único, e troca as sugestões pela função.
  `tsc` 0. Suíte: 6.567 passaram, 0 falharam. 19 testes do `BlueprintEditor.test.tsx` ficaram
  inacabados na hora do relatório (instabilidade conhecida do vitest aqui); isolado, ele passa:
  193/193.
- [ ] **Prova ponta a ponta:** um Reprocessar real na Sicredi da Alpa, conferindo em
  `reconciliation_runs` que sai UMA execução e que ela fecha (DONE/FAILED, não RUNNING). É escrita:
  o usuário clica.

## Verificação
Testes, `tsc`, `segurancaMigrations`, estado do banco depois da migration, `curl` 401 na Edge
publicada, e o histórico de `reconciliation_runs` depois de um Reprocessar real.
