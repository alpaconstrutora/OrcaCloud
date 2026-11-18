# Segurança: a alçada de aprovação passa a valer no servidor (F14, F59)

## Pedido original

> Resolver todos

Sessão `ef9d394e-216b-4a82-8e74-8476ec75f63b`, 18/11/2026 — é o PR **G** do plano
`docs/planos/2026-11-18-seguranca-fase2-achados-restantes.md` ("Alçada no servidor", prefixo
`202711189150xx`). Notas da varredura (fora do git):
`C:\D\frentes\security-scan\CLAUDE-SECURITY-20261115-005039\patches\F14.md` e `F59.md`.

Decisão do usuário registrada no plano-pai (18/11/2026), à pergunta *"F14/F59: título já
aprovado cujo valor sobe para faixa de alçada maior volta para aprovação?"*:

> **Sim, volta.**

Brief da frente (18/11): "quando o valor de um título JÁ APROVADO sobe para uma faixa de alçada
maior (inclusive por sincronização ou ajuste de conciliação), ele volta para aprovação."

Respostas do usuário às dúvidas do relatório (18/11/2026, repassadas pelo coordenador; trecho
literal da mensagem):

> 1. Trocar o favorecido de título a pagar JÁ APROVADO (supplier_id, employee_id, party_id ou
> party_name — o que for "favorecido" no modelo) → volta para aprovação (PENDENTE, cadeia
> zerada, níveis da faixa do valor), mesmo sem mudar o valor. Vale para qualquer escritor que
> não seja caminho de servidor autorizado; avalie com cuidado correções legítimas de cadastro
> (ex.: preencher supplier_id num título que só tinha party_name do mesmo fornecedor — se der
> para distinguir com segurança "mesmo favorecido", não reabra; se não der, reabra).
> 2. mover_contrato_organizacao: os títulos aprovados que vão junto voltam para aprovação na org
> de destino (hoje a função é DEFINER e passa pela trava — ajuste a função ou a trava; parta da
> definição atual de produção).
> 3. Portão do Asaas (asaas-payment: bloqueiosDoDisparo/avaliarDisparo): bloquear título a
> pagar em RASCUNHO que não esteja nas exceções reais (as mesmas de fn_titulo_nasce_na_alcada:
> DARF, RETIDO, ASAAS_FEE, CONTRA, condomínio) — inclusive quando o membro marcou
> business_status para torná-lo isento: confira se "isento" pode ser forjado pelo membro e
> feche no portão (ex.: o portão recalcula a isenção pelo que não é editável, ou exige que a
> marca venha de caminho de servidor). Testes unitários do portão.
> 4. Os 46 títulos: decisão = SÓ LISTAR para revisão (eu gero a lista; não mude nada neles).
>
> Complemento ao item 4: deixe a consulta de LEITURA exata que os encontra em
> scripts/alcada-titulos-aprovados-abaixo-da-faixa.sql (comentada, numa linha executável por
> `db query`), rode-a só como leitura e grave o resultado em _rascunho/titulos-46.csv (fora do
> git).

Contrato/pedido que sobe de faixa e o valor da etapa de processo não entraram nas respostas:
ficam como estão (ver "Fora deste PR").

## O problema

`approval_status` só era decidido no navegador. `approvalService.approve` calculava sozinho se a
alçada fechou e gravava `APROVADO`; `submit` gravava `APROVADO` direto quando nenhuma faixa
cobria o valor. A única trava no banco (`trg_zz_alcada_trava_passo`, 11/11) dispara em
`UPDATE OF approval_chain`, só quando a cadeia cresce, e confere só o último passo. A RLS de
`internal_transactions` é de membro (`FOR ALL`). Então qualquer membro:

- fazia `PATCH {approval_status: 'APROVADO'}` sem tocar a cadeia (a trava nem disparava);
- inseria título já `APROVADO` (`fn_titulo_nasce_na_alcada` respeita o que vem diferente de
  `RASCUNHO`);
- gravava dois passos de uma vez (só o último era conferido) ou rebaixava os níveis exigidos;
- baixava o valor, aprovava na faixa menor e devolvia o valor (a aprovação ficava).

E o portão do Asaas (`bloqueiosDoDisparo`, F59) confia em `approval_status`.

