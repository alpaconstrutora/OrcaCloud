# Planta Inteligente → BIM: status e pendências

## Pedido original

> Atualize o status de implementação do plano e pendências

Feito em 09/09/2026 e **atualizado em 13/09/2026** (segundo pedido, mesmas
palavras). Status consolidado do roadmap que nasceu do pedido *"o que falta
implementar para transformar o módulo planta inteligente em um BIM completo"*,
com "BIM completo" definido pelo usuário como: **modelo arquitetônico completo +
interoperar com Revit/Archicad + 4D/5D ligado ao ÒPURA + instalações (MEP)**.

Este documento **não replaneja nada**. Ele diz o que está feito, o que está
provado, e — a parte que mais importa — **o que está feito e ainda não foi
provado**.

## As seis etapas

| # | etapa | situação | onde está o registro |
|---|---|---|---|
| 1 | Identidade de elemento + IFC de coordenação | ✅ | kernel `identity.ts`, `blueprint_objects.element_uid` |
| 2 | Modelo arquitetônico completo | ✅ | telhado, escada, forro/piso, tipos de esquadria, corte, 3D útil |
| 3 | 5D e 4D ligados ao ÒPURA | ✅ | custo por elemento, vínculo com tarefa, outbox, ponte com ferragem |
| 4 | Interoperabilidade Revit/Archicad | ✅ | viewer IFC, importar IFC e DXF, classificação, georreferência |
| 5 | Colaboração e governança | ✅ | comentário ancorado, aprovação, GED e Portal |
| 6 | Instalações (MEP) e clash | ✅ | replanejada e executada em 5 fatias |

**Kernel em `blueprint-kernel-ts-0.27.0`** (era 0.19.0 em 09/09 — oito bumps
em quatro dias, cada um com as goldens provadas neutras na versão ANTIGA antes
de subir). As famílias do modelo continuam 15; o que cresceu foi a SEMÂNTICA
dentro delas.

## O que a Etapa 6 virou, depois de replanejada

O plano antigo pedia **25 dias**; a execução levou **13**, e a diferença não foi
otimismo — foi medição: os 5 dias de "absorver o elétrico" já tinham sido
gastos no arranjo único; o "grafo de trechos" existia como código e nunca
carregara uma rede (zero eletrodutos no banco); o clash não partia do zero
(`sobreposicao.ts` já media interseção volumétrica). Ela terminou com o módulo
elétrico antigo **fora** (5.812 linhas e 11 tabelas), depois de o kernel
ganhar `Quadro`, `Circuito` e o quadro de cargas.

## Depois das seis etapas

| o quê | situação |
|---|---|
| **BCF 2.1 — exportar / importar** | ✅ nos dois sentidos, XSD oficial, guids dentro do IFC |
| **MEP no IFC** | ✅ trechos, terminais, quadro e circuito, `IfcDistributionSystem` por disciplina |
| **Elétrica de verdade — testada à mão (09–10/09)** | ✅ ver a seção abaixo: 22 pedidos/defeitos do usuário, todos publicados |
| **NBR 5410 — distribuição e conferência (10/09)** | ✅ três fatias + interruptor + iluminação mínima + pareamento de comandos |
| **Topografia (10–12/09, sessão paralela)** | ✅ 17 fases publicadas — status próprio em `2026-09-10-planta-inteligente-topografia.md` |

### A elétrica saiu do "nunca usado" (09–10/09/2026)

A maior pendência de 09/09 era *"feito, mas não provado no uso"*. O usuário
usou — e cada relato virou correção, quase sempre no mesmo dia:

| relato do usuário | o que era de verdade | plano |
|---|---|---|
| zoom da roda rolava a página | `onWheel` do React é PASSIVO; listener nativo `{passive:false}` | `…zoom-da-roda-rolava-a-pagina` |
| componentes de rede não selecionáveis | família nova ligada só no desenho — não no clique, laço, Ctrl+A, prévia | `…rede-nao-era-selecionavel` |
| quadro minúsculo; medidas reais em planta e 3D | `larguraMm/alturaMm/profundidadeMm` + giro, cota = CENTRO (IFC) | `…medidas-de-quadro-e-terminal`, `…giro-da-peca-e-bitola-em-planta` |
| "sinto falta de um snap" | motor de encaixe (sobre, meio, interseção, centro, perpendicular, extensão) | `…imã-do-desenho-osnap` |
| ponto fora de circuito sem como ligar | lista dos soltos com select no próprio aviso | — |
| "onde se edita o ponto?" / tudo de elétrica num grupo só | seção Componentes abre para rede; "Quadro de cargas" | `…onde-cada-coisa-se-edita` |
| circuito só aparecia selecionado | "TUG · C1" ao lado de todo ponto; "?" âmbar quando falta | — |
| grupo dos elétricos no painel lateral (3 rodadas) | o caminho da PLANTA BAIXA não estava ligado — só o do 3D | `…taxonomia-do-ponto-eletrico` |
| taxonomia: iluminação / tomadas / dados | `tipoEletrico` fechado (9 → 11 valores), IFC por tipo | idem |
| NBR 5410: linha contínua × pontilhada; trecho automático entre peças | `embutidoNoPiso`, `encaixarEmPecaEletrica` | — |
| potência no círculo, `#2,5`, traços de condutor, letra do comando | `Trecho.circuitoId/condutores`, `Terminal.comando` | — |
| simbologia TUG/TUE por altura | triângulo vazio / meio / cheio / no quadrado | — |
| conexão mantida ao mover | `pontasPresasAsPecas` no `TranslateEntities` | — |
| eletroduto segue parede/teto/piso no 3D | caminho em L (só elétrica — o esgoto com caimento é diagonal de verdade) | — |
| **distribuição automática + N por ambiente/parede** | fatias 1–3 abaixo | `…distribuicao-automatica-de-tomadas-fatia-{1,2,3}` |
| **simbologia de interruptores (print)** | 5 variantes, letras por seção | `…simbologia-de-interruptores` |

