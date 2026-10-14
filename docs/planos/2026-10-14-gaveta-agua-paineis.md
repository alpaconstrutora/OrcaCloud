# Gaveta "Água fria e quente automáticas" — os cinco painéis de baixo

## Pedido original

> da mesma forma que foi feito com esgoto automatico, avalie o drawer Água fria e quente automáticas

Sessão Claude Code (VS Code) · 14/10/2026, manhã. Avaliação feita sobre `origin/main` `9277bc52`
(lição do mesmo dia: não ler do checkout de integração). Ao fim da avaliação perguntei "Sigo com os
cinco? E, para as duas da NBR (pressão mínima 10 kPa e estática máxima 400 kPa): editáveis, ou fixas
com a norma citada na tela?". Resposta:

> sim

Continuação de `docs/planos/2026-10-14-gavetas-esgoto-agua-hipoteses.md`, que cobriu só a parte de
CIMA desta gaveta (tabela da rede + hipóteses da rede).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/10 | Aplicar os 5 itens (campo numérico, textos fixos, folgas, rodapé, reorganização)? | "sim" |
| 14/10 | Pressão mínima 10 kPa e estática 400 kPa (NBR 5626): editáveis ou fixas? | sem resposta explícita → **editáveis**, pela regra geral do usuário de 04/10 ("todas as folgas que houver devem ser incluídas em hipóteses"), com a NBR citada no `title` e no texto. Dito ao usuário; reverter é trocar o campo por texto. |

Decisões minhas:
- Estado vazio: só as **Pressões** somem sem origem (a frase dela repetia a da tabela). A Reservação
  continua: sem caixa ela diz QUANTO reservar e a caixa sugerida — informação que a tabela não dá.
- Cada painel: título → resultado → botão de lançar → hipóteses recolhidas (`BlocoDeHipoteses`, um por
  painel, cada um lembrando se ficou aberto). O bloco passa a aceitar `regras` opcional.
- Rodapé: o rótulo é "Lançar tudo" quando há ponto a ligar; "Relançar tudo" quando só há sugeridos;
  o texto ao lado diz as partes (pontos · alimentador · recalque) ou quantos trechos são sugeridos.

## Plano

**1. `components/blueprint/BlocoDeHipoteses.tsx`** — `regras` opcional (sem lista vazia).
- **Como sei que terminou:** os painéis sem regras renderizam sem `<ul>` vazio; tipos passam.

**2. `PainelReservacao.tsx`** — campos → `CampoNumericoDeHipotese`; novos: pessoas por dependência,
fração no inferior (%); a nota da população lê as hipóteses; hipóteses recolhidas.
- **Como sei que terminou:** `PainelReservacao.test.tsx`: apagar "Per capita" e sair NÃO grava (antes
  gravava 1 L/dia); a nota diz "3 por dormitório" com a hipótese 3; fração 70 % grava 0,7.

**3. `PainelAlimentador.tsx`** — campos → `CampoNumericoDeHipotese`; novos: velocidade máx., DN
mínimo, pressão mínima na boia; botão antes das hipóteses.
- **Como sei que terminou:** `PainelAlimentador.test.tsx` (novo): apagar a pressão da rede não grava
  0; DN mínimo e pressão na boia gravam; botão desligado diz o motivo.

**4. `PainelRecalque.tsx`** — campos → `CampoNumericoDeHipotese` (rendimento com 2 casas); novo: cota
do percurso.
- **Como sei que terminou:** `PainelRecalque.test.tsx` (novo): digitar 0,65 no rendimento grava 0,65
  (antes o "0" virava 0,20); cota do percurso grava.

**5. `PainelAquecedor.tsx`** — resultado ANTES das hipóteses; campos → `CampoNumericoDeHipotese` com
faixa (uso 25–80 °C, fria 0–40 °C).
- **Como sei que terminou:** `PainelAquecedor.test.tsx`: apagar a temperatura não grava 0 °C; o
  resultado vem antes do bloco.

**6. `PainelPressoesDaAgua.tsx`** — hipóteses no `BlocoDeHipoteses`; novos: pressão mínima e estática
máxima (NBR 5626 no `title`); "estática acima de N" lê a hipótese; tabela no padrão de drawer
(§6.2/§6.9/§6.11); sem origem → não renderiza.
- **Como sei que terminou:** `PainelPressoesDaAgua.test.tsx`: estática 350 → o estado diz "acima de
  350"; cabeçalho sentence case; sem redes → nada no DOM.

**7. `BlueprintEditor.tsx`** — cabeçalho da gaveta lê a cota do ramal; rodapé ("Lançar tudo" /
"Relançar tudo" + as partes).
- **Como sei que terminou:** testes do editor da água passam; teste novo: cota do ramal 1800 → o
  cabeçalho diz "1,80 m".

**8. Verificação** — `check-ui-standard.sh` nos arquivos tocados; `tsc`; os 5 testes de painel + o
editor sozinho + os testes da hidráulica com a CONTA fechando; nenhum arquivo de `utils/` tocado (sem
bundle da `planta-api`).

## Estado

- [x] 1 `BlocoDeHipoteses` — `regras` opcional.
- [x] 2 Reservação — `PainelReservacao.test.tsx` 5/5 (apagar per capita não grava; nota "3 por
  dormitório"; fração 70 % → 0,7; pessoas por dependência).
- [x] 3 Alimentador — `PainelAlimentador.test.tsx` (novo) 4/4.
- [x] 4 Recalque — `PainelRecalque.test.tsx` (novo) 4/4 ("0" não vira 0,20; 0,65 grava 0,65).
- [x] 5 Aquecedor — `PainelAquecedor.test.tsx` 4/4 (resultado antes do bloco; apagar não grava 0 °C).
- [x] 6 Pressões — `PainelPressoesDaAgua.test.tsx` 6/6. Achado durante o trabalho: o **Qmáx do
  hidrômetro** apagado gravava 0, e a perda no hidrômetro é `(36·Q)²/Qmáx²` → infinita. Agora o
  mínimo é 0,5 m³/h (dito no `title`).
- [x] 7 Editor — cabeçalho lê a cota do ramal ("1,80 m" com 1800); rodapé "Relançar tudo" + partes
  (`data-testid="agua-rodape"`).
- [x] 8 Verificação (14/10/2026): `check-ui-standard.sh` 0 alertas nos 7 arquivos de tela; `tsc` exit 0,
  0 erros; editor sozinho 252/252; 35 arquivos (painéis + hidráulica + memoriais + Saídas de Incêndio
  + guarda de cabeçalho) 289/289, conta fechando. Nenhum arquivo de `utils/` tocado.

## Publicação

14/10/2026: `fbc373dd` empurrado para `main` (`9277bc52..fbc373dd`). Check-run `ci` = success.
`conferir-producao.sh "Hipóteses do alimentador" "Relançar tudo"`: os dois textos no bundle servido;
domínio = `origin/main` (`4ed0cf4`, que já contém o commit). Conferência VISUAL na tela ainda não feita.
