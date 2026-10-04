# Climatização: o AltoQi Builder como régua — benchmark e roadmap para o ÒPURA

> A Parte 1 é o benchmark: o que existe, com evidência `arquivo:linha`. A Parte 2 é o plano de
> implementação. Nada da Parte 2 foi executado quando este documento foi escrito; cada fase
> ganha uma seção em "Execução" quando for feita.

## Pedido original

Sessão de 04/10/2026 (VS Code, Claude Code), transcrita literalmente:

<details>
<summary>Mensagem do usuário (clique para abrir; é longa: 75 funcionalidades + o que o AltoQi não faz + a proposta do ciclo fechado)</summary>

> avalie as funcionalidades a seguir referente a sistema de climatização para ser incluida na planta inteligente.
>
> A solução é o AltoQi Builder – módulo Climatização. Fiz o levantamento nas páginas oficiais e no suporte atualizado da AltoQi, incluindo a atualização 2026-08, que adicionou o cálculo de carga térmica por ambiente.
>
> Para usarmos como referência no desenvolvimento do ÒPURA / Planta Inteligente, eu classificaria as funcionalidades assim:
>
> 1. Modelagem do projeto de climatização
> criação do projeto de climatização dentro da edificação;
> modelagem BIM da instalação;
> modelagem em planta baixa;
> modelagem em vista 3D;
> edição diretamente no ambiente 3D;
> geração e edição em cortes;
> geração de detalhes isométricos;
> posicionamento dos elementos por altura/cota;
> modelagem em diferentes pavimentos;
> visualização simultânea entre croqui e 3D;
> movimentação de elementos no ambiente 3D;
> caixa de corte 3D;
> controle de visibilidade dos elementos/modelos;
> níveis intermediários;
> seleção múltipla de elementos;
> comandos gerais de edição, cópia, movimentação e alinhamento.
> 2. Sistemas de climatização
> O Builder trabalha explicitamente com:
>
> Split;
> VRF – Variable Refrigerant Flow;
> unidades evaporadoras;
> unidades condensadoras;
> interligação entre os equipamentos;
> redes frigorígenas;
> dutos;
> exaustores e componentes auxiliares.
> 3. Lançamento de evaporadoras
> inserção da evaporadora;
> definição da altura;
> posicionamento em planta;
> escolha do modelo;
> orientação do equipamento;
> movimentação posterior;
> ajuste da representação gráfica;
> associação às peças cadastradas;
> representação 2D;
> representação 3D.
> 4. Lançamento de condensadoras
> inserção da condensadora;
> definição da altura;
> escolha da posição;
> seleção do modelo;
> orientação da unidade;
> movimentação;
> ajuste das indicações/textos;
> representação BIM 3D.
> 5. Lançamento de equipamentos
> Além das unidades principais, a biblioteca pode contemplar:
>
> evaporadoras;
> condensadoras;
> exaustores;
> bocais;
> caixas de distribuição;
> bombas de drenagem;
> componentes auxiliares;
> equipamentos personalizados.
> 6. Pontos genéricos
> Há recurso específico para definição de pontos genéricos de climatização, permitindo representar equipamentos ou elementos que não estejam contemplados diretamente pelos comandos padrões.
>
> Isso é particularmente importante para uma solução própria, porque evita deixar o projetista preso à biblioteca nativa.
>
> 7. Linhas frigorígenas
> O sistema permite:
>
> lançamento das linhas frigorígenas;
> interligação evaporadora–condensadora;
> lançamento das tubulações;
> definição gráfica dos trajetos;
> visualização da tubulação em 3D;
> utilização de condutos multicurva;
> curvas com raio mínimo;
> ajuste do raio das curvas;
> representação realista do percurso.
> 8. Tubulações
> O módulo contempla:
>
> lançamento de tubulações;
> trajetos horizontais;
> trajetos verticais;
> mudanças de direção;
> conexões;
> representação tridimensional;
> alteração geométrica;
> integração da tubulação aos demais componentes.
> 9. Dutos de climatização
> O Builder possui recursos para:
>
> lançamento de dutos;
> dutos retangulares;
> representação 2D;
> representação 3D;
> modelagem realista dos dutos;
> curvas;
> mudanças de direção;
> conexões;
> acessórios;
> simbologias 3D personalizáveis em condutos retangulares.
> 10. Acessórios de climatização
> Existe função específica de lançamento de acessórios, integrada às redes.
>
> A biblioteca pode incluir, conforme o cadastro utilizado:
>
> conexões;
> derivações;
> reduções;
> curvas;
> bocais;
> caixas;
> adaptadores;
> componentes da linha frigorígena;
> acessórios de dutos.
> 11. Kits de climatização
> A AltoQi adicionou recursos relacionados a kits para Climatização, permitindo agrupar componentes usados em conjunto.
>
> Conceitualmente isso permite algo como:
>
> Kit Split 12.000 BTU/h
>
> evaporadora;
> condensadora;
> linha frigorígena;
> isolamento;
> conexões;
> dreno;
> acessórios.
> Isso é muito interessante para automatização e quantitativos.
>
> Cálculo de carga térmica
> Aqui houve uma mudança importante em 2026.
>
> As páginas mais antigas da AltoQi ainda dizem que Climatização era exclusivamente para modelagem, sem dimensionamento. Porém, na atualização 2026-08, foi incorporado o cálculo de carga térmica por ambiente. O software ainda não escolhe automaticamente os equipamentos; calcula as cargas e deixa essa seleção a cargo do projetista.
>
> 12. Definição de ambientes
> delimitação do ambiente através de polígono;
> ambientes retangulares;
> ambientes irregulares;
> nome do ambiente;
> edição dos vértices;
> coordenadas X, Y e Z;
> área do ambiente;
> propriedades específicas de climatização.
> 13. Temperatura de projeto
> Para cada ambiente:
>
> definição da temperatura-meta;
> condições internas;
> consideração das condições externas.
> 14. Condições climáticas externas
> Propriedades da edificação incluem:
>
> altitude;
> temperatura de bulbo seco;
> temperatura de bulbo úmido;
> parâmetros térmicos utilizados nos cálculos.
> 15. Carga térmica através de janelas
> Considera:
>
> largura;
> altura;
> área;
> transmissão térmica;
> insolação;
> orientação solar.
> 16. Orientação solar das janelas
> Opções:
>
> Norte;
> Nordeste;
> Leste;
> Sudeste;
> Sul;
> Sudoeste;
> Oeste;
> Noroeste.
> 17. Proteção solar de janelas
> Configurações contempladas incluem:
>
> sem proteção;
> película simples;
> película + cortina;
> película refletiva + cortina;
> fator de sombreamento.
> 18. Carga térmica pelas paredes
> Permite considerar:
>
> paredes externas;
> paredes internas;
> orientação;
> temperatura adjacente;
> resistência térmica;
> área;
> diferença de temperatura;
> ganho térmico.
> 19. Carga térmica pelo teto
> Tipos considerados:
>
> laje interna;
> laje externa;
> laje externa com isolamento;
> temperatura do ambiente adjacente;
> área;
> resistência térmica;
> diferença de temperatura.
> 20. Carga térmica pelo piso
> Considera:
>
> área;
> temperatura do ambiente adjacente;
> resistência térmica;
> diferença de temperatura;
> calor sensível.
> 21. Pessoas
> Carga térmica relacionada à ocupação:
>
> quantidade de pessoas;
> tipo de atividade;
> calor sensível;
> calor latente.
> A ferramenta possui categorias de atividade, incluindo trabalho leve/sentado e atividades de maior movimento.
>
> 22. Iluminação
> Consideração da carga interna proveniente da:
>
> iluminação;
> potência instalada;
> contribuição para a carga sensível.
> 23. Equipamentos/aparelhos
> Permite adicionar fontes internas provenientes de:
>
> equipamentos;
> aparelhos;
> cargas internas diversas.
> 24. Aberturas
> Possibilidade de considerar fontes de calor associadas às aberturas dos ambientes.
>
> 25. Fonte de calor personalizada
> O projetista pode informar manualmente:
>
> calor sensível;
> calor latente;
> calor total.
> 26. Cálculo da carga sensível
> Resultado individual em:
>
> W;
> BTU/h.
> 27. Cálculo da carga latente
> Cálculo da parcela relacionada à umidade e mudança de fase.
>
> 28. Carga térmica total
> Calcula:
>
> Carga total = carga sensível + carga latente
>
> e apresenta o resultado por ambiente em BTU/h.
>
> 29. Atualização vinculada ao modelo
> Os dados de carga térmica permanecem associados aos ambientes/modelo e podem ser atualizados quando as características do projeto são alteradas.
>
> 30. NBR 16655-3
> O cálculo atual da AltoQi utiliza critérios da NBR 16655-3 para o cálculo das cargas térmicas.
>
> Biblioteca e cadastro
> 31. Cadastro nativo de peças
> Biblioteca própria para:
>
> Split;
> VRF;
> evaporadoras;
> condensadoras;
> exaustores;
> bocais;
> caixas de distribuição;
> bombas de drenagem;
> tubulações;
> dutos;
> kits de linhas frigorígenas.
> 32. Criação de novas peças
> O usuário pode criar seus próprios componentes.
>
> 33. Edição de peças existentes
> Permite modificar o cadastro nativo.
>
> 34. Informações técnicas
> As peças podem armazenar informações associadas ao componente.
>
> 35. Itens associados
> Uma peça pode possuir múltiplos itens para composição e quantitativo.
>
> 36. Simbologia 2D
> Cadastro e personalização da representação em planta.
>
> 37. Objeto 3D
> Associação de geometria tridimensional às peças.
>
> Documentação
> 38. Geração de plantas de climatização
> 39. Detalhes técnicos
> 40. Detalhes isométricos
> 41. Cortes
> 42. Representações realistas
> 43. Indicações gráficas
> 44. Legendas
> 45. Personalização das legendas
> O objetivo é produzir documentação técnica diretamente a partir do modelo BIM.
>
> Quantitativos
> 46. Quantitativo automático
> Geração de lista de materiais.
>
> 47. Quantitativo do projeto completo
> 48. Quantitativo por pavimento
> 49. Quantitativo por detalhe
> 50. Separação dos materiais por componente/rede
> 51. Quantificação baseada no modelo
> Alterações no projeto repercutem na documentação e quantitativos.
>
> BIM e interoperabilidade
> 52. Modelagem BIM de climatização
> 53. Importação IFC
> 54. Exportação IFC
> 55. OpenBIM
> 56. Utilização de modelos BIM externos como referência
> 57. Importação de arquitetura/estrutura
> 58. Importação RVT/RTE
> A atualização 2026-08 adicionou suporte à importação de RVT/RTE como modelo externo.
>
> 59. Importação DWG/DXF
> O Builder também permite utilizar arquivos CAD 2D como referência para criação da edificação.
>
> Compatibilização
> 60. Visualização integrada das disciplinas
> Climatização pode ser analisada em conjunto com:
>
> estrutura;
> arquitetura;
> elétrica;
> hidráulica;
> sanitária;
> incêndio;
> gás;
> SPDA;
> cabeamento.
> 61. Compatibilização visual 3D
> 62. Verificação espacial
> Permite identificar visualmente problemas como:
>
> duto × viga;
> tubulação × estrutura;
> evaporadora × elemento arquitetônico;
> condensadora × arquitetura;
> redes de climatização × outras instalações.
> A proposta central do Builder é justamente manter as disciplinas dentro de um ambiente BIM integrado.
>
> Recursos gerais relevantes
> 63. Croqui 2D
> 64. Vista 3D
> 65. Croqui + 3D simultaneamente
> 66. Caixa de corte 3D
> 67. Movimentação diretamente no 3D
> 68. Seleção múltipla 3D
> 69. Visibilidade independente dos modelos IFC
> 70. Planos de corte
> 71. Captura de pontos/referências
> 72. Indicação de problemas durante o lançamento
> 73. Blocos inteligentes
> 74. Replicação/edição de elementos
> 75. Pavimentos e níveis da edificação.
> O que o AltoQi não faz automaticamente
> Este ponto é particularmente relevante para a Planta Inteligente.
>
> Mesmo com a atualização 2026-08, a AltoQi deixa claro que calcula a carga térmica, mas não seleciona automaticamente qual equipamento deve ser utilizado nem verifica se determinado equipamento atende à carga calculada. Essa decisão continua sendo responsabilidade do projetista.
>
> Portanto, eu dividiria a situação atual assim:
>
> Recurso	AltoQi
> Modelagem Split	✅
> Modelagem VRF	✅
> Evaporadoras/condensadoras	✅
> Linha frigorígena	✅
> Dutos	✅
> Equipamentos/acessórios	✅
> BIM 3D	✅
> Cortes/isométricos	✅
> Quantitativos	✅
> IFC	✅
> Biblioteca personalizada	✅
> Carga térmica por ambiente	✅
> NBR 16655-3	✅
> Carga sensível/latente/total	✅
> Selecionar automaticamente aparelho	❌
> Dimensionar automaticamente aparelho pela carga	❌
> Otimizar localização dos equipamentos	❌
> Gerar automaticamente toda a rede	não identificado
> Dimensionamento automático completo de dutos	não identificado
> Balanceamento aeráulico completo	não identificado
> Simulação CFD	❌ / não identificada
> Análise energética anual	❌ / não identificada
> Para a Planta Inteligente do ÒPURA
> Eu não copiaria o escopo do AltoQi literalmente. Para o nosso módulo de climatização, o diferencial deveria ser fechar justamente o ciclo que hoje permanece parcialmente manual:
>
> Ambiente → carga térmica → equipamento → posicionamento → rede → dutos/tubulações → compatibilização → quantitativo → orçamento.
>
> Ou seja, a evolução natural seria adicionar, além dessas ~75 capacidades, seleção automática de equipamentos por catálogo, pré-dimensionamento Split/VRF, dimensionamento de dutos, cálculo de vazão, perda de carga, renovação de ar, exaustão, drenos, otimização de rotas e geração automática do projeto. Isso colocaria a Planta Inteligente acima de uma ferramenta predominantemente de modelagem BIM de climatização.

