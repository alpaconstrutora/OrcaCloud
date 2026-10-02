# Estudo de Massa na Planta Inteligente

## Pedido original

> Sessão `7d36268b-706c-4d3b-88be-a497b0027413` · 01/10/2026 · Claude Code (VS Code), plan mode.
> Transcrição literal; o bloco abaixo foi colado pelo usuário.

avalie essa nova funcionalidde para incluirmos em incorporação > Planta Inteligente:

```text
Estudo de Massa deve entrar na Planta Inteligente do ÒPURA como uma funcionalidade própria, idealmente antes da geração automática da planta baixa.
A lógica é: antes de desenhar apartamentos, cômodos e circulações, o sistema precisa descobrir o que cabe legal, física e economicamente no terreno.
Nova funcionalidade — Estudo de Massa
1. Objetivo
Gerar automaticamente alternativas de implantação e volumetria a partir de:
- terreno;
- legislação urbanística;
- programa desejado;
- tipologia do empreendimento;
- restrições físicas;
- requisitos de estacionamento;
- parâmetros econômicos;
- critérios definidos pelo usuário.
O resultado deve ser um conjunto de cenários comparáveis de ocupação do terreno.
2. Dados de entrada
Terreno
- geometria do lote;
- área;
- testada;
- profundidade;
- orientação;
- norte;
- esquinas;
- número de frentes;
- confrontantes;
- curvas de nível;
- declividade;
- cotas;
- acessos existentes;
- edificações existentes;
- árvores;
- cursos d'água;
- APP;
- servidões;
- faixas não edificáveis;
- redes de infraestrutura;
- coordenadas geográficas.
Idealmente permitir:
- desenho manual;
- importação DXF/DWG;
- importação IFC;
- KML/KMZ;
- SHP/GeoJSON;
- levantamento topográfico;
- obtenção do lote por mapa/georreferenciamento.
3. Parâmetros urbanísticos
Criar uma camada chamada Envelope Legal.
O usuário informa ou o sistema busca:
- zoneamento;
- uso permitido;
- coeficiente de aproveitamento;
- taxa de ocupação;
- taxa de permeabilidade;
- gabarito;
- altura máxima;
- número máximo de pavimentos;
- recuo frontal;
- recuos laterais;
- recuo de fundos;
- afastamentos progressivos;
- área mínima do lote;
- testada mínima;
- limite de densidade;
- exigência de vagas;
- regras para subsolo;
- regras para cobertura;
- pilotis;
- embasamento;
- marquises;
- balanços;
- áreas computáveis;
- áreas não computáveis;
- incentivos urbanísticos;
- outorga onerosa;
- potencial construtivo adicional.
Resultado automático
O sistema gera:
Terreno → área edificável → envelope máximo permitido.
Visualmente isso deve aparecer em 2D e 3D.
4. Gerador de envelope construtivo
Essa deve ser uma das principais ferramentas.
O motor:
1. lê os limites do terreno;
2. aplica os recuos;
3. aplica restrições;
4. calcula o polígono edificável;
5. extruda esse polígono;
6. aplica limite de altura;
7. aplica CA e TO;
8. determina o volume máximo legal.
Exemplo:
Terreno: 1.200 m²
TO: 60%
CA: 3,0
Gabarito: 8 pavimentos

O sistema calcula imediatamente:
- implantação máxima: 720 m²;
- área computável máxima: 3.600 m²;
- altura máxima;
- pavimentos possíveis;
- envelope legal.
5. Programa do empreendimento
Depois do envelope, o usuário define o que pretende construir.
Exemplos:
Residencial
- apartamentos;
- studios;
- unidades de 1 dormitório;
- unidades de 2 dormitórios;
- unidades de 3 dormitórios;
- coberturas.
Comercial
- lojas;
- salas comerciais;
- escritórios;
- coworking.
Industrial
- galpões;
- docas;
- pátios;
- escritórios;
- áreas técnicas.
Uso misto
Exemplo:
- térreo comercial;
- estacionamento;
- pavimentos residenciais.
6. Programa por metas
O usuário pode determinar:
Quero 40 apartamentos de aproximadamente 65 m².

ou:
Quero maximizar a área vendável.

ou:
Quero maximizar o número de unidades.

ou ainda:
Quero apartamentos entre 55 e 70 m², com duas vagas para unidades maiores.

O sistema deve procurar automaticamente configurações possíveis.
7. Gerador automático de volumetria
O ÒPURA começa a gerar alternativas.
Exemplo:
Cenário A
Torre única.
- 10 pavimentos;
- 4 unidades/pavimento;
- 40 apartamentos.
Cenário B
Duas torres.
- 6 pavimentos;
- 3 unidades por torre/pavimento;
- 36 apartamentos.
Cenário C
Bloco longitudinal.
- 8 pavimentos;
- 5 unidades/pavimento;
- 40 apartamentos.
Esses cenários devem ser gerados parametricamente.
8. Tipologias de implantação
Criaria inicialmente uma biblioteca:
- torre isolada;
- torre central;
- torre lateral;
- bloco linear;
- bloco em L;
- bloco em U;
- bloco em H;
- pátio central;
- duas torres;
- múltiplos blocos;
- embasamento + torre;
- podium + torre;
- uso misto;
- condomínio horizontal;
- casas geminadas;
- loteamento;
- galpão;
- complexo industrial.
Depois o sistema pode criar geometrias livres.
9. Núcleo vertical automático
Para edifícios, gerar automaticamente:
- escadas;
- elevadores;
- hall;
- shafts;
- circulação;
- antecâmara;
- escada pressurizada;
- áreas técnicas.
O sistema deve reservar essas áreas antes de calcular a área comercializável.
Isso evita um erro comum em estudos preliminares: considerar toda a área do pavimento como aproveitável.
10. Estacionamento automático
Essa funcionalidade deve ser integrada ao estudo de massa.
Gerar:
- vagas;
- circulação;
- corredores;
- rampas;
- acessos;
- vagas PCD;
- motos;
- bicicletas;
- carga e descarga.
O algoritmo deve testar:
- térreo;
- subsolo;
- dois subsolos;
- pilotis;
- edifício garagem.
E calcular:
eficiência de estacionamento = área de garagem / número de vagas.
11. Análise solar
Para cada estudo:
- orientação solar;
- insolação;
- horas de sol;
- sombreamento;
- fachadas críticas;
- sombra projetada no terreno;
- sombra sobre vizinhos.
Também pode indicar:
- melhores fachadas para dormitórios;
- exposição oeste;
- unidades com maior insolação.
12. Ventilação e orientação
Avaliar:
- orientação predominante;
- fachadas disponíveis;
- ventilação cruzada potencial;
- unidades com apenas uma orientação;
- unidades de canto;
- profundidade do edifício.
13. Análise da vista
Funcionalidade mais avançada, mas importante.
Calcular:
- unidades com vista frontal;
- vista lateral;
- vista bloqueada;
- vista permanente;
- vista potencialmente bloqueável.
Isso poderá posteriormente conversar diretamente com o módulo de precificação imobiliária do ÒPURA.
14. Indicadores do estudo de massa
Cada cenário deve gerar automaticamente um dashboard.
Urbanísticos
- área terreno;
- área ocupada;
- TO utilizada;
- TO permitida;
- CA utilizado;
- CA permitido;
- área computável;
- área não computável;
- área permeável;
- altura;
- número de pavimentos.
Produto imobiliário
- número de unidades;
- área privativa média;
- área privativa total;
- área comum;
- área construída;
- vagas;
- lojas;
- salas;
- depósitos.
15. Indicadores de eficiência
Aqui está uma parte muito importante.
Eficiência do pavimento
Área privativa / área total do pavimento
Exemplo:
82%

Eficiência global
Área vendável / área construída
Área comum por unidade
Área comum / quantidade de unidades
Índice de garagem
m² garagem / vaga
Aproveitamento do potencial
Área computável utilizada / potencial máximo permitido
16. Indicadores financeiros
O Estudo de Massa deveria conversar diretamente com o módulo de Viabilidade Econômica / Incorporação.
Exemplo:
Indicador	Resultado
Área construída	7.850 m²
Área vendável	5.920 m²
Unidades	72
VGV	R$ 39,5 mi
Custo estimado	R$ 24,2 mi
Margem	27%
Resultado estimado	R$ 10,7 mi


Assim o sistema não escolhe apenas:
"qual geometria cabe?"

Mas:
"qual configuração produz o melhor empreendimento?"

17. Comparador de cenários
Uma tela essencial.
	Cenário A	Cenário B	Cenário C
Pavimentos	10	8	12
Unidades	40	44	48
Área vendável	3.120	3.350	3.510 m²
Eficiência	78%	82%	79%
Vagas	48	52	56
VGV	R$ 25M	R$ 27M	R$ 28M
Custo	R$ 16M	R$ 17M	R$ 19M


A comparação não deveria produzir um "vencedor" automaticamente sem critérios definidos pelo usuário. O sistema pode destacar:
- maior VGV;
- menor custo;
- maior eficiência;
- maior número de unidades;
- melhor relação VGV/custo;
- menor complexidade construtiva.
18. Otimizador
Eu colocaria uma função:
Otimizar empreendimento
O usuário seleciona o objetivo:
- maximizar VGV;
- maximizar lucro;
- maximizar área vendável;
- maximizar unidades;
- minimizar custo;
- minimizar área comum;
- minimizar estacionamento;
- maximizar eficiência;
- maximizar exposição solar;
- combinar critérios.
Exemplo:
Maximizar margem mantendo apartamentos entre 60–70 m² e pelo menos 1,5 vaga/unidade.

Isso transforma o Estudo de Massa em um verdadeiro problema de otimização paramétrica.
19. Integração com a Planta Inteligente
Eu organizaria o fluxo desta maneira:
Terreno
→ Legislação
→ Envelope legal
→ Estudo de Massa
→ Programa
→ Implantação
→ Núcleos
→ Pavimentos
→ Unidades
→ Planta Inteligente
→ Viabilidade
→ BIM
Essa separação é importante.
A Planta Inteligente não deveria começar tentando desenhar apartamentos. Primeiro ela deveria resolver o empreendimento em escala urbana e volumétrica.
20. Geração automática da planta a partir da massa
Depois que o usuário escolhe uma massa:
"Gerar planta"

O sistema transfere automaticamente para o gerador:
- polígono do pavimento;
- núcleo;
- fachadas;
- shafts;
- circulação;
- número de unidades;
- área-alvo;
- orientação;
- restrições.
E começa a gerar as plantas dos apartamentos.
21. Estudo paramétrico
Um recurso extremamente útil:
Usuário altera:
Apartamento médio
65 m² → 72 m²

O ÒPURA recalcula instantaneamente:
- unidades/pavimento;
- unidades totais;
- área vendável;
- vagas necessárias;
- VGV;
- custo;
- eficiência.
Ou:
Recuo lateral
2 m → 3 m

Toda a massa é regenerada.
22. Histórico de versões
Cada estudo deve poder ser salvo.
Exemplo:
EM-001 — 8 pavimentos / 32 unidades
EM-002 — 10 pavimentos / 40 unidades
EM-003 — 12 pavimentos / 48 unidades
Registrar:
- parâmetros;
- geometria;
- legislação usada;
- indicadores;
- data;
- responsável.
23. IA no Estudo de Massa
A IA pode interpretar comandos como:
"Faça um residencial de padrão médio com apartamentos entre 65 e 75 m², duas unidades de canto por pavimento e no mínimo uma vaga por apartamento."

O sistema converte isso em parâmetros e começa a gerar soluções.
Outra possibilidade:
"Tente reduzir área comum."

ou:
"Faça outra opção com duas torres."

24. MVP recomendado
Eu não começaria pelo motor generativo completo, porque pode criar uma complexidade geométrica excessiva logo no início.
MVP 1 — Envelope
- cadastro/importação do terreno;
- desenho do lote;
- recuos;
- TO;
- CA;
- gabarito;
- envelope 3D;
- área máxima edificável.
MVP 2 — Massa
- criação de blocos;
- número de pavimentos;
- área por pavimento;
- núcleo;
- área vendável estimada;
- indicadores.
MVP 3 — Produto
- número de unidades;
- área média;
- unidades/pavimento;
- vagas;
- área comum;
- estacionamento.
MVP 4 — Cenários
- duplicar cenário;
- alterar parâmetros;
- comparar cenários;
- indicadores urbanísticos e imobiliários.
MVP 5 — Gerativo
- geração automática de alternativas;
- otimização;
- múltiplas tipologias;
- ranking por métricas escolhidas pelo usuário.
MVP 6 — Integração completa
Estudo de Massa → Planta Inteligente → BIM → Orçamento → Viabilidade.
Uma decisão de arquitetura que eu considero importante
Eu não trataria Estudo de Massa apenas como mais uma ferramenta dentro do editor de planta.
Criaria um motor próprio de desenvolvimento imobiliário paramétrico, algo como:
ÒPURA Planta Inteligente — Massing Engine

Esse motor alimentaria posteriormente:
Estudo de Massa → Planta Inteligente → Precificação → Viabilidade → Orçamento → Cronograma → BIM
Isso aumenta bastante o potencial da Planta Inteligente: ela deixa de ser somente um sistema que desenha plantas e passa a ajudar a conceber e testar o empreendimento desde o terreno.
```

