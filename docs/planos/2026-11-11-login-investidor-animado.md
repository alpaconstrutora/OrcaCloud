# Login do Portal do Investidor com animação de troca login ↔ cadastro

## Pedido original

Sessão de 11/11/2026 (VS Code), mensagem do usuário, transcrita literalmente:

> assista e implemente na tela de login do portal do investidor:
>
> https://www.facebook.com/reel/2923216798047878

### O que o vídeo mostra (assistido no Chrome, 11/11/2026)

Reel "Login/Signup Form Animation" (Code By Gaurav): cartão escuro com borda
brilhante laranja; painel diagonal laranja à direita com "WELCOME BACK!" e um
texto curto; formulário "Login" à esquerda com campos sublinhados e ícone à
direita (usuário, cadeado), botão laranja em gradiente e "Don't have an account?
Sign Up". Ao clicar em "Sign Up", o painel diagonal varre o cartão para o outro
lado e os campos saem/entram escalonados — o cadastro fica à direita e o texto
de boas-vindas à esquerda. O caminho de volta faz o movimento inverso.

## Decisões

- **Onde:** o Investidor não tem entrada própria (`lib/entradasDoPortal.ts`) — sem
  sessão, o `App.tsx` renderizava o `Auth` genérico com o tema roxo. A tela nova é
  `components/portal/InvestorLogin.tsx` e o `App.tsx` a escolhe para
  `ProfileGroup.INVESTOR`. O investidor continua entrando pelo seletor; nenhuma rota nova.
- **Cor:** o coral do vocabulário dos portais externos (§24, `P.accent` do
  `PortalKit`) — é o acento que o investidor vê lá dentro, e é quase o laranja do
  vídeo. Tokens vêm do kit, não de hex à mão.
- **Comportamento preservado do `Auth`:** "Voltar para Portais", cadastro
  (signUp) e "Esqueci minha senha" com retorno para `/`. O `alert()` do cadastro
  vira mensagem na tela; erros do Supabase em português (mesmas funções do
  `PortalLogin`).
- **Texto em português, sem caixa alta** (o "WELCOME BACK!" do vídeo vira
  "Bem-vindo de volta!").
- **Movimento:** `prefers-reduced-motion` desliga as transições; o formulário
  escondido fica `inert` (fora do Tab e do leitor de tela). No celular não há
  diagonal: um formulário de cada vez, com o cabeçalho coral em cima.

## Itens

1. `components/portal/InvestorLogin.tsx` (novo) — cartão com painel diagonal e
   três modos (entrar, esqueci, cadastro). **Pronto quando:** abre no navegador
   local pelo seletor › Portal do Investidor, e a troca entrar ↔ cadastro anima
   nos dois sentidos (print).
2. `App.tsx` — `INVESTOR` sem sessão renderiza `InvestorLogin`. **Pronto quando:**
   o seletor leva à tela nova e "Voltar para Portais" volta ao seletor.
3. `components/Auth.tsx` — sai o tema do Investidor, que ficou inalcançável.
   **Pronto quando:** `tsc` sem erro novo.
4. `__tests__/components/InvestorLogin.test.tsx` (novo) — entrar marca a aba
   antes do signIn; erro em português; esqueci esconde a senha; cadastro chama
   signUp e volta a entrar com a mensagem; formulário escondido é `inert`; botão
   desabilitado diz o motivo. **Pronto quando:** a suíte do arquivo passa.
5. Catracas (`campoAlturaGuard`, `rotuloSemCaixaAltaGuard`, `rotuloPadraoGuard`) e
   `check-ui-standard.sh` nos arquivos tocados. **Pronto quando:** verdes.

## Andamento

- 11/11/2026 — frente `login-investidor-animado` aberta de `origin/main`.
- 11/11/2026 — itens 1 a 5 prontos (5 de 5):
  - navegador local (vite :5291), seletor › Portal do Investidor abre a tela nova;
    entrar ↔ criar conta medido pelo `transform`: o painel inverte a inclinação em
    ~900 ms e os campos saem 120% esmaecendo; lado escondido `inert`. Celular
    (iframe 390 px): faixa coral em cima, um formulário por vez, sem rolagem lateral.
  - defeito achado no navegador e corrigido: o botão do formulário que SAI trocava
    o rótulo para "Criar conta" no meio da varredura — rótulo agora é por lado
    (trava no teste 6).
  - `tsc` 0 erro; 7 arquivos de teste / 47 testes (InvestorLogin, PortalLogin, 3
    catracas de campo/rótulo, entradasDoPortal, orgContextGuard);
    `check-ui-standard.sh` limpo nos três arquivos.
- Em aberto (decisão do usuário): o cartão do Investidor no seletor (`LoginGateway`)
  continua roxo; a tela de login é coral.

## Pedido 2 — 11/11/2026

> use essa cor #E1553C nona tela de login

(Depois de medir no portal por link: selo, avatar e item ativo = `#E1553C`.) O login já usava
`#E1553C` na borda e nos links, mas o painel e o botão faziam degradê até `#C8452E`/marrom, o
rastro com 40% de opacidade virava faixa marrom e o botão desabilitado (70%) ficava vermelho-escuro.

6. `components/portal/InvestorLogin.tsx` — painel, rastro, faixa do celular e botão em `P.accent`
   sólido; botão desabilitado mantém a cor (perde só a sombra; o motivo continua embaixo).
   **Pronto quando:** estilo computado no navegador = `rgb(225, 85, 60)` sem `background-image`.
   ✅ 11/11/2026 — medido no vite local (painel, rastro e botão `rgb(225, 85, 60)`, `none`);
   prints dos dois lados; InvestorLogin + campoAlturaGuard 11/11 testes, `tsc` 0, check-ui limpo.
