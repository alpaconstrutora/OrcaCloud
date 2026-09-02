# Provas de conceito — auditoria 2026-09-01

Os três scripts abaixo foram executados contra o **banco de produção** e são o que
sustenta a marcação "COMPROVADO EM PRODUÇÃO" no relatório.

| Script | Achado | O que prova |
|---|---|---|
| `poc-c1-01-escalada-owner.sql` | C1-01 (crítica) | Usuário autenticado sem vínculo se torna `owner`: `is_org_manager` FALSE→TRUE, `internal_transactions` visíveis 0→2214. |
| `poc-c3-01-token-portal-anon.sql` | C3-01 (crítica) | Papel `anon` emite token de Portal do Cliente e lê os dados cadastrais do titular, mesmo lendo 0 linhas de `clients` diretamente. |
| `poc-c1-05-is-shared-cross-tenant.sql` | C1-05 (alta) | Usuário sem vínculo nenhum lê 7 clientes + 119 fornecedores + 1 workspace de parceiro. |
| `poc-c3-02-portal-rpcs-anon.sql` | C3-02 (crítica) | Papel `anon`, só com o UUID do colaborador, lê o cadastro e as **folhas de pagamento** — mesmo sem ter `GRANT SELECT` na tabela `employees` (chamada direta falha com `42501`). |
| `regressao-c3-02-portal-por-token.sql` | C3-02 (regressão) | O caminho CERTO continua de pé: como `anon`, com token válido, `fn_colab_portal_*` devolve os dados; com token inválido, `PORTAL_TOKEN_INVALIDO`. Cria e descarta um token de teste. |
| `regressao-1-4b-token-portal-por-papel.sql` | C3-01 (regressão) | Emitir credencial exige owner/admin **da** organização: gestor emite, membro comum e usuário sem vínculo recebem `not_allowed`. Cria e descarta um token de teste. |

## São seguros de reexecutar

- Os que escrevem (`c1-01`, `c3-01`, as duas de regressão) terminam em `RAISE EXCEPTION` dentro de
  `BEGIN`. A exceção **aborta a transação por construção** — não é uma promessa do
  script, é semântica do Postgres. O resultado da prova viaja na mensagem da
  exceção justamente porque o `ROLLBACK` descarta qualquer result set.
- `c1-05` e `c3-02` são somente leitura.
- Nenhum dado foi criado, alterado ou removido durante a auditoria.
- Por rodarem via `supabase db query --linked` (conexão como `postgres`), cada
  script usa `SET LOCAL ROLE` para **rebaixar-se** ao papel que se quer testar
  (`anon` ou `authenticated`) e `SET LOCAL request.jwt.claims` para simular a
  identidade. Sem isso a RLS não seria aplicada e a prova não valeria nada.

## Como rodar

```bash
cd orçacloud-saas
npx supabase db query --linked -f docs/security-audit/provas/<script>.sql
```

Os dois scripts com `RAISE EXCEPTION` terminam em **exit code diferente de zero e
uma mensagem de erro `P0001`** — isso é o resultado esperado, não uma falha: a
mensagem é o relatório da prova.

## Depois da correção

Estes scripts viram teste de regressão. Com C1-01 corrigido,
`poc-c1-01-escalada-owner.sql` deve falhar no `INSERT` com violação de RLS, em vez
de chegar ao `RAISE EXCEPTION` final. Com C3-01 corrigido, a chamada a
`client_portal_generate_token` deve falhar por permissão negada.
