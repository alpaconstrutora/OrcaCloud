# `client_portal_tokens` — fechar a leitura anônima

## Pedido original

> **Usuário, 2026-09-04 (sessão `856f188e-e1b1-439f-8f57-d4475a7fe60d`), transcrito literalmente:**
>
> corrigir : Pendente: o achado de segurança que relatei continua de pé — client_portal_tokens

O achado a que ele se refere foi relatado por mim na mesma sessão, ao montar a
aba Dashboard de Meus Clientes (commit `cbb2e07`), que precisou contar links de
portal e por isso passou por `client_portal_tokens`.

## O achado

`client_portal_tokens.token` **é** a credencial: `/portal-cliente?token=<uuid>`
abre o portal inteiro daquele cliente — financeiro, contratos, documentos do
GED, dados da unidade.

A policy criada em `20261128000001` era:

```sql
CREATE POLICY "client_portal_tokens_public_select" ON public.client_portal_tokens
    FOR SELECT USING (is_active = TRUE AND expires_at > NOW());
```

Sem cláusula `TO`, ela vale para PUBLIC — `anon` incluído — e `anon` tinha
`SELECT` na tabela. **A expressão descreve o estado do token, não quem pode
lê-lo.** É exatamente a Pergunta 1 da REGRA OBRIGATÓRIA #7: essa perna sozinha
libera toda linha viva.

Comprovado contra produção em 2026-09-03, com a publishable key que vai no
bundle do frontend — não é inferência:

```
GET /rest/v1/client_portal_tokens?select=client_id,token,expires_at
→ 200
[{"client_id":"a11cb38d…","token":"79c4990c-7ca1-4635-a60f-915858b0310f","expires_at":"2026-10-23…"}, …]
```

### Alcance, medido

Sondei as tabelas irmãs com a mesma chave, para saber se o padrão se repetia:

| Tabela | Resposta à chave pública | Veredito |
|---|---|---|
| `client_portal_tokens` | **200 com os tokens** | ❌ o vazamento |
| `supplier_portal_tokens` | 200 `[]` | ok — RLS sem policy permissiva para anon |
| `investor_portal_tokens` | 200 `[]` | ok |
| `partner_portal_tokens` | 200 `[]` | ok |
| `condomino_portal_access` | 401 `permission denied` | ok — é a postura alvo |

Só uma tabela estava aberta. `condomino_portal_access` mostra a postura certa:
anon sem GRANT nenhum.

## Por que dá para simplesmente remover

O comentário original dizia *"Leitura pública (necessária para validar sem
login)"*. Era verdade em 28/11/2026. Deixou de ser: toda a entrada anônima do
portal passa por RPC `SECURITY DEFINER`, que ignora RLS.

Conferido no banco **antes** de mexer — as 18 funções `client_portal_*` /
`fn_portal_*` são todas `prosecdef = true`, e `anon` executa só as de leitura do
portal (`client_portal_generate_token` já está fechada para anon desde a
auditoria de 01/09).

Quem lê a tabela direto, e por que segue funcionando:

| Chamador | Papel | Coberto por |
|---|---|---|
| `clientPortalService.getTokenForClient` / `revokeToken` | admin autenticado | `client_portal_tokens_org_access` |
| `condominioAcessoService.mapearPorCliente` | membro da org | idem |
| `ClientList` (contagem de links no Dashboard) | membro da org | idem |
| Edge Function `portal-ged-download` | service_role | não passa por RLS nem GRANT |

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20270919000004_rls_client_portal_tokens_sem_leitura_anon.sql` | `DROP POLICY` da pública + `REVOKE ALL … FROM anon` + `COMMENT ON TABLE` dizendo por quê | Bloco de conferência: `policy_publica=0`, `policies_restantes=1`, `anon_le=false`, `authenticated_le=true`, `rls_ligada=true` |
| 2 | prova de fora | `curl` com a publishable key | Era `200` com os tokens; tem de virar **401** |
| 3 | prova de que não quebrou | link real de portal aberto no navegador | Portal carrega e as abas trazem dado |
| 4 | `scripts/check-rls-postura.sh` | verificação **9**: sonda as tabelas de credencial com a chave publicável | Roda e imprime "✅ nenhuma devolve linha"; o ramo que ACUSA (`[{`) testado à parte |

**Duas travas, não uma.** Remover só a policy deixaria a tabela um `CREATE
POLICY` distraído de distância do mesmo vazamento; sem o GRANT, o PostgREST
recusa antes de chegar na RLS. `authenticated` não é tocado — é por ele que o
admin gerencia os links.

## Estado

- [x] Item 1 — migration escrita e **APLICADA** (2026-09-04): `policy_publica=0`,
      `policies_restantes=1`, `anon_le=false`, `authenticated_le=true`, `rls_ligada=true`
- [x] Item 2 — a chave pública passou de `200` com os tokens para **`401 permission denied`**
- [x] Item 3 — link real (Defensoria) reaberto no navegador: portal carrega,
      abas Dados da Unidade / Financeiro / Contratos / Condomínio com dado, sem erro de console
- [x] Admin autenticado segue enxergando os links (Dashboard de Meus Clientes:
      "Com link ativo" = 5, "Sem link" = 16)
- [x] Item 4 — verificação 9 no `check-rls-postura.sh`, e o script fecha
      "✅ postura limpa nas 9 verificações"

## Por que a verificação 9 existe

As oito verificações anteriores olham policies, GRANT de **função**, cron e Edge
Functions. **Nenhuma perguntava a coisa mais simples: o que a chave pública
consegue LER?** Esse era o ponto cego que deixou o vazamento passar — a policy
"parecia" restritiva lendo o SQL, e só a resposta HTTP desmentia.

A sonda espera `401` (sem GRANT — a melhor postura, a de
`condomino_portal_access` e `employees`) ou array **vazio** (GRANT existe, RLS
fecha). Qualquer linha devolvida é falha. É a mesma lógica da verificação 8, um
andar abaixo: lá functions, aqui tabelas.

## Relacionados

- `docs/planos/2026-09-02-correcao-auditoria-seguranca.md` — a auditoria que
  criou a REGRA #7. Este achado é POSTERIOR a ela: a auditoria varreu funções
  `SECURITY DEFINER` sem `REVOKE` (Pergunta 2), e esta é uma policy de tabela
  (Pergunta 1) que passou.
- `scripts/check-rls-postura.sh` — verificação 8 (sonda HTTP com a chave
  pública) é a que teria pego isto. Ela sonda uma lista de alvos; vale
  acrescentar as tabelas de credencial de portal a essa lista.
