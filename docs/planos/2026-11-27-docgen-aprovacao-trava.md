# Ofícios: só a aprovação marca o ofício como aprovado

## Pedido original

Na sessão, o assistente relatou um achado de outro revisor — *"um membro da organização
consegue marcar um rascunho como aprovado direto, sem passar pela aprovação que o modelo
exige"* — e perguntou: *"Quer que eu corrija isso numa frente separada?"*. O usuário respondeu:

> sim

Sessão: bef90ec4-4d31-470b-a193-71ce97673653 · 27/11/2026

## O que foi encontrado (27/11/2026, antes de corrigir)

- **Reproduzido em produção** (BEGIN … ROLLBACK, membro comum `member` da org 926cf626, modelo
  com `exige_aprovacao = true`): emitir sem aprovação → recusado; `PATCH approval_status =
  'APROVADO'` → `ok:1`; emitir → `ok:OF-0001/2026`; o histórico registrou "APROVADO por <quem
  fez o PATCH>". `INSERT` de rascunho já `APROVADO` → emitir → `ok:OF-0002/2026`.
  Em 27/11 há 0 ofícios em produção — nenhum dado a revisar.
- **Por que passava**: a RLS de `doc_gen_documentos` só confere a organização;
  `fn_doc_gen_congelar` deixa `approval_status` livre no rascunho (é o campo que a aprovação
  muda); `trg_zz_alcada_trava_passo` só dispara em `UPDATE OF approval_chain`.
- **Causa raiz**: a trava que fecha isso já existe — `fn_alcada_guarda`, na
  `aplicar_20271118915100_alcada_trava_servidor.sql` (F14, PR #576), que cobre
  `doc_gen_documentos` e mais 7 tabelas — mas **nunca foi aplicada** (em 27/11
  `trg_alcada_guarda` não existe em nenhuma tabela). E ela **não aplica como está**: os
  `ALTER FUNCTION … SET orcacloud.alcada_servidor = 'on'` dão `42501: permission denied to set
  parameter` com o papel `postgres` do `db query` (não é superusuário no Supabase; a prova de
  18/11 rodou num PGlite, como superusuário).
- **Quem grava a aprovação do ofício hoje** (o mapa que a trava não pode quebrar):

  | transição | quem | como |
  |---|---|---|
  | RASCUNHO/REJEITADO → PENDENTE | quem edita o ofício | `fn_alcada_enviar` (INVOKER, liga `orcacloud.alcada_servidor`) via `approvalService.submit` |
  | PENDENTE → PENDENTE (nível 1 de 2) / APROVADO | aprovador da alçada (`fn_alcada_pode_aprovar`: `approval_approvers` com `entity_type = 'doc_gen_documento'`; sem ninguém cadastrado no nível, qualquer membro) | `fn_alcada_aprovar` + `fn_alcada_trava_passo` |
  | PENDENTE → REJEITADO | aprovador da alçada | `fn_alcada_rejeitar` |
  | PENDENTE → RASCUNHO | quem edita | `UPDATE` direto (`docGenDocumentoService.retirarDaAprovacao`) |
  | APROVADO → RASCUNHO | o banco, quando o texto muda | `fn_doc_gen_congelar` |
  | (lê) APROVADO para emitir | quem emite | `doc_gen_emitir` (DEFINER) |

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 27/11 | Trava nova só para ofício, ou a da 915100? | A da 915100, **sem mudar o corpo** (uma regra só, já revisada), ligada só em `doc_gen_documentos`. A função só é criada se não existir — a 915100, quando aplicada, prevalece e estende às 8 tabelas. |
| 27/11 | Corrigir as outras 7 tabelas aqui? | Não (escopo do pedido). Listadas abaixo, com prova; a 915100 precisa de conserto antes de aplicar. |

## Plano

1. `supabase/migrations/aplicar_20271128410000_docgen_aprovacao_trava.sql`. **Muda**: cria
   `fn_alcada_guarda` (corpo idêntico ao da 915100, só se não existir), REVOKE de PUBLIC/anon,
   `trg_alcada_guarda` BEFORE INSERT OR UPDATE em `doc_gen_documentos`. **Pronto quando**:
   `segurancaMigrations`/`migrationsPrefixo` verdes; o ensaio da prova (item 2) dá `TUDO OK`
   com a migration (1× e 2×) e falha sem ela; **aplicada pelo usuário** e a prova direta dá
   `TUDO OK`.
2. `scripts/teste-docgen-aprovacao-trava.sql`. **Muda**: prova BEGIN … ROLLBACK com os ataques
   (PATCH para APROVADO e emitir; PENDENTE→APROVADO; REJEITADO→APROVADO; cadeia forjada; INSERT
   aprovado ou com passo; níveis rebaixados) e os caminhos legítimos (enviar, não-aprovador
   recusado, emitir em aprovação recusado, aprovar 2 níveis, texto editado volta a RASCUNHO,
   reenviar e emitir, retirar da aprovação, rejeitar e reenviar, modelo sem exigência emite
   direto, prazo do emitido). **Pronto quando**: sem a migration falha em "a marca o rascunho
   APROVADO direto (PATCH)" (veio `ok:1`); com ela, `TUDO OK`.

## Estado

27–28/11/2026, branch `feat/docgen-aprovacao-trava`:

- [x] 1 migration — escrita; ensaio `TUDO OK` (1× e 2×); **não aplicada** (com o usuário).
- [x] 2 prova — RED sem a migration (`FALHOU: a marca o rascunho APROVADO direto (PATCH) (veio
  ok:1 …)`), `TUDO OK` com ela.
- [ ] aplicar a migration e rodar a prova direto (usuário).

### Fora deste PR (mesmo padrão, sem correção aqui)

Sonda de 27/11 (BEGIN … ROLLBACK, membro comum da org dona, `UPDATE … SET approval_status =
'APROVADO'` num item não aprovado): **`ok:1` e ficou APROVADO** em `internal_transactions`
(item PENDENTE), `contracts`, `purchase_orders`, `process_instance_steps` e
`blueprint_snapshots`. `purchase_requests` e `project_risks` não tinham item de teste, mas têm a
mesma estrutura (só `trg_zz_alcada_trava_passo`, em `UPDATE OF approval_chain`;
`fn_purchase_requests_guard` não protege `approval_status`). É o F14, que a 915100 fecha — mas
ela falha ao aplicar (os `ALTER FUNCTION … SET`, acima). Conserto possível, a decidir: trocar os
`ALTER FUNCTION … SET` por `set_config(…, true)` dentro das seis funções, ou
`GRANT SET ON PARAMETER orcacloud.alcada_servidor` por quem tiver o privilégio.

## Verificação

- Ensaio: `bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-docgen-aprovacao-trava.sql
  supabase/migrations/aplicar_20271128410000_docgen_aprovacao_trava.sql` e
  `npx supabase db query --linked -f /tmp/e.sql` → `TUDO OK`.
- Depois de aplicada: `npx supabase db query --linked -f scripts/teste-docgen-aprovacao-trava.sql`
  → `TUDO OK`.
- Tela: Documentos › Ofícios — enviar para aprovação, aprovar em Financeiro › Aprovações,
  emitir; retirar da aprovação; editar um aprovado (volta a rascunho).
