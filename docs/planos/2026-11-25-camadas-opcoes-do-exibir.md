# Camadas × Exibir — as opções de uma disciplina viram sublinhas (25/11/2026)

## Pedido

- *"o que tem em exibir que falta implementar nas camadas como exemplo da terraplanagem?"* (o usuário procurou
  "Terraplenagem" no painel Camadas e não achou — o liga/desliga era só Vista › Exibir › Corte e aterro).
- Resposta com o levantamento e a recomendação → *"Implemente, sem mover para as Camadas os itens de medidas e
  preenchimento do terreno."*

## O que entrou

- **Terreno** abre em: Mapa: ruas, Mapa: relevo (já existiam) + Curvas de nível, Declividade, Hipsométrico, Feições
  do levantamento, Nós da grade, Corte e aterro, Envelope construtivo.
- **Estrutura** abre em: Eixos.
- Ficam SÓ no Exibir (decisão do usuário / não são camada): medidas (paredes, lote e massa, sub-regiões, cadeias,
  interna), preenchimentos, unidades na planta, grade, nomes/etiquetas, cores por ambiente, alto contraste.

## Como

- UMA definição: `itensDoTerrenoNoExibir` e `itemDosEixosNoExibir` no `BlueprintEditor` (tipo `ItemDeExibicao` do
  `MenuExibir`) — o menu Exibir espalha os mesmos objetos e o `PainelCamadas` recebe `exibicao={{ TERRENO, ESTRUTURA }}`.
  Os dois lugares nunca divergem (mesma preferência por baixo).
- `PainelCamadas`: grupo de uma camada com mapa e/ou opções ganha a seta; `LinhaDeExibicao` = só o olho (sem
  contagem, meio-tom e Isolar — não são peças); item `desabilitado` → olho desligado com o motivo (`ajuda`) no
  `title`. O olho do grupo continua escondendo tudo dele.

## Estado

- [x] `PainelCamadasExibicao.test.tsx` (4) RED → GREEN; `BlueprintEditor` › "opções do Exibir nas Camadas" RED (sem
  a ligação) → GREEN; Camadas/mapa/catálogo/editor 336/336; `tsc` limpo; `check-ui-standard` ok.
- [x] Harness `docs/spikes/camadas/?exibicao=1`: Terreno e Estrutura abertos, colunas alinhadas, item sem efeito
  apagado, olho de "Corte e aterro" desliga.