## Contexto

O usuário colou um PRD de "Estudo de Massa" (24 seções + MVP 1–6) e pediu avaliação para
incluí-lo em **Incorporação › Planta Inteligente**. A ideia central: antes de desenhar
cômodos, resolver o empreendimento em escala urbana e volumétrica (terreno → envelope legal
→ massa → programa → cenários comparáveis com VGV/custo → planta).

**Fato que muda a leitura do PRD:** o menu Incorporação **já tem um item chamado "Estudo de
Massa"** (`components/Layout.tsx:1144`, `id='planta-ai'`). É o módulo **Planta AI v1**
(`plant_*`, `services/plantaAiEngine.ts`, 212 linhas): terreno como retângulo
(`frontage × depth`), 3 cenários por multiplicador fixo (0,8/1,0/1,3), um retângulo escalado
no 2D/3D, VGV e custo **mockados** (R$ 12.000 e R$ 4.500/m² hard-coded). Já tem ponte com
Empreendimento (`plantaEmpreendimentoSync`) e Imovib (`plantaAiIntegration`). A decisão
DR-01 de 06/08/2026 ("coexistência: `plant_*` segue como gerador de massa") foi tomada
**antes** de a Planta Inteligente ganhar envelope poligonal, pavimento tipo, unidade, núcleo,
vagas, insolação, avaliação e alternativas (roadmap E0–E11, 18–20/09/2026). Hoje o kernel
poligonal já ultrapassou o Planta AI em tudo, menos em "bloco/torre como objeto" e em
"cenário com VGV".

Leitura feita em `origin/main` (`04864ac6`, 01/10/2026, kernel `0.89.0`) — o checkout de
integração está 220 commits atrás e não foi usado como fonte.

## Decisões tomadas com o usuário (01/10/2026, plan mode)

| Pergunta | Resposta |
|---|---|
| Onde construir | **Na Planta Inteligente**: família `Bloco` no kernel + motor puro `blueprintMassa`; Planta AI v1 vira legado |
| Escopo | **Roadmap completo M1–M6, fase a fase**, mesmo ritual do roadmap E0–E11 |
| Financeiro | **Hipóteses no estudo** (preço/m² por tipologia, custo/m² por padrão com CUB como default) + cenário → **Empreendimento** (motor `services/sync/`) → Imovib pelo caminho já existente |
| Planta AI v1 | **Sai do menu já em M1**. A rota `planta-ai` e as pontes (`planta_ai_study_id`, `planta_ai_scenario_id`, `EstudoTorresUnidades`, `SyncCenterTab`) continuam existindo e alcançáveis por link interno; só o item de menu some e "Estudo de Massa" passa a abrir a Planta Inteligente |

## Avaliação: o que o PRD pede × o que já existe

