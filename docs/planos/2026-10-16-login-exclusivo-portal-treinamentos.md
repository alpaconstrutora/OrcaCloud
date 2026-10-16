# Página de login exclusiva do Portal de Treinamentos

## Pedido original

> essa a a página de logins atualmente o usuário para ter acesso ao portal do treinamento e as demais.
> Vamos fazer uma pagina de login exclusiva para portal de treinamentos

(Acompanhado de um print da tela de seleção de portais — os nove cartões "Portal do
Colaborador", "Portal do Cliente", …, "Portal de Treinamentos" com o subtítulo "Selecione o
portal de acesso para continuar".)

Sessão `222bd9f2-3b97-4feb-abf0-660e7be91bb1` · 2026-10-16, ~01:00.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-16 | Visual da página? | **Página própria, layout dividido**: painel teal com a identidade da Academia (ícone de formatura, 3 destaques: aulas e provas / certificados / histórico) + formulário. Celular: só o formulário |
| 2026-10-16 | "Voltar para Portais" e "Cadastre-se"? | **Tirar os dois.** Rodapé discreto: "Não recebeu o convite? Fale com o RH da sua empresa." |
| 2026-10-16 | O cartão "Portal de Treinamentos" no seletor geral continua? | **Continua e leva à página nova**: clicar troca o endereço para `/portal-treinamentos` e abre a página exclusiva |
| 2026-10-16 | "Esqueci minha senha" volta para o portal? | **Sim**: `redirectTo = origin + /portal-treinamentos`, igual ao link do convite |

## O que existia antes (levantado em `origin/main` `1573b1ad`)

- `/portal-treinamentos` já forçava o grupo TREINANDO em memória (`App.tsx`, efeito da rota,
  15/10/2026) — mas a tela era o `components/Auth.tsx` genérico com tema teal: "Voltar para
  Portais" (expõe os outros oito portais), "Cadastre-se" (cadastro livre num portal que é por
  convite do RH) e "Esqueceu a senha?" com `redirectTo` na raiz `/` (a pessoa voltava ao seletor,
  não ao portal).
- O convite (`supabase/functions/academy-portal-invite`) já usava `redirectTo
  ${FRONTEND_URL}/portal-treinamentos`, então essa URL já estava liberada no Supabase Auth.
- Nenhum portal tinha página de login própria; todos passavam pelo `Auth` com `getTheme()`.