### NBR 5410 no módulo (10/09/2026)

| fatia | o que faz | fronteira |
|---|---|---|
| 1 | tipo do ambiente; "N tomadas neste ambiente / nesta parede"; ponto **sugerido** (tracejado; mover confirma; "Aceitar todas") | o sistema **não decide** onde a tomada fica — gera posição provisória e marca |
| 2 | mínimo 9.5.2.2.1 por tipo/perímetro interno/área; "Completar pela norma" só o **déficit**, fora de portas, janelas e das existentes; 2 na altura média da cozinha "sobre a bancada"; **W → VA** | nunca sugere remover; ponto sem tipo não conta, e é dito |
| 3 | painel **Conferência NBR 5410** (9.5.2.1, 9.5.2.2.1, 9.5.2.2.2, 9.5.2.3, 9.5.3.1, 9.5.3.2, 9.5.3.3, sugeridas) com falta / aviso / atende e o que ficou **fora da avaliação**; ponto de **ligação direta** (`IfcJunctionBox.POWER`) com "Converter" | confere o declarado; não atribui potência, não divide circuito, não escolhe disjuntor |
| + | **interruptor** (11º tipo, `IfcSwitchingDevice`), iluminação mínima 9.5.2.1 (luz de teto + interruptor + 100 VA/6 m² + 60 VA/4 m²), Completar cria luz no meio e interruptor junto à porta com a mesma letra | paralelo/intermediário nunca são criados: qual porta faz par é projeto |
| + | **pareamento das letras**: luz "a" exige interruptor "a"; paralelo só aos pares; intermediário exige dois paralelos; Completar escolhe 1/2/3 seções pelas letras | par do paralelo procurado no PAVIMENTO (letra se repete por cômodo — pode deixar passar, nunca inventa falta) |

---

## ⚠️ PENDÊNCIAS — e a distinção que importa

### A. Feito, mas NÃO PROVADO no uso — o que MUDOU

Em 09/09 esta era a maior pendência. Desde então:

- **Elétrica básica** (quadro, circuito, ponto, eletroduto, snap, medidas):
  ✅ **provada pelo usuário à mão** — 22 relatos, todos fechados.
- **NBR 5410 (fatias 1–3, interruptor, pareamento)**: ⚠️ provado por teste,
  por harness **e no editor real** (Playwright com a conta do `.env.local`,
  escritas ao PostgREST abortadas na rede — zero gravação): select de tipo,
  linha da norma, Distribuir/Completar, VA e o painel de conferência aparecem
  e funcionam. **Ainda não usado por uma pessoa.** As perguntas para quem
  usar: a posição sugerida é um ponto de partida útil ou atrapalha? o "faltam
  2 sobre a bancada" faz sentido na cozinha real? o painel de conferência tem
  ruído (avisos demais) ou silêncio (regra que não pegou o que devia)?
- **Topografia**: ✅ 17 fases "provadas de fora e dirigidas em produção com a
  conta de leitura" (registro próprio).

### B. A mão da porta — metade fechada (inalterado)

✅ BIMvision lê `SINGLE_SWING_LEFT/RIGHT`. ⚠️ Não conferido se o nosso `LEFT`
é o da norma — só decide um receptor que desenhe o arco (Revit, criando a
vista de planta à mão). Se estiver espelhado, é uma linha em
`operacaoIfcDaAbertura`.

### C. O BCF num receptor de verdade (inalterado)

Três provas independentes (XSD oficial, guids no IFC, leitor pela
especificação lê o arquivo do buildingSMART). ⏳ Falta "clicar no tópico
destaca a peça" num receptor: **BCFier** (Revit) ou **usBIM**.

### D. Lacunas declaradas, cada uma com o motivo