</details>

**Decisões do usuário (04/10/2026), respondidas antes da varredura:**
- **Régua: paridade + ciclo fechado.** E = o AltoQi faz. O "vai além" do usuário (seleção por
  catálogo, pré-dimensionamento Split/VRF, dutos por vazão e perda de carga, renovação de ar,
  exaustão, drenos, rotas, geração automática) é **A** e entra no roadmap logo depois da paridade.
  CFD e análise energética anual são **N**.
- **Ordem: Split primeiro**, VRF, dutos e exaustão depois.
- **Normas: CONFERIR NA NORMA.** Nenhuma NBR de climatização está em `c:\D\ORÇACLOUD`. Toda tabela
  nasce marcada, e a etapa que a usa pede o PDF (NBR 16655-1/2/3, NBR 16401-1/2/3) antes de fechar.
- **Entregável agora:** este benchmark + roadmap. A execução é depois, uma frente por etapa
  (`clima-e<N>`).

## Critério e legenda

**Critério do grau: paridade com o AltoQi Builder Climatização, mais o ciclo fechado.** Um item é
**E** se o AltoQi o faz e, sem ele, o projetista ainda precisaria do AltoQi para entregar o
projeto de climatização que o AltoQi entrega (Split, VRF, linhas, dutos, carga térmica pela NBR
16655-3, documentação, quantitativo, IFC).

| Grau | Significa |
|---|---|
| **E** | Essencial: o AltoQi faz, e a paridade exige |
| **A** | Alto: vai **além** do AltoQi — o ciclo fechado proposto pelo usuário (o AltoQi não faz ou não foi identificado) |
| **M** | Médio: o AltoQi faz, mas é nicho fora do mercado da incorporadora |
| **B** | Baixo: não aparece neste benchmark |
| **N** | Não replicar: CFD e simulação energética anual (nem o AltoQi faz; não cabem num editor de planta) |

O estado foi conferido no código em 04/10/2026, na frente `clima-benchmark` criada a partir de
`origin/main` `bfe8ee9c` (kernel `blueprint-kernel-ts-0.90.0`, quantitativos `quant-1.24.0`).
Legenda: **✅** implementado, **🟡** parcial (a base existe, mas não serve à climatização sem
trabalho), **❌** não existe.

**A climatização não parte do zero.** A Etapa 11.1 do roadmap unificado (20/09/2026) e a P2.2 do
backlog criaram um "HVAC mínimo" de propósito: a peça é o **lugar** com folga, para o clash pegar
cedo, e o dimensionamento ficou para depois (`docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`,
seções E11.1 e P2.2). O que existe:
- a disciplina `MECANICA` em `DisciplinaDeRede` (`model:2485`), cujo comentário (`model:2481`) já
  diz que "ar-condicionado, gás e incêndio cabem aqui sem nenhuma mudança de estrutura";
- o duto como `Trecho` MECANICA **redondo** (Ø 200 a 2,60 m);
- o terminal de ar como `Terminal` MECANICA com nome em **texto livre** (`Rede:142`);
- a família de componente `CLIMATIZACAO` com condensadora, evaporadora hi-wall, exaustor e casa de
  máquinas como **reservas de espaço** (`model:1654, 1745-1748`).

A varredura foi feita por três leituras independentes (modelo e equipamentos; dados para a carga
térmica; documentação, quantitativo e BIM). As linhas citadas foram reabertas na frente antes de
entrar aqui.

Abreviações nas evidências:

| Sigla | Arquivo |
|---|---|
| `model` | `utils/blueprintKernel/model.ts` |
| `commands` | `utils/blueprintKernel/commands.ts` |
| `quant` | `utils/blueprintKernel/quantities.ts` |
| `conexoes` | `utils/blueprintKernel/conexoes.ts` |
| `conflitos` | `utils/blueprintKernel/conflitos.ts` |
| `confArq` | `utils/blueprintKernel/conflitosArquitetonicos.ts` |
| `exterior` | `utils/blueprintKernel/exterior.ts` |
| `arco` | `utils/blueprintKernel/arco.ts` |
| `Rede` | `utils/blueprintRede.ts` |
| `PtsHidro` | `utils/blueprintPontosHidraulicos.ts` |
| `Potencia` | `utils/blueprintPotenciaPadrao.ts` |
| `Mat` | `utils/blueprintMateriais.ts` |
| `GrafoEsp` | `utils/blueprintGrafoEspacial.ts` |
| `Insol` | `utils/blueprintInsolacao.ts` |
| `Pluvial` | `utils/blueprintPluvial.ts` |
| `Acab` | `utils/blueprintAcabamentos.ts` |
| `Forro` | `utils/blueprintPlantaDeForro.ts` |
| `Prog` | `utils/blueprintPrograma.ts` |
| `Reserv` | `utils/blueprintReservacao.ts` |
| `Saidas` | `utils/blueprintSaidasIncendio.ts` |
| `Distr` | `utils/blueprintDistribuicao.ts` |
| `Kits` | `utils/blueprintKitsDeInsercao.ts` |
| `Camadas` | `utils/blueprintCamadasPorDisciplina.ts` |
| `Verif` | `utils/blueprintVerificacaoRede.ts` |
| `Budget` | `utils/blueprintBudget.ts` |
| `Pranchas` | `utils/blueprintPranchas.ts` |
| `PHidro` | `utils/blueprintPranchaHidro.ts` |
| `Corte` | `utils/blueprintCorte.ts` |
| `Ifc` | `utils/blueprintIfc.ts` |
| `Underlay` | `utils/blueprintUnderlay.ts` |
| `Encaixe` | `utils/blueprintEncaixe.ts` |
| `ExecSvc` | `services/blueprintProjetoExecutivoService.ts` |
| `Canvas` | `components/blueprint/BlueprintCanvas.tsx` |
| `3D` | `components/blueprint/Blueprint3DViewer.tsx` |
| `Ed` | `components/blueprint/BlueprintEditor.tsx` |
| `Menu` | `components/blueprint/MenuComponentes.tsx` |
| `PainelComp` | `components/blueprint/PainelComponenteSelecionado.tsx` |
| `PainelAcab` | `components/blueprint/PainelAcabamentos.tsx` |

---

# Parte 1 — Benchmark

## Onde o ÒPURA está, em uma página

A climatização tem **o lugar, mas não a instalação nem a conta**. Setembro deixou três coisas que
ela herda quase de graça:

1. **O lugar dos equipamentos.**
   - Condensadora, evaporadora hi-wall, exaustor e casa de máquinas como componentes com medida,
     cota e folga (`model:1745-1748`), símbolo 2D com a folga tracejada (`Canvas:7205-7238`), caixa
     no 3D (`3D:1357`), IFC `IfcUnitaryEquipment .SPLITSYSTEM.` e `IfcFan` (`Ifc:2596-2600`).
   - Clash de reserva × estrutura, parede e outro componente (`confArq:369`).
   - Ponto elétrico automático na face da parede atrás da evaporadora (`PtsHidro:372`), 1400 VA
     (`Potencia:58`).
2. **Os dados da envoltória, quase todos.**
   - Ambiente derivado das paredes, com nome, área, perímetro, pé-direito e volume (`model:737,
     880`; `quant:209`).
   - Parede externa × interna (`exterior:25`) e, por ambiente, cada fachada com o **ponto
     cardeal de 8 direções** (`GrafoEsp:46, 179-187`).
   - U = 1/(Rsi + Σe/λ + Rse) pela NBR 15220 a partir das camadas (`Mat:123`), com λ por
     material.
   - Norte, latitude, longitude e elevação na georreferência (`model:3605-3620`); posição solar e
     horas de sol na fachada com a vizinhança (`Insol:77, 238`).
   - Potência declarada das luminárias e dos pontos de uso específico.
