# Pedido: abas Financeiro, Recebimento e Comunicação no Portal do Fornecedor

## Pedido original

> suprimentos < pedidos tem tres  abas (fianceiro, recebimento e comunicacoes) que nao esta conectado ao portal do fornecedor, tanto an visao do app e na visão do fornecedor (token).
> verifique

Sessão: `b89626fa-78ae-4c07-b3c4-2046b15eb579` · 2026-09-07

Depois da verificação, no mesmo dia:

> abra uma frente para corrigir

---

## O que a verificação achou (2026-09-07)

A barra de abas de `SupplyChainOrderDetails` é uma lista fixa, **sem nenhum corte
por `portalToken`** — o fornecedor vê as cinco abas. Três delas não têm caminho de
dados nenhum do lado dele:

| Aba | O que acontece hoje no fornecedor |
|---|---|
| **Financeiro** | Todo o conteúdo é o `SupplyChainOrderForm` embutido, dentro de `{!portalToken && …}`. No token a aba fica **literalmente em branco** — nem empty state. |
| **Recebimento** | O `OrderLifeline` renderiza, mas `receipts`/`discrepancies` **nunca são carregados** no modo token (o `useEffect` faz `return` logo depois do `getOrderDetail`). O empty state *"Nada recebido ainda"* aparece **sempre**. Há 4 comprovantes no banco, invisíveis. |
| **Comunicação** | `notifLogs` também nunca carrega (13 registros no banco) e o chat é `!portalToken`. O fornecedor só vê *"Conversa indisponível aqui"*. |

**Causa raiz no token:** `supplier_portal_get_order_detail` devolve só `order` +
`invoices`. Das **19** RPCs `supplier_portal_*` existentes no banco, **nenhuma**
toca `purchase_receipts`, `purchase_discrepancies`, `notification_log` ou
`order_chats`. Não é flag esquecida no front — o caminho de dados não existe.

**Visão do app (fornecedor logado, `ProfileGroup.SUPPLIER`):** é o problema
inverso, e mais grave. `AppRouter.tsx:374` e `:1073` renderizam
`SupplierDashboard` **sem** `portalToken`, então `SupplyChainOrderDetails` cai no
ramo interno: o fornecedor recebe **o formulário de edição do comprador**
embutido (abas Dados/Itens/Financeiro, com conta de pagamento, centro de custo e
plano de contas) e o painel 3-Way Match. E a RLS deixa passar — as policies de
`purchase_receipts`, `purchase_discrepancies` e `notification_log` são `FOR ALL`
com `order_id IN (SELECT id FROM purchase_orders)`, e `po_select_org_or_supplier`
casa o fornecedor por e-mail: ele **lê e escreve** comprovante, divergência e log
dos próprios pedidos.

**Defeito separado achado no caminho:** `order_chats` tem RLS ligada e **ZERO
policies**. O chat do pedido não funciona para ninguém — nem para o comprador:
todo SELECT volta vazio e todo INSERT é rejeitado. A tabela tem **0 linhas**,
o que confirma que nunca funcionou desde a limpeza das policies `anon`.

---

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-07 | Aba Comunicação: chat vira canal com o fornecedor, ou continua interno? | **Chat aberto ao fornecedor** — RPCs de token para ler e enviar mensagem; o chat deixa de ser canal interno. |
| 2026-09-07 | O que o fornecedor pode fazer na aba Recebimento? | **Leitura + responder divergência** — além de ver comprovantes e divergências, pode responder a uma pendente. |

Decisões derivadas, tomadas ao escrever o plano (mudar exige confirmar antes):

- **Quem RESOLVE a divergência continua sendo o comprador.** O fornecedor
  acrescenta uma resposta (`supplier_response`); o `status`
  (Resolvida/Aceita/Devolvida) segue campo do comprador. Sem isso o fornecedor
  fecharia a própria divergência.
- **O 3-Way Match fica fora do fornecedor** nas duas visões — é conferência
  interna do comprador (compra × NFe × recebimento).
- **A aba Financeiro do fornecedor é só leitura e só das condições comerciais**
  (condição de pagamento, prazo, parcelas, observações). Conta de pagamento,
  centro de custo e plano de contas **não** aparecem: são dimensões contábeis do
  comprador.
- **O formulário do comprador não ganha "modo fornecedor".** A leitura do
  fornecedor é um bloco próprio no detalhe; `SupplyChainOrderForm` continua sendo
  só o editor do comprador.

