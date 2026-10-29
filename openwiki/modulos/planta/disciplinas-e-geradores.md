---
type: módulo
title: "Planta Inteligente: disciplinas, geradores automáticos e normas"
description: Sobre o kernel geométrico, a Planta Inteligente empilha disciplinas (elétrica NBR 5410, hidrossanitário NBR 5626/8160, incêndio pelas ITs do CBMMG, climatização, estrutura, topografia, loteamento), geradores determinísticos que rodam em Web Worker (estudo de massa, casa automática, plantas), a ponte de quantitativos para o orçamento com trava de unidade e o fluxo de emissão executiva com ART amarrado a hashes.
tags: [blueprint, planta, mep, nbr5410, fire-safety, hvac, generators, web-worker, budget-bridge]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-3801009c8d3fc5ae3f14ad65
    resource: repo://hooks/useBlueprintEletrica.ts
  - id: openwiki-source-f39122a2bf9b0a99d4d14b9e
    resource: repo://hooks/useGeradorDeMassa.ts
  - id: openwiki-source-936596cdc387041cdd22829b
    resource: repo://utils/blueprintBudget.ts
  - id: openwiki-source-dca2c992e39ced26b5e212d0
    resource: repo://utils/blueprintCasaAutomatica.ts
  - id: openwiki-source-beaea3a261459bb217da1584
    resource: repo://utils/blueprintClimatizacao.ts
  - id: openwiki-source-31d5b447d124ef78198bddef
    resource: repo://utils/blueprintEletricaExecutivo.ts
  - id: openwiki-source-edc9343493015ec5f2cfd180
    resource: repo://utils/blueprintGeradorDeMassa.ts
  - id: openwiki-source-5b357100b3bc9d43657a6bf0
    resource: repo://utils/blueprintGeradorDeMassa.worker.ts
  - id: openwiki-source-4c3964f0c98a0a7b4c57f26f
    resource: repo://utils/blueprintHidraulica.ts
  - id: openwiki-source-7165d6d91a16855e07d87425
    resource: repo://utils/blueprintIncendioClassificacao.ts
  - id: openwiki-source-583228baddedaddf1104c0af
    resource: repo://utils/blueprintNbr5410.ts
  - id: openwiki-source-9f413cca4b454da90129bf8e
    resource: repo://utils/blueprintPranchas.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Planta Inteligente: disciplinas, geradores automáticos e normas

A Planta Inteligente é, de longe, a maior área do código: ~300 arquivos
`utils/blueprint*.ts`, ~190 componentes em `components/blueprint/`, ~25 hooks
`useBlueprint*` e ~50 serviços `blueprint*Service.ts`. Esta página mostra como
as camadas **sobre** o kernel se organizam; o modelo e o editor estão em
[Kernel e editor](./kernel-e-editor.md).

## O padrão comum

Quase todo arquivo de disciplina segue o mesmo molde, declarado no próprio
cabeçalho:

- **Módulo puro** em `utils/blueprint<Assunto>.ts`: lê o modelo do kernel e
  premissas, devolve resultado. Sem rede, sem estado, determinístico. É o que o
  Vitest cobre.
- **Premissas do estudo** num hook `hooks/useBlueprint<Disciplina>.ts`: estado
  local que responde na hora, gravação atrás com respiro, e degradação para "só
  nesta sessão" se a migration ainda não existe (`persistenciaIndisponivel`).
  Premissas que moravam no `localStorage` foram movidas para o estudo: duas
  pessoas viam cálculos diferentes do mesmo estudo.
- **JSON parcial completado na leitura**: o banco guarda só o que foi declarado;
  o resto vem do padrão ao ler.
- **Serviço** `services/blueprint<Disciplina>Service.ts` para persistência.
- **Fichas por tipo** com `Record` obrigatório: criar um tipo novo obriga a
  preencher todas as tabelas que precisam dele (menu, símbolo, inventário,
  quantitativo, painel, lançamento automático), e um teste confere que nenhuma
  ficou para trás.

## Disciplinas

| Disciplina | Módulos principais | Norma / referência |
|---|---|---|
| Elétrica | `blueprintNbr5410`, `blueprintCircuitosAutomaticos`, `blueprintEletricaDimensionamento`, `blueprintEletrodutos`, `blueprintFiacao`, `blueprintUnifilar`, `blueprintQuadroDeCargas` (kernel), `blueprintEletricaExecutivo` | NBR 5410 |
| Hidrossanitário | `blueprintHidraulica` (ficha de cada ponto), `blueprintAguaAutomatica`, `blueprintEsgotoAutomatico`, `blueprintPluvial`, `blueprintNbr8160`, `blueprintHidroExecutivo` | NBR 5626 (água), NBR 8160 (esgoto) |
| Incêndio | `blueprintIncendioClassificacao`, `blueprintIncendioTabelasMG`, `blueprintIncendioExigenciasMG`, `blueprintSaidasIncendio`, `blueprintRedeDeSprinklers`, `blueprintRedeDeHidrantes`, `blueprintExtintores`, `blueprintGeradorPpci` | ITs do CBMMG (Minas Gerais) |
| Climatização | `blueprintClimatizacao` (premissas), `blueprintCargaTermica`, `blueprintVrf`, `blueprintRedeDeAr`, `blueprintClimatizacaoExecutivo` | conforto, clima, insolação |
| Estrutura | `blueprintPilaresAutomaticos`, `blueprintVigasLajesAutomaticas`, `blueprintFundacoesAutomaticas`, `blueprintArmadura`, `rebarEngine` | — |
| Terreno e urbanismo | `blueprintTopografia*`, `blueprintTerreno`, `blueprintLoteamento`, `blueprintVias`, `blueprintZonaUrbanistica`, `blueprintReurb`, `blueprintSigef` | mapa regulatório, REURB, SIGEF |
| Áreas | `blueprintNbr12721` (adaptador para o motor `utils/nbr12721`) | NBR 12721 |