3. **O molde de disciplina**, provado três vezes (hidro, elétrico, incêndio): premissas por estudo
   em tabela própria, planejadores que propõem → prévia → um `runBatch` → Ctrl+Z, rota pelas
   paredes com desvio estrutural, kits e composição por peça por organização, prancha, memorial,
   emissão com ART, quantitativo, IFC e clash por disciplina, e um gerador que encadeia tudo
   (`utils/blueprintGeradorPpci.ts`).

**O que falta, uma linha cada:**
- **o motor de carga térmica** — nenhuma linha no código; nem BTU/m² de regra de bolso;
- os dados que só a carga térmica pede: vidro e proteção solar da janela, camadas do telhado e da
  laje, exposição do teto e do piso por ambiente, condições externas (TBS/TBU) por cidade,
  ocupação, atividade e setpoint por ambiente;
- o equipamento como **peça da rede**, com capacidade (hoje é reserva sem BTU), e o VRF;
- a **linha frigorígena** e o **dreno** (não há disciplina, isolamento nem curva);
- o **duto retangular**, as conexões de duto e a taxonomia dos terminais de ar;
- seleção, posicionamento e traçado automáticos (o ciclo fechado);
- prancha, isométrico, detalhes, legenda, memorial e ART de climatização;
- entidades IFC de duto e terminal de ar, e o clash com volume retangular;
- no editor geral: caixa de corte 3D, mover e seleção múltipla no 3D, 2D e 3D lado a lado, modelo
  externo como referência.

## 1. Modelagem do projeto de climatização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Criação do projeto de climatização dentro da edificação | E | 🟡 | aba Mecânica no ribbon (`Ed:1036`), o mesmo modelo das demais disciplinas; faltam as premissas do estudo |
| Modelagem BIM da instalação | E | 🟡 | duto `Trecho` MECANICA e reservas `CLIMATIZACAO`; sem linha frigorígena nem dreno |
| Modelagem em planta baixa | E | 🟡 | ferramenta de rede MECANICA e componentes (`Menu:701-741`); só duto redondo e reservas |
| Modelagem em vista 3D | E | 🟡 | duto como cilindro e equipamento como caixa (`3D:1123-1160, 1357`) |
| Edição diretamente no ambiente 3D | E | ❌ | o 3D só seleciona por clique; sem manipulador (nenhum `TransformControls` no código) |
| Geração e edição em cortes | E | 🟡 | o corte gera com as redes (`Corte:325`, duto como caixa de `bitolaMm`); edição no corte não existe |
| Geração de detalhes isométricos | E | ❌ | isométrico só de água, esgoto e incêndio (`PHidro:27`) |
| Posicionamento por altura/cota | E | ✅ | `Componente.cotaMm` (`model:1831`) e `cotaAMm`/`cotaBMm` do trecho (`model:2580`) |
| Modelagem em diferentes pavimentos | E | ✅ | `levelId` em toda peça; prumada pela laje |
| Visualização simultânea entre croqui e 3D | E | ❌ | `em3d = vista === '3d'` é exclusivo (`Ed:1719`) |
| Movimentação de elementos no ambiente 3D | E | ❌ | idem "edição no 3D" |
| Caixa de corte 3D | E | ❌ | nenhum plano de recorte no viewer (sem `clippingPlanes`) |
| Controle de visibilidade dos elementos/modelos | E | ✅ | camadas por disciplina com meio-tom e isolar (`Camadas:93, 137`), olho por família no 3D |
| Níveis intermediários | E | 🟡 | `AddLevel` aceita qualquer elevação; mezanino sem tratamento próprio |
| Seleção múltipla de elementos | E | 🟡 | 2D ✅ (seleção por janela, `TranslateEntities` com trechos, terminais e componentes, `commands:1136`); 3D ❌ |
| Comandos gerais de edição, cópia, movimentação e alinhamento | E | 🟡 | mover, espelhar, girar, duplicar (`commands:1136, 1212, 1250, 1409`); alinhar e arranjo ❌ |

## 2. Sistemas de climatização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Split | E | 🟡 | condensadora + evaporadora hi-wall como reserva, sem capacidade (`model:1745-1746`) |
| VRF | E | ❌ | não há condensadora VRF, derivador nem sistema com N evaporadoras |
| Unidades evaporadoras | E | 🟡 | só hi-wall; sem piso-teto, cassete, dutada |
| Unidades condensadoras | E | 🟡 | uma ficha genérica 850 × 330 × 700 mm |
| Interligação entre os equipamentos | E | ❌ | nenhuma relação evaporadora → condensadora |
| Redes frigorígenas | E | ❌ | sem disciplina; `COBRE` existe em `MATERIAIS_DE_TUBO` só para água (`model:2557`) |
| Dutos | E | 🟡 | duto MECANICA redondo, Ø 200 de partida (P2.2) |
| Exaustores e componentes auxiliares | E | 🟡 | EXAUSTOR como reserva a 2,30 m (`model:1748`), sem vazão |

## 3. Lançamento de evaporadoras

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Inserção da evaporadora | E | ✅ | menu Mecânica → "Evaporadora hi-wall" (`Menu:701-741`) |
| Definição da altura | E | ✅ | cota 2200 da ficha, editável no painel (`PainelComp:112-160`) |
| Posicionamento em planta | E | ✅ | componente com mover e arraste (P2.4) |
| Escolha do modelo | E | ❌ | um tipo só, sem capacidade nem modelo |
| Orientação do equipamento | E | ✅ | giro do componente |
| Movimentação posterior | E | ✅ | `TranslateEntities.componenteIds` (`commands:1136`) |
| Ajuste da representação gráfica | E | 🟡 | símbolo fixo no canvas (`Canvas:7205-7230`); não se escolhe |
| Associação às peças cadastradas | E | 🟡 | catálogo por organização da família COMPONENTE (`utils/blueprintTipos.ts:25`); sem capacidade nem composição ligada |
| Representação 2D | E | ✅ | `Canvas:7205-7238` |
| Representação 3D | E | 🟡 | caixa simples verde-azulada (`3D:1357`) |

## 4. Lançamento de condensadoras

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Inserção da condensadora | E | ✅ | menu Mecânica → "Condensadora" |
| Definição da altura | E | ✅ | `Componente.cotaMm` |
| Escolha da posição | E | ✅ | componente em planta |
| Seleção do modelo | E | ❌ | ficha única, sem capacidade |
| Orientação da unidade | E | ✅ | giro do componente |
| Movimentação | E | ✅ | idem evaporadora |
| Ajuste das indicações/textos | E | 🟡 | só o rótulo do componente; sem tag de capacidade nem texto de prancha |
| Representação BIM 3D | E | 🟡 | caixa no 3D; IFC `IfcUnitaryEquipment .SPLITSYSTEM.` ✅ (`Ifc:2596-2600`) |

## 5. Lançamento de equipamentos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Evaporadoras | E | 🟡 | §3 |
| Condensadoras | E | 🟡 | §4 |
| Exaustores | E | 🟡 | reserva sem vazão (`model:1748`) |
| Bocais | E | ❌ | o terminal de ar só conhece Difusor/Grelha/Tomada de ar (`Rede:142`) |
| Caixas de distribuição | E | ❌ | não existe |
| Bombas de drenagem | E | ❌ | não existe |
| Componentes auxiliares | E | 🟡 | casa de máquinas como reserva (`model:1747`) |
| Equipamentos personalizados | E | 🟡 | catálogo por organização de componentes; sem dados de climatização |

## 6. Pontos genéricos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Ponto genérico de climatização (o que os comandos padrões não cobrem) | E | 🟡 | o terminal MECANICA aceita nome livre (`Rede:142`), mas sem ficha nem medidas próprias; molde: `PREVENTIVO_PERSONALIZADO` do incêndio |
| Não ficar preso à biblioteca nativa | E | 🟡 | catálogo de tipos por organização (`blueprint_element_types`) |

## 7. Linhas frigorígenas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento das linhas frigorígenas | E | ❌ | sem disciplina |
| Interligação evaporadora–condensadora | E | ❌ | equipamento é componente, não nó de rede (achado 1) |
| Lançamento das tubulações | E | 🟡 | o `Trecho` genérico serve (`model:2580`); falta a disciplina |
| Definição gráfica dos trajetos | E | 🟡 | trecho por cliques, com OSNAP |
| Visualização da tubulação em 3D | E | 🟡 | cilindro do trecho; sem o par líquido/sucção nem isolamento |
| Condutos multicurva | E | ❌ | trecho é sempre reto (`model:2524-2526`); o único arco é o da parede curva (`arco:1`) |
| Curvas com raio mínimo | E | ❌ | idem |
| Ajuste do raio das curvas | E | ❌ | idem |
| Representação realista do percurso | E | ❌ | par de tubos isolados, curvas suaves |

## 8. Tubulações

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento de tubulações | E | 🟡 | trecho genérico; falta a disciplina frigorígena e a de dreno |
| Trajetos horizontais | E | 🟡 | idem |
| Trajetos verticais | E | 🟡 | prumada pela laje herdada; falta a disciplina |
| Mudanças de direção | E | 🟡 | trechos encadeados; a peça de curva é derivada só nas hidráulicas (`conexoes:148`) |
| Conexões | E | ❌ | `HIDRAULICAS` exclui MECANICA (`conexoes:148`) |
| Representação tridimensional | E | 🟡 | cilindro |
| Alteração geométrica | E | 🟡 | mover ponta e vértice do trecho |
| Integração da tubulação aos demais componentes | E | ❌ | o equipamento não é ponta de trecho (achado 1) |

## 9. Dutos de climatização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento de dutos | E | ✅ | Menu Mecânica → Duto (`Menu:728-740`), `Trecho` MECANICA |
| Dutos retangulares | E | ❌ | só `bitolaMm` (Ø equivalente); a seção retangular `secaoCalha` é recusada fora do PLUVIAL (`model:5939-5946`) |
| Representação 2D | E | ✅ | rótulo "Ø 200" na cor da disciplina |
| Representação 3D | E | 🟡 | cilindro (`3D:1123-1160`) |
| Modelagem realista dos dutos | E | ❌ | sem seção retangular, flange, isolamento |
| Curvas | E | ❌ | sem peça de curva de duto |
| Mudanças de direção | E | 🟡 | trechos encadeados, sem peça |
| Conexões | E | ❌ | `conexoes:148` |
| Acessórios | E | ❌ | §10 |
| Simbologias 3D personalizáveis em condutos retangulares | E | ❌ | não há retangular |

## 10. Acessórios de climatização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Função de lançamento de acessórios integrada às redes | E | ❌ | não existe para MECANICA |
| Conexões | E | 🟡 | o derivador de conexões existe (`conexoes:191`), mas filtra MECANICA (`conexoes:148`) |
| Derivações | E | 🟡 | idem (tê) |
| Reduções | E | 🟡 | idem (redução) |
| Curvas | E | 🟡 | idem (curva 90/45) |
| Bocais | E | ❌ | §5 |
| Caixas | E | ❌ | caixa plenum/distribuição |
| Adaptadores | E | ❌ | |
| Componentes da linha frigorígena | E | ❌ | derivador VRF, porca flange, união |
| Acessórios de dutos | E | ❌ | damper, colarinho, junta flexível |

