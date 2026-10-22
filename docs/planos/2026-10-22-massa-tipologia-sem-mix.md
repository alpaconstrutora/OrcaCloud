# Gerar massa: tipologia com mix 0 % dava "nenhuma unidade cabe"

## Pedido original

> incorporacao > planta inteligente > terreno > Massa > Gerar massa: fiz um teste e recebi essa mensagem : Nenhuma combinação atende às restrições. Os motivos mais comuns: nenhuma unidade cabe (420), TO acima da máxima (36), CA acima do máximo (27).

Sessão: f9e6de53-a1a6-4e39-a05a-c2f29b3cdb00 · 22/10/2026

Depois do diagnóstico (abaixo), proposta das três mudanças e:

> faça numa frente separada, com teste e PR

## Diagnóstico (conferido no banco, 22/10/2026)

Estudo "Planta 15/10/2026" (`e9357598-…`), produto gravado em 22/10 18:18 UTC: uma
tipologia só, "Tipologia 1", residencial, 60 m², **mix 0 %**, preço 0.

- `tipologiasDoUso` (`utils/blueprintProduto.ts`) só deixa entrar tipologia com
  `proporcaoPct > 0` e `areaPrivativaM2 > 0` → lista vazia → todo bloco com 0 unidades.
- O gerador só confere `produto.tipologias.length > 0`, então varre as 420 combinações e
  culpa o tamanho ("nenhuma unidade cabe"), quando a causa é o produto.
- "Nova tipologia" (`TelaProduto.tsx`) cria a linha com mix 0 %.
- `problemasDoProduto` já avisava "Residencial: nenhuma tipologia com participação no
  mix." — mas sem dizer a consequência, sem cobrir área 0, e calado quando UMA tipologia
  está em 0 % ao lado de outras com mix (ela some do estudo em silêncio).

## Plano

1. **`utils/blueprintProduto.ts`** — `tipologiasForaDoEstudo(produto)` (a mesma regra de
   `tipologiasDoUso`, uma fonte só) e `problemasDoProduto` passa a dizer, por tipologia,
   que mix 0 % ou área 0 a deixa fora do estudo.
   *Pronto quando:* teste em `__tests__/blueprintProduto.test.ts` cobre mix 0 % sozinha,
   mix 0 % ao lado de outra com mix, e área 0.
2. **`utils/blueprintGeradorDeMassa.ts`** — produto com tipologias e NENHUMA aproveitável:
   o gerador para antes da varredura com a causa e o caminho (Terreno › Massa › Produto),
   citando as tipologias e o motivo de cada uma.
   *Pronto quando:* teste em `__tests__/blueprintGeradorDeMassa.test.ts` com o produto do
   caso real (1 tipologia, mix 0 %) dá `avaliados = 0`, aviso com "mix 0 %" e sem
   "nenhuma unidade cabe".
3. **`utils/blueprintProduto.ts` + `components/blueprint/TelaProduto.tsx`** — a linha nova
   sai de `tipologiaNova(produto)` (pura; a tela só chama): nasce com mix 100 % quando não
   há outra residencial que entre no estudo; senão em 0 %, e o aviso do item 1 aponta.
   (Não há teste de componente da `TelaProduto`; a regra foi para a função pura para ser
   testável.)
   *Pronto quando:* teste em `__tests__/blueprintProduto.test.ts`: produto vazio → 100;
   produto com residencial de mix > 0 → 0 e `problemasDoProduto` acusa a nova; id não
   repete.

## Estado

- [x] 1 — `tipologiasForaDoEstudo` + `problemasDoProduto` por tipologia; teste "diz, por tipologia…"
- [x] 2 — o gerador para antes da varredura (1423 combinações → 0 no lote de prova); teste "produto sem tipologia aproveitável…"
- [x] 3 — `tipologiaNova`; teste "a tipologia nova nasce no estudo…"
- [ ] publicado e conferido no estudo real

## Verificação

Testes dos três itens; `tsc --noEmit`; suíte dos arquivos tocados; CI do PR (Linux).
Depois de publicado: o mesmo estudo, com o mix ainda em 0 %, mostra a mensagem nova em
Gerar massa; com o mix em 100 %, gera cenários.
