# Link de convite / "esqueci a senha" abria "Nova senha" sem sessão

## Pedido original

Sessão `bef90ec4-4d31-470b-a193-71ce97673653` · 26/11/2026, durante a prova de ponta a ponta das
assembleias (`docs/planos/2026-11-25-condominio-assembleias-votacoes.md`, Task A9). O primeiro acesso
do condômino de teste ao Portal do Cliente falhou três vezes ("login expirou"; campos travados;
"Você não está mais conectado (houve logout…). Nada foi gravado."). Perguntado como seguir, com a
opção "1. Investigo primeiro o defeito do link de primeiro acesso", o usuário respondeu:

> 1

## Causa (medida em produção, 26/11)

Observação da página aberta pelo link (`/auth/v1/verify` → `303` →
`/portal-cliente#access_token=…&type=recovery`):

| | Produção (ce4c3c3) |
|---|---|
| 0,1 s | chega `#access_token=…&refresh_token=…&type=recovery` |
| 0,5 s | o hash vira `#/central` |
| 0–180 s | nenhum `GET /auth/v1/user`; nenhuma sessão no `localStorage` |

- `App.tsx` roda `syncViewToUrl(activeView)` num efeito da 1ª renderização e troca o hash por
  `#/central`.
- O `@supabase/auth-js` (2.90.1) só lê `window.location.href` dentro de `_initialize()`, **depois**
  de adquirir a trava de inicialização (assíncrona). Quando lê, o hash já é `#/central`: a sessão
  do link se perde.
- `lib/linkDeAcesso.ts` captura tipo e e-mail na carga do módulo, então a tela "Nova senha" abre
  e mostra o e-mail — mas sem sessão por trás. O salvar faz `getUser()`, recebe vazio e diz "Você
  não está mais conectado".
- Vale para todo link de convite e de redefinição, em todos os portais e no app.

## Plano

### 1. `lib/tabRouter.ts` — não reescrever o hash de retorno da autenticação

**O que muda:** `ehRetornoDaAutenticacao(hash)` (hash fora de rota com `access_token`,
`refresh_token` ou `error_code`); `syncViewToUrl` não reescreve nesse caso. O próprio Supabase apaga
o hash depois de ler; a vista é escrita na próxima chamada.

**Como sei que terminou:** `__tests__/tabRouterLinkDireto.test.ts` — "não apaga o hash com a sessão
do link (access_token)", "não apaga o hash com o erro do link", "depois que o Supabase limpa o hash,
escreve a vista normalmente": falhavam com `Received: "#/central"`; passam.

### 2. Prova no app real

**Como sei que terminou:** link de redefinição real aberto no app da frente (servidor local, mesmo
Supabase), desviando o `303` do `/auth/v1/verify` para `127.0.0.1`:

| | Com a correção |
|---|---|
| 0,5 s | hash ainda `#access_token=…`; `GET /auth/v1/user` → 200 |
| 2,5 s | sessão no `localStorage` para a conta do link; tela "Nova senha" |
| salvar | `PUT /auth/v1/user` → 200; entra no portal ("Olá, TESTE") |

Link vencido: hash `#error=…otp_expired` preservado; tela "Link expirado ou já usado".

## Estado

- [x] 1 — teste vermelho → verde
- [x] 2 — prova no app real (26/11)
- [x] publicado — PR #768 (8466df1), domínio servindo 8466df1; provado de novo em produção no convite do síndico (26/11: sessão gravada, 'Criar sua senha')
