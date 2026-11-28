# Recebimento mobile — app logado no celular + aba "Receber" no link `/celular`

## Pedido original

Sessão de 2026-11-27 (Claude Code, VS Code):

> vamos implementar ao lado do pedido, uma versão mobile também do suprimentos > recebimento

Respostas do usuário às perguntas de escopo (mesma sessão):

| Pergunta | Resposta |
|---|---|
| Onde entra o Recebimento mobile (app logado, link `/celular`)? | **Os dois juntos agora** |
| O que a versão mobile faz? | **Conferir e receber; Registrar retirada (FOB); Anexar NF/recibo; Ver conferências e divergências** |
| Pedido CIF: receber só "Entregue" ou já "Em Trânsito"? | **Deixar receber "Em Trânsito"** |
| Recebimento parcial ("o resto vem depois")? | **Ligar o Parcial** |
| Nome da aba no link | **Receber** |

Regra fixa do usuário (27/11, `docs/planos/2026-11-27-diario-link-todas-orgs.md`): link por organização está
descartado; o escopo padrão é sempre "as orgs de que a pessoa é membro".

## Contexto

Pedido (27/11/2026): *"vamos implementar ao lado do pedido, uma versão mobile também do suprimentos > recebimento"*.

Hoje o Recebimento é só para computador. Tem uma lista (`components/SupplyChainReceiptManager.tsx`, view `supplies-receipts`) e a aba Recebimento do detalhe do pedido (`components/SupplyChainOrderDetails.tsx`). As duas usam o modal `components/OrderReceiptModal.tsx`. A gravação roda **no navegador** (`orderService.confirmOrderReceipt`, `services/orderService.ts:535-588`): recebimento, itens, divergências, status e versão do pedido. Depois vêm os efeitos de `updateOrder`: aviso ao fornecedor, parcelas a pagar (`financialService.syncOrderToFinance`) e processos.

O link `/celular` não tem login. Por isso a gravação precisa ir para o servidor, numa regra só que tanto o app logado quanto o link chamam, como já foi feito no Pedido Fast.

Decisões do usuário:
- **Escopo:** os dois juntos. No celular, Suprimentos › Recebimento abre a versão mobile; e o link ganha uma aba nova **"Receber"** ao lado de "Pedido".
- **Funções:**
  - conferir e receber (quantidade por item, problema, foto do comprovante, observação);
  - registrar retirada FOB;
  - anexar NF/recibo;
  - ver conferências e divergências, só leitura.
- **Escopo do link:** todas as orgs de que o dono do link é membro (regra fixa de 27/11). Nunca uma org de que ele não participa.
- **Regras novas, que valem também no computador** (uma regra só):
  - **CIF pode ser recebido já "Em Trânsito"** (antes, só "Entregue").
  - **Parcial ligado:** um item a menor pode ser marcado "o resto vem depois". O pedido continua a receber e aceita outra conferência com o saldo. Quantidade a menor sem essa marca continua virando divergência "faltando".

Achados que mudam o desenho:
- O recebimento atual não é atômico: grava o recebimento antes de conferir a versão do pedido.
- A foto nova nunca chega a `purchase_orders.receipt_photo_path`.
- O aviso ao fornecedor é `insert` em `notifications` + `notification_log`, com texto lido do localStorage. A Edge usará o texto padrão (`APP_SETTINGS_DEFAULTS`).
- Os processos já rodam no servidor (`services/processMotor.ts`, `criarMotor(db)`).
- **`syncOrderToFinance` é o único bloqueio**: depende de `projectService.loadProject/saveProject`, que regravam a obra inteira. No servidor isso poderia sobrescrever cronograma/WBS com uma cópia velha.
- `fn_purchase_order_documents_autor` só preenche o autor com `auth.uid()`. Com service_role, a Edge grava o autor à mão, como a `pedido-fast`.
- Org do pedido = `coalesce(po.organization_id, org da obra)`.
- `fn_pode_criar_pedido_de(user, org)` já exige ser membro.
- O CHECK de `user_mobile_link_uso.acao` aceita só 4 ações.

## Desenho: uma regra, dois chamadores

