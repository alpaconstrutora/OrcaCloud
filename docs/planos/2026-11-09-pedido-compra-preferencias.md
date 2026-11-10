# Suprimentos › Pedidos de Compra — botão "Preferências" (padrões do pedido novo)

## Pedido original
> criar botão preferencias:
> 1. plano de contas
> 2. Centro de custo
> 3. Condição de pagamento
> 4. Forma de Entrega
> 5 .Forma de Pagamento
> 6. sigira o que mais pode fazer parte de preferencias para ser o padrão
>
> Sessão e7d28ecc · 2026-11-09

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 2026-11-09 | Valem para quem? | **Empresa + ajuste pessoal.** Gestor (owner/admin) define o padrão da organização; cada usuário pode sobrepor o seu. Ordem: pessoal > empresa > sistema. |
| 2026-11-09 | Onde fica o botão? | **Lista de Pedidos**, ao lado de "Novo pedido"; abre painel lateral. |
| 2026-11-09 | Extras sugeridos | **Conta de pagamento, Local de entrega, Prazo de entrega (dias), Observações padrão** (+ se vão visíveis ao fornecedor). |

## Contexto
O formulário (`components/SupplyChainOrderForm.tsx`) já tem todos os campos. Hoje um pedido
novo nasce com constantes no código (Boleto, À vista, 30 dias, CIF, "Canteiro de Obras") e com
plano de contas, centro de custo e conta vazios.

Reaproveita a tabela `public.preferencias` (escopos USUARIO/ORGANIZACAO, RLS pronta: membro lê o
da empresa, só owner/admin grava; cada um só lê e grava o seu). Ela só aceitava chaves `planta.%`
e valor de até 1 KB.

- Empresa: escopo ORGANIZACAO, `organization_id`, chave `suprimentos.pedido.padroes`.
- Pessoal: escopo USUARIO, `user_id`, chave `suprimentos.pedido.padroes.<orgId>` (o escopo
  USUARIO não tem coluna de organização — o CHECK obriga `organization_id` nulo).
- Valor: um objeto JSON só com os campos definidos; ausente = herda da camada de baixo.

A organização do pedido novo = a da obra escolhida (`projects.organization_id`, já vem na lista)
ou, sem obra, a do seletor do topo. Os padrões só preenchem **pedido novo** e **nunca sobrescrevem
o que o usuário mexeu** (regra geral de 10/10, molde `utils/warrantyAutofill.ts`).

## Plano — um item por arquivo
1. **`supabase/migrations/aplicar_<prefixo>_preferencias_suprimentos.sql`** — troca os dois CHECK:
   chave `planta.%` **ou** `suprimentos.%` (≤ 100); valor ≤ 1 KB, ou ≤ 4 KB para `suprimentos.%`
   (observação padrão). Sem função nova, sem policy nova.
   **Pronto quando:** aplicada; `pg_constraint` mostra os CHECK novos; `segurancaMigrations` e
   `migrationsPrefixo` verdes.
2. **`lib/pedidoPreferencias.ts`** (+ `__tests__/pedidoPreferencias.test.ts`) — tipo
   `PadroesDoPedido`, padrões do sistema, `sanearPadroes` (descarta chave/tipo inválido),
   `resolverPadroes(empresa, pessoal)` com a origem de cada campo, `camposAPreencher` (não toca
   campo mexido), `dataPrevistaDeEntrega` (data local), `FORMAS_PAGAMENTO_PEDIDO` (lista única,
   antes inline no formulário). **Pronto quando:** teste verde.
3. **`services/pedidoPreferenciasService.ts`** — `ler(orgId)` → `{ empresa, pessoal }`;
   `gravarEmpresa`/`gravarPessoal` (upsert; `null` apaga = volta a herdar).
   **Pronto quando:** typecheck verde + teste de escrita na tela.
