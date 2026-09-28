# Hidrossanitário: o AltoQi Builder como régua — classificação para o ÒPURA

> Benchmark de funcionalidades, não plano de execução. Nada aqui foi implementado
> por causa deste documento; ele é a base para um roadmap, se o usuário pedir.

## Pedido original

Sessão de 28/09/2026 (VS Code), transcrito literalmente:

<details>
<summary>Mensagem do usuário (clique para abrir — é longa)</summary>

> analise essas funcionalidades do AltoQi Builder Hidrossanitário:
> 1. Modelagem e lançamento hidráulico
>    - Lançamento de redes de água fria.
>    - Lançamento de redes de água quente.
>    - Rede de alimentação predial.
>    - Ramais e sub-ramais.
>    - Colunas/prumadas hidráulicas.
>    - Barriletes.
>    - Ligação entre pavimentos.
>    - Lançamento manual ou automático das tubulações.
>    - Lançamento automático buscando rotas economicamente adequadas.
>    - Inserção automática de conexões durante o lançamento.
>    - Lançamento em planta.
>    - Lançamento em corte.
>    - Lançamento simultâneo em planta e detalhe.
>    - Lançamento considerando diferentes elevações.
>    - Desvio de prumadas.
>    - Ligação volumétrica dos componentes.
>    - Ajuste de fluxo da rede.
>    - Representação bifilar das tubulações. AltoQi
> 2. Dimensionamento de água fria e quente
>    - Cálculo automático das vazões.
>    - Dimensionamento automático dos diâmetros.
>    - Verificação de velocidades.
>    - Cálculo de perdas de carga.
>    - Cálculo das pressões disponíveis.
>    - Verificação das pressões mínimas.
>    - Identificação de pressão insuficiente.
>    - Simulador de pressões.
>    - Consideração das perdas localizadas.
>    - Dimensionamento utilizando critérios normativos.
>    - Métodos de cálculo por pesos/vazões e método probabilístico de Hunter.
>    - Configuração de diâmetro mínimo por aparelho.
>    - Cálculo considerando rugosidade dos materiais. AltoQi
> 3. Pontos de utilização e ambientes molhados
>    - Vasos sanitários.
>    - Lavatórios.
>    - Chuveiros.
>    - Torneiras.
>    - Pias.
>    - Tanques.
>    - Máquinas de lavar.
>    - Pontos de espera.
>    - Torneiras de jardim.
>    - Purificadores.
>    - Saídas livres.
>    - Registros.
>    - Válvulas.
>    - Posicionamento dos aparelhos.
>    - Esquemas automáticos para banheiros, cozinhas e áreas de serviço.
>    - Configuração de alturas de tubos nos esquemas automáticos.
>    - Criação de esquemas personalizados pelo projetista. AltoQi Suporte
> 4. Sistema PEX
>    - Projeto de água fria em PEX.
>    - Projeto de água quente em PEX.
>    - Distribuidores/manifolds PEX.
>    - Tubulações multicurva.
>    - Controle do raio mínimo de curvatura.
>    - Representação das curvas em 3D.
>    - Cálculo automático das perdas de carga das curvas.
>    - Dimensionamento dos condutos PEX. AltoQi
> 5. Reservatórios de água potável
>    - Reservatórios superiores.
>    - Reservatórios inferiores.
>    - Reservatórios externos à edificação.
>    - Reservatórios cilíndricos.
>    - Reservatórios retangulares.
>    - Reservatórios de concreto.
>    - Cálculo do consumo diário.
>    - Dimensionamento do volume necessário.
>    - Separação da reserva inferior e superior.
>    - Interligação entre reservatórios.
>    - Torneira de boia.
>    - Extravasor.
>    - Tubulação de limpeza.
>    - Relatório de dimensionamento do reservatório. AltoQi
> 6. Hidrômetros e alimentação
>    - Hidrômetro geral.
>    - Hidrômetros individuais.
>    - Sistemas de medição individualizada em edifícios.
>    - Cálculo da perda de carga do hidrômetro.
>    - Verificação da vazão suportada.
>    - Dimensionamento da peça adequada.
>    - Alimentador predial.
>    - Entrada de água.
>    - Rede de alimentação.
>    - Sistemas com reservatório inferior e superior. AltoQi
> 7. Bombas e pressurização
>    - Bombas de recalque.
>    - Dimensionamento da bomba.
>    - Análise de diferentes cenários de bombeamento.
>    - Tubulação de sucção.
>    - Tubulação de recalque.
>    - Pressurizadores.
>    - Dimensionamento de pressurizadores.
>    - Válvulas redutoras de pressão — VRP.
>    - Verificação da influência de pressurizadores nas pressões da rede. AltoQi
> 8. Água quente
>    - Rede de distribuição de água quente.
>    - Dimensionamento das tubulações.
>    - Aquecedor de passagem a gás.
>    - Dimensionamento de aquecedor de passagem.
>    - Boiler vertical.
>    - Boiler horizontal.
>    - Cálculo da capacidade do boiler.
>    - Cálculo da potência necessária.
>    - Placas/coletadores solares.
>    - Dimensionamento das placas solares.
>    - Consideração da radiação solar da região.
>    - Associação entre placa solar e boiler.
>    - Tubulações do circuito de aquecimento. AltoQi Suporte
> 9. Projeto de esgoto sanitário
>    - Aparelhos sanitários.
>    - Ramais de descarga.
>    - Ramais de esgoto.
>    - Tubos de queda.
>    - Coletores.
>    - Subcoletores.
>    - Coletor predial.
>    - Ligação à rede pública.
>    - Caixas de passagem.
>    - Caixas sifonadas.
>    - Caixas de gordura.
>    - Ralos secos.
>    - Ralos sifonados.
>    - Ralos lineares.
>    - Sifões.
>    - Tubos de inspeção/clean-out.
>    - Lançamento automático da rede sanitária.
>    - Lançamento manual.
>    - Desvios para evitar elementos estruturais.
>    - Ligações em diferentes elevações.
>    - Representação de futuras contribuições de esgoto. AltoQi Suporte
> 10. Dimensionamento sanitário
>     - Dimensionamento automático dos tubos de esgoto.
>     - Cálculo das contribuições dos aparelhos.
>     - Dimensionamento dos tubos de queda.
>     - Dimensionamento dos coletores.
>     - Aplicação automática de inclinações.
>     - Definição automática de declividades.
>     - Cotas de elevação.
>     - Verificação do sentido do fluxo.
>     - Indicação gráfica de inconsistências.
>     - Identificação de tubos inadequados.
>     - Separação da instalação em sub-redes. AltoQi
> 11. Ventilação sanitária
>     - Ramais de ventilação.
>     - Colunas de ventilação.
>     - Alças de ventilação.
>     - Prolongamento da ventilação acima da cobertura.
>     - Dimensionamento dos tubos de ventilação.
>     - Lançamento automático de ramais de ventilação.
>     - Verificação da ventilação dos aparelhos.
>     - Verificação automática da distância entre ramal ventilador e desconectores.
>     - Aplicação de inclinação na rede de ventilação. AltoQi
> 12. Águas pluviais
>     - Pontos de captação.
>     - Calhas.
>     - Condutores verticais.
>     - Condutores horizontais.
>     - Coletores pluviais.
>     - Caixas de areia.
>     - Ralos externos.
>     - Ralos hemisféricos.
>     - Bocas de lobo cadastráveis.
>     - Áreas de cobertura.
>     - Definição da intensidade pluviométrica.
>     - Dimensionamento das calhas.
>     - Dimensionamento dos condutos pluviais.
>     - Declividades.
>     - Redes independentes de água pluvial.
>     - Filtros para água da chuva. AltoQi Suporte
> 13. Aproveitamento de água da chuva
>     - Reservatório/cisterna de aproveitamento.
>     - Cálculo do volume de armazenamento.
>     - Método de Rippl.
>     - Método da Simulação.
>     - Método Azevedo Neto.
>     - Consideração da precipitação.
>     - Área de captação.
>     - Interligação entre captação, filtros e reservatório.
>     - Criação de sub-rede específica de reúso.
>     - Quantitativos dos elementos de aproveitamento.
>     - Relatórios de dimensionamento. AltoQi Suporte
> 14. Tratamento individual de esgoto
>     - Tanque séptico/fossa séptica.
>     - Filtro anaeróbio.
>     - Sumidouro.
>     - Múltiplos sumidouros.
>     - Vala de infiltração.
>     - Vala de filtração.
>     - Caixa de gordura.
>     - Dimensionamento das unidades.
>     - Definição da vazão contribuinte.
>     - Taxas de aplicação/infiltração.
>     - Detalhamento automático.
>     - Cortes das unidades de tratamento.
>     - Relatórios de dimensionamento. AltoQi
> 15. Estações elevatórias de esgoto
>     - Lançamento de estação elevatória.
>     - Bombas submersíveis.
>     - Dimensionamento das bombas.
>     - Cálculo da vazão de recalque.
>     - Dimensionamento da sucção.
>     - Dimensionamento do recalque. AltoQi Suporte
> 16. Piscinas
>     - Modelagem do sistema hidráulico da piscina.
>     - Tubulações.
>     - Conexões.
>     - Skimmer/coadeira.
>     - Ralos de fundo.
>     - Dispositivos de retorno.
>     - Dispositivos de aspiração.
>     - Dispositivos de hidromassagem.
>     - Bombas.
>     - Filtros.
>     - Dimensionamento de bomba e filtro.
>     - Cálculo de perdas de carga.
>     - Relatórios.
>     - Componentes previamente cadastrados e representados em 3D.
>     - Dimensionamento segundo critérios da NBR 10339. AltoQi Suporte
> 17. Automação e verificações durante o projeto
>     - Lançamento automático hidráulico.
>     - Lançamento automático sanitário.
>     - Busca automática de trajetos para tubulações.
>     - Inserção das peças necessárias.
>     - Posicionamento automático de aparelhos sanitários.
>     - Definição automática de declividades.
>     - Ajuste de fluxo.
>     - Identificação visual de problemas diretamente no croqui.
>     - Aviso de diâmetro inferior ou superior ao necessário.
>     - Avisos relacionados a pressão.
>     - Avisos de fluxo incorreto.
>     - Avisos de peças pendentes.
>     - Verificação da ventilação sanitária. AltoQi
> 18. Detalhes, cortes e esquemas
>     - Detalhes hidráulicos.
>     - Detalhes sanitários.
>     - Detalhamento isométrico.
>     - Esquemas isométricos automáticos.
>     - Esquemas verticais.
>     - Cortes.
>     - Cotas.
>     - Indicação de diâmetros.
>     - Indicação das tubulações.
>     - Indicação das peças.
>     - Níveis dos pavimentos.
>     - Elevações.
>     - Representação integrada entre planta, detalhe e modelo 3D. AltoQi Suporte
> 19. Modelagem 3D
>     - Visualização completa das instalações em 3D.
>     - Tubulações tridimensionais.
>     - Conexões 3D.
>     - Equipamentos 3D.
>     - Aparência realista dos componentes.
>     - Alteração das propriedades dos elementos pelo ambiente 3D.
>     - Ligação volumétrica em reservatórios, aquecedores, boilers, caixas e unidades de tratamento.
>     - Seleção e manipulação dos elementos do modelo. AltoQi
> 20. BIM e interoperabilidade
>     - Importação IFC.
>     - Exportação IFC.
>     - OpenBIM.
>     - Exportação das propriedades dos componentes.
>     - Vinculação de modelos de arquitetura.
>     - Vinculação de modelos estruturais.
>     - Visualização integrada das disciplinas.
>     - Controle de visibilidade de modelos IFC.
>     - Compatibilização BIM.
>     - Notas BCF.
>     - Comentários vinculados ao modelo.
>     - Imagens vinculadas às notas BCF.
>     - Integração das notas com AltoQi Cloud. AltoQi
> 21. Detecção de interferências
>     - Clash detection.
>     - Verificação de interferência entre tubulações e outros sistemas.
>     - Compatibilização com estrutura.
>     - Compatibilização com arquitetura.
>     - Compatibilização com outras disciplinas MEP.
>     - Visualização das colisões no ambiente 3D.
>     - Filtro de pavimentos na análise de colisões. AltoQi
> 22. Cadastro de peças e biblioteca
>     - Biblioteca nativa de componentes hidrossanitários.
>     - Tubos.
>     - Conexões.
>     - Registros.
>     - Válvulas.
>     - Aparelhos sanitários.
>     - Reservatórios.
>     - Bombas.
>     - Equipamentos.
>     - Cadastro de componentes personalizados.
>     - Definição de dados hidráulicos da peça.
>     - Símbolo 2D.
>     - Representação 3D.
>     - Pontos de conexão personalizados.
>     - Associação dos insumos necessários à peça.
>     - Peças de fabricantes especializados. AltoQi
> 23. Quantitativos e lista de materiais
>     - Quantificação automática de tubos.
>     - Conexões.
>     - Peças.
>     - Equipamentos.
>     - Reservatórios.
>     - Calhas.
>     - Unidades de tratamento.
>     - Atualização dos quantitativos quando o projeto é modificado.
>     - Lista do projeto inteiro.
>     - Lista por pavimento.
>     - Lista por disciplina.
>     - Lista por detalhe.
>     - Exportação XLSX.
>     - Exportação DOCX.
>     - Exportação HTML.
>     - Inserção do quantitativo no próprio desenho.
>     - Personalização do nível de detalhamento. AltoQi
> 24. Memoriais e relatórios
>     - Memorial descritivo.
>     - Memorial de cálculo.
>     - Relatórios hidráulicos.
>     - Relatórios sanitários.
>     - Relatório de reservatórios.
>     - Relatório de bombas.
>     - Relatório de unidades de tratamento.
>     - Relatório de piscinas.
>     - Relatório de sistemas de aquecimento.
>     - Relatórios de dimensionamento para entrega junto ao projeto. AltoQi
> 25. Documentação gráfica
>     - Geração de legendas.
>     - Legenda de condutos.
>     - Legenda de peças.
>     - Legenda de símbolos.
>     - Legenda detalhada de símbolos.
>     - Legenda automática de colunas/prumadas.
>     - Indicações automáticas.
>     - Textos.
>     - Cotas.
>     - Anotações.
>     - Regiões/layouts de impressão.
>     - Organização dos desenhos para pranchas.
>     - Atualização das legendas conforme alterações do modelo. A atualização 2026-08 acrescentou, entre outros recursos, novas legendas automáticas para colunas hidrossanitárias. AltoQi
> 26. Organização do projeto
>     - Projetos com múltiplos pavimentos.
>     - Redes separadas por sistema.
>     - Sub-redes.
>     - Configuração dos níveis.
>     - Organização independente das redes.
>     - Separação das sub-redes nos quantitativos.
>     - Separação nas legendas.
>     - Personalização da representação gráfica.
>     - Propriedades associadas a cada elemento do modelo. AltoQi
> Visão funcional
> Se transformarmos isso em módulos de software, o AltoQi Hidrossanitário pode ser resumido em aproximadamente 12 grandes motores:
> Modelador 2D/3D → Motor de lançamento automático → Motor hidráulico → Motor sanitário → Motor pluvial → Motor de ventilação → Motor de tratamento → Motor de aquecimento → Motor de piscinas → Motor BIM/compatibilização → Motor de documentação → Motor de quantitativos.
> Para o ÒPURA, eu não copiaria a divisão de telas do AltoQi. Usaria essas funcionalidades como benchmark e estruturaria o produto em torno de um modelo hidrossanitário único, do qual derivariam automaticamente cálculo, 3D, isométricos, quantitativos, memoriais e verificações. Isso reduz bastante o risco de criar vários módulos que armazenam versões diferentes da mesma instalação. AltoQi
> Se o objetivo for desenvolver isso no ÒPURA, o próximo passo mais útil é pegar cada uma dessas funcionalidades e classificá-la em Essencial / Alta / Média / Baixa importância, exatamente como fizemos na análise das funcionalidades do Revit para a Planta Inteligente.

