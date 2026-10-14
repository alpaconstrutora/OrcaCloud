# Gaveta de Esgoto — Tratamento no padrão das outras gavetas e os botões duplicados

## Pedido original

> 3. Aavaliar ma sequencia a gaveta de Esgoto, que tem a mesma mistura (coletor e tratamento são dimensionamento).

Sessão Claude Code (VS Code) · 14/10/2026. Avaliação (sobre `origin/main`): a gaveta NÃO precisa virar
tela (15 campos, nenhuma tabela que cresce, ~900 px); o problema principal é que ela mostra junto rede
pública (coletor) e tratamento individual, e o "Lançar" do rodapé sempre escolhe a rede pública. Propostos 3
itens; o usuário respondeu:

> comece pelos itens 2 e 3, que são rápidos e o 1 separado, com plano próprio

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/10 | Fazer os 3 itens juntos? | Não: 2 e 3 agora; o 1 ("Destino do esgoto" como hipótese) separado, com plano próprio |

Decisão minha, dita ao usuário: o "15 m / 25 m do coletor viram hipóteses" (que estava no item 3) **vai
para o plano do item 1** — mexe em `utils/blueprintColetorPredial.ts` e em `HipotesesDeEsgoto` (que
entram no hash da ART), e o combinado foi que 2 e 3 não tocariam isso.

## Plano

**1. `components/blueprint/PainelTratamento.tsx`** — resultado (dimensionamento, unidades, botão,
conferência) antes das premissas; premissas no `BlocoDeHipoteses` (recolhidas, com resumo); campos
numéricos → `CampoNumericoDeHipotese` (apagar "Infiltração" gravava 1 L/m²·dia; "Mês mais frio", 0 °C;
"ø sumidouro", 800). O "Lançar tratamento" FICA: o "Lançar" do rodapé não lança tratamento (isso é o item 1).
- **Como sei que terminou:** `PainelTratamento.test.tsx`: apagar a infiltração e sair não grava; o
  resultado vem antes do bloco; o filtro e o padrão gravam; o botão continua com o motivo.

**2. `components/blueprint/PainelColetorPredial.tsx`** — sem botão de lançar nem `onLancar` (o "Lançar"
do rodapé — `lancarTudo`/`planejarEsgotoCompleto` — lança ligação e coletor); o texto da ligação proposta
aponta para ele. "Confirmar cota"
fica (é decisão sobre uma peça, não lançamento).
- **Como sei que terminou:** `PainelColetorPredial.test.tsx` (novo): sem botão de lançar; "Confirmar
  cota" chama o callback; o texto da ligação proposta cita o "Lançar" do rodapé.

**3. `BlueprintEditor.tsx` › ventilação** — sem "Lançar ventilação" (o "Lançar" do rodapé lança a
ventilação); o texto diz o que o "Lançar" do rodapé vai lançar.
- **Como sei que terminou:** teste do editor da gaveta de esgoto: nenhum botão "Lançar ventilação" /
  "Lançar coletor"; o "Lançar (3)" do rodapé continua lançando tudo.

**4. Verificação** — `check-ui-standard.sh`, `tsc`, editor sozinho + painéis + hidráulica com a conta
fechando; nenhum `utils/` tocado.

## Estado

- [x] 1 Tratamento — `PainelTratamento.test.tsx` 4/4 (resultado antes do bloco; apagar a infiltração não
  grava; temperatura grava ao sair; filtro e motivo do botão).
- [x] 2 Coletor — `PainelColetorPredial.test.tsx` (novo) 2/2.
- [x] 3 Ventilação — sem botão; teste do editor confirma que a gaveta não tem "Lançar ventilação" nem
  "Lançar coletor".
- [x] 4 Verificação (14/10/2026): `check-ui-standard.sh` 0 alertas nos 3 arquivos de tela; `tsc` exit 0,
  0 erros; editor sozinho 252/252; 38 arquivos (painéis + hidráulica + memoriais) 298/298. `utils/`
  tocados: 0.

O item 1 da avaliação (destino do esgoto) ficou em `2026-10-14-esgoto-destino-rede-ou-tratamento.md`
— só o plano, aguardando decisão.
