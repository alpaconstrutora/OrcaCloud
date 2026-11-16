# Portal do Investidor com endereço próprio (`/portal-investidor`)

## Pedido original

Sessão `f3c75338`, 16/11/2026 ~10:50:

> os portais tem caminhos proprios como o portal do cliente https://orcacloud.vercel.app/portal-cliente.
> Faca o mesmo para o portal do investidor: https://orcacloud.vercel.app/portal-Investidor

## Situação antes

- `/portal-investidor?token=…` já abria a casca do link (`InvestorPortalTokenGate`).
- `/portal-investidor` **sem** token caía no seletor de portais: o Investidor não estava em
  `lib/entradasDoPortal.ts` (o teste travava o conjunto — "incluir Investidor é decisão de
  produto"; a decisão veio neste pedido).
- O login do investidor é a tela própria animada `components/portal/InvestorLogin.tsx` (#364),
  não o `PortalLogin` dos outros portais — tem de continuar sendo.
- Desde o #493 (16/11) o login por e-mail do investidor já abre a casca do link
  (`portal_token_para_mim('investidor')`).

## Itens

1. **`lib/entradasDoPortal.ts`** — entrada `INVESTOR` com rota `/portal-investidor`,
   identidade igual à do `InvestorLogin` (coral #E1553C por extenso), `permitePrimeiroAcesso:
   true` (a tela tem "Criar conta"). `entradaDaRota` passa a ignorar maiúsculas
   (`/portal-Investidor`, como no pedido, também abre).
   *Pronto quando:* `entradaDaRota('/portal-investidor')` e `('/portal-Investidor')` → INVESTOR;
   `destinoAposSair(INVESTOR)` → `/portal-investidor` (teste).
2. **`App.tsx`** — sem sessão, o Investidor continua com `InvestorLogin` (checado ANTES do
   `PortalLogin` genérico), agora sem "Voltar para Portais", como as demais entradas próprias
   (a saída para o seletor é só a recusa). Comentários atualizados.
   *Pronto quando:* no navegador, `/portal-investidor` abre o cartão coral animado direto, sem
   o seletor; o cartão "Portal do Investidor" do seletor troca o endereço para
   `/portal-investidor`.
3. **`components/portal/InvestorLogin.tsx`** — "esqueci a senha" e "criar conta" mandam o
   link do e-mail de volta para `/portal-investidor` (era `/`).
   *Pronto quando:* teste confere `redirectTo`/`emailRedirectTo` com a rota.
4. **Testes** — `__tests__/entradasDoPortal.test.ts`, `__tests__/components/entradaDaUrlAtual.test.ts`,
   `__tests__/components/InvestorLogin.test.tsx` atualizados.
   *Pronto quando:* os três passam.

Allow-list de redirect do Supabase Auth: já é `https://orcacloud.vercel.app/**` (conferida em
16/10/2026) — nada a cadastrar. Rewrite do Vercel já manda qualquer rota para o `index.html`.

## Andamento

- [x] 1 · [x] 2 · [x] 3 · [x] 4 — 16/11/2026.
- Testes: os 3 arquivos + `PortalLogin` + `validateAccessPortais` = 29/29; `tsc --noEmit` exit 0.
- Navegador (vite local, Playwright, `C:\tmp\pwtest\portal-investidor-rota\prova.js`, sem escrita —
  recover interceptado): `/portal-investidor` e `/portal-Investidor` abrem o cartão coral direto,
  sem seletor e sem "Voltar para Portais"; o cartão do seletor troca o endereço para
  `/portal-investidor`; "esqueci a senha" manda `redirect_to=…/portal-investidor`;
  `?token=` falso cai no "Link inválido ou expirado" (gate do link); `/portal-cliente` segue com o
  `PortalLogin`; celular 390 px sem rolagem lateral.