⚠️ O checkout de integração (`c:\D\ORÇACLOUD\orçacloud-saas`) estava 753 commits atrás de
`origin/main` e nem tinha o Portal de Treinamentos. Levantamento feito com `git show
origin/main:<arquivo>`; trabalho na frente `login-portal-treinamentos` (REGRA #8).

## Desenho

- **`components/training/TrainingLogin.tsx` é autônomo.** Não se extrai nada do `Auth.tsx`: o
  que os dois compartilhariam são ~12 linhas (marcar a aba → `signInWithPassword` → erro em
  estado). Extrair um hook obrigaria a mexer no caminho de oito portais para reaproveitar num só.
  Quando o `/portal-parceiro` ganhar página própria (segundo consumidor), nasce
  `hooks/useLoginDoPortal.ts` — o mesmo critério do §24 do guia ("extraia antes de copiar pela
  terceira vez").
- **A URL é a fonte da verdade de "qual entrada".** O cartão do seletor troca o endereço para
  `/portal-treinamentos` com `replaceState` ANTES de escolher o grupo; o efeito de rota já
  existente passa a ser o único mecanismo que sustenta o grupo após sair ou ser recusado. Um
  caminho só, para o cartão e para o acesso direto/convite.
- **`replaceState`, não `pushState`:** o app não escuta `popstate` para pathname (só hash); com
  `pushState`, o "voltar" do navegador trocaria a URL sem trocar a tela. O `onBack` do parceiro e
  os efeitos de recusa já usam `replaceState('/')`.
- **`lib/rotaDeEntradaDoPortal.ts`** (mapa puro grupo → rota) com teste que trava o mapa em UM
  portal: incluir o Parceiro é decisão de produto, tomada por escrito.
- A tela NÃO valida o grupo nem abre o portal: o `useAuthSync` valida pela RPC
  `academy_portal_user_my_access` e o `App.tsx` troca de tela. Conta que não é de treinando vê
  "Erro de Acesso" e, pelo efeito da rota, cai no seletor em `/`.
- "Esqueci minha senha": `resetPasswordForEmail(email, { redirectTo: origin + '/portal-treinamentos' })`.
  O link chega com `#type=recovery`, o `ResetPassword` abre e, ao concluir, o efeito da rota
  (`vindoDoConvite` vale para `recovery` também) põe TREINANDO → portal. Mensagem de sucesso
  neutra, porque o servidor responde 200 para e-mail desconhecido.
- Mensagens de erro do Supabase traduzidas (`Invalid login credentials` → "E-mail ou senha
  incorretos." etc.); o `Auth` mostra o texto cru em inglês.
- Logo `/opura-logo.svg` é escuro com um ponto roxo: fica na coluna branca do formulário (visível
  também no celular), e o painel teal leva só o ícone e os destaques.
- Import estático no `App.tsx` (não lazy): é a primeira tela de uma rota de entrada; `Suspense`
  ali viraria um piscar de loader antes do formulário.

### Interações conferidas (sem loop, sem "entra e cai")

| Cenário | Sequência | Resultado |
|---|---|---|
| Cartão → login | `replaceState('/portal-treinamentos')` → `setSelectedLoginGroup(TRAINEE)` → `TrainingLogin`; efeito da rota vê grupo já TRAINEE → no-op | ok |
| Acesso direto `/portal-treinamentos` | inalterado: efeito força em memória; `useAuthSync` zera no `INITIAL_SESSION`, efeito reafirma | ok (como em 15/10) |
| Login recusado nesta aba | `authError` + signOut em 3 s → efeito `replaceState('/')` → "Erro de Acesso" → `SIGNED_OUT` zera grupo → seletor em `/` | ok; sem loop porque a URL já é `/` |
| Sair do portal | pathname segue `/portal-treinamentos` → efeito re-força → `TrainingLogin` | ok (decisão do usuário) |
| Sessão de OUTRA aba não-treinando | `useAuthSync` não desconecta; adota o grupo gravado ou volta ao seletor | ok; `useAuthSyncEntreAbas` não muda |
| Link de convite/recovery | `ResetPassword` tem precedência; ao concluir, efeito com `vindoDoConvite` → portal | ok |

Piscar do seletor por um frame no acesso direto (`useAuthSync` zera antes de o efeito reafirmar)
já existe desde 15/10 — fora do escopo.

## Plano

| # | Arquivo(s) | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `lib/rotaDeEntradaDoPortal.ts` (novo) | mapa `ROTA_DE_ENTRADA_DO_PORTAL` + `rotaDeEntradaDoPortal(grupo)` | `__tests__/rotaDeEntradaDoPortal.test.ts` verde (TRAINEE → rota; USER/PARTNER/LENDER/null → null; mapa com 1 chave) |
| 2 | `components/training/TrainingLogin.tsx` (novo) | página dividida (painel teal a partir de `lg`, formulário com logo), entrar / esqueci a senha, erros em português, botão desabilitado com motivo, rodapé do RH; sem cadastro nem "Voltar" | `check-ui-standard.sh` limpo; `__tests__/components/TrainingLogin.test.tsx` verde (5 casos); prints desktop e 390 px |
| 3 | `App.tsx` | `onSelectGroup` do seletor troca o endereço pela rota de entrada antes de escolher o grupo; para TREINANDO sem sessão renderiza `TrainingLogin` em vez do `Auth`; a linha do `onBack` para `/portal-treinamentos` sai (código morto) | typecheck limpo; `/portal-treinamentos` sem sessão mostra a página nova; cartão em `/` muda a URL e mostra a página nova; os outros 8 cartões seguem no `Auth` |
| 4 | `docs/planos/2026-10-15-portal-de-treinamentos.md` | pedido posterior + ponteiro para este plano na seção Acesso | linhas presentes, nada apagado |
| 5 | `docs/ui_ux_guia_unificado.md` §20.2.1 | `TrainingLogin.tsx` entra na lista de cascas que repetem `p-4 md:p-6` à mão (sem seção nova de login: só haverá padrão para descrever com a segunda tela própria, a do Parceiro) | referência presente |

## Estado

- [x] Levantamento e decisões (2026-10-16)
- [x] 1 · 2 · 3 — código escrito; `check-ui-standard.sh` limpo em `TrainingLogin.tsx` e `App.tsx`; Vitest 8 arquivos / 50 testes verdes (novos + `useAuthSyncEntreAbas`, `useStoreLoginGroupRota`, `ResetPasswordContaDoLink`, `linkDeAcesso`, `acessoAoMarket`, `orgContextGuard`)
- [x] typecheck `tsc exit=0`, 0 erros (3ª rodada; o Node 24 caiu 2× antes sem erro de tipo)
- [x] 4 · 5 — documentação
- [x] Navegador, passos 1 · 2 · 3 · 6 (2026-10-16, `C:\tmp\pwtest\portal-treinamentos\login-exclusivo.js`,
  vite da frente em :3140): página própria no desktop e no celular, cartão troca a URL com
  `history.length` inalterado, Parceiro segue no `Auth`, `recover?redirect_to=…/portal-treinamentos`,
  0 erros de console/HTTP. Prints `40-…45-login-exclusivo-*.png`.
- [ ] Navegador, passo 4 (recusa → seletor) e passo 5 (treinando real, grava em produção) — precisam da
  senha da conta de teste e do OK do usuário
- [ ] Publicação em `main` + `conferir-producao.sh`

## Verificação

1. `npm run typecheck`; `npx vitest run __tests__/rotaDeEntradaDoPortal.test.ts
   __tests__/components/TrainingLogin.test.tsx __tests__/components/useAuthSyncEntreAbas.test.ts
   __tests__/components/useStoreLoginGroupRota.test.ts __tests__/components/ResetPasswordContaDoLink.test.tsx
   __tests__/linkDeAcesso.test.ts __tests__/acessoAoMarket.test.ts __tests__/orgContextGuard.test.ts`;
   `bash scripts/check-ui-standard.sh components/training/TrainingLogin.tsx App.tsx`.
2. Navegador (`/rodar-app`, dev em `http://localhost:3100`, Playwright em
   `C:\tmp\pwtest\portal-treinamentos\login-exclusivo.js`):
   1. `/portal-treinamentos` sem sessão (1440×900) → painel teal visível, 0 "Voltar para
      Portais"/"Cadastre-se", texto "Fale com o RH". Print.
   2. `/` → clicar "Portal de Treinamentos" → `pathname` = `/portal-treinamentos`,
      `history.length` inalterado, mesma tela do passo 1.
   3. 390×844 → painel ausente, cabeçalho compacto + formulário. Print.
   4. Conta NÃO cadastrada → "Erro de Acesso" + "Seu e-mail não está cadastrado…" → após 3,5 s
      `pathname === '/'` e o seletor. Contexto novo (armadilha: outras abas).
   5. ⚠️ grava em produção (precisa de OK do usuário): criar TERCEIRO em RH › Treinamentos ›
      Portal com o e-mail da conta de teste → `/portal-treinamentos` → login → portal → Sair →
      página nova (não o seletor). Remover o acesso de teste depois.
   6. "Esqueci minha senha" com e-mail inexistente: `POST /auth/v1/recover` com
      `redirect_to = http://localhost:3100/portal-treinamentos`; mensagem `role=status`. Em dev
      só vale se `http://localhost:3100/**` estiver na allow-list do Supabase Auth; o teste prova
      o pedido, não o e-mail.
   Critério: 0 `pageerror`, 0 console error, 0 4xx/5xx de `rest|functions`.
3. `git push origin HEAD:main`, check-run `ci` verde, `bash scripts/conferir-producao.sh "Fale com
   o RH da sua empresa"`, `bash scripts/fechar-frente.sh login-portal-treinamentos`.

## Fora do escopo (registrado, não feito)

- `components/ResetPassword.tsx` segue azul/genérico ("Redirecionando para o painel…"): quem cria a
  senha pelo convite ainda vê essa tela antes do portal. Item próprio, se o usuário quiser (`tema`
  por grupo).
- Entrada própria do Portal do Parceiro (`/portal-parceiro`) com o mesmo molde — quando vier, o
  hook comum de login nasce junto.
- Depois de "Sair" a pessoa fica na página do treinando, sem caminho ao seletor (decisão do
  usuário). Se incomodar, uma linha "Entrar em outro portal" no rodapé resolve.
