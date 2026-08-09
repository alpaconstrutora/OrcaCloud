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

## Fica de fora

**RF-122 — mapear tipo geométrico para composição de orçamento.** É o último
passo para o número sair da planta e chegar ao orçamento. O motor já entrega
área, volume e comprimento por elemento; falta a tabela de-para. Não entrou aqui
porque depende de decisão sobre catálogo (SINAPI × composição própria), que é
assunto do módulo de Orçamento, não da planta.