## Desenho

1. **Decidir é no servidor.** Três RPCs `SECURITY INVOKER` (a RLS de cada tabela continua
   valendo): `fn_alcada_enviar`, `fn_alcada_aprovar`, `fn_alcada_rejeitar`. Elas leem a linha
   com `FOR UPDATE`, calculam no servidor o valor do item, a faixa, o nível da vez e se a
   pessoa logada pode aprová-lo, gravam o passo em nome do e-mail do JWT e decidem
   `APROVADO`/`PENDENTE`. O "abaixo do piso libera" (`semFaixa: 'liberar'`) também é delas.
2. **Escrita direta não aprova.** Gatilho `trg_alcada_guarda` (BEFORE INSERT/UPDATE, primeiro
   da fila nas 8 tabelas com `approval_chain`). Vale para quem escreve pela API
   (`authenticated`/`anon`) fora das funções do servidor: recusa item novo já aprovado ou com
   passos, `→ APROVADO`, passo novo ou alterado na cadeia, nível rebaixado no meio da
   aprovação, e troca de organização de item aprovado (no título, volta para aprovação; nos
   outros, recusa). Rebaixar continua livre (voltar a rascunho, rejeitar sem passo, reenviar).
3. **Caminhos do servidor.** Função `SECURITY DEFINER` (o dono escreve) e `service_role`
   passam. Função `SECURITY INVOKER` que grava aprovação de propósito liga
   `orcacloud.alcada_servidor` — as três RPCs acima (só na gravação da aprovação), e por
   `ALTER FUNCTION … SET` as seis que já existiam: `fn_darf_criar`, `fn_darf_editar`,
   `fn_darf_enviar_aprovacao`, `fn_darf_aprovar`, `fn_darf_rejeitar` e `fn_reconcile_group`
   (o saldo do desmembramento é clone do título, aprovação junto). O cliente não consegue ligar
   esse parâmetro: o PostgREST não executa `SET`, e nenhuma função exposta chama
   `set_config` com nome vindo de fora (conferido em 18/11).
4. **Valor subiu de faixa → volta para aprovação** (decisão do usuário). Título a pagar
   `APROVADO` (ou `PENDENTE` com passo) cujo valor passa para faixa de piso maior — por
   qualquer escritor: tela, sincronização, ajuste de conciliação — volta a `PENDENTE`, cadeia
   zerada, níveis da faixa nova; pago (`CONCILIATED`) fica marcado `pago_sem_alcada_em`.
   Mesmas exceções de `fn_titulo_nasce_na_alcada` (DARF, RETIDO, ASAAS_FEE, CONTRA,
   condomínio). Desce ou fica na faixa = mantém.
5. **Memória de aprovação só com o mesmo favorecido.** `titulo_aprovacao_memoria` guarda
   `supplier_id`, `employee_id`, `party_id` e `party_name`; o título recriado pelo sync só volta
   `APROVADO` se o favorecido for o mesmo.
6. **Processo não troca de organização com aprovação dada.** `trg_alcada_guarda_processo` em
   `process_instances` recusa mudar a organização (pela API) quando alguma etapa está aprovada
   ou com passo; a etapa também não troca de processo nesse estado.
7. **Favorecido trocado → volta para aprovação** (resposta 1). Título a pagar aprovado (ou com
   passo), em aberto, quando quem escreve pela API muda `supplier_id`, `employee_id` ou
   `party_id`; sem nenhum desses ids, quando muda `party_name` (ignorando maiúsculas/espaços).
   Com o id igual, mudar só o nome mantém (é renomear o mesmo cadastro — a propagação de nome
   de cliente/fornecedor faz isso). **Preencher o id num título que só tinha o nome REABRE**:
   não dá para provar que é o mesmo favorecido — o título não guarda CPF/CNPJ, nomes não são
   únicos (qualquer membro cria um fornecedor com o mesmo nome e outra chave PIX) e o cadastro
   escolhido é de onde o PIX tira a chave. Caminho do servidor não reabre.
8. **Mudou de organização → volta para aprovação, qualquer escritor** (resposta 2). Fica na
   trava, sem reescrever `mover_contrato_organizacao`: o `UPDATE … organization_id` dela passa
   pelo gatilho e os títulos aprovados EM ABERTO chegam PENDENTES na organização de destino,
   com os níveis da faixa de lá. Título já pago mantém (não sai mais pela alçada). Título a
   pagar não entra em organização de condomínio pela API (lá não há alçada).
