# Planta Inteligente — Quantitativos (E5 parcial)

## Pedido original

Depois de fechar o Spike C e decidir adiar o braço multimodal do Gemini, a
pergunta foi qual frente atacar primeiro. O usuário respondeu, literalmente:

> quantitativos primeiro

e, ao ver os números aparecerem na tela sem nada gravado:

> Faça a persistência

## Por que quantitativos antes do Digitalizador

O Digitalizador (E1/E2) está bloqueado por um problema **semântico**, não
geométrico: o Spike C provou em 5 rodadas que fechar vão de porta não se resolve
por proximidade nem por colinearidade — as duas reprovaram no PDF A0 real
(guarda-corpo virando parede, terraço aberto sendo fechado). Vetor e raster
convergiram no mesmo bloqueio, de forma independente.

Quantitativos, ao contrário, dependem só do que já existe e funciona: o kernel
geométrico determinístico e o snapshot publicado com hash. É a ponte que faz a
planta desenhada **valer alguma coisa** para o orçamento, que é o motivo do
módulo existir.

## A decisão que carrega o resto: área de eixo ≠ área de piso

O extrator de faces do kernel devolve o polígono do **eixo** das paredes, porque
é assim que a topologia fecha. Mas ninguém assenta piso no eixo da parede: o
material para no revestimento. Numa sala de 4 × 3 m com parede de 150 mm a
diferença é de **9,4%** — direto no orçamento de piso, revestimento e rodapé.

A correção é o recuo do polígono pela metade da espessura de cada trecho:

```
A' = A_eixo − Σ(dᵢ · Lᵢ) + Σ(dᵢ² · tan(giroᵢ / 2))
```

O terceiro termo não é refinamento: sem ele **o canto é descontado duas vezes**,
uma por cada parede que chega nele. No retângulo do exemplo isso daria 10,95 m²
em vez dos 10,9725 m² corretos.

Trecho de contorno sem material (`Boundary`) tem espessura zero e **não recua** —
divisória imaginária não come área de piso.

## Itens

| # | Item | Critério de pronto |
|---|---|---|
| 1 | `utils/blueprintKernel/quantities.ts` — motor puro | área de eixo, área de piso recuada, perímetro, rodapé, face líquida e volume de parede |
| 2 | Abertura desconta | porta e janela saem da face e do volume; **porta interrompe o rodapé, janela não** |
| 3 | Duas faces | total de parede conta os dois lados — contar um subestima pela metade |
| 4 | Política versionada | `POLITICA_PADRAO` com perda; o valor **sem** perda continua visível ao lado |
| 5 | Procedência (RF-121) | cada ambiente carrega a fórmula que produziu a área |
| 6 | Sem arredondar no cálculo | PRD §9.2: guarda cru, arredonda só na exibição (`formatarQuantidade`) |
| 7 | Painel na aba Quantitativos | tabela por ambiente e por parede, com os totais |
| 8 | Persistência (CA-08) | tabela `blueprint_quantity_snapshots`, imutável, chave única `(snapshot_id, policy_version)` |
| 9 | Só de versão publicada | nunca de rascunho — número que o orçamento cita não pode vir de geometria que ainda muda |
| 10 | Reprodutibilidade provada | `verifyQuantitySnapshot` recalcula do payload canônico e compara |

## Testes

- `__tests__/blueprintQuantities.test.ts` — 13 casos. Os valores esperados são
  **calculados à mão no comentário de cada caso**, não copiados da saída do
  código: teste que aceita o que o código produziu só mede "não mudou", e o erro
  que interessa em quantitativo é o que já nasce errado.
- `__tests__/blueprintE0.integration.test.ts` — 5 casos novos contra o banco
  real (idempotência, política nova cria outro registro, imutabilidade,
  verificação). Fora do CI, gated por `BLUEPRINT_E2E=1`.

## Migrations

| Arquivo | O quê |
|---|---|
| `aplicar_20270905000003_blueprint_quantity_snapshots.sql` | a tabela, em 5 blocos separados |
| `aplicar_20270905000004_blueprint_drop_auth_users_fk.sql` | remove as 4 FKs para `auth.users` que o E0 criou |

A primeira versão da 000003 deu **`40P01 deadlock detected`**. Duas causas
somadas, e as duas viraram regra:

1. **FK para `auth.users`** — é a tabela mais quente do Supabase; toda sessão
   logada renova token e escreve nela. Criar (ou remover) FK que a referencia
   exige lock forte e deadlocka enquanto houver alguém logado.
2. **DDL e leitura de catálogo na mesma transação** — o SQL Editor roda o script
   inteiro como uma transação só, então o `SELECT` de conferência em
   `pg_policies`/`information_schema` entrava no mesmo lock.

Daí o formato: **blocos separados, `SET lock_timeout = '5s'` em cada um,
conferência por último e sozinha**.

A 000004 existe por um motivo mais forte que o lock: `ON DELETE SET NULL`
**apaga a autoria**. Excluir um usuário zerava quem publicou a versão e quem
gerou o evento de auditoria. Trilha append-only que perde o ator quando a pessoa
sai da empresa não é trilha — UUID órfão que diz "foi este id" vale mais que
NULL.

---

# Parte 2 — RF-122: de-para para o orçamento

## Pedido original

> corrigir as Duas coisas que continuam abertas: A suíte de integração não rodou
> e RF-122

## A decisão de catálogo que se dissolveu