## 11. Kits de climatização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Agrupar componentes usados em conjunto | E | 🟡 | `blueprint_kits_de_insercao` por organização (`Kits:63-127`); só dispara por `Terminal`, então o componente evaporadora não aciona kit |
| Kit Split (evaporadora + condensadora + linha + isolamento + conexões + dreno + acessórios) | E | ❌ | faltam linha, isolamento, dreno e conexões como peças |
| Kit no quantitativo e no orçamento | E | 🟡 | `blueprint_composicoes_de_peca` é genérico por disciplina; a tela só lista hidráulica e incêndio (`components/blueprint/PainelComposicoesDePeca.tsx:17`) |

## 12–14. Ambientes, temperatura de projeto e clima

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 12 · Delimitação do ambiente por polígono | E | ✅ | `Space` derivado das paredes (`model:737`) |
| 12 · Ambientes retangulares | E | ✅ | idem |
| 12 · Ambientes irregulares | E | ✅ | idem, com furos |
| 12 · Nome do ambiente | E | ✅ | `SpaceLabel.name` (`model:880`) |
| 12 · Edição dos vértices | E | 🟡 | o ambiente vem das paredes; edita-se a parede, não há polígono avulso de ambiente |
| 12 · Coordenadas X, Y e Z | E | 🟡 | XY do contorno + elevação do nível; sem Z por vértice |
| 12 · Área do ambiente | E | ✅ | `QuantidadeAmbiente` (`quant:209`) |
| 12 · Propriedades específicas de climatização | E | ❌ | `SpaceLabel` não tem bolsa de parâmetros (achado 6) |
| 13 · Temperatura-meta por ambiente | E | ❌ | |
| 13 · Condições internas | E | ❌ | umidade relativa interna |
| 13 · Consideração das condições externas | E | ❌ | §14 |
| 14 · Altitude | E | 🟡 | `Georreferencia.elevacaoM` (`model:3611`) |
| 14 · Temperatura de bulbo seco | E | ❌ | nenhuma tabela climática; precedente de tabela por cidade em `Pluvial:71` |
| 14 · Temperatura de bulbo úmido | E | ❌ | idem |
| 14 · Parâmetros térmicos dos cálculos | E | 🟡 | λ por material e U pela NBR 15220 (`Mat:123`) |

## 15–17. Janelas, orientação e proteção solar

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 15 · Largura | E | ✅ | `Opening.widthMm` (`model:497`) |
| 15 · Altura | E | ✅ | `Opening.heightMm` |
| 15 · Área | E | ✅ | derivada |
| 15 · Transmissão térmica | E | ❌ | sem U do vidro nem do caixilho |
| 15 · Insolação | E | 🟡 | horas de sol na fachada com a vizinhança (`Insol:238`); falta o ganho (fator solar × radiação) |
| 15 · Orientação solar | E | ✅ | azimute da fachada (`GrafoEsp:179`) |
| 16 · As oito orientações (N, NE, L, SE, S, SO, O, NO) | E | ✅ | `PONTOS_CARDEAIS` e `pontoCardeal` (`GrafoEsp:46, 187`), girados pelo norte declarado |
| 17 · Sem proteção | E | ❌ | não há proteção solar na esquadria |
| 17 · Película simples | E | ❌ | |
| 17 · Película + cortina | E | ❌ | |
| 17 · Película refletiva + cortina | E | ❌ | |
| 17 · Fator de sombreamento | E | 🟡 | brise como geometria por face de parede (`model:293-308`), sem fator numérico |

## 18–20. Paredes, teto e piso

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 18 · Paredes externas | E | ✅ | `paredeEhExterna` (`exterior:25`) |
| 18 · Paredes internas | E | ✅ | idem (o outro lado é um ambiente) |
| 18 · Orientação | E | ✅ | fachada por ambiente com azimute (`GrafoEsp:179-187`) |
| 18 · Temperatura adjacente | E | ❌ | não se sabe se o vizinho é climatizado |
| 18 · Resistência térmica | E | 🟡 | `desempenhoTermico` (`Mat:123`) existe, mas o painel só mostra U de piso e forro (`PainelAcab:238`, achado 4) |
| 18 · Área | E | ✅ | face por ambiente derivável (comprimento × pé-direito − vãos) |
| 18 · Diferença de temperatura | E | ❌ | |
| 18 · Ganho térmico | E | ❌ | |
| 19 · Laje interna | E | ❌ | não há "o que está acima do ambiente" (achado 7) |
| 19 · Laje externa | E | ❌ | idem |
| 19 · Laje externa com isolamento | E | ❌ | laje e telhado sem camadas (`model:1180`) |
| 19 · Temperatura do ambiente adjacente | E | ❌ | |
| 19 · Área | E | ✅ | área do ambiente |
| 19 · Resistência térmica | E | 🟡 | só o forro tem camadas (`model:814`) |
| 19 · Diferença de temperatura | E | ❌ | |
| 20 · Área | E | ✅ | área do ambiente |
| 20 · Temperatura do ambiente adjacente | E | ❌ | sem "sobre o solo / pilotis / ambiente abaixo" |
| 20 · Resistência térmica | E | 🟡 | camadas do piso no acabamento (`PainelAcab:238`) |
| 20 · Diferença de temperatura | E | ❌ | |
| 20 · Calor sensível | E | ❌ | |

## 21–25. Cargas internas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 21 · Quantidade de pessoas | E | 🟡 | população por dormitório (`Reserv:66`) e m²/pessoa de saída (`Saidas:44`); nenhuma é ocupação térmica |
| 21 · Tipo de atividade | E | ❌ | |
| 21 · Calor sensível por pessoa | E | ❌ | |
| 21 · Calor latente por pessoa | E | ❌ | |
| 21 · Categorias de atividade (leve/sentado … maior movimento) | E | ❌ | |
| 22 · Iluminação | E | 🟡 | `Terminal.potenciaW` das luminárias, mínimo da NBR 5410 (`Distr:574`) |
| 22 · Potência instalada | E | 🟡 | soma por ambiente derivável; sem W/m² quando não há luminária |
| 22 · Contribuição para a carga sensível | E | ❌ | |
| 23 · Equipamentos | E | 🟡 | potência dos pontos de uso específico; é VA, não calor dissipado |
| 23 · Aparelhos | E | 🟡 | idem |
| 23 · Cargas internas diversas | E | ❌ | |
| 24 · Fontes de calor das aberturas | E | ❌ | infiltração por porta e janela |
| 25 · Calor sensível informado | E | ❌ | |
| 25 · Calor latente informado | E | ❌ | |
| 25 · Calor total informado | E | ❌ | |

## 26–30. Resultado e norma

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 26 · Carga sensível em W | E | ❌ | |
| 26 · Carga sensível em BTU/h | E | ❌ | |
| 27 · Carga latente | E | ❌ | |
| 28 · Carga total = sensível + latente | E | ❌ | |
| 28 · Resultado por ambiente em BTU/h | E | ❌ | |
| 29 · Atualização vinculada ao modelo | E | 🟡 | o molde (derivado recalculado a cada comando, como o quantitativo) existe; falta o motor |
| 30 · Critérios da NBR 16655-3 | E | ❌ | PDF ausente: CONFERIR NA NORMA |

## 31–37. Biblioteca e cadastro

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 31 · Cadastro nativo: Split | E | 🟡 | duas fichas de reserva |
| 31 · Cadastro nativo: VRF | E | ❌ | |
| 31 · Cadastro nativo: evaporadoras | E | 🟡 | hi-wall só |
| 31 · Cadastro nativo: condensadoras | E | 🟡 | ficha única |
| 31 · Cadastro nativo: exaustores | E | 🟡 | reserva |
| 31 · Cadastro nativo: bocais | E | ❌ | |
| 31 · Cadastro nativo: caixas de distribuição | E | ❌ | |
| 31 · Cadastro nativo: bombas de drenagem | E | ❌ | |
| 31 · Cadastro nativo: tubulações | E | 🟡 | cobre existe para água |
| 31 · Cadastro nativo: dutos | E | 🟡 | redondo, sem material (`MATERIAIS_DA_DISCIPLINA` sem MECANICA, `model:2557`) |
| 31 · Cadastro nativo: kits de linhas frigorígenas | E | ❌ | |
| 32 · Criação de novas peças | E | 🟡 | catálogo por organização (`blueprint_element_types`, família COMPONENTE); sem campos de climatização |
| 33 · Edição de peças existentes | E | 🟡 | as sementes ficam no código e a organização edita as suas |
| 34 · Informações técnicas | E | 🟡 | propriedades em JSONB; capacidade e vazão não existem no kernel |
| 35 · Itens associados (composição) | E | 🟡 | `blueprint_composicoes_de_peca` genérico; a tela não lista MECANICA (`PainelComposicoesDePeca.tsx:17`) |
| 36 · Simbologia 2D | E | 🟡 | símbolos fixos no canvas; molde de fonte única em `utils/blueprintSimbolosIncendio.ts` |
| 37 · Objeto 3D | E | ❌ | todo o 3D é procedural; não há geometria cadastrável por peça |

## 38–45. Documentação

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 38 · Plantas de climatização | E | 🟡 | a planta de forro mostra dutos e difusores (`Forro:41`), mas é vista, não prancha; `TipoDePrancha` sem climatização (`Pranchas:159`) |
| 39 · Detalhes técnicos | E | ❌ | só incêndio e hidráulica têm detalhes típicos |
| 40 · Detalhes isométricos | E | ❌ | `RedeDaPrancha` = água, esgoto, incêndio (`PHidro:27`) |
| 41 · Cortes | E | 🟡 | duto cortado como caixa de `bitolaMm` (`Corte:325`) |
| 42 · Representações realistas | E | ❌ | |
| 43 · Indicações gráficas | E | 🟡 | rótulo "Ø" no duto; sem tag de equipamento nem de vazão |
| 44 · Legendas | E | ❌ | legendas só elétrica e incêndio |
| 45 · Personalização das legendas | E | ❌ | |

## 46–51. Quantitativos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 46 · Quantitativo automático (lista de materiais) | E | 🟡 | duto em `porBitola`, terminal em `porTerminal` (P2.2); sem lista de materiais de climatização |
| 47 · Quantitativo do projeto completo | E | 🟡 | idem |
| 48 · Quantitativo por pavimento | E | ✅ | `utils/blueprintQuantitativosPorPavimento.ts:81` |
| 49 · Quantitativo por detalhe | E | ❌ | |
| 50 · Separação por componente/rede | E | 🟡 | por disciplina; sem sistema (VRF 1, VRF 2…) |
| 51 · Quantificação baseada no modelo | E | ✅ | `computeQuantities` sobre o modelo único |