| § do PRD | Estado | Onde (verificado em origin/main) |
|---|---|---|
| 2 Terreno (geometria, área, testada, confrontantes, norte, declividade, curvas, APP/servidão/faixas, DXF/DWG/KML/SHP/GeoJSON/levantamento, georreferência) | ✅ quase tudo | `utils/blueprintTerreno.ts` (anel, papéis, quadro de divisas, `faixasRestritas`), `Boundary.restricao` (APP / CURSO_DAGUA / SERVIDAO / NAO_EDIFICAVEL), `utils/blueprintTopografia*.ts`, `utils/geo`, importadores da aba Terreno. Falta como família: edificação existente, árvore, rede de infraestrutura (hoje caberiam em `SubRegiao`). Lote por mapa com tiles: fora por licença (E-12). |
| 3 Envelope Legal (zoneamento, CA, TO, permeabilidade, gabarito, recuos, afastamento progressivo, testada/área mínima, vagas) | ✅ | `utils/blueprintZonaUrbanistica.ts` (15 campos, `lerZona`, `recuosEfetivos`, `conferirLote`), Mapa Regulatório (catálogo por cidade + cópia por empreendimento), `blueprint_study_urban_context` (zona escolhida por estudo + vocabulário manual), `hooks/useBlueprintZonaUrbanistica.ts`. **Falta**: outorga onerosa / potencial adicional, áreas computáveis × não computáveis, regras de subsolo/cobertura/pilotis/embasamento/balanço, densidade. |
| 4 Gerador de envelope (polígono → recuos → extrusão → gabarito → CA/TO → volume máximo) | ✅ | `envelopeConstrutivo` (lote de qualquer forma, mitra, faixas, peças), `utils/blueprintEnvelope3d.ts › envelopeVertical` (prisma por pavimento, afastamento progressivo, gabarito em altura e pavimentos, `volumeMaxM3`, `areaMaxM2`, "cabe?"), prisma translúcido no `Blueprint3DViewer`. ⚠️ `calcularAproveitamento` (`blueprintTerreno.ts:426`) ainda usa a **mesma área para TO e CA** — limitação declarada ("um nível por vez"). O CA real (Σ pavimentos) é a primeira conta do estudo de massa. |
| 5–6 Programa do empreendimento / por metas | parcial | Planta AI: `PlantBriefing` (tipo, padrão, objetivo, tipologias, área alvo, un/pav, pavimentos, vagas/un) — só campos. Planta Inteligente: `Programa` (E4.1) é de **ambientes**, não de unidades/torres. **Não existe "programa de produto"** (mix de tipologias × quantidades × metas) no kernel poligonal. |
| 7–8 Gerador de volumetria / biblioteca de implantações | ❌ | Planta AI desenha UM retângulo escalado; nada de duas torres, L/U/H, podium. Planta Inteligente: **nenhuma família de massa** (`model.ts` tem Level, Wall, Boundary, Space, Unidade, Grupo, Nucleo, Vaga, Quadra, Lote, Via… — sem Bloco/Torre). O gerador E6.2 (`blueprintGerador.ts`) é de cômodos num pavimento, mas o PADRÃO dele (PRNG semeado, recozimento, `frenteDePareto`, Worker, `useGerador`) é reaproveitável. **É o núcleo novo.** |
| 9 Núcleo vertical automático | parcial | Kernel: `Nucleo` (SHAFT/ELEVADOR, `FICHA_DO_ELEVADOR` NBR NM 207/5665, fura laje, clash), `Escada.ateLevelId`. Falta o **dimensionamento** (quantos elevadores/escadas para N pavimentos × unidades, antecâmara/pressurizada por altura) e a **reserva de área antes da vendável**. |
| 10 Estacionamento automático | ✅ grande parte | `utils/blueprintVagasAutomaticas.ts` (fileiras + circulação, PCD/idoso/moto, 90°/45°/paralela, obstáculos, exigência da zona × unidades, `resumoDe`). Falta: rampas/acessos, testar térreo × subsolo × pilotis × edifício-garagem como alternativas, m²/vaga como indicador exposto. |
| 11 Análise solar | ✅ | `utils/blueprintInsolacao.ts` (`posicaoSolar`, horas por fachada, `prismasDoEntorno`, `sombreado`, sol no 3D). Falta: sombra do **próprio bloco** sobre lote/vizinhos como número (hoje só visual) e "fachadas críticas" por bloco. |
| 12 Ventilação / orientação | ✅ (ambiente) | `ventilacaoCruzada`, fachadas com azimute no grafo (E4.2). Para massa é trivial sobre o polígono do bloco. |
| 13 Vista | ❌ | Nada. Hedônico (vista/andar) só na Imovib (`pricingService.calculateHedonicPrices`). Fora deste plano. |
| 14–15 Indicadores urbanísticos / produto / eficiência | parcial | `Aproveitamento`, `quadroDeUnidades` (privativa NBR 12721, comum, fração ideal — exige paredes), `quadroDeSubRegioes` (permeabilidade), `resumoDeVagas`. Faltam os mesmos indicadores **por cenário de massa, sem paredes**. |
| 16 Indicadores financeiros | ✅ Imovib / ❌ no estudo | Imovib calcula VGV, custo, margem, fluxo. Planta AI usa mock. Falta: hipóteses do estudo (preço/m² por tipologia, custo/m² por padrão via CUB) e a ponte cenário → Empreendimento → Imovib. |
| 17 Comparador | parcial | Alternativas = ramos (`blueprint_branches`, E6.1) com comparação **2 a 2** + indicadores E5.2. Falta N colunas com indicadores de massa + destaques por critério. |
| 18 Otimizador | ❌ | `main_objective` do Planta AI é só campo. Padrão de otimização existe (E6.2). |
| 19–20 Integração / "Gerar planta" | parcial | `blueprintGerador.gerar` já recebe `envelope: Point[]` + programa + frente + norte; Pavimento tipo (E2.1), Unidade (E2.2), Grupo espelhado (E2.3) são o caminho até a torre. Falta a cola massa → pavimentos → unidades. |
| 21 Paramétrico instantâneo | ✅ por construção | Tudo no kernel é derivado e determinístico. |
| 22 Histórico | ✅ | Snapshots/publicação, ramos, `diffSnapshots`. |
| 23 IA | ✅ molde | E6.4: `utils/blueprintIa.ts` (pedido → mudança de parâmetros → regenerar → delta) + Edge `planta-ia`. |
| 24 MVP 1 (Envelope) | ✅ **já entregue** | E3.1 + E3.3 (19/09/2026). |

**Resumo:** MVP 1 está pronto; ~60 % dos blocos de MVP 2–6 existem como motores puros
reutilizáveis. O que é genuinamente novo: (a) a **família `Bloco`** no kernel, (b) o
**programa de produto** (tipologias × metas), (c) o **motor de massa** (indicadores sem
paredes + gerador de implantações + otimizador), (d) o **comparador N × indicadores com
financeiro real**, (e) a cola **massa → pavimentos/unidades → planta → Empreendimento**.

## Decisão de arquitetura (recomendada)

**Construir o Estudo de Massa dentro do kernel da Planta Inteligente (`blueprint_*`),
como um "Massing Engine" puro em `utils/`, e aposentar gradualmente o Planta AI v1.**

Por quê, e não "evoluir o Planta AI":
- O Planta AI é retângulo-only, `plant_scenarios` não está versionado no repo (schema
  drift), VGV/custo são mock, e a representação `{x,y,width,height}` é mão única.
- A Planta Inteligente já tem lote poligonal, envelope por pavimento, zona por estudo,
  núcleo, vagas, insolação, alternativas (ramos), versões, IA, 3D, DXF/IFC. Cada peça
  que o PRD pede e já existe é reutilizada **sem segundo motor**.
- O PRD mesmo pede: "a Planta Inteligente não deveria começar desenhando apartamentos" —
  a massa vira a **primeira camada** do mesmo estudo, e "Gerar planta" é um comando no
  mesmo modelo (sem exportar/importar entre módulos).
- O item de menu "Estudo de Massa" já aponta para Incorporação; muda só o destino.

Princípios que valem para todas as fases (os mesmos do roadmap E0–E11):
- Motor **puro** em `utils/blueprintMassa*.ts`, testável sem DOM; a UI só chama.
- `Bloco` é família do payload canônico (bump + goldens, ritual de
  `__tests__/blueprintKernelGoldens.test.ts`); produto e hipóteses financeiras ficam
  **fora do payload** (tabela por estudo, molde `blueprint_programs` + `useBlueprintPrograma`).
- Indicadores **derivados, nunca gravados**; o que falta dado fica `null` com motivo
  (molde `blueprintAvaliacao`), nunca 0 em silêncio; "acusa, não trava".
- Cenário = ramo (`blueprint_branches`); nada de tabela paralela de cenários.
- Financeiro: hipóteses declaradas no estudo → **nunca mock**; a Imovib continua sendo o
  lugar do fluxo de caixa/TIR — o estudo manda estrutura, não preço (regra já vigente
  nos syncs: "VGV/custo/status nunca voltam").
- Controle novo vai para o ribbon (aba Terreno › grupo **Massa**, ou aba nova "Massa"),
  tarefa em drawer (`Sheet`), tabela em drawer, relatório em dock — nunca tela cheia.
- Migration nova: sem FK para `organizations`/tabela quente (40P01), `REVOKE … FROM
  PUBLIC, anon, authenticated` explícito, teste `segurancaMigrations`.

## Plano por fases (M = Massa)

