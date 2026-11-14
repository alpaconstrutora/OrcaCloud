# Pedido Fast — Suprimentos › Pedidos de Compra


## Pedido original (sessão de 14/11/2026, transcrito literalmente)

> suprimentos > Pedidos de Compra: implementar uma nova maneira de fazer um pedido chamado pedido fast (obs: manter a forma atual, o pedido fast é mais uma meneira de fazer pedido).
> 1. justificativa: para agilizar os pedidos urgentes onde o comprador vai a uma loja de materias de construcao por exemplo e compra algo e nao pode esperar o processo completo.
> 2. Funcionalidade: o comprador de foi a loja, retira e recebe Nota fiscal ou um recibo para faturamente posterior, abre um pedido tira uma foto do recibo, seleciona a obra do pedido e pronto. apenas dois passos do comprador.
> 3. app lê a foto e cria os itens do pedido e envia mensagem que novo pedido foi gerado e registra qual usuario efetuou a compra
> 4. crie uma versao mobilie para o usuário.

**Decisões do usuário (14/11/2026, perguntas do plan mode):**
- Mobile: **app logado + aba no link `/celular?token=`**. O link entra como Parte 2.
- Nasce **FOB "Retirado" (status `Entregue`), sem título**. O gestor confere e clica em Receber. O título sai pelo botão "Gerar título a pagar" que já existe, ou quando a NF for vinculada.
- O aviso "novo Pedido Fast" vai para **donos e admins da org** da obra.
- CNPJ que não está em Fornecedores: **o app cadastra sozinho** com o CNPJ e o nome lidos.

## Contexto

Hoje o pedido percorre Rascunho → Enviado → Confirmado → Entregue → Recebido, e o formulário exige fornecedor, obra, itens e data. Na compra de balcão urgente, o material já saiu da loja: o processo existe só para registrar uma compra que já aconteceu. O Pedido Fast registra essa compra em dois gestos do comprador: **foto** e **obra**. A IA lê os itens, e o pedido entra no fluxo normal já como retirado, para o gestor conferir. O jeito atual de fazer pedido continua igual.

## O que já existe e será reusado (lido de `origin/main`)