## 52–59. BIM e interoperabilidade

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 52 · Modelagem BIM de climatização | E | 🟡 | §1 |
| 53 · Importação IFC | E | 🟡 | arquitetura, estrutura, elétrica e incêndio; climatização não |
| 54 · Exportação IFC | E | 🟡 | `IfcDuctSegment` (`Ifc:2127`), `IfcUnitaryEquipment`, `IfcFan` ✅; sem `IfcDuctFitting`, `IfcAirTerminal` (o difusor sai `IFCFLOWTERMINAL`, `Ifc:2647`), sistema (`Ifc:2104-2111`) nem Pset; e a frase de cobertura mente (achado 9) |
| 55 · OpenBIM | E | ✅ | IFC4 e IFC4X3, BCF |
| 56 · Modelos BIM externos como referência | E | ❌ | o fundo da Planta é só PDF ou imagem (`Underlay:415`); o visualizador IFC é outro módulo |
| 57 · Importação de arquitetura/estrutura | E | ✅ | IFC (paredes, aberturas, estrutura) e DXF (paredes) |
| 58 · Importação RVT/RTE | E | ❌ | recusada de propósito, com orientação de exportar (`Underlay:432`); achado 13 |
| 59 · DWG/DXF como referência | E | 🟡 | o DXF vira paredes; como fundo vetorial é recusado |

## 60–62. Compatibilização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 60 · Junto com estrutura | E | ✅ | camadas + clash |
| 60 · Junto com arquitetura | E | ✅ | |
| 60 · Junto com elétrica | E | ✅ | |
| 60 · Junto com hidráulica | E | ✅ | |
| 60 · Junto com sanitária | E | ✅ | |
| 60 · Junto com incêndio | E | ✅ | |
| 60 · Junto com gás | E | ❌ | não há disciplina de gás |
| 60 · Junto com SPDA | E | ❌ | não há SPDA |
| 60 · Junto com cabeamento | E | ❌ | não há cabeamento estruturado |
| 61 · Compatibilização visual 3D | E | ✅ | destaque do conflito no 3D e camadas em meio-tom |
| 62 · Duto × viga | E | ✅ | trecho × estrutura (P2.2), com volume de cilindro (`conflitos:282`) |
| 62 · Tubulação × estrutura | E | 🟡 | vale para qualquer trecho; a linha frigorígena não existe |
| 62 · Evaporadora × elemento arquitetônico | E | ✅ | `RESERVA_X_PAREDE`/`RESERVA_X_COMPONENTE` (`confArq:369`) |
| 62 · Condensadora × arquitetura | E | ✅ | idem |
| 62 · Redes de climatização × outras instalações | E | 🟡 | rede × rede entre disciplinas; duto retangular seria sub-modelado como cilindro; sem trecho × equipamento |

## 63–75. Recursos gerais

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 63 · Croqui 2D | E | ✅ | canvas da Planta |
| 64 · Vista 3D | E | ✅ | `3D` |
| 65 · Croqui + 3D simultaneamente | E | ❌ | `Ed:1719` |
| 66 · Caixa de corte 3D | E | ❌ | sem `clippingPlanes` |
| 67 · Movimentação diretamente no 3D | E | ❌ | sem manipulador |
| 68 · Seleção múltipla 3D | E | ❌ | um id por clique |
| 69 · Visibilidade independente dos modelos IFC | E | ❌ | não há modelo IFC carregado como referência na Planta (achado 13) |
| 70 · Planos de corte | E | 🟡 | corte 2D ✅; plano no 3D ❌ |
| 71 · Captura de pontos/referências | E | ✅ | OSNAP (`Encaixe:47-60`) |
| 72 · Indicação de problemas durante o lançamento | E | 🟡 | marcas no desenho só para hidráulica e incêndio (`Verif:91`) |
| 73 · Blocos inteligentes | E | 🟡 | componente com ficha que lança o ponto elétrico (`PtsHidro:372`) |
| 74 · Replicação/edição de elementos | E | ✅ | `DuplicateEntities` (`commands:1409`); `DuplicateLevel` não leva componentes (achado 12) |
| 75 · Pavimentos e níveis | E | ✅ | `Level` (`model:45`) |

## 76. O ciclo fechado — o que o AltoQi não faz

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Selecionar automaticamente o aparelho por catálogo | A | ❌ | |
| Verificar se o equipamento atende à carga calculada | A | ❌ | |
| Pré-dimensionamento Split | A | ❌ | |
| Pré-dimensionamento VRF (taxa de combinação, derivadores) | A | ❌ | |
| Otimizar a localização dos equipamentos | A | ❌ | precedentes: centro de cargas da elétrica, propostas gulosas do incêndio |
| Gerar automaticamente a rede frigorígena | A | ❌ | precedente: rota pelas paredes com Steiner + desvio estrutural |
| Drenos: traçado, declividade, bomba | A | 🟡 | planejador de esgoto e declividade mínima já existem |
| Dimensionamento automático de dutos | A | ❌ | |
| Cálculo de vazão | A | ❌ | |
| Perda de carga | A | 🟡 | Darcy-Weisbach + Swamee-Jain da água (`utils/blueprintHidraulicaPressao.ts`) |
| Balanceamento aeráulico | A | ❌ | |
| Renovação de ar (NBR 16401-3) | A | ❌ | |
| Exaustão (banheiro sem janela, cozinha) | A | ❌ | |
| Otimização de rotas | A | 🟡 | Steiner pelas paredes, desvio de pilar e viga |
| Ponto elétrico e circuito do aparelho | A | 🟡 | ponto automático ✅; circuito pelo motor de circuitos, com potência fixa de 1400 VA (`Potencia:58`) |
| Orçamento do sistema (lançamento por peça, composição) | A | 🟡 | molde do hidro/incêndio; MECANICA fora de `REDES_HIDROSSANITARIAS` (`Budget:1583`) |
| Geração automática do projeto inteiro | A | ❌ | molde `gerarPpci` |
| Simulação CFD | N | ❌ | fora do escopo |
| Análise energética anual | N | ❌ | fora do escopo |

## O modelo único

A regra é a mesma das outras três disciplinas: só se grava o que o projetista decide, e o resto é
derivado a cada mudança.

- **O que passa a ser guardado:**
  - os **equipamentos como peças da rede** (evaporadoras por tipo, condensadoras split e VRF,
    exaustor, bomba de dreno, caixa de distribuição, derivador, ponto genérico), com ficha:
    capacidade nominal, potência elétrica, medidas, folga, cota;
  - trechos de **linha frigorígena** (o par líquido/sucção, isolamento), de **dreno** e de **duto**
    (redondo ou retangular, material);
  - as relações por id: evaporadora → condensadora/sistema;
  - na envoltória: **vidro e proteção solar** da esquadria, **camadas** do telhado e da laje,
    absortância da face externa;
  - as **premissas do estudo** (`blueprint_study_climatizacao`): cidade e condições externas,
    setpoint, e por ambiente (pelo `uid` da etiqueta) climatizado sim/não, pessoas, atividade,
    iluminação e equipamentos declarados, fonte personalizada;
  - no cadastro por organização: modelos com capacidade, kits e composição por peça.
- **O que é derivado, e nunca copiado:**
  - a exposição de cada face do ambiente (parede externa e orientação; teto sob cobertura, laje
    exposta ou outro ambiente; piso sobre solo, pilotis ou outro ambiente);
  - a carga térmica por parcela, sensível, latente e total, em W e BTU/h;
  - o equipamento sugerido e o "atende / não atende";
  - diâmetros da linha, vazões, seções de duto, perdas de carga, renovação exigida;
  - conexões, numeração, pranchas, memorial, IFC, clash, quantitativo e orçamento.
- **Onde a regra precisa de peça nova no modelo**, o que ordena o roadmap: vidro na esquadria,
  camadas no telhado e na laje, equipamento com capacidade na rede, as disciplinas `FRIGORIGENA` e
  `DRENO_AC`, isolamento e curva no trecho, a seção retangular no duto, a relação de sistema VRF.

## Leitura geral

Contagem feita por script sobre as tabelas das seções 1–76: 247 linhas, sendo os itens do pedido
na ordem dele mais os desdobramentos que o próprio texto pede (cada orientação, cada proteção
solar, cada parcela da carga, cada disciplina da compatibilização) e o §76 com o ciclo fechado.

| Grau | ✅ | 🟡 | ❌ | Total |
|---|---|---|---|---|
| **E** | 51 | 83 | 94 | 228 |
| **A** | 0 | 5 | 12 | 17 |
| **M** | 0 | 0 | 0 | 0 |
| **B** | 0 | 0 | 0 | 0 |
| **N** | 0 | 0 | 2 | 2 |
| **Total** | 51 | 88 | 108 | 247 |

**O que isso diz:**

- **Dos 228 Essenciais, 51 estão prontos (22 %).** É mais do que o incêndio tinha no dia do seu
  benchmark (4 %), porque o HVAC mínimo de 20/09 deixou o lugar dos equipamentos, o duto e a aba, e
  porque a envoltória (ambiente, parede externa, orientação, U, norte, sol) já existia para outras
  contas. Nenhum dos 51 é climatização de verdade: são herança.
- **83 Essenciais são 🟡.** A peça genérica existe (trecho, terminal, componente, conexão derivada,
  catálogo, kit, composição, prancha, memorial, IFC, clash) e a climatização precisa se ligar nela.
  Foi o padrão das três disciplinas anteriores.
- **O que não existe em lugar nenhum** e é trabalho novo de verdade: o **motor de carga térmica** e os
  dados que só ele pede (vidro, telhado, exposição do teto e do piso, clima), o **equipamento com
  capacidade na rede**, a **linha frigorígena com curva**, o **duto retangular** e o **editor 3D**
  (caixa de corte, mover, seleção múltipla, 2D + 3D). Todo o resto é extensão.
- **Os 17 A são o ciclo fechado do usuário**: seleção por catálogo e "atende / não atende",
  posicionamento, traçado, dutos por vazão, renovação, exaustão, dreno, gerador. Cinco deles já têm
  precedente (planejador de esgoto, perda de carga da água, Steiner pelas paredes, ponto elétrico,
  orçamento por peça).

**O caminho crítico: os 177 Essenciais ❌/🟡 agrupados pelo que precisam no código** (cada seção
está em exatamente um bloco; a soma foi conferida por script):

| # | Bloco | Itens E | Seções | Peça principal que falta |
|---|---|---|---|---|
| 1 | **Modelo e cadastro da disciplina** | 45 | 2, 3, 4, 5, 6, 11, 31 | equipamento como peça da rede com capacidade, VRF, tipos de evaporadora, bomba de dreno, caixa, ponto genérico com ficha, símbolo, objeto 3D, kit disparado pelo equipamento |
| 2 | **Linhas frigorígenas, tubulações e dreno** | 17 | 7, 8 | disciplinas `FRIGORIGENA` e `DRENO_AC`, par isolado, curva com raio, conexões, integração ao equipamento |
| 3 | **Dutos e acessórios** | 18 | 9, 10 | seção retangular, material, conexões e acessórios de duto, bocal, caixa plenum, damper |
| 4 | **Carga térmica: dados e motor** | 53 | 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 | propriedades do ambiente, clima por cidade, vidro e proteção solar, camadas de telhado e laje, exposição derivada, pessoas por atividade, motor sensível/latente/total pela NBR 16655-3 |
| 5 | **Documentação** | 8 | 38, 39, 40, 41, 42, 43, 44, 45 | prancha, isométrico, detalhes, legenda, tags, memorial e ART de climatização |
| 6 | **Quantitativo** | 4 | 46, 47, 48, 49, 50, 51 | lista de materiais, por detalhe e por sistema, lançamento por peça |
| 7 | **BIM e compatibilização** | 11 | 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62 | `IfcDuctFitting`, `IfcAirTerminal`, Pset, importar climatização, modelo externo como referência, clash com volume retangular e trecho × equipamento |
| 8 | **Editor geral** | 21 | 1, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75 | caixa de corte 3D, mover e seleção múltipla no 3D, 2D + 3D lado a lado, alinhar/arranjo, marcas de verificação, nível intermediário |
| | **Total** | **177** | | |