### M0 — Plano e frente
- `docs/planos/2026-10-01-estudo-de-massa.md` com o pedido literal, esta avaliação e as
  decisões abaixo; frente `estudo-de-massa` de `origin/main`.
- **Pronto quando**: arquivo commitado na frente; `git rev-list --count HEAD..origin/main` = 0.

### M1 — Família `Bloco` + indicadores urbanísticos (MVP 2) · bump 0.89 → 0.90
- **Kernel** (`utils/blueprintKernel/model.ts`, `commands`, `canonical.ts`, `units.ts`):
  `Bloco {id, uid, nome, anel: Point[], cotaBaseMm, pavimentos, peDireitoMm, uso:
  RESIDENCIAL | COMERCIAL | GARAGEM | SERVICO | LAZER | TECNICO, subsolo?: boolean,
  cor?}`. Fora do arranjo planar (como `Vaga`/`Nucleo`). Comandos `AddBloco`,
  `SetBlocoProps`, `MoveBlocoVertex`, `DeleteBloco`; `TranslateEntities` passa a aceitar
  bloco; canônico `blocos` omitido sem bloco; prefixo de rótulo `M`. Podium + torre =
  dois blocos empilhados (`cotaBaseMm` da torre = topo do podium). Subsolo = bloco com
  `cotaBaseMm < 0` (não conta no gabarito — mesma regra do `envelopeVertical`).
- **Motor** `utils/blueprintMassa.ts` (puro): `medirMassa(model, terreno, limites, zona,
  hipoteses)` → por bloco (projeção, área construída Σ pav, altura, topo, pavimentos
  acima do gabarito, "cabe no envelope?" por pavimento reusando `recuosEfetivos` +
  `envelopeConstrutivo` na altura do topo de cada pavimento — mesma conta de
  `envelopeVertical`, extraída para função comum `anelDoEnvelopeNaAltura`) e totais
  (área ocupada = união das projeções dos blocos acima do solo; TO usada × máx; CA usado
  × máx com **área computável** = construída − não computável por uso/hipótese
  (garagem, subsolo, técnico, % de varanda); permeável via `quadroDeSubRegioes`; altura
  máxima; aproveitamento do potencial = computável / (CA máx × lote)).
- **Corrigir** `calcularAproveitamento` para somar pavimentos desenhados + blocos
  (tira a limitação declarada no comentário).
- **Canvas 2D**: polígono do bloco hachurado + rótulo "Torre A · 10 pav · 42,0 m";
  seleção pela caixa; ferramenta `bloco` (retângulo por dois cantos ou polígono, como
  `nucleo`/`sub-regiao`). **3D** (`Blueprint3DViewer.tsx`): um prisma sólido por
  pavimento do bloco (molde dos prismas do envelope E3.3), vermelho acima do gabarito;
  toggle "Blocos de massa" no Exibir.
- **UI**: aba Terreno › grupo **Massa** (Bloco, Estudo de massa); `PainelBlocoSelecionado`
  (nome, pavimentos, pé-direito, uso, cota base, área/altura derivadas); drawer **Estudo
  de massa** (`PainelEstudoDeMassa.tsx`, molde `PainelVagas`) com os indicadores
  urbanísticos do §14 em cartões + tabela por bloco, cada número com a origem (zona ×
  desenhado) e "não avaliado: falta X".
- **Regras** (E3.2): variáveis de EDIFICACAO `ca_usado`, `to_usada`, `area_computavel`,
  `altura_maxima_desenhada` passam a considerar blocos; semente "Massa dentro do envelope
  e do gabarito" (fonte Zona).
- **Menu (decisão do usuário: já em M1)** — `components/Layout.tsx`: o `DropdownItem
  id="planta-ai" label="Estudo de Massa"` (:1144) e o `NavItem id="planta-ai"` (:1328)
  saem; entra `DropdownItem id="blueprint" label="Estudo de Massa"` apontando para a
  Planta Inteligente (ou o item "Planta Inteligente" ganha o subtítulo — um item só, sem
  dois destinos para o mesmo módulo); `hasActiveChild` e `commandItems` acompanham.
  `AppRouter` **mantém** `case 'planta-ai'` (links internos do Empreendimento continuam
  funcionando); a permissão `canViewPlantaAi` (`OrganizationUsers.tsx:412`) muda o rótulo
  para "Estudo de Massa (Planta AI, legado)". Ao abrir a Planta Inteligente por esse item,
  a aba preferida do ribbon é **Terreno** (`abaEfetiva`, preferência passada por prop).
  Registrar como **DR-05** no plano (supera o alcance da DR-01 de 06/08/2026).
- **Testes**: `__tests__/blueprintMassa.test.ts` (lote 30 × 40 = 1.200 m², TO 60 %,
  CA 3, gabarito 8: bloco 20 × 36 × 10 pav → TO 60 %, CA 6,0 (acima), 2 pav acima do
  gabarito; podium + torre; subsolo fora do gabarito; servidão corta), goldens
  recapturados, teste de editor "M1".
- **Pronto quando**: tsc 0, `check-ui-standard.sh` nos .tsx tocados, suíte cheia com a
  conta fechando (JSON), build OK, harness sem login `docs/spikes/massa/medir.mjs` com
  portão (pixels do bloco no canvas + controle vazio), prova no app real com estudo
  descartável (autosave da Planta não respeita bloqueio por `ctx.route`); no app real,
  o menu Incorporação mostra UM "Estudo de Massa" que abre a Planta Inteligente, e a
  rota `planta-ai` ainda abre por link interno do Empreendimento.

### M2 — Produto e eficiência (MVP 3)
- **Fora do payload**: tabela `blueprint_study_produto` (migration `aplicar_2027…`,
  `UNIQUE study_id`, FK composta ao estudo, RLS `is_org_member`, REVOKE explícito) com
  `produto jsonb`; `services/blueprintProdutoService.ts` + `hooks/useBlueprintProduto.ts`
  (molde `blueprintProgramService`/`useBlueprintPrograma`: estado na hora, gravação com
  respiro, degrada para a sessão).
- **`utils/blueprintProduto.ts`** (puro): `Produto {padrao (CUB: R1/R8/R16/PP/CSL/…),
  tipologias: [{nome, dormitorios, areaPrivativaAlvo, min, max, vagasPorUnidade,
  proporcao | quantidade}], metas: {unidades?, areaVendavel?, objetivo}, hipoteses:
  {eficienciaPavimento %, nucleoM2Base, nucleoM2PorPav, circulacaoPct, areaComumTerreo,
  naoComputavelPorUso}}`; sementes (residencial econômico/médio/alto, comercial, misto).
- **`blueprintMassa.ts`**: `distribuirProduto(massa, produto, nucleosReais)` → por
  bloco/pavimento: área útil = pavimento − núcleo (o `Nucleo` desenhado vence a
  hipótese) − circulação; unidades/pav por tipologia (mix pela proporção; `floor`, nunca
  `round`); unidades totais; privativa total; vendável; comum; **eficiência do pavimento
  e global, área comum/unidade, índice de garagem (m²/vaga), aproveitamento do
  potencial** (§15); vagas exigidas (zona `vagas_por_unidade` × unidades, ou por
  tipologia) × vagas que cabem (`planejarVagas` sobre o anel do bloco GARAGEM / subsolo,
  com pilares como obstáculo quando houver) → "faltam N vagas / N m² de garagem".
- **Núcleo automático (hipótese declarada)**: `nucleoSugerido(pavimentos, unidadesPorPav,
  altura)` → nº de elevadores (ficha `FICHA_DO_ELEVADOR`), escada (enclausurada acima
  de 12 m / pressurizada acima do limite da IT local — ler o que `blueprintSaidasIncendio`
  já tem), hall, shafts → m² reservado por pavimento. Botão "Lançar núcleo" cria
  `Nucleo`/`Escada` reais no centro do bloco (ou lateral), que a conta passa a ler.
- **UI**: drawer **Produto** (tabela editável de tipologias, molde `TelaPrograma` /
  `StandardTable`; metas; padrão; hipóteses) e os cartões de produto + eficiência no
  drawer Estudo de massa.
- **Testes**: `blueprintProduto.test.ts` (mix 40 un ≈ 65 m², eficiência 82 %, vagas
  1,5/un → 60 exigidas, garagem 20 × 36 cabe 28 → faltam 32), editor "M2".
- **Pronto quando**: mesmo ritual de M1 + migration aplicada por `db query -f` e
  conferida com `information_schema.role_table_grants`.

