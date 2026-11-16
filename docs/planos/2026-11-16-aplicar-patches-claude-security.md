# Aplicar os patches da varredura Claude Security (15–16/11/2026)

## Pedido original

> Todos eles

Sessão: `ef9d394e-216b-4a82-8e74-8476ec75f63b` · 16/11/2026 ~17:00.

Resposta à minha pergunta, no fim do relatório dos patches: *"Quer que eu aplique algum desses
patches, ou abra um pull request com algum deles?"*. Antes disso, na mesma sessão: varredura
Claude Security do repositório inteiro (15/11, base `a3c7923d`, 44 achados: 1 CRITICAL,
8 HIGH, 16 MEDIUM, 19 LOW) e geração de patches para **todos os 44** (16/11). 24 achados
ganharam patch; 20 ficaram sem patch, cada um com uma nota do motivo e do que falta.

Relatório e patches (fora do git): `C:\D\frentes\security-scan\CLAUDE-SECURITY-20261115-005039\`
— `CLAUDE-SECURITY-RESULTS.md` e `patches/PATCHES.md` (índice; cada `F<n>.md` explica o patch).

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 16/11 | Quais patches aplicar? | "Todos eles" — os 24. F62 e F73 são o MESMO diff (aplicado uma vez); F76 e F77 também. São 22 diffs distintos. |
| 16/11 | Prefixo das migrations | Os patches foram escritos com `20271115000000…006900`, anteriores a migrations que já estão na `main` (até `20271116850000`). Renomeadas para `2027111690xxxx` (mesma ordem, mesmos sufixos), referências no código ajustadas. |

## Mudanças de comportamento que o usuário aceitou ao pedir "todos"

- **F10** — `sinapi-import` passa a exigir superadministrador da plataforma (`public.superadmins`). Owner/admin de organização deixa de importar SINAPI.
- **F12 / F61 / F68** — IA com cota diária: `read-matricula` 200/usuário e 500/org; `bi-narrative` 100/usuário e 300/org; `planta-ia` pedido 300/1000, rastrear 60/200; texto do `planta-ia` limitado a 2000 caracteres e nome do `bi-narrative` a 120.
- **F69** — `fn_set_broker_property_access` sem o atalho `admin@admin.com`: chamada sem membro no token (service_role, SQL como postgres) passa a ser recusada.
- **F76** — arquivos privados do Storage deixam de ter cópia offline no service worker.

## Plano

Um item por achado. "Pronto" = código na `main` **e** a parte de banco/function no ar, provado de fora.

| Achado | O que muda | Banco | Edge Function | Como sei que terminou |
|---|---|---|---|---|
| F1 CRITICAL | sai `portal_tokens_public_select`; REVOKE de anon | `aplicar_20271116900000` | — | anon `GET /rest/v1/portal_tokens` devolve `[]`/erro (check-rls-postura, verificação 8) |
| F2 HIGH | credenciais do scraper saem do arquivo para env | — | — | arquivo sem senha; **senha trocada pelo usuário** (segue no histórico do git) |
| F4 HIGH | `broker_portal_tokens` sem leitura anon; helper só da equipe | `aplicar_20271116900400` | — | anon `GET broker_portal_tokens` sem linha |
| F8 HIGH | bucket `documents`: policies por organização do caminho; relatório/galeria gravam `reports/<org>/`, `gallery/<org>/` | `aplicar_20271116900800` (**DEPOIS** do deploy do código) | — | 5 policies novas, 4 antigas fora; anon não lista o bucket |
| F10 MEDIUM | `sinapi-import` só superadmin | — | `sinapi-import` | POST com conta não superadmin = 403 |
| F12 MEDIUM | `read-matricula` exige membro + cota | `aplicar_20271116901200` | `read-matricula` | POST sem membro = 403 |
| F15 / F16 | escape no HTML das janelas de impressão (proposta, etiqueta QR) | — | — | código na main |
| F18 / F19 | `dunning-notifier`: modo manual exige membro; e-mail com valores escapados | — | `dunning-notifier` | POST de outra org = 403 |
| F56 | HMAC do webhook dentro do try | — | `planta-webhooks` | deploy |
| F57 (fecha também F3) | guarda contra `../` no `partner-portal-download` e na RPC | `aplicar_20271116905700` | `partner-portal-download` | RPC recusa `partner-uploads/<ws>/../x` |
| F58 | canal Realtime `blueprint:ramo:*` privado, com policy | `aplicar_20271116905800` (**ANTES** do código) | — | policies em `realtime.messages` |
| F60 | link `javascript:` recusado no comunicado de condomínio | — | — | código na main |
| F61 | `bi-narrative` exige membro + cota | `aplicar_20271116906100` | `bi-narrative` | POST sem membro = 403 |
| F62 (= F73) | chave do tour do portal sem o token (hash) | — | — | código na main |
| F65 | escape no e-mail de alerta de tarefa | — | `task-alert-notifier` | deploy (o POST sem credencial segue 401) |
| F67 | CSV da planta-api neutraliza fórmula | — | `planta-api` | deploy |
| F68 | `planta-ia` exige membro do estudo + cota | `aplicar_20271116906800` | `planta-ia` | POST sem membro = 403 |
| F69 | sem `admin@admin.com` | `aplicar_20271116906900` | — | `prosrc` sem `admin@admin.com` |
| F71 | `noopener` para todo target ≠ `_self` | — | — | código na main |
| F76 (= F77) | cache do Storage só de bucket público; limpo no logout | — | — | código na main |

### Ordem de publicação

1. Migrations **antes** do código: F1, F4, F12, F57, F58, F61, F68, F69.
2. Merge do PR (push em `main` = deploy do frontend).
3. Migration do **F8** (depende do código novo no ar).
4. Edge Functions: `sinapi-import`, `read-matricula`, `dunning-notifier`, `planta-webhooks`,
   `partner-portal-download`, `bi-narrative`, `task-alert-notifier`, `planta-api`, `planta-ia`
   (a partir de uma pasta em `origin/main` depois do merge, nunca do checkout de integração).
5. Usuário troca a senha da conta do F2.

## Sem patch (fora deste plano)

F3 (fechado pelo F57), F5, F6, F7, F9, F11, F13, F14, F17, F53, F54, F55, F59, F63, F64, F66,
F70, F72, F74, F75 — o motivo e o desenho que a revisão pediu estão em
`patches/F<n>.md`. Vários dependem de decisão de produto (F11, F14, F70, F72, F75).

Falhas novas que os revisores viram (não estão no relatório): `employees_org_access` FOR ALL
sem WITH CHECK separado; RPCs DEFINER sem autorização (`hire_candidate`,
`create_vacation_period`, `close_labor_diary`, `consolidate_evaluation_cycle`,
`esocial_create_batch`, `esocial_generate_s2200`, `esocial_get_dashboard`, `sst_indicators`);
`payroll_audit_logs` USING (true); `sos_manage` permite compartilhar fornecedor de outra org;
`supplier-portal-download` e `*-portal-recibo-download` sem guarda de `../`;
`navigation-cache` guarda URL de portal com `?token=`.

## Estado

- [x] 22 diffs aplicados na frente `seguranca-patches` (base `origin/main` 3e53de61); 2 conflitos resolvidos (`check-rls-postura.sh`: lista com `portal_tokens` e `broker_portal_tokens`; `dunning-notifier`: imports de F18 e F19 juntos)
- [x] migrations renomeadas para `2027111690xxxx`
- [x] produção conferida por leitura: `partner_portal_create_request` e `fn_set_broker_property_access` iguais ao repositório; bucket `documents` só com as 4 policies antigas; e-mails de `organization_members`/`superadmins` todos minúsculos
- [x] `tsc` exit 0; Vitest local: falhas só de ambiente (sem `.env`; CRLF no `espelhoDoInvestidor`; `PainelVersoes` passa isolado 39/39)
- [x] CI do PR verde (#514, head `5413c2c1`)
- [x] migrations do passo 1 aplicadas pelo usuário (16/11): F1 e F4 conferidas pela saída
  (`portal_tokens` e `broker_portal_tokens` sem leitura de anon); as outras seis sem erro e
  conferidas por leitura (policies, grants, corpo das funções)
- [x] merge 16/11 (squash `baed0dd6`); `conferir-producao.sh` OK; CI da `main` verde
- [x] migration do F8 aplicada pelo usuário: as 5 policies novas (`documents_select_org`,
  `documents_insert_org`, `documents_insert_nf_parceiro`, `documents_update_org`,
  `documents_delete_org`) no ar, nenhuma das 4 antigas; anon `object/list/documents` = `[]`
- [x] Edge Functions publicadas pelo usuário (16/11, ~23:17 UTC), cada uma +1 versão e
  `verify_jwt` inalterado: `sinapi-import` v13, `read-matricula` v6,
  `partner-portal-download` v8, `planta-ia` v7, `planta-webhooks` v5, `planta-api` v81,
  `dunning-notifier` v14, `task-alert-notifier` v28
- [x] provadas de fora (POST sem header / chave publicável / token lixo):
  `check-rls-postura.sh` limpo nas 9 verificações; `sinapi-import`, `planta-webhooks` e
  `planta-api` (GET) = 401 nos três; `read-matricula` e `planta-ia` = 401 sem header e
  **503 com a chave publicável** — `ANTHROPIC_API_KEY` não está configurada em produção e a
  function para ali, antes do `getUser()` e sem custo; a cota e o "precisa ser membro"
  só ficam exercitáveis quando a chave for configurada; `partner-portal-download` = 400
  sem token (o portão é o token do portal)
- [ ] senha do F2 trocada (usuário) — segue no histórico do git até ser trocada

### O que ficou de fora de propósito

- **`bi-narrative` não foi publicada.** Ela não existe em produção (nunca teve deploy);
  publicar agora ligaria uma funcionalidade de IA paga. O código com o F61 está na `main`
  e a migration do F61 (cota) já está no banco — publicar é decisão de produto.
- **Bucket `documents` continua `public = true`.** O F8 fechou a LISTAGEM por anon e
  restringiu leitura/escrita autenticadas à organização do caminho, mas quem tem o
  caminho exato de um arquivo ainda baixa pela URL pública sem login (conferido: HEAD 200).
  Tornar o bucket privado é o F9 (sem patch): as URLs públicas estão gravadas em linhas
  do banco e precisariam virar URL assinada na leitura.