## Achados

Não são funcionalidade, mas precisam de decisão antes do roadmap. Vieram das três leituras e foram
reabertos na frente.

1. **Equipamento: componente ou peça da rede?** Hoje a evaporadora e a condensadora são
   `Componente` (`model:1831`), uma reserva de espaço. Rede, kit (`Kits:63` recebe `Terminal`),
   numeração e conexões só falam com `Terminal`. **Proposta:** o equipamento vira tipo de ponto da
   rede com ficha (molde `TIPOS_DE_PONTO_HIDRAULICO`, `model:2796`), com a folga da reserva
   preservada. O componente antigo é lido como legado, como o `protecaoDR` virou DR peça na
   elétrica.
2. **Uma disciplina ou três?** `MECANICA` hoje é só ar. A linha frigorígena (par de cobre isolado,
   pressão de fluido refrigerante) e o dreno (gravidade, PVC) têm física diferente. **Proposta:**
   `FRIGORIGENA` e `DRENO_AC` como valores novos de `DisciplinaDeRede`, o que o comentário de
   `model:2481` já prevê. `MECANICA` continua sendo ar. O par líquido/sucção é **um** trecho com
   dois diâmetros, porque os dois correm sempre juntos; o IFC emite dois segmentos.
3. **Pé-direito em duas versões.** `peDireitoUtilMm` (`Acab:134`) desconta piso, forro e rebaixo;
   `forroDoAmbiente` (`Forro:41`) desconta só o rebaixo. O volume do ambiente precisa de uma só.
4. **O U da parede não aparece.** `desempenhoTermico` (`Mat:123`) está ligado só ao piso e ao forro
   no painel de acabamentos (`PainelAcab:238`), e lá com Rsi 0,17.
5. **As premissas de insolação moram no navegador** (`usePersistedState('blueprint:insolacao')`,
   `Ed:3019`), com latitude padrão de Brasília (`Insol:54`). A carga térmica precisa delas no
   estudo. Molde: o hidro adotou o que o navegador tinha na primeira abertura.
6. **`SpaceLabel` não tem bolsa de parâmetros.** Ocupação, atividade e setpoint por ambiente vão nas
   premissas do estudo indexadas pelo `uid` da etiqueta (sem bump), não no kernel. O `id` do
   `Space` muda a cada rederivação e não serve de chave.
7. **Ninguém sabe o que está acima ou abaixo de um ambiente.** Há precedentes parciais (laje
   descoberta no pluvial, `Pluvial:144`; cobertura no ponto, na ventilação de esgoto; último
   pavimento no incêndio), mas nenhuma derivação "teto = cobertura / laje exposta / outro
   ambiente". É a peça nova da E1.3.
8. **Nenhuma NBR de climatização está na pasta.** NBR 16655-3 (carga térmica residencial),
   16655-1/2 (instalação de split) e 16401-1/2/3 (projeto, conforto, qualidade do ar). Até o PDF
   chegar, toda constante leva "CONFERIR NA NORMA" no código, na tela e no memorial. As tabelas de
   diâmetro de linha e de comprimento máximo são **de fabricante**: hipótese nomeada, nunca norma.
9. ⚠️ **Defeito: o IFC mente sobre a cobertura.** `Ifc:185` diz "NÃO CONTÉM ar-condicionado nem
   gás", mas `Ifc:133-135` e `Ifc:2596-2600` emitem duto e split desde 20/09. O teste
   `__tests__/blueprintTrocaDeArquivos.test.ts:380` **fixa a frase falsa**. É a mesma lição da E7.1
   da elétrica e da E9.3 do incêndio.
10. ⚠️ **A medida "pontos hidráulicos" conta difusor.** `CONTAGEM_PONTOS_HIDRAULICOS` (`Budget:1088`)
    filtra só `!== 'ELETRICA'`, então todo terminal MECANICA entra nela. O rótulo da linha diz
    "Mecânica", e por isso quem casa o de-para pelo texto não erra, mas a medida mente pelo nome.
11. **`SISTEMA_IFC` não tem MECANICA** (`Ifc:2104-2111`): o `IfcDistributionSystem` do duto sai com
    tipo `$` (`Ifc:1129`). Deve ser `.AIRCONDITIONING.`/`.VENTILATION.`.
12. **`DuplicateLevel` não copia componentes** (`commands:5182` em diante: copia quadros, terminais e
    trechos). O pavimento-tipo duplicado perde splits, louças e mobiliário.
13. **RVT/RTE e modelo externo.** O RVT é formato fechado; o caminho do ÒPURA é o IFC exportado do
    Revit. Ler RVT direto exigiria serviço externo pago (Autodesk Platform Services). Fica **E** pela
    régua, mas no backlog com a dependência dita. O "modelo externo como referência" (§56, §69) é
    outra coisa e cabe no roadmap: carregar um IFC como camada só de leitura no 3D da Planta.

---

# Parte 2 — Roadmap: paridade com o AltoQi Climatização e o ciclo fechado

## Corte e ordem

| Entra | Fica para o backlog (registrado no fim) |
|---|---|
| Os Essenciais pendentes e os **A** do ciclo fechado, porque o usuário os pediu | RVT/RTE direto (achado 13), gás, SPDA e cabeamento como disciplinas, edição no isométrico, catálogos reais de fabricantes, chiller/água gelada/fancoil (o AltoQi não lista), CFD e energia anual (N) |

**Ordem e por quê:**
- **E0 primeiro**: é barata, não mexe no kernel, guarda as premissas e corrige os defeitos 9–12.
- **A envoltória (E1) e o motor de carga (E2) antes do equipamento**: o ciclo começa no ambiente, e a
  seleção da E4 precisa da carga. É também o que o AltoQi trouxe de novo em 2026-08.
- **O modelo (E3) antes de qualquer traçado**: sem o equipamento na rede não há linha, dreno nem kit.
- **Split (E4, E5) antes de VRF (E6)**: decisão do usuário, e o VRF reusa a linha da E5.
- **Dutos (E7) depois do VRF**: são o sistema comercial; reusam a perda de carga da água e a vazão
  da renovação.
- **Documentação (E8), quantitativo (E9) e BIM/editor (E10) fecham.** Cada etapa anterior já
  acrescenta sua regra à conferência e sua seção ao memorial.
- **O gerador (E11) é só orquestração** dos motores que as etapas anteriores deixaram prontos.

Previsão: **5 bumps de kernel** (E1, E3, E5, E6, E7; de 0.90 a ~0.95) e **2 de quantitativo**
(E0, E9).

## Regras que valem para todas as fases

- **REGRA #8:** uma frente por etapa (`bash scripts/nova-frente.sh clima-e<N>`); o push em `main` é o
  deploy e o `conferir-producao.sh` é a prova, seguido do check-run `ci`. Ritual de cada fase: `tsc`
  (Git Bash, heap 8 GB), suíte cheia (só vale com a conta do reporter JSON fechando, `pending` = 0),
  `check-ui-standard` nos `.tsx` tocados, `check-xss-sinks`, harness visual quando há desenho
  (molde `docs/spikes/prancha-hidro`, Edge headless), plano atualizado, commit, push e conferência de
  fora.
- **Modelo único:** só se grava o que o projetista decide. Carga, exposição, equipamento sugerido,
  diâmetros, vazões, conexões, numeração, memorial e quantitativo são **derivados**. Quando um
  derivado admite ajuste (modelo do equipamento, diâmetro, seção), vale "o declarado vence o
  sugerido, e o sugerido sai marcado".
- **Kernel:** campo ou entidade nova no canônico exige bump de `KERNEL_VERSION` e dos goldens (pinos
  trocados por script sobre o glob, nunca por `grep | head`), `node scripts/build-planta-api-kernel.mjs`
  e o redeploy da `planta-api`, provado com `GET /v1/estudos` sem token = 401. Mudança de quantitativo
  sobe `POLITICA_PADRAO.version`. Mudança de premissa muda o hash da base das emissões.
- **Norma com fonte:** toda constante cita a norma e o item. O que foi transcrito de memória leva
  **"CONFERIR NA NORMA"** no código, no painel e no memorial até o PDF chegar. Tabela de fabricante é
  **hipótese** com nome, nunca norma. Toda folga é hipótese editável.
- **Conferência em três estados + "não avaliada"**: regra nova entra na conferência, nas marcas do
  desenho, na emissão e no memorial no mesmo commit.
- **Automático segue o molde:** propõe → prévia → um `runBatch` → Ctrl+Z, com `conferirPlano` quando
  prevê ids. Todo proponente novo entra no teste-lei `__tests__/propostasIdempotentes.test.ts` (propor
  → aplicar → analisar = 0 falta; a 2ª proposta vem vazia).
- **Prova na planta real** só em estudo descartável, conferindo o banco depois.
- **Arquivo novo:** `ls` antes do `Write`.

---

## Etapa 0 — Premissas, clima e trilhos · migration + quant bump · 4 fases

| Fase | Entrega (o que muda) | Pronto quando (como sei que terminou) |
|---|---|---|
| 0.1 Premissas do estudo | Tabela `blueprint_study_climatizacao` (uma linha por estudo, `hipoteses` JSONB, FK composta, UNIQUE, RLS por organização; molde `aplicar_20270930000001_blueprint_study_incendio.sql`). Hook `useBlueprintClimatizacao` (molde `useBlueprintIncendio`). Grupo "Premissas de climatização" na aba Mecânica. Migration só com OK do usuário | teste do leitor da coluna; a premissa gravada volta depois de recarregar num estudo descartável |
| 0.2 Condições externas | Tabela por cidade (TBS, TBU, altitude, latitude; CONFERIR NA NORMA), cidade declarada > cidade do empreendimento > capital pela latitude; altitude da georreferência quando há. Insolação (data, latitude manual) passa para o estudo, adotando o do navegador na 1ª abertura (achado 5) | teste: estudo sem cidade usa a capital mais próxima e diz isso; insolação gravada volta após recarregar |
| 0.3 Dados por ambiente | Premissas por `uid` da etiqueta (achado 6): climatizado, setpoint, pessoas, atividade, iluminação (declarada ou W/m²), equipamentos (W), fonte personalizada. Padrão pelo uso (`Prog:327`) como hipótese. Pé-direito único (achado 3); U da parede no painel (achado 4) | teste: renomear o ambiente mantém o dado; apagar a etiqueta some com ele; o painel mostra U da parede igual ao `desempenhoTermico` |
| 0.4 Trilhos | Frase do IFC e o teste que a fixa (achado 9); `SISTEMA_IFC` com MECANICA (achado 11); medida de pontos hidráulicos sem MECANICA + medida própria de terminais de ar (achado 10, quant bump); `DuplicateLevel` copia componentes (achado 12) | testes dos quatro; goldens inalterados (se mudarem, é bump e vai dito) |

