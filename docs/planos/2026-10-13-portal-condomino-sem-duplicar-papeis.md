# Portal do Condômino — não duplicar pessoa com dois papéis na mesma unidade

## Pedido original
Sessão a2507f9f, 13/10/2026 ~12:49 (com print da tela de acessos do condomínio 007 - Bella Vista):

> portais > portal do condomínio:
> 1. veja print. no caso em que o proprietário e o Responsável financeiro for a mesma pessoa, nao precisa vir duplicado

## Contexto
Em Portais › Portal do Condômino › Acessos ao portal, cada linha era uma **ocupação**
(`unit_occupancies`: unidade + pessoa + papel). Quem é Proprietário **e** Responsável
financeiro da mesma unidade tem duas ocupações e aparecia em duas linhas idênticas, com
o mesmo acesso e a mesma ação, e contava dobrado nos KPIs.

O acesso ao portal é **da pessoa** (`client_id`), então a segunda linha não dizia nada.
A correção é só de apresentação, nesta tela. Em Comercial › Condomínios › Ocupações as
ocupações continuam separadas, porque lá cada papel é um registro que se edita e encerra
sozinho.

Medido no banco em 13/10: 33 ocupações vigentes, 19 pares pessoa×unidade. O mesmo
acontece com Inquilino + Responsável financeiro (Reginaldo, Murilo), e o agrupamento
cobre esses casos também.

## Itens

### 1. `utils/acessoAoCondominio.ts`: `agruparPapeisPorPessoa` ✅
- Agrupa por `unit_id + client_id` e devolve uma linha por par, com os papéis sem
  repetição e em ordem fixa (Proprietário → Inquilino → Morador → Responsável
  financeiro; papel desconhecido vai para o fim).
- **Pronto quando:** o teste do item 3 passa.

### 2. `components/condominio/PortalCondominoAdmin.tsx` ✅
- `carregar()` monta as linhas pelo agrupamento: `key = unit_id:client_id`, Papel =
  papéis unidos por `" · "`.
- `mapearPorCliente` recebe client_ids únicos.
- KPI "OCUPAÇÕES VIGENTES" → **"PESSOAS VINCULADAS"**, porque o número passou a contar
  pessoa×unidade e não ocupação.
- **Pronto quando:** no 007 - Bella Vista, Torre Única · 11 (MARCOS JULIANO FORSTER)
  aparece numa linha só com "Proprietário · Responsável financeiro" e os KPIs somam o
  número de linhas.
  - Verificado em 13/10 com o app rodando localmente pela frente (agente-leitura,
    contexto "Todas"): 8 linhas (eram 16), nenhuma duplicada, KPIs 8 = 1 + 0 + 7, sem
    erro de console nem HTTP 4xx/5xx.

### 3. `__tests__/acessoAoCondominio.test.ts` ✅
- 7 casos novos: dois papéis na mesma unidade → 1 linha; mesma pessoa em 2 unidades → 2
  linhas; 2 pessoas na mesma unidade → 2 linhas; papel repetido aparece 1×; ordem fixa;
  primeira ocupação e ordem de entrada preservadas; vazio.
- **Pronto quando:** `npx vitest run __tests__/acessoAoCondominio.test.ts` sai com 0.
  Saiu com 0 (30/30 junto com `orgContextGuard`).

## Verificação
- `check-ui-standard.sh` no arquivo editado: nenhuma violação.
- `tsc --noEmit`: exit 0, 0 erros.
- Publicação: push em `main`, depois o check-run `ci` e `conferir-producao.sh "PESSOAS VINCULADAS"`.