9. **Portão do Asaas** (resposta 3). Conferido: RETIDO, ASAAS_FEE, CONTRA e origem DARF são
   campos que o membro edita (RLS de membro em `internal_transactions`) — marcar o título como
   "retido" tirava-o da fila e o portão pagava abaixo do piso. `darf_id` não (só as RPCs do
   DARF). E o condomínio também era forjável: `fn_org_e_condominio` só olhava
   `empreendimentos.condominio_org_id`, que qualquer membro da organização dona do
   empreendimento edita — apontando para a própria empresa, ela inteira saía da alçada. Fechado
   assim:
   - `fn_org_e_condominio` exige organização do tipo `CONDOMINIO` (o usuário não muda o tipo
     depois de criada — `trg_org_preserva_tipo`) ligada a empreendimento de OUTRA organização.
     Os 2 condomínios de produção cumprem.
   - O portão só deixa sair título `APROVADO`, ou `RASCUNHO` em condomínio de verdade,
     recalculado no servidor (`fn_org_e_condominio`, service_role; erro = fecha). As isenções
     da fila (RETIDO, ASAAS_FEE, CONTRA, DARF) **não liberam pagamento**: título retido, tarifa e
     contrapartida não se pagam pela Asaas; tributo agrupado sai quando o DARF é aprovado. Em
     18/11 todo pagamento tentado pela Asaas foi de título APROVADO (14 de 14 registros).
10. **Os 46 títulos** (resposta 4): só a lista, nada muda neles.
    `scripts/alcada-titulos-aprovados-abaixo-da-faixa.sql` (só leitura).

## Plano

Um item por arquivo. **O que muda** · **como sei que terminou**.

1. `supabase/migrations/aplicar_20271118915000_alcada_rpcs.sql`. **Muda**: helpers
   (`fn_alcada_tabela`, `fn_alcada_contexto`, `fn_alcada_faixa`, `fn_alcada_aplicar_extra`) e as
   três RPCs. Só acrescenta: o front antigo segue funcionando. **Pronto quando**: aplicada
   ANTES do merge; `segurancaMigrations`/`migrationsPrefixo` verdes; a prova local passa.
2. `supabase/migrations/aplicar_20271118915100_alcada_trava_servidor.sql`. **Muda**: gatilhos
   `trg_alcada_guarda` (8 tabelas) e `trg_alcada_guarda_processo`; `ALTER FUNCTION … SET` nas
   seis funções; memória com favorecido. **Pronto quando**: aplicada DEPOIS que o front novo
   está no ar; a prova (item 6) dá `TUDO OK` em produção.
3. `services/approvalService.ts`. **Muda**: `submit`/`approve`/`reject` chamam as RPCs.
   **Pronto quando**: `__tests__/approvalServiceRpc.test.ts` verde.
4. `services/financialApprovalService.ts`. **Muda**: `reenviar` usa `fn_alcada_enviar` com
   `p_reenvio`. **Pronto quando**: `__tests__/financialApprovalReenviar.test.ts` verde.
5. `services/contractService.ts`. **Muda**: `duplicateContract` não copia a aprovação (a cópia
   é rascunho novo; inserir aprovado passa a ser recusado). **Pronto quando**: teste verde.
6. `scripts/teste-alcada-no-servidor.sql`. **Muda**: prova `BEGIN … ROLLBACK` com os ataques
   (PATCH, INSERT aprovado, passo forjado, nível rebaixado, ida e volta de valor e de
   organização, memória com outro favorecido) e os caminhos legítimos. **Pronto quando**: roda
   num PostgreSQL local com o esquema copiado de produção e termina em `TUDO OK`.
7. Respostas 1–3 na migration 2 (`fn_alcada_guarda`, `fn_org_e_condominio`) + prova SQL.
   **Pronto quando**: a prova cobre favorecido (nome, id preenchido, id trocado, renomear o
   mesmo cadastro, servidor), mover pelo servidor (aberto e pago), condomínio forjado e título
   levado para condomínio, e dá `TUDO OK`; com o `fn_org_e_condominio` antigo, falha.
