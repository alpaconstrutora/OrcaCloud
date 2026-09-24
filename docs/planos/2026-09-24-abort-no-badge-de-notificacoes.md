# O AbortError que apareceu ao cadastrar equipamento

## Pedido original

Sessão de 24/09/2026, transcrito literalmente:

> erro no console ao tentar cadastrar novo equipamento, atraves do modal Novo equipamento:
>
> index-zErFYfYj.js:710 Failed to fetch unread count:
> Object
> code : ""
> details : "AbortError: signal is aborted without reason\n    at https://orcacloud.vercel.app/assets/index-zErFYfYj.js:697:43538"
> hint : ""
> message : "AbortError: signal is aborted without reason"
> (anonymous)	@	index-zErFYfYj.js:710

## O que a investigação achou

### O erro NÃO vem do cadastro de equipamento

`"Failed to fetch unread count"` é de **`components/Layout.tsx:655`** — o badge
de notificações da barra lateral. Ele roda a cada 60 s, a cada evento
`notifications_updated` e a cada mudança que o Realtime entrega. Não tem
nenhuma relação com o modal "Novo equipamento" (`condominio/AtivosTab.tsx`):
só calhou de disparar enquanto o modal estava aberto.

**O cadastro em si está íntegro.** O `INSERT` que a tela faz em `opura_assets`
foi exercitado no banco de produção, num bloco que se reverte sozinho:

```
INSERT PASSOU | ultimo=OPR-PRE-0001 novo=OPR-PRE-0002 id=4086600f-…
```

### De onde vem o `AbortError`

De `lib/supabase.ts`: o client tem um **timeout de rede de 20 s**
(`fetchWithTimeout` → `controller.abort()`), que existe para transformar um
backend travado em erro tratável em vez de "Sincronizando…" eterno. `abort()`
sem argumento produz exatamente a mensagem *"signal is aborted without reason"*.

Ou seja: a requisição do badge passou de 20 s e o próprio client a cortou.

### O banco NÃO é o gargalo — e isso muda o diagnóstico

Medido em produção, na tabela real (1.242 linhas, 624 kB, índice em
`recipient_email`):

| Consulta | Tempo |
|---|---|
| filtro exato por e-mail (174 linhas) | **11,8 ms** |
| predicado da RLS, `lower()` dos dois lados | **1,5 ms** |

Milissegundos. Então os 20 s não são tempo de consulta: são **contenção**.
Instrumentando a rede no navegador, o app dispara ~30 requisições no login e
várias levam 5–7 s (`fn_project_scorecard`, `fn_cashflow_projection`,
`fn_reconciliation_divergences`, `fn_approval_action_queue`…). O `GET
notifications` mediu **3,7 s e 6,5 s** nessa fila. Sob a carga de produção,
passar de 20 s deixa de ser improvável.

⚠️ **Não reproduzi o abort.** Deixei o modal aberto por 35 s (mais que o
timeout de 20 s) no servidor da frente e o console ficou limpo. O que segue
corrige o que está comprovadamente errado e reduz a chance de o badge ser a
vítima — não posso afirmar que elimina o sintoma sob carga.

### O que está de fato errado no badge

1. **Ele busca LINHAS INTEIRAS para contar.** `listNotifications` traz
   `id, recipient_email, title, message, link, type, organization_id, is_read,
   created_at` de TODAS as notificações do usuário, e a tela conta `!isRead` em
   JavaScript. São 174 linhas com texto de título e mensagem, a cada 60 s, para
   produzir **um número**.

2. **Para o perfil DESENVOLVEDOR o filtro de e-mail some.** `Layout.tsx:647-651`
   faz `emailToFilter = isDev ? undefined : profile.email` — a consulta então
   traz tudo que a RLS deixa ver (1.236 não lidas de 8 destinatários), e o badge
   passa a contar notificação dos outros. É mais dado e é o número errado.

3. **Poll abortado vira `console.error`.** Abort de um poll que se repete em
   60 s não é erro de aplicação — e foi justamente isso que fez parecer que o
   cadastro de equipamento tinha falhado.

## Plano

### 1. `services/notificationService.ts` (editado)

`countUnread(email?, organizationId?)` novo: `head: true` + `count: 'exact'` +
`.eq('is_read', false)`. Zero linha trafegada, mesmo recorte de
`listNotifications` (e o mesmo cuidado da REGRA #5 com `organizationId`).

**Como sei que terminou:** a resposta do `GET notifications` do badge vira
`Content-Range` sem corpo.

### 2. `components/Layout.tsx` (editado)

- `fetchUnreadCount` usa `countUnread`, sem trazer linha nenhuma.
- **Mantém o filtro de e-mail também para o DESENVOLVEDOR**: badge é "as MINHAS
  não lidas". A caixa de notificações continua podendo mostrar tudo.
- Abort/rede caem em `console.warn` com texto que diz o que aconteceu; erro de
  verdade continua em `console.error`.

**Como sei que terminou:** badge com o mesmo número de antes, e nenhum
`console.error` quando um poll é cortado.

## Estado — 24/09/2026: concluído

### Medido, produção (código antigo) × frente (corrigido)

Mesmo roteiro, mesmo usuário, escritas bloqueadas:

| | Produção (antes) | Frente (depois) |
|---|---|---|
| Método | `GET notifications?select=id,recipient_email,title,message,link,type,organization_id,is_read,created_at` | `HEAD notifications?select=id&is_read=eq.false&recipient_email=eq.…` |
| Corpo da resposta | **95.238 bytes** | **0 bytes** |
| Contagem | 180, contada em JS sobre 180 objetos | 180, lida do `Content-Range: 0-179/180` |

**95 KB de JSON a cada 60 segundos, a cada evento do Realtime e a cada
`notifications_updated`, para produzir o número 180.** Agora zero.

O número do badge não mudou: 180 antes, 180 depois.

### O que NÃO consegui provar

- **O abort em si.** Deixei o modal "Novo equipamento" aberto por 35 s (o
  timeout do client é 20 s) e o console ficou limpo. A correção ataca o custo
  da requisição, não uma causa raiz que eu tenha observado.
- **O gargalo continua de pé.** O app dispara ~30 requisições no carregamento,
  várias de 5–7 s (`fn_project_scorecard`, `fn_cashflow_projection`,
  `fn_reconciliation_divergences`, `fn_approval_action_queue`). É essa fila que
  permite uma requisição passar de 20 s em produção. Reduzir o badge tira um
  peso da fila; não resolve a fila.

### Achados registrados e NÃO alterados

- `HEAD sinapi_items` e `HEAD tasks` aparecem como `net::ERR_ABORTED` durante a
  transição do login — **em produção também**, com o código antigo. É anterior a
  esta correção e não foi tocado.
- O filtro do **Realtime** continua sem recorte para o perfil DESENVOLVEDOR
  (`Layout.tsx:690`): o toast pode anunciar notificação de outra pessoa. Mudar
  isso altera quais toasts aparecem, que não é o que se pediu — está comentado
  no código.

### Mecânica

`tsc` limpo · `npm run build` limpo · **5.165 testes** · `check-ui-standard.sh`
limpo em `Layout.tsx` · `check-system-projects`, `check-project-classification`,
`check-org-selector-guard`, `check-xss-sinks` OK · zero erro de console.
