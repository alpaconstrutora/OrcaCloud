# Gerar massa: "faltam vagas" sem dizer que não cabe vaga nenhuma; rótulo com a medida pedida

## Pedido original

> continua a mensagem: Nenhuma combinação atende às restrições. Os motivos mais comuns: faltam vagas (393), TO acima da máxima (36), nenhuma unidade cabe (27).

Sessão: f9e6de53-a1a6-4e39-a05a-c2f29b3cdb00 · 22/10/2026, depois do PR #100
(`docs/planos/2026-10-22-massa-tipologia-sem-mix.md`).

Diagnóstico apresentado (mensagem nova = corrigir o aviso das vagas e o rótulo do cenário) e:

> sim

## Diagnóstico (reproduzido com os dados do banco, 22/10/2026)

Estudo "Planta 15/10/2026": lote 10 × 30 m (frente 10 m), recuos frente/fundos 1,5 m e laterais 0,
TO 70 %, CA 4, gabarito 18 m, zona sem exigência de vagas; produto 1 tipologia 58 m², 1 vaga/un.,
arranjo das vagas **de ré (90°)**. A sonda deu exatamente os números do usuário (420 avaliadas;
faltam vagas 393, TO 36, nenhuma unidade cabe 27).

- Vagas por subsolo (9,8 × 29,8 m): de ré **0**, espinha 45° **0**, em fila **4**. A fileira de ré
  com circulação pede 10,0 m e a largura útil é menor. Não é defeito de cálculo — é o lote.
- Defeito 1: o aviso diz "faltam vagas" sem dizer que cabe **zero**, nem por quê, nem o que fazer.
- Defeito 2: `rotuloDe` escreve os PARÂMETROS da varredura (`p.comprimentoMm × p.profundidadeMm`),
  não o bloco recortado por `contornos`/`montar` — saiu "Embasamento + torre · 19 × 18 m" num lote
  de 10 m de largura.

## Plano

1. **`utils/blueprintProduto.ts`** — `vagasQueNaoCabem(anel, arranjo, folgas)`: com o MESMO
   planejamento de `vagasQueCabem`, devolve a largura útil e o que a fileira pede quando não cabe
   vaga nenhuma por falta de largura; `null` quando cabe alguma.
   *Pronto quando:* teste com o contorno 9,8 × 29,8 m: de ré → largura < pedido (10,0 m); em fila → `null`.
2. **`utils/blueprintGeradorDeMassa.ts`** — sem viável, com "faltam vagas" e a garagem do lote inteiro
   (o maior contorno de garagem que o gerador monta) sem vaga: aviso com as medidas, os arranjos que
   cabem e o caminho (Produto › Hipóteses, ou desmarcar "Atender às vagas exigidas"). É o último
   aviso (vira o subtítulo da tabela vazia).
   *Pronto quando:* teste com o lote do caso real: aviso com "Nenhuma vaga cabe na garagem", "10,0 m",
   "em fila" e "4 vagas por subsolo".
3. **`utils/blueprintGeradorDeMassa.ts`** — o rótulo usa as medidas efetivas que `montar` produz.
   *Pronto quando:* teste no lote 10 × 30: em todo candidato avaliado as medidas do rótulo batem com
   os lados do bloco de unidades (±0,1 m) e nenhuma passa da largura do lote.

## Estado

- [x] 1 — `vagasQueNaoCabem` (+ `planoDaGaragem`, que `vagasQueCabem` passa a usar); teste "garagem estreita demais…"
- [x] 2 — aviso "Nenhuma vaga cabe na garagem: a largura útil é 9,4 m e a fileira de ré (90°) com a circulação
  pede 10,0 m (em fila cabem 4 vagas por subsolo)…"; teste "nenhuma vaga cabe na garagem…"
- [x] 3 — `contornos`/`montar` devolvem as medidas efetivas e `rotuloDe` as usa ("Torre única central · 6 pav ·
  18 × 9,8 m", era "18 × 10 m"); teste "o rótulo diz a medida do bloco…"
- [ ] publicado e conferido

## Verificação

Testes dos três itens; suíte de `blueprintProduto`, `blueprintGeradorDeMassa`, `blueprintComparadorDeMassa`;
`tsc --noEmit`; CI do PR.