### M3 — Financeiro e ponte com Empreendimento/Imovib (§16)
- **Hipóteses financeiras** no mesmo `produto jsonb` (ou coluna `financeiro jsonb`):
  preço/m² por tipologia, custo/m² de construção por padrão, custo por m² de
  garagem/subsolo, custo do terreno, % despesas (comerciais, incorporação, projetos).
  **CUB**: não existe função pura `custoM2(padrão, UF)`; `services/parametricService.ts ›
  calculateTotalEstimatedValueAsync(settings)` lê `cub_parametric_data` (UF, mês, desoneração,
  coluna do padrão) com fallback `BASE_CUB_RATES[UF] × CUB_STANDARDS_DATA[padrão].multiplier`
  (`constants.ts:32/:63`). Extrair dali um helper `cubPorPadraoAsync(uf, padrao, mes)` e um
  fallback puro, reusados pelo estudo (default = UF da georreferência/empreendimento, dito
  como suposição; o usuário sobrescreve).
- **Leitura prévia obrigatória**: `MAPA_DADOS_EMP_PLANTA_VIABILIDADE.md` (16/07/2026) compara
  campo a campo Empreendimento × Planta IA × Imovib — é o de-para desta ponte.
- **`blueprintMassa.ts › financeiro(distribuicao, hipoteses)`** → VGV, custo de obra
  (construída × custo/m² por uso), custo total, margem, resultado (§16). Sem fluxo de
  caixa/TIR aqui — isso é Imovib.
- **Ponte** cenário → Empreendimento: adapter `services/sync/massaAdapter.ts` sobre o
  motor `services/sync/` já existente (molde `services/sync/blueprintAdapter.ts` do
  loteamento B3): bloco → `empreendimento_towers` (floors_count, units_per_floor,
  construction_cost_sqm, sales_price_sqm como semente), tipologia × pavimento →
  `empreendimento_units` placeholders (ou `empreendimento_floors` templates +
  `generateUnitsFromFloors`), por `uid` do bloco; `origin` novo no CHECK de
  `empreendimento_field_proposals` e em `EmpreendimentoAuditSource`; `TOWER_COLS` /
  `UNIT_COLS` ganham a coluna de proveniência `blueprint_bloco_uid`. Daí a Imovib recebe
  pelo caminho já existente (Empreendimento ↔ Imovib). Botão "Enviar para
  Empreendimento" no drawer, com prévia (molde `SyncFromStudyModal`/`WriteBackPreviewSheet`).
- **Pronto quando**: `syncToEmpreendimento` idempotente (2ª rodada = 0 mudanças) provado
  no app real; migrations de CHECK aplicadas; teste de adapter.

### M4 — Cenários e comparador (MVP 4, §17, §21, §22)
- Cenário = **alternativa** (ramo). "Duplicar cenário" = `createAlternative` (já copia o
  modelo com blocos). `TelaAlternativas` ganha modo **N colunas** com os indicadores de
  massa (urbanísticos, produto, eficiência, financeiro) lado a lado e **destaques por
  critério** (maior VGV, menor custo, maior eficiência, mais unidades, melhor VGV/custo,
  menor complexidade = nº de blocos/pavimentos) — sem "vencedor"; "tornar principal" já
  existe. Nome sugerido `EM-001 — 8 pav / 32 un`.
- Paramétrico instantâneo (§21): já é derivado; garantir que mudar pavimentos/área média/
  recuo recalcula sem gravar (memo por hash do modelo + produto).
- Histórico (§22): publicação já registra parâmetros, geometria, zona (`blueprint_snapshot_*`),
  data e autor; o produto entra em `blueprint_snapshot_produto` ao publicar (molde
  `blueprint_snapshot_topografia`).
- **Pronto quando**: 3 alternativas comparadas na tela com Δ e destaques; publish grava o
  produto; teste de editor "M4".

### M5 — Gerador de implantações e otimizador (MVP 5, §7, §8, §18, §23)
- **`utils/blueprintGeradorDeMassa.ts`** (puro) + `blueprintGeradorDeMassa.worker.ts`
  + `hooks/useGeradorDeMassa.ts` (molde E6.2): biblioteca paramétrica de implantações
  (torre isolada/central/lateral, bloco linear, L, U, H, pátio, duas torres, múltiplos
  blocos, embasamento + torre, podium + torre, uso misto, horizontal/geminadas) desenhada
  dentro do `maiorRetanguloInscrito`/peças do envelope, orientada pela frente e pelo
  norte; varredura de pavimentos × unidades/pav × tipologia; **objetivo** escolhido
  (maximizar VGV / lucro / vendável / unidades / eficiência / insolação; minimizar custo /
  comum / estacionamento; combinação ponderada) com **restrições** (área da unidade
  min–max, vagas/un mínimas, gabarito, CA, TO); recozimento semeado + `frenteDePareto`;
  cada resultado → "Aplicar como alternativa" (cria ramo com os comandos `AddBloco`).
- **Insolação de massa** (§11): sombra do bloco sobre lote e vizinhos por data/hora
  (reusar `posicaoSolar` + `sombreado` com blocos como prismas; área sombreada no lote
  e nas divisas), horas de sol por fachada do bloco; entra como indicador e como
  objetivo. Orientação/profundidade do bloco (§12) como indicadores. ⚠️ Hoje o entorno
  (vizinhos) vive só em `usePersistedState('blueprint:insolacao')` (navegador) — para o
  cenário comparar sombra sobre vizinhos de forma reprodutível, persistir o entorno por
  estudo (coluna jsonb em `blueprint_study_urban_context` ou tabela própria).
- **Unidade de canto / orientação por unidade**: `EmpreendimentoUnit` já tem
  `position_type`, `sun_orientation`, `view_type` e `ImovibUnitInstance` tem
  `sun_orientation` — a distribuição do M2/M6 deve preencher esses campos ao exportar
  (é o que o hedônico da Imovib consome).
- **Estacionamento como alternativa** (§10): o gerador testa térreo / 1 subsolo /
  2 subsolos / pilotis para a exigência, com custo por hipótese.
- **IA** (§23): estender `interpretarPedidoLocal`/`mudancasDaResposta` + prompt da Edge
  `planta-ia` para o vocabulário do produto ("duas torres", "reduzir área comum",
  "apartamentos entre 65 e 75 m²") → muda produto/hipóteses → regenera → delta.
- **Pronto quando**: 3 cenários do exemplo do PRD (torre única / duas torres / bloco
  longitudinal) saem do gerador para um lote de prova, reprodutíveis por semente; teste
  de Pareto; harness com portão.

### M6 — Da massa à planta e ao BIM (MVP 6, §19, §20)
- "Gerar planta do pavimento tipo": do bloco + produto → cria `Level` térreo + tipo com
  `repeticoes` (E2.1), `Nucleo`/`Escada` reais (M2), divide o anel do pavimento em N
  polígonos de unidade (fatias ao longo do maior eixo, núcleo no meio; unidades de canto
  identificadas), **por unidade** chama `gerar` do `blueprintGerador` com `envelope` =
  polígono da unidade e `programaSemente` da tipologia (2Q/3Q suíte/studio → novas
  sementes), `Unidade` (E2.2) por resultado, `Grupo` espelhado quando simétrico (E2.3);
  vagas reais via `planejarVagas` no bloco garagem. Daí Quantitativos, Orçamento,
  IFC/BIM e Empreendimento já fluem pelo que existe.
- **Planta AI v1**: já fora do menu desde M1. Em M6, com a planta nascendo da massa,
  avaliar com o usuário se os botões do Empreendimento que ainda levam ao Planta AI
  ("Gerar a partir de Torres & Unidades", aresta "Arquitetura (Planta IA)" do
  `SyncCenterTab`) passam a apontar para a Planta Inteligente. Sem migração de dados do
  `plant_*`; `planta_ai_study_id`/`planta_ai_scenario_id` seguem válidos.
- **Pronto quando**: lote de prova → cenário → planta de pavimento tipo com N unidades,
  quantitativo e IFC gerados; teste de editor "M6".

## Fora do plano (registrado)
- Análise de vista (§13) — depende de entorno 3D que o estudo não tem; hedônico fica na Imovib.
- Outorga onerosa / potencial adicional como CÁLCULO (entra só como campo da zona e
  "CA máximo com outorga" no M1, se o usuário quiser).
- Imagem de satélite / lote por mapa com tiles (licença E-12).
- Fluxo de caixa, TIR, VPL — Imovib.
- Migrar dados do Planta AI v1 para blocos.

