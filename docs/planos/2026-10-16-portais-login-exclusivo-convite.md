# Páginas de login exclusivas + convite por e-mail: Cliente, Fornecedor, Parceiro B2B e Corretor

## Pedido original

> faça portais exclusivo também para os demais portais:
> 1. Portal do cliente
> 2. Portal do fornecedor
> 3. Portal do Parceiro B2B
> 4.ortal do Corretor

Sessão `222bd9f2-3b97-4feb-abf0-660e7be91bb1` · 2026-10-16, ~02:30 (logo após a publicação da
página de login do Portal de Treinamentos, `2026-10-16-login-exclusivo-portal-treinamentos.md`).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-16 | Escopo (só páginas / páginas + validação / páginas + convite)? | **Páginas + convite por e-mail para Cliente, Fornecedor e Corretor** (Parceiro já tinha) |
| 2026-10-16 | "Cadastre-se" nas três páginas sem convite? | **Manter como "Primeiro acesso? Crie sua senha"** (signUp com o e-mail cadastrado; a validação segue recusando e-mail não cadastrado). Parceiro e Treinamentos não mostram |
| 2026-10-16 | "Sair" de Cliente/Fornecedor/Corretor volta ao seletor ou ao portal? | **Volta à página de login do próprio portal** |
| 2026-10-16 | Corrigir o menu do Fornecedor no Layout (`'SUPPLIER'` ≠ `'FORNECEDOR'`)? | **Sim, junto** |
| 2026-10-16 | Pós-login por e-mail: abrir a RLS do modo logado, ou entregar a experiência do link? | **E-mail entrega a experiência do link**: RPC resolve o token da própria pessoa e o App abre a casca do token antes do `<Layout>`, com "Sair" |

## O que o levantamento mostrou (origin/main `a2e82f8d` + banco real)

| Portal | Rota própria | Convite | Validação do login | Quem é DE FORA lê o próprio cadastro? | Contas de acesso |
|---|---|---|---|---|---|
| Parceiro | `/portal-parceiro` | `partner-invite-user` | `partner_users` por e-mail | sim | 1 (membro interno) |
| Corretor | não | **não** | `broker_profiles` por e-mail | sim | 3 (membros internos) |
| Fornecedor | não | **não** | `suppliers` tabela direta | **não** | 3 (membros internos) |
| Cliente | não | **não** | `clientService.listClients()` | **não** | **0** |

- Ninguém de fora entrava por e-mail. Depois do login, Cliente/Fornecedor/Corretor caíam no
  `<Layout>` via `AppRouter` lendo tabelas diretas (RLS barra quem é de fora); o acesso por
  link usa cascas próprias e RPCs `client_portal_*`/`supplier_portal_*`/`fn_broker_portal_*`.
- `Layout.tsx:1221` comparava com `'SUPPLIER'`: o menu do Fornecedor nunca aparecia.
- As cascas por token não tinham "Sair" (não havia sessão para encerrar).

## Desenho

1. **Um componente de login** — `components/portal/PortalLogin.tsx` recebe a `EntradaDoPortal`
   e substitui o `TrainingLogin.tsx`. Modos `entrar | esqueci | primeiro-acesso` (o terceiro
   só com `permitePrimeiroAcesso`); `signUp` com `emailRedirectTo` na rota; com confirmação de
   e-mail ligada (usuário sem sessão) volta ao modo entrar com a mensagem.
2. **Config única** — `lib/entradasDoPortal.ts` (substitui `rotaDeEntradaDoPortal.ts`): rota,
   títulos, ícone, 3 destaques, cores por extenso (JIT do Tailwind), `permitePrimeiroAcesso`,
   rodapé; `entradaDoPortal`, `rotaDeEntradaDoPortal`, `entradaDaRota`, `destinoAposSair`.
3. **App.tsx genérico** — um efeito só para todas as rotas (`entradaDaRota(pathname)` sem
   `?token=` → força o grupo em memória, reafirmado); `authError` → `replaceState('/')`;
   `onSelectGroup` troca o endereço; sem sessão + entrada → `PortalLogin`, senão `Auth`.