Detalhes que valem para todas:

- **Elétrica — conferidor, não projetista.** `blueprintNbr5410` lê o que foi
  **declarado** (ambiente, tipo de ponto, potência, circuito, tensão) e aponta
  onde fere a norma. Não atribui potência nem escolhe disjuntor: "somar é
  registro, decidir é projeto".
- **Hidráulica — pré-dimensionamento.** Pesos da NBR 5626 e unidades Hunter da
  NBR 8160 dão diâmetro provável, não projeto executivo.
- **Incêndio — preset de Minas Gerais**, conferido contra o texto das ITs do
  CBMMG (IT 01 Anexo A, IT 08, IT 09). Ocupação + altura + área + carga de
  incêndio → medidas de segurança exigidas. Onde o texto não cobre, a decisão é
  explicitada.
- **Climatização** guarda só o que o projetista decide (conforto, cidade/clima,
  insolação); carga térmica, equipamento e rede são derivados. Condições
  externas não declaradas são derivadas da cidade/georreferência.

Cada disciplina tem **pranchas** (`blueprintPrancha<Disciplina>`), **memorial**
(`blueprintMemorial*`, exportável em DOCX), **lista de materiais** e símbolos
próprios.

## Geradores automáticos

| Gerador | Módulo | Worker |
|---|---|---|
| Plantas (layout de unidade) | `blueprintGerador.ts` | `blueprintGerador.worker.ts` |
| Estudo de massa | `blueprintGeradorDeMassa.ts` | `blueprintGeradorDeMassa.worker.ts` (`hooks/useGeradorDeMassa.ts`) |
| Casa automática | `blueprintCasaAutomatica.ts` | `blueprintCasaAutomatica.worker.ts` (`hooks/useCasaAutomatica.ts`) |

Propriedades comuns:

- **Puros e determinísticos**: mesma entrada + mesma semente = mesmo resultado.
  Por isso o hook, sem `Worker` disponível (jsdom, navegador antigo), roda o
  mesmo código no fio principal com resultado idêntico.
- **Web Worker** porque a varredura mede centenas de cenários e a tela precisa
  continuar respondendo.
- **Saída como comandos do kernel**: o gerador produz um lote de comandos
  aplicado de uma vez (`applyBatch`), então desfazer funciona como para qualquer
  edição.

**Estudo de massa**: a partir do lote, da zona e do produto, monta implantações
de uma biblioteca paramétrica (torre única, duas torres, lâmina, blocos
paralelos, L, U, H, embasamento + torre), varre profundidade × comprimento ×
pavimentos × estacionamento com grade exaustiva, refina por recozimento
simulado guiado pela semente, mede cada cenário com a mesma régua do comparador
(`medirCenarioDeMassa`) e devolve a melhor por tipo, segundo o objetivo
escolhido. A geometria usa o maior retângulo inscrito no envelope legal **na
altura do topo** (conservador em lote irregular).

**Casa automática**: terreno + zona do Mapa Regulatório + programa curto → casa
térrea completa. A implantação vem antes do layout: escolhe o retângulo que o
programa pede, limitado pela taxa de ocupação e pelos recuos (e diz qual limite
venceu), em vez de entregar o envelope inteiro — que faria a casa ocupar o lote
todo e estourar a TO.

## Da planta ao orçamento: `blueprintBudget.ts`

O de-para geometria → item de orçamento é onde a planta "passa a valer
dinheiro". Três garantias:

1. **Trava de unidade**: cada medida declara a dimensão que produz (m, m², m³,
   un); mapear para item cuja unidade não bate é **recusado**, não gerado com
   aviso. O erro perigoso é o de-para errado (área de piso para item cotado em
   metro linear), que gera número plausível e errado por fator 4 ou 5.
2. **Procedência**: toda linha leva `calculationMemory` com fórmula, variáveis e
   a versão publicada que a originou.
3. **Reenviar não duplica**: o id de cada linha é determinístico e prefixado
   pelo estudo; regerar a partir de uma versão nova **substitui** as linhas
   daquela planta.

As linhas entram no orçamento em grupo próprio; se a EAP não tiver esse grupo,
o orçamento mostra "itens fantasmas" até a EAP ser reconstruída (ver
[Orçamento e SINAPI](../obras/orcamento-e-sinapi.md)).

## Emissão executiva (ART)

`blueprint*Executivo.ts` (elétrica, hidráulica, incêndio, climatização,
topografia) seguem o mesmo fluxo: **o software não emite projeto — quem emite é
o responsável técnico** com registro no conselho e ART/RRT. O módulo:

1. identifica o responsável;
2. reúne as verificações (ex.: toda regra da Conferência NBR 5410 sem falta, todo
   circuito e quadro pré-dimensionados, nenhum ponto sem potência);
3. só com tudo atendido grava a emissão **imutável**, amarrada ao **hash do
   desenho** (canônico do kernel) e ao **hash das premissas**. Mudou uma tomada
   ou o método de instalação → a emissão deixa de valer e a tela avisa.

## Pranchas

`utils/blueprintPranchas.ts`: template de prancha **da organização** (formato,
escalas, carimbo), plano do conjunto (índice, planta por pavimento, cortes,
elevações, ampliações, tabelas — numeradas) e recorte por pavimento. O conjunto é
**derivado** do modelo publicado + template: um pavimento a mais é uma prancha a
mais. Prancha é saída, não entra no payload do desenho.