</details>

Perguntas e respostas da mesma sessão:

- "Qual é o papel do hidrossanitário no ÒPURA?" → **"Substituir o projetista"**
- "Onde entrego a classificação?" → **"docs/planos + resumo aqui (Recomendado)"**

## Critério e legenda

**Critério do grau:** o ÒPURA deve permitir **fechar o projeto executivo hidrossanitário** sem outro software — cálculo normativo completo (NBR 5626, 8160, 10844, 7229/13969), documentação de prancha e memoriais entregáveis. Um item é **E** se, sem ele, o projetista ainda precisaria do AltoQi para entregar uma casa ou um edifício residencial comum.

| Grau | Significa |
|---|---|
| **E** | Essencial — sem isso não se entrega o executivo |
| **A** | Alto — entrega comum, mas não em todo projeto (edifício, alto padrão, região sem rede) |
| **M** | Médio — ganho real, mas nicho ou contornável |
| **B** | Baixo — raro no residencial da incorporadora |
| **N** | Não replicar — consumir via integração |

Estado (conferido no código em 28/09/2026, commit `7f8d444`): **✅** implementado · **🟡** parcial · **❌** não existe.
Caminhos de arquivo relativos à raiz do repositório.

## 1. Modelagem e lançamento hidráulico

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento de redes de água fria | E | ✅ | manual (ferramenta rede) e automático `utils/blueprintAguaAutomatica.ts:planejarAgua` |
| Lançamento de redes de água quente | E | ✅ | mesma função, origem `AQUECEDOR`, tabela CPVC |
| Rede de alimentação predial | E | ❌ | a rede nasce na caixa d'água; entrada → hidrômetro → reservatório não existe |
| Ramais e sub-ramais | E | ✅ | ramal a 2,20 m pelas paredes + descida ao ponto (`utils/blueprintRotaPelasParedes.ts:arvorePelasParedes`) |
| Colunas/prumadas hidráulicas | E | ✅ | colunas por proximidade (`raioDaColunaMm`), no eixo da parede ou no shaft (`shaftPreferido`) |
| Barriletes | E | ✅ | no teto, por cima das paredes (`planejarAgua`, 27/09) |
| Ligação entre pavimentos | E | ✅ | a laje é o encontro (`utils/blueprintGrafoDeRede.ts:fazerChave`) |
| Lançamento manual ou automático das tubulações | E | ✅ | os dois; relançar/refazer (`relancarAgua`, `refazerAgua`) |
| Lançamento automático buscando rotas economicamente adequadas | A | 🟡 | menor comprimento pelo grafo das paredes (Steiner); não pondera custo de conexão nem material |
| Inserção automática de conexões durante o lançamento | E | ✅ | derivadas dos encontros (`utils/blueprintKernel/conexoes.ts:conexoesDerivadas`), desenhadas em 2D e 3D |
| Lançamento em planta | E | ✅ | editor 2D |
| Lançamento em corte | A | ❌ | o corte mostra os tubos (`utils/blueprintCorte.ts`, `redes`), mas não lança |
| Lançamento simultâneo em planta e detalhe | M | ❌ | não há "detalhe" hidráulico |
| Lançamento considerando diferentes elevações | E | ✅ | cota por ponta do trecho; prumadas |
| Desvio de prumadas | A | ❌ | a coluna é reta do teto da origem ao ramal |
| Ligação volumétrica dos componentes | A | 🟡 | caixas têm corpo 3D (`corpoDaCaixa3D`); a ligação é por nó (posição + cota), não por bocal na face da peça |
| Ajuste de fluxo da rede | A | ❌ | o trecho não guarda sentido de fluxo |
| Representação bifilar das tubulações | E | ✅ | faixa de duas bordas na largura real (`utils/blueprintIsometrico.ts:faixaDoTubo2D`, 27/09) |