4. **`components/suprimentos/PreferenciasPedidoSheet.tsx`** — `Sheet` com organização (em
   "Todas": escolher entre as graváveis), abas "Padrão da empresa" | "Meu padrão"; seções
   Classificação (drawers `PlanoContasSelect`/`CostCenterSelect`), Pagamento (condição, forma,
   conta), Entrega (forma, local, prazo em dias), Observações. Em "Meu padrão" vazio = segue a
   empresa (mostra o valor herdado). Empresa sem ser gestor: só leitura, com o motivo.
   **Pronto quando:** `check-ui-standard.sh` = 0.
5. **`components/SupplyChainOrderList.tsx`** — botão "Preferências" ao lado de "Novo pedido".
   **Pronto quando:** `check-ui-standard.sh` = 0.
6. **`components/SupplyChainOrderForm.tsx`** — pedido novo: ao saber a organização, lê e aplica os
   padrões nos campos não mexidos; aviso "Preenchido pelas preferências"; opções de forma de
   pagamento da lista única. **Pronto quando:** typecheck verde + teste na tela.

## Estado
- [x] 1. migration `aplicar_20271109600000_preferencias_suprimentos.sql` aplicada em 09/11 (`db query -f`);
  `pg_constraint` mostra os CHECK novos. Regras testadas com JWT simulado em transação desfeita
  (0 linhas `suprimentos.%` depois): gestor grava o da empresa; membro lê o da empresa e não o
  altera; membro grava o próprio (observação de 1.500 caracteres); não grava o de outro usuário;
  chave fora do catálogo e valor acima de 4 KB barrados.
- [x] 2. regras puras — 6 testes verdes
- [x] 3. serviço — typecheck verde
- [x] 4. painel — `check-ui-standard.sh` = 0; 3 testes de componente (membro só lê o da empresa
  com o motivo; "Meu padrão" mostra o herdado e grava só a camada pessoal; Salvar desligado diz
  "Nada mudou"); prévia com banco simulado: gestor, membro, "Meu padrão", celular 390 px
- [x] 5. botão na lista — `check-ui-standard.sh` = 0
- [x] 6. formulário — typecheck verde, `check-ui-standard.sh` = 0
- [ ] Teste do formulário na tela com login (pedido novo recebe o padrão; campo mexido não muda;
  troca de obra de outra organização) — não feito por mim: exige login com sessão real

## Correção — 2026-11-10
> algumas coisas funcionaram e outras, por exemplo foram de pagamento eu escolhi PIX e veio boleto, verifique todos

Reproduzido em produção (só leitura, sem salvar pedido) com o padrão da Alpa (Pix, FOB, conta
Asaas): toda obra da Alpa recebe os três; o formulário fica com Boleto/CIF, **sem dizer nada**, em
dois casos — topo em "Todas" antes de escolher a obra (ainda não se sabe a empresa) e obra de
empresa sem padrão (Garden Cambuhy → SPE). Achado junto: o endereço da obra sobrescrevia o local
de entrega das Preferências e o digitado à mão. Teste novo cobre os 12 campos.

7. **`components/SupplyChainOrderForm.tsx`** — o efeito só escreve o que veio de preferência
   gravada (escrever o do sistema disputava com o endereço da obra); campo preenchido por padrão
   que a empresa nova não define volta ao valor do sistema; endereço da obra só entra se o local
   não foi mexido nem veio do padrão; avisos "entram ao escolher a obra" (topo em "Todas") e "a
   empresa desta obra não tem padrão". **Pronto quando:**
   `__tests__/components/SupplyChainOrderFormPreferencias.test.tsx` verde e `check-ui-standard` = 0.
- [x] 7. 7 testes verdes (12 campos; local do padrão e digitado sobrevivem à obra; endereço entra sem
  padrão; escolha à mão não volta; "Todas"; empresa sem padrão avisa); typecheck e `check-ui-standard` = 0.

## Verificação
1. typecheck, testes novos, `check-ui-standard.sh` nos `.tsx` tocados, build.
2. Tela: gravar padrão da empresa e o pessoal; abrir "Novo pedido" e ver os campos preenchidos;
   trocar um campo à mão e trocar a obra — o campo mexido não muda; editar pedido existente não
   recebe padrão.
