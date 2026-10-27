# Central de Clientes — robustez (`/impeccable harden`)

## Pedido original

> /impeccable audit: anallise e dados > Central de Clientes

Sessão `1880c008-dd77-4f94-9d0d-2c1d01ed5ec4` · 27/10/2026. A auditoria deu 10/20
(7 P1 · 5 P2 · 2 P3) e recomendou, em ordem: `harden` → `layout` → `adapt` → `polish`.

> 1. rodar uma por vez.
> 2. O projeto ainda não tem PRODUCT.md; posso rodar /impeccable init depois, se quiser. Sim quero.
> 3. Há também uma versão nova do Impeccable (v4.8.0); quer atualizar? quero atualizar

Mesma sessão, 27/10/2026. Este plano cobre só o **primeiro** comando (`harden`).
`layout`, `adapt`, `polish` e `init` vêm depois, um por vez.

## Decisões tomadas

| Data | Pergunta | Resposta |
|---|---|---|
| 27/10 | "— Sem obra" abre o extrato de todas as obras: corrigir na tela ou no banco? | No banco. A RPC trata `p_project_id = NULL` como "sem filtro" e não tem como pedir "obra vazia". Parâmetro novo `p_sem_dimensao`, que reaproveita a MESMA expressão de chave do `fn_opura_pivot`, então "— Sem X" no extrato = exatamente as linhas que o pivô agrupou ali. |
| 27/10 | Relatórios ÒPURA têm o mesmo defeito (`drillFilter` devolve `{ projectId: undefined }` para "— Sem …"). Corrigir junto? | Sim, só nas dimensões de coluna simples. É a mesma função de serviço, e o comentário dela (`null → '— Sem'`) já dizia a intenção. As dimensões de domínio (`venda_ativos`, `locacoes`, `locacoes_locatario`, `contratos_servico`) ficam como estão: o pivô delas recorta por domínio, e o extrato não. |

Medido no banco antes (27/10): dos 362 lançamentos com cliente, **361 não têm obra**.
"— Sem obra" é quase a única linha de "Por Obra", e o extrato dela trazia também o
lançamento que tem obra.

## Plano

1. **`supabase/migrations/aplicar_20271027810000_opura_extrato_sem_dimensao.sql`**
   - Muda: `fn_opura_entries` ganha `p_sem_dimensao TEXT DEFAULT NULL` (DROP + CREATE, porque a assinatura muda), validando o nome da dimensão (nome desconhecido = erro, nunca "sem filtro"). Permissões iguais às de hoje: `REVOKE … FROM PUBLIC, anon` e `GRANT … TO authenticated`.
   - Pronto quando: aplicada no banco; `proacl` sem PUBLIC/anon; a contagem com `p_sem_dimensao='project'` sobre os clientes dá 361 e a sem o parâmetro dá 362; `segurancaMigrations.test.ts` verde.
2. **`services/opuraAnalyticsService.ts`**
   - Muda: `OpuraEntryFilters.semDimensao`, enviado como `p_sem_dimensao`; `drillFilter(dim, null)` devolve `{ semDimensao: dim }` nas dimensões de coluna simples.
   - Pronto quando: `opuraAnalyticsDrill.test.ts` cobre as duas coisas e a RPC recebe 27 parâmetros.
3. **`components/CentralCliente.tsx` + `components/AppRouter.tsx`**: organização pela REGRA #5.
   - Muda: o componente lê `useOrgContext()` e deixa de receber `organizationId`; a rota deixa de passar `activeOrganizationId || ''`.
   - Pronto quando: `orgContextGuard.test.ts` verde, com o baseline do `AppRouter` baixado de 29 para 28.
4. **`components/CentralCliente.tsx`**: linhas "Por Obra" acessíveis pelo teclado.
   - Muda: `tabIndex`, Enter/Espaço abrem o extrato, anel de foco visível e nome acessível.
   - Pronto quando: no navegador, Tab chega à linha e Enter abre a gaveta.
5. **`components/CentralCliente.tsx`**: campos de data.
   - Muda: `aria-label` em cada um; rascunho local, e o período só muda (e só dispara as RPCs) com ano ≥ 1900.
   - Pronto quando: digitar o ano tecla a tecla não dispara carga intermediária.
6. **`components/CentralCliente.tsx`**: extrato.
   - Muda: "— Sem obra" filtra por `semDimensao`; o cabeçalho diz "Carregando…" enquanto carrega; com mais de 200, a lista diz "200 de N" e oferece "Carregar mais".
   - Pronto quando: a gaveta de "— Sem obra" mostra 361 (e não 362) com o recorte de todos os clientes no período inteiro.

## Estado

- [ ] 1 · migration — escrita e com `segurancaMigrations`/`migrationsPrefixo` verdes; **não aplicada**: o modo automático barrou `db query -f` no banco de produção (27/10), aguardando autorização do usuário. O front NÃO pode ir para `main` antes dela (a função atual não conhece `p_sem_dimensao` → 404 no extrato de todas as telas ÒPURA).
- [x] 2 · serviço — `opuraAnalyticsDrill.test.ts` 10/10 (27 parâmetros, "— Sem …")
- [x] 3 · organização — `orgContextGuard.test.ts` verde, baseline do `AppRouter` 29 → 28
- [ ] 4 · teclado — código pronto; falta conferir no navegador
- [ ] 5 · datas — código pronto; falta conferir no navegador
- [ ] 6 · extrato — código pronto; a conferência (361, não 362) depende do item 1

## Verificação

`check-ui-standard.sh` no arquivo; `tsc`; os testes `opuraAnalyticsDrill`, `orgContextGuard`
e `segurancaMigrations`; e a tela no navegador (Tab até a linha, Enter, gaveta de
"— Sem obra", digitação do ano).