4. **Pós-login = casca do token** — `validateAccess(CLIENT|SUPPLIER|BROKER)` chama a RPC
   `portal_token_para_mim(p_portal)` e devolve `portalToken`; `useAuthSync` grava
   `portalTokenDoLogin` no store; o App renderiza `ClientPortalTokenGate` /
   `SupplierPortalTokenGate` / `BrokerPortalTokenGate` antes do `<Layout>`, com `onLogout`
   (item "Sair" no menu de conta das três cascas). Os ramos do `AppRouter` ficam inalcançáveis.
5. **RPC `portal_token_para_mim(p_portal)`** — SECURITY DEFINER, `REVOKE FROM PUBLIC, anon`,
   `GRANT authenticated`; e-mail = `lower(auth.jwt()->>'email')`; token revogado → `revogado`
   (login recusado); ativo vencido → renova; sem token → cria com a org do cadastro; cadastro
   global sem token → `sem_organizacao` (só o convite cria). Vários cadastros com o mesmo
   e-mail: o que tem token ativo, senão o mais recente.
6. **Convite genérico** — Edge Function `portal-invite-user` `{ portal, id }`: `exigirUsuario` →
   lê o cadastro com service_role → `exigirMembro(org)` → garante o token (reativa/renova/cria)
   → `generateLink` `invite`/`recovery` com `redirectTo` da rota → Resend na cor do portal →
   grava `<tabela>.portal_invited_at`. `partner-invite-user` não muda.
7. **Bloco de convite único** — `components/portal/ConvitePortalBloco.tsx` ("Acesso por e-mail
   e senha": e-mail, "Enviado em …", Enviar/Reenviar, botão desabilitado com motivo quando não
   há e-mail), usado por `client/ClientPortalLinkModal`, `supplier/SupplierPortalManager` e
   `BrokerList`. Service `services/portalInviteService.ts`.
8. **"Sair"** — `useStore.logout` vai para `destinoAposSair(grupo)`; nas cascas por token o
   `onLogout` do App encerra a sessão sem mudar o endereço (o efeito da rota devolve a página
   própria).

### Interações conferidas

| Cenário | Resultado |
|---|---|
| Cartão → `replaceState(rota)` → grupo → `PortalLogin` | efeito vê grupo igual → no-op |
| `/portal-x?token=` | gate do link tem precedência; o efeito ignora rota com token |
| Login recusado nesta aba | `authError` → `replaceState('/')` → "Erro de Acesso" → seletor |
| Sessão de outra aba | `useAuthSync` inalterado (adota o grupo gravado ou volta ao seletor) |
| Convite/recovery (`#type=`) | `ResetPassword` → efeito com `vindoDoConvite` → validação → token → casca |
| Acesso revogado (`is_active=false`) | RPC `revogado` → "Seu acesso ao Portal do X foi desativado. Fale com a construtora." |

## Plano

### F1 — páginas e rotas
| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `lib/entradasDoPortal.ts` (novo; `lib/rotaDeEntradaDoPortal.ts` sai) | mapa das 5 entradas + helpers | `__tests__/entradasDoPortal.test.ts` (5 casos) |
| 2 | `components/portal/PortalLogin.tsx` (novo; `components/training/TrainingLogin.tsx` sai) | login generalizado + primeiro acesso | `check-ui-standard.sh` limpo; `__tests__/components/PortalLogin.test.tsx` (7 casos) |
| 3 | `App.tsx` | efeito genérico de rota, `authError` genérico, `PortalLogin`, `onBack` sem ramo do parceiro | typecheck; Playwright `paginas.js` |
| 4 | `store/useStore.ts` | `logout` → `destinoAposSair` | `entradasDoPortal.test` caso 5 |
| 5 | `components/Layout.tsx:1221` | `'FORNECEDOR'` | typecheck |