## 2. Dimensionamento de água fria e quente

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Cálculo automático das vazões | E | ✅ | Q = 0,3·√ΣP (`vazaoDeProjetoLs`) |
| Dimensionamento automático dos diâmetros | E | ✅ | `dimensionarDN` por velocidade |
| Verificação de velocidades | E | ✅ | limite `velocidadeMaxMs` (2 m/s) |
| Cálculo de perdas de carga | E | ❌ | declarado no cabeçalho de `blueprintAguaAutomatica.ts`: "sem perda de carga" |
| Cálculo das pressões disponíveis | E | ❌ | idem |
| Verificação das pressões mínimas | E | ❌ | — |
| Identificação de pressão insuficiente | E | ❌ | — |
| Simulador de pressões | A | ❌ | — |
| Consideração das perdas localizadas | E | ❌ | a base existe: as conexões por trecho já são conhecidas (`conexoesDerivadas`) — falta o comprimento equivalente |
| Dimensionamento utilizando critérios normativos | E | 🟡 | NBR 5626 por pesos e velocidade; sem pressão/perda |
| Métodos de cálculo por pesos/vazões e método probabilístico de Hunter | E | 🟡 | pesos ✅; Hunter (probabilístico) para água ❌ — este pedaço é M |
| Configuração de diâmetro mínimo por aparelho | E | ✅ | `dnMinimoMm` da ficha (`utils/blueprintHidraulica.ts:FICHA_DO_PONTO_HIDRAULICO`) |
| Cálculo considerando rugosidade dos materiais | E | ❌ | a tabela `DIAMETROS` tem só DN e diâmetro interno |