## Etapa 1 — Envoltória térmica no modelo · kernel bump · 3 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1.1 Vidro e proteção solar | `Opening.vidro` {tipo, fator solar, U do vidro, proteção SEM/PELICULA/PELICULA_CORTINA/REFLETIVA_CORTINA, fator de sombreamento}, também no catálogo de esquadrias; canônico omitido quando ausente | goldens; teste de invariante (fator entre 0 e 1); o painel da janela edita e o Ctrl+Z desfaz |
| 1.2 Camadas no telhado e na laje | camadas em `Agua` e na LAJE, U pela `desempenhoTermico`; absortância/cor da face externa da parede como hipótese do estudo | teste de U contra a conta à mão; telhado sem camadas = "não avaliado" |
| 1.3 Exposição derivada | `utils/blueprintExposicaoTermica.ts`, puro: para cada ambiente, as faces com área, orientação e o que há do outro lado (exterior, ambiente climatizado ou não, cobertura, laje exposta, solo, pilotis) — reusa `paredeEhExterna`, a laje descoberta do pluvial e a sobreposição entre níveis (achado 7) | testes com sobrado (térreo sobre solo, superior sob telhado), apartamento intermediário e cobertura com terraço |

## Etapa 2 — Motor de carga térmica (NBR 16655-3) · sem bump · 4 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 2.1 Condução | `utils/blueprintCargaTermica.ts`, puro: paredes, teto, piso e vidro por U × A × ΔT corrigido por orientação e cor (tabelas CONFERIR NA NORMA) | teste de cada parcela contra a conta à mão |
| 2.2 Insolação e cargas internas | ganho solar por janela (orientação × fator solar × proteção), pessoas por atividade (sensível e latente), iluminação, equipamentos, infiltração pelas aberturas, fonte personalizada | teste: virar o norte 180° troca a parcela solar entre as fachadas; ambiente sem dado = "não avaliado" |
| 2.3 Painel e planta | painel "Carga térmica" por ambiente (parcelas, sensível, latente, total em W e BTU/h); rótulo BTU/h no ambiente e mapa de calor na planta; recalcula a cada comando; conferência em três estados | harness do canvas; mover uma parede muda o número sem salvar nada |
| 2.4 Prova independente e memorial | caso calculado fora do código (planilha) e sonda dos números; bloco "Memorial de carga térmica" (PDF/DOCX pelo serviço do hidro) | o caso fecha dentro de 1 %; o PDF lido mostra BTU/h e os sinais certos |

## Etapa 3 — Modelo da disciplina · kernel bump · 4 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 3.1 Equipamento na rede | tipos de climatização com ficha (achado 1): evaporadora hi-wall, piso-teto, cassete, dutada; condensadora split e VRF; exaustor; bomba de dreno; caixa de distribuição; derivador VRF; ponto genérico. Capacidade, potência, medidas, folga, cota; relação de sistema (evaporadora → condensadora, por índice no canônico). Componente antigo lido como legado + "Converter reserva em equipamento" | goldens; teste "desenha ≠ alcança" (menu, 2D, 3D, quantitativo, IFC); reserva antiga abre igual |
| 3.2 Disciplinas `FRIGORIGENA` e `DRENO_AC` | valores novos (achado 2) nas tabelas `Record<DisciplinaDeRede,…>` (`Rede:36-345`, camadas, IFC, Collada); trecho frigorígeno com diâmetro de líquido e de sucção e `isolamentoMm`; materiais por disciplina (cobre; PVC); conexões derivadas para as três redes de climatização | `tsc` limpo depois dos `Record`; teste de conexões num L e num tê de cada disciplina |
| 3.3 Terminais de ar | taxonomia fechada (difusor, grelha de insuflamento e de retorno, bocal, tomada de ar exterior, veneziana, caixa plenum, damper), o texto livre lido como legado; `especificacaoDoTerminal` com capacidade e vazão | o terminal antigo "Difusor" vira o tipo novo sem perder nada |
| 3.4 Símbolo, numeração e kit | `utils/blueprintSimbolosClimatizacao.ts` (fonte única, molde do incêndio), forma 3D melhor; numeração derivada (EV-n, CD-n); kit disparado pelo equipamento; marcas de verificação da climatização (`Verif:91`) | harness do canvas e da prancha; inserir o kit cria N peças num Ctrl+Z |

## Etapa 4 — Seleção e posicionamento Split (vai além) · sem bump · 3 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 4.1 Seleção por catálogo | catálogo de capacidades comerciais por organização (sementes 9.000 a 60.000 BTU/h como hipótese); `selecionarEquipamento(carga, catálogo, folga)` → atende / subdimensionado / superdimensionado; regra na conferência | teste: carga de 10.500 BTU/h com folga de 10 % escolhe 12.000; o declarado vence e é conferido |
| 4.2 Posição automática | evaporadora em parede livre (sem vão, longe da porta, 2,20 m) perto da condensadora; condensadora na fachada externa mais próxima ou em ambiente técnico pelo nome, com folga; sem lugar → o relatório pede | harness; idempotência no teste-lei |
| 4.3 Elétrica do aparelho | a potência da ficha substitui os 1400 VA fixos (`Potencia:58`); circuito TUE individual pelo motor de circuitos | teste: trocar 9.000 por 24.000 BTU/h muda a seção do circuito |

## Etapa 5 — Linha frigorígena e dreno · kernel bump · 4 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 5.1 Traçado automático | evaporadora → condensadora pela parede ou pelo forro, com desvio estrutural (`utils/blueprintObstaculosEstruturais.ts`), sugerido | harness; nenhum trecho atravessa pilar |
| 5.2 Dimensionamento | diâmetros de líquido e sucção pela capacidade, comprimento e desnível máximos, carga adicional de gás por metro, espessura do isolamento — hipóteses de fabricante; conferência | teste: linha acima do limite vira FALTA com o motivo |
| 5.3 Curvas | `Trecho.curva {raioMm}` no molde de `arco`; raio mínimo; desenho 2D e 3D do par isolado | goldens; harness do 3D |
| 5.4 Dreno | gravidade com declividade mínima até ralo, ponto de esgoto ou fachada (reusa o planejador de esgoto); sifão; bomba de dreno quando não há queda | teste: evaporadora abaixo do ponto de descarte ganha bomba |

## Etapa 6 — VRF · kernel bump · 3 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 6.1 Sistema | condensadora VRF com N evaporadoras (relação da 3.1), nome do sistema | goldens; trocar a condensadora do sistema por comando |
| 6.2 Pré-dimensionamento | taxa de combinação (Σ evaporadoras / condensadora; limites como hipótese), derivadores pelo somatório a jusante, diâmetro por trecho | teste de uma árvore com 3 níveis de derivação |
| 6.3 Limites e traçado | comprimento total, até a mais distante, após a 1ª derivação, desníveis (hipóteses de fabricante); traçado em árvore (Steiner) | teste-lei de idempotência; harness |

## Etapa 7 — Dutos, ventilação e exaustão · kernel bump · 4 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 7.1 Duto retangular | seção retangular em MECANICA (generalizar `secaoCalha`, `model:5939`), materiais (chapa galvanizada, painel, flexível); 3D, corte e clash com o volume retangular (`conflitos:282`) | goldens; clash de duto 600 × 300 sob viga pega o que o cilindro não pegava |
| 7.2 Vazão e perda de carga | vazão por terminal; dimensionamento por velocidade ou igual atrito; perda de carga (Darcy + coeficientes locais); pressão disponível do equipamento; balanceamento (vai além) | prova independente de um ramal |
| 7.3 Renovação e exaustão | renovação de ar pela NBR 16401-3 (pessoas + área, CONFERIR); exaustão de banheiro sem janela, cozinha e garagem (hipóteses) | teste: banheiro sem janela sem exaustor = FALTA |
| 7.4 Traçado automático | árvore terminal → equipamento no forro, sob a viga (molde da espinha dos sprinklers); acessórios derivados | harness; teste-lei |

## Etapa 8 — Documentação · sem bump (migration) · 4 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 8.1 Prancha | planta de climatização por pavimento (`TipoDePrancha`, `InclusaoNoConjunto`, camada DXF), legenda com o símbolo real, tag de capacidade e vazão | harness SVG → Edge; PDF lido |
| 8.2 Cortes, isométrico e detalhes | duto retangular e linha no corte; isométrico da linha e dos dutos; detalhes típicos (split, suporte da condensadora, dreno com sifão, caixa plenum) só do que existe | harness |
| 8.3 Memoriais | carga térmica, descritivo e cálculo de linha e duto (PDF/DOCX), textos fora do hash | PDF lido sem "?" no lugar de símbolo |
| 8.4 Emissão com ART | migration do CHECK + CLIMATIZACAO, `DisciplinaExecutiva` (`ExecSvc:25`), hash da base (desenho + premissas). Migration só com OK | emitir num estudo descartável; mudar uma premissa invalida a emissão |

## Etapa 9 — Quantitativo e orçamento · quant bump · 3 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 9.1 Quantitativo | equipamento por capacidade; cobre por diâmetro, isolamento, dreno, cabo de interligação, carga de gás, suportes; duto por área de chapa; terminais por tipo e medida; por pavimento, sistema e detalhe | pins de versão trocados por script; teste por medida |
| 9.2 Orçamento | as redes de climatização em `REDES_HIDROSSANITARIAS`/`grupoDaRede` (`Budget:1583`); medidas no de-para; composição por peça (kit split) na tela de composições | prévia com catálogo que só responde ao pedido (molde `blueprintPreviaComposicao.test.ts`) |
| 9.3 Lista de materiais | folha e aba XLSX de climatização | lida no XLSX |

## Etapa 10 — BIM, compatibilização e editor geral · sem bump · 4 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 10.1 IFC | duto retangular, `IfcDuctFitting`, `IfcAirTerminal`, tubo frigorígeno, `Pset_OpuraClimatizacao` (_Declarado/_Derivado/_Calculada); importar climatização (molde do incêndio) | ida e volta pelo web-ifc; esquema IFC4X3 |
| 10.2 Clash | trecho × equipamento, linha × estrutura, dreno × viga; volume retangular | cena de N conflitos e N não-conflitos |
| 10.3 Editor 3D | caixa de corte, mover e seleção múltipla no 3D, 2D e 3D lado a lado — valem para todas as disciplinas | harness do 3D; Ctrl+Z desfaz o mover do 3D |
| 10.4 Referências externas | IFC como camada só de leitura no 3D da Planta, com visibilidade própria; DWG/DXF como fundo vetorial; alinhar e arranjo | harness; o modelo externo não entra no hash |