### F2 — pós-login pela casca do token
| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 6 | `supabase/migrations/aplicar_20271016000100_portais_login_por_email.sql` | 3 colunas `portal_invited_at` + RPC `portal_token_para_mim` | `segurancaMigrations.test` verde; aplicada; ACL sem PUBLIC/anon; `BEGIN…ROLLBACK` com JWT de cliente devolve token |
| 7 | `services/profileService.ts` | CLIENT/SUPPLIER/BROKER pela RPC; retorno com `portalToken` | `__tests__/validateAccessPortais.test.ts` (4 casos) |
| 8 | `hooks/useAuthSync.ts`, `store/useStore.ts` | `portalTokenDoLogin` (zerado no sign-out); `getByEmail` de cliente/fornecedor saem | `useAuthSyncEntreAbas.test` verde |
| 9 | `App.tsx` | gates com `onLogout`; bloco CLIENT/SUPPLIER/BROKER antes do `<Layout>` | Playwright com conta real |
| 10 | `components/ClientArea.tsx`, `SupplierDashboard.tsx`, `BrokerPortal.tsx` | prop `onLogout` + "Sair" | `check-ui-standard.sh` limpo |
| 11 | `components/AppRouter.tsx` | comentário: ramos inalcançáveis | — |

### F3 — convite por e-mail
| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 12 | `supabase/functions/portal-invite-user/index.ts` (novo) | convite genérico | publicada; POST sem auth → 401; com anon → 401 |
| 13 | `services/portalInviteService.ts` (novo) | `enviarConvite(portal, id)` | `__tests__/portalInviteService.test.ts` (3 casos) |
| 14 | `components/portal/ConvitePortalBloco.tsx` (novo) + `client/ClientPortalLinkModal.tsx`, `supplier/SupplierPortalManager.tsx`, `BrokerList.tsx` | bloco "Acesso por e-mail e senha" nos três modais | `check-ui-standard.sh`; print |
| 15 | `types/users.ts`, `types/broker.ts`, `services/clientService.ts` (degrau), `supplierService.ts`, `brokerService.ts` | `portal_invited_at` chega ao front | typecheck |
| 16 | `utils/portalHelpDefaults.ts` | FAQ do cliente fala do convite e do primeiro acesso | `portalHelp*` verdes |

## Estado

- [x] Levantamento e decisões (2026-10-16)
- [x] F1 — 1 a 5 escritos; Vitest 7 arquivos / 71 testes; checadores limpos; `tsc exit=0`
- [x] F2 — 6 a 11 escritos; migration aplicada (ACL `authenticated`/`service_role`, colunas
  presentes); Vitest 12 arquivos / 90 testes; checadores limpos; `tsc exit=0`
- [x] F3 — 12 e 13 escritos e testados; Edge Function publicada (401 sem auth, 401 com anon)
- [x] F3 — 14 a 16 escritos; checadores limpos; `tsc exit=0`; RPC provada com `BEGIN…ROLLBACK`
  (JWT de cliente real → `ok` + token; mesmo e-mail como fornecedor → `nao_cadastrado`;
  `anon` → 42501)
- [x] Navegador, páginas sem senha (`C:\tmp\pwtest\portais-login\paginas.js`, vite da frente
  em :3141): 50 verificações ok nas 5 rotas (página própria, sem Voltar/Cadastre-se, botão
  desabilitado com motivo, "Primeiro acesso" só nas três, `recover?redirect_to=` da rota,
  cartão com `replaceState`, Investidor segue no `Auth`, celular sem aside e sem rolagem
  lateral); 0 erros de console/HTTP. Prints `portal-*-desktop.png`, `*-primeiro-acesso.png`,
  `*-celular.png`.
- [x] Suíte completa `9754 = 9720 passados + 34 pendentes`, 0 falhas (reporter JSON); `vite build
  exit=0` ("✓ built in 32.30s")
- [x] Navegador com conta real, em produção (2026-10-16, `C:\tmp\pwtest\portais-login\conta-real.js`,
  conta `agente-leitura`, autorizada pelo usuário):
  - recusa de cliente não cadastrado em `/portal-cliente` e de corretor sem organização em
    `/portal-corretor`: "Erro de Acesso" com a mensagem certa ✅ — **mas o seletor não aparecia
    depois** (ver "Defeito achado na prova" abaixo);
  - fornecedor "MCC" (cadastro real da Alpa com o e-mail da conta, token ativo já existente, nada
    escrito por mim): login → casca do link (cotações, pedidos, NF, financeiro) → "Sair" → página
    própria ✅, 0 erros de console/HTTP.