## 3. Pontos de utilização e ambientes molhados

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Vasos sanitários | E | ✅ | `VASO_SANITARIO` (+ louça 3D) |
| Lavatórios | E | ✅ | `LAVATORIO` |
| Chuveiros | E | ✅ | `CHUVEIRO` (+ box) |
| Torneiras | E | ✅ | `TORNEIRA` |
| Pias | E | ✅ | `PIA_COZINHA` |
| Tanques | E | ✅ | `TANQUE` |
| Máquinas de lavar | E | ✅ | `MAQUINA_LAVAR` |
| Pontos de espera | A | 🟡 | há "ponto sem tipo"; não há o tipo "espera" com DN próprio |
| Torneiras de jardim | E | ✅ | `TORNEIRA_JARDIM` |
| Purificadores | M | ❌ | — |
| Saídas livres | M | ❌ | — |
| Registros | E | ✅ | gaveta e pressão, sobre o trecho |
| Válvulas | E | 🟡 | só `VALVULA_RETENCAO`; sem válvula de descarga, boia, VRP |
| Posicionamento dos aparelhos | E | ✅ | louças do catálogo; os pontos nascem na face da parede (`pontosDaLouca`, 27/09) |
| Esquemas automáticos para banheiros, cozinhas e áreas de serviço | E | ✅ | kits por ambiente (`utils/blueprintPontosHidraulicos.ts:planejarPontosDoNivel`) |
| Configuração de alturas de tubos nos esquemas automáticos | A | 🟡 | altura usual por tipo na ficha, editável por ponto; o kit não tem altura própria |
| Criação de esquemas personalizados pelo projetista | A | ❌ | o kit é trocável por ambiente, não criável |

Faltam também tipos que o AltoQi tem e a lista não citou: bidê, banheira, mictório, ralo linear.

## 4. Sistema PEX

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Projeto de água fria em PEX | M | ❌ | só PVC soldável e CPVC (`DIAMETROS`) |
| Projeto de água quente em PEX | M | ❌ | — |
| Distribuidores/manifolds PEX | A | ❌ | padrão no alto padrão |
| Tubulações multicurva | M | ❌ | trecho é reto |
| Controle do raio mínimo de curvatura | M | ❌ | — |
| Representação das curvas em 3D | M | ❌ | — |
| Cálculo automático das perdas de carga das curvas | M | ❌ | depende de perda de carga (grupo 2) |
| Dimensionamento dos condutos PEX | M | ❌ | — |

## 5. Reservatórios de água potável

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Reservatórios superiores | E | 🟡 | `RESERVATORIO` é a origem da água fria, com volume e medidas; apoia na laje no 3D (`apoioDaCaixaDagua`) |
| Reservatórios inferiores | E | ❌ | sem o conceito inferior/superior |
| Reservatórios externos à edificação | M | 🟡 | a peça pode ficar em qualquer lugar; sem tipo "externo" |
| Reservatórios cilíndricos | M | ❌ | o corpo é sempre prisma |
| Reservatórios retangulares | M | ✅ | largura × profundidade × altura |
| Reservatórios de concreto | M | ❌ | — |
| Cálculo do consumo diário | E | ❌ | — |
| Dimensionamento do volume necessário | E | ❌ | o volume é digitado |
| Separação da reserva inferior e superior | E | ❌ | — |
| Interligação entre reservatórios | A | ❌ | — |
| Torneira de boia | E | ❌ | — |
| Extravasor | E | ❌ | — |
| Tubulação de limpeza | E | ❌ | — |
| Relatório de dimensionamento do reservatório | E | ❌ | — |

## 6. Hidrômetros e alimentação

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Hidrômetro geral | E | 🟡 | `HIDROMETRO` sobre o trecho; sem cálculo |
| Hidrômetros individuais | A | 🟡 | a mesma peça; sem o conceito de unidade |
| Sistemas de medição individualizada em edifícios | A | ❌ | — |
| Cálculo da perda de carga do hidrômetro | E | ❌ | depende de perda de carga |
| Verificação da vazão suportada | E | ❌ | — |
| Dimensionamento da peça adequada | A | ❌ | — |
| Alimentador predial | E | ❌ | — |
| Entrada de água | E | ❌ | — |
| Rede de alimentação | E | ❌ | — |
| Sistemas com reservatório inferior e superior | E | ❌ | — |

## 7. Bombas e pressurização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Bombas de recalque | E | 🟡 | `BOMBA` existe como peça; a ficha diz "não é dimensionada pelo lançamento automático" |
| Dimensionamento da bomba | E | ❌ | — |
| Análise de diferentes cenários de bombeamento | M | ❌ | — |
| Tubulação de sucção | E | ❌ | — |
| Tubulação de recalque | E | ❌ | — |
| Pressurizadores | A | 🟡 | a mesma peça `BOMBA` ("bomba ou pressurizador") |
| Dimensionamento de pressurizadores | A | ❌ | — |
| Válvulas redutoras de pressão — VRP | A | ❌ | — |
| Verificação da influência de pressurizadores nas pressões da rede | M | ❌ | depende de pressão |

## 8. Água quente

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Rede de distribuição de água quente | E | ✅ | automática a partir do `AQUECEDOR`, pelas paredes |
| Dimensionamento das tubulações | E | 🟡 | CPVC por velocidade; sem pressão/perda |
| Aquecedor de passagem a gás | E | 🟡 | `AQUECEDOR` genérico, alimentado pela fria com o peso dos pontos quentes |
| Dimensionamento de aquecedor de passagem | A | ❌ | — |
| Boiler vertical | A | ❌ | — |
| Boiler horizontal | A | ❌ | — |
| Cálculo da capacidade do boiler | A | ❌ | — |
| Cálculo da potência necessária | A | ❌ | — |
| Placas/coletadores solares | M | ❌ | — |
| Dimensionamento das placas solares | M | ❌ | — |
| Consideração da radiação solar da região | M | ❌ | há posição do sol (insolação, E5.1); radiação não |
| Associação entre placa solar e boiler | M | ❌ | — |
| Tubulações do circuito de aquecimento | M | ❌ | sem recirculação |