8. `utils/asaasGovernanca.ts` + `supabase/functions/_shared/asaasDisparo.ts` (resposta 3).
   **Muda**: RASCUNHO só passa em condomínio de verdade, recalculado no servidor.
   **Pronto quando**: `__tests__/asaasGovernanca.test.ts` e `__tests__/asaasDisparoAlcada.test.ts`
   verdes; **publicado** com `npx supabase functions deploy asaas-payment` (pelo usuário).
9. `scripts/alcada-titulos-aprovados-abaixo-da-faixa.sql` (resposta 4). **Muda**: consulta de
   leitura dos títulos aprovados abaixo da faixa atual. **Pronto quando**: roda com `db query`
   (resultado de 18/11: 46 linhas, gravado fora do git).

## Estado

18/11/2026, branch `feat/seguranca-alcada-servidor` (PR em rascunho):

- [x] 1 migration das RPCs — escrita; **não aplicada** (aplicar ANTES do merge).
- [x] 2 migration da trava — escrita; **não aplicada** (aplicar DEPOIS do front no ar).
- [x] 3 approvalService — `__tests__/approvalServiceRpc.test.ts` (7) verde.
- [x] 4 reenviar — `__tests__/financialApprovalReenviar.test.ts` (2) verde.
- [x] 5 duplicateContract — `__tests__/contractDuplicarSemAprovacao.test.ts` verde.
- [x] 6 prova SQL — num PostgreSQL 16 descartável (PGlite) com o pedaço do esquema de
  produção que a alçada usa (21 tabelas, colunas/CHECK/policies/gatilhos/funções e ACL lidos
  de produção em 18/11): sem as migrations falha no 1º caso (RED); com elas, `TUDO OK`; aplicar
  as duas migrations duas vezes e rodar a prova depois também dá `TUDO OK` (idempotentes).
  **Falta rodar em produção** (ensaio com `montar-ensaio.sh`, pelo usuário).
- [x] 7 respostas 1–3 no banco — prova local `TUDO OK` (RED sem migrations; mutação com o
  `fn_org_e_condominio` antigo falha em "nem por isso a empresa vira condomínio").
- [x] 8 portão do Asaas — testes verdes; **falta publicar** a `asaas-payment`.
- [x] 9 lista dos 46 — `scripts/alcada-titulos-aprovados-abaixo-da-faixa.sql`, 46 linhas em
  18/11 (Alpa Construtora 45 / R$ 996.600,91; Garden 1 / R$ 105.000,00).

Os testes que rodam o `approvalService` real sobre banco falso
(`processServiceModeloAlcada`, `processosEventosFinanceiro`) passaram a usar
`__tests__/fixtures/alcadaRpcFake.ts`, que imita as três RPCs.

### Fora deste PR

- Contrato e pedido: valor que sobe de faixa depois de aprovado mantém a aprovação (a decisão
  do usuário foi sobre título; contrato/pedido não liberam pagamento — o título que nasce deles
  passa pela alçada).
- Etapa de processo: o valor da etapa é digitado/gravado pela tela; abaixo do piso libera.
- A prévia de "Mover contrato de organização" não avisa que os títulos aprovados voltam para
  aprovação no destino (a trava faz; a tela não conta antes).
- 561 dos 733 títulos abertos aprovados não têm `supplier_id`/`employee_id`/`party_id` (só o
  nome). Vincular o cadastro a um deles agora o reabre (decisão 1: não dá para provar que é o
  mesmo favorecido).
- Os 46 títulos abaixo da faixa atual: só a lista (decisão 4).

## Verificação

- Prova: `scripts/teste-alcada-no-servidor.sql` (ensaio com `scripts/montar-ensaio.sh` antes de
  aplicar; depois, direto). Termina em `TUDO OK`.
- De fora, depois da migration 2: `PATCH /rest/v1/internal_transactions?id=eq.<título pendente>`
  com `{"approval_status":"APROVADO"}` e o token de um membro → `403`/`42501`
  `ALCADA_NAO_PERMITE`.
- Tela: aprovar e rejeitar em Financeiro › Aprovações, DARF em Tributos a Pagar, etapa de
  Processos, ofício, SC e risco; reenviar título bloqueado.