1. **Regra pura** em `lib/recebimento.ts`, sem imports ou só com imports `.ts`. A tela usa para a prévia e a Edge usa como verdade.
   - `podeReceber(status, ehFob)`:
     - FOB → `Entregue` ("Retirado");
     - CIF → `Em Trânsito` ou `Entregue`.
   - `saldoPorItem(itensDoPedido, recebimentosAnteriores)` = pedido − soma já recebida. A conferência abre preenchida com o saldo.
   - `montarLinhas(itensDoPedido, saldo, entrada)`: descrição, unidade e quantidade vêm do pedido no banco. Do celular chegam só, por índice, quantidade recebida, problema (`faltando`/`quebrado`), `restoDepois` e observação.
   - `statusDoRecebimento(linhas)`:
     - qualquer problema, ou falta sem `restoDepois` → `Divergência`;
     - falta só com `restoDepois` → `Parcial`;
     - senão → `Recebido`.
   - `statusDoPedidoApos(st)`: Parcial → `Entregue`; o resto fica igual.
   - `divergenciasDe(linhas)`: igual a `orderService.ts:555-568`, mas só para linhas sem `restoDepois`.
   - Também: `relatorioLegado`, `disparaDivergenciaDeItem` (regra de `receiptService.ts:97`) e `caminhoDoComprovante(orderId, receiptId)`.

2. **Gravação atômica em SQL** (`_recebimento_registrar_core`, `_pedido_retirada_core`; só service_role).
   - Trava o pedido (`FOR UPDATE`).
   - Confere **"já existe esse `receiptId`?" antes da versão**, para que reenviar não duplique.
   - Confere a versão (`coalesce(version,0)`, grava `+1`).
   - Grava recibo, itens, divergências e status numa transação.
   - CIF recebido em "Em Trânsito" grava também `actual_delivery_date = now()`.
   - O fornecedor não pode voltar o status de um pedido já Recebido/Divergência: conferir `purchase_order_update_as_supplier` e, se precisar, travar lá.

3. **Efeitos colaterais em TS com cliente injetado**, no molde de `processMotor` e `services/documentNumbering/motor.ts`.
   - `services/pedidoFinanceiroMotor.ts`: `criarFinanceiroDoPedido(db)` recebe o código de `syncOrderToFinance`, movido por script. O `financialService` passa só a delegar.
   - A obra deixa de ser regravada inteira. Uma primitiva SQL nova, `fn_obra_trocar_parcelas_do_pedido(p_project, p_order, p_novas)` (INVOKER), faz `jsonb_set` só em `financialInfo.transactions`.
   - A linha de `internal_transactions` passa a sair de uma função pura `linhaDoRazao(...)`, usada pelo motor e por `addTransaction`. Os outros 4 chamadores não mudam.
   - `services/pedidoStatusEfeitos.ts`: `criarEfeitosDoStatus({db, financeiro, processos, textos})` com os passos de `updateOrder` (`orderService.ts:398-473`).
     - O navegador injeta `financialService`, `processService` e os textos do `appSettingsService`, então os mocks de hoje continuam valendo.
     - A Edge injeta os motores e os textos padrão.
     - O WhatsApp de "Enviado" continua em `updateOrder`.

4. **Edge `supabase/functions/pedido-recebimento`**: `--no-verify-jwt` e `verify_jwt=false`, com o portão no código como na `pedido-fast`.
   - **Quem chama:** o JWT do usuário (`exigirUsuario`), ou o token do link no corpo (`_celular_recebimento_autoriza(token, ação)`: resolve, aplica a cota, exige `fn_pode_criar_pedido_em_alguma_de`).
   - **Em todo pedido:** `_recebimento_autoriza_de(user, order)` exige `fn_pode_criar_pedido_de(user, org do pedido)` e que o e-mail do usuário não seja o do fornecedor.
   - **Ações:**
     - `receber {orderId, receiptId, versao, itens[{indice, recebida, problema?, restoDepois?, obs?}], notas, comFoto}`;
     - `retirada {orderId, versao, data, employeeId}`, validada por `ehFob`/`situacaoDaRetirada` (`utils/formaEntrega.ts`), colaborador ATIVO da org ou compartilhado;
     - `comprovante_subir`: upload assinado no bucket `receipts`, path fixado pela Edge;
     - `documento_subir` / `documento_registrar`: bucket `purchase-order-documents`, `erroDoArquivoDocumento` de `lib/pedidoDocumentos.ts`, autor gravado à mão, `enviado_por_lado='COMPRADOR'`;
     - `assinar`: só paths citados no pedido.
   - **Respostas:** `{…, financeiro: ResultadoSyncPedido | {falhou}}`, para a tela dizer, por exemplo, "título não gerado: sem nota fiscal".
   - **Erros:** 42501→403, 22023→400, 54000→429, CONFLICT→409 ("Este pedido foi alterado por outra pessoa. Recarregue e tente de novo.").
   - **Reenvio:** se o recebimento já existia, refaz só o título e o processo (os dois não duplicam) e não reenvia o aviso.