## 9. Projeto de esgoto sanitário

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Aparelhos sanitários | E | ✅ | pontos tipados com UHC |
| Ramais de descarga | E | ✅ | aparelho → coletor/caixa (`planejarEsgoto`) |
| Ramais de esgoto | E | ✅ | caixa sifonada → CI |
| Tubos de queda | E | ✅ | TQ DN 100 no sobrado, com shaft preferido |
| Coletores | E | 🟡 | a árvore até a CI existe; coletor não é nomeado |
| Subcoletores | E | 🟡 | idem |
| Coletor predial | E | ❌ | a CI é o destino; da CI para fora, nada |
| Ligação à rede pública | E | ❌ | — |
| Caixas de passagem | A | 🟡 | a CI serve; não há tipo "passagem" |
| Caixas sifonadas | E | ✅ | `CAIXA_SIFONADA` (corpo com grelha em 2D e 3D) |
| Caixas de gordura | E | ✅ | `CAIXA_GORDURA`; a pia passa por ela |
| Ralos secos | E | ✅ | `RALO_SECO` |
| Ralos sifonados | E | ✅ | `RALO_SIFONADO` |
| Ralos lineares | M | ❌ | — |
| Sifões | A | ❌ | implícito, não é peça |
| Tubos de inspeção/clean-out | A | ❌ | — |
| Lançamento automático da rede sanitária | E | ✅ | `planejarEsgoto`, com junção 45° (`arvoreComJuncoes45`) |
| Lançamento manual | E | ✅ | ferramenta rede |
| Desvios para evitar elementos estruturais | E | ❌ | o conflito trecho × estrutura é DETECTADO (`conflitosDoModelo`); o traçado não desvia |
| Ligações em diferentes elevações | E | ✅ | cota por nó, TQ entre pavimentos |
| Representação de futuras contribuições de esgoto | B | ❌ | — |

## 10. Dimensionamento sanitário

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Dimensionamento automático dos tubos de esgoto | E | 🟡 | `dnPorUhc`: tabela de 4 degraus; a NBR 8160 tem tabelas próprias para ramal, TQ e coletor |
| Cálculo das contribuições dos aparelhos | E | ✅ | `uhcNbr8160` na ficha, acumulado a montante |
| Dimensionamento dos tubos de queda | E | 🟡 | DN 100 fixo |
| Dimensionamento dos coletores | E | 🟡 | pela mesma tabela simplificada |
| Aplicação automática de inclinações | E | ✅ | 2 % até DN 75, 1 % DN 100 (`caimentoPct`) |
| Definição automática de declividades | E | ✅ | idem, das folhas para a raiz |
| Cotas de elevação | E | ✅ | cota por nó; aviso "aprofunde a caixa" |
| Verificação do sentido do fluxo | E | ❌ | trecho desenhado à mão não é verificado |
| Indicação gráfica de inconsistências | E | 🟡 | painel de conflitos; **pontas abertas são calculadas (`pontasAbertas`) e não aparecem na tela** |
| Identificação de tubos inadequados | E | 🟡 | só na água (DN confirmado menor que o pedido); no esgoto, não |
| Separação da instalação em sub-redes | A | ❌ | — |

## 11. Ventilação sanitária

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Ramais de ventilação | E | ❌ | — |
| Colunas de ventilação | E | 🟡 | uma coluna DN 50 do TQ ao teto do andar (`planejarEsgoto`) |
| Alças de ventilação | M | ❌ | — |
| Prolongamento da ventilação acima da cobertura | E | ❌ | a coluna para no teto do andar |
| Dimensionamento dos tubos de ventilação | E | ❌ | DN 50 fixo |
| Lançamento automático de ramais de ventilação | E | ❌ | — |
| Verificação da ventilação dos aparelhos | E | ❌ | — |
| Verificação automática da distância entre ramal ventilador e desconectores | E | ❌ | — |
| Aplicação de inclinação na rede de ventilação | M | ❌ | — |

## 12. Águas pluviais

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Pontos de captação | E | ❌ | não há disciplina `PLUVIAL` (`DisciplinaDeRede` em `utils/blueprintKernel/model.ts`) |
| Calhas | E | ❌ | — |
| Condutores verticais | E | ❌ | — |
| Condutores horizontais | E | ❌ | — |
| Coletores pluviais | E | ❌ | — |
| Caixas de areia | E | ❌ | — |
| Ralos externos | A | ❌ | — |
| Ralos hemisféricos | A | ❌ | — |
| Bocas de lobo cadastráveis | B | ❌ | — |
| Áreas de cobertura | E | 🟡 | o telhado existe com as águas (`utils/blueprintKernel/telhado.ts`); a área de contribuição não é calculada |
| Definição da intensidade pluviométrica | E | ❌ | — |
| Dimensionamento das calhas | E | ❌ | — |
| Dimensionamento dos condutos pluviais | E | ❌ | — |
| Declividades | E | ❌ | — |
| Redes independentes de água pluvial | E | ❌ | — |
| Filtros para água da chuva | M | ❌ | — |

A drenagem que já existe (`utils/blueprintTopografia*`) é do terreno/loteamento, não da edificação.

## 13. Aproveitamento de água da chuva

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Reservatório/cisterna de aproveitamento | A | ❌ | exigido por lei em vários municípios |
| Cálculo do volume de armazenamento | A | ❌ | — |
| Método de Rippl | M | ❌ | — |
| Método da Simulação | M | ❌ | — |
| Método Azevedo Neto | M | ❌ | — |
| Consideração da precipitação | A | ❌ | — |
| Área de captação | A | 🟡 | telhado existe; sem área de captação |
| Interligação entre captação, filtros e reservatório | M | ❌ | depende do pluvial |
| Criação de sub-rede específica de reúso | M | ❌ | — |
| Quantitativos dos elementos de aproveitamento | A | ❌ | — |
| Relatórios de dimensionamento | A | ❌ | — |