| o quê | por que ficou de fora |
|---|---|
| ~~Dimensionamento elétrico~~ → **pré-dimensionamento com hipóteses declaradas** | ✅ 13/09 (F1–F5 do plano `2026-09-13-pre-dimensionamento-eletrico-plano.md`): IB, seção mínima (Tab. 36/40/42/47 transcritas do PDF), disjuntor IB ≤ In ≤ Iz, queda de tensão pelos eletrodutos, DR 5.1.3.2.2 — sugere ao lado do declarado, nunca grava. ✅ F6 demanda/alimentador/fases (kernel 0.29.0) e F7 **emissão executiva elétrica com ART** (mesma tabela da topografia com `disciplina`; hipóteses por estudo em `blueprint_study_eletrica`; migration aplicada e conferida). ✅ F8 **prancha "Elétrica"** (PDF 2 páginas / PNG 2 arquivos / DXF camadas `PLANTA-ELETRICA(-TEXTO)`: símbolos NBR 5444 sobre a planta + folha de quadro de cargas, hipóteses e legenda — antes a exportação não levava NENHUM símbolo elétrico) e F9 **ocupação do eletroduto** 6.2.11.1.6 (regra na conferência + linha no painel do trecho; diâmetros de condutor/eletroduto são hipótese, ainda sem edição na tela). Plano fechado |
| **9.1.4.2 (distância do lavatório)**, nota da varanda < 2 m², arandela a ≥ 60 cm do box | o sistema não sabe onde estão lavatório, box e a profundidade útil |
| **Par de paralelo entre pavimentos** (escada de dois andares) | a busca é por pavimento; vira busca no modelo inteiro se pedirem |
| ~~Tipo do ambiente no IFC~~ | ✅ 13/09 — `IfcSpace.ObjectType`, `Pset_SpaceCommon.Reference` e `Pset_OpuraPlanta.SpaceKind/SpaceKindLabel`; ambiente sem tipo não recebe nenhum dos três; lido de volta pelo web-ifc no campo certo |
| **Símbolo do ponto de ligação direta** | quadrado com diagonal é escolha minha, não da NBR 5444 — troco com o print |
| **Conexões MEP** (joelho, tê), registro, ar-condicionado, gás, incêndio | a `disciplina` aceita; entram quando pedirem |
| **Snapshot PNG no tópico BCF** | falta decidir o recorte |
| `IfcDistributionBoard` | só existe no IFC4 ADD2; o `web-ifc` acha e não desserializa — sai como `IfcFlowController` (pai), motivo escrito na cobertura do IFC |
| **Topografia** — água com poropressão por fatia, NBR 11682 por tipo de solo, consulta CREA/CAU | ver o quadro "O que falta" no plano da topografia |

### E. Bugs achados de passagem e fechados

| o quê | como apareceu |
|---|---|
| **91.863.221.361.873 m² construídos** | vi no painel de ambientes ao abrir o editor real; ponta solta no contorno → `tan(90°)`; giro limitado a 160° (`quant-1.10.0`) |
| área/perímetro com ponto ao lado da norma com vírgula | mesmo print |
| campo "N tomadas" não deixava apagar para digitar | teste de componente falhou na 1ª rodada (virava `14`) |
| potência do LD sobre "LD · C1"; haste do interruptor sobre "Int · C1" | screenshots do harness — a contagem de pixels não pegaria |
| interruptor **sem ficha** no inventário | teste da taxonomia (chave sem a variante) |

---

## O que este módulo passou a garantir, e que não garantia

- **Identidade estável**: a mesma parede tem o mesmo `GlobalId` na revisão
  seguinte. Sustenta IFC, BCF, comentário ancorado, 4D e clash.
- **Hash de versão neutro a mudanças de forma**: oito bumps em quatro dias e
  o payload de todo desenho sem os campos novos continuou byte a byte o
  mesmo — provado ANTES de cada bump.
- **Nada que o desenho não saiba é inventado**: cota, bitola, disjuntor,
  seção e potência são declarados; o que falta aparece como faltando — e a
  conferência diz o que ficou **fora da avaliação** em vez de dar "✓" em
  cima de dado ausente.
- **Ajuda ≠ decisão disfarçada**: tudo o que o sistema posiciona nasce
  **sugerido**; mover é o ato de decidir.
- **O que o arquivo NÃO contém está escrito dentro dele** — a cobertura do IFC
  é requisito, não cortesia.

## Verificação

| o quê | 09/09 | 13/09 |
|---|---|---|
| suíte | 3.247 casos | **3.972** casos, 0 falhas |
| publicações em `main` tocando a planta | 80 desde 07/09 | **83** commits desde 07/09 só em `components/blueprint` + `utils/blueprint*` (topografia e elétrica somadas) |
| kernel | 0.17.0 → 0.19.0 | 0.19.0 → **0.27.0** |
| política de quantidades | quant-1.8.0 | **quant-1.10.0** |
| verificação em tela | harness | harness **+ editor real** com escritas bloqueadas |
