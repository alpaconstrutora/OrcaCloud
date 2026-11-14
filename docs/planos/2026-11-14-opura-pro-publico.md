# ÒPURA Pro público — app gratuito, só o Pro, para autônomo de fora (14/11/2026)

## Pedido original

Sessão de 14/11/2026, fim da tarde (Claude Code), depois dos 7 passos da crítica do Pro
(`docs/planos/2026-11-14-opura-pro-critica.md`):

> qual link acesso pelo celular para ver como ficou?

> isso da acesso ao app ou versão mobile?

> ja era aplicativo para celular nao era?

> A ideia e oferecer esse aplicativo primeiramente no formato mobile para publico externo free.
> Apenas o opura pro. mais nada do app

Respostas no `shape` (mesma sessão):

> Como o autônomo de fora cria a conta e entra? → "Google ou código por e-mail (Recomendado)"
> Onde o ÒPURA Pro mora para o público? → "Endereço próprio, instalável (Recomendado)"
> Precisa de página de apresentação antes do cadastro? → "Sim, página + cadastro (Recomendado)"

> desenho confirmado

## Desenho confirmado (resumo)

Autônomo chega por link (WhatsApp) → **página de apresentação** em `/pro` → **Continuar com
Google** ou **código de 6 dígitos no e-mail** (sem senha) → **primeiro acesso** pede só nome
comercial e profissão → **o Pro** (Agenda · Clientes · Novo · Ajustes) numa **casca só do Pro**,
sem nada do ÒPURA → **instalável** (manifesto "ÒPURA Pro"). Grátis; lojas, planos pagos, SMS e
visão de gestão no computador ficam de fora.

**Regra que não se negocia — isolamento:** conta Pro não pertence a organização nenhuma e só lê
`pro_*` próprio (RLS `pro_*_user_access` por `auth.uid()`); a casca do Pro nunca monta o
`<Layout>`; conta só-Pro que abrir outro endereço do ÒPURA volta para `/pro`.

Fatos levantados (banco, leitura): `profiles` não tem papel — o acesso ao resto do app vem só de
`organization_members`; o gatilho `fn_auth_user_link_org_members` liga conta nova a convites de
organização PELO E-MAIL (convidado interno continua funcionando; público sem convite não liga).
Provedores em uso hoje: só `email` (23 identidades).

## Passos

### P1. Casca isolada em `/pro` + instalável — frente `pro-publico`
**O que muda:** `App.tsx` reconhece `/pro` antes dos guards de login (como os portais) e monta
`ProPublico`: sessão própria, fora do `<Layout>`, sem seletor de organização; dentro, o
`ProModule` em modo "só Pro" (sem abas do app no computador; "Sair" em Ajustes). Manifesto PWA
próprio (`/pro.webmanifest`: nome "ÒPURA Pro", `start_url` `/pro`, ícone). Conta marcada como
só-Pro (`user_metadata.origem = 'pro'`) que abrir `/` volta para `/pro`.
**Como sei que terminou:** em `/pro` logado, nenhum elemento do `<Layout>` (sidebar, seletor de
organização, sino) no DOM; navegar para `/` com conta só-Pro termina em `/pro`; o navegador
oferece instalar com o nome "ÒPURA Pro"; teste de unidade da regra de redirecionamento.

### P2. Entrar com Google ou código por e-mail
**O que muda:** tela de entrada do Pro com "Continuar com Google" (`signInWithOAuth`, volta para
`/pro`) e "Receber código por e-mail" (`signInWithOtp` + `verifyOtp`, 6 dígitos). Ao criar a conta
por aqui, grava `origem = 'pro'`.
**Depende do usuário:** cliente OAuth no Google Cloud + provedor Google ligado no Supabase;
modelo do e-mail de código com `{{ .Token }}` no Supabase (configuração de conta — não faço
sozinho).
**Como sei que terminou:** conta nova criada pelo celular pelos dois caminhos chega ao Pro.

### P3. Primeiro acesso
**O que muda:** sem `pro_config`, pede nome comercial + profissão (2 campos) e grava; depois vai
para "Criar o primeiro orçamento".
**Como sei que terminou:** conta nova vê o primeiro acesso uma vez só; profissão escolhida define
os modelos sugeridos.

### P4. Página de apresentação (`/pro` sem sessão)
**O que muda:** página pública no celular (modo Persuade): o que faz, que é grátis, telas reais
do Pro, botão "Criar conta grátis". Passa pelo fluxo de página nova do impeccable.
**Como sei que terminou:** conferida a 390px e no computador; sem promessa que o produto não cumpre.

### P5. Termos de uso e política de privacidade
**O que muda:** rascunho em linguagem simples para revisão do usuário/jurídico, linkado na
entrada. **O texto final não é meu** — fica marcado como rascunho até o usuário aprovar.
**Como sei que terminou:** usuário aprova o texto.