## Arquivos críticos a reusar (todos em origin/main)
`utils/blueprintTerreno.ts` (`envelopeConstrutivo`, `calcularAproveitamento`, `Recuos`),
`utils/blueprintEnvelope3d.ts` (`envelopeVertical`), `utils/blueprintZonaUrbanistica.ts`
(`lerZona`, `recuosEfetivos`, `ValoresDaZona`), `hooks/useBlueprintZonaUrbanistica.ts`,
`utils/blueprintVagasAutomaticas.ts` (`planejarVagas`, `exigenciaDeVagas`, `resumoDe`),
`utils/blueprintNucleoVertical.ts` (`FICHA_DO_ELEVADOR`), `utils/blueprintInsolacao.ts`
(`posicaoSolar`, `prismasDoEntorno`, `sombreado`), `utils/blueprintSubRegioes.ts`
(`quadroDeSubRegioes`), `utils/blueprintUnidades.ts`, `utils/blueprintGerador.ts`
(`gerar`, `prng`, `frenteDePareto`, `maiorRetanguloInscrito`), `utils/blueprintGerador.worker.ts`,
`hooks/useGerador.ts`, `utils/blueprintIa.ts`, `utils/blueprintPrograma.ts`
(`programaSemente`), `utils/blueprintAvaliacao.ts` (molde de indicador com `null` + motivo),
`services/blueprintProgramService.ts` + `hooks/useBlueprintPrograma.ts` (molde de tabela por
estudo), `services/sync/blueprintAdapter.ts` + `services/blueprintEmpreendimentoSync.ts`
(molde da ponte), `components/blueprint/{PainelVagas,PainelTerreno,TelaAlternativas,
TelaGerador,Blueprint3DViewer}.tsx`, `services/plantaAiEngine.ts` (só para aposentar).

## Verificação de ponta a ponta (por fase)
1. `npm run typecheck`; `bash scripts/check-ui-standard.sh <cada .tsx tocado>`;
   `bash scripts/check-org-selector-guard.sh`.
2. Suíte cheia com a conta fechando em JSON (Node 24 cai intermitente — repetir se o
   worker morrer); goldens recapturados só após provar em `0.89.0`.
3. `npm run build`; `node scripts/build-planta-api-kernel.mjs` + redeploy da `planta-api`
   a cada bump (teste de frescor `plantaApi.test.ts`).
4. Harness sem login em `docs/spikes/massa/` (molde `docs/spikes/loteamento/medir.mjs`):
   números do motor + pixels por família + controle vazio, exit ≠ 0 reprova.
5. App real com a skill `rodar-app`, estudo descartável, conferir o banco depois
   (`blueprint_branches.draft_payload` com `blocos`), 0 erros de console/PostgREST.
6. `git push origin HEAD:main` → `bash scripts/conferir-producao.sh "Estudo de massa"`.

## Estado

- [x] M0 — plano em `docs/planos/` e frente `estudo-de-massa` a partir de `origin/main`
- [x] M1 — família `Bloco` + indicadores urbanísticos + menu (`671ada75` + este registro)
- [x] M2 — produto e eficiência (02/10/2026)
- [x] M3 — financeiro e ponte com Empreendimento/Imovib (`f5c35dc` + correções da prova real)
- [ ] M4 — cenários e comparador · **8 de 9** (falta provar a GRAVAÇÃO real do produto congelado ao publicar — exige estudo descartável, autorização)
- [ ] M5 — gerador de implantações e otimizador
- [ ] M6 — da massa à planta e ao BIM

## Execução

### M1 — Família `Bloco` + indicadores urbanísticos (01–02/10/2026) · kernel 0.89.0 → 0.90.0

**O que entrou.**

- **Kernel**: `Bloco {nome, pontos, cotaBaseMm (relativa ao pavimento de referência), pavimentos, peDireitoMm, uso}`
  (`USOS_DO_BLOCO`: residencial, comercial, misto, garagem, lazer, técnico); comandos `AddBloco` (padrões: cota 0,
  1 pav, 3,00 m, residencial), `SetBlocoProps`, `MoveBlocoVertex`, `DeleteBloco`; `TranslateEntities.blocoIds`;
  `RemoveLevel` leva os blocos do pavimento; invariantes `BAD_MASS`; canônico `blocos` + identidade **omitidos sem
  bloco**; prefixo de rótulo `Z`; id `blc_`. Goldens provados em 0.89.0 (248 testes) e recapturados — só a versão
  mudou, contagens 9/49/144/3/78/4 intactas. Pinos de versão dos testes e bundle da `planta-api` regenerados.
- **Motor** `utils/blueprintMassa.ts` (puro): `areaDaUniaoMm2` (exata, por faixas verticais), `medirBloco`
  (pisos com cota absoluta, ordinal no gabarito pela cadeia de apoio — torre sobre podium começa no 4º —, envelope
  na altura do topo de cada piso com `recuosEfetivos` + `envelopeConstrutivo`; subsolo confere só o lote),
  `envelopeLegal` (lote, TO × lote, envelope do térreo, CA × lote, pavimentos possíveis, altura máxima, o que falta),
  `medirMassa` (TO pela união das projeções acima do solo, CA pela computável, gabaritos, permeabilidade das
  sub-regiões, aproveitamento do potencial, avisos de pavimentos fora/acima e de blocos sobrepostos),
  `aproveitamentoDoEstudo` (TO/CA de TODOS os pavimentos desenhados + massa — substitui no editor a conta antiga de
  um pavimento só, TO = CA), `HIPOTESES_DA_MASSA_PADRAO` (garagem e técnico fora do CA, subsolo fora).
- `blueprintEnvelope3d.ts`: `conferirNoEnvelope` extraída do `envelopeVertical` (mesma régua para pavimento e bloco).
- **Tela**: aba Terreno › grupo **Massa** (ferramenta Bloco — polígono, fecha no 1º vértice, Orto = retângulo; barra
  de opções com pavimentos, piso a piso e uso) e **Estudo de massa** (gaveta `PainelEstudoDeMassa`: envelope legal,
  indicadores em `KpiCard`, avisos, `StandardTable` densa por bloco que seleciona na linha, hipóteses do CA);
  `PainelBlocoSelecionado`; canvas pinta o bloco pela cor do uso, rótulo "nome · N pav · altura", contorno vermelho
  tracejado quando sai do envelope/gabarito, arrasta com a seleção, entra no clique; 3D com um prisma sólido por
  pavimento (vermelho onde passa), toggle "Blocos de massa" no Exibir, enquadramento da câmera inclui os blocos;
  excluir a seleção leva o bloco; regras de EDIFICAÇÃO recebem a altura da massa.
- **Menu (DR-05)**: o item "Estudo de Massa" (Planta AI v1) saiu do menu Incorporação e do menu lateral; a rota
  `planta-ai` continua viva para os links internos do Empreendimento; a permissão virou "Planta AI v1 (legado, fora do
  menu)". O estudo de massa mora em **Incorporação › Planta Inteligente**, como o pedido diz. Decidido não criar um
  segundo item de menu para o mesmo módulo; a "aba preferida Terreno ao abrir" ficou de fora (exigiria rota nova).

**Prova.**

| Portão | Resultado |
|---|---|
| `tsc --noEmit` | exit 0 |
| `check-ui-standard.sh` nos 8 `.tsx` tocados | 0 violações |
| Suíte cheia (JSON) | 666/666 arquivos · 6.993 testes = 6.959 ok + 34 pulados · 0 falhas |
| `vite build` | ✓ built, PWA gerado |
| `check-xss-sinks.sh` · `check-org-selector-guard.sh` | ok · ok |
| `__tests__/blueprintMassa.test.ts` (12) | exemplo do pedido: 720 m², 3.600 m², 5 pavimentos possíveis; torre 24×30×10: TO 60 % atende, CA 6,0 excede, 2 pav acima do gabarito; podium+torre; sobreposição; subsolo; afastamento progressivo |
| Teste de editor "estudo de massa (M1)" | gaveta, seleção pela linha, pavimentos 10 → 5 recalcula |
| Harness `docs/spikes/massa/medir.mjs` (portão) | 17/17 ok · âmbar 52.723 px e vermelho 873 px com blocos · 0 e 0 no controle vazio · 0 erros de console |
| 3D (`?3d=1`, print) | podium âmbar 3 pav, torre 7 pav, 9º e 10º vermelhos |
| **App real logado** (02/10, agente-leitura, só leitura) | menu sem o item antigo e com Planta Inteligente; estudo "Planta 26/09/2026" aberto; Terreno › grupo Massa com Bloco e Estudo de massa; gaveta abre com envelope legal e estado vazio que diz o que falta; 0 erros; 0 escritas tentadas; banco conferido antes/depois: 72 ramos, última gravação ainda 29/09 |

