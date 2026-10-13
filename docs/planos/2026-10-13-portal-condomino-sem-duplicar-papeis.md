# Portal do Condômino — não duplicar pessoa com dois papéis na mesma unidade

## Pedido original
Sessão a2507f9f, 13/10/2026 ~12:49 (com print da tela de acessos do condomínio 007 - Bella Vista):

> portais > portal do condomínio:
> 1. veja print. no caso em que o proprietário e o Responsável financeiro for a mesma pessoa, nao precisa vir duplicado

### Pedido 2 — mesma sessão, 13/10/2026 ~13:05 (com print de Comercial › Condomínios › 007 - Bella Vista › Ocupações)

> em comercial > condominios > aba ocupacoes: esta acontecendo o mesmo problema

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

### 4. `components/condominio/OcupacoesTab.tsx` (pedido 2) ✅
Aqui cada papel é um registro que se encerra e exclui. A tabela junta os papéis
na mesma linha, e as ações continuam agindo sobre os registros:
- Uma linha por pessoa × unidade, **só entre ocupações vigentes**. Com "Incluir
  encerradas", cada ocupação encerrada fica na sua própria linha (é histórico, com data
  de saída própria). A regra fica em `agruparPapeisPorPessoa` (chave `enc:<id>`), que
  agora também devolve `ocupacoes` (todos os registros do grupo).
- Papel: um por linha, empilhados, cada um na sua cor (§8). Em linha corrida o texto
  mede 225px (273 com o px-6) e seria cortado.
- Entrada: uma data se for a mesma; senão, uma por papel, alinhada com a coluna Papel.
- Encerrar (ícone da porta): encerra todos os papéis da linha, um por vez, aplicando cada
  sucesso no estado local (§22). Falha parcial diz "N de M já encerradas".
- Menu ⋮: com 2+ papéis, ganha "Encerrar só como <papel>" para cada um.
- Excluir: apaga todos os registros da linha. O título diz quantos ("Excluir os 2
  registros?") e a mensagem indica o "Encerrar só como…" para tirar um papel só.
- KPI "OCUPAÇÕES ATIVAS" → "PESSOAS VINCULADAS" (pessoa × unidade vigente).
- Larguras padrão (§6.1): papel 135 → 190 ("Responsável financeiro" = 141 + 48),
  unidade 105 → 100, torre 130 → 120. A soma vai a 1390, que é exatamente a largura útil
  medida, então o espaçador fica em 0 nesse viewport. O texto de Portal ganhou
  `truncate` + `title`, porque sem a folga "Portal do Cliente · 69 dias" passava por
  cima dos ícones de Ações (antes ele só cabia porque transbordava para a folga).
  Quem já tem larguras salvas continua com as suas.
- **Pronto quando:** no 007 - Bella Vista, 8 linhas de pessoa (eram 16) + 1 unidade sem
  ocupante, papéis empilhados inteiros, KPI 8, menu da linha 11 com os dois "Encerrar só
  como…", sem rolagem horizontal, sem erro.
  - Verificado em 13/10 no app local (agente-leitura, "Todas", viewport 1700): exatamente
    isso. Tabela 1390 = container 1390, sem erro de console nem HTTP. Encerrar e excluir
    **não** foram executados (a conta é só de leitura e o dado é real); o caminho foi
    coberto pelo typecheck e pela leitura do código.

## Verificação
- `check-ui-standard.sh` nos dois arquivos editados: nenhuma violação.
- `tsc --noEmit`: exit 0, 0 erros.
- `acessoAoCondominio.test.ts` + `orgContextGuard.test.ts`: 32/32.
- Publicação 1 (itens 1–3): `c11d44d`, domínio conferido com "PESSOAS VINCULADAS", CI `success`.
- Publicação 2 (item 4): `ba40a13`, domínio conferido com "Encerrar só como", CI `success`.
