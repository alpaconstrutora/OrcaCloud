# Zona do Mapa Regulatório na Planta Inteligente — o que faltava

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 03/10/2026. Pedido, literal:

> compare os dados entre planta inteliegente e mapa regulatorio com o intuito de verificar o que falta

A comparação (feita no banco de produção e com a própria `lerZona` sobre as 175 zonas do catálogo) foi respondida com
quatro grupos; os três primeiros são código, o quarto é cadastro. À pergunta "Quer que eu implemente os itens 1 a 3?",
o usuário respondeu, literal:

> sim

## O que a comparação achou

| Campo do mapa | Preenchido (catálogo, 175) | A Planta lê? | Vira número (antes) |
|---|---|---|---|
| CA máximo | 174 | sim | 126 · 48 descartados |
| CA básico | 174 | sim | 144 · 30 descartados |
| CA mínimo | 174 | não | — |
| Taxa de ocupação | 117 | sim | 93 · 24 descartados |
| Permeabilidade mínima | 117 | sim | 97 · 20 descartados |
| Recuo de frente | 174 | sim | 144 · 30 descartados |
| Uso permitido, área mínima da unidade, documento fonte | 0 · 0 · 174 | não | — |
| Recuos de fundos/laterais, gabarito, vagas | ~0 | sim | o mapa não tem o dado |

Os "descartados" são quase todos texto com NÚMERO DE NOTA DE RODAPÉ colado: "3²", "2²", "N.A.¹", "N.A.³".

## Itens

1. [x] **Notas de rodapé** — o leitor (`utils/regulatoryValue.ts`) ignora o número da nota colado no fim ("3²" → 3;
   "N.A.¹" → não se aplica), sem confundir com a unidade "m²"; a leitura da zona guarda as notas por campo e a tela as
   mostra ("ver nota 2 da lei"). **Pronto quando:** sobre as 175 zonas do catálogo, CA máximo, CA básico, TO,
   permeabilidade e recuo de frente não têm mais descartados por nota; teste do leitor; teste da leitura da zona.
2. [x] **Campos do mapa que a Planta ignorava** — CA mínimo (lido, guardado no estudo, conferido: abaixo dele, aviso de
   subutilização no painel do lote e no estudo de massa); área mínima da unidade (lida, guardada, conferida contra as
   tipologias do produto); uso permitido e documento fonte (mostrados com a lei). **Pronto quando:** migration aplicada
   e conferida; testes da leitura, da conferência e do painel; prova no app real.
3. [x] **Campos que a Planta pede e o mapa não tinha** — testada mínima, área mínima do lote, insolação mínima,
   afastamento progressivo, recuo de frente escalonado: colunas nas duas tabelas de zona, na tela do Mapa Regulatório,
   na importação de planilha e na cópia do mapa para o empreendimento. **Pronto quando:** migration aplicada e conferida;
   a zona do catálogo com esses campos preenchidos chega à Planta sem digitação; teste da importação; prova no app real.
4. Fora (cadastro, não código): completar no catálogo recuos de fundos/laterais, gabarito e vagas; conferir a lei do
   mapa ("LC nº 013 de 2020") × a das zonas ("LC nº 12, de 2020"); copiar zonas para os empreendimentos.

## Feito (03/10/2026)

- `utils/regulatoryValue.ts`: `notaDeRodape`, `semNotaDeRodape`; `lerValorRegulatorio` ignora o número da nota colado no
  fim (o "²" de "m²" não é nota). Vale para a Planta e para a ponte com o Empreendimento (`regulatoryAdapter`).
- `utils/blueprintZonaUrbanistica.ts`: `LeituraDaZona.notas`; CA mínimo (`coeficienteMin`) e área mínima da unidade
  (`areaMinimaUnidadeM2`) lidos, com deriva; `conferirTipologias`; `VocabularioDaZona` (uma lista só para hook, painel
  e editor). Migration `aplicar_20271003000030` (APLICADA e conferida em `information_schema`; privilégios herdados da
  tabela): 5 colunas nas duas tabelas de zona e `coeficiente_minimo`/`area_minima_unidade_m2` no contexto do estudo.
- Painel da zona: as notas ("Com nota da lei: … (nota 2)"), o uso permitido, o documento fonte com a lei, e a área
  mínima da unidade no vocabulário. Painel do lote: "Coeficiente mínimo (subutilização)" — abaixo dele, âmbar e o aviso.
  Estudo de massa: aviso de subutilização. Avisos do lote: tipologias abaixo da unidade mínima.
- Mapa Regulatório: as 5 colunas na tabela de zonas, na cópia para o empreendimento e na importação de planilha.
  **Achado e corrigido:** o modelo de planilha baixado não se mapeava sozinho (rótulos abreviados como "T.O. máx." e
  "Área mín. unid." não batiam com nenhuma palavra-chave) — a sugestão tenta o rótulo exato antes.

| Portão | Resultado |
|---|---|
| `__tests__/regulatoryValue.test.ts` (+2) | "3²" → 3 (nota 2), "2,5³", "N.A.¹" não se aplica, "360 m²" é unidade; nota no meio continua recusada |
| `__tests__/blueprintZonaMapaRegulatorio.test.ts` (8) | a zona com os formatos reais do catálogo: CA 3/2/0,25, notas por campo, "N.A.¹" nomeado; os 5 campos e a unidade mínima chegam da zona; deriva de CA mínimo e unidade mínima; tipologias abaixo do mínimo nomeadas; massa abaixo do CA mínimo avisada; o MODELO de planilha se mapeia sozinho (todas as colunas); cabeçalhos de prefeitura (lote × unidade, escalonado × frente) |
| `__tests__/components/PainelTerrenoOutorga.test.tsx` (+2) | CA mínimo: abaixo, âmbar e aviso de subutilização; acima, nada |
| Catálogo de produção (175 zonas, leitor rodado sobre os dados) | CA máximo: 126 → 147 com número; CA básico: 144 → 165; CA mínimo (novo): 165. O que sobra sem número é "N.A." (não se aplica), nomeado como antes |
| `tsc` · `check-ui-standard` (4 .tsx) · org guard · XSS | 0 · 0 violações · ok · ok |
| Suíte cheia (JSON, `pending` = 0) | 691/691 arquivos · 7.173 testes = 7.139 ok + 34 pulados · 0 falhas |
| Build | ok |
| App real (mapa DESCARTÁVEL "ZZ TESTE" em Cambuí/MG + estudo descartável) | 6/6: o Mapa Regulatório mostra as 5 colunas com os valores; na Planta, Buscar por cidade → Cambuí → o mapa → a zona: "Com nota da lei: … coeficiente de aproveitamento (nota 2), coeficiente básico (nota 2)", "Uso permitido: Residencial, misto", "fonte: Anexo II da LC"; Aplicar → **no banco**: CA 3/2/0,25, testada 12 m, lote 300 m², insolação 2 h, afastamento "(h - 6)/10", recuo escalonado 5 m a partir do 3º, unidade mínima 45 m², origem CATÁLOGO; 0 erros |
| Limpeza | 2 mapas, 2 zonas e 2 estudos descartáveis apagados; mapas 1 · zonas 175 · estudos 73 · contextos 2 · ZZ 0, iguais aos de antes |