**Achado fora de escopo (registrado, não corrigido):** `RemoveLevel` não trata `quadras`/`lotes`/`vias`/`areasPublicas`
— remover o pavimento delas violaria o invariante "pavimento inexistente". O bloco já é tratado.

**Publicação:** primeiro como preview na branch; em 02/10, com a prova no app real e o "pode seguir" do usuário, em `main`. Ao publicar em `main`: redeploy da Edge Function `planta-api` (bundle 0.90.0) e
`conferir-producao.sh "Estudo de massa"`. ⚠️ Outras frentes (incêndio) estão subindo o kernel no mesmo dia: rebase
antes do push e, se o 0.90.0 já estiver tomado, renumerar.

**Pedido posterior (02/10/2026, mesma sessão):** *"SENHA = [fornecida] · pode seguir"* — prova no app real feita e M1
publicada; segue a M2.

### M2 — Produto e eficiência (02/10/2026)

**O que entrou.**

- **Tabela** `blueprint_study_produto` (migration `aplicar_20271002000010`, APLICADA por `db query -f`): uma linha
  por estudo, FK composta ao estudo com CASCADE, RLS `is_org_member` numa perna só, `REVOKE … FROM PUBLIC, anon,
  authenticated` + grant só de CRUD. Conferido em `role_table_grants`: `anon` sem nada, `authenticated` com
  SELECT/INSERT/UPDATE/DELETE; RLS ligada, 1 política. `services/blueprintProdutoService.ts` +
  `hooks/useBlueprintProduto.ts` (molde do programa: estado na hora, gravação com respiro de 500 ms, degrada
  para a sessão).
- **Motor** `utils/blueprintProduto.ts` (puro). ⚠️ Desvio do plano: a distribuição mora aqui, e não em
  `blueprintMassa.ts` — o produto é outra camada e importa a medida da massa, não o contrário.
  `Produto {nome, padrao (chaves do CUB do Estimador), tipologias [uso, dormitórios, área privativa alvo,
  vagas/un, mix %], metaUnidades, hipoteses}`; sementes (econômico, médio, alto, comercial, misto);
  `produtoDaColuna` tolerante; `problemasDoProduto` (mix que não fecha).
  `nucleoDoBloco`: o desenhado (núcleos e escadas com centro dentro do bloco) vence a hipótese; sem escada
  desenhada, escada/hall/shafts da hipótese continuam somados; elevadores pela hipótese (1 a partir de 5
  pavimentos acima do solo, 2 a partir de 9). `distribuirProduto`: por pavimento, bruta − núcleo − paredes −
  portaria (1º pav) − corredor = privativa disponível, repartida pelo mix (`floor`, maior resto, corte pela
  área); bloco residencial recebe as residenciais, comercial as comerciais, misto as duas. Eficiência do
  pavimento tipo e global, área comum por unidade, vagas do produto × da zona × as que CABEM (garagem pelo
  `planejarVagas` da E2.5 num modelo provisório com o contorno do bloco — sem pilares, dito como teto),
  índice de garagem, meta de unidades. `comandosDoNucleoSugerido`: elevadores (ficha de 8 passageiros) + shaft
  como `AddNucleo` no centro do bloco. ⚠️ A escada NÃO é lançada (fica com o projetista; a hipótese segue).
- **Tela**: Terreno › Massa › **Produto** (gaveta `PainelProduto`: semente com confirmação, padrão CUB, meta,
  tabela de tipologias editável na linha, hipóteses do pavimento e o arranjo das vagas); gaveta Estudo de
  massa ganha **Produto e eficiência** (cartões: unidades × meta, privativa total e média, eficiência do
  pavimento e global, área comum por unidade, vagas que cabem × exigidas, índice de garagem; avisos; tabela
  por bloco com núcleo, origem e "Lançar núcleo").

**Prova.**

| Portão | Resultado |
|---|---|
| `tsc --noEmit` | exit 0 (1ª tentativa caiu com o crash 0xC0000005 conhecido do Node 24, sem erro de tipo) |
| `check-ui-standard.sh` (PainelProduto, PainelEstudoDeMassa, BlueprintEditor) | 0 violações |
| `segurancaMigrations.test.ts` | ok |
| Suíte cheia (JSON) | 667/667 arquivos · 7.000 testes = 6.966 ok + 34 pulados · 0 falhas |
| `vite build` · XSS · org guard | ok · ok · ok |
| `__tests__/blueprintProduto.test.ts` (6) | torre 24 × 30 × 10: núcleo 34 m², 8 un/pav, 80 unidades, 5.320 m², 73,9 %; vagas 120 pelo produto e pela zona; garagem 20 × 15 = 7 vagas (o mesmo número da E2.5); núcleo lançado = 33 m² desenhado |
| Teste de editor "estudo de massa (M2)" | semente aplicada e gravada; 80 un, 73,9 %, "0 de 120" vagas; Lançar núcleo → "33,00 · desenhado · 2 elev." |
| Harness `docs/spikes/massa/medir.mjs` | 21/21 ok (produto misto: torre 2 un/pav com núcleo de 34 m², podium 6 lojas/pav) |
| App real (agente-leitura, só leitura) | botão Produto, gaveta abre, a tabela nova é lida sem erro de RLS; 0 escritas; banco igual antes/depois (0 produtos, rascunho 29/09) |

**Pedido posterior (02/10/2026, mesma sessão):** *"pode seguir"* — segue a M3.

### M3 — Financeiro e ponte com o Empreendimento (02/10/2026)

**O que entrou.**

- **Financeiro** `utils/blueprintFinanceiroMassa.ts` (puro): VGV por tipologia (unidades × área × preço/m²),
  custo de obra por natureza (edificação ×1, garagem acima do solo × fator, subsolo × fator) sobre o custo/m²
  base — digitado vence; senão CUB × (1 + itens fora do CUB) —, terreno, corretagem/marketing, tributos e
  outras despesas em % do VGV; resultado, margem, VGV ÷ custo, obra por m² privativo. Sem custo, `null` com o
  motivo; tipologia sem preço fica fora do VGV e é nomeada. Fluxo de caixa/TIR/VPL continuam na Viabilidade.
  O produto ganhou `precoM2` por tipologia e `financeiro` (UF, custo digitado, acréscimos, fatores, terreno,
  despesas) — produto gravado antes da M3 recebe os padrões na leitura.
- **CUB** `services/cubService.ts`: `cubDoPadrao(uf, padrão)` lê `cub_parametric_data` (linha Total, com
  desoneração), mês mais recente por AAAAMM; reserva `cubEstimado` dita como estimativa. ⚠️ Mapa padrão →
  coluna EXPLÍCITO (`PP-N` → `pp_4_n`, `CSL8-N` → `csl_8_n`).
  **Achado fora de escopo:** o `parametricService` do Estimador monta a coluna pela chave (`pp_n`, `csl8_n`) e,
  para PP-*, CSL*, CAL*, a busca falha em silêncio e cai no valor estimado. Não corrigido aqui.
  **Achado de medição:** ordenar `reference_date` ("MM/AAAA") como texto põe 12/2025 antes de 01/2026; o serviço
  converte para AAAAMM — o harness e o app real leram 01/2026.
- **Ponte** (origem nova `massa` no motor `services/sync/`): migration `aplicar_20271002000020` (APLICADA e
  conferida): `empreendimento_towers.blueprint_bloco_uid`, `empreendimento_units.blueprint_massa_chave`, dois
  índices únicos parciais, e os dois CHECKs ampliados (`origin` … 'massa'; `source` … 'sync_massa').
  `SyncOrigin`/`PROVENANCE`/`ORIGIN_LABEL`/`SYNC_FIELDS.massa` (torre: pavimentos, un/pav, custo e preço/m²;
  unidade: nome, andar, tipologia, áreas, dormitórios); `TOWER_COLS`/`UNIT_COLS` com as colunas novas;
  `EmpreendimentoAuditSource` e o rótulo do Histórico. `services/sync/massaAdapter.ts` — `ladoDaMassa` puro
  (bloco com unidades → torre, adoção por nome; cada unidade do produto → unidade "T01", "101"… com área comum
  rateada, preço-semente e `floor_tipo`; garagem não vira torre, avisada) e `loadMassaSide` (snapshot PUBLICADO +
  produto atual + CUB). `services/massaEmpreendimentoSync.ts` (prévia, conflitos → Curadoria, auditoria
  `sync_massa`). ⚠️ Desvio do plano: sem coluna `blueprint_bloco_uid` em unidade; a unidade tem chave texto
  própria porque não existe no desenho.