- [ ] Cliente e corretor no caminho feliz com conta real: **não feito**. O INSERT do cliente de
  teste e do token temporário do corretor foi bloqueado pela permissão de escrita em produção
  desta sessão. A RPC já foi provada com `BEGIN…ROLLBACK` (JWT de cliente real → token); falta o
  print da casca do cliente/corretor aberta por e-mail — fica para o convite real do usuário.

### Defeito achado na prova (16/10/2026) e corrigido

Depois de um login recusado, o endereço virava "/", mas a tela voltava ao **login do mesmo
portal** em vez do seletor. Causa: o efeito genérico de rota em `App.tsx` memorizava a entrada na
carga (`useMemo(..., [])`) e, depois do `replaceState('/')` da recusa, continuava forçando o
portal. O código antigo de `/portal-parceiro` lia `window.location.pathname` a cada execução — a
generalização trocou isso sem perceber. Correção (frente `portais-recusa-volta-seletor`):
`entradaDaUrlAtual()` em `lib/entradasDoPortal.ts` lê o endereço na hora; os dois efeitos usam
ela; teste `__tests__/components/entradaDaUrlAtual.test.ts` (jsdom) trava a leitura ao vivo.
Junto: a faixa "Acesso via link público" das cascas some quando a pessoa entrou por e-mail
(`onLogout` presente). Provado no vite da frente com a conta real: as duas recusas terminam no
seletor em "/", e o fornecedor por e-mail abre sem a faixa.

- [x] Correção publicada: `ce224fa4` em `main`, check-run `ci` verde (suíte `9817 = 9783 + 34 pendentes`, 0 falhas;
  `tsc exit=0`; `vite build` ok); domínio serve `ce224fa`; **em produção**, com a conta real: as
  duas recusas terminam no seletor em "/" e o fornecedor por e-mail abre sem a faixa e "Sair"
  volta à página própria.
- [x] Publicação em `main` — `0d3e0b51` + `8f2f5ec4` (2026-10-16); check-run `ci` verde;
  `conferir-producao.sh "Crie sua senha"` ✅ (domínio carimbado com o topo de `main`, texto no
  bundle servido)
- [ ] Allow-list de redirect do Supabase Auth para `/portal-cliente`, `/portal-fornecedor`,
  `/portal-corretor` (conferir no Dashboard antes do primeiro convite real)

## Verificação

1. `npm run typecheck`; `npx vitest run __tests__/entradasDoPortal.test.ts
   __tests__/components/PortalLogin.test.tsx __tests__/validateAccessPortais.test.ts
   __tests__/portalInviteService.test.ts __tests__/components/useAuthSyncEntreAbas.test.ts
   __tests__/components/useStoreLoginGroupRota.test.ts __tests__/segurancaMigrations.test.ts`
   + suíte completa (reporter JSON, conta fechando); `check-ui-standard.sh` e
   `check-xss-sinks.sh` nos `.tsx` tocados; `vite build` com "✓ built in".
2. Banco: `BEGIN…ROLLBACK` da RPC com `set_config('request.jwt.claims', …)`; anon → 42501.
3. Edge Function: `curl -X POST …/functions/v1/portal-invite-user -d '{}'` → 401.
4. Navegador (`C:\tmp\pwtest\portais-login\paginas.js`, vite da frente): as 5 rotas sem
   sessão, cartões, `recover?redirect_to=`, primeiro acesso, celular; Investidor segue no `Auth`.
5. Com `PW_SENHA` (conta interna): `/portal-cliente` → "Erro de Acesso" → seletor. Com cadastro
   de teste (grava em produção, OK do usuário): casca do cliente → "Sair" → página própria.
6. Convite real: cadastro com o e-mail do usuário → "Enviar convite" → criar senha → portal.
7. `git push origin HEAD:main`, check-run `ci`, `conferir-producao.sh "Primeiro acesso"`.

## Fora do escopo (registrado)

- `ResetPassword` segue azul/genérico; `Auth.tsx` mantém temas sem uso; ramos mortos do
  `AppRouter` continuam até a limpeza.
- Mesmo e-mail em vários cadastros: a RPC escolhe um (documentado na migration).
