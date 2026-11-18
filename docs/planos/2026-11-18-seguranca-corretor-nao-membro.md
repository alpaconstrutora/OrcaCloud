# Corretor externo deixa de contar como membro da organização (F5, F6, F7)

## Pedido original

> Sessão: frente `seguranca-corretor-nao-membro`, aberta pelo agente coordenador das
> correções da varredura de segurança · 18/11/2026, ~02:10. Transcrição literal:

> Contexto: OrçaCloud (React + Vite + Supabase, multi-tenant). Você implementa UMA correção de segurança, num PR próprio. Outras 3 frentes trabalham em paralelo em outros achados — não toque em arquivos fora do seu escopo. Escreva código, comentários, commit e PR em português.
>
> ## Onde trabalhar
> - Crie sua frente: `cd /c/D/ORÇACLOUD/orçacloud-saas && bash scripts/nova-frente.sh seguranca-corretor-nao-membro` → cria C:/D/frentes/seguranca-corretor-nao-membro na branch feat/seguranca-corretor-nao-membro a partir de origin/main, com node_modules próprio (leva alguns minutos). Trabalhe SÓ lá. NÃO leia nem edite código em C:\D\ORÇACLOUD\orçacloud-saas (checkout de integração, centenas de commits atrás da main).
> - Antes de editar qualquer coisa, leia INTEIRO C:/D/frentes/seguranca-corretor-nao-membro/CLAUDE.md (regras obrigatórias do projeto; a REGRA #5 sobre organização ativa importa aqui).
> - Notas da varredura de segurança: C:/D/frentes/security-scan/CLAUDE-SECURITY-20261115-005039/patches/F5.md, F6.md, F7.md (leia as três INTEIRAS — são tentativas rejeitadas do mesmo problema, e cada nota descreve o que faltou) e os achados F5/F6/F7 em CLAUDE-SECURITY-RESULTS.md.
>
> ## Banco (produção, project-ref oxedkknreghxrgenyjiu, já linkado na frente)
> - PROIBIDO: `supabase db push`; `npx supabase db query ... -f`; qualquer INSERT/UPDATE/DELETE/DDL em produção; `supabase functions deploy`; mexer em secrets. O usuário aplica migrations depois.
> - PERMITIDO: leitura para diagnóstico, SQL numa linha só (o CLI ignora as linhas seguintes): `npx supabase db query --linked -o table "SELECT ..."` (roda como postgres). Nunca selecione valores de colunas de token/segredo/senha.
> - O histórico de migrations tem drift: antes de reescrever uma função ou policy, leia a definição ATUAL de produção (`SELECT pg_get_functiondef('public.f(args)'::regprocedure)`) e parta dela. Cuidado com acentos (leia como UTF-8).
> - Migration nova: `supabase/migrations/aplicar_<prefixo 14 dígitos>_<descricao_snake>.sql`, prefixo na SUA faixa: 20271118913000 a 20271118913999. Idempotente. Cabeçalho em comentário: o que fecha, por quê, ordem (antes/depois do código), como conferir. Função nova/alterada: SECURITY DEFINER com `SET search_path = public, pg_temp`, `REVOKE ALL ... FROM PUBLIC, anon`, GRANT EXECUTE só para quem precisa. Policy nova por conjunto (`X IN (SELECT public.minhas_orgs_membro())`), nunca `is_org_member(X)` por linha. Rode `npx vitest run __tests__/segurancaMigrations.test.ts`.
>
> ## Escopo (PR C — F5, F6, F7: corretor externo conta como membro pleno)
> O ramo "e-mail em broker_profiles" faz o corretor externo contar como membro pleno em is_org_member, minhas_orgs_membro, is_org_member_de e nas cópias SECURITY DEFINER (rh_kpis, fn_process_bottlenecks); ~614 policies usam essas funções, então corretor lê e grava folha, salário, dados bancários. E qualquer membro cria broker_profiles para um estranho e o torna membro (F7). Desenho que a revisão pediu (detalhes nas notas):
> - Remover esse ramo de todas essas funções. Procure todas as que têm o ramo: `SELECT proname FROM pg_proc WHERE prosrc ILIKE '%broker_profiles%'` e leia cada definição de produção.
> - Dar ao corretor, por caminho próprio, o que ele faz hoje legitimamente: inventarie no front tudo que o corretor faz logado (Portal do Corretor no celular, Comissões, propostas, reserva de unidade, Meus dados, aba Saúde) e no banco o que depende do ramo. Ex.: INSERT da própria proposta por policy própria; reserva por RPC que só muda status; a função minhas_orgs_corretor() já existe para o portal.
> - Aba Saúde do desktop: servir de RPCs SECURITY DEFINER (fn_broker_portal_saude e fn_broker_portal_saude_empreendimentos, ou as que existirem) que espelham POR CONSULTA a RLS antiga de cada tabela; a org vem do organizationId do painel (caindo para ele quando o token for inválido ou vencido no meio da sessão); devolver linhas por negócio (canal) e por unidade (tipologia/status) para que top channel e mix continuem calculados pelo MESMO código JS de hoje em brokerHealthService (inclusive desempate); o painel anônimo pelo link continua mostrando o zero de hoje.
> - PRIMEIRO, dados: pessoas da casa cadastradas só como corretor perderiam acesso. Escreva e rode (só leitura) a consulta que lista quem tem broker_profiles ativo + conta no Auth + nenhuma linha em organization_members daquela org, e traga a lista no relatório (nome, e-mail, org, e o que mais ajudar a distinguir funcionário de corretor externo) para o usuário decidir. NÃO crie membros por conta própria; a migration pode trazer o INSERT comentado para o usuário preencher depois de decidir.
> - Ordem de publicação: deixe claro no cabeçalho da migration e no relatório o que precisa ir antes (RPCs novas + front que as usa) e o que vai depois (remover o ramo), para não haver janela em que corretor legítimo fica sem tela.
> Fora do escopo: outros achados (storage, sanitizeHtml, RPCs de RH, alçada).
>
> ## Verificação antes do PR
> - `npm run typecheck` (exit 0).
> - Testes dos arquivos tocados e testes novos (brokerHealthService etc.): `VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=x npx vitest run <arquivos>` (sem essas variáveis centenas de testes falham por ambiente). Falha de CRLF/ambiente: isole antes de concluir que é sua.
> - Scripts scripts/check-*.sh que se aplicarem (check-org-selector-guard.sh, check-ui-standard.sh nos .tsx tocados; `npx vitest run __tests__/orgContextGuard.test.ts`).
>
> ## Entrega
> - Commit(s) terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push da branch e PR em RASCUNHO (`gh pr create --draft --base main`). Corpo com "## Summary", "## Evidence" (antes/depois), "## Merge Danger" (Door one-way/two-way; Blast Radius), terminando com a linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. NÃO faça `gh pr ready`, merge nem push em main.
> - Relatório final (é tudo o que eu vejo): URL do PR; migrations NA ORDEM de aplicação e se cada uma vai antes ou depois do merge; a lista de pessoas "corretor sem membership" para o usuário decidir; cada fluxo de corretor que você conferiu e como; mudança de comportamento para usuário legítimo; como provar de fora depois de aplicado; o que ficou de fora e por quê; dúvida de produto que você não pôde resolver (descreva as opções, não invente a resposta).

## O que a leitura de produção mostrou (18/11/2026)

- **Funções com o ramo "corretor = membro"** (`prosrc ILIKE '%broker_profiles%'`, 50
  funções; lidas uma a uma):
  - dão organização a quem é corretor, SECURITY DEFINER: `is_org_member`,
    `minhas_orgs_membro`, `is_org_member_de`, `rh_kpis` (cópia no portão). **Saem.**
  - `fn_process_bottlenecks` (citada no pedido) **não tem** o ramo em produção — não
    tem portão nenhum (DEFINER, executável por authenticated, devolve gargalos de
    processo de qualquer organização pelo id). É outro achado; ficou registrado em
    "Fora do escopo".
  - 24 funções SECURITY INVOKER de BI/financeiro (`fn_cash_flow`, `fn_dre*`,
    `fn_bi_*`, `fn_opura_*`, `fn_reconciliation_*`, `fn_balancete`, …) têm cópia do ramo
    no próprio portão. São INVOKER e **toda** tabela do schema public tem RLS (só
    `spatial_ref_sys` não tem) e toda view é security_invoker: depois da 2ª migration o
    corretor passa no portão e recebe zero linha. Das 24, só `fn_bi_executive` chama
    uma DEFINER (`rh_kpis`, corrigida) e `fn_approval_action_queue` chama
    `fn_alcada_aprovadores`, que tem portão próprio por `is_org_member`. Limpeza do
    texto fica para depois.
  - as demais usam broker_profiles como IDENTIDADE (token do portal, ranking, comissão,
    `portal_token_para_mim`, `portal_help_orgs_of`, `fn_unit_cost_basis` barrando
    corretor…), não como organização. Não mudam.
- **Policies**: 638 policies usam `minhas_orgs_membro()` (514 `TO authenticated`, 124
  `TO public`). Nenhuma lê broker_profiles direto.
- **RPCs do portal por token** (`fn_broker_portal_*`, `broker_portal_*`,
  `portal_token_para_mim`, `portal_tour_mark`, `portal_help_get_mine`): nenhuma chama,
  direta ou indiretamente, `is_org_member`/`minhas_orgs_membro`/`is_org_member_de`
  (grafo de chamadas sobre o `prosrc` de todas as funções sql/plpgsql).

## Inventário: o que o corretor faz logado e de onde vem

O login do corretor (`/portal-corretor`, e-mail e senha) abre a MESMA casca do link
(`BrokerPortalTokenGate`, `portal_token_para_mim`). Tudo roda com `portalToken`.

| Fluxo (desktop e celular) | Como lê/grava | Dependia do ramo? | Depois |
|---|---|---|---|
| Entrar / validar acesso | `portal_token_para_mim` (identidade pelo e-mail) | não | igual |
| Carga, estoque, propostas, comissões, Meus dados, Minha conta | `broker_portal_get_data`, `fn_broker_portal_get_units/_proposals/_commissions` | não | igual |
| Empreendimentos, tabela de preço, colunas, lote, 3D | `fn_broker_portal_get_price_*`, `_lote_do_predio`, `_get_espelho` | não | igual |
| Simulador, planos de venda | `fn_broker_portal_get_sales_plans`, `_validate_sales_simulation` | não | igual |
| Leads, materiais, ranking, treinamento, agenda, chat | `fn_broker_portal_*` por token | não | igual |
| Ajuda, tour, primeiros passos | `broker_portal_help_get`, `portal_tour_mark` | não | igual |
| **Enviar proposta** | INSERT `broker_portal_proposals` + upsert `broker_portal_proposal_units` | **sim** (INSERT exige org em `minhas_orgs_membro`) | policies `*_insert_corretor` (1ª migration) |
| Link público da proposta, PDF | UPDATE `share_token` da própria (perna `broker_email`) / PDF no navegador | não | igual |
| **Reservar unidade** | UPDATE direto `commercial_properties` | **sim** | RPC `fn_broker_portal_reservar_unidade` (1ª migration + front) |
| **Aba Saúde** (só desktop) | SELECT direto `commercial_properties`, `commercial_deals`, `projects` | **sim** | RPCs `fn_broker_portal_saude*` (1ª migration + front) |

## Decisões tomadas

| Data | Pergunta | Resposta |
|---|---|---|
| 18/11 | A org da Saúde vem do token ou do painel? | Do painel (`organizationId`), sempre — sem token nas RPCs. Link vencido no meio da sessão não muda nada (o SELECT de antes também não usava token). |
| 18/11 | O canal/mix são calculados no banco? | Não. O banco devolve linhas (uma por unidade, uma por negócio) na ordem da tabela, sem ORDER BY; as contas ficam no JS de antes. |
| 18/11 | `broker_name` sai do banco? | Não: vira `com_corretor` (booleano, mesma regra da verdade do JS: nem nulo nem vazio). O painel só pergunta SE há corretor. |
| 18/11 | O link anônimo chama a RPC? | Sim (GRANT a anon) e recebe vazio → painel zero, como hoje. Sem o GRANT viraria erro → "Nenhum dado". |
| 18/11 | Reservar pelo link anônimo passa a funcionar? | Não. RPC só para authenticated, como a policy de hoje. |

## Plano

1. **`supabase/migrations/aplicar_20271118913000_corretor_caminho_proprio.sql`** —
   `minhas_orgs_corretor()`, as duas policies de INSERT do corretor, a RPC de reservar
   e as duas da Saúde. *Pronto quando*: no banco local, RPC = SELECT direto de hoje
   para 9 perfis × 3 orgs × 6 recortes; SELECT direto não muda (é só acréscimo).
2. **`services/brokerHealthService.ts`** — lê das RPCs; contas iguais. *Pronto
   quando*: paridade antigo × novo em 3000 cenários aleatórios (inclusive empates) e
   `__tests__/brokerHealthService.test.ts` verde.
3. **`services/brokerPortalService.ts` + `components/broker/useBrokerPortal.ts`** —
   "Reservar" com token vai pela RPC. *Pronto quando*:
   `__tests__/components/brokerPortalReservar.test.tsx` verde (e vermelho com o
   caminho antigo).
4. **`supabase/migrations/aplicar_20271118913100_corretor_nao_e_membro.sql`** — tira
   o ramo de `is_org_member`, `minhas_orgs_membro`, `is_org_member_de` e `rh_kpis`.
   *Pronto quando*: no banco local, depois dela, a Saúde do corretor continua igual à
   de hoje, o SELECT direto do corretor zera, proposta/cesta/link/reserva do corretor
   funcionam e o corretor não cria broker_profiles nem lê folha.

## Estado

- [x] 1, 2, 3, 4 — no PR (rascunho). **Aplicação em produção: pendente (usuário).**
- [ ] Aplicar a 1ª migration (antes do merge).
- [ ] Merge + conferir deploy.
- [ ] Aplicar a 2ª migration (depois do front no ar).

## Ordem de publicação

1. `aplicar_20271118913000_corretor_caminho_proprio.sql` — **antes do merge**. Só
   acrescenta; não muda nada para ninguém enquanto o ramo existir.
2. Merge do PR (push em main = deploy) e `bash scripts/conferir-producao.sh`.
3. `aplicar_20271118913100_corretor_nao_e_membro.sql` — **depois do front no ar**.

Front no ar sem a 1ª: Saúde = "Nenhum dado", Reservar = erro. 2ª antes do front:
Saúde do corretor zera e Reservar dá erro até o deploy.

## Quem perde acesso (rodado em 18/11/2026, só leitura)

Consulta no cabeçalho da 2ª migration. Resultado: **nenhuma pessoa**. 41 corretores
ativos com organização; só 1 tem conta no Auth, e ela já é membro (admin) da mesma
organização — é a conta do desenvolvedor usada como corretor de teste.

## Verificação

- Banco local (PostgreSQL descartável, RLS e funções de produção copiadas): ver o
  corpo do PR (Evidence).
- Depois de aplicar em produção:
  - `SELECT count(*) … prosrc ~* 'FROM\s+public\.broker_profiles'` nas 4 funções → 0
    (hoje: 4).
  - Gestor: Portal do Corretor › Saúde com os mesmos números de antes.
  - Corretor de teste (conta sem linha em organization_members): enviar proposta,
    reservar, abrir Saúde; e `GET /rest/v1/employees` com a sessão dele → `[]`.

## Volta

2ª migration: recriar as quatro funções com o ramo. O que saiu de cada uma:

```sql
-- is_org_member, depois do 1º IF … END IF:
  IF EXISTS (SELECT 1 FROM public.broker_profiles
              WHERE organization_id = org_id AND LOWER(email) = v_email AND is_active = true) THEN
    RETURN TRUE;
  END IF;
-- minhas_orgs_membro, no fim:
  UNION
  SELECT b.organization_id FROM public.broker_profiles b
   WHERE b.organization_id IS NOT NULL AND lower(b.email) = lower(auth.jwt()->>'email') AND b.is_active = true
-- is_org_member_de, depois do 1º IF … END IF:
    IF EXISTS (SELECT 1 FROM public.broker_profiles b
                WHERE b.organization_id = p_org AND lower(b.email) = lower(v_email) AND b.is_active = true) THEN
        RETURN TRUE;
    END IF;
-- rh_kpis, dentro do ARRAY(…):
        UNION
        SELECT DISTINCT organization_id FROM public.broker_profiles
        WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
```

1ª migration: os DROPs estão no cabeçalho dela.

## Fora do escopo (registrado, não feito)

- `fn_process_bottlenecks(uuid)`: SECURITY DEFINER sem portão de organização.
- Limpar o texto do ramo nas 24 funções INVOKER (sem efeito de acesso, ver acima).
- `broker_profiles_manage` segue "membro da organização" (ver dúvida de produto).

## Dúvida de produto em aberto

**Quem pode cadastrar corretor?** Hoje qualquer membro (policy
`broker_profiles_manage`; também o cadastro de fornecedor com portal "Portal do
Corretor", em `supplierService`). Depois da 2ª migration o cadastro não dá mais
organização a ninguém, mas ainda dá o portal do corretor (o token nasce no 1º login
por `portal_token_para_mim`). Opções:
1. manter "qualquer membro" (como hoje);
2. só owner/admin (`minhas_orgs_gestor()`) — quem cadastra fornecedor-corretor sem ser
   admin passaria a receber erro;
3. qualquer membro cadastra, mas o acesso ao portal só nasce quando um owner/admin
   convida/gera o link.