## Etapa 11 — Gerador de climatização (vai além) · sem bump · 2 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 11.1 Encadeamento | `gerarClimatizacao` (molde `gerarPpci`): carga → equipamento → posição → linha → dreno → elétrica → clash → quantitativo → orçamento, sobre a cópia, ids determinísticos | o lote reaplicado dá os mesmos ids; teste-lei |
| 11.2 Relatório e botão | relatório por grupo (premissa, CONFERIR em uso, o que não decidiu, sem lugar, conflito criado); botão na aba | harness |

## Backlog nomeado

- RVT/RTE direto (achado 13) — depende de serviço externo.
- Gás, SPDA e cabeamento estruturado como disciplinas (para o §60).
- Edição no isométrico; planos XZ/YZ.
- Catálogos reais de fabricantes (capacidades, diâmetros, limites de tubulação).
- Chiller, água gelada e fancoil.
- CFD e simulação energética anual (N).

## Execução

O benchmark foi publicado em `main` em 04/10/2026 (`4425a506`; o domínio serviu o commit ~6 min
depois do push, provado pelo `conferir-producao.sh`).

### Etapa 0.1 — 04/10/2026 (frente `clima-e0`, sem bump de kernel)

**O que entrou:**
- Migration `aplicar_20271004000030_blueprint_study_climatizacao.sql` — uma linha por estudo,
  `hipoteses` JSONB, FK composta `(study_id, organization_id)`, UNIQUE em `study_id`, RLS por
  `is_org_member`, REVOKE de PUBLIC/anon. Molde: `blueprint_study_incendio`. **A aplicar com o OK do
  usuário** (`npx supabase db query --linked -f …`), nunca `db push`.
- `utils/blueprintClimatizacao.ts` — `HipotesesClimatizacao { conforto }`, padrão 24 °C / 50 %,
  `LIMITES_DE_CONFORTO` (16–30 °C, 30–70 %), `hipotesesClimatizacaoDaColuna` (tipo errado ou fora da
  faixa vira o padrão). `FONTE_DO_CONFORTO` diz na tela que é hipótese: **CONFERIR NA NORMA (NBR
  16401-2)**.
- `services/blueprintClimatizacaoService.ts`, `types/blueprint.ts` (`BlueprintClimatizacaoRow`),
  `hooks/useBlueprintClimatizacao.ts` (estado local + gravação com 500 ms; sem a tabela, vale só na
  sessão e a tela diz).
- `components/blueprint/PainelClimatizacao.tsx` — gaveta "Premissas de climatização": campo de
  temperatura e de umidade com faixa (`aria-invalid` + borda vermelha fora dela; o valor inválido não
  chega ao modelo), aviso de persistência indisponível.
- `BlueprintEditor.tsx` — tarefa `climatizacao` no `ROTULO_DA_TAREFA`, grupo **Premissas** na aba
  Mecânica (antes de Conferência), ícone `Thermometer` no título da gaveta, painel da tarefa.

**Decisões.** (1) As condições internas entram na 0.1 como padrão do ESTUDO; a 0.3 permite
sobrescrever por ambiente. (2) O painel segue a família dos painéis de disciplina da Planta
(`PainelIncendio`): campos compactos `text-xs`, `rounded-md` = 6 px (§16), rótulo §21; não é tela de
tabela, então §1–§9 não se aplicam; nenhum `confirm()`; sem busca. (3) Faixa fechada nos limites em
vez de aceitar qualquer número: fora de 16–30 °C não é projeto, é erro de digitação.

**Prova.** `__tests__/blueprintClimatizacao.test.ts` (4: vazio = padrão; parcial completado;
tipo errado/fora da faixa/NaN = padrão; pontas aceitas) e o caso novo em
`BlueprintEditor.test.tsx` › "HVAC mínimo (E11.1)" (o botão abre a gaveta com 24/50; 22 °C aplica;
95 % fica inválido; fechar e reabrir mantém 22 e devolve 50). `check-ui-standard` nos dois `.tsx`
tocados e `check-xss-sinks` limpos. A prova "a premissa gravada volta depois de recarregar" depende
da migration aplicada — registrada na publicação. Commit `c7a51700`.

### Etapa 0.4 — 04/10/2026 (frente `clima-e0`, sem bump de kernel nem de quantitativo)

Feita antes da 0.2 e da 0.3 porque são os quatro defeitos reais do benchmark (achados 9–12), e
nenhum depende das premissas.

**O que entrou:**
- **Achado 9** — `blueprintIfc.ts`: a linha "NÃO CONTÉM ar-condicionado nem gás" virou a descrição do
  que o arquivo CONTÉM desde 20/09 (duto `IfcDuctSegment` no sistema `.AIRCONDITIONING.`, split como
  `IfcUnitaryEquipment .SPLITSYSTEM.`, exaustor `IfcFan`, casa de máquinas como reserva) e do que não
  contém (linha frigorígena, dreno, duto retangular, conexões de duto, terminal de ar classificado,
  carga térmica; e o gás). A lista de disciplinas do `IfcDistributionSystem` no mesmo parágrafo
  também omitia pluvial, incêndio e mecânica. `blueprintTrocaDeArquivos.test.ts:380` fixava a frase
  falsa — passou a exigir a verdadeira.
- **Achado 11** — `SISTEMA_IFC.MECANICA = '.AIRCONDITIONING.'` (valor do `IfcDistributionSystemEnum`
  do IFC4). Decisão: `.AIRCONDITIONING.` e não `.VENTILATION.`, porque a disciplina de hoje nasce dos
  equipamentos de ar-condicionado; a rede só de ventilação/exaustão ganha o tipo dela na E7.
- **Achado 10** — `blueprintBudget.ts`: `CONTAGEM_PONTOS_HIDRAULICOS` deixa de contar MECANICA; medida
  nova `CONTAGEM_TERMINAIS_DE_AR` (INSTALACAO, UN, uma linha por nome do terminal). Sem bump de
  `POLITICA_PADRAO`: o de-para do orçamento não é o quantitativo (a P2.2 criou `COMPRIMENTO_DUTO` do
  mesmo jeito, sem bump).
- **Achado 12** — `commands.ts` › `DuplicateLevel` copia os componentes do pavimento (mobiliário,
  louça, reservas de climatização) com uid novo; o filho de conjunto aponta para a CÓPIA do pai (mapa
  uid antigo → novo; pai não copiado = `paiUid` removido, como a limpeza de órfão já faz). Sem mudança
  no canônico, logo sem bump — mas o bundle da `planta-api` foi regenerado porque o IFC mudou.

**Prova.** `__tests__/blueprintClimatizacaoTrilhos.test.ts` (4 — um por achado: a cobertura não
nega o que emite; o sistema do duto sai `.AIRCONDITIONING.` e não `$`; o lavatório conta como ponto
hidráulico e o difusor/grelha só em terminais de ar, 2 un; o pavimento duplicado tem os mesmos
componentes, nenhum uid repetido, os 3 filhos do conjunto apontam para o pai copiado, a cota 2200
da evaporadora vem junto e o original não muda). Reexecutados: `blueprintTrocaDeArquivos`,
`blueprintBudgetInstalacoes`, `blueprintDutos`, `blueprintCopiarInstalacao`, `blueprintHvac`,
`blueprintKernelGoldens`, `plantaApi` (bundle fresco) — 61/61.
⚠️ Lição da escrita do teste: o rótulo da linha de orçamento mora em `location.room`, não em
`description`, e `computeQuantities` precisa da `POLITICA_PADRAO` explícita para contar terminais —
duas falhas que eram da cena, não da correção. Commit `31b5637b`.

### Etapa 0.2 — 04/10/2026 (frente `clima-e0`, sem bump; sem migration nova — o JSONB cresce)

**O que entrou:**
- `utils/blueprintClimatizacao.ts` ganhou dois grupos: `clima` (cidade, TBS, TBU, altitude —
  **declarados**, `null` = derivar) e `insolacao` (data, hora solar, latitude suposta, sol no 3D).
  `CLIMA_POR_CIDADE`: as **mesmas 13 capitais** da tabela de chuvas do pluvial (o estudo escolhe UMA
  cidade e as duas disciplinas concordam; um teste trava a igualdade das listas), com TBS/TBU de
  verão, altitude e lat/long — **⚠️ transcrita de memória, CONFERIR NA NORMA (NBR 16401-1, Anexo A,
  1 %)**; `FONTE_DO_CLIMA` leva a marca à tela.
- `condicoesExternas(hip, {georreferencia, cidadeDoContexto})`: cidade = declarada > contexto
  urbanístico (casando sem acento/caixa) > **capital mais próxima pela georreferência** (haversine;
  acima de 300 km a tabela orienta e a pendência avisa a distância) > sem; TBS/TBU = declarada >
  tabela > sem (pendência diz o que falta); altitude = declarada > **`Georreferencia.elevacaoM`** >
  tabela; latitude para a insolação = georreferência > tabela. Cada número sai com a ORIGEM;
  `conferir` acende quando algo veio da tabela; TBU > TBS vira pendência.
- **Achado 5 fechado:** `useBlueprintClimatizacao` adota a insolação que o navegador tinha
  (`blueprint:insolacao`) na 1ª abertura de um estudo sem linha e grava no estudo; sem a tabela
  (migration ausente) a insolação segue no navegador, como antes. No editor, `hipotesesDeInsolacao`
  passou a ser **estudo + vizinhos legados** (a chave antiga fica só para os vizinhos que a gaveta do
  entorno oferece trazer, M5b); ao mudar vizinhos a chave é regravada INTEIRA com os valores novos,
  para não devolver data/hora velhas por cima do que o hook gravou.
- `PainelClimatizacao`: seção **Clima externo de projeto** — cidade (select com a derivada no rótulo
  da opção vazia), TBS/TBU/altitude anuláveis (placeholder = valor em uso, `title` = origem), linha
  "Em uso: … (origem)", pendências, marca CONFERIR, nota de que a insolação é do estudo.

**Decisões.** (1) A tabela climática é das capitais do pluvial e não de "todas as cidades": o que a
Planta não tem como derivar fica declarado, com pendência dita — não se inventa TBS para Uberlândia.
(2) A insolação mora na tabela de climatização e não numa tabela própria: é premissa de clima do
estudo, e evita uma 5ª tabela `blueprint_study_*` para quatro campos.

**Prova.** `blueprintClimatizacao.test.ts` (15: leitor com os três grupos, data/hora/latitude com
faixa, leitura da chave antiga ignorando vizinhos, igualdade das listas de cidades, TBU < TBS na
tabela, casamento sem acento, capital mais próxima, e os cinco cenários de `condicoesExternas`);
`BlueprintEditor.test.tsx` (o caso das premissas ganhou o clima: "sem cidade" + pendência →
São Paulo (declarada) 31,9/21,7/760 m com a marca → TBS 33 declarada vence; os 3 casos de
insolação/vizinhos legados continuam verdes). `check-ui-standard` limpo nos dois `.tsx`.