### P6. Prova de isolamento
**O que muda:** roteiro reproduzível: conta só-Pro de teste tenta cada rota do ÒPURA e consultas
diretas às tabelas da construtora; tudo vazio/recusado.
**Depende do usuário:** criar a conta de teste (criação de conta é dele).
**Como sei que terminou:** roteiro rodado, resultado registrado aqui.

## Estado (14/11/2026)

**P1 + P2 (código) + P3: implementados e conferidos localmente; NÃO publicar ainda.** Juntos num
PR só porque publicar = merge no `main`: o `/pro` não pode ir ao ar com a entrada pela metade.
- `utils/proPublico.ts` (8 testes): `/pro` e subcaminhos; conta só-Pro (`user_metadata.origem`)
  fora do `/pro` → `/pro`; conta interna nunca redirecionada.
- `App.tsx`: guard do `/pro` antes dos portais e do login; efeito que devolve a conta só-Pro; a
  escolha de portal que sobrou no navegador é limpa só para conta só-Pro.
- `components/pro/ProPublico.tsx` (casca, sessão própria, manifesto `/pro.webmanifest`),
  `ProEntrada.tsx` (Google + código por e-mail; aceita também o link), `ProPrimeiroAcesso.tsx`
  (nome + profissão → `pro_config`); "Sair da conta" em Ajustes só no `/pro`.
- Conferido (servidor local, gravações simuladas na aba): entrada em `localhost` sem sessão —
  título "ÒPURA Pro", manifesto trocado, sem barra lateral nem seletor de organização; com sessão
  sem cadastro → primeiro acesso → "Começar" grava só `pro_config` → abre "Novo orçamento
  rápido" com a barra do Pro; Ajustes mostra a profissão escolhida e "Sair da conta".
  `ClientSelect` do orçamento recebe só os clientes do Pro (não lê por organização).
- `tsc` exit 0; guia sem ❌ nas telas novas; travas verdes.

**Antes de publicar, depende do usuário (configuração de contas — não faço sozinho):**
1. Supabase › Authentication › URL Configuration: incluir `https://orcacloud.vercel.app/pro`
   nas Redirect URLs (o retorno do Google e do link do e-mail vem para `/pro`).
2. Google: criar o cliente OAuth (Google Cloud › APIs e serviços › Credenciais), com o
   redirecionamento `https://<projeto>.supabase.co/auth/v1/callback`, e ligar o provedor
   Google no Supabase com o ID e o segredo.
3. Supabase › Email Templates › Magic Link: incluir `{{ .Token }}` para o e-mail trazer o
   código de 6 números (sem isso o e-mail traz só o link — que também funciona).

**Não verificado:** o envio real do código e o Google (exigem criar conta de verdade — P6, com a
conta de teste que o usuário criar).

**Pendentes:** P4 (página de apresentação), P5 (termos/privacidade — rascunho para revisão), P6.

**P4 (página de apresentação): concluída.** Teste com teclado real feito pelo usuário no celular
(servidor da frente na rede local, `http://<IP>:5188/pro`) — resposta: "aprovado!" (14/11/2026).
- Perguntas: preço = "Grátis", sem prazo (+ "sem cartão"); primeira tela = orçamento pronto no
  WhatsApp; rodapé = "feito por uma construtora" (sem citar a Alpa).
- `concept-seed --scope surface --mode persuade` (seed:fed77fbe51f9c0e4) sorteou 3 de 7 estruturas;
  na página de decisão o usuário escolheu "Monte o seu orçamento agora" (a sorteada para liderar).
  Contrato de direção em `.impeccable/surfaces/components-pro-proapresentacao-tsx.md`; esboços da
  decisão em `.impeccable/mocks/decision/`.
- `components/pro/ProApresentacao.tsx`: demonstração viva (serviço, cliente, valor → balão do
  WhatsApp com PDF, ✓ enviando → ✓✓ entregue), "o resto do dia" com pedaços do Pro (QR de exemplo
  NÃO pagável, assinatura, quem deve), "Grátis.", rodapé; ação fixa "Mandar de verdade — conta
  grátis"; `/pro/entrar` com voltar no histórico; `lib/tabRouter.ts` não grava `#/…` no `/pro`.
- Revisão final independente (impeccable-finish-reviewer): 1ª rodada `fix` com 7 correções
  materiais (teclado cobrindo o balão, botão quebrando a 360 px, QR de Pix pagável real, ✓✓ azul =
  "lida", nome no PDF, peso de fonte 900 não carregado, foco/caret); 1ª passada de veredito 3
  resolvidas + 4 parciais + 2 regressões (valor sumiu do PDF, salto ao focar); 2ª rodada → 2ª
  passada: tudo resolvido **exceto teclado real** (Android/iOS) — sem aparelho, fica com o usuário.
- `tsc` exit 0; detector 1 aviso intencional (`md:text-[44px]` fora da régua do DESIGN.md do
  Portal do Colaborador); guia sem ❌.
- **DESIGN.md não descreve o mundo do Pro/app** (é o do Portal do Colaborador): registrar o mundo do
  Pro é mudança de sistema — pendente de decisão do usuário.