- Criação: `orderService.createOrder` (`services/orderService.ts`). Os itens ficam em `purchase_orders.items` (JSONB). O número sai de `generateOrderNumber` → `services/documentNumbering` (resolvers em TS + RPC `fn_next_document_seq`). Lança `MissingCodeError` quando falta código.
- FOB: `utils/formaEntrega.ts` (`FORMA_ENTREGA_FOB`, `ehFob`). Usa `retirado_por_employee_id` e `actual_delivery_date`.
- Anexos: bucket `purchase-order-documents` e tabela `purchase_order_documents`. A categoria aceita `NOTA_FISCAL` e `RECIBO`, e o lado `COMPRADOR`.
- Título sem nota: `financialService.syncOrderToFinance(id, { permitirSemNota })`. Não muda.
- Leitura por IA: o molde é `supabase/functions/read-matricula` (imagem base64 + `output_config.format` json_schema + `confidence`). O SDK em Deno segue `supabase/functions/doc-gen-ia` (`npm:@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`). O formato dos itens segue `ExtractedContract` do `fiscal-nfe-processor`.
- Fornecedor: RPC `find_supplier_in_org_by_document` (via `boletoService.fornecedorPorDocumento`). Para criar fornecedor, o molde é o `autoCreateSupplier` de `nfeService.createOrderFromNfe`.
- Edge Function que importa `services/`: precedente em `_shared/asaasProcessar.ts`, que importa `criarMotor` de `services/processMotor.ts`. O motor recebe o client por parâmetro.
- Foto: `utils/comprimirFoto.ts` (2048 px, JPEG 0,82) e `<input capture="environment">` como em `DiaryMobileApp.tsx`.
- Mobile: o padrão é `useState(() => window.innerWidth < 768)`, como em `TasksModule.tsx`. Do link: `components/celular/CelularTokenGate.tsx` (lista `ABAS`), fontes `services/celular/*Fonte.ts` (`modo: 'logado' | 'link'`), `_mobile_link_resolver` e `_celular_cota`.
- Obras: no app logado, `useStore().projects` (só OBRA e sem projeto de sistema, REGRAS #2 e #3). Na Edge, `isObra` / `isSystemProject` de `utils/projectClassification.ts` e `utils/systemProjects.ts`.
- Notificação: tabela `notifications` (sem CHECK em `type`). O sino é `NotificationPanel`, e o link é resolvido por `utils/linkNotificacao.ts`.
- Banco (conferido em 14/11): `purchase_orders` **não tem** coluna de quem criou. `supplier_id` aceita NULL. `suppliers.type` é PF ou PJ.

## Desenho

**Uma regra, dois chamadores.** Uma Edge Function `pedido-fast` faz tudo no servidor e é a mesma para o app logado e para o link. A regra de montar o pedido fica num módulo puro, testado no Vitest e importado pela Edge.

Fluxo do comprador:
1. **Foto** (até 3 fotos, para nota comprida). A foto é comprimida e a Edge `ler` começa **na hora**. Ela sobe a foto para `purchase-order-documents/fast-tmp/<user>/<uuid>.jpg` e devolve a leitura.
2. **Obra.** O comprador escolhe enquanto a IA lê. A última obra usada vem pré-selecionada (localStorage, só conveniência). Ele toca **Enviar**. Se a leitura ainda não terminou, o botão mostra "Lendo a nota…" e envia quando ela acabar.
3. Aparece a tela de **resultado**: "Pedido PC-… criado · N itens · R$ … · Fornecedor …", a lista de itens e o botão "Fazer outro". Não há etapa de revisão obrigatória: a conferência é do gestor, no detalhe.

A ação `criar` da Edge:
1. Autoriza.
2. Confere a obra: tem de ser OBRA, não pode ser de sistema e tem de pertencer a uma org em que o usuário pode criar pedido.
3. Resolve o fornecedor: procura pelo CNPJ. Sem CNPJ, procura pelo nome exato normalizado na org. Se não achar, cria (PJ/PF pelo tamanho do documento, categoria 'Geral').
4. Gera o número com o mesmo motor de numeração.
5. Grava o pedido com:
   - `status 'Entregue'`, `delivery_method = FORMA_ENTREGA_FOB`
   - `actual_delivery_date` e `delivery_date` = data da nota (ou hoje)
   - `retirado_por_employee_id` = colaborador do comprador naquela org, se existir
   - `origem 'FAST'`, `criado_por` = comprador, `leitura_ia` = o JSON bruto
6. Move a foto para `${orderId}/…` e cria a linha em `purchase_order_documents` (NOTA_FISCAL ou RECIBO, conforme a IA classificar).
7. Notifica donos e admins da org, sem o próprio comprador.

**A compra nunca se perde.** Se a leitura falhar (foto ilegível ou recusa), o pedido é criado sem itens, com a observação "Itens a lançar — leitura da foto falhou" e a foto anexada. Se o fornecedor não for identificado, `supplier_id` fica NULL e a observação diz "Fornecedor a conferir: <nome lido>". Se faltar código para a numeração (`MissingCodeError`), a Edge devolve 422 com a mensagem, a tela mostra o motivo e a foto temporária fica guardada para tentar de novo.

**IA.** O modelo é `claude-opus-5-5` com `output_config: { effort: 'medium', format: json_schema }`. O schema tem:
- `tipo_documento`, `fornecedor { nome, cnpj_cpf }`, `data`
- `itens[] { descricao, unidade, quantidade, valor_unitario, valor_total, confidence }`
- `desconto`, `total`, `observacoes`

O prompt diz "não invente; ilegível = vazio". A chamada leva `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), para que uma recusa seja refeita em outro modelo. Antes de ler `content`, a Edge confere `stop_reason`. A imagem tem limite de cerca de 5 MB por foto (como `planta-ia`).

**Valor do item.** O valor lido é o valor cobrado pela loja. A regra de "valor efetivo" (`valorEfetivoDoItem`) é conferida na implementação, para preencher referência e cotado de modo que o efetivo seja o da nota. Cada item leva `avulso: true` e um código único `FAST-n`. Se a soma dos itens não bater com o total da nota, isso fica em `leitura_ia` e vira um alerta no detalhe.

## Parte 1 — App logado (desktop + celular). 11 de 12 (falta a prova real do `criar` com foto, item 5)

Frente: `bash scripts/nova-frente.sh pedido-fast` (REGRA #8).

1. **`docs/planos/2026-11-14-pedido-fast.md`**: cópia deste plano. *Pronto quando* o arquivo existir com o pedido literal.
2. **`supabase/migrations/aplicar_<maior do dia + 1>_pedido_fast.sql`** (prefixo conferido em todos os nomes, não só no `tail`):
   - `purchase_orders`: `origem text NULL CHECK (origem IN ('FAST'))`, `criado_por uuid DEFAULT auth.uid() REFERENCES auth.users ON DELETE SET NULL` e `leitura_ia jsonb`.
   - `fn_pode_criar_pedido_de(p_user, p_org)` DEFINER. Libera owner/admin/superadmin, ou membro com `permissions->>'canEditOrders'`. Espelha a ordem de `utils/modulosPermitidos.ts`, conferida no arquivo.
   - `REVOKE … FROM PUBLIC, anon, authenticated` e `GRANT` só para `service_role` (REGRA #7).
   - Aplicada com `db query -f`, nunca com `db push`.
   - *Pronto quando* `segurancaMigrations.test.ts` passar e um `SELECT` provar as colunas e a ACL da função.
3. **`services/documentNumbering/motor.ts`**: `criarNumeracao(client)`, que recebe o client como `criarMotor`. `index.ts` e `resolvers.ts`/`settingsService.ts` passam a usar o motor com o client do navegador, e nenhum chamador atual muda. *Pronto quando* a suíte de numeração atual passar sem alteração e o motor puder ser importado sem `lib/supabase`.
4. **`lib/pedidoFast.ts`** (puro):
   - o schema da leitura
   - `itensDaLeitura` (normaliza unidade, `FAST-n`, arredondamento)
   - `conferirTotal`
   - `montarPedidoFast(leitura, obra, comprador)`, que gera o payload do insert
   - `observacoesDoFast`
   - *Pronto quando* **`__tests__/pedidoFast.test.ts`** cobrir: leitura completa, sem CNPJ, leitura vazia ou falha, soma ≠ total e unidade fora do padrão.
5. **`supabase/functions/pedido-fast/index.ts`** + **`leitura.ts`** (prompt, schema, chamada ao Claude) + **`regras.ts`** (validação do corpo):
   - Ações `ler` e `criar`.
   - Gate no código: JWT de usuário via `auth.getUser`. A chave anon sozinha dá 401.
   - Usa `fn_pode_criar_pedido_de`, o motor de numeração e `lib/pedidoFast.ts`.
   - O path temporário tem de começar com `fast-tmp/<user>/`.
   - Limpeza best-effort de temporários do usuário com mais de 24 h.
   - *Pronto quando* tiver deploy feito, `curl` sem header der **401** e uma foto real de nota criar o pedido (ver Verificação).
6. **`services/pedidoFastService.ts`**: a fonte `{ modo, ler(fotos), criar({fotos, leitura, projectId}) }`. O modo logado vai via `functions.invoke` (corte de 150 s). Sem fallback silencioso: o erro chega à tela com o motivo. *Pronto quando* o fluxo da tela usar só essa fonte.
7. **`components/suprimentos/PedidoFastFluxo.tsx`**: os dois passos e o resultado, para celular e desktop.
   - Botão desligado diz o motivo.
   - Valores sem cinza-claro.
   - Toast vindo do padrão.
   - *Pronto quando* `check-ui-standard.sh` passar e a tela for vista de verdade em 390×844.
8. **`components/suprimentos/PedidoFastMobile.tsx`**: a casca do celular.
   - Botão grande "Novo Pedido Fast".
   - "Meus Pedidos Fast" recentes, filtrados por `criado_por` = eu e respeitando `useOrgContext().orgId`, com `null` = todas.
   - Link "Abrir lista completa".
   - *Pronto quando* abrir Pedidos no celular cair nela.
9. **`components/SupplyChainOrderList.tsx`**:
   - Botão **"Pedido Fast"** ao lado de "Novo pedido", que abre o `PedidoFastFluxo` num Sheet (REGRA #4).
   - Em tela < 768 px, renderiza `PedidoFastMobile`.
   - Marca "Fast" no número, conforme guia §8.
   - *Pronto quando* "Novo pedido" seguir idêntico e o Fast aparecer na lista.
10. **`components/SupplyChainOrderDetails.tsx`**:
    - Aviso "Pedido Fast · comprado por {nome} em {data} — itens lidos da foto; confira antes de Receber".
    - Alerta de soma ≠ total e de itens com `confidence` baixa.
    - Atalho para a foto em Documentos.
    - *Pronto quando* o detalhe de um Fast mostrar isso e um pedido normal não mostrar nada novo.
11. **`types/supplyChain.ts` + mapeadores de `orderService`**: `origem`, `criadoPor` (nome resolvido em lote) e `leituraIa`. *Pronto quando* tsc passar e a lista e o detalhe lerem os campos.
12. **`utils/linkNotificacao.ts`**: `pedido_fast_criado` abre o detalhe do pedido. *Pronto quando* clicar no sino abrir o pedido.

## Parte 2 — Aba "Pedido" no link `/celular?token=`. 4 de 5 (falta a prova no celular real)

Só começa depois da Parte 1 no ar.

1. **Migration `…_link_celular_pedido_fast.sql`**:
   - `celular_pedido_fast_autoriza(p_token)`: chama o resolvedor e `fn_pode_criar_pedido_de` e devolve user e org.
   - `celular_obras_listar(p_token)`: só OBRA, sem projetos de sistema (`SYSTEM_PROJECT_NAMES_SQL`), da org do token.
   - `_celular_cota(token, 'pedido_fast_ler', N)`, porque leitura por IA tem custo.
   - REVOKE/GRANT no molde das `celular_*`.
   - *Pronto quando* `scripts/teste-link-celular-pedido-fast.sql` provar a recusa sem permissão, de obra de outra org e de token revogado.
2. **`supabase/functions/pedido-fast`**: segundo modo de autorização, `p_token` no corpo com chave anon pura, como em `celular-diario-midia`. O resto é o MESMO código. *Pronto quando* o token válido criar o pedido com `criado_por` = dono do token e o token revogado der 403.
3. **`services/pedidoFastService.ts`**: `fonteDoLink(token, { aoRecusar })`, onde 42501 derruba o gate e 54000 vira "limite de uso". *Pronto quando* houver teste de fonte nos moldes de `diarioFonte`.
4. **`components/celular/CelularTokenGate.tsx`**: aba "Pedido" em `ABAS`, com a fonte em `useMemo([token])`. *Pronto quando* o link abrir as 3 abas e a aba Pedido usar o `PedidoFastFluxo`.
5. **`components/celular/PedidoFastDoLink.tsx`**: a casca no molde de `DiarioDoLink.tsx`. *Pronto quando* o usuário provar no celular real.

## Verificação

- Na frente: `npx tsc --noEmit` e `npx vitest run` (inclui `pedidoFast.test.ts`, `orgContextGuard.test.ts` e `segurancaMigrations.test.ts`).
- Scripts nos arquivos tocados: `check-ui-standard.sh` com o CHECKLIST relatado, `check-system-projects.sh`, `check-project-classification.sh` e `check-org-selector-guard.sh`.
- Edge: deploy, depois `curl -X POST …/functions/v1/pedido-fast -d '{}'` tem de dar **401**.
- Ponta a ponta: Playwright com viewport 390×844 no app logado, usando uma foto real de nota ou recibo (pedir uma ao usuário). No banco, conferir:
  - `origem='FAST'`, `status='Entregue'`, FOB e `criado_por`
  - os itens
  - a linha em `purchase_order_documents`
  - `notifications` para donos e admins
- Também conferir que "Novo pedido" segue intacto.
- Publicação: `git push origin HEAD:main` só depois de ler a suíte e o CI, em chamada separada. Depois, `scripts/publicar-producao.sh` e o merge feito por mim.

## Andamento

### 14/11/2026 — Parte 1 implementada na frente `pedido-fast`

| Item | Situação | Evidência |
|---|---|---|
| 1 plano em docs/planos | ✅ | este arquivo |
| 2 migration | ✅ APLICADA | `scripts/teste-pedido-fast.sql` → TUDO OK no banco real (e FALHA sem a migration); ACL das 4 funções = só postgres/service_role; `segurancaMigrations.test.ts` verde |
| 3 motor da numeração | ✅ | `services/documentNumbering/motor.ts`; 16 arquivos de teste que tocam a numeração verdes, sem alteração; a Edge importa o motor (deploy resolveu os imports) |
| 4 `lib/pedidoFast.ts` | ✅ | `__tests__/pedidoFast.test.ts` (15) |
| 5 Edge `pedido-fast` | ⏳ 2 de 3 | deploy feito; sem header → 401, só anon → 401, token (Parte 2) → 400; `ler` REAL pelo app logado → 200, foto + `leitura.json` em `fast-tmp/<user>/<lote>/`. **Falta:** `criar` real com foto (cria pedido de verdade — combinar com o usuário) |
| 6 `services/pedidoFastService.ts` | ✅ | a tela usa só a fonte |
| 7 `PedidoFastFluxo` | ✅ | `check-ui-standard` sem violação; vista em 390×844 e no Sheet 1600×1000 (Playwright, Edge interceptada): ler → "Criar" durante a leitura espera e cria sozinho → resultado |
| 8 `PedidoFastMobile` | ✅ | Pedidos no celular abre nele; "Meus Pedidos Fast" consulta sob RLS sem erro |
| 9 lista (botão + Sheet + "· Fast") | ✅ | botão ao lado de "Novo pedido" (que segue igual); marca no número só aparece com pedido Fast (nenhum ainda) |
| 10 aviso no detalhe | ✅ código / ⏳ visual | `AvisoPedidoFast`; ver na tela quando existir o 1º pedido Fast |
| 11 tipos + mapeadores | ✅ | tsc exit 0 |
| 12 link do sino | ✅ | `linkNotificacao.test.ts` (+1 caso) |

**Decisões tomadas na implementação (registradas aqui, não estavam no desenho):**
- **A leitura que vira pedido é a da Edge, não a do navegador.** `ler` guarda as fotos E o `leitura.json` num
  lote `fast-tmp/<usuário autorizado>/<lote>/`; `criar` recebe só `{ lote, projectId }`. O navegador nunca manda
  path nem itens — não dá para adulterar o que a IA leu. `criar` é idempotente pelo lote (`criado.json`).
- **`fn_next_document_seq_de(p_user, …)`**: a `fn_next_document_seq` confere `auth.uid()`, que não existe na Edge.
  Gêmeo com o usuário explícito, só service_role (mesmo molde dos `is_*_de` do link do celular).
- **Quem pode fazer Pedido Fast = quem vê o módulo Compras** (`fn_pode_criar_pedido_de` espelha
  `checkModule('compras','canViewOrders')`). Achado: `canEditOrders` está declarado em `UserPermissions` mas
  NADA o aplica — o "Novo pedido" de hoje exige só ser membro. O Fast não ficou mais restrito que o formulário.
- **Comprador congelado em `leitura_ia.comprador`** (id + nome), como o carimbo do Diário: o detalhe mostra
  "comprado por" sem ler o perfil de outra pessoa (a RLS de `profiles` pode barrar).
- **`criado_por` vale para TODO pedido novo** (DEFAULT `auth.uid()` + gatilho `trg_purchase_orders_autoria`, que
  impede forjar autor e torna `origem`/`criado_por`/`leitura_ia` imutáveis no UPDATE).
- Valor lido = par de referência (`unitPrice`/`total`), cotado vazio → valor efetivo = o da nota.

**Pendências / bloqueios:**
- ⚠️ **`ANTHROPIC_API_KEY` NÃO está nos segredos das Edge Functions** (conferido em 14/11/2026 — vale também para
  `doc-gen-ia` e `read-matricula`, que hoje respondem "IA não configurada"). Sem ela, o Pedido Fast funciona no
  modo "compra nunca se perde": cria o pedido com a foto e sem itens. Para ligar a leitura:
  `npx supabase secrets set ANTHROPIC_API_KEY=<chave>` (o usuário cadastra; a chave não passa pelo chat).
- Prova real do `criar` (item 5) e o print do aviso do detalhe (item 10) — dependem de criar um pedido de verdade.

### 14/11/2026 (tarde) — Parte 2 implementada na frente `pedido-fast-link`

**Pedido do usuário (mesma sessão):** *"como vejo o modulo pedido fast? ainda somente aparece tarefas e diario"* → expliquei que
o link `/celular` era a Parte 2 → *"sim"*.

| Item | Situação | Evidência |
|---|---|---|
| 1 migration `aplicar_20271114700000_link_celular_pedido_fast` | ✅ APLICADA | `scripts/teste-link-celular-pedido-fast.sql` → TUDO OK (falha sem a migration); `_celular_pedido_fast_autoriza` só service_role, `celular_obras_listar` anon/authenticated |
| 2 Edge: modo token | ✅ | deploy; sem header 401, token falso 403 "link inválido ou vencido", anon sem token 401; `respostaDoErroDoLink` testada |
| 3 `fontePedidoFastDoLink` + `listarObrasDoLink` | ✅ | `__tests__/pedidoFastFonte.test.ts` (5) |
| 4 aba "Pedido" no `CelularTokenGate` | ✅ | `CelularTokenGate.test.tsx` (3 abas); Playwright 390×844 sem login (RPCs e Edge interceptadas): aba → foto → obra → recusa do token derruba para "link inválido" |
| 5 `PedidoFastDoLink` | ⏳ | falta a prova no celular real com o link de verdade (usuário) |

**Achado na prova:** o contador de uso por link (`user_mobile_link_uso.acao`) tinha CHECK fechado em `subir`/`assinar` — a 1ª
leitura pelo link daria 23514. A migration amplia o CHECK com `pedido_fast_ler` (40/h) e `pedido_fast_criar` (30/h).
**Não gerei link real para testar:** gerar troca o link atual da pessoa (mesma linha de `user_mobile_links`).