O RF-122 estava parado por uma dúvida: SINAPI ou composição própria? Ao olhar o
código, a dúvida sumiu — **não existe fork**. `custom_items` sobrepõe
`sinapi_items` pelo MESMO código, e é assim que a busca do orçamento já resolve
preço. O de-para guarda um código; quem escolhe o catálogo é o próprio código.
Divergir disso faria a planta orçar com um preço que a tela do orçamento não
mostra.

## A trava que justifica o módulo: a unidade

O erro perigoso aqui não é o de-para vazio — esse aparece na hora. É o de-para
ERRADO: apontar área de piso (m²) para um item cotado por metro linear. Nada
quebra, nenhuma tela reclama, e sai uma linha com número plausível e errado por
um fator de 4 ou 5. Só se descobre na obra.

Por isso cada medida declara a DIMENSÃO que produz e um mapeamento com unidade
incompatível é **recusado**, não gerado com aviso — aviso se ignora, linha que
não existe não. A normalização aceita `M2`/`M²`/`m2` porque reprovar grafia
correta empurraria o usuário a desligar a trava, e trava desligada é pior que
trava nenhuma: dá a impressão de que alguém conferiu.

## O que faltava e não estava no plano: NOMEAR AMBIENTE

`Space.name` estava declarado no kernel e **nada no sistema o definia**. Sem
isso, o filtro por ambiente (revestimento é de área molhada, não da casa
inteira) e o `location.room` da linha de orçamento nasceriam mortos — a classe
exata de defeito que os testes de componente existem para pegar.

Ambiente é DERIVADO: a cada rederivação os `Space` são recriados e o id deles é
posicional. Nome guardado por `spaceId` não sumiria — faria coisa pior:
reapareceria colado no ambiente errado quando a ordem mudasse. A solução é a dos
CAD: **etiqueta ancorada num ponto**. A cada rederivação o nome vai para o
ambiente que contém aquele ponto.

O centroide não serve de âncora: num "L" cai fora, e num ambiente com vazio
central cai dentro do vazio. `interiorPoint` tem o plano B por varredura
horizontal, que escolhe o meio do maior trecho interno.

## Itens

| # | Item | Critério de pronto |
|---|---|---|
| 1 | `utils/blueprintBudget.ts` — catálogo de 12 medidas, cada uma com dimensão | função pura, sem Supabase |
| 2 | Trava de unidade | mapeamento incompatível **recusado**, com motivo legível |
| 3 | Agrupamento `TOTAL` × `POR_ELEMENTO` | por elemento preserva `location.room` |
| 4 | Filtro por ambiente | revestimento só nas áreas molhadas |
| 5 | Procedência na linha | `calculationMemory` com fórmula, variáveis, resultado e hash da versão |
| 6 | Reenviar não duplica | id determinístico prefixado por estudo; regerar SUBSTITUI |
| 7 | Linha digitada à mão intocada | só o prefixo `bp:{studyId}:` é removido |
| 8 | `NameSpace` + etiqueta ancorada | nome sobrevive a mudar a geometria |
| 9 | `blueprint_budget_mappings` | configuração (CRUD completo), não snapshot |
| 10 | Painel Orçamento no editor | prever antes de aplicar; divergência com o mesmo destaque das linhas |

## Testes

- `__tests__/blueprintBudget.test.ts` — 20 casos, valores à mão no comentário.
- `__tests__/blueprintKernel.test.ts` — 9 casos novos de nome de ambiente,
  incluindo o que passa por um estado intermediário com a sala ABERTA (zero
  ambientes) e prova que o nome volta a colar quando ela fecha de novo.
- `__tests__/components/PainelOrcamento.test.tsx` — 8 casos da classe "ação
  oferecida que não funciona": Aplicar sem obra vinculada, divergência que não
  aparece, prévia que sobrevive a mudança no de-para.

## Kernel 0.2.0 → 0.3.0

As etiquetas entraram no payload canônico, então os 6 goldens foram recapturados
**pela segunda vez**. Como na primeira, a GEOMETRIA não mudou: a contagem de
ambientes dos seis casos seguiu idêntica — é essa asserção, e não o hash, que
prova isso.

Etiqueta é conteúdo, não decoração: renomear um ambiente muda o desenho de forma
observável e **tem** que mudar o hash. Se não mudasse, publicar depois de
renomear seria idempotente pela regra (ramo, revisão, hash) e o nome nunca
chegaria ao snapshot.

`modelFromCanonicalPayload` lê `payload.labels ?? []` porque snapshot é imutável:
os publicados antes disso vão continuar sem o campo para sempre, e quebrar ao
reabrir uma versão publicada seria perder o acervo por uma vírgula.

## Migration

`aplicar_20270905000005_blueprint_budget_mappings.sql` — 4 blocos, `lock_timeout`,
sem FK para `auth.users`. Diferente dos snapshots, esta tabela é CONFIGURAÇÃO:
tem as quatro policies (SELECT/INSERT/UPDATE/DELETE). O que precisa ser imutável
é o quantitativo gravado, não a regra que o produziu — e por isso a linha de
orçamento carrega a política e o hash dentro dela, em vez de depender desta
tabela para se explicar depois.

## Fica de fora

- **Busca de item por descrição** no de-para. Hoje se digita o código. Ligar o
  buscador do orçamento aqui é ergonomia, não correção.
- **Verificação contra o banco real do RF-122.** As funções de `listMappings` a
  `aplicarNoProjeto` só têm cobertura de unidade com dublê.