5. **Leitura por RPC**: núcleos `_recebimento_listar_de(p_user, p_org)` e `_recebimento_abrir_de(p_user, p_order)`.
   - App logado: `recebimento_listar(p_org)` / `recebimento_abrir(p_order)`, com o seletor do topo (REGRA #5).
   - Link: `celular_recebimento_listar(p_token)` / `celular_recebimento_abrir(p_token, p_order)`, nas orgs do dono em que ele pode pedir.
   - **Grupos da lista:**
     - `a_conferir`: CIF em Em Trânsito/Entregue, FOB em Entregue;
     - `a_retirar`: FOB em Enviado/Confirmado/Separação/Em Trânsito;
     - `a_caminho`: CIF antes de Em Trânsito, só leitura;
     - `conferidos`: Recebido/Divergência dos últimos 30 dias.
   - Cada linha traz a org; limite de 200.
   - **"Abrir" traz:** cabeçalho, itens com saldo, versão, retirada (autorizados e quem retirou), colaboradores (só em FOB que ainda pode retirar), recebimentos com quem recebeu, divergências com a resposta do fornecedor e documentos.

6. **Quem recebeu:** `purchase_receipts.received_by uuid` + `origem ('APP'|'CELULAR')`. Um gatilho BEFORE INSERT força `received_by = auth.uid()` quando há sessão, para que o autor não seja forjável. O histórico mostra "Conferido por Fulano · pelo celular".

## Telas

- **Fonte** `services/recebimentoFonte.ts`: `FonteRecebimento { modo, listar, abrir, enviarComprovante, receber, registrarRetirada, enviarDocumento, urlDoArquivo }`.
  - **logada:** lê pelas RPCs `recebimento_*`, grava pela Edge com o JWT, documentos por `pedidoDocumentoService` e URLs pela RLS.
  - **do link:** usa `celular_recebimento_*` e a Edge com o token. A recusa do token derruba o gate, com o mesmo `chamar`/`MENSAGEM_LINK_RECUSADO` de `services/pedidoFastService.ts`.
  - Fotos por `utils/comprimirFoto` e `uploadToSignedUrl`.
- **Componentes compartilhados** em `components/suprimentos/recebimento/`:
  - `RecebimentoFluxo` (lista por grupo; org na linha quando há mais de uma);
  - `RecebimentoDetalhe`;
  - `ConferenciaForm`: um cartão por item; quantidade com o saldo; problema; checkbox "o resto vem depois"; foto com `capture="environment"`; prévia do status por `lib/recebimento`; confirmação com `useConfirm`;
  - `RetiradaForm`: colaborador por `CreatableCombobox` sem `onCreate`, autorizados primeiro, data;
  - `DocumentosMobile` (Nota fiscal, Recibo…);
  - `HistoricoConferencias` (só leitura).
- **App logado:** `RecebimentoMobile.tsx`, com "Abrir lista completa" e "Ver pedido completo". Em `SupplyChainReceiptManager.tsx`, `isMobile` (`innerWidth < 768`, lido uma vez), como em `SupplyChainOrderList.tsx:267,545`.
- **Link:** `components/celular/RecebimentoDoLink.tsx` (carregando/erro/sem-acesso/ok, molde do `PedidoFastDoLink`). Em `CelularTokenGate.tsx`:
  - `AbaId` + `'recebimento'`, rótulo **"Receber"**, ícone `PackageCheck`;
  - fonte em `useMemo([token, aoRecusar])`;
  - ramo novo no ternário do painel.
- **Desktop na mesma regra:**
  - `OrderReceiptModal` usa a fonte logada e `lib/recebimento` (saldo, "o resto vem depois", CIF em Em Trânsito);
  - o botão "Receber" do detalhe (`SupplyChainOrderDetails.tsx:1184`) e a ação da lista passam a usar `podeReceber`;
  - `handleRegistrarRetirada` (`:475`) usa `registrarRetirada`;
  - saem `confirmOrderReceipt`, `receiptService.createReceipt` e `discrepancyService.createFromReceiptItems`.
- **REGRA #1:** ler `docs/ui_ux_guia_unificado.md` inteiro e rodar `scripts/check-ui-standard.sh` em cada `.tsx` tocado (§13, §14, §15, §20.2.1, §8). **REGRA #5:** arquivo novo fora da catraca `orgContextGuard`.

## Migrations (aplicadas pelo usuário, da pasta da frente; prefixo conferido na hora)

| Arquivo | Conteúdo |
|---|---|
| `aplicar_20271127300000_obra_parcelas_do_pedido_atomico.sql` | `fn_obra_trocar_parcelas_do_pedido` |
| `aplicar_20271127300100_recebimento_quem_recebeu.sql` | `received_by`, `origem`, gatilho de autoria |
| `aplicar_20271127300200_recebimento_nucleo_escrita.sql` | `_pedido_org`, `_recebimento_autoriza_de`, `_recebimento_registrar_core`, `_pedido_retirada_core`, `_recebimento_paths_permitidos` |
| `aplicar_20271127300300_recebimento_leitura.sql` | núcleos de leitura + `recebimento_listar/abrir` |
| `aplicar_20271127300400_link_celular_recebimento.sql` | `_celular_recebimento_autoriza`, `celular_recebimento_listar/abrir`, CHECK de `user_mobile_link_uso` recriado (+ `recebimento_receber` 30/h, `recebimento_retirada` 30/h, `recebimento_subir` 120/h, `recebimento_assinar` 600/h) |

ACL (REGRA #7):
- `_*`: REVOKE de PUBLIC, anon e authenticated; GRANT a service_role.
- `recebimento_*`: GRANT a authenticated.
- `celular_recebimento_*`: GRANT a anon e authenticated.
- Toda função com REVOKE de PUBLIC na mesma migration.

## Fases (cada uma publicável sozinha; a ordem mantém compatibilidade)

0. Plano vivo `docs/planos/2026-11-27-recebimento-mobile.md`, com o pedido literal e as decisões (REGRA #6).
1. `lib/recebimento.ts`, `pedidoFinanceiroMotor`, `pedidoStatusEfeitos` e a migration 300000. O navegador passa a delegar ao motor sem mudar o que se vê. Migration primeiro, depois push.
2. Migrations 300100–300400 + provas SQL. Ninguém chama ainda.
3. Edge `pedido-recebimento` + testes das regras. O usuário publica e eu faço as sondas: sem header → 401, chave pública sem usuário → 401, token lixo → 403.
4. Celular no app logado: fonte logada, `RecebimentoFluxo`, `RecebimentoMobile` e a troca no Manager.
5. Aba "Receber" no link + `RecebimentoDoLink`.
6. Desktop na Edge (modal, botão Receber, retirada) com as regras novas; remoção do código morto. Opcional, com o ok do usuário: REVOKE do INSERT direto em `purchase_receipts` e filtro do topo no `SupplyChainReceiptManager` (dívida da REGRA #5).

## Verificação

- **Provas SQL** (`BEGIN … ROLLBACK`, fim `TUDO OK`), cada uma com contraprova sem a migration:
  - `scripts/teste-recebimento-nucleo.sql`:
    - quem não é membro, ou não tem Compras → 42501;
    - versão errada → CONFLICT;
    - mesmo `receiptId` → "já existia" sem duplicar;
    - Parcial: o pedido fica Entregue, a 2ª conferência usa o saldo e fecha Recebido;
    - CIF em Em Trânsito recebe e grava `actual_delivery_date`;
    - `received_by` não forjável;
    - colaborador de outra org → 42501;
    - sem EXECUTE para anon/authenticated nos núcleos.
  - `scripts/teste-link-celular-recebimento.sql`:
    - dono membro de A e B, não de C: lista A e B, abrir C → 42501;
    - cota → 54000;
    - CHECK aceita as ações novas;
    - token revogado → recusa.
  - `scripts/teste-obra-parcelas-atomico.sql`: só `financialInfo.transactions` muda.
- **Vitest:**
  - novos: `recebimento.test.ts` (incluindo paridade com o comportamento atual quando não há Parcial nem Em Trânsito), `pedidoFinanceiroMotor.test.ts`, `pedidoStatusEfeitos.test.ts`, `pedidoRecebimentoEdgeRegras.test.ts`, `recebimentoFonte.test.ts`, `components/RecebimentoFluxo.test.tsx`;
  - adaptados: `syncOrderToFinance.test.ts`, `processosGanchoOrgDoPedido.test.ts`, `processosEventosP2P.test.ts`, `CelularTokenGate.test.tsx:121` (`['Tarefas','Diário','Pedido','Receber']`);
  - sempre: `segurancaMigrations`, `orgContextGuard`; `tsc` 0.
- **Ponta a ponta**, no celular real ou a 375 px, pelo app logado e pelo link:
  - receber um pedido CIF Em Trânsito;
  - receber parcial e depois o resto;
  - registrar uma retirada FOB e conferir;
  - anexar NF.
  - No banco, conferir: `received_by`/`origem`, versão +1, `purchase_discrepancies`, `notifications` + `notification_log`, `internal_transactions` quando há nota, `process_instances`.
  - Desktop: o modal com as mesmas regras.
- **Publicação:** merge só com todos os jobs verdes, `conferir-producao.sh`, CI da `main`.

## Riscos

- Os efeitos de `updateOrder` valem para toda mudança de status. Por isso o código é movido por script, com os testes atuais verdes antes de seguir.
- A Edge importa a cadeia de `.ts` (inclui `import type` de `types/financial.ts`/`types/project.ts`); conferir no deploy.
- O aviso ao fornecedor que sai da Edge usa o texto padrão. Quem personalizou o texto no navegador vê o padrão quando o recebimento vem do celular.
- Efeitos colaterais continuam best-effort. A resposta informa o resultado do financeiro, e reenviar refaz sem duplicar.
- O recebimento CIF em "Em Trânsito" tira do fornecedor o passo "Entregue". O fornecedor não pode regredir o status (item 2 do desenho).

## Andamento

- 2026-11-27: plano aprovado pelo usuário (plan mode). Fase 0 escrita.
- 2026-11-27: **Fases 1 e 2 escritas.**
  - Fase 1: `lib/recebimento.ts` (regra pura: CIF já "Em Trânsito", Parcial com "o resto vem depois", saldo por item
    só das conferências Parciais, índice do item), `services/pedidoFinanceiroMotor.ts` (`syncOrderToFinance` movido,
    obra trocada só em `financialInfo.transactions` por `fn_obra_trocar_parcelas_do_pedido`), `services/pedidoStatusEfeitos.ts`
    (aviso/parcelas/processos de `updateOrder`, deps injetadas), migration 300000.
  - Fase 2: migrations 300100 (`received_by`, `origem` APP/LINK, `order_item_index`, gatilho de autoria), 300200
    (núcleos de escrita atômicos + **trava nova**: o fornecedor não muda o status de pedido conferido nem marca
    Recebido/Divergência — achado: antes podia, inclusive voltar um Recebido para "Em Trânsito"; e a RPC do
    fornecedor por token passa a subir a versão), 300300 (leitura), 300400 (link: autoriza, lista, abrir, CHECK).
  - Diferença de desenho: `origem` = 'APP' | 'LINK' (não 'CELULAR' — o app logado no celular também é 'APP').
  - Provas (ensaio no banco de produção, BEGIN…ROLLBACK): `teste-obra-parcelas-atomico`, `teste-recebimento-nucleo`,
    `teste-link-celular-recebimento` `TUDO OK`; contraprovas sem as migrations falham; `teste-link-celular-pedido-fast`
    e `teste-link-celular-diario` seguem `TUDO OK` com o CHECK novo.
  - Vitest: `recebimentoRegra` (31), `pedidoStatusEfeitos` (9), `syncOrderToFinance` adaptado; 33 arquivos/309 testes
    verdes; `tsc` 0.
  - Pendente: o usuário aplica as 5 migrations; provas em produção; merge.
- 2026-11-27: migrations 300000–300400 **aplicadas pelo usuário**. Conferido no banco: 14 funções novas, `received_by`/`origem`,
  gatilho de autoria, CHECK com as ações `recebimento_*`, trava do fornecedor. Provas em produção: `teste-obra-parcelas-atomico`,
  `teste-recebimento-nucleo`, `teste-link-celular-recebimento`, `teste-link-celular-pedido-fast` **TUDO OK**.
- 2026-11-27: **Fases 3–5 escritas** (PR separado, depois do #797):
  - Fase 3: Edge `supabase/functions/pedido-recebimento` (`index.ts` + `regras.ts`; `verify_jwt=false` no `config.toml`):
    portão = JWT (`exigirUsuario`) ou token (`_celular_recebimento_autoriza`), `_recebimento_autoriza_de` em todo pedido;
    `receber` (regra de lib/recebimento.ts → `_recebimento_registrar_core`; reenvio do mesmo id responde o gravado e só
    refaz parcelas), `retirada`, `comprovante_subir`, `documento_subir/registrar`, `assinar`. Efeitos pelos motores
    (`criarFinanceiroDoPedido`, `criarMotor`, `depsComBanco`, textos padrão). Cadeia de imports conferida por script:
    17 arquivos, todos `.ts`. Ajuste no motor de efeitos: `abrirProcessos: false` no reenvio.
  - Fase 4: `services/recebimentoFonte.ts` (uma implementação, modo logado/link), `components/suprimentos/recebimento/`
    (`RecebimentoFluxo`, `RecebimentoDetalhe`, `ConferenciaForm`, `RetiradaForm`, `RecebimentoMobile`);
    `SupplyChainReceiptManager` abre o mobile abaixo de 768 px (lista completa a um toque; não carrega a lista do
    computador enquanto está no mobile).
  - Fase 5: aba **Receber** no `CelularTokenGate` (`RecebimentoDoLink`; ícone some abaixo de 400 px com 4 abas).
  - REGRA #1: guia lido nas seções que governam a tela (§7.1.3, §8–§17, §20.2–§21, §23.1 "chrome de app mobile",
    §30, §32–§36 e os checklists); `check-ui-standard.sh` sem violação nos 8 `.tsx`; travas de rótulo, altura de campo,
    valor em cinza, animação, `dark:` e org verdes.
  - Testes: `pedidoRecebimentoEdgeRegras` (26), `recebimentoFonte` (11), `components/RecebimentoFluxo` (5), gate com a
    aba Receber; `tsc` 0.
  - Fase 6 (computador na mesma regra) ainda não: o computador segue pelo caminho antigo até lá.
- 2026-11-27: #797 (Fases 0–2) **no ar** (`d347774`, produção conferida, CI da `main` 18/18; 1ª rodada do PR caiu em
  `TelaDeAssinatura` › "PDF que não desenha", sem relação e 3/3 local — reexecutado verde). Edge `pedido-recebimento`
  **publicada pelo usuário** (pasta da frente). Sondas no bundle publicado: sem Authorization → 401; só anon → 401
  "Token inválido"; token de link inválido → 403 "link inválido ou vencido"; corpo inválido → 400.
- 2026-11-28: #799 (Fases 3–5) **no ar** (merge `a17a632`; produção conferida com "Conferir e receber" e "Nada para
  receber" no bundle; CI da `main` 18/18).
- 2026-11-28: **Fase 6** — respostas do usuário: "1. sim" (tirar o "Editar Checkout") e "2. sim" (lista do computador
  respeita o topo).
  - `OrderReceiptModal` = a MESMA `ConferenciaForm` (sem o cabeçalho de celular) + `recebimento_abrir` + Edge; botão
    Receber do detalhe e ação da lista por `podeReceber` (CIF já "Em Trânsito"); retirada do detalhe pela Edge.
  - Lista do computador recorta pela org do topo; "Editar Checkout" removido (criava 2ª conferência por cima).
  - Sem chamador e removidos: `orderService.confirmOrderReceipt`, `receiptService.createReceipt`,
    `discrepancyService.createFromReceiptItems` (+ tipos `CreateReceiptItemInput`/`CreateDiscrepancyInput`).
  - ⚠️ `purchase_receipt.divergence` (4 modelos de processo): nada dispara — com a regra única falta/problema de item
    vira Divergência do pedido (`purchase_order.divergence`) e o parcial não é divergência. Antes também não disparava
    na prática (o "Parcial" do modal antigo era inalcançável).
  - Testes: `components/ReceiptManagerRegraUnica` (novo), `SuprimentosAgrupar` (pedidos com a org do topo),
    `processosEventosP2P` (bloco do createReceipt removido); `tsc` 0; `check-ui-standard.sh` limpo nos 4 `.tsx`.
  - Não feito (opcional do plano, sem pedido): REVOKE do INSERT direto em `purchase_receipts` para authenticated.