## 14. Tratamento individual de esgoto

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Tanque séptico/fossa séptica | E | ❌ | essencial onde não há rede (loteamento, rural) |
| Filtro anaeróbio | E | ❌ | — |
| Sumidouro | E | ❌ | — |
| Múltiplos sumidouros | A | ❌ | — |
| Vala de infiltração | M | ❌ | — |
| Vala de filtração | M | ❌ | — |
| Caixa de gordura | E | ✅ | já existe no esgoto |
| Dimensionamento das unidades | E | ❌ | NBR 7229 / 13969 |
| Definição da vazão contribuinte | E | ❌ | — |
| Taxas de aplicação/infiltração | E | ❌ | — |
| Detalhamento automático | A | ❌ | — |
| Cortes das unidades de tratamento | A | ❌ | — |
| Relatórios de dimensionamento | A | ❌ | — |

## 15. Estações elevatórias de esgoto

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento de estação elevatória | M | ❌ | — |
| Bombas submersíveis | M | ❌ | — |
| Dimensionamento das bombas | M | ❌ | — |
| Cálculo da vazão de recalque | M | ❌ | — |
| Dimensionamento da sucção | M | ❌ | — |
| Dimensionamento do recalque | M | ❌ | — |

## 16. Piscinas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Modelagem do sistema hidráulico da piscina | B | ❌ | só existe a superfície "espelho d'água / piscina" do terreno |
| Tubulações | B | ❌ | — |
| Conexões | B | ❌ | — |
| Skimmer/coadeira | B | ❌ | — |
| Ralos de fundo | B | ❌ | — |
| Dispositivos de retorno | B | ❌ | — |
| Dispositivos de aspiração | B | ❌ | — |
| Dispositivos de hidromassagem | B | ❌ | — |
| Bombas | B | ❌ | — |
| Filtros | B | ❌ | — |
| Dimensionamento de bomba e filtro | B | ❌ | — |
| Cálculo de perdas de carga | B | ❌ | — |
| Relatórios | B | ❌ | — |
| Componentes previamente cadastrados e representados em 3D | B | ❌ | — |
| Dimensionamento segundo critérios da NBR 10339 | B | ❌ | — |

## 17. Automação e verificações durante o projeto

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento automático hidráulico | E | ✅ | `planejarAgua` |
| Lançamento automático sanitário | E | ✅ | `planejarEsgoto` |
| Busca automática de trajetos para tubulações | E | ✅ | pelas paredes (água), Y a 45° (esgoto) |
| Inserção das peças necessárias | E | ✅ | conexões derivadas; pontos da louça |
| Posicionamento automático de aparelhos sanitários | E | ✅ | kits por ambiente; mobiliário automático |
| Definição automática de declividades | E | ✅ | `caimentoPct` |
| Ajuste de fluxo | A | ❌ | — |
| Identificação visual de problemas diretamente no croqui | E | 🟡 | painel de conflitos; pontas abertas não aparecem no desenho |
| Aviso de diâmetro inferior ou superior ao necessário | E | 🟡 | água: só "inferior" em trecho confirmado; esgoto: nada |
| Avisos relacionados a pressão | E | ❌ | depende de pressão |
| Avisos de fluxo incorreto | E | ❌ | — |
| Avisos de peças pendentes | E | 🟡 | "sem caixa sifonada", "sem caixa de gordura", "louça sem ponto"; pontas abertas não mostradas |
| Verificação da ventilação sanitária | E | ❌ | — |

## 18. Detalhes, cortes e esquemas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Detalhes hidráulicos | E | ❌ | `TipoDePrancha` (`utils/blueprintPranchas.ts`) não tem HIDRAULICA |
| Detalhes sanitários | E | ❌ | idem |
| Detalhamento isométrico | E | 🟡 | o 3D já é um isométrico navegável (conexões, ø, caixas); não sai como desenho de prancha |
| Esquemas isométricos automáticos | E | ❌ | — |
| Esquemas verticais | A | ❌ | — |
| Cortes | E | 🟡 | o corte corta os tubos (`blueprintCorte.ts`); sem prancha hidráulica |
| Cotas | E | 🟡 | cotas de arquitetura; sem cota de tubo |
| Indicação de diâmetros | E | ✅ | "ø100 mm · i 1 %" na planta e no 3D |
| Indicação das tubulações | E | ✅ | tubo bifilar por rede |
| Indicação das peças | E | 🟡 | sigla dos pontos e das caixas; conexão desenhada sem nome |
| Níveis dos pavimentos | E | ✅ | pavimentos com elevação |
| Elevações | E | 🟡 | cota por trecho; sem indicação gráfica de nível do tubo |
| Representação integrada entre planta, detalhe e modelo 3D | E | 🟡 | planta e 3D saem do mesmo modelo; o detalhe não existe |

## 19. Modelagem 3D

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Visualização completa das instalações em 3D | A | ✅ | `Blueprint3DViewer` com todas as redes |
| Tubulações tridimensionais | A | ✅ | cilindro por trecho no DN |
| Conexões 3D | A | ✅ | bolsas + corpo (`pecasDasConexoes3D`, 27/09) |
| Equipamentos 3D | A | 🟡 | caixas com corpo e tampa; aquecedor/bomba são caixa genérica |
| Aparência realista dos componentes | B | 🟡 | louças são caixas brancas |
| Alteração das propriedades dos elementos pelo ambiente 3D | M | 🟡 | selecionar no 3D abre o painel; não edita na cena |
| Ligação volumétrica em reservatórios, aquecedores, boilers, caixas e unidades de tratamento | A | 🟡 | ligação por nó, não pelo volume |
| Seleção e manipulação dos elementos do modelo | M | 🟡 | seleciona; não move no 3D |

## 20. BIM e interoperabilidade

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Importação IFC | A | 🟡 | estrutura, paredes e aberturas (`utils/ifcParaKernel.ts`); instalações não |
| Exportação IFC | E | 🟡 | pontos saem como entidade certa (`entidadeDoPontoHidraulico`); **tubo sai como `IfcFlowSegment` genérico e as conexões derivadas não saem** |
| OpenBIM | A | 🟡 | IFC + BCF abertos; tubo genérico |
| Exportação das propriedades dos componentes | A | 🟡 | propriedades do ponto; do tubo, só o básico |
| Vinculação de modelos de arquitetura | A | 🟡 | planta de fundo (`blueprintUnderlayService`) e importação; não é vínculo vivo |
| Vinculação de modelos estruturais | A | 🟡 | importação da estrutura do IFC; não é vínculo vivo |
| Visualização integrada das disciplinas | A | ✅ | arquitetura, estrutura e redes no mesmo modelo |
| Controle de visibilidade de modelos IFC | M | ❌ | sem modelo vinculado, não há o que ligar/desligar |
| Compatibilização BIM | A | 🟡 | interna ao modelo (`conflitosDoModelo`) |
| Notas BCF | A | ✅ | `utils/blueprintBcf.ts` (exporta) e `blueprintBcfLeitura.ts` (lê) |
| Comentários vinculados ao modelo | A | ✅ | `services/blueprintCommentService.ts` |
| Imagens vinculadas às notas BCF | M | ❌ | a nota BCF sai sem imagem |
| Integração das notas com AltoQi Cloud | N | ❌ | produto de terceiro |