- **Tela**: gaveta Produto ganha a coluna Preço (R$/m²) e a seção Financeiro (UF, custo digitado, a linha do CUB
  com mês/desoneração, acréscimos, fatores, terreno, despesas); gaveta Estudo de massa ganha **Financeiro —
  pré-viabilidade** (VGV, custo de obra com a origem, custo total, resultado e margem, VGV ÷ custo, obra/m²
  privativo) e **Enviar ao Empreendimento** (escolha do empreendimento → vincula o estudo → prévia → confirmação
  com órfãs avisadas → envio).

**Prova.**

| Portão | Resultado |
|---|---|
| `tsc --noEmit` | exit 0 (1ª tentativa caiu com o crash conhecido do Node 24, sem erro de tipo) |
| `check-ui-standard.sh` (PainelProduto, PainelEstudoDeMassa, BlueprintEditor, HistoricoTab) | 0 violações |
| Suíte cheia (JSON) | 668/668 arquivos · 7.007 testes = 6.973 ok + 34 pulados · 0 falhas |
| `vite build` · XSS · org guard | ok · ok · ok |
| `__tests__/blueprintMassaFinanceiroEPonte.test.ts` (6) | VGV 46,12 mi, obra 19,95 mi, total 29,868 mi, margem 35,2 %; custo digitado/sem CUB/estimado/sem preço; produto antigo; mapa do CUB; 1 torre e 80 unidades; reenvio sem mudança nenhuma; 9 pavimentos → 8 órfãs reportadas + conflito de pavimentos; torre à mão ADOTADA |
| Teste de editor "estudo de massa (M3)" | R$ 46,1 mi, R$ 18,0 mi, CUB 12/2025 (mock), margem, bloco de envio |
| Harness | 25/25 ok · CUB REAL R8-N/MG 2.439,37 e PP-N 2.799,34 (TABELA, 01/2026) |
| App real (agente-leitura, só leitura) | linha do CUB real na gaveta Produto (01/2026 · Com Desoneração), seção financeira; 0 escritas; banco igual antes/depois (rascunho, produtos, torres, empreendimentos) |
| Envio real ao Empreendimento | feito em 02/10 com autorização — ver "Prova real do envio" abaixo |

**Pedido posterior (02/10/2026, mesma sessão):** *"Autorizo criação de empreendimento"* — prova real do envio.

#### Prova real do envio (02/10/2026)

Roteiro `c:/tmp/pwtest/massa-envio-real.cjs`: navegador logado (agente-leitura, org Alpa), código REAL do app
importado do servidor Vite (mesmo cliente Supabase, mesma sessão, mesma RLS). Criados: estudo "ZZ TESTE Estudo
de Massa (descartável — prova M3)" com torre 24 × 30 × 10 e subsolo de garagem publicados, produto residencial
médio, empreendimento "ZZ TESTE Empreendimento (descartável — prova M3)".

**A prova achou três defeitos — todos herdados do envio do LOTEAMENTO (B3, 25/09), que portanto nunca funcionou
em produção:**

1. `EMPREENDIMENTO_COLS` (`services/empreendimentoService.ts`) sem `blueprint_study_id`: o vínculo era gravado,
   `getById` não o devolvia, e todo envio parava em "não está vinculado a um estudo". Corrigido.
2. Os dois adaptadores faziam `snapshot.payload as string`, mas o jsonb chega como OBJETO: o parse lia
   "[object Object]". Corrigido com uma função só, `services/sync/modeloPublicado.ts`, usada pelos dois.
3. O relatório somava os avisos da origem duas vezes (o planner já os copia). Corrigido nos dois.

Travas: `__tests__/syncPlantaInteligenteTravas.test.ts` (3) — sem as correções, 2 falham (o 3º exercita a função
nova). Os testes do motor não pegavam nada disso porque montam o lado canônico a partir de modelo em memória.

**Depois das correções:** envio 1 = 1 torre + 80 unidades criadas; envio 2 = **zero** em tudo (idempotente). No
banco: "Torre A", 10 pavimentos, 8 un/pav, custo R$ 3.049,21/m² (CUB real 01/2026 × 1,25), preço R$ 8.669,17/m²,
80 unidades com 80 chaves distintas (101 … T08), VGV-semente R$ 46,12 mi; auditoria `sync_massa` gravada (o CHECK
novo aceitou). **Limpeza:** empreendimento (torre e unidades em cascata), auditoria do empreendimento, estudo
(versão, produto em cascata) apagados; conferido 0 restante com "ZZ TESTE". Ficaram 2 eventos em
`blueprint_audit_events` do estudo apagado: a tabela é imutável por gatilho, de propósito.

Portões depois das correções: tsc 0 · suíte 669/669 arquivos, 7.010 testes, 0 falhas · build ok · XSS ok · org ok.

**Pedido posterior (02/10/2026, mesma sessão):** *"m4"* — segue a M4. (No meio da fase o processo do Claude Code
caiu no Windows com 0xC0000409; o trabalho em disco estava intacto e foi retomado.)

### M4 — Cenários e comparador (02/10/2026)

**O que entrou.**

- **Comparador** `utils/blueprintComparadorDeMassa.ts` (puro): `cenarioDeMassa(model, régua)` mede uma
  alternativa com a régua do ESTUDO (zona, recuos, produto, CUB, hipóteses) — blocos, pavimentos, altura, TO, CA,
  construída, unidades, vendável, eficiência, vagas, VGV, custo, resultado, margem, VGV/custo, pavimentos fora da
  lei e complexidade construtiva (índice DITO: blocos + 2 por pavimento de subsolo + 1 por bloco apoiado em outro).
  `LINHAS_DO_COMPARADOR` diz em cada linha o que é "melhor" e o nome do destaque como o pedido lista (maior VGV,
  menor custo, maior eficiência, mais unidades, melhor VGV/custo, menor complexidade); `destaquesDoComparador`
  marca quem ganha CADA linha (empate total e linha sem concorrente não destacam). **Sem vencedor geral** (§17).
  `nomeSugeridoDoCenario` → "EM-003 — 10 pav / 80 un" (§22).
- **Tela** Colaborar › Alternativas ganha o **Comparador de cenários de massa** (quando o estudo tem bloco): "Comparar
  todas" carrega cada alternativa (a aberta é o modelo em memória, e a coluna dela acompanha a edição) e mostra a
  matriz indicador × alternativa com os destaques em verde e a lista "destaque: alternativa"; e o botão do nome
  sugerido ao lado de "Nova a partir desta". Duplicar cenário = criar alternativa (E6.1, já copiava os blocos).
- **Histórico (§22)**: tabela `blueprint_snapshot_produto` (migration `aplicar_20271002000030`, APLICADA): o produto em
  uso é congelado ao PUBLICAR (`publicarComTopografia` → `blueprintSnapshotProdutoService.congelar`), imutável
  (gatilho + só SELECT/INSERT), some com a versão. O envio ao Empreendimento (`loadMassaSide`) passa a usar o
  produto DA versão publicada; versão anterior à M4 cai no produto vivo e AVISA.
- §21 (paramétrico instantâneo): já era derivado — mudar pavimentos, recuo ou mix recalcula tudo na hora, sem gravar.

**Prova.**

| Portão | Resultado |
|---|---|
| `tsc --noEmit` | exit 0 |
| `check-ui-standard.sh` (TelaAlternativas, BlueprintEditor) | 0 violações |
| Suíte cheia (JSON) | 670/670 arquivos · 7.014 testes = 6.980 ok + 34 pulados · 0 falhas |
| `vite build` · XSS · org guard | ok (2ª tentativa; a 1ª caiu sem mensagem — Node 24) · ok · ok |
| `__tests__/blueprintComparadorDeMassa.test.ts` (3) | torre única × duas torres; destaques por linha; empate e sem concorrente; nome sugerido; formatação |
| Teste de editor "estudo de massa (M4)" | EM-003 sugerido; 2 colunas; "Unidades 80 × 34"; "menor complexidade: principal", "menor custo: Duas torres"; nenhuma linha de vencedor; publicar → produto congelado com o snapshot `snap_1` |
| Migration | `authenticated` só SELECT/INSERT, `anon` nada; RLS com 2 políticas; gatilho de imutabilidade |
| App real (só leitura) | sessão logada lê `blueprint_snapshot_produto` sem erro; `daVersao` de versão inexistente = null; 0 escritas |
| **Gravação real ao publicar** | **pendente** — exige publicar num estudo descartável (autorização); a leitura e a segurança estão provadas |
