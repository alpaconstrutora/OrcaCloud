# Quadro de cargas e NBR 5410 › aba Quadros organizada

## Pedido original

Sessão de 25/10/2026, tarde, com print da aba **Quadros** da Garden (QDC: Alimentação em linha corrida de selects sem
rótulo, "Entrada" e a carga em texto corrido, 11 DRs encaixados em cinco linhas desalinhadas, DPS, "Fora da avaliação" e
o Centro de cargas soltos):

> *"organize melhor o Quadro de cargas e NBR 5410."*

## Diagnóstico (lido em `origin/main`)

`components/blueprint/PainelQuadroAlimentador.tsx` desenha tudo como `flex-wrap` de texto e campos: rótulos inline
("de", "V", "alimentador", "m", "Icn") e campos de 0,5 rem de altura, sem título de seção — o olho não acha onde começa
cada assunto. Os DRs são "pílulas" de quatro campos que quebram linha onde couber, então os 11 DRs da Garden não ficam
em coluna. O resultado do cálculo (instalada, demanda, IB, seção, geral, queda) é uma frase só. O Centro de cargas
(`LinhaCentroDeCargas`) vem colado embaixo, sem separação.

## Itens

### 1. Seções do §30 no cartão do quadro — `components/blueprint/PainelQuadroAlimentador.tsx`, `components/blueprint/PainelEletrica.tsx`

- **O que muda:** o cartão do quadro vira um formulário em seções com `SecaoTitulo` (régua do §30: `p-6`, seções
  `space-y-8`, campos `gap-x-6 gap-y-4`, rótulo em cima `space-y-1.5`):
  1. **Alimentação** — Tipo · Alimentado por · Unidade (quando há) · Ligação · Tensão (V) · Alimentador (m) · Icn dos
     disjuntores (com a Ik presumida embaixo), em grade; a Entrada de energia logo abaixo.
  2. **Carga e alimentador** — Instalada (com a divisão por grupo) · Demandada (com a tabela) · IB · Seção · Disjuntor
     geral · Queda de tensão, como valores com rótulo; uso coletivo, quadros alimentados, fases/Balancear e as
     pendências (falta, aviso, fora da avaliação) embaixo.
  3. **Proteção DR** — uma tabela alinhada (Protege · In · IΔn · Polos · Geral · remover), "+ DR" no título, as
     sugestões da 5.1.3.2.2 abaixo.
  4. **Proteção contra surtos (DPS)** — Classe · In · Up · Disjuntor de desconexão em grade; "DPS sugerido"/"Remover" no
     título; a exposição a descargas no resumo.
  5. **Centro de cargas** — com título próprio; o texto à esquerda e os dois botões juntos à direita.
- Nenhum dado, comando ou `aria-label` muda (os testes e leitores de tela acham os mesmos campos).
- **Pronto quando:** testes do painel ajustados aos textos novos e passando (`PainelEletricaQuadroEExecutivo`,
  `PainelBalanceamento`, `PainelCentroDeCargas` e os de DR/DPS); `check-ui-standard.sh` nos `.tsx` tocados; print da Garden
  antes × depois no harness.

## Estado

- [x] item 1 + testes — `PainelEletricaQuadroEExecutivo` ajustado (instalada "1.200 VA", "IB do alimentador", fases com
  VA); `PainelBalanceamento`, `PainelCentroDeCargas`, DR/DPS e os outros do painel passam sem mudança (mesmos
  `aria-label`); `check-ui-standard.sh` sem violação nos três `.tsx`. A mais do pedido: fases e DRs na ordem do número do
  circuito (C2 antes de C10; o DR geral primeiro); botões do Centro de cargas juntos à direita
- [x] prova no navegador (Garden, antes × depois) — harness local com o rascunho da Garden (11:40) no PainelEletrica, em
  1700 e 1280 px, e o mesmo com o QDC trifásico 380 V / 15 m (IB 20,1 A · 4 mm² · geral 25 A · queda 0,7 %)
- [x] tsc + suíte — tsc 0 erros; suíte (sem `blueprintCasaAutomatica`, que vai na CI): 11.464 ok + 5 testes de tela que
  caíram por tempo sob carga e passaram sozinhos (`BlueprintEditor`, `PainelVersoes`, `TelaWebhooks`: 327/327) = 11.469 ok,
  0 falhas, 34 pulados, total 11.503
- [ ] PR + CI
- [ ] publicação