## 21. Detecção de interferências

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Clash detection | A | ✅ | `utils/blueprintKernel/conflitos.ts:conflitosDoModelo` + `PainelConflitos` |
| Verificação de interferência entre tubulações e outros sistemas | A | ✅ | trecho × trecho de outra disciplina |
| Compatibilização com estrutura | E | ✅ | trecho × pilar, viga, laje, fundação |
| Compatibilização com arquitetura | A | 🟡 | a parede não entra de propósito (o tubo embutido é o certo); porta/janela não |
| Compatibilização com outras disciplinas MEP | A | ✅ | elétrica e mecânica × hidráulica |
| Visualização das colisões no ambiente 3D | A | 🟡 | lista no painel; sem destaque no 3D |
| Filtro de pavimentos na análise de colisões | M | ❌ | — |

## 22. Cadastro de peças e biblioteca

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Biblioteca nativa de componentes hidrossanitários | A | 🟡 | 26 tipos na ficha (`FICHA_DO_PONTO_HIDRAULICO`) + louças do catálogo |
| Tubos | A | 🟡 | tabela de DN PVC/CPVC; o material vem da disciplina |
| Conexões | A | 🟡 | tipos derivados; sem catálogo |
| Registros | A | ✅ | gaveta, pressão |
| Válvulas | A | 🟡 | retenção só |
| Aparelhos sanitários | A | ✅ | louças com medidas e ligação ao ponto |
| Reservatórios | A | 🟡 | uma ficha; sem modelos comerciais |
| Bombas | A | 🟡 | uma ficha |
| Equipamentos | A | 🟡 | aquecedor, hidrômetro |
| Cadastro de componentes personalizados | A | ❌ | — |
| Definição de dados hidráulicos da peça | A | 🟡 | peso, UHC e DN mínimo fixos na ficha; o usuário não edita |
| Símbolo 2D | M | ❌ | símbolo por tipo, não cadastrável |
| Representação 3D | M | ❌ | idem |
| Pontos de conexão personalizados | M | ❌ | — |
| Associação dos insumos necessários à peça | E | 🟡 | `itemCode` por trecho/ponto e mapeamento de orçamento por medida; sem composição por peça |
| Peças de fabricantes especializados | A | ❌ | — |

## 23. Quantitativos e lista de materiais

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Quantificação automática de tubos | E | ✅ | `porBitola`, comprimento real com caimento (`utils/blueprintKernel/quantities.ts`) |
| Conexões | E | ✅ | `porConexao`, incluindo junção 45° |
| Peças | E | ✅ | `CONTAGEM_PONTOS_HIDRAULICOS` (`utils/blueprintBudget.ts`) |
| Equipamentos | E | 🟡 | contados como pontos |
| Reservatórios | E | 🟡 | idem |
| Calhas | E | ❌ | sem pluvial |
| Unidades de tratamento | A | ❌ | sem tratamento |
| Atualização dos quantitativos quando o projeto é modificado | E | ✅ | tudo é derivado do modelo |
| Lista do projeto inteiro | E | ✅ | — |
| Lista por pavimento | E | ❌ | `utils/blueprintQuantitativosPorPavimento.ts` não tem hidráulica |
| Lista por disciplina | E | ✅ | tubo por disciplina e DN |
| Lista por detalhe | M | ❌ | — |
| Exportação XLSX | E | ✅ | abas "Instalações" e "Pontos e conexões" (`utils/blueprintPlanilha.ts`) |
| Exportação DOCX | B | ❌ | — |
| Exportação HTML | B | ❌ | — |
| Inserção do quantitativo no próprio desenho | M | ❌ | a prancha TABELAS só tem áreas e esquadrias |
| Personalização do nível de detalhamento | M | ❌ | — |

## 24. Memoriais e relatórios

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Memorial descritivo | E | ❌ | há memoriais de elétrica, topografia e lote; nenhum hidrossanitário |
| Memorial de cálculo | E | ❌ | — |
| Relatórios hidráulicos | E | 🟡 | a gaveta do lançamento mostra DN máx., ΣP e metros; não é relatório |
| Relatórios sanitários | E | 🟡 | idem: UHC, DN, cota de chegada na CI |
| Relatório de reservatórios | E | ❌ | — |
| Relatório de bombas | A | ❌ | — |
| Relatório de unidades de tratamento | A | ❌ | — |
| Relatório de piscinas | B | ❌ | — |
| Relatório de sistemas de aquecimento | A | ❌ | — |
| Relatórios de dimensionamento para entrega junto ao projeto | E | ❌ | — |

## 25. Documentação gráfica

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Geração de legendas | E | ❌ | legendas existem para elétrica e topografia; hidráulica não |
| Legenda de condutos | E | ❌ | — |
| Legenda de peças | E | ❌ | — |
| Legenda de símbolos | E | ❌ | — |
| Legenda detalhada de símbolos | M | ❌ | — |
| Legenda automática de colunas/prumadas | A | ❌ | — |
| Indicações automáticas | E | 🟡 | ø e i % no tubo; sigla do ponto |
| Textos | E | ✅ | anotações (`utils/blueprintAnotacoes.ts`) |
| Cotas | E | ✅ | `utils/blueprintCotas.ts` |
| Anotações | E | ✅ | idem |
| Regiões/layouts de impressão | A | 🟡 | pranchas existem; sem prancha hidráulica |
| Organização dos desenhos para pranchas | E | 🟡 | idem |
| Atualização das legendas conforme alterações do modelo | A | ❌ | não há legenda hidráulica |

## 26. Organização do projeto

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Projetos com múltiplos pavimentos | E | ✅ | — |
| Redes separadas por sistema | E | ✅ | disciplina por trecho |
| Sub-redes | A | ❌ | — |
| Configuração dos níveis | E | ✅ | elevação e pé-direito por pavimento |
| Organização independente das redes | A | 🟡 | uma rede por origem (`redeDaOrigem`) |
| Separação das sub-redes nos quantitativos | A | ❌ | — |
| Separação nas legendas | A | ❌ | — |
| Personalização da representação gráfica | M | 🟡 | cor por disciplina fixa; estilos do 3D |
| Propriedades associadas a cada elemento do modelo | E | ✅ | DN, cotas, `itemCode`, rótulo, sugerido |

## O modelo único

A proposta do usuário — um modelo hidrossanitário do qual tudo deriva — **já é como o
ÒPURA funciona**, e é a razão de várias coisas acima já estarem de pé:

- **O que é guardado** é pouco: `trechos` (tubo com pontas, cotas e DN), `terminais`
  (pontos tipados, caixas, peças sobre o trecho) e `componentes` (louças).
