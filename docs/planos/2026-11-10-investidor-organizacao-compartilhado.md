# Investidor: campo Organização + "Disponível em todas as organizações"

## Pedido original

> Minha organizacao > investidores: implemente campo para selecionar a organizacao desejada e com campo para disponibilizar para todas as organiazações.

Sessão: 9c7a0ed1-6a55-4dd1-861b-b7ffe2258d91 · 2026-11-10. Com o print do par
Organização + "Disponível em todas as organizações" do `SupplierForm` como
referência.

Junto, um aviso de outra sessão (a do Espelho de Vendas 3D, #315), resumido:

> O campo sozinho não faz a obra aparecer no portal do investidor. As funções do
> Portal do Investidor filtram a obra pela organização do investidor (ou do link)
> — `fn_obras_do_investidor`, `fn_espelho_de_vendas_das_obras`,
> `fn_investor_portal_get_summary`, `…_get_milestones`, `…_get_spes`. As duas
> primeiras foram reescritas quatro vezes; a definição vigente está em
> `aplicar_20271110600000_empreendimento_tower_vistas.sql` e os testes de texto em
> `__tests__/espelhoDoInvestidor.test.ts` travam as chaves do retorno. Abrir o
> filtro de organização no portal vale só para o investidor marcado, nunca para
> todos.

## O caso real

Um único investidor no banco: **Tiago**, dono = Alpa, vinculado
(`projects.investor_id`) a uma obra da **Construção do Edifício Garden Cambuhy
SPE**. O portal filtrava pela organização do link (Alpa) e não achava a obra. O
link dele está, além disso, **vencido** (90 dias).

## Desenho

O mesmo de `supplier_org_shares` (`aplicar_20270918000019`): `is_shared` é o que
a tela liga; `investor_org_shares` diz COM QUEM, preenchida por gatilho com as
organizações de quem marcou (menos condomínios). Diferenças deliberadas:

- desmarcar **apaga** os destinos, e toda leitura exige `is_shared` **e** destino;
- a tabela de destino não tem policy de escrita (só o gatilho grava).

O portal passa a procurar as obras em `fn_orgs_do_investidor(investidor)` = dona
+ destinos (só se marcado). A fronteira segue sendo o vínculo explícito do
investidor (obra, participação, sócio de SPE). `fn_obras_do_investidor` e
`fn_espelho_de_vendas_das_obras` **não** foram reescritas: os embrulhos as chamam
uma vez por organização.

Trocar a organização do investidor leva o link junto (gatilho atualiza
`investor_portal_tokens.org_id`).

## Itens

- [x] **Migration** `aplicar_20271110950000_investidor_compartilhado.sql` —
      coluna, tabela de destino, gatilho, policy de leitura, helper e as 5 funções
      do portal. *Pronto quando:* ensaio com ROLLBACK no banco mostra o portal do
      Tiago com 0 obras antes, 1 marcado com destino na SPE, 0 desmarcado — **feito
      em 10/11 (0 → 1 → 0, destino apagado)**.
- [x] **Migration aplicada no banco** — *pronto quando:* `investors.is_shared` e
      `investor_org_shares` existem e o gatilho `trg_investors_compartilhamento`
      aparece em `pg_trigger`. Tem de vir ANTES do front (a lista seleciona
      `is_shared`). **Aplicada em 10/11**: coluna, tabela (só `ios_select`),
      gatilho e `investors_select` com `is_shared` conferidos; funções do portal
      com anon+authenticated, `fn_orgs_do_investidor` e o gatilho sem grant.
- [x] **Serviço** — `listInvestors` traz `is_shared` + destinos; na organização do
      topo, mostra os dela e os compartilhados COM ela. *Pronto quando:*
      `__tests__/investidorCompartilhado.test.ts` verde.
- [x] **Formulário** (`InvestorModal`) — campo Organização (só orgs graváveis) e a
      marca; sem organização, mensagem no formulário em vez de `alert`.
- [x] **Lista** (`InvestorList`) — link gerado na organização DONA; coluna Obra
      Vinculada sem filtro de organização; subtítulo "Disponível em todas as
      organizações" quando marcado.
- [ ] **Conferido em produção** — marcar o Tiago, gerar link novo (o atual venceu)
      e ver a obra do Garden no portal.

## Fora do escopo (anotado)

- Comunicados, relatórios e oportunidades do portal seguem pela organização do
  link — são conteúdo da organização, não do vínculo do investidor.
- A policy `investors_update` ainda tem a perna `organization_id IS NULL` (0
  linhas nulas hoje).
