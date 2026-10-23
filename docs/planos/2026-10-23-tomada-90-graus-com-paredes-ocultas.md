# Planta › Elétrica — tomada sempre a 90° da parede (também com as paredes ocultas)

## Pedido original

Sessão `9e26b316`, 23/10/2026, com print da planta Garden (elétrica ligada, só vigas e pilares à vista):

> veja print. Os  simbolos de tomadas devem estar sempre alinhados a 90 graus em relacao a parede

À pergunta "o que está torto?", a resposta foi: **"O próprio triângulo"**.

## Causa

`apoioDaTomada` (utils/blueprintRede.ts) orienta o triângulo pela NORMAL da parede mais próxima — sempre a 90°.
Mas o canvas passava a ele `paredesDoNivel`, que EXCLUI as paredes ocultas pelas Camadas. No print a Arquitetura
estava oculta (os traços escuros tracejados são as vigas): sem parede na lista, a função caía no padrão +X e todo
triângulo apontava para a direita, paralelo à parede horizontal. Reproduzido com o harness local (cópia do rascunho
do Garden, sem login e sem escrita): `C:/tmp/tomada-90/prova-regiao-antigo.png` (antes) e `…-novo.png` (depois).

Conferido pelos dados: as 32 tomadas do Garden não têm giro gravado e estão todas na face de uma parede.

## Itens
- [x] `BlueprintCanvas.tsx`: `paredesParaApoio` = TODAS as paredes do pavimento (com o deslocamento do arraste),
      visíveis ou não; usadas no desenho da tomada e no acerto do clique no símbolo.
      Pronto quando: teste `BlueprintCanvasAnotacoesEletricas` "com a ARQUITETURA OCULTA…" — falha no código
      antigo (triângulos diferentes com as paredes ocultas) e passa no novo (iguais, ápice na vertical).
- [x] Prancha: já usava `model.walls` (todas) — sem mudança.
- [ ] PR + CI
- [ ] publicação