- **O que é derivado, e nunca copiado**: conexões (`conexoesDerivadas`), pontas abertas,
  quantitativo e orçamento, desenho 2D bifilar, 3D com peças e rótulos, IFC, conflitos.
  Mudar um trecho muda todos, sem sincronização.
- **Onde a regra ainda vai precisar de peça nova no modelo** (e não de tela nova):
  - disciplinas `PLUVIAL` e `VENTILACAO` (hoje a ventilação é ESGOTO com rótulo);
  - sub-rede/sistema nomeado por trecho (grupos 10, 26);
  - reservatório com papel (inferior/superior) e o dimensionamento derivado do consumo;
  - o **sentido do fluxo** — hoje deduzido no plano automático e perdido depois;
  - o memorial como DERIVADO (gerado do modelo a cada vez), não como documento editado
    que envelhece.

## Os motores

Os 12 motores da proposta, como camadas do mesmo modelo (não como telas):

| Motor | Hoje | Arquivos | Falta o essencial |
|---|---|---|---|
| Modelador 2D/3D | 🟡 | `BlueprintCanvas.tsx`, `Blueprint3DViewer.tsx`, `blueprintIsometrico.ts` | lançar em corte, editar no 3D |
| Lançamento automático | ✅ | `blueprintAguaAutomatica.ts`, `blueprintEsgotoAutomatico.ts`, `blueprintRotaPelasParedes.ts`, `blueprintPontosHidraulicos.ts` | desvio estrutural, desvio de prumada |
| Hidráulico | 🟡 | `blueprintAguaAutomatica.ts` | **perda de carga, pressão, rugosidade, reservatório, alimentação, bomba** |
| Sanitário | 🟡 | `blueprintEsgotoAutomatico.ts` | tabelas NBR 8160 completas, coletor predial, fluxo |
| Pluvial | ❌ | — | tudo |
| Ventilação | 🟡 | `planejarEsgoto` (coluna) | ramais, dimensionamento, distância, acima da cobertura |
| Tratamento | ❌ | — | fossa, filtro, sumidouro |
| Aquecimento | 🟡 | `AQUECEDOR` como origem | boiler, passagem dimensionado, solar |
| Piscinas | ❌ | — | (B) |
| BIM/compatibilização | 🟡 | `blueprintIfc.ts`, `blueprintBcf*.ts`, `conflitos.ts` | IfcPipeSegment/IfcPipeFitting, importar MEP |
| Documentação | 🟡 | `blueprintPranchas.ts` (sem hidráulica) | prancha hidráulica, isométrico de prancha, legendas, memorial |
| Quantitativos | ✅ | `quantities.ts`, `blueprintBudget.ts`, `blueprintPlanilha.ts` | por pavimento, calhas |

## Leitura geral

Contagem feita por script sobre as tabelas acima (323 itens — todos os do pedido,
na mesma ordem):

| Grau | ✅ | 🟡 | ❌ | Total |
|---|---|---|---|---|
| **E** | 67 | 34 | 67 | 168 |
| **A** | 11 | 28 | 43 | 82 |
| **M** | 1 | 4 | 46 | 51 |
| **B** | 0 | 1 | 20 | 21 |
| **N** | 0 | 0 | 1 | 1 |
| **Total** | 79 | 67 | 177 | 323 |

**O que isso diz:**

- **Dos 168 itens Essenciais, 67 já estão prontos (40 %)** — e são quase todos do
  "traçar e quantificar": lançamento manual e automático de água e esgoto, pontos e
  kits, conexões, declividade, 3D, bifilar, quantitativo, orçamento. É o que o ÒPURA
  precisava como ferramenta da incorporadora, e está de pé.
- **Os 101 Essenciais que faltam (67 ❌ + 34 🟡) são quase todos de CÁLCULO e de
  ENTREGA** — exatamente o que separa "pré-projeto" de "substituir o projetista".

**O caminho crítico — os Essenciais ❌/🟡, agrupados pelo que precisam no código:**

| # | Bloco | Itens E | Grupos | Peça principal que falta |
|---|---|---|---|---|
| 1 | **Pressão e perda de carga** | 11 | 2, 6, 17 | perda distribuída (rugosidade) + localizada (as conexões já são conhecidas), pressão disponível por ponto, aviso de pressão insuficiente, perda no hidrômetro |
| 2 | **Reservatório e alimentação** | 19 | 1, 5, 6, 7 | consumo diário → volume; inferior/superior; boia, extravasor, limpeza; entrada, hidrômetro, alimentador; recalque e sucção |
| 3 | **Pluvial** | 13 | 12, 23 | disciplina `PLUVIAL`, área de contribuição do telhado, intensidade, calhas e condutores (NBR 10844) |
| 4 | **Ventilação NBR 8160** | 8 | 11, 17 | ramais de ventilação, DN, distância ao desconector, acima da cobertura |
| 5 | **Esgoto completo** | 12 | 9, 10, 17 | tabelas NBR 8160 por tipo de tubo, coletor predial e rede pública, sentido de fluxo, desvio estrutural, avisos de DN |
| 6 | **Tratamento individual** | 6 | 14 | tanque séptico, filtro, sumidouro (NBR 7229/13969) |
| 7 | **Prancha hidrossanitária** | 15 | 18, 25 | `TipoDePrancha` HIDRAULICA/SANITARIA, isométrico de prancha, legendas, cotas de tubo |
| 8 | **Memoriais** | 6 | 24 | memorial descritivo e de cálculo derivados do modelo |
| 9 | **Verificação visível** | 3 | 10, 17 | pontas abertas no desenho (já calculadas), inconsistências no croqui |
| 10 | **Entregáveis de dados** | 8 | 3, 8, 20, 22, 23 | IFC com `IfcPipeSegment`/`IfcPipeFitting`, quantitativo por pavimento, insumo por peça, válvulas, aquecedor dimensionado |

(Cada um dos 101 está em exatamente um bloco — contagem por script; o bloco 1 também destrava itens de outros blocos, como a bomba e o hidrômetro.)

**Desvio inverso, como na análise do Revit:** pouco. O esforço recente (conexões em 3D,
bifilar, junção 45°, rede pelas paredes) caiu em itens E/A de verdade. O que sobrou
acima do grau é quase só o 3D navegável (A, pronto) — e ele é a base do isométrico
de prancha (E), então não é desperdício.

**A ordem que o critério sugere:** o bloco 1 (pressão) primeiro, porque é o que um
projetista confere antes de qualquer outra coisa e porque destrava os avisos, a bomba
e o hidrômetro; depois 7 e 8 (prancha e memorial), que são a ENTREGA; em seguida 2, 4 e
5, que completam as normas de água e esgoto; e 3 e 6, que são sistemas inteiros novos.

## Próximo passo

Transformar esta classificação num roadmap por etapas — como a análise do Revit virou
`docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md` —, começando pelo
caminho crítico acima. **Não executado**: aguarda o pedido do usuário.