---

## Plano

### Banco

**1. `supabase/migrations/aplicar_20270919000028_pedido_abas_portal_fornecedor.sql`** (novo)

O que muda:

- **Duas funções de autorização** reutilizadas pelas policies e pelas RPCs:
  - `public.pedido_do_meu_time(p_order_id uuid)` — sou membro da organização da
    obra do pedido (`projects` × `organization_members` por e-mail do JWT).
  - `public.pedido_do_meu_fornecedor(p_order_id uuid)` — sou o fornecedor do
    pedido (`suppliers.email` = e-mail do JWT, minúsculas).
  - Ambas `SECURITY DEFINER STABLE`, com `REVOKE EXECUTE … FROM PUBLIC, anon` +
    `GRANT … TO authenticated` (REGRA #7, pergunta 2).
- **Policies de `order_chats`** (hoje ZERO — chat morto): `SELECT` e `INSERT`
  para `pedido_do_meu_time(order_id) OR pedido_do_meu_fornecedor(order_id)`.
  **Sem** `UPDATE`/`DELETE`: mensagem enviada não se edita nem se apaga.
- **Coluna `order_chats.sender_role`** `text NOT NULL DEFAULT 'buyer'` com
  `CHECK (sender_role IN ('buyer','supplier','system'))`. Sem ela a UI não sabe
  de que lado desenhar a mensagem — hoje só existe `sender_email`, e o fornecedor
  por token pode nem ter e-mail cadastrado.
- **Colunas `purchase_discrepancies.supplier_response` (text) e
  `supplier_responded_at` (timestamptz)**.
- **Fecha a escrita do fornecedor logado**: substitui as policies `FOR ALL` de
  `purchase_receipts`, `purchase_discrepancies` e `notification_log` por
  `SELECT` = `pedido_do_meu_time OR pedido_do_meu_fornecedor` e
  `INSERT/UPDATE/DELETE` = `pedido_do_meu_time` apenas.
- **RPC `public.discrepancy_supplier_respond(p_discrepancy_id uuid, p_response text)`**
  — o caminho de escrita do fornecedor **logado** (que não tem token). Grava só
  `supplier_response`/`supplier_responded_at`, exige `pedido_do_meu_fornecedor` e
  `status = 'Pendente'`. `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated`.
- **Quatro RPCs de token** (mesmo padrão das 19 existentes: autorização **dentro**
  da função via `supplier_portal_supplier_from_token`; `GRANT … TO anon,
  authenticated` é intencional — o link público roda com a chave anon — mas com
  `REVOKE EXECUTE … FROM PUBLIC` antes):
  - `supplier_portal_get_order_receipts(p_token, p_order_id)` → comprovantes +
    itens + divergências (com `supplier_response`) do pedido.
  - `supplier_portal_get_order_notifications(p_token, p_order_id)` → log de
    notificações **sem** `error`, `body` e `metadata` (mensagens técnicas
    internas não vão para o fornecedor).
  - `supplier_portal_get_order_messages(p_token, p_order_id)` → chat do pedido.
  - `supplier_portal_send_order_message(p_token, p_order_id, p_message)` → insere
    com `sender_role = 'supplier'`.
  - `supplier_portal_respond_discrepancy(p_token, p_discrepancy_id, p_response)`.
- Aplicar com `npx supabase db query --linked -f <arquivo>` — **nunca**
  `supabase db push` (histórico furado).

Como sei que terminou:

```bash
# 19 → 24 RPCs de portal, e as 5 novas na lista
npx supabase db query --linked -o table \
  "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and proname like 'supplier_portal%' order by 1"

# order_chats deixa de ter ZERO policies
npx supabase db query --linked -o table \
  "select tablename, policyname, cmd from pg_policies
   where schemaname='public' and tablename in
   ('order_chats','purchase_receipts','purchase_discrepancies','notification_log')
   order by tablename, cmd"
#   → order_chats: 2 (SELECT, INSERT)
#   → as outras três: SELECT separado de INSERT/UPDATE/DELETE, nenhuma FOR ALL

# REGRA #7 — nenhuma função nova sem REVOKE
npx vitest run __tests__/segurancaMigrations.test.ts
```

E, com token inválido, cada RPC nova devolve `{"valid": false}` — não erro, não
linha de outro fornecedor.

### Edge Function

**2. `supabase/functions/supplier-portal-download/index.ts`**

O que muda: hoje a function é fixa no bucket `invoices` e valida o caminho contra
`invoices.file_path`. Ganha um parâmetro `bucket` opcional (`'invoices'` |
`'receipts'`, default `'invoices'` — nenhum outro valor aceito). Para
`'receipts'`, a validação passa a ser `purchase_receipts.photo_path = storagePath`
com o pedido pertencendo ao fornecedor do token. Sem isso a foto do comprovante
não abre no link público (bucket privado, sessão anon não assina URL).

Como sei que terminou: deploy feito e, **contra a function publicada** (não o
arquivo local — REGRA #7, pergunta 3):

```bash
# sem token: 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/functions/v1/supplier-portal-download" \
  -H 'Content-Type: application/json' -d '{"storagePath":"x","bucket":"receipts"}'
# bucket fora da lista: 400, e nunca assina
```

E, no portal, a foto de um comprovante real abre.

### Services

**3. `services/supplierPortalTokenService.ts`**

O que muda: cinco métodos novos espelhando as RPCs — `getOrderReceipts`,
`getOrderNotifications`, `getOrderMessages`, `sendOrderMessage`,
`respondDiscrepancy` — e `getReceiptPhotoUrl(token, path)` chamando a function com
`bucket: 'receipts'`. Mesma forma dos existentes: checar `data.valid`, mapear
snake_case → camelCase reusando os `map*` já existentes.

Como sei que terminou: `npm run typecheck` limpo e os métodos devolvem os mesmos
tipos que `receiptService.PurchaseReceipt`, `discrepancyService.PurchaseDiscrepancy`,
`notificationLogService.NotificationLogEntry` e `chatService.OrderChatMessage` —
para o componente não precisar de dois formatos.

**4. `services/chatService.ts`**

O que muda: `listMessages`/`sendMessage` passam a ler e gravar `sender_role`;
`OrderChatMessage` ganha `senderRole`. `sendMessage` recebe o papel de quem
escreve em vez de assumir comprador.

Como sei que terminou: mensagem enviada pelo comprador grava `'buyer'`, pelo
fornecedor logado grava `'supplier'`, e a notificação ao fornecedor (que
`sendMessage` já dispara) **não** dispara quando quem escreveu foi o fornecedor.

**5. `services/discrepancyService.ts`**

O que muda: `listByOrder` passa a selecionar `supplier_response` e
`supplier_responded_at`; `PurchaseDiscrepancy` ganha os dois campos; método novo
`respondAsSupplier(id, response)` chamando `discrepancy_supplier_respond`.

Como sei que terminou: `updateStatus` (comprador) continua intacto e a resposta
do fornecedor aparece no cartão da divergência dos dois lados.

**6. `services/notificationLogService.ts`**

O que muda: `listByOrder` ganha uma variante estreita para o fornecedor logado
(sem `error`/`body`/`metadata`) — o mesmo recorte que a RPC de token faz.

Como sei que terminou: a aba Comunicação do fornecedor nunca renderiza texto de
erro técnico, nas duas visões.

### Componentes

**7. `components/SupplyChainOrderDetails.tsx`** (o arquivo central)

O que muda:

- **Prop nova `perfil?: 'comprador' | 'fornecedor'`** (default `'comprador'`;
  `portalToken` força `'fornecedor'`). **Todos** os gates hoje escritos
  `!portalToken` passam a olhar `perfil === 'comprador'` — é o que conserta a
  visão do app, onde não há token mas o leitor é o fornecedor.
- **Carregamento**: no modo fornecedor com token, buscar também recebimentos,
  divergências, notificações e mensagens pelas RPCs novas (hoje o `useEffect`
  faz `return` e deixa os três estados vazios); no modo fornecedor **logado**,
  usar os services com as policies novas.
- **Aba Financeiro**: no perfil fornecedor, bloco de leitura próprio com condição
  de pagamento, prazo/parcelas e observações. O `SupplyChainOrderForm` embutido
  continua só no perfil comprador.
- **Aba Recebimento**: comprovantes e divergências passam a renderizar no perfil
  fornecedor; o empty state só aparece quando a lista está de fato vazia; cada
  divergência pendente ganha o campo de resposta do fornecedor. `ThreeWayMatchPanel`
  segue restrito ao comprador.
- **Aba Comunicação**: `OrderChat` passa a renderizar nos dois perfis; o cartão
  *"Conversa indisponível aqui"* sai. Histórico de notificações aparece para o
  fornecedor sem os campos técnicos.

Como sei que terminou: `grep -c '!portalToken' components/SupplyChainOrderDetails.tsx`
= 0 (todo gate virou `perfil`), e nenhuma das cinco abas fica em branco em nenhum
dos três contextos (comprador, fornecedor logado, fornecedor por token).

**8. `components/OrderChat.tsx`**

O que muda: props `portalToken?` e `perfil`; quando há token, ler/enviar pelas
RPCs em vez do `chatService` direto. O Realtime (`subscribeToOrder`) fica só no
comprador e no fornecedor logado — sessão anon não recebe evento de tabela com
RLS; no token, recarrega depois de enviar.

Como sei que terminou: fornecedor por token envia mensagem e ela aparece para o
comprador (e vice-versa, com refresh do lado do token).

**9. `components/SupplierDashboard.tsx`**

O que muda: passa `perfil="fornecedor"` ao `SupplyChainOrderDetails` — sempre, com
ou sem `portalToken`. É a linha que fecha o buraco de `AppRouter.tsx:374`/`:1073`.

Como sei que terminou: entrando como usuário `ProfileGroup.SUPPLIER`, o detalhe do
pedido não mostra formulário de edição, nem 3-Way Match, nem conta de
pagamento/centro de custo/plano de contas.

### Testes e travas

**10. `__tests__/pedidoAbasFornecedor.test.ts`** (novo)

O que muda: teste do recorte de perfil — dado `perfil: 'fornecedor'`, a lista de
blocos renderizáveis não contém formulário de edição, 3-Way Match nem dimensões
contábeis; dado `'comprador'`, contém. Trava para o gate não voltar a ser
`!portalToken`.

Como sei que terminou: o teste falha se alguém trocar `perfil` de volta por
`portalToken`.

**11. Verificações obrigatórias antes de publicar**

```bash
bash scripts/check-ui-standard.sh components/SupplyChainOrderDetails.tsx
bash scripts/check-ui-standard.sh components/OrderChat.tsx
bash scripts/check-ui-standard.sh components/SupplierDashboard.tsx
npx vitest run __tests__/segurancaMigrations.test.ts
npx vitest run __tests__/orgContextGuard.test.ts
npm run ci
```

REGRA #1: ler `docs/ui_ux_guia_unificado.md` inteiro **antes** de editar os `.tsx`
— há cartão, tabela, empty state e campo inline novo nesta frente.

---

## Estado

- [x] Frente criada — `C:\D\frentes\pedido-abas-portal-fornecedor`, branch
      `feat/pedido-abas-portal-fornecedor`, a partir de `origin/main` (`8b543e6`)
- [x] Verificação do defeito, com evidência no código e no banco (seção acima)
- [x] Plano escrito e decisões confirmadas com o usuário
- [ ] 1. Migration
- [ ] 2. Edge Function `supplier-portal-download`
- [ ] 3. `supplierPortalTokenService`
- [ ] 4. `chatService`
- [ ] 5. `discrepancyService`
- [ ] 6. `notificationLogService`
- [ ] 7. `SupplyChainOrderDetails`
- [ ] 8. `OrderChat`
- [ ] 9. `SupplierDashboard`
- [ ] 10. Teste do recorte de perfil
- [ ] 11. Verificações + publicação

---

## Verificação de ponta a ponta

Três contextos, as cinco abas em cada um:

1. **Comprador** (usuário da organização, Suprimentos › Pedidos): nada regride —
   formulário embutido, 3-Way Match, chat e log continuam onde estão. O chat, que
   hoje é morto, passa a gravar (`order_chats` sai de 0 linhas).
2. **Fornecedor logado** (`ProfileGroup.SUPPLIER`, sem token): vê Financeiro só
   com as condições comerciais, Recebimento com os comprovantes do pedido dele e
   Comunicação com chat funcionando. **Não** vê formulário de edição, 3-Way Match
   nem dimensão contábil. Tentar `PATCH` direto em `purchase_receipts` pela API
   volta negado pela RLS.
3. **Fornecedor por token** (link público, `accent='portal'`): as mesmas três
   abas com dado real; foto do comprovante abre; mensagem enviada chega ao
   comprador; resposta a divergência pendente é gravada.

Ponto de atenção: o pedido usado no teste precisa ter comprovante e notificação —
hoje o banco tem 4 comprovantes e 13 notificações, então dá para testar com dado
real em vez de forjar.
