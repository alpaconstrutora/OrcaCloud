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

**Pedido de 10/10/2026** (depois da E10 publicada), transcrito literalmente:

```
implementar:
1
Implementar o que Ficou de fora:
1. Componente na matriz: pedir que componentes também se copiem exige mudar o kernel; hoje eles ficam de fora, com aviso.
2. Altura no 3D: mover pela alça só desloca em planta; a cota continua sendo ajustada no painel.
3. Decisão sua: a lista de referências IFC de um estudo está guardada no navegador de quem a montou, porque guardá-la no estudo, para todos verem, pede uma tabela nova (migration), e isso só com o seu OK. Quer que eu crie essa tabela? sim
4. depois seguir para o próximo passo do roteiro é a E11, o gerador de climatização. Começo quando você mandar.
```

**Pedido de 10/10/2026, depois da E11 publicada**, transcrito literalmente:

```
Implementar os dois itens que ficaram de fora !
```

(Os dois itens eram: o Ctrl+D sem instalações e componentes, e o portão `cena=estrutura` do harness 3D
em 2,33 %.)

## Status em 10/10/2026

**O roadmap foi implementado inteiro: as 12 etapas (E0–E11) estão publicadas em `main`, as 42 fases,
com CI verde e o domínio conferido.** Depois delas saíram três complementos pedidos pelo usuário:
- E9b: gás do VRF, cabo pelo eletroduto e peso do painel;
- as pendências da E10: componente na matriz, subir/descer no 3D e referências IFC no estudo;
- as duas sobras: Ctrl+D completo e o harness 3D.

O detalhe de cada fase está em "Execução", no fim do documento.

| Etapa | Entrega | Publicada | Commit | Kernel / banco |
|---|---|---|---|---|
| E0 | Premissas, clima por cidade, dados por ambiente; defeitos 9–12 | 04/10 | `ee098c1f..8f879ae2` | migration `blueprint_study_climatizacao` |
| E1 | Envoltória: vidro e proteção solar, camadas no telhado e laje, exposição vertical | 04/10 | `c92d152f..f80399e6` | kernel 0.91.0 |
| E2 | Motor de carga térmica, painel por ambiente, mapa de calor, memorial | 04/10 | `f80399e6..e0913bde` | — |
| E3 | Equipamento como peça da rede, `FRIGORIGENA` e `DRENO_AC`, símbolos, numeração, kit | 04/10 | `9a75709d` | kernel 0.92.0 |
| E4 | Seleção pelo catálogo, posição do split, ponto elétrico | 05/10 | `8cc331dd` | — |
| E5 | Linha frigorígena e dreno (traçado, faixas, gás, curvas, bomba) | 05/10 | `1eada5c6` | — (desvio dito) |
| E6 | VRF: árvore, derivadores, limites | 05/10 | `7a807df2` | — (desvio dito) |
| E7 | Duto retangular, terminais de ar, perda de carga, renovação e exaustão | 07/10 | `16f0c72d` | kernel 0.93.0 |
| E8 | Pranchas, legenda, isométrico, detalhes típicos, memoriais, emissão com ART | 07/10 | `dccccd12` | migration (CHECK do executivo) |
| E9 | Quantitativo, medidas do orçamento, lista de materiais | 07/10 | `8c52adc1` | quant-1.25.0 |
| E9b | Gás do VRF, cabo pelo eletroduto, peso do painel pré-isolado | 07/10 | `c7b2e043` | — |
| E10.1 | IFC da climatização (ida e volta) | 07/10 | `eca6d832` | — (planta-api redeployada) |
| E10.2 | Compatibilização (envelope, equipamento, ponta comum) | 07/10 | `eeeb0426` | — |
| E10.3 | Editor 3D: seleção múltipla, mover, caixa de corte, lado a lado | 08/10 | `e989ccd6` + `56c1bc8d` | — |
| E10.4 | Alinhar/distribuir, IFC externo no 3D, DXF vetorial | 08/10 | `dd0c3697`, `492fde88`, `ad7bd9eb` | — |
| Pendências E10 | Componente na matriz, subir/descer no 3D, referências no estudo | 10/10 | `277fad31` | migration `blueprint_study_referencias` |
| E11 | Gerador de climatização (um lote, relatório) | 10/10 | `080bb860` | — |
| Sobras | Ctrl+D completo; harness 3D com o CSS do app | 10/10 | `4a37dc3e` | — |

**Achados do benchmark:** os 12 que pediam código estão resolvidos.
- **Na E0:** 3 (pé-direito único), 4 (U da parede), 5 (insolação no estudo), 6 (dados por ambiente
  pelo uid da etiqueta) e 9 a 12 (frase do IFC, difusor fora dos pontos hidráulicos, `SISTEMA_IFC`,
  `DuplicateLevel` com componentes).
- **Na E1.3:** 7 (o que está acima e abaixo do ambiente).
- **Na E3:** 1 e 2 (equipamento na rede; três disciplinas).
- **Os outros dois:**
  - o achado 8 (as normas) continua aberto e é a pendência A abaixo;
  - o achado 13: o modelo externo como referência entrou na E10.4b, e o RVT direto segue no backlog.

**A tabela item a item da Parte 1 foi REGRADUADA em 10/10.** Dos 228 Essenciais, **162 ✅ (71 %), 56 🟡 e
10 ❌**; eram 51 / 83 / 94 em 04/10. Os números e os 10 ❌ estão na "Leitura geral".

### Pendências

**A. Normas e dados de fabricante — o que impede "fechar" a disciplina.** Nenhuma das normas chegou à
pasta (NBR 16655-1/2/3, NBR 16401-1/2/3). Tudo o que vem delas foi transcrito de memória e carrega
**CONFERIR NA NORMA** no código, na tela, no memorial e no relatório do gerador:
- a tabela de condições externas por cidade (TBS/TBU, 16401-1 Anexo A);
- as parcelas da carga térmica: pessoas, iluminação, equipamentos, insolação por orientação e fatores
  de proteção solar (16655-3);
- a renovação de ar e a exaustão (16401-3);
- o conforto interno.

As faixas de diâmetro, comprimento, desnível e gás da linha e os limites do VRF são de FABRICANTE,
nomeados como hipótese, e o catálogo de capacidades é o semeado. Quando os PDFs e um catálogo real
chegarem, conferir tabela por tabela e tirar a marca.

**B. Provas no app real ainda não feitas** (login, estudo descartável, como as de 05/10 e 07/10).

Já provados:
- E0, E2 e E4 (05/10);
- E5, a emissão com ART (E8.4) e a E9 (07/10);
- da E6 e da E7, só as gavetas abrindo.

Faltam:
- E1: vidro e camadas declarados na tela;
- E3: inserir evaporadora e condensadora pelo menu e ligar o sistema;
- E6: lançar a árvore VRF;
- E7: lançar a espinha de dutos e ver no 3D;
- E10: IFC exportado aberto fora e reimportado; conflitos; o editor 3D; a referência IFC com a tabela
  nova e um arquivo real da biblioteca; o DXF vetorial com um DXF/DWG real;
- E11: o gerador;
- o Ctrl+D completo.

**C. Funcionais deixados de fora nas etapas (ditos em cada "Não entrou").**
- **Entre pavimentos:**
  - a prumada da linha frigorígena (condensadora na cobertura);
  - a prumada do VRF (evaporadora de outro pavimento só gera AVISO).
- **VRF:** o comprimento equivalente das conexões e o coletor (header) como peça.
- **Dreno:** o DN pela vazão de condensado (hoje 25 mm fixos, hipótese) e o sifão como peça (hoje só
  no detalhe típico).
- **Dutos:**
  - a exaustão com duto até a fachada (o exaustor é conferido no ambiente, a rede dele não é traçada);
  - o desvio de pilar no forro (o conflito acusa);
  - a perda em damper e plenum;
  - o duto flexível do difusor como peça.
- **Desenho:** a linha frigorígena aparece como UM tubo na planta e no 3D da tela (o par
  líquido/sucção existe no IFC).
- ✅ **Feitos em 10/10 (frente `clima-cd`):**
  - **C12:** as cotas passam além da condensadora;
  - **C13:** os rótulos do isométrico não encostam;
  - **C14:** `.VENTILATION.`;
  - **C15:** `IfcCovering` do isolamento;
  - **C16:** colunas da climatização por pavimento.
- **Gerador (por decisão):**
  - não lança o orçamento (a composição é do orçamentista);
  - só liga o circuito quando não arrasta pontos que ele não criou;
  - as peças nascem sugeridas e se aceitam nos painéis.

**D. Pequenos — ✅ todos feitos em 10/10 (frente `clima-cd`):**
- **D1:** o símbolo da hi-wall e das outras peças retangulares nas proporções da peça.
- **D2:** um só "Difusor" no menu, o tipado; a gaveta de Dutos converte os terminais antigos de texto
  livre.
- **D3:** a densidade W/m² pela área útil.
- **D4:** o link `#/blueprint?studyId=` abre o estudo também com a lista já na tela. Era o módulo que
  só lia o parâmetro ao montar.

**F. Achados da regraduação, fora da lista C/D — para o usuário decidir.**

Itens ❌ que não são backlog:
- o raio das curvas da linha é tabela fixa, sem campo no trecho nem hipótese editável;
- não há adaptador redondo↔retangular nem colarinho;
- não há objeto 3D cadastrável por peça, e o equipamento sai como caixa;
- a legenda da prancha não é personalizável;
- não há quantitativo por detalhe.

E os 🟡 que a regraduação revelou:
- **Conflito do equipamento:** o conflito equipamento × arquitetura (parede, porta, janela, folga de
  manutenção) só confere a RESERVA antiga. O equipamento real só confere o centro dentro de
  pilar/viga.
- **Importação IFC:** a unidade `.SPLITSYSTEM.` de outro programa é recusada (provado só com o IFC
  da própria Planta).
- **Corte:** sem o equipamento e sem o terminal de ar, e a linha cortada como um tubo sem isolamento.
- **Referências externas:** o IFC externo aparece só no 3D, não na planta 2D. O DXF vetorial traz só
  linhas e arcos (sem textos e cotas).
- **Evaporadora inserida à mão:** o ponto elétrico ganha os 1400 VA típicos, não a potência do modelo.
- **Problemas de dimensionamento:** só aparecem nos painéis, não marcados no desenho.
- **Porta interna para ambiente não climatizado:** sai da parede e nenhuma parcela a substitui. A
  infiltração é por trocas/h, não por fresta.
- **Ambiente vizinho:** a temperatura dele não se declara (fração fixa do ΔT).
- **Iluminação:** sai de W/m² × área, e não das luminárias desenhadas.
- **Catálogo:** o tipo só se renomeia, desativa ou apaga.

**E. Backlog nomeado (sem mudança):**
- RVT/RTE direto (serviço externo);
- gás, SPDA e cabeamento estruturado como disciplinas;
- edição no isométrico e planos XZ/YZ;
- catálogos reais de fabricantes;
- chiller, água gelada e fancoil;
- CFD e simulação energética anual (N).

### Plano das pendências C e D (pedido de 10/10/2026, depois do status)

Pedido do usuário, transcrito literalmente:

```
A. Normas: as NBR 16655 e 16401 nunca chegaram. Tudo o que depende delas segue marcado "CONFERIR NA NORMA", e os dados de fabricante continuam sendo hipóteses: Vou conferir
B. Testes no app real ainda não feitos: E1, E3, o lançamento de VRF e de dutos, a E10 inteira, o gerador (E11) e o Ctrl+D novo; vou realizar os testes
C. Funcionalidades deixadas de fora: prumada entre pavimentos, diâmetro do dreno pela vazão de condensado, linha frigorígena desenhada como um tubo só na tela (o par líquido/sucção existe apenas no IFC), entre outras: implementar todas
D. Detalhes anotados: o símbolo da evaporadora hi-wall sai maior que a peça e o "Difusor / grelha" continua como texto livre no menu, entre outros.: implementar todos
E. Backlog, sem mudança.": detalhe para eu entender do que se trata
A tabela de 247 itens comparados com o AltoQi ainda mostra a situação de 04/10, antes da implementação, e o documento agora avisa isso. Se quiser os números atualizados, reavalio item por item: Sim, traga os números atualizados, reavalio item por item.
```

**A e B ficam com o usuário** (conferir as normas; testar no app real). **E** foi explicado na conversa.
Os três itens do gerador em C eram DECISÕES, e não faltas: não lançar o orçamento, só ligar o circuito
sem arrastar pontos alheios, e as peças nascerem sugeridas. Eles ficam, e o motivo foi explicado. Todo
o resto de C e de D entra abaixo.

| # | O que muda | Pronto quando |
|---|---|---|
| C1 | **Prumada da linha frigorígena entre pavimentos**: a condensadora em outro pavimento (a cobertura) liga pela vertical (shaft, se houver; senão sob a condensadora) | teste: evaporadora no térreo e condensadora na cobertura → linha horizontal + prumada + horizontal, comprimento e desnível certos, conexão no grafo |
| C2 | **Prumada do VRF**: as evaporadoras de outro pavimento entram na árvore (deixam de ser só AVISO) | teste: VRF na cobertura com evaporadoras em dois pavimentos → árvore única com derivadores |
| C3 | **VRF: comprimento equivalente** das conexões (curvas e derivadores) somado nos limites | teste: o comprimento conferido = real + Σ equivalentes (hipótese editável) |
| C4 | **VRF: coletor (header)** como peça, onde a estrela sai de um ponto | teste: 3+ ramais no mesmo nó → 1 coletor, não N derivadores |
| C5 | **Dreno: DN pela vazão de condensado** (capacidade → L/h → DN), hipótese editável | teste: DN cresce com a soma das evaporadoras a montante |
| C6 | **Dreno: sifão como peça** na saída do dreno | teste: o dreno lançado termina com o sifão; ele entra no quantitativo |
| C7 | **Exaustão com duto até a fachada** | teste: o banheiro sem janela com exaustor → duto até a parede externa mais próxima, com grelha de saída |
| C8 | **Desvio de pilar no forro** (dutos) | teste: o duto que cruzaria um pilar contorna, e o conflito some |
| C9 | **Perda em damper e plenum** | teste: a perda do ramal soma o coeficiente do damper e do plenum |
| C10 | **Duto flexível do difusor** como peça | teste: cada difusor ligado por um trecho flexível curto; ele entra no quantitativo |
| C11 | **A linha como PAR na tela**: dois traços na planta, dois tubos no 3D | teste puro do par em planta e no 3D (mesmos deslocamentos do IFC) |
| C12 | **As cotas da arquitetura não passam por cima da condensadora** fora da parede | teste da cadeia de cotas desviando da peça |
| C13 | **Isométrico: rótulos que não encostam** | teste: nenhum par de rótulos sobreposto no caso das peças próximas |
| C14 | **IFC: `.VENTILATION.`** para rede só de exaustão | teste: rede só de exaustor sai `.VENTILATION.` |
| C15 | **IFC: `IfcCovering` do isolamento** | teste: o tubo isolado emite o covering ligado a ele; ida e volta pelo web-ifc |
| C16 | **Quantitativos por pavimento com as colunas da climatização** | teste da tela/planilha com as colunas |
| D1 | **Símbolo da hi-wall nas proporções da peça** (não no quadrado da maior medida) | teste: o retângulo desenhado = 900 × 220 |
| D2 | **"Difusor / grelha" tipado**: o menu insere os tipos da E7; o terminal de texto livre antigo é lido como legado | teste do menu e da leitura do legado |
| D3 | **W/m² pela área útil** do ambiente (a carga continua conservadora pela área de eixo; a densidade reporta a útil) | teste: densidade = W ÷ área útil |
| D4 | **O link `#/blueprint?studyId=` abre o estudo** | reproduzir, corrigir, teste |

**Ordem:** primeiro a frente `clima-cd` (D1–D4, C12–C16 e este plano); depois linha e dreno (C1–C6,
C11; o sifão e o coletor são tipos novos de peça, então pedem bump do kernel); por último os dutos
(C7–C10). Em paralelo roda a **regraduação dos 247 itens** da Parte 1, contra o código atual e com
evidência `arquivo:linha`.

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

> **REGRADUADA em 10/10/2026**, depois da execução inteira (E0–E11 e complementos), contra o código de
> `origin/main` `7f963917`, item por item, com evidência `arquivo:linha` — mais as pendências D1–D4
> publicadas na mesma frente. A contagem de 04/10 (o ponto de partida) está guardada na "Leitura
> geral".

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
| Criação do projeto de climatização dentro da edificação | E | ✅ | aba Mecânica com os grupos Premissas, Carga térmica, Split, Linha e dreno, VRF, Dutos e Gerador (`components/blueprint/BlueprintEditor.tsx:12225-12281`); premissas e clima do estudo gravados em `blueprint_study_climatizacao` (`utils/blueprintClimatizacao.ts:382`) |
| Modelagem BIM da instalação | E | ✅ | equipamento como peça da rede (`utils/blueprintKernel/model.ts:2996-3026`), disciplinas `FRIGORIGENA`/`DRENO_AC` (`model.ts:2563`), sucção, isolamento e duto retangular no trecho (`model.ts:2762-2772`), sistema `condensadoraId` (`model.ts:3404`); IFC com Pset (`utils/blueprintIfc.ts:1411`) |
| Modelagem em planta baixa | E | ✅ | os 20 tipos entram no menu pela ficha (`components/blueprint/MenuComponentes.tsx:289`), linha e dreno como trecho (`MenuComponentes.tsx:327-339`), duto (`MenuComponentes.tsx:755`); traçado automático pelos planejadores E4–E7 |
| Modelagem em vista 3D | E | 🟡 | duto retangular como caixa girada pela base (`components/blueprint/Blueprint3DViewer.tsx:1169-1193`), equipamento como caixa nas medidas da ficha (`Blueprint3DViewer.tsx:1214-1245`); falta: a linha frigorígena é UM cilindro com o Ø do líquido (o par só existe no IFC), sem isolamento, e o equipamento é caixa, não modelo |
| Edição diretamente no ambiente 3D | E | 🟡 | seleção por clique com Shift/Ctrl (`utils/blueprint3dSelecao.ts:46`), alça de mover em X/Z e subir/descer em Y (`Blueprint3DViewer.tsx:2328-2351`), um Ctrl+Z (`utils/blueprintSelecao.ts:35, 76`); falta girar, lançar peça/trecho e esticar ponta no 3D (`disableRotations`) |
| Geração e edição em cortes | E | 🟡 | o corte sai com as redes, duto retangular cortado na meia altura (`utils/blueprintCorte.ts:327`); edição no corte não existe (planos XZ/YZ seguem no backlog) |
| Geração de detalhes isométricos | E | ✅ | `isometricoDeClimatizacao` com todos os pavimentos e rótulo L×A / Ø líquido/sucção (`utils/blueprintDetalhesClimatizacao.ts:26`); os rótulos desviam uns dos outros (C13, 10/10: `lugarDoRotulo`) |
| Posicionamento por altura/cota | E | ✅ | `Terminal.cotaMm` (`model.ts:3195`), `cotaAMm`/`cotaBMm` do trecho (`model.ts:2686`), campo Cota no painel (`components/blueprint/PainelTrechoSelecionado.tsx:235`) e subir/descer no 3D (`utils/blueprint3dSelecao.ts:71`) |
| Modelagem em diferentes pavimentos | E | 🟡 | `levelId` em toda peça e `DuplicateLevel` copia componentes (`utils/blueprintKernel/commands.ts:5262`); falta a prumada da linha e do VRF entre pavimentos: sistemas só no mesmo pavimento (`utils/blueprintLinhaFrigorigena.ts:95`, `utils/blueprintVrf.ts:91`) |
| Visualização simultânea entre croqui e 3D | E | ✅ | "Planta + 3D lado a lado", persistido (`BlueprintEditor.tsx:1724, 10078, 14633`) — a mesma cena e a mesma seleção; desliga nas elevações, dizendo por quê |
| Movimentação de elementos no ambiente 3D | E | ✅ | alça X/Z vira o mesmo `TranslateEntities` do 2D (`utils/blueprint3dSelecao.ts:62`, `utils/blueprintSelecao.ts:35`); Y vira a cota (`utils/blueprintSelecao.ts:76`) |
| Caixa de corte 3D | E | ✅ | seis planos por material (`Blueprint3DViewer.tsx:1997-2012`, `utils/blueprint3dSelecao.ts:85`) |
| Controle de visibilidade dos elementos/modelos | E | ✅ | camadas por disciplina; linha e dreno na camada Mecânica (`utils/blueprintCamadasPorDisciplina.ts:110-111`); `idsDaClimatizacao` para a vista (`utils/blueprintSimbolosClimatizacao.ts:41`); olho na referência IFC externa |
| Níveis intermediários | E | 🟡 | `AddLevel` aceita qualquer elevação (`commands.ts:1565`); falta tratamento próprio de mezanino |
| Seleção múltipla de elementos | E | ✅ | 2D por janela e Shift; 3D por Shift/Ctrl/⌘, a mesma seleção (`utils/blueprint3dSelecao.ts:46`, `Blueprint3DViewer.tsx:933`) |
| Comandos gerais de edição, cópia, movimentação e alinhamento | E | ✅ | mover, espelhar, girar (`commands.ts:4228, 4428, 4522`); Ctrl+D com instalações e componentes (`utils/blueprintSelecao.ts:222`); alinhar trecho/componente, distribuir e matriz com componente, o sistema seguindo a cópia (`utils/blueprintSelecao.ts:377, 534, 602`) |

## 2. Sistemas de climatização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Split | E | ✅ | evaporadora + condensadora tipadas com capacidade e sistema (`model.ts:3000, 3391, 3404`); seleção e posição (`utils/blueprintPosicaoSplit.ts:181`); linha e dreno (`utils/blueprintLinhaFrigorigena.ts:228`) |
| VRF | E | 🟡 | árvore com derivadores e Ø pelo somatório a jusante, taxa e limites (`utils/blueprintVrf.ts:165, 335, 431`); falta: prumada entre pavimentos (evaporadora de outro pavimento só AVISO), comprimento equivalente das conexões, coletor (header) como peça |
| Unidades evaporadoras | E | ✅ | hi-wall, piso-teto, cassete e dutada (`model.ts:3019`), fichas com cota e medidas (`utils/blueprintHidraulica.ts:691-694`) |
| Unidades condensadoras | E | ✅ | split e VRF (`model.ts:3020`, `utils/blueprintHidraulica.ts:695-696`); as medidas da ficha são fixas (não variam com a capacidade) |
| Interligação entre os equipamentos | E | ✅ | `condensadoraId` com invariante `BAD_CONDENSER` (`model.ts:3404, 5262-5266`); a peça conta no nó da linha e do dreno (`utils/blueprintKernel/conexoes.ts:229-237`) |
| Redes frigorígenas | E | 🟡 | disciplina `FRIGORIGENA` em cobre, par líquido/sucção e isolamento num trecho (`model.ts:2563, 2762-2764`), traçado e conferência (`utils/blueprintLinhaFrigorigena.ts:228, 445`); falta a prumada entre pavimentos e o desenho do par na tela (um tubo só) |
| Dutos | E | ✅ | duto redondo ou retangular (`model.ts:2772`), vazão, perda de carga e espinha automática (`utils/blueprintRedeDeAr.ts:233, 420`); lacunas de acessório em §9–§10 |
| Exaustores e componentes auxiliares | E | 🟡 | `EXAUSTOR_AR` com vazão (`utils/blueprintHidraulica.ts:698`, `model.ts:3025`) e exaustão conferida por ambiente (`utils/blueprintRedeDeAr.ts:352`); falta traçar o duto de exaustão até a fachada (a rede de ar só parte de dutada/caixa, `utils/blueprintRedeDeAr.ts:49`) |

## 3. Lançamento de evaporadoras

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Inserção da evaporadora | E | ✅ | grupo "Climatização — equipamentos" gerado da ficha (`components/blueprint/MenuComponentes.tsx:289`), e pelo planejador do Split (`utils/blueprintPosicaoSplit.ts:109`) |
| Definição da altura | E | ✅ | cota da ficha (2,20 m hi-wall, `utils/blueprintHidraulica.ts:691`), editável no painel (`PainelTrechoSelecionado.tsx:235`) e no 3D |
| Posicionamento em planta | E | ✅ | à mão, com mover/arraste; automático em parede sem porta, externa de preferência (`utils/blueprintPosicaoSplit.ts:109`) |
| Escolha do modelo | E | 🟡 | catálogo da organização filtrado por capacidade e menor modelo que alcança a carga (`utils/blueprintSelecaoClimatizacao.ts:47, 86`); falta catálogo real de fabricante: as sementes são 8 hi-wall com potência de placa HIPÓTESE (`utils/blueprintCatalogoDeTipos.ts:83`) |
| Orientação do equipamento | E | ✅ | `rotacaoGraus` (`model.ts:3385`, painel `PainelTrechoSelecionado.tsx:259`); o planejador gira para soprar para dentro (`utils/blueprintPosicaoSplit.ts:92`) |
| Movimentação posterior | E | ✅ | `TranslateEntities` (`commands.ts:4228`), no 2D e no 3D |
| Ajuste da representação gráfica | E | 🟡 | símbolo técnico por tipo, nas proporções da peça desde 10/10 (`utils/blueprintSimbolosClimatizacao.ts`, `proporcaoDoSimbolo`); falta: a organização não escolhe nem cadastra a representação |
| Associação às peças cadastradas | E | ✅ | tipo salvo leva a capacidade (`utils/blueprintTipos.ts:67`); composição por peça nas três redes (`components/blueprint/PainelComposicoesDePeca.tsx:18`) |
| Representação 2D | E | ✅ | símbolo + número EV-n (`BlueprintCanvas.tsx:6862`, `utils/blueprintNumeracaoClimatizacao.ts:45`), na largura × profundidade da peça (pendência D1, 10/10: `proporcaoDoSimbolo`) |
| Representação 3D | E | 🟡 | caixa nas medidas da ficha, na cor da disciplina (`Blueprint3DViewer.tsx:1214-1245`); sem modelo do aparelho |

## 4. Lançamento de condensadoras

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Inserção da condensadora | E | ✅ | menu "Climatização — equipamentos" (split e VRF, `utils/blueprintHidraulica.ts:695-696`) e pelo planejador do Split |
| Definição da altura | E | ✅ | `Terminal.cotaMm` (`model.ts:3195`), cota 0 na ficha, editável |
| Escolha da posição | E | ✅ | à mão ou automática fora da parede externa / ambiente técnico (`utils/blueprintPosicaoSplit.ts:158`) |
| Seleção do modelo | E | 🟡 | capacidade declarável (`model.ts:3391`); o planejador dá à condensadora a capacidade do modelo escolhido (`utils/blueprintPosicaoSplit.ts:257-261`); falta catálogo de condensadoras/fabricante e medidas por capacidade |
| Orientação da unidade | E | ✅ | `rotacaoGraus` (`model.ts:3385`) |
| Movimentação | E | ✅ | idem evaporadora |
| Ajuste das indicações/textos | E | 🟡 | número CD-n, rótulo declarado e tag de capacidade na prancha (`utils/blueprintPranchaClimatizacao.ts:46`), posição livre automática (`utils/blueprintPranchaClimatizacao.ts:168`); falta mover a tag à mão, e as cotas da arquitetura passam por cima da condensadora fora da parede |
| Representação BIM 3D | E | 🟡 | IFC `IfcUnitaryEquipment .SPLITSYSTEM./.AIRCONDITIONINGUNIT.` com Pset (`utils/blueprintIfc.ts:2632-2634, 1411`); no 3D da tela é caixa |

## 5. Lançamento de equipamentos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Evaporadoras | E | ✅ | §3 (os limites de catálogo e de desenho estão lá) |
| Condensadoras | E | ✅ | §4 |
| Exaustores | E | 🟡 | `EXAUSTOR_AR` com vazão declarada ou derivada (`utils/blueprintRedeDeAr.ts:143`); falta o duto de exaustão até a fachada |
| Bocais | E | ✅ | `BOCAL_AR` com ficha e vazão (`utils/blueprintHidraulica.ts:705`, `model.ts:3025`) |
| Caixas de distribuição | E | ✅ | `CAIXA_DISTRIBUICAO_AR` (`utils/blueprintHidraulica.ts:701`), raiz da rede de ar (`utils/blueprintRedeDeAr.ts:49`) |
| Bombas de drenagem | E | ✅ | `BOMBA_DRENO` (`utils/blueprintHidraulica.ts:699`), lançada quando o descarte fica alto (`utils/blueprintLinhaFrigorigena.ts:326`) |
| Componentes auxiliares | E | ✅ | derivador VRF, ponto de dreno, damper, plenum, veneziana, tomada de ar (`model.ts:3002-3014`) |
| Equipamentos personalizados | E | ✅ | `EQUIPAMENTO_CLIMATIZACAO` nas três disciplinas, com capacidade (`utils/blueprintHidraulica.ts:710`); nome e item pelo cadastro de tipos |

## 6. Pontos genéricos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Ponto genérico de climatização (o que os comandos padrões não cobrem) | E | ✅ | o personalizado tem ficha, medidas e capacidade (`utils/blueprintHidraulica.ts:710`); o menu insere o difusor TIPADO e a gaveta de Dutos converte os terminais antigos de texto livre num lote (pendência D2, 10/10: `utils/blueprintRedeDeAr.ts`, `comandosDeConverterTerminaisAntigos`) |
| Não ficar preso à biblioteca nativa | E | ✅ | catálogo de tipos por organização (`blueprint_element_types`) com capacidade (`utils/blueprintTipos.ts:67`) |

## 7. Linhas frigorígenas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento das linhas frigorígenas | E | ✅ | menu "Linha frigorígena" (`MenuComponentes.tsx:327`) e traçado automático pela parede (`utils/blueprintLinhaFrigorigena.ts:228`) |
| Interligação evaporadora–condensadora | E | ✅ | a peça é ponta de trecho (`utils/blueprintKernel/conexoes.ts:229-237`); a linha sobe da evaporadora e desce na condensadora (`utils/blueprintLinhaFrigorigena.ts:228`) |
| Lançamento das tubulações | E | ✅ | trecho `FRIGORIGENA` com Ø líquido/sucção e isolamento (`model.ts:2762-2764`), campos no painel (`PainelTrechoSelecionado.tsx:944, 955`) |
| Definição gráfica dos trajetos | E | ✅ | trecho por cliques com OSNAP; automático pelo eixo das paredes, desviando pilar |
| Visualização da tubulação em 3D | E | 🟡 | cilindro do trecho (`Blueprint3DViewer.tsx:1146-1200`); falta o par líquido/sucção e o isolamento na tela (o par só existe no IFC, `utils/blueprintIfc.ts:2273, 2306`) |
| Condutos multicurva | E | 🟡 | percurso em trechos retos encadeados; cada dobra vira curva derivada contada na conferência (`utils/blueprintLinhaFrigorigena.ts:445`); o trecho é sempre reto `a → b` (`model.ts:2686`), sem arco |
| Curvas com raio mínimo | E | 🟡 | raio mínimo por Ø dito na conferência (`utils/blueprintLinhaFrigorigena.ts:72-73`); não é desenhado nem verificado na geometria |
| Ajuste do raio das curvas | E | ❌ | o raio é tabela fixa (`utils/blueprintLinhaFrigorigena.ts:72`), nem hipótese editável; sem campo de raio no trecho (o `Trecho.curva` do roadmap não entrou) |
| Representação realista do percurso | E | 🟡 | no IFC, o par isolado lado a lado (`utils/blueprintIfc.ts:2306`); na planta e no 3D da tela, um tubo só, com cantos vivos |

## 8. Tubulações

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento de tubulações | E | 🟡 | linha e dreno como disciplinas próprias (`model.ts:2563`), dreno automático por gravidade ou bomba (`utils/blueprintLinhaFrigorigena.ts:228`); falta o DN do dreno pela vazão de condensado (hipótese fixa de 25 mm, `utils/blueprintClimatizacao.ts:382`) e o sifão como peça (só no detalhe típico, `utils/blueprintDetalhesClimatizacao.ts:95`) |
| Trajetos horizontais | E | ✅ | corrida na cota da linha (`utils/blueprintLinhaFrigorigena.ts:228`); dreno com declividade conferida trecho a trecho (`utils/blueprintLinhaFrigorigena.ts:489`) |
| Trajetos verticais | E | 🟡 | subida e descida dentro do pavimento; falta a prumada da linha/VRF entre pavimentos (`utils/blueprintLinhaFrigorigena.ts:95`) |
| Mudanças de direção | E | ✅ | joelho 90/45 derivado também em linha, dreno e duto (`utils/blueprintKernel/conexoes.ts:161, 299-301`) |
| Conexões | E | ✅ | `HIDRAULICAS` inclui `FRIGORIGENA`, `DRENO_AC` e `MECANICA` (`conexoes.ts:161`); o derivador VRF é a conexão (`conexoes.ts:280`); a curva do cobre não vira peça, por decisão (`conexoes.ts:97`) |
| Representação tridimensional | E | 🟡 | cilindro (`Blueprint3DViewer.tsx:1146-1200`); sem par nem isolamento na tela |
| Alteração geométrica | E | ✅ | mover ponta e vértice; subir/descer no 3D move as duas pontas (`utils/blueprintSelecao.ts:76`) |
| Integração da tubulação aos demais componentes | E | ✅ | o equipamento é ponta de trecho em cada disciplina da ficha (`conexoes.ts:229-237`) |

## 9. Dutos de climatização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento de dutos | E | 🟡 | menu Duto (`MenuComponentes.tsx:755`) e espinha automática no forro (`utils/blueprintRedeDeAr.ts:420`); falta desviar pilar no forro (o conflito acusa) e traçar a exaustão até a fachada |
| Dutos retangulares | E | ✅ | `Trecho.alturaDutoMm` (`model.ts:2772`), "Seção do duto" no painel (`PainelTrechoSelecionado.tsx:906`) |
| Representação 2D | E | ✅ | traço na largura real e rótulo "600×300" / "Ø 200" (`BlueprintCanvas.tsx:6304`); bifilar na prancha (`utils/blueprintPranchaClimatizacao.ts:39`) |
| Representação 3D | E | ✅ | caixa retangular com a largura deitada (`Blueprint3DViewer.tsx:1169-1193`, `utils/blueprintRede.ts:410`) |
| Modelagem realista dos dutos | E | 🟡 | seção retangular, material e isolamento (envelope no IFC e no conflito, `utils/blueprintKernel/conflitos.ts:101`); falta flange, o isolamento no 3D da tela e o duto flexível como peça (é só material) |
| Curvas | E | ✅ | joelho derivado no duto (`conexoes.ts:299-301`), `IfcDuctFitting` (`utils/blueprintIfc.ts:2342-2357`), bolsa retangular no 3D (`utils/blueprintIsometrico.ts:81`), K da curva na perda |
| Mudanças de direção | E | ✅ | idem, com a perda localizada (`utils/blueprintRedeDeAr.ts:233`) |
| Conexões | E | ✅ | curva, tê, cruzeta derivados na `MECANICA` (`conexoes.ts:161`) |
| Acessórios | E | 🟡 | damper, plenum, caixa, bocal como peças (`model.ts:3021`); ver §10 |
| Simbologias 3D personalizáveis em condutos retangulares | E | 🟡 | o retangular e a bolsa retangular existem no 3D (`utils/blueprintIsometrico.ts:81`); a simbologia é fixa, sem escolha |

## 10. Acessórios de climatização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Função de lançamento de acessórios integrada às redes | E | ✅ | damper e derivador VRF entram "sobre o trecho" (`utils/blueprintHidraulica.ts:697, 709`, `MenuComponentes.tsx:292`); conexões derivadas sozinhas |
| Conexões | E | ✅ | o derivador de conexões cobre as três redes (`conexoes.ts:161, 204`) |
| Derivações | E | ✅ | tê derivado; derivador VRF pelo somatório a jusante (`utils/blueprintVrf.ts:335`) |
| Reduções | E | 🟡 | redução derivada pela bitola (`conexoes.ts:293-295`); no duto, a mudança só de altura ou de redondo para retangular sai como luva, sem transição |
| Curvas | E | ✅ | joelho 90/45 (`conexoes.ts:299-300`); na linha, curva de cobre conferida, não peça (`conexoes.ts:97`) |
| Bocais | E | ✅ | `BOCAL_AR` (`utils/blueprintHidraulica.ts:705`) |
| Caixas | E | 🟡 | caixa plenum e de distribuição como peças (`utils/blueprintHidraulica.ts:701, 708`); falta a perda do plenum no cálculo (só curva e tê entram, `utils/blueprintRedeDeAr.ts:233`) |
| Adaptadores | E | ❌ | não há transição redondo↔retangular nem colarinho |
| Componentes da linha frigorígena | E | 🟡 | derivador VRF (`model.ts:3002`); falta porca flange, união, o coletor (header) do VRF e o sifão do dreno como peças |
| Acessórios de dutos | E | 🟡 | damper como peça (`utils/blueprintHidraulica.ts:709`); falta a perda do damper, colarinho, junta flexível e o duto flexível do difusor como peça |

## 11. Kits de climatização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Agrupar componentes usados em conjunto | E | ✅ | kits da organização disparam por qualquer peça tipada, evaporadora inclusive (`utils/blueprintKitsDeInsercao.ts:117`, `utils/blueprintKitsIncendio.ts:130-135`); kit da seleção (`utils/blueprintKitsDeInsercao.ts:127`) |
| Kit Split (evaporadora + condensadora + linha + isolamento + conexões + dreno + acessórios) | E | 🟡 | o conjunto sai num lote pelos planejadores Split + Linha e dreno e pelo gerador (`utils/blueprintPosicaoSplit.ts:181`, `utils/blueprintLinhaFrigorigena.ts:228`, `utils/blueprintGeradorClimatizacao.ts:102`); falta o kit de inserção levar trechos (linha/dreno) e capacidade: só terminais, sem `capacidadeBtuH` (`utils/blueprintKitsDeInsercao.ts:40`) |
| Kit no quantitativo e no orçamento | E | ✅ | composição por peça nas três redes, kit do split pela especificação (`PainelComposicoesDePeca.tsx:18`); medidas de linha, dreno, chapa e equipamentos (`utils/blueprintBudget.ts:390-411`); lista de materiais (`utils/blueprintMateriaisClimatizacao.ts:168`) |

## 12–14. Ambientes, temperatura de projeto e clima

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 12 · Delimitação do ambiente por polígono | E | ✅ | `Space` derivado das paredes (`model:798`), e é dele que a exposição e a carga partem (`utils/blueprintExposicaoTermica.ts:121`) |
| 12 · Ambientes retangulares | E | ✅ | idem |
| 12 · Ambientes irregulares | E | ✅ | idem, com furos (`model:802`); o "o que está acima/abaixo" usa um ponto interior que respeita os furos (`utils/blueprintExposicaoTermica.ts:158`) |
| 12 · Nome do ambiente | E | ✅ | `SpaceLabel.name` (`model:947`); o nome dá o uso e o padrão por uso (`utils/blueprintClimatizacaoAmbientes.ts:186`) |
| 12 · Edição dos vértices | E | 🟡 | sem mudança: o ambiente vem das paredes; edita-se a parede, não há polígono avulso de ambiente |
| 12 · Coordenadas X, Y e Z | E | 🟡 | sem mudança: XY do contorno + elevação do nível; sem Z por vértice |
| 12 · Área do ambiente | E | ✅ | `QuantidadeAmbiente` (`quant:216`); a carga usa a área de EIXO (`utils/blueprintExposicaoTermica.ts:237`), ver 19/20 |
| 12 · Propriedades específicas de climatização | E | ✅ | declarado por ambiente pelo uid da etiqueta, nas premissas do estudo (`utils/blueprintClimatizacaoAmbientes.ts:42-55`), editor em `PainelClimatizacao.tsx:162-199`; ambiente sem etiqueta precisa ser nomeado antes |
| 13 · Temperatura-meta por ambiente | E | ✅ | setpoint do estudo (`utils/blueprintClimatizacao.ts:30-35`) e por ambiente (`utils/blueprintClimatizacaoAmbientes.ts:44`, `PainelClimatizacao.tsx:183`), faixa 16–30 °C; padrão marcado CONFERIR NA NORMA (NBR 16401-2, `utils/blueprintClimatizacao.ts:46`) |
| 13 · Condições internas | E | ✅ | temperatura e UR interna (`utils/blueprintClimatizacao.ts:30-35`, `PainelClimatizacao.tsx:244`), UR usada na infiltração latente (`utils/blueprintCargaTermica.ts:324`); a UR é do estudo, não por ambiente |
| 13 · Consideração das condições externas | E | ✅ | `condicoesExternas` (`utils/blueprintClimatizacao.ts:173`) entra no motor (`utils/blueprintCargaTermica.ts:174`): ΔT nas conduções e Δw na infiltração |
| 14 · Altitude | E | ✅ | declarada > `Georreferencia.elevacaoM` > tabela (`utils/blueprintClimatizacao.ts:206-212`); vira pressão atmosférica na psicrometria (`utils/blueprintCargaTermica.ts:148, 322`) |
| 14 · Temperatura de bulbo seco | E | ✅ | TBS declarada ou da `CLIMA_POR_CIDADE` (13 capitais, `utils/blueprintClimatizacao.ts:94, 202`), cidade pelo contexto ou capital mais próxima; tabela de memória com CONFERIR NA NORMA (NBR 16401-1 Anexo A) na tela (`PainelClimatizacao.tsx:274, 299`). Fora das 13 capitais, só declarando |
| 14 · Temperatura de bulbo úmido | E | ✅ | idem (`utils/blueprintClimatizacao.ts:204`, `PainelClimatizacao.tsx:275`); TBU > TBS vira pendência |
| 14 · Parâmetros térmicos dos cálculos | E | ✅ | 11 hipóteses editáveis do motor (U típicos, FS, acréscimos solares, fração ΔT, trocas/h, fator de uso — `utils/blueprintClimatizacao.ts:255-306`, painel `PainelClimatizacao.tsx:313`) com CONFERIR NA NORMA (`:308`); λ/U pela NBR 15220 das camadas (`utils/blueprintCargaTermica.ts:164`) |

## 15–17. Janelas, orientação e proteção solar

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 15 · Largura | E | ✅ | `Opening.widthMm` (`model:571`) |
| 15 · Altura | E | ✅ | `Opening.heightMm` (`model:572`) |
| 15 · Área | E | ✅ | área de cada vão derivada na exposição (`utils/blueprintExposicaoTermica.ts:166`) e descontada da parede (`:174`) |
| 15 · Transmissão térmica | E | ✅ | `VidroDaAbertura.uWm2K` (vidro + caixilho, `model:474-478`, `Opening.vidro` `model:623`), editável em `PainelEsquadria.tsx:326`; sem declaração usa U típico 5,7 do motor, marcado hipótese (`utils/blueprintCargaTermica.ts:253, 262`) |
| 15 · Insolação | E | ✅ | ganho A × FS × Fsomb × I(orientação) por janela (`utils/blueprintCargaTermica.ts:256-264`); I é tabela de memória com CONFERIR NA NORMA (NBR 16655-3, `:50-51`), sempre marcada `*`. Não usa as horas de sol nem a sombra da vizinhança (`Insol`) |
| 15 · Orientação solar | E | ✅ | azimute da fachada (`GrafoEsp:179`) levado a cada face externa (`utils/blueprintExposicaoTermica.ts:62-77`) |
| 16 · As oito orientações (N, NE, L, SE, S, SO, O, NO) | E | ✅ | `PONTOS_CARDEAIS` e `pontoCardeal` (`GrafoEsp:46, 187`), girados pelo norte; usadas na irradiância e no peso solar da parede (`utils/blueprintCargaTermica.ts:51, 54`) |
| 17 · Sem proteção | E | ✅ | `PROTECOES_SOLARES` (`model:455-463`), fator 1 (`model:468-473`), escolha em `PainelEsquadria.tsx:295-314` |
| 17 · Película simples | E | ✅ | idem, fator 0,75 de memória — CONFERIR NA NORMA mostrado no painel (`PainelEsquadria.tsx:344`) |
| 17 · Película + cortina | E | ✅ | idem, 0,55 (CONFERIR NA NORMA) |
| 17 · Película refletiva + cortina | E | ✅ | idem, 0,40 (CONFERIR NA NORMA) |
| 17 · Fator de sombreamento | E | ✅ | `fatorDeSombreamento` (`model:484`): declarado vence a tabela; `PERSONALIZADA` exige o número (`PainelEsquadria.tsx:330-337`); entra na insolação (`utils/blueprintCargaTermica.ts:255`). O brise desenhado na parede (`model:293`) não vira fator |

## 18–20. Paredes, teto e piso

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 18 · Paredes externas | E | ✅ | `paredeEhExterna` (`exterior:25`) → face externa com orientação (`utils/blueprintExposicaoTermica.ts:62-77`) |
| 18 · Paredes internas | E | ✅ | face interna com o vizinho e o uid da etiqueta dele (`utils/blueprintExposicaoTermica.ts:185-193`) |
| 18 · Orientação | E | ✅ | fachada com azimute e 8 pontos (`GrafoEsp:179-187`); pesa o acréscimo solar da parede (`utils/blueprintCargaTermica.ts:219-223`) |
| 18 · Temperatura adjacente | E | 🟡 | só "climatizado → ΔT 0; não climatizado ou sem etiqueta → fração do ΔT" (hipótese 0,5 editável, `utils/blueprintCargaTermica.ts:203-208`); falta declarar a temperatura real do vizinho |
| 18 · Resistência térmica | E | ✅ | U e R da parede no painel (`PainelCamadasParede.tsx:439-450`, achado 4) e no motor pelas camadas com λ (`utils/blueprintCargaTermica.ts:164-171, 212`); sem λ cai no U típico, marcado hipótese |
| 18 · Área | E | ✅ | área líquida da face = comprimento × altura − vãos (`utils/blueprintExposicaoTermica.ts:174`) |
| 18 · Diferença de temperatura | E | ✅ | ΔTeq = (TBS − setpoint) + acréscimo solar por orientação na externa; fração na interna (`utils/blueprintCargaTermica.ts:219-233`); acréscimo é hipótese CONFERIR NA NORMA |
| 18 · Ganho térmico | E | ✅ | U × A × ΔTeq por face, com memória (`utils/blueprintCargaTermica.ts:234-235`), na tabela de parcelas (`PainelCargaTermica.tsx:46`) |
| 19 · Laje interna | E | ✅ | teto `AMBIENTE` acima, com a laje e as camadas dela (`utils/blueprintExposicaoTermica.ts:197-207`; `utils/blueprintCargaTermica.ts:280-287`) |
| 19 · Laje externa | E | ✅ | teto `COBERTURA` / `LAJE_EXPOSTA` / `EXTERIOR` (`utils/blueprintExposicaoTermica.ts:208-218`), U × A × (ΔT + acréscimo solar) (`utils/blueprintCargaTermica.ts:272-279`) |
| 19 · Laje externa com isolamento | E | ✅ | camadas em `Structural` LAJE (`model:1133`) e em `Agua` (`model:1301`), editadas em `CamadasDaPeca.tsx:58-61` (U/R NBR 15220, fluxo descendente) e lidas no U do teto |
| 19 · Temperatura do ambiente adjacente | E | 🟡 | ambiente acima: climatizado → 0, não climatizado → fração do ΔT (`utils/blueprintCargaTermica.ts:282`); sem temperatura declarada do vizinho |
| 19 · Área | E | 🟡 | a carga usa a área de EIXO (`utils/blueprintExposicaoTermica.ts:237`, ~8 % acima da útil — conservadora, decidido em 10/10, D3); a densidade W/m² já reporta pela útil (`areaUtilM2`); falta: área útil também nas parcelas, se a norma pedir |
| 19 · Resistência térmica | E | ✅ | U das camadas da laje/cobertura com Rsi 0,17 / Rse 0,04 (`utils/blueprintCargaTermica.ts:273, 277, 285`); sem camadas = U típico e pendência dita |
| 19 · Diferença de temperatura | E | ✅ | ΔT + acréscimo solar da cobertura (hipótese CONFERIR) ou fração do ΔT (`utils/blueprintCargaTermica.ts:274-286`) |
| 20 · Área | E | 🟡 | idem 19: área de EIXO (`utils/blueprintExposicaoTermica.ts:237`) |
| 20 · Temperatura do ambiente adjacente | E | 🟡 | piso `SOLO` / `EXTERIOR` (pilotis) / `AMBIENTE` abaixo (`utils/blueprintExposicaoTermica.ts:220-232`); vizinho só como climatizado ou fração do ΔT, sem temperatura declarada |
| 20 · Resistência térmica | E | ✅ | U das camadas da laje sob o ambiente (`utils/blueprintCargaTermica.ts:295, 301`); o piso sobre o solo não é calculado (ganho desprezado, dito) |
| 20 · Diferença de temperatura | E | ✅ | ΔT cheio no pilotis, fração sobre não climatizado, zero no solo (hipótese dita) (`utils/blueprintCargaTermica.ts:291-304`) |
| 20 · Calor sensível | E | ✅ | parcela `piso` em W com memória (`utils/blueprintCargaTermica.ts:291-304`) na tabela de parcelas |

## 21–25. Cargas internas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 21 · Quantidade de pessoas | E | ✅ | declarada por ambiente ou padrão do uso (`utils/blueprintClimatizacaoAmbientes.ts:46, 89-103`; `PainelClimatizacao.tsx:184`); padrão com CONFERIR NA NORMA (NBR 16401-1, `:105`) |
| 21 · Tipo de atividade | E | ✅ | `atividade` por ambiente (`utils/blueprintClimatizacaoAmbientes.ts:47`; `PainelClimatizacao.tsx:187`) |
| 21 · Calor sensível por pessoa | E | ✅ | `CALOR_POR_ATIVIDADE` (`utils/blueprintCargaTermica.ts:42-48`), parcela em `:308`; tabela de memória, CONFERIR NA NORMA no banner (`PainelCargaTermica.tsx:103-105`) |
| 21 · Calor latente por pessoa | E | ✅ | idem, coluna latente |
| 21 · Categorias de atividade (leve/sentado … maior movimento) | E | ✅ | 5 categorias, de sentado em repouso a atividade pesada (`utils/blueprintClimatizacaoAmbientes.ts:31-39`) |
| 22 · Iluminação | E | ✅ | W/m² por ambiente, declarado ou do uso (`utils/blueprintClimatizacaoAmbientes.ts:49, 207`; `PainelClimatizacao.tsx:196`), parcela em `utils/blueprintCargaTermica.ts:309` |
| 22 · Potência instalada | E | 🟡 | sai de W/m² × área de eixo (`utils/blueprintClimatizacaoAmbientes.ts:207`); não soma a `potenciaW` das luminárias desenhadas, nem há campo de W total |
| 22 · Contribuição para a carga sensível | E | ✅ | W × fator de uso (hipótese editável) na sensível (`utils/blueprintCargaTermica.ts:309, 333`) |
| 23 · Equipamentos | E | ✅ | W por ambiente, declarado ou do uso (`utils/blueprintClimatizacaoAmbientes.ts:51`; `PainelClimatizacao.tsx:197`), parcela `utils/blueprintCargaTermica.ts:310`; um número só, não lido dos pontos de uso específico |
| 23 · Aparelhos | E | ✅ | idem: o mesmo campo "equipamentos e aparelhos, W" (`utils/blueprintClimatizacaoAmbientes.ts:50-51`) |
| 23 · Cargas internas diversas | E | ✅ | fonte extra sensível/latente por ambiente (`utils/blueprintClimatizacaoAmbientes.ts:53-54`; `PainelClimatizacao.tsx:198-199`), parcela `utils/blueprintCargaTermica.ts:311` |
| 24 · Fontes de calor das aberturas | E | 🟡 | janela (condução + insolação) e porta (condução) nas faces EXTERNAS (`utils/blueprintCargaTermica.ts:238-267`); falta o vão em parede interna para ambiente não climatizado (a área sai da parede e não volta, `:240-241`) e a infiltração por fresta de porta/janela (hoje é por trocas/h do volume, `:313-329`) |
| 25 · Calor sensível informado | E | ✅ | `fonteSensivelW` (`utils/blueprintClimatizacaoAmbientes.ts:53`; `PainelClimatizacao.tsx:198`) |
| 25 · Calor latente informado | E | ✅ | `fonteLatenteW` (`utils/blueprintClimatizacaoAmbientes.ts:54`; `PainelClimatizacao.tsx:199`) |
| 25 · Calor total informado | E | 🟡 | não há campo de total: o total da fonte é sensível + latente (`utils/blueprintCargaTermica.ts:311`); uma fonte só por ambiente |

## 26–30. Resultado e norma

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 26 · Carga sensível em W | E | ✅ | `sensivelW` por ambiente e por pavimento (`utils/blueprintCargaTermica.ts:333, 369`), tabela em `PainelCargaTermica.tsx:118-139`; parcelas com hipótese marcadas `*` e banner CONFERIR NA NORMA (`:103-105`) |
| 26 · Carga sensível em BTU/h | E | ✅ | conversão `W_PARA_BTUH` (`utils/blueprintCargaTermica.ts:39`); o painel dá BTU/h no total do ambiente (`PainelCargaTermica.tsx:76, 139`), a sensível isolada só em W |
| 27 · Carga latente | E | ✅ | pessoas + infiltração por psicrometria (Magnus, pressão pela altitude, TBU → w, UR → w) + fonte latente (`utils/blueprintCargaTermica.ts:144-160, 308, 321-326, 334`) |
| 28 · Carga total = sensível + latente | E | ✅ | `totalW = sensivelW + latenteW` (`utils/blueprintCargaTermica.ts:335`), linha "Total" das parcelas (`PainelCargaTermica.tsx:73-76`) |
| 28 · Resultado por ambiente em BTU/h | E | ✅ | `totalBtuH` por ambiente (`utils/blueprintCargaTermica.ts:361`), coluna BTU/h (`PainelCargaTermica.tsx:122, 139`), mapa de calor na planta (`utils/blueprintCargaTermica.ts:398`); o W/m² é pela ÁREA ÚTIL desde 10/10 (D3: `areaUtilM2` em `utils/blueprintCargaTermica.ts`) |
| 29 · Atualização vinculada ao modelo | E | ✅ | derivação pura recalculada a cada mudança do modelo (`useMemo` em `BlueprintEditor.tsx:3198-3199`); o declarado fica preso ao uid da etiqueta e sobrevive à rederivação |
| 30 · Critérios da NBR 16655-3 | E | 🟡 | método simplificado de pico de verão (`utils/blueprintCargaTermica.ts:11-29`) com tabelas transcritas de memória; PDF ausente — CONFERIR NA NORMA no painel e no memorial; a aderência à NBR 16655-3 não foi conferida |

## 31–37. Biblioteca e cadastro

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 31 · Cadastro nativo: Split | E | ✅ | 8 splits hi-wall de 9.000 a 60.000 BTU/h semeáveis no catálogo da organização (`utils/blueprintCatalogoDeTipos.ts:69-85`) + ficha da condensadora split (`utils/blueprintHidraulica.ts:695`); a potência de placa é hipótese (CONFERIR com o fabricante), sem catálogo real |
| 31 · Cadastro nativo: VRF | E | 🟡 | ficha da condensadora VRF e do derivador (`utils/blueprintHidraulica.ts:696-697`) e tabela de derivadores/diâmetros (`utils/blueprintVrf.ts:50, 62`, hipótese CONFERIR); falta modelo VRF com capacidade no catálogo |
| 31 · Cadastro nativo: evaporadoras | E | ✅ | hi-wall, piso-teto, cassete e dutada com medidas e cota (`utils/blueprintHidraulica.ts:691-694`); capacidades semeadas só na hi-wall |
| 31 · Cadastro nativo: condensadoras | E | ✅ | split e VRF com medidas (`utils/blueprintHidraulica.ts:695-696`) |
| 31 · Cadastro nativo: exaustores | E | ✅ | `EXAUSTOR_AR` com medidas, vazão declarável (`utils/blueprintHidraulica.ts:698`; `model:3397`) |
| 31 · Cadastro nativo: bocais | E | ✅ | `BOCAL_AR` (`utils/blueprintHidraulica.ts:705`) |
| 31 · Cadastro nativo: caixas de distribuição | E | ✅ | `CAIXA_DISTRIBUICAO_AR` (`utils/blueprintHidraulica.ts:701`) |
| 31 · Cadastro nativo: bombas de drenagem | E | ✅ | `BOMBA_DRENO` (`utils/blueprintHidraulica.ts:699`) |
| 31 · Cadastro nativo: tubulações | E | ✅ | cobre na `FRIGORIGENA`, PVC/CPVC no `DRENO_AC` (`model:2651-2652`), com líquido/sucção e isolamento no trecho |
| 31 · Cadastro nativo: dutos | E | ✅ | chapa galvanizada, painel pré-isolado e flexível em `MATERIAIS_DA_DISCIPLINA.MECANICA` (`model:2654`), redondo e retangular |
| 31 · Cadastro nativo: kits de linhas frigorígenas | E | 🟡 | não há kit nativo como peça; o cobre (par), o isolamento e o cabo saem da linha desenhada na lista de materiais (`utils/blueprintMateriaisClimatizacao.ts`), e a composição do kit é montada pela organização (`PainelComposicoesDePeca.tsx:18`) |
| 32 · Criação de novas peças | E | ✅ | "salvar tipo" leva a capacidade (`utils/blueprintTipos.ts:67, 144`) para `blueprint_element_types`; `EQUIPAMENTO_CLIMATIZACAO` personalizado (`utils/blueprintHidraulica.ts:710`); a vazão não entra no tipo salvo |
| 33 · Edição de peças existentes | E | 🟡 | a tela do catálogo só renomeia, desativa e exclui (`TelaCatalogoDeTipos.tsx:129-130`); mudar propriedade = aplicar, editar a peça e salvar outro tipo; as fichas nativas ficam no código |
| 34 · Informações técnicas | E | ✅ | capacidade, vazão e sistema no `Terminal` (`model:3391-3404`), medidas, potência e parâmetros personalizados (`model:3188`) |
| 35 · Itens associados (composição) | E | ✅ | a tela de composições lista `FRIGORIGENA`, `DRENO_AC` e `MECANICA` (`PainelComposicoesDePeca.tsx:18`), com o kit do split pela especificação ("12.000 BTU/h") |
| 36 · Simbologia 2D | E | 🟡 | 20 símbolos de fonte única (`utils/blueprintSimbolosClimatizacao.ts:57, 130`), canvas e prancha; fixos no código, sem cadastro nem personalização pela organização |
| 37 · Objeto 3D | E | ❌ | o 3D segue procedural (caixa com as medidas da ficha/tipo, `Blueprint3DViewer.tsx:1398`); não há geometria 3D cadastrável por peça |

## 38–45. Documentação

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 38 · Plantas de climatização | E | ✅ | prancha por pavimento com linha, dreno e duto (`blueprintPranchaClimatizacao.ts:55`, `:67`); `TipoDePrancha` com `CLIMATIZACAO` (`blueprintPranchas.ts:163`) e entrada no conjunto (`blueprintPranchas.ts:297-306`); a cadeia de cotas passa além da condensadora na fachada (C12, 10/10: `pecasForaDoLado`, na tela, no PDF e no DXF) |
| 39 · Detalhes técnicos | E | 🟡 | 4 detalhes típicos (evaporadora, condensadora, dreno com sifão, difusor com plenum), saem só do que existe no desenho (`blueprintDetalhesClimatizacao.ts:73`, `:91`). Falta: são genéricos e sem escala, com medidas "CONFERIR com o fabricante" (`:103`); não há detalhe de VRF/derivador, exaustor, suporte de linha ou duto, nem passagem em parede ou laje |
| 40 · Detalhes isométricos | E | ✅ | isométrico da rede inteira (linha, dreno e dutos, todos os pavimentos) (`blueprintDetalhesClimatizacao.ts:26`; `RedeDaPrancha` + `CLIMATIZACAO` em `blueprintIsometricoPrancha.ts:51`). os rótulos de peças próximas desviam uns dos outros, com linha de chamada (C13, 10/10: `lugarDoRotulo`) |
| 41 · Cortes | E | 🟡 | trechos de climatização entram no corte e o duto retangular é cortado na meia-altura (`blueprintCorte.ts:327`, `:507`). Falta: evaporadora, condensadora e terminais de ar não aparecem no corte, que só traz as peças de incêndio (`blueprintCorte.ts:535`); a linha é cortada como um tubo só, sem o par e sem o isolamento |
| 42 · Representações realistas | E | ❌ | o 3D desenha as peças como caixas nas medidas declaradas (`Blueprint3DViewer.tsx:1214-1221`) e o duto retangular com bolsas. Falta a geometria realista do equipamento |
| 43 · Indicações gráficas | E | ✅ | rótulos por disciplina: Ø líquido/sucção, DN, L×A (`blueprintPranchaClimatizacao.ts:39`); número EV-1/CD-2 e tag BTU/h ou m³/h (`:46-50`); as etiquetas desviam umas das outras (`posicaoLivre`, `:168`) |
| 44 · Legendas | E | ✅ | quadro-resumo por pavimento e legenda com os traços das três redes e os símbolos que existem, com a quantidade (`blueprintPranchaClimatizacao.ts:186`, `:235`) |
| 45 · Personalização das legendas | E | ❌ | a legenda é gerada só do que existe no desenho (`blueprintPranchaClimatizacao.ts:186`). Não há como editar texto, ordem, símbolo nem itens |

## 46–51. Quantitativos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 46 · Quantitativo automático (lista de materiais) | E | ✅ | `materiaisDeClimatizacao` (`blueprintMateriaisClimatizacao.ts:168`): cobre, isolamento, chapa, cabo, gás e suportes. Sai na folha `MATERIAIS_CLIMATIZACAO` (`blueprintPranchas.ts:309`), na aba XLSX (`blueprintMateriaisClimatizacao.ts:358`) e nas medidas do orçamento (`blueprintBudget.ts:390-411`) |
| 47 · Quantitativo do projeto completo | E | ✅ | totais da lista (`blueprintMateriaisClimatizacao.ts:168`) e grupo "de climatização" no orçamento (`blueprintBudget.ts:1679-1681`) |
| 48 · Quantitativo por pavimento | E | ✅ | a lista de materiais tem o recorte por pavimento (`blueprintMateriaisClimatizacao.ts:67`, `:332-348`). e a tela de quantitativos por pavimento tem a coluna Climatização — linha, dreno, duto, equipamentos e terminais de ar (C16, 10/10: `blueprintQuantitativosPorPavimento.ts`) |
| 49 · Quantitativo por detalhe | E | ❌ | a lista sai em total, por sistema e por pavimento (`blueprintMateriaisClimatizacao.ts:65-68`). Não há quantitativo por detalhe |
| 50 · Separação por componente/rede | E | ✅ | grupos de material (`blueprintMateriaisClimatizacao.ts:36`) e separação por sistema split/VRF, pela condensadora (`:259-296`) |
| 51 · Quantificação baseada no modelo | E | ✅ | `materiaisDeClimatizacao` lê o `computeQuantities` do modelo único (`blueprintMateriaisClimatizacao.ts:168`) |

## 52–59. BIM e interoperabilidade

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 52 · Modelagem BIM de climatização | E | 🟡 | disciplinas `FRIGORIGENA`/`DRENO_AC`/`MECANICA` no modelo (`model.ts:2563`), equipamento como peça da rede, 3D e IFC com Pset. Falta: prumada da linha e do VRF entre pavimentos (`blueprintLinhaFrigorigena.ts:94`, `blueprintVrf.ts:83`); rede de exaustão traçada até a fachada; a linha aparece como um tubo só na planta e no 3D |
| 53 · Importação IFC | E | 🟡 | a climatização é importada (`ifcParametricoService.ts:1028`, `ifcParaKernel.ts:1111`, `PainelImportarIfc.tsx:246`) com religação do sistema (`ifcParaKernel.ts:1243`). Falta: um `IfcUnitaryEquipment .SPLITSYSTEM.` de outro programa é recusado, porque evaporadora e condensadora só se distinguem pelo nosso ObjectType (`ifcParaKernel.ts:1055`); a importação só foi provada com IFC da própria Planta |
| 54 · Exportação IFC | E | ✅ | `IfcDuctFitting` (`blueprintIfc.ts:2357`), `IfcAirTerminal` (`:2647-2655`), `IfcUnitaryEquipment` (`:2632`), par da linha (`:2273`), sistemas `.AIRCONDITIONING.`/`.REFRIGERATION.` (`:2168-2170`) e `Pset_OpuraClimatizacao` (`:1424`, `:1433`). a rede só de exaustão em `.VENTILATION.` (C14, 10/10: `idsDaRedeDeExaustao`) e o isolamento como `IfcCovering .WRAPPING.` ligado ao tubo (C15, 10/10) |
| 55 · OpenBIM | E | ✅ | IFC4 e IFC4X3 (`blueprintIfc.ts:574`); BCF com a classe `EQUIPAMENTO` (`blueprintBcf.ts:260`) |
| 56 · Modelos BIM externos como referência | E | 🟡 | IFC da biblioteca como referência no 3D, com olho, opacidade, deslocamento e giro (`blueprintReferenciaExterna.ts:101`, `Blueprint3DViewer.tsx:2321`); a lista fica no estudo, na tabela `blueprint_study_referencias` (`blueprintReferenciasService.ts:21`). Falta: não aparece na planta 2D, só no 3D; a prova no app real com um arquivo real está pendente |
| 57 · Importação de arquitetura/estrutura | E | ✅ | IFC: peças, paredes e vãos (`ifcParaKernel.ts:235`, `:483`, `:624`). DXF: paredes e aberturas (`dxfParaKernel.ts:111`, `:438`) |
| 58 · Importação RVT/RTE | E | ❌ | recusada com a orientação de exportar (`blueprintUnderlay.ts:432`); está no backlog (serviço externo). O caminho é o IFC do Revit |
| 59 · DWG/DXF como referência | E | 🟡 | o DXF/DWG (o DWG é convertido no servidor, `PainelImportarDxf.tsx:113`) vira fundo; o canvas traça o vetor quando o plano bate com o PNG (`dxfParaFundo.ts:219`, `BlueprintEditor.tsx:3032`). Falta: só entram linhas e arcos (sem textos, cotas nem hachuras); acima de 80 mil traços volta o PNG; o seletor de "Planta de fundo" ainda recusa .dwg/.dxf (`blueprintUnderlay.ts:437`) |

## 60–62. Compatibilização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 60 · Junto com estrutura | E | ✅ | trecho × estrutura com o envelope (`conflitos.ts:324-350`); camadas |
| 60 · Junto com arquitetura | E | ✅ | trecho × vão e × parede estrutural (`conflitos.ts:352-382`); camadas em meio-tom |
| 60 · Junto com elétrica | E | ✅ | rede × rede entre disciplinas (`conflitos.ts:403-433`) |
| 60 · Junto com hidráulica | E | ✅ | idem (`conflitos.ts:403-433`) |
| 60 · Junto com sanitária | E | ✅ | idem (`conflitos.ts:403-433`) |
| 60 · Junto com incêndio | E | ✅ | idem (`conflitos.ts:403-433`) |
| 60 · Junto com gás | E | ❌ | não há disciplina de gás (`DisciplinaDeRede`, `model.ts:2563`); está no backlog |
| 60 · Junto com SPDA | E | ❌ | não há SPDA; está no backlog |
| 60 · Junto com cabeamento | E | ❌ | não há cabeamento estruturado; está no backlog |
| 61 · Compatibilização visual 3D | E | ✅ | "Destacar no 3D" pinta de vermelho as peças dos conflitos abertos (`BlueprintEditor.tsx:4295-4302`); camadas em meio-tom (`Blueprint3DViewer.tsx:129`) |
| 62 · Duto × viga | E | ✅ | o duto retangular conta meia altura na vertical e meia largura em planta (`conflitos.ts:101-108`, `:325-350`); a marca aparece no desenho |
| 62 · Tubulação × estrutura | E | ✅ | linha (os dois tubos com o isolamento) e dreno contra a estrutura pelo envelope (`conflitos.ts:101-108`, `:328-350`) |
| 62 · Evaporadora × elemento arquitetônico | E | 🟡 | a peça real (terminal, desde a E3) só é conferida pelo centro dentro de pilar/viga (`conflitosArquitetonicos.ts:245-276`) e pelo trecho que atravessa a caixa dela (`conflitos.ts:384-401`); `RESERVA_X_PAREDE/COMPONENTE` só vale para a reserva antiga, que é componente (`conflitosArquitetonicos.ts:369`). Falta: caixa da evaporadora × parede, janela e porta (só a sugestão de posição evita vãos, `blueprintPosicaoSplit.ts:105`) |
| 62 · Condensadora × arquitetura | E | 🟡 | a mesma limitação da evaporadora (`conflitosArquitetonicos.ts:245-276`, `:369`). Falta: caixa da condensadora × parede e estrutura e a folga de manutenção e de ar contra outras peças |
| 62 · Redes de climatização × outras instalações | E | ✅ | rede × rede pelo envelope, medindo a partir de onde os trechos se separam quando nascem no mesmo nó (`conflitos.ts:403-433`); trecho × caixa do equipamento de climatização (`conflitos.ts:384-401`, `BlueprintEditor.tsx:4029`). O duto retangular conta pelo maior meio-lado: é conservador e pode acusar a mais |

## 63–75. Recursos gerais

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| 63 · Croqui 2D | E | ✅ | canvas da Planta (`Canvas:1603`) |
| 64 · Vista 3D | E | ✅ | `3D:2111` |
| 65 · Croqui + 3D simultaneamente | E | ✅ | botão "Planta + 3D lado a lado", persistido (`Ed:1724`, `Ed:10078`); a MESMA cena e seleção ao lado do canvas (`Ed:14633`); desliga na elevação |
| 66 · Caixa de corte 3D | E | ✅ | seis planos por eixo, corte local por material (`3D:1997-2012`, `3D:2293`; `blueprint3dSelecao.ts:85`); recorta também a referência IFC |
| 67 · Movimentação diretamente no 3D | E | ✅ | alça `PivotControls` X/Z + seta Y (`3D:2328-2351`) → `comandoDeMover`/`comandosDeElevar` (`Ed:10342`, `Ed:10348`; `blueprintSelecao.ts:35,76`), um Ctrl+Z. Sem girar no 3D; parede/estrutura sem cota própria não sobem |
| 68 · Seleção múltipla 3D | E | ✅ | Shift/Ctrl/⌘ somam e o 2º clique tira (`3D:933-934`; `blueprint3dSelecao.ts:46`), mesma seleção do 2D |
| 69 · Visibilidade independente dos modelos IFC | E | ✅ | cada referência IFC com olho e opacidade próprios (`blueprintReferenciaExterna.ts:31,40`; `Ed:1762-1766`; `3D:2321`), lista gravada no estudo (`hooks/useBlueprintReferencias.ts:42`; `services/blueprintReferenciasService.ts:21`). RVT/RTE direto segue no backlog |
| 70 · Planos de corte | E | 🟡 | corte 2D (`Corte:86`) e caixa de corte no 3D (`blueprint3dSelecao.ts:85`) ✅; falta lançar/editar no plano de corte (XZ/YZ) e no isométrico — backlog |
| 71 · Captura de pontos/referências | E | ✅ | OSNAP (`Encaixe:47-60`) |
| 72 · Indicação de problemas durante o lançamento | E | 🟡 | marcas no desenho já cobrem a climatização: declividade do dreno (`Verif:146-150`), linha/dreno/duto × pilar e viga (`Verif:177-188`), ponta aberta (`Verif:102`), desenhadas pelo canvas (`Canvas:2073-2075`). Falta: as FALTAs de dimensionamento (subdimensionado, linha acima do limite, limites do VRF, velocidade/pressão do duto, exaustão) só aparecem nas gavetas, sem marca no desenho |
| 73 · Blocos inteligentes | E | ✅ | equipamento é peça da rede com capacidade, potência, medidas, sistema e kit (`blueprintPosicaoSplit.ts:231-277`); componente com ficha que lança o ponto elétrico (`PtsHidro:376`); kit do split na composição (`PainelComposicoesDePeca.tsx:17`) |
| 74 · Replicação/edição de elementos | E | ✅ | `DuplicateEntities` copia componentes e religa a evaporadora à cópia da condensadora (`commands:5427`, `commands:5571-5573`); Ctrl+D com telhado, instalações e componentes (`blueprintSelecao.ts:222-246`); matriz, alinhar e distribuir (`blueprintSelecao.ts:377,534,602`); `DuplicateLevel` leva componentes (`commands:5370-5386`) |
| 75 · Pavimentos e níveis | E | ✅ | `Level` (`model:45`) |

## 76. O ciclo fechado — o que o AltoQi não faz

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Selecionar automaticamente o aparelho por catálogo | A | 🟡 | `selecionarModelo` sobre o catálogo da organização (`blueprintSelecaoClimatizacao.ts:47,86`). Falta catálogo real de fabricante: as capacidades são sementes de hipótese (`blueprintCatalogoDeTipos.ts:52,73-80`) |
| Verificar se o equipamento atende à carga calculada | A | ✅ | `avaliarCapacidade` → atende / subdimensionado / superdimensionado, declarado vence e é conferido (`blueprintSelecaoClimatizacao.ts:110,198`) |
| Pré-dimensionamento Split | A | 🟡 | capacidade pela carga + folga, diâmetros, isolamento, comprimento/desnível e carga de gás (`blueprintLinhaFrigorigena.ts:56-75`, `:445`). Falta: faixas de fabricante transcritas de memória (HIPÓTESE, `:63`), sem catálogo real |
| Pré-dimensionamento VRF (taxa de combinação, derivadores) | A | 🟡 | taxa de combinação, derivador pelo somatório a jusante, diâmetro por trecho e limites (`blueprintVrf.ts:62,165,431`). Falta: limites e derivadores de memória (HIPÓTESE, `:70`), comprimento equivalente das conexões, prumada entre pavimentos (só AVISO, `:83`) |
| Otimizar a localização dos equipamentos | A | 🟡 | posição automática: evaporadora em parede livre sem porta e fora dos vãos, condensadora na fachada ou em ambiente técnico pelo nome (`blueprintPosicaoSplit.ts:109,158-178,181`). Falta: é regra de prioridade, não minimiza a linha; só no mesmo pavimento (condensadora na cobertura fora) |
| Gerar automaticamente a rede frigorígena | A | 🟡 | split pela parede com Steiner + desvio de pilar (`blueprintLinhaFrigorigena.ts:172-181,228`); árvore VRF (`blueprintVrf.ts:304-314,335`). Falta: prumada entre pavimentos (split e VRF); na planta/3D da tela a linha é um tubo só (o par existe no IFC) |
| Drenos: traçado, declividade, bomba | A | ✅ | dreno até ponto existente ou novo na fachada, por gravidade, com bomba quando falta queda (`blueprintLinhaFrigorigena.ts:136,318-327`); declividade conferida e marcada (`:489`; `Verif:146-150`). Pendente menor: DN fixo de 25 mm (hipótese), sifão só no detalhe típico |
| Dimensionamento automático de dutos | A | ✅ | seção por velocidade/igual atrito para a vazão a jusante (`blueprintRedeDeAr.ts:110`), "Ajustar seções" em um lote (`:321`), traçado em espinha no forro (`:420`) |
| Cálculo de vazão | A | ✅ | vazão por terminal: declarada ou derivada do calor sensível, nunca abaixo da renovação (`blueprintRedeDeAr.ts:140,159`) |
| Perda de carga | A | 🟡 | duto: Darcy + Swamee-Jain no diâmetro hidráulico (`blueprintRedeDeAr.ts:73-80`), curva e tê por coeficiente (`:290-301`), caminho crítico × pressão disponível (`:313`). Falta: perda em damper e plenum; comprimento equivalente das conexões do VRF |
| Balanceamento aeráulico | A | ✅ | excesso que o damper de cada terminal absorve para igualar o caminho crítico (`blueprintRedeDeAr.ts:304-305`) |
| Renovação de ar (NBR 16401-3) | A | 🟡 | L/s por pessoa + por m² (`blueprintRedeDeAr.ts:137`), aviso de climatizado sem janela nem tomada de ar (`:352-368`). Falta: coeficientes transcritos de memória — CONFERIR NA NORMA (`blueprintClimatizacao.ts:471,520`) |
| Exaustão (banheiro sem janela, cozinha) | A | 🟡 | exigência e vazão por uso; sem janela e sem exaustor = FALTA (`blueprintRedeDeAr.ts:143-149,352-368,374-375`). Falta: rede de exaustão até a fachada não é traçada; valores de hipótese (código de obras) |
| Otimização de rotas | A | 🟡 | linha e VRF por Steiner pelas paredes com desvio de pilar (`blueprintRotaPelasParedes.ts:70`; `blueprintObstaculosEstruturais.ts:93`); duto sob a viga mais baixa (`blueprintRedeDeAr.ts:36,413`). Falta: o duto em espinha não desvia pilar no forro (o conflito só acusa) |
| Ponto elétrico e circuito do aparelho | A | 🟡 | pelo planejador do split o ponto nasce com a potência do modelo/EER (`blueprintPosicaoSplit.ts:231,272-277`; `blueprintSelecaoClimatizacao.ts:73`) e o gerador liga o circuito (`blueprintGeradorClimatizacao.ts:210-239`). Falta: a evaporadora inserida à mão (componente) ainda nasce com 1400 VA típicos (`PtsHidro:390`; `Potencia:58`); o gerador não liga o circuito quando há outros pontos soltos ou mais de um quadro |
| Orçamento do sistema (lançamento por peça, composição) | A | ✅ | `FRIGORIGENA`, `DRENO_AC` e `MECANICA` em `REDES_HIDROSSANITARIAS`, grupo "de climatização" (`Budget:1679-1681`), peça e tubo/duto lançados (`Budget:1795`, `Budget:1857-1868`), medidas novas (`Budget:390-411`); kit do split na composição (`PainelComposicoesDePeca.tsx:17`) |
| Geração automática do projeto inteiro | A | 🟡 | `gerarClimatizacao`: carga → equipamento → linha/dreno → VRF → dutos → circuito → conflitos → medidas, um lote, relatório (`blueprintGeradorClimatizacao.ts:102,272,286`). Falta: não lança o orçamento (por decisão — mostra medidas e manda ao painel Orçamento), peças nascem sugeridas, sem prumada entre pavimentos, circuito só quando inequívoco, pranchas emitidas à parte |
| Simulação CFD | N | ❌ | fora do escopo (N, não replicar) |
| Análise energética anual | N | ❌ | fora do escopo (N, não replicar) |

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

### Hoje — 10/10/2026, depois da execução (contagem por script sobre as tabelas regraduadas)

| Grau | ✅ | 🟡 | ❌ | Total |
|---|---|---|---|---|
| **E** | 162 | 56 | 10 | 228 |
| **A** | 6 | 11 | 0 | 17 |
| **M** | 0 | 0 | 0 | 0 |
| **B** | 0 | 0 | 0 | 0 |
| **N** | 0 | 0 | 2 | 2 |
| **Total** | 168 | 67 | 12 | 247 |

**Dos 228 Essenciais, 162 estão prontos (71 %; eram 51, 22 %), e só 10 não existem.** Os 10 ❌:

- quatro de backlog: RVT direto, gás, SPDA e cabeamento;
- o ajuste do raio das curvas;
- os adaptadores redondo↔retangular;
- o objeto 3D cadastrável e a representação realista do equipamento;
- a legenda personalizável;
- o quantitativo por detalhe.

Dos 60 🟡, a maior parte é a mesma família:
- tabela de norma de memória (CONFERIR NA NORMA);
- dado de fabricante semeado;
- as pendências C do plano.

Os 17 "vai além" saíram de 0 para 6 ✅ e 11 🟡 (o 🟡 é quase todo hipótese de fabricante e as prumadas).

### A foto de 04/10/2026 (o ponto de partida)

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
- Migration `aplicar_20271004000040_blueprint_study_climatizacao.sql` (nasceu `…000030` e foi renomeada no fecho da E0 — ver abaixo) — uma linha por estudo,
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
insolação/vizinhos legados continuam verdes). `check-ui-standard` limpo nos dois `.tsx`. Commit
`7d371713`.

### Etapa 0.3 — 04/10/2026 (frente `clima-e0`, sem bump; sem migration — o JSONB cresce)

**O que entrou:**
- `utils/blueprintClimatizacaoAmbientes.ts` — o declarado POR AMBIENTE, pelo **`uid` da etiqueta**
  (achado 6; o `id` do `Space` muda a cada rederivação): climatizado, setpoint próprio, pessoas,
  atividade (5 níveis), iluminação W/m², equipamentos W, fonte extra sensível/latente — tudo `null`
  = derivar. `PADRAO_POR_USO` para os 13 usos de `blueprintPrograma` (**hipótese residencial,
  CONFERIR NA NORMA: NBR 16401-1 e NBR 16655-3**), `premissasDoAmbiente` com a ORIGEM de cada valor
  (DECLARADA / USO / ESTUDO / SEM) e `conferir`. `HipotesesClimatizacao.ambientes` no leitor
  (chave vazia e declaração sem nada caem).
- **Achado 3 fechado por nome:** `peDireitoLivreMm` (do piso acabado à face do forro =
  `peDireitoUtilMm` dos acabamentos) é a definição ÚNICA do volume de ar da carga térmica; a conta
  do quantitativo/planta de forro (só o rebaixo) mede outra coisa e fica, agora distinguida no
  cabeçalho do módulo. O volume aparece na tabela por ambiente.
- **Achado 4 fechado:** `PainelCamadasParede` mostra **U e R** da parede (Rsi 0,13 / Rse 0,04,
  NBR 15220) logo abaixo da espessura total; camada sem λ = "U não calculado", dizendo quantas
  faltam; sem biblioteca de materiais a linha não aparece.
- `PainelClimatizacao` — seção **Por ambiente — <pavimento>**: a tabela compacta da família do
  painel de acabamentos (Ambiente · Uso · Climatizado · Pessoas · Setpoint · Volume), `*` marca o
  que veio do padrão do uso, "Editar" abre o editor com cada campo anulável (placeholder = valor em
  uso, `title` = origem) e a linha "Em uso: …"; ambiente sem etiqueta diz "sem etiqueta — nomeie o
  ambiente para declarar". O editor monta a lista a partir de `ambientesParaAcabamento` + o uid da
  etiqueta.

**Decisões.** (1) Nada de `parametros` na etiqueta: o dado é do ESTUDO (premissa de projeto), não
do desenho, e não entra no hash. (2) Ambiente sem etiqueta não ganha etiqueta automática ao
declarar: declarar clima não é nomear o cômodo — a tela pede o nome. (3) Padrão por uso em vez de
pedir tudo: a carga térmica da E2 roda com zero declaração, marcada CONFERIR, e melhora à medida
que o projetista declara.

**Prova.** `blueprintClimatizacaoAmbientes.test.ts` (7: todo uso tem padrão; leitor por campo e
por uid; sem declaração = USO + setpoint do ESTUDO + conferir; declarado vence; nome sem uso =
OUTRO/SEM; pé-direito livre = `peDireitoUtilMm` e o volume dele), `blueprintClimatizacao` (15,
inalterado), `PainelCamadasParede.test.tsx` (+3: U 2,71 W/m²·K conferido à mão para
reboco–bloco–reboco; sem λ diz quantas faltam; sem biblioteca não aparece),
`BlueprintEditor.test.tsx` (o caso das premissas ganhou a Sala: padrão do uso com `*`, 1 sem
etiqueta, declarar 3 pessoas tira o `*` e conta "1 de 2"). `check-ui-standard` limpo nos três
`.tsx`. ⚠️ Lição: o setpoint da linha herdava os 22 °C que o mesmo teste tinha declarado no estudo
— a expectativa errada era a minha, o comportamento era o pedido. Commit `db5fed12` — **com um
erro de tipo** (`AcabamentosDoAmbiente` importado de `blueprintAcabamentos`, que não o exporta): o
`tsc` saiu com código 2 e eu li o fim do log como verde. Corrigido no commit seguinte (import do
kernel); a lição ficou em memória: o código de saída do `tsc` se lê por `grep "tsc exit="`, nunca
pelo último pedaço do log.

### Fecho da Etapa 0 — 04/10/2026

- **Migration `blueprint_study_climatizacao` APLICADA** (com o número `aplicar_20271004000030`) com o OK do
  usuário (`npx supabase db query --linked -f`, pela frente `clima-e0`, linkada ao mesmo projeto).
  Prova no banco: `relrowsecurity = true`, 1 policy, grants só `authenticated` (SELECT/INSERT/
  UPDATE/DELETE; `anon` sem nada), 1 trigger de `updated_at`, FK composta + UNIQUE.
- **Suíte inteira** (reporter JSON, conta fechando): 2757 arquivos, 7507 testes = 7473 ✅ + 34
  pulados de propósito (integração) + 0 pendentes de verdade + 0 falhas.
- ⚠️ **Prefixo em colisão:** o rebase trouxe `aplicar_20271004000030_portal_help_tour_passos.sql` de
  outra frente; `migrationsPrefixo.test.ts` acusou e, pela regra (quem chegou depois move), a
  migration da climatização foi **renomeada para `aplicar_20271004000040_…`**, com o número antigo e
  o aviso de "já aplicada" no cabeçalho (é idempotente).
- Suíte sobre a árvore rebaseada: 7443 ✅ + 34 pulados + 1 falha (o prefixo, corrigido) + **51 que
  não rodaram** em `BlueprintEditor.test.tsx` (queda intermitente do worker do Node, conhecida) —
  o arquivo foi rerodado isolado com a conta do JSON antes do push: **224/224, 0 pendentes**. `npm run build` sobre a árvore rebaseada: exit 0.
- Fica para a prova no app real (estudo descartável, precisa de login): a premissa gravada voltar
  depois de recarregar — a E1 abre com esse passeio.
- **Publicada em `main` em 04/10/2026** (`ee098c1f..8f879ae2`, 7 commits); o domínio passou a servir
  `origin/main` ~10 min depois (já com um commit de outra frente por cima, `acd9a5e`) e a CI fechou
  `success`. Frente `clima-e0` fechada.

### Etapa 1.1 — 04/10/2026 (frente `clima-e1`, **kernel 0.90.0 → 0.91.0**)

**O que entrou:**
- `Opening.vidro?: VidroDaAbertura` — `fatorSolar` (0–1], `uWm2K` (0–10], `protecao`
  (SEM / PELICULA / PELICULA_CORTINA / REFLETIVA_CORTINA / PERSONALIZADA) e `fatorSombreamento`
  (0–1], obrigatório na personalizada; declarado vence a tabela). `FATOR_DE_SOMBREAMENTO_DA_PROTECAO`
  (1 / 0,75 / 0,55 / 0,40) é **hipótese de memória — CONFERIR NA NORMA (NBR 16655-3)**.
  `fatorDeSombreamento(v)` e `normalizarVidro` (cópia validada, `BAD_VIDRO`). Comando
  `SetOpeningVidro` (`null` remove); invariante: faixas + vão livre não tem vidro (pega também a troca
  de kind para vão). Canônico emite `vidro` **só quando declarado** (molde da `esquadria`).
- **Ritual do bump, na ordem:** com o vidro no código e a string ainda em 0.90.0, goldens (7) e
  `blueprintEsquadria` (7) passaram sem outra alteração → bump + entrada no histórico de `units.ts`
  → 22 pinos trocados por script sobre o glob → 6 hashes novos (as contagens 9/49/144/3/78/4
  seguiram) com a nota no cabeçalho dos goldens → bundle da `planta-api` regenerado.
- `PainelEsquadria` — seção **Vidro e proteção solar**: proteção (select com o fator da tabela no
  rótulo), fator solar, U e sombreamento anuláveis (faixa na borda; vazio = não declarado), "Remover
  declaração", linha "em uso" dizendo se o fator veio da tabela (CONFERIR) ou foi declarado. Escolher
  PERSONALIZADA parte do fator que valia. ⚠️ O campo só grava ao perder o foco **se o valor mudou** —
  o teste pegou o blur sem mudança gerando comando (um passo de desfazer fantasma).
- Catálogo: `TipoDeEsquadria.vidro` (migration `aplicar_20271004000050_blueprint_opening_types_vidro.sql`,
  coluna JSONB anulável — **a aplicar com OK antes do push**, senão o `select` do catálogo falha),
  "Salvar tipo" leva o vidro, "Aplicar tipo" aplica o vidro do tipo (e um tipo sem vidro LIMPA o da
  abertura: aplicar é aplicar inteiro). O painel em lote (`PainelEsquadrias`) salva sem vidro, dito no
  código: o quadro agrupa por kind × medidas × nome e não o carrega.

**Decisões.** (1) Vidro é DECLARAÇÃO na abertura (entra no hash), não premissa do estudo: duas
janelas iguais com vidros diferentes são desenhos diferentes para a carga. (2) Nenhum número
inventado: sem declaração, o motor (E2) usa a hipótese do estudo marcada CONFERIR. (3) A proteção
também vale para porta (porta de vidro); só o vão livre fica fora.

**Prova.** `blueprintVidroDaAbertura.test.ts` (3: versão + tabela; declara/relê/remove com hash;
faixas, personalizada, vão livre e troca de kind), goldens 7/7, `plantaApi` (bundle fresco),
`PainelEsquadria.test.tsx` (+4: hipótese do estudo → proteção cria; tabela 0,55 CONFERIR, 0,6 grava,
15 não grava, remover; personalizada parte de 0,55 e declarado aparece como declarado; salvar tipo
leva o vidro), `PainelEsquadrias` 15/15. `check-ui-standard` e `check-xss-sinks` limpos. Commit
`afc2c3ac`.

### Etapa 1.2 — 04/10/2026 (frente `clima-e1`, na MESMA 0.91.0 — ainda não publicada)

**O que entrou:**
- `Agua.camadas?` e `Structural.camadas?` (só `LAJE`) — a composição de CIMA para baixo
  (`CamadaParede[]`, o mesmo tipo da parede e do forro). `SetAguaProps.camadas` e
  `SetStructuralProps.camadas` (`null` remove; cópia por `clonarCamadas`); invariante: lista vazia,
  espessura não positiva, função estranha e camadas em peça que não é laje são recusadas; canônico
  emite só quando há (molde da parede) e relê. Decisão: a soma das camadas NÃO precisa bater com a
  `espessuraMm` da água — a espessura é o sólido, as camadas são a composição térmica.
- **Sem bump novo:** a 0.91.0 da E1.1 ainda não foi publicada, então os campos entram nela (histórico
  em `units.ts` diz as duas coisas). Os seis goldens não têm telhado nem estrutura: nada mudou neles.
- `EditorDeCamadas` saiu de dentro do `PainelAcabamentos` para arquivo próprio (um editor, três
  lugares); `CamadasDaPeca` é a seção reutilizável — editor, "Adicionar camada", escolha no catálogo
  e **U/R pela NBR 15220 com Rsi 0,17 / Rse 0,04 (fluxo descendente, o caso do verão)**; sem camadas
  diz "U não avaliado", sem λ diz quantas camadas faltam. Montada no `PainelAguaSelecionada`
  ("Camadas da cobertura", primeira camada sugerida = telha 20 mm) e no `PainelEstruturaSelecionada`
  só para LAJE ("Camadas da laje", primeira = concreto 100 mm). O editor passa `biblioteca.materiais`.

**Prova.** `blueprintCamadasDeCoberturaELaje.test.ts` (3: declara/relê/remove com hash e omissão;
só laje, lista vazia, espessura 0 e função estranha recusadas; U 0,716 W/m²·K conferido à mão para
telha + lã de rocha + laje, e λ ausente dito), goldens 7/7, `blueprintCamadas`, `plantaApi`
(bundle fresco), `blueprintCoberturaExtrusao` — 38/38. `check-ui-standard` limpo nos cinco `.tsx`.
Commit `a865f70d`.

### Etapa 1.3 — 04/10/2026 (frente `clima-e1`, sem bump — derivação pura)

**O que entrou:**
- `utils/blueprintExposicaoTermica.ts` — `exposicaoDoNivel(model, levelId)` / `exposicaoDoAmbiente`:
  para cada ambiente, **as faces verticais** (externas com a orientação de 8 pontos do grafo
  espacial; internas com o vizinho e o `labelUid` dele — a chave do "climatizado?" das premissas;
  áreas bruta, de vãos e líquida; cada vão com área e o vidro da E1.1; as camadas da parede),
  **o teto** (AMBIENTE acima / COBERTURA / LAJE_EXPOSTA / EXTERIOR descoberto, com as camadas da
  água ou da laje da E1.2) e **o piso** (AMBIENTE abaixo / SOLO / EXTERIOR pilotis). Achado 7
  fechado. Pendências ditas, nunca inventadas: vizinho ou ambiente acima/abaixo sem etiqueta,
  cobertura/laje sem camadas, parede sem lado, ambiente de cima cobrindo só parte, último pavimento
  sem telhado nem laje. `resumirExposicao` conta por tipo.
- **Decisão: ponto interior, não interseção de polígonos.** `areaComum` só recorta com faca convexa
  e devolve zero honesto nos côncavos; "o que está em cima" é pertinência, não área — `interiorPoint`
  (respeita furos) contra ambientes, lajes e águas. O caso que isso erra (ambiente metade sob outro)
  vira pendência quando o de cima é bem menor.
- `PainelClimatizacao` ganha a coluna **Teto / piso** na tabela por ambiente (com o vizinho entre
  parênteses e ⚠ n com as pendências no `title`); o editor calcula a exposição do pavimento ativo só
  com a gaveta aberta.

**Prova.** `blueprintExposicaoTermica.test.ts` (4, sobrado Sala+Cozinha / Quarto sobre a Sala /
telhado: Sala com N-O-S externas e a divisa interna com a Cozinha, janela de 1,32 m² com vidro na
face sul, teto = Quarto, piso = solo, sem pendência; Cozinha sob a cobertura com "sem camadas"
como pendência que some ao declarar a telha; Quarto sob a cobertura e sobre a Sala; sem telhado o
Quarto vira laje exposta e a Cozinha exterior; vizinho sem etiqueta é pendência; resumo por tipo).
`BlueprintEditor.test.tsx` (o caso das premissas confere a coluna: "laje exposta / sobre o solo"
com **⚠ 2** — o último pavimento sem telhado E o vizinho sem etiqueta — e os motivos no `title`).
`check-ui-standard` limpo. Commit `6f1c1c62`.

### Fecho da Etapa 1 — 04/10/2026

- **Migration `aplicar_20271004000050_blueprint_opening_types_vidro.sql` APLICADA** com o OK do
  usuário; prova: `information_schema.columns` → `vidro jsonb`, anulável.
- **Suíte inteira** (reporter JSON, conta fechando): 7546 testes = 7512 ✅ + 34 pulados de propósito +
  0 pendentes + 0 falhas. `npm run build` (tsc + vite) exit 0. ⚠️ Um `tsc` isolado caiu com exit 139
  (segfault do Node, sem `error TS`) enquanto suíte e build rodavam juntos — a tipagem foi provada
  pelo `tsc` de dentro do build.
- Fica para a prova no app real: declarar vidro numa janela, camadas num telhado, e ver a coluna
  "Teto / piso" — a E2 abre com esse passeio.
- **Publicada em `main` em 04/10/2026** (`c92d152f..f80399e6`); domínio e CI verdes; frente
  `clima-e1` fechada.

### Etapa 2.1 + 2.2 — 04/10/2026 (frente `clima-e2`, sem bump — derivação pura)

**O que entrou:**
- `utils/blueprintCargaTermica.ts` — `cargaTermicaDoNivel(model, hip, levelId, {materiais,
  cidadeDoContexto})` e `cargaTermicaDoEstudo`. Por ambiente: **paredes** (U das camadas com λ pela
  NBR 15220 ou U típico; externa com ΔT + acréscimo solar pesado pela orientação; interna com fração
  do ΔT se o vizinho não é climatizado, zero se é), **vãos** nas faces externas (janela: condução U·A·ΔT
  + insolação A·FS·Fsomb·I por orientação; porta: condução), **teto** (cobertura: U + acréscimo solar;
  laje exposta idem; ambiente acima: fração ou zero), **piso** (solo: zero, dito; pilotis: ΔT;
  ambiente abaixo: fração), **pessoas** (sensível + latente por atividade), **iluminação** e
  **equipamentos** (× fator de uso), **fonte extra**, **infiltração** (0,34·V·n·ΔT sensível; latente
  pela umidade absoluta — psicrometria mínima: Magnus, pressão pela altitude, TBU → w, UR → w). Cada
  parcela sai com `origem` DECLARADA / HIPOTESE / NAO_AVALIADA e a **memória** em uma frase; sem TBS
  nada de condução é inventado (NAO_AVALIADA + pendência). Totais sensível/latente/total em W e
  BTU/h, W/m², `conferir`.
- `HipotesesDoMotor` em `hipoteses.motor` (11 campos com faixa: U típicos de parede/cobertura/laje/
  vidro/porta, FS típico, acréscimos solares, fração ΔT não climatizado, trocas/h, fator de uso) —
  **toda folga é hipótese editável**. Tabelas de memória com CONFERIR: `CALOR_POR_ATIVIDADE`,
  `IRRADIANCIA_POR_ORIENTACAO`, `PESO_SOLAR_DA_ORIENTACAO`, os padrões do motor.

**Prova.** `blueprintCargaTermica.test.ts` (5: psicrometria contra a carta — 2,34 kPa a 20 °C,
16,5 g/kg a 34/25, 9,3 g/kg a 24 °C/50 %; sem TBS = não avaliado + internas contam; com TBS 34 cada
parcela da Sala conferida à mão — parede S com U 2,5 e ΔTeq 11,8, divisa com a Cozinha a ½ ΔT, janela
114 W + 209 W, cobertura 2,0·A·20, piso zero, infiltração sensível e latente, totais fecham, Cozinha
não soma; o declarado vence — vidro 2,8/0,40 com película+cortina, cobertura U 3,74 das camadas,
cozinha declarada climatizada zera a divisa; leitor do motor com faixa). ⚠️ Lição: a minha conta de
cabeça do Δw (7,2) estava arredondada — 6,8 g/kg pelas funções; a asserção passou a usá-las.

### Etapa 2.3 — 04/10/2026

**O que entrou:**
- `utils/blueprintConferenciaClimatizacao.ts` — 7 itens em três estados + não avaliado: TBS (FALTA
  sem valor; AVISO da tabela), TBU, ambientes climatizados, etiquetas dos vizinhos, vidro declarado,
  envoltória com camadas/λ, densidade plausível (40–300 W/m², hipótese). `fecha` = sem faltas.
- `PainelCargaTermica` — condições em uso, uma linha por ambiente climatizado (área, W/m², sensível,
  latente, total, BTU/h, `*` = hipótese, ⚠ n), "parcelas" abre a tabela com a memória de cada uma,
  banner CONFERIR, conferência com "ver (n)". Tarefa `cargaTermica` no grupo **Carga térmica** da
  aba Mecânica (ícone `Sun`); com a gaveta aberta a planta vira **mapa de calor** pela densidade
  (`coresDaCarga` → `coresDosAmbientes`, azul ≤ 40 … vermelho ≥ 200 W/m²; não climatizado cinza).
- `PainelClimatizacao` ganhou a seção **Hipóteses do motor** (os 11 campos, com faixa).

**Prova.** `blueprintConferenciaClimatizacao.test.ts` (3), `PainelCargaTermica.test.tsx` (3: São
Paulo da tabela com ΔT 7,9; só a Sala na tabela; parcelas com `*` e total W = BTU/h; sem TBS
"Teto —" e 1 falta), `BlueprintEditor.test.tsx` (+1: o botão abre a gaveta com a Sala e a falta de
TBS; fechar some). `check-ui-standard` e `check-xss-sinks` limpos.

### Etapa 2.4 — 04/10/2026

**Prova independente (fora do código).** Um teste temporário gravou em JSON as parcelas da Sala
da casa de teste (8 × 4 m com parede no meio, janela de 2 m² ao sul, telhado; TBS 34 / TBU 25 /
setpoint 24 / UR 50 %, hipóteses padrão) e um script Python recalculou TUDO do zero — geometria
(4,0 × 4,0 m de eixo, 2,8 m, janela descontada da parede sul), U típicos, pesos solares,
irradiância, calor por pessoa, Magnus + constante psicrométrica para a infiltração latente —
e comparou: **18 de 18 parcelas batem** (parede S 271 W, N 398, O 448, divisa 140; janela 114 +
209; cobertura 640; piso 0; pessoas 260 + 140; iluminação 80; TV 300; infiltração 76 + 127; total
sensível 2 936, latente 267, 3 203 W = 10 929 BTU/h; 200 W/m²). O arquivo temporário foi apagado.
⚠️ Observação para o backlog: `areaPisoM2` do motor é a área de EIXO do ambiente (16 m²), não a
líquida (~14,8 m²) — conservador para a carga, mas o W/m² sai ~8 % menor do que seria pela área
útil; decidir na E4 (seleção) qual área a densidade reporta.

**Memorial.** `utils/blueprintMemorialClimatizacao.ts` — cálculo (condições com origem, as hipóteses
do motor e as tabelas de memória com CONFERIR, cada ambiente climatizado com a tabela de parcelas e a
memória, resumo por pavimento e estudo, a conferência) e descritivo (objeto, normas e método,
condições, ambientes com teto/piso, o que fica a cargo do responsável). Prévia e PDF/DOCX pelo
`PainelMemoriaisHidro` + `artefatosDoMemorial`, abaixo do painel da carga — a mesma função que a tela
lê. Emissão com ART fica para a E8.4 (exige o CHECK da tabela de projeto executivo).

**Prova.** `blueprintMemorialClimatizacao.test.ts` (3: 4 seções, CONFERIR no topo, TBS declarada,
TOTAL da Sala igual ao da tela, insolação marcada `*`, Cozinha fora, conferência com "ok"; descritivo
com total, NBR 16655-3, teto/piso e o encargo do responsável; sem climatizado diz isso).

### Fecho da Etapa 2 — 04/10/2026

- Sem migration (tudo deriva do desenho e do JSONB de premissas que já existe).
- **Suíte inteira**: 7591 testes = 7557 ✅ + 34 pulados de propósito + 0 pendentes + 0 falhas (o
  `BlueprintEditor.test.tsx` rodou inteiro na suíte desta vez). `npm run build` exit 0, 0 `error TS`.
- Fica para a prova no app real: abrir Carga térmica num estudo com clima declarado e ver o mapa de
  calor e o PDF do memorial — a E3 abre com esse passeio.

### Etapa 3.1 + 3.2 + 3.3 — 04/10/2026 (frente `clima-e3`, **kernel 0.91.0 → 0.92.0**, um bump para as quatro fases)

**Decisão de desenho.** O equipamento entra na taxonomia `tipoHidraulico` (como os preventivos do
incêndio entraram na E7), e não como família nova de componente: é o que faz rede, kit, numeração,
conexões, IFC e tipo salvo o enxergarem sem código novo em cada um. A reserva de espaço da E11.1
(componente `CLIMATIZACAO`) continua existindo e abre igual — no menu passou a se chamar "Reserva
de condensadora/evaporadora", apontando para o grupo novo. **"Converter reserva em equipamento" NÃO
entrou** — fica para a E4.1, onde o posicionamento automático cria o equipamento (a conversão é o
mesmo gesto com a posição já dada).

**Kernel (`model.ts`, `commands.ts`, `canonical.ts`, `index.ts`).**
- 20 tipos novos em `TIPOS_DE_PONTO_HIDRAULICO`: `EVAPORADORA_HI_WALL/PISO_TETO/CASSETE/DUTADA`,
  `CONDENSADORA_SPLIT/VRF`, `DERIVADOR_VRF`, `EXAUSTOR_AR`, `BOMBA_DRENO`, `PONTO_DRENO`,
  `CAIXA_DISTRIBUICAO_AR`, `DIFUSOR`, `GRELHA_INSUFLAMENTO`, `GRELHA_RETORNO`, `BOCAL_AR`,
  `TOMADA_AR_EXTERIOR`, `VENEZIANA_AR`, `CAIXA_PLENUM`, `DAMPER`, `EQUIPAMENTO_CLIMATIZACAO` — com as
  famílias `TIPOS_DE_EVAPORADORA`, `TIPOS_DE_CONDENSADORA`, `TIPOS_DE_TERMINAL_DE_AR`,
  `TIPOS_COM_CAPACIDADE`, `TIPOS_DE_CLIMATIZACAO` exportadas.
- `DisciplinaDeRede` += `FRIGORIGENA` (cobre) e `DRENO_AC` (PVC soldável/CPVC); `MECANICA` segue
  sendo o ar. `DISCIPLINAS_DO_PONTO_HIDRAULICO`: evaporadora/condensadora/derivador → FRIGORIGENA;
  bomba e ponto de dreno → DRENO_AC; exaustor, caixa e terminais de ar → MECANICA; o personalizado nas
  três. `materialPadraoDaDisciplina` e `MATERIAIS_DA_DISCIPLINA` cobrem as duas.
- `Terminal.capacidadeBtuH` (inteiro > 0, só em `TIPOS_COM_CAPACIDADE`) e `Terminal.condensadoraId`
  (só evaporadora/derivador; o alvo tem de SER condensadora) — invariantes `BAD_CAPACITY` /
  `BAD_CONDENSER`; no canônico, `capacidadeBtuH` só quando declarada e a condensadora por ÍNDICE
  (`condensadora`, segundo passo, molde de `central`/`principal`). `limparCondensadorasOrfas` roda em
  todo comando: apagar a condensadora (ou ela mudar de tipo) solta a evaporadora e a lista no diff.
  `SetTerminalProps` limpa capacidade/sistema **só quando o tipo muda**; declarar BTU/h num difusor
  sem trocar o tipo NÃO é engolido — a invariante recusa.
- `Trecho.bitolaSuccaoMm` (só FRIGORIGENA — a linha é UM trecho com dois diâmetros; `bitolaMm` é o
  líquido) e `Trecho.isolamentoMm` (FRIGORIGENA, DRENO_AC, MECANICA; ≥ 0) — `BAD_PIPE_SIZE` fora
  disso; `AddTrecho`/`SetTrechoProps` arredondam; canônico omite quando ausente.
- `conexoes.ts`: `HIDRAULICAS` += FRIGORIGENA, DRENO_AC, MECANICA — curva, tê e redução derivados
  também na linha, no dreno e no duto (achado do benchmark: `conexoes.ts:148` excluía MECANICA).

**Tabelas por disciplina** (`tsc` guiou): `blueprintRede.ts` (cota 2500/2400, bitola 6/25, cota de
terminal 2200/2100, cor violeta/ciano, nome e rótulo), `blueprintCamadasPorDisciplina.ts` (as duas
moram na camada MECANICA), `blueprintIfc.ts` (`SISTEMA_IFC` `.REFRIGERATION.`/`.DRAINAGE.`; trecho =
`IFCPIPESEGMENT`; os 20 tipos no `entidadeDoPontoHidraulico`: `IfcUnitaryEquipment .SPLITSYSTEM./
.AIRCONDITIONINGUNIT.`, `IfcFan`, `IfcPump .SUBMERSIBLEPUMP.`, `IfcAirTerminal .DIFFUSER./.GRILLE./
.REGISTER./.LOUVRE.`, `IfcDuctFitting`, `IfcDamper`). `blueprintHidraulica.ts`: 20 fichas nos grupos
"Climatização — equipamentos / dreno / terminais de ar" (medidas da reserva da E11.1; DN mínimo da
linha 6 mm; `sobreOTrecho` no derivador e no damper).

**Editor.** `MenuComponentes`: os três grupos novos entram na família Mecânica (`familiaDoGrupo`),
em três colunas, com "Linha frigorígena" e "Dreno de condensado" como trechos (`tool: 'rede'`).
`PainelTrechoSelecionado`: **Capacidade (BTU/h)** em quem troca calor, **Condensadora (sistema)** na
evaporadora/derivador (vermelho enquanto sem sistema; nome = número derivado + BTU/h), **Sucção** na
linha (padrão = a de líquido) e **Isolamento** na linha/dreno/duto. `blueprintTipos.ts`: a
capacidade entra no tipo salvo (só quando declarada — assinatura dos tipos antigos intacta): o
cadastro de equipamentos da organização nasce aqui, é a base do catálogo da E4.1.

**O que da 3.3 ficou para depois (dito, não escondido):** o terminal mecânico de TEXTO LIVRE
("Difusor / grelha") continua no menu e no canvas como estava — não foi convertido nem lido como
legado; `especificacaoDoTerminal` ainda não escreve capacidade/vazão (E9.1). Potência elétrica do
equipamento e o ponto elétrico automático ficam na E4.3, como o roadmap já previa.

### Etapa 3.4 — 04/10/2026 (mesma frente, mesma 0.92.0)

- `utils/blueprintSimbolosClimatizacao.ts` — fonte única do símbolo 2D dos 20 tipos (mesmas
  primitivas do incêndio; `desenharSimboloDeClimatizacao` para a prancha; `idsDaClimatizacao` para a
  vista esconder tudo). O canvas ganhou `primitivasDoSimboloDaPeca(t)` (incêndio OU climatização) no
  lugar do teste só de incêndio; o X do difusor de texto livre segue para quem não tem símbolo.
- Numeração derivada (EV-1, CD-1, DV-n, DF-n…): o laço do incêndio foi EXTRAÍDO para
  `utils/blueprintNumeracaoDerivada.ts` e `numeracaoDeIncendio` passou a chamá-lo (os 3 testes do
  incêndio provam que nada mudou); `blueprintNumeracaoClimatizacao.ts` usa a sigla da ficha como
  prefixo — evaporadoras dividem UMA série seja qual for o tipo. Canvas escreve o número no lugar da
  sigla; o painel mostra "Número EV-2 — derivado…"; o seletor de condensadora lista por número.
- Kit disparado pelo equipamento: os kits da organização (`kitsDaPeca`) já casam por
  `(disciplina, tipo)` de QUALQUER terminal — o equipamento tipado entra sem código novo. **Não
  entrou:** kit padrão (dreno + ponto elétrico junto da evaporadora — E4.3/E5.4), marcas de
  verificação da climatização (`blueprintVerificacaoRede.ts:91`, fica para a E5 junto com a rota) e
  o harness do canvas/prancha (a prancha de climatização é a E8.1).

**Prova.** `blueprintClimatizacaoTipos.test.ts` (12: disciplinas e materiais; 20 tipos com ficha,
grupo e disciplina coerentes; `BAD_POINT_KIND` na linha errada; capacidade arredondada e sistema;
invariantes de capacidade/condensadora com o modelo torto; troca de tipo limpa só o que o tipo novo
não carrega; apagar a condensadora solta a evaporadora; canônico vai e volta e omite ausentes;
sucção/isolamento por disciplina; conexões derivadas num L de cada disciplina),
`blueprintSimbolosClimatizacao.test.ts` (4: 20 símbolos distintos = exatamente os tipos dos grupos de
climatização; todas as primitivas no quadrado unitário; prancha no lugar e tamanho; ids),
`blueprintNumeracaoClimatizacao.test.ts` (3: ordem e séries; rótulo declarado reserva; incêndio
idêntico pelo laço extraído), `components/PainelTrechoClimatizacao.test.tsx` (3: evaporadora,
condensadora × difusor, trecho por disciplina). Goldens: com a string em 0.91.0 e TUDO isto no
código, os 7 passaram (prova de que desenho antigo não muda de forma); depois do bump, 6 falhas só
de hash, contagens idênticas; 23 pinos trocados por glob; bundle `planta-api` regerado em 0.92.0.

### Fecho da Etapa 3 — 04/10/2026

- Sem migration (tudo é kernel + derivação; o tipo salvo já era JSONB).
- **Suíte inteira**: 7612 testes = 7574 ✅ + 34 pulados de propósito + 4 falhas, todas de
  EXPECTATIVA antiga que a taxonomia nova mudou (lista de grupos e regex `^(Hidráulica|Incêndio)` em
  `blueprintPontoHidraulicoTipos`, "sete cores" → nove em `blueprintRede`, "Condensadora" → "Reserva
  de condensadora" no `BlueprintEditor` HVAC) — corrigidas e os três arquivos rodados de novo verdes
  (editor 225/225). `npm run build` exit 0 (tsc dentro), `tsc` isolado exit 0, `check-ui-standard`
  nos 4 `.tsx` tocados e `check-xss-sinks` exit 0.
- Fica para a prova no app real (junto com a da E0–E2, que ainda falta): inserir evaporadora +
  condensadora pelo menu Mecânica, ligar o sistema no painel, ver EV-1/CD-1 no canvas.

### Etapa 4.1 + 4.2 + 4.3 — 05/10/2026 (frente `clima-e4`, sem bump, sem migration)

**Decisão de desenho.** O "catálogo de capacidades comerciais" NÃO é tabela nova: é o cadastro de
TIPOS SALVOS da organização (`blueprint_element_types`, família TERMINAL) filtrado por
`tipoHidraulico` que troca calor e `capacidadeBtuH > 0` — o mesmo molde do cadastro de bombas de
incêndio (`bombasDoCatalogo`). As SEMENTES ganharam 8 splits hi-wall (9.000 a 60.000 BTU/h, com a
potência típica de placa — HIPÓTESE, CONFERIR com o fabricante); quem tem o modelo real salva o
seu pelo painel da peça ("salvar tipo" já leva a capacidade desde a E3).

**E4.1 Seleção (`utils/blueprintSelecaoClimatizacao.ts`).** `modelosDoCatalogo(tipos)`;
`necessarioBtuH = ⌈carga × (1 + folga)⌉`; `selecionarModelo(carga, modelos, hip)` = o MENOR modelo
do tipo preferido que alcança o necessário (sem nenhum do tipo, qualquer evaporadora; sem nenhum
que alcance, o motivo diz o maior do catálogo e pede dividir ou cadastrar); `avaliarCapacidade`
(ATENDE / SUBDIMENSIONADO abaixo do necessário / SUPERDIMENSIONADO acima de carga × (1 + super) /
SEM_CAPACIDADE); `selecaoDoNivel(model, carga, hip, modelos)` por ambiente climatizado — as
evaporadoras DENTRO do contorno, a instalada só soma o declarado (uma sem capacidade = `null`), o
estado, a sugestão, as pendências (carga com hipótese; evaporadora sem sistema); `conferenciaDeSelecao`
(CATALOGO, EQUIPAMENTO, CAPACIDADE, SISTEMA) no molde da conferência da carga. Hipóteses novas em
`HipotesesClimatizacao.selecao` {folgaPct 10, superPct 50, eerWW 3,0, tipoPreferido hi-wall} com
`LIMITES_DE_SELECAO` e leitor — toda folga editável no painel.

**E4.2 Posição (`utils/blueprintPosicaoSplit.ts`).** `planejarEquipamentosSplit(model, selecao, carga,
hip)`: para cada ambiente climatizado sem equipamento CONFIRMADO, a evaporadora vai para uma parede
SEM porta (`ladosDePiso` + `trechosUtilizaveis`, agora exportado), num trecho livre ≥ largura da peça
com 300 mm de folga, EXTERNA de preferência (a exposição da carga diz qual face é externa) e, entre
as que servem, a de maior trecho livre; no meio do trecho, recuada meia profundidade (encosta na
face), a 2,20 m, com `rotacaoGraus` para soprar para dentro (`giroParaSoprarParaDentro`: g =
atan2(n.x, −n.y), deduzido do `rotate(−giro)` do canvas — **confirmar visualmente no app**). A
condensadora vai para FORA da parede externa (espessura + 300 mm de folga + meia profundidade;
recusada se cair dentro de outro ambiente) ou, sem fachada, para um ambiente TÉCNICO do pavimento
pelo nome (`AMBIENTE_TECNICO`: área técnica, serviço, varanda, terraço, casa de máquinas,
cobertura, garagem, quintal, pátio); sem nada disso, o relatório pede a posição. Tudo `sugerida`;
relançar apaga as sugestões anteriores deste planejador (peças de climatização + o ponto elétrico
sugerido do aparelho) no mesmo lote — idempotente; aceitar fixa e o planejador não mexe mais.

⚠️ **O SISTEMA no mesmo lote.** A relação evaporadora → condensadora precisa dos ids que o lote
ainda vai criar. O caminho: aplicar `apagar + adds` numa CÓPIA (`applyBatch`, contador de ids
determinístico — o mesmo que `conferirPlanoDaRede` usa para a prova) e ler os ids novos; o
`SetTerminalProps { condensadoraId }` entra no fim do mesmo lote. O plano é derivado do modelo
(useMemo), então se o modelo mudar entre planejar e lançar os ids batem de novo. É acoplamento ao
gerador de ids — dito aqui e no cabeçalho do arquivo; a alternativa (comando `AddSplit` único no
kernel, molde `DuplicateLevel`) exigiria bump e fica anotada para quando a E11 encadear tudo.

**E4.3 Elétrica.** O planejador cria o ponto `AR_CONDICIONADO` junto da evaporadora com
`potenciaW` = potência de placa do modelo (ou, sem placa, estimada por `capacidade ÷ 3,412 ÷ EER`) —
não os 1400 VA fixos de `POTENCIA_TIPICA_DO_EQUIPAMENTO_VA`; `AR_CONDICIONADO` já é
`TIPOS_DE_USO_ESPECIFICO` (circuito próprio) e curva D no motor de circuitos, então trocar o modelo
muda a corrente e a seção pelo caminho que já existe. **Não entrou:** o ponto elétrico automático
para uma evaporadora inserida À MÃO (só o planejador o cria) — fica na E5.4 junto do dreno.

**Editor.** Tarefa `selecaoSplit` ("Seleção e posição do split", botão "Split" no grupo Carga
térmica, ícone Snowflake); o catálogo carrega ao abrir a tarefa (mesmo efeito do incêndio);
`cargaDoNivel` também calcula com a tarefa aberta; `PainelSelecaoSplit` (hipóteses, tabela por
ambiente com estado e sugestão, plano com resumo/já atendidos/sem lugar, Lançar/Relançar e Aceitar
com motivo quando desligados, conferência com seleção dos ambientes).

**Prova.** `blueprintSelecaoClimatizacao.test.ts` (6: sementes → 8 modelos; sujeira fora;
**10.500 com 10 % escolhe 12.000** e 11.000 → 18.000; sem alcance/sem catálogo o motivo; declarado
conferido sub/super/sem capacidade; EER 12.000 → 1.172 VA; hipótese da coluna com faixa; pavimento
com Sala sem equipamento → com 9.000 declarada = subdimensionada e sem sistema — o declarado vence
a sugestão), `blueprintPosicaoSplit.test.ts` (5: evaporadora em parede externa sem porta, fora do
vão, dentro da Sala, a 2,20 m; condensadora fora de todo ambiente; sistema ligado no mesmo lote;
ponto elétrico com a potência da placa ≠ 1400; relançar idempotente (apaga 3, recria iguais);
aceitar → "já atendido"; 9.000 não alcança → motivo, 24.000 → 2.300 VA, 60.000 → 5.900 VA, sem placa
→ EER; sala interna → condensadora no ambiente técnico; todas as paredes com porta → motivo; giro
por normal), `components/PainelSelecaoSplit.test.tsx` (2), editor "Mecânica › Split" (catálogo
assíncrono → sugestão → Lançar → estado muda e Aceitar (3); sem TBS a carga é só interna e o menor
modelo pode sair "superdimensionado" — a conferência diz, não finge). `blueprintCatalogoDeTipos.test`
ajustado: a semente de split se aplica a um ponto FRIGORIGENA (o tipo não troca disciplina).

### Fecho da Etapa 4 — 05/10/2026

- Sem migration, sem bump (tudo derivação + tipos salvos que já eram JSONB).
- **Suíte inteira**: 7626 testes = 7591 ✅ + 34 pulados de propósito + 1 falha de expectativa
  ("18 tipo(s) padrão criados" → 26 com as 8 sementes de split; corrigida e o teste reprovado
  verde). `npm run build` exit 0 (tsc dentro), `tsc` isolado exit 0, `check-ui-standard` nos 2
  `.tsx` tocados e `check-xss-sinks` exit 0.
- Fica para a prova no app real: abrir "Split" num estudo com TBS declarada, Lançar, ver a
  evaporadora SOPRANDO PARA DENTRO (o sinal do giro foi deduzido do canvas, não visto) e a
  condensadora do lado de fora; aceitar; conferir "atende".

### Prova no app real (E0–E4) — 05/10/2026, estudo descartável, autorizada pelo usuário

Playwright contra o dev server da frente (porta própria, service worker bloqueado), login real do
`agente-leitura` (Membro), escrita só num estudo novo "Planta 05/10/2026" da organização Alpa.
Script no scratchpad da sessão (não entra no repositório: tem o fluxo de login).

- **Desenho**: "Parede em retângulo" (2 cliques) → 4 paredes, 1 ambiente (82,5 m²), renomeado para
  "Sala" pelo lápis da seção Ambientes → "climatizado: sim *" (padrão do uso) nas premissas.
- **E0**: TBS 34 / TBU 25 declaradas em Premissas de climatização; "Em uso: TBS 34,0 · TBU 25,0";
  **após recarregar a página e reabrir o estudo, TBS voltou 34** — a persistência em
  `blueprint_study_climatizacao` funciona sob RLS (1 linha no banco, conferida por SQL).
- **E2**: Carga térmica calculou **11.090 W · 37.841 BTU/h** para a Sala (≈135 W/m², hipóteses
  típicas, sem janela, laje exposta/sobre o solo).
- **E4**: a gaveta do Split, com o catálogo da organização VAZIO de splits, disse exatamente isso
  ("catálogo sem modelo de evaporadora — salve um tipo com capacidade ou semeie o catálogo") e
  deixou "Lançar" desligado com o motivo. Como semear o catálogo é escrita na ORGANIZAÇÃO (fora da
  autorização), os 8 modelos entraram só na LEITURA (stub de rede do GET de
  `blueprint_element_types`; conferido por SQL: 0 tipos "Split hi-wall" na org depois). Com eles:
  necessário 41.626 → sugestão **48.000 BTU/h**; Lançar criou evaporadora + condensadora + ponto de
  força **num lote**; estado **atende**; "Aceitar (3)" confirmou; **após recarregar**: "todos os
  ambientes climatizados já têm equipamento confirmado", instalado 48.000, atende. No banco: 3
  terminais + 4 paredes no rascunho em `blueprint-kernel-ts-0.92.0`.
- **Visual (fotos no scratchpad)**: EV-1 DENTRO da Sala, encostada na face da parede de baixo,
  **lâminas voltadas para dentro do ambiente** — o sinal do giro estava certo; CD-1 do lado de FORA
  da mesma parede; ponto "AC · ?" com **4700 VA** (placa do 48.000, não 1400); camadas
  "Climatização — equipamentos 2 · Elétrica — equipamentos 1". ⚠️ Cosmético para o backlog: o símbolo
  da hi-wall é desenhado num quadrado de lado = MAIOR medida (900), então o retângulo sai mais fundo
  que os 220 mm reais e "monta" na parede — o ponto está certo, o desenho é maior que a peça.
- **Limpeza**: os dois estudos descartáveis (o primeiro ficou com 4 paredes tortas de uma tentativa
  de desenho por coordenadas) apagados por SQL com CASCADE (0 snapshots, nenhuma FK sem cascade);
  conferido: 0 estudos, 0 ramos, 0 premissas, 0 tipos de split na org.
- Lições do passeio (para o próximo): a gaveta da tarefa é um Sheet modal sobre o ribbon — fechar
  pelo botão "Fechar" ANTES de clicar outro botão (e `offsetParent` é null dentro de
  position:fixed — usar `checkVisibility()`); "Nova planta" com o topo em "Todas" abre o modal de
  organização; o link `#/blueprint?studyId=` não abriu o estudo neste passeio (abrir pela linha da
  lista funcionou) — anotado, não investigado.

### Etapa 5.1 + 5.2 + 5.3 + 5.4 — 05/10/2026 (frente `clima-e5`, **sem bump** — desvio do roadmap, dito abaixo)

**Decisão de desenho (E5.3 sem bump).** O roadmap previa `Trecho.curva {raioMm}` com bump. Não
entrou: a geometria `a → b` do trecho não carrega raio — a curva mora no NÓ entre dois trechos
retos, e o raio mínimo é REGRA da dobra do cobre por diâmetro, não dado do desenho. Então a E5.3
ficou DERIVADA: a conferência conta as curvas da linha (nós JOELHO_90/JOELHO_45 de
`conexoesDerivadas` entre trechos da linha) e diz o raio mínimo por Ø (`RAIO_MINIMO_DA_CURVA`,
≈ 4 × D, hipótese). O desenho 2D/3D "do par isolado" também não entrou (a linha se desenha como
tubo da disciplina, com a cor violeta da E3) — fica para a E8/E10 junto da prancha e do 3D.

**Molde.** O traçado é o do eletroduto e do alimentador: `arvorePelasParedes` (eixo das paredes,
pilar como custo) da evaporadora à condensadora, `desvioDoPilar` na reta quando não há parede ao
alcance; os trechos nascem num `lote` com deduplicação por nó (o `addTrecho` do eletroduto). ⚠️ O nó
da rede é por coincidência EXATA (`conexoes.ts`): a linha sobe de `(evap.at, evap.cotaMm)` à cota
da linha e desce em `(cond.at, cond.cotaMm)` — é isso que faz as peças contarem como fim de linha.

**Kernel/derivados.** `conexoes.ts`: o equipamento de climatização conta como PEÇA no nó de cada
disciplina que a ficha admite, e a evaporadora também em `DRENO_AC` — sem isso o dreno que chega
nela era "ponta aberta" (achado do levantamento da E5). Derivação pura (não entra no payload nem
no hash): os goldens não mudam. `blueprintVerificacaoRede.ts`: ATRAVESSA_PILAR/CRUZA_VIGA também
para FRIGORIGENA e DRENO_AC (critério da 5.1 "nenhum trecho atravessa pilar"); DECLIVIDADE_BAIXA
para o dreno por gravidade (`drenosTrechoATrecho`: |Δcota|/planta, mínima 1 % hipótese; a rede
ligada a uma BOMBA_DRENO é recalque e não é cobrada).

**`utils/blueprintLinhaFrigorigena.ts`.**
- E5.2 `FAIXAS_DA_LINHA` por capacidade (≤12k 6/10 mm · 15 m · 7 m · 15 g/m; ≤18k 6/13 · 20 · 10 · 20;
  ≤24k 6/16 · 25 · 15 · 30; ≤36k 10/16 · 30 · 20 · 35; ≤60k 10/19 · 50 · 30 · 50) — valores
  típicos de split R-410A transcritos de memória, **HIPÓTESE, CONFERIR com o fabricante**
  (`FONTE_DAS_FAIXAS` aparece no painel); `isolamentoDaLinhaMm` (9/13 mm pelas hipóteses).
- `sistemasDoNivel` (evaporadora com `condensadoraId` no mesmo pavimento — a prumada entre
  pavimentos fica para depois), `linhaExistente` (menor caminho no grafo dos trechos FRIGORIGENA
  entre os nós das peças).
- E5.1 `planejarLinhasFrigorigenas(model, levelId, hip)`: por sistema sem linha CONFIRMADA, a linha
  (sobe → corre na `cotaDaLinhaMm` → desce → sai) com `bitolaMm` = líquido, `bitolaSuccaoMm` = sucção,
  `isolamentoMm`; E5.4 o dreno de `(evap.at, evap.cotaMm)` ao PONTO_DRENO existente mais perto ou a
  um ponto novo ao LADO da condensadora (meia largura + 200 mm ao longo da parede, cota 0), por
  gravidade com a queda de cada lance arredondada PARA CIMA (nenhum lance fica abaixo da mínima
  por arredondamento) — ou, se o descarte fica acima da queda possível, com BOMBA_DRENO a 30 cm
  da evaporadora e o dreno em recalque. Tudo `sugerido`; relançar apaga linha, dreno e peças de
  dreno sugeridos no mesmo lote; o plano é provado numa cópia (`applyBatch`).
- E5.2/E5.3 `linhasConferidas` (comprimento, desnível, Ø encontrados × faixa, isolamento mínimo,
  gás adicional = (L − pré-carga) × g/m, curvas e raio mínimo, pendências) e `conferenciaDaLinha`
  (LINHA, LIMITES, DIAMETROS, GAS, CURVAS, DRENO) em 3 estados; `drenosConferidos` (chega a um
  ponto de dreno? com bomba?).
- Hipóteses em `HipotesesClimatizacao.linha` {cotaDaLinhaMm 2500, raioDeEncaixeMm 600, preCargaM 5,
  declividadeDrenoPct 1, isolamentoAte24kMm 9, isolamentoAcimaMm 13, dnDrenoMm 25} com limites e
  leitor — toda folga editável no painel.

**Editor.** Tarefa `linhaFrigorigena` ("Linha e dreno", ao lado de "Split"); `PainelLinhaFrigorigena`
(hipóteses, tabela por sistema com linha/máximo/Ø/gás/curvas, plano, Lançar/Relançar e Aceitar —
trechos E peças de dreno — com motivo quando desligados, conferência).

**Não entrou (dito):** o par de tubos isolado desenhado como par no 2D/3D (E8/E10); a prumada da
linha entre pavimentos (condensadora na cobertura — backlog); o DN do dreno por vazão de condensado
(hoje hipótese fixa de 25 mm); o sifão do dreno como peça (fica no detalhe típico, E8.3).

**Prova.** `blueprintLinhaFrigorigena.test.ts` (7: faixas e hipóteses; a linha do split lançado pela
E4 — ≥3 trechos, Ø/isolamento da faixa, cota da linha e cotas das peças, caminho no grafo,
NENHUMA ponta aberta FRIGORIGENA/DRENO_AC, dreno a ponto novo na fachada por gravidade com todo
lance ≥ 1 %, verificação limpa; conferência LINHA/LIMITES/DIAMETROS/DRENO ok e gás/curvas; relançar
idempotente e aceitar fixa; descarte a 2,50 m → bomba e sem cobrança de declividade, dreno quase
plano sem bomba → DECLIVIDADE_BAIXA; 9.000 com condensadora a 30 m → LIMITES FALTA "acima do máximo
de 15 m"), `components/PainelLinhaFrigorigena.test.tsx` (2), editor "Mecânica › Split" estendido
(Linha e dreno: sem linha → Lançar → 1 linha(s), 1 dreno(s), Aceitar).

### Fecho da Etapa 5 — 05/10/2026

- Sem migration, **sem bump** (o roadmap previa bump para `Trecho.curva`; a E5.3 ficou derivada —
  ver a decisão acima). Os goldens não mudaram: a regra nova de `conexoes.ts` é derivação.
- **Suíte inteira**: 7635 testes = 7601 ✅ + 34 pulados de propósito + 0 falhas (fechando pelo JSON).
- `npm run build` caiu com **segfault do Node no `tsc`** (exit 139, a queda intermitente do Node 24
  já conhecida — nenhuma linha `error TS`); refeito em duas partes: `tsc --noEmit` isolado exit 0 e
  `vite build` exit 0. `check-ui-standard` nos 2 `.tsx` e `check-xss-sinks` exit 0.
- Fica para a prova no app real: lançar "Linha e dreno" depois do Split e ver a linha subindo da
  evaporadora, correndo pela parede e descendo na condensadora, e o dreno até o ponto ao lado dela.

### Etapa 6.1 + 6.2 + 6.3 — 05/10/2026 (frente `clima-e6`, **sem bump** — desvio do roadmap, dito abaixo)

**Decisão de desenho (sem bump).** O roadmap previa bump. Não foi preciso nada gravado novo: o
SISTEMA é a relação `condensadoraId` da E3 (evaporadoras e derivadores apontando uma
CONDENSADORA_VRF), o nome do sistema é o rótulo ou o número derivado da condensadora (CD-n), e os
diâmetros por trecho usam os campos da E3 (`bitolaMm` = líquido, `bitolaSuccaoMm`, `isolamentoMm`).
O modelo de derivador sai do somatório a jusante (derivado) e vai no `tipo` da peça.

**Três conflitos resolvidos antes (achados lendo o código):**
1. O relançar da E5 apagava TODA linha FRIGORIGENA sugerida do pavimento — levaria a árvore do VRF.
   Agora a árvore do VRF leva o rótulo `ROTULO_DA_LINHA_VRF` (molde do `ROTULO_DO_ALIMENTADOR`) e
   cada planejador só apaga o que é seu.
2. O relançar do Split (E4) apagava qualquer peça de climatização sugerida — inclusive ponto e bomba
   de dreno da E5 (defeito que já existia desde a E5) e os derivadores da E6. Agora só evaporadora,
   condensadora de split e o ponto de força.
3. A E5 só fazia o dreno de quem também ganhava linha: evaporadora de VRF ficaria sem dreno, e uma
   linha aceita sem dreno nunca ganharia um. Agora são planejados SEPARADOS: a linha só para split,
   o dreno para toda evaporadora com sistema (`LinhaPlanejada.linha` diz qual foi).

**`utils/blueprintVrf.ts`.**
- E6.1 `sistemasVrfDoNivel` (condensadora VRF → evaporadoras do pavimento, as de outro pavimento à
  parte, derivadores), `evaporadorasSemSistema`, `comandosLigarAoVrf`, `comandosTrocarCondensadora`
  (todo `condensadoraId` que apontava uma passa a apontar a outra — um lote).
- E6.2 `DIAMETROS_DO_VRF` por somatório a jusante (até 19,1k 6/13 · 54,6k 10/16 · 76,4k 10/19 ·
  112,6k 13/22 · 157k 13/29 · 238,8k 16/29 · 334k 19/35 · acima 22/41 mm) e `DERIVADORES_DO_VRF`
  (até 22,4 / 33 / 70 kW / acima) — **HIPÓTESE de catálogo, CONFERIR** (`FONTE_DO_VRF` no painel);
  `analisarVrf` lê a rede EXISTENTE (Dijkstra a partir do nó da condensadora com o trecho de
  chegada): alcançadas, somatório a jusante por trecho e por nó, nós de DERIVAÇÃO (≥ 2 trechos
  filhos usados), derivador presente em cada um, diâmetro pedido × encontrado, taxa de combinação
  (Σ ÷ condensadora; `null` sem capacidade), comprimento total, até a mais distante, após a 1ª
  derivação, desníveis absolutos (elevação + cota). Confere o traçado automático e o desenhado à mão.
- E6.3 `planejarVrf`: UMA árvore de Steiner pelas paredes (`arvorePelasParedes` com todas as
  evaporadoras como pendentes — as arestas já saem orientadas da raiz, e é isso que dá o "a
  jusante"); a raiz encaixa mesmo longe da parede (o raio cresce até a condensadora); sem parede, a
  rede sai em ESTRELA da condensadora (avisado). Sobe da condensadora, corre na cota da linha, um
  ramal de cada encaixe até a evaporadora, desce; cada trecho com o Ø e o isolamento do somatório a
  jusante; um DERIVADOR_VRF (condensadoraId = a VRF) em cada nó com ≥ 2 filhos. Sistema já ligado
  (rede confirmada) fica; rede PARCIAL confirmada é dita e não é sobreposta. Prova numa cópia.
- `conferenciaDoVrf`: SISTEMA, TAXA (50–130 %), ALCANCE, DERIVADORES, DIAMETROS, LIMITES (total
  300 m, mais distante 150 m, após a 1ª 40 m, desníveis 50/15 m — hipóteses em `HipotesesClimatizacao.vrf`,
  editáveis). Os comprimentos são de tubulação REAL; o "equivalente" do catálogo soma conexões (dito).
- `conexoes.ts`: o DERIVADOR_VRF no nó É a conexão — não se conta tê por cima dele (derivado; goldens
  intactos).

**Editor.** Tarefa `vrf` (botão "VRF" ao lado de "Linha e dreno"); `PainelVrf` (limites, tabela por
sistema com Σ/condensadora, taxa, comprimentos, derivações; "Ligar N sem sistema"; "Trocar
condensadora…"; Lançar/Relançar e Aceitar com motivo; conferência). O "Aceitar" da Linha e dreno
deixou de pegar os trechos do VRF.

**Não entrou (dito):** a prumada do VRF entre pavimentos (a evaporadora de outro pavimento é
acusada como AVISO); o comprimento EQUIVALENTE (conexões); a carga adicional de gás do VRF; o coletor
(header) como peça — na estrela sem parede sai um derivador só na saída.

**Prova.** `blueprintVrf.test.ts` (7: tabelas e hipóteses; sistema = relação da E3, ligar e TROCAR a
condensadora por comando; **árvore com 3 níveis de derivação** no corredor 20 × 4 m com 4 × 24.000
— derivadores em 4/8/12 m com "até 33 kW"/"até 22,4 kW"/"até 22,4 kW", Ø 13/22 → 10/19 → 10/16 →
10/16 ao longo da parede, nenhuma ponta aberta, nenhum tê por cima de derivador, taxa 100 %, total
22,29 m, mais distante 20,835 m, após a 1ª 12,485 m, conferência toda OK; relançar idempotente e
aceitar para; taxa 200 % / tronco afinado / limite de 10 m / derivador apagado → FALTA com o
motivo; estrela sem parede e condensadora sem evaporadora; convivência E5 × E6 — a E5 faz só os 4
drenos e o relançar de uma não apaga o da outra), `components/PainelVrf.test.tsx` (2), editor
"Mecânica › VRF" (Ligar 4 → Lança 1 árvore, 3 derivadores, 100 % → Lançar → todas alcançadas,
todas com derivador → Aceitar). Testes da E5 ajustados ao dreno separado da linha.

### Fecho da Etapa 6 — 05/10/2026

- Sem migration, **sem bump** (ver a decisão acima); goldens intactos.
- **Suíte inteira**: a primeira passada NÃO fechou (7425 + 35 de 7645, vitest exit 1 sem falha listada):
  o worker do `BlueprintEditor.test.tsx` caiu com 41 aprovados e 186 "pendentes" — a queda
  intermitente conhecida. O arquivo sozinho fechou **227/227**. Conta: 7645 = 7611 ✅ + 34 pulados de
  propósito + 0 falhas.
- Build em duas partes (o encadeado segfaulta no Node 24): `tsc --noEmit` exit 0; `vite build` caiu
  1× com segfault ainda no "transforming" (sem erro de código) e passou na repetição (exit 0).
  `check-ui-standard` nos 2 `.tsx` e `check-xss-sinks` exit 0.
- Fica para a prova no app real: inserir uma Condensadora VRF, "Ligar N sem sistema", lançar a rede
  e ver a árvore com os derivadores; conferir a taxa e os comprimentos.

### Etapa 7.1 — 05/10/2026 (frente `clima-e7`, **kernel 0.92.0 → 0.93.0**)

**Decisão de desenho (campo próprio, não `secaoCalha`).** O roadmap dizia "generalizar `secaoCalha`".
Lido o código: sete módulos do pluvial (orçamento `blueprintBudget.ts:946`, planilha, prancha,
memorial, executivo, calhas, verificação) tratam como CALHA qualquer trecho com `secaoCalha`, sem
olhar a disciplina — um duto retangular viraria "calha" no orçamento. Então: `Trecho.alturaDutoMm`
(só MECANICA; com ela `bitolaMm` é a LARGURA; ausente = redondo, como sempre) — o mesmo molde da
calha, sem tocar no pluvial.

**Kernel 0.93.0.** `Trecho.alturaDutoMm` (inteiro > 0, só MECANICA, não no duto flexível);
`Terminal.vazaoM3h` (vazão de ar declarada, `TIPOS_COM_VAZAO` — terminais de ar, exaustor,
evaporadora dutada, caixa de distribuição; trocar o tipo limpa); materiais CHAPA_GALVANIZADA,
PAINEL_PREISOLADO e DUTO_FLEXIVEL em `MATERIAIS_DA_DISCIPLINA.MECANICA` — **sem padrão de
disciplina**: `quantities.ts:1992` agrupa o quantitativo por `materialDoTrecho`, e dar padrão ao duto
mudaria a chave de quantitativo de todo duto já desenhado (o painel diz "Não declarado"; a perda de
carga assume chapa galvanizada como hipótese, sem gravar). Fichas dos três em `FICHA_DO_MATERIAL`
(rugosidade típica — HIPÓTESE). A evaporadora dutada passou a admitir também MECANICA (é ela que
sopra no duto; ficha com cota e DN mínimo na mecânica). Ritual do bump: com a string em 0.92.0 e o
código novo, goldens + climatização + duto + HVAC passaram (prova); bump; 23 pinos por glob; 6 hashes
só de versão; bundle `planta-api` em 0.93.0.

**Derivados do volume retangular.** Conflito (`conflitos.ts`): `contraPrisma` recebe o alcance em
PLANTA separado do vertical — meia ALTURA na faixa de cotas, meia LARGURA no raspão; rede × rede pelo
maior meio-lado (conservador). Corte: meia altura acima e abaixo do eixo. IFC:
`IFCRECTANGLEPROFILEDEF(largura, altura)` (o X local de `solidoAoLongo` é horizontal e perpendicular ao
eixo, então a largura fica deitada). 3D: `cilindroDoTrecho` devolve a base completa (largura
horizontal, eixo, altura) e o visualizador desenha uma caixa com `makeBasis` — o `setFromUnitVectors`
do cilindro deixaria o giro em torno do eixo ao acaso. Canvas: "600×300". Quantitativo: a altura entra
na chave por bitola e na saída só quando há (os desenhos antigos não mudam); orçamento: "Mecânica
600×300" e a linha de compra `…-dn600x300`. Painel do trecho: "Seção do duto" (redonda/retangular;
travada em redonda no flexível, dizendo por quê), "Diâmetro"/"Largura" + "Altura"; painel da peça:
"Vazão de ar (m³/h)" (vazio = derivada).

### Etapa 7.2 + 7.3 + 7.4 — 05/10/2026 (mesma frente, mesma 0.93.0)

**`utils/blueprintRedeDeAr.ts`.**
- E7.2 Física (ar a ~20 °C: ρ 1,2, ν 1,5·10⁻⁵, cp 1005): área, diâmetro hidráulico, velocidade, fator
  de Darcy por Swamee-Jain, perda por atrito, pressão dinâmica, rugosidade pelo material (sem material
  = chapa). `secaoProposta`: por VELOCIDADE (tronco quando o trecho serve mais de um terminal, ramal
  quando um só) ou por IGUAL ATRITO (a menor seção com perda/m ≤ a pedida); redonda pelos diâmetros
  comerciais da chapa, retangular com a altura padrão e largura de 50 em 50 mm.
- `vazoesDosTerminais`: DECLARADA, ou DERIVADA do ambiente — insuflamento = maior entre calor sensível
  ÷ (ρ·cp·ΔT) e a renovação, repartido entre os terminais de insuflamento; o retorno devolve o mesmo; a
  tomada de ar exterior traz a renovação; o exaustor, a exaustão do uso — ou SEM (pede declarar).
- `analisarRedesDeAr`: por RAIZ (dutada ou caixa de distribuição), BFS pelos trechos MECANICA: vazão e
  número de terminais a jusante por trecho, velocidade (alta = 25 % acima do limite), perda por
  atrito, localizadas pelas conexões derivadas (curva: K da curva; tê/junção/cruzeta: K do tê, na
  velocidade do trecho que sai do nó), perda de cada caminho + a do terminal, o CAMINHO CRÍTICO ×
  pressão disponível e o BALANCEAMENTO (quanto o damper de cada terminal absorve — o "vai além").
  `comandosDeDimensionamento`: leva cada trecho à seção proposta (um lote).
- E7.3 `ventilacaoDoNivel` (uso pelo nome, como a E0): banheiro/lavabo, cozinha e garagem SEM janela
  exigem exaustor (90 m³/h, 180 m³/h, 6 trocas/h — hipóteses); climatizado sem janela nem tomada de ar
  exterior = aviso de renovação (Fp 2,5 L/s·pessoa + Fa 0,3 L/s·m² — CONFERIR NBR 16401-3).
- E7.4 `planejarRedeDeAr`: a ESPINHA no forro (molde da espinha dos sprinklers): o tronco passa pela
  raiz na direção em que os terminais mais se espalham, um ramal perpendicular por terminal
  (encadeados quando dois caem na mesma linha), descidas nos nós exatos das peças; cota = fundo da
  viga mais baixa (ou teto) − folga − meia altura; cada trecho com a seção da vazão a jusante; rótulo
  `ROTULO_DA_REDE_DE_AR` (relançar só apaga o seu); terminais já alcançados por rede confirmada
  ficam; os soltos vão para a raiz mais perto. As conexões (curva, tê, cruzeta) são as DERIVADAS.
- `conferenciaDaRedeDeAr`: EXAUSTAO, RENOVACAO, REDE, VAZAO, VELOCIDADE, PRESSAO.
- Hipóteses em `HipotesesClimatizacao.ar` (método, seção, velocidades, igual atrito, altura padrão,
  folga sob viga, ΔT, pressão disponível, perda no terminal, K da curva e do tê, renovação, exaustão)
  com limites e leitor — toda folga editável no painel.

**Editor.** Tarefa `redeDeAr` (botão "Dutos" ao lado de "VRF"); `PainelRedeDeAr` (hipóteses, cada rede
com vazão total, perda crítica × disponível e o damper de cada terminal, ventilação por ambiente,
Lançar/Relançar, "Ajustar seções (N)", Aceitar — cada um com o motivo quando desligado — e a
conferência).

**Não entrou (dito):** exaustão com duto até a fachada (o exaustor é conferido no ambiente, a rede
dele não é traçada); desvio de pilar no forro (o conflito acusa); a perda dos acessórios além de curva
e tê (damper, plenum); o duto flexível de ligação do difusor como peça; a área de chapa (m²/kg) — E9.

**Prova.** `blueprintDutoRetangular.test.ts` (6: invariantes da altura e do material; troca redondo ⇄
retangular e canônico; vazão só nos tipos de ar, troca de tipo limpa, dutada aceita; **pilar a 27 cm
de lado: o 600×300 pega, o Ø457 de mesma área não**; **viga 20 cm acima do eixo: o 600×300 passa por
baixo, o Ø457 bate** — o falso conflito do cilindro; quantitativo separa 600×300 / 600×400 / Ø600 e o
redondo não ganha a chave), `blueprintRedeDeAr.test.ts` (9: **prova independente de um ramal** —
Darcy + Swamee-Jain calculados em Python fora do código: 500 m³/h em Ø200 por 10 m = 13,415 Pa e
1.200 m³/h em 400×250 = 4,653 Pa; velocidade 1.000 m³/h → 200×250 no tronco / 300×250 no ramal, Ø250
redondo; igual atrito; hipóteses; espinha numa sala 10 × 6 m com 4 difusores — seção 250×250 →
150×250 ao longo do tronco, nenhuma ponta aberta, balanceamento com excesso zero no crítico, pressão
de 5 Pa = FALTA; relançar idempotente e aceitar para; um trecho afinado volta à proposta; vazão
derivada da Sala ÷ 4; **banheiro sem janela sem exaustor = FALTA**, com exaustor ou janela OK; sem
rede, REDE não avaliado), `components/PainelRedeDeAr.test.tsx` (2), `PainelTrechoClimatizacao` +2
(seção do duto, vazão), editor "Mecânica › Dutos" (Lança 1 rede, 4 terminais, 1.200 m³/h → Lançar →
a rede aparece, 4 com vazão, Aceitar).

**Ambiente (dito, não escondido):** nesta etapa o `tsc` passou a cair com segfault em ponto aleatório
(até no `main` limpo, até com `--jitless`, `--single-threaded` e em worker thread) — instabilidade do
Node 24.12 nesta máquina, não do código. Contorno: a checagem de tipos pela API do TypeScript
arquivo por arquivo (opções + globais + sintáticos + semânticos, o mesmo conjunto do `tsc --noEmit`),
repetida até uma rodada completar; o script ficou no scratchpad da sessão.

### Fecho da Etapa 7 — 07/10/2026

- Sem migration; **kernel 0.93.0** (um bump para as quatro fases).
- **Suíte inteira**: 7665 testes = 7630 ✅ + 34 pulados de propósito + 1 falha de EXPECTATIVA antiga
  (o teste da E3 dizia que toda evaporadora liga só na linha frigorígena; a dutada passou a ligar
  também no duto, de propósito) — corrigida e o arquivo reprovado verde (11/11). A conta fechou pelo
  JSON.
- Tipos: 0 erros pela checagem arquivo por arquivo (ver "Ambiente" acima — o `tsc` nativo segfaulta
  nesta máquina até no `main` limpo). `check-ui-standard` nos 4 `.tsx` tocados e `check-xss-sinks`
  exit 0. `vite build` exit 0 de primeira.
- Fica para a prova no app real: inserir uma evaporadora dutada e difusores, abrir "Dutos", lançar a
  espinha, ver os dutos retangulares no 3D (largura deitada) e o rótulo LxA na planta, e um banheiro
  sem janela acusado.

### Etapa 8 — Documentação · 07/10/2026 (frente `clima-e8`, base 16f0c72d)

**8.1 Prancha.** `utils/blueprintPranchaClimatizacao.ts`: uma planta por pavimento que TEM linha, dreno,
duto ou peça (`temClimatizacaoNoPavimento`) — linha, dreno e duto na mesma folha, cada um com a cor da
disciplina; o duto (e o tubo grosso) bifilar na largura real a partir de 0,8 mm de papel; rótulo por
disciplina (`Ø líquido/sucção` na linha — mm inteiros, a convenção da E5: 6 = 1/4", 13 = 1/2" —,
`DN` no dreno, `L×A` ou `Ø` no duto); prumada como círculo, com rótulo quando passa de 1 m; cada peça
com o símbolo de prancha da E3, o NÚMERO do desenho inteiro (EV-1, CD-2, DF-3 — não renumera por
pavimento) e a TAG da capacidade (BTU/h) ou da vazão (m³/h) quando declaradas. Folha de legenda com o
quadro-resumo por pavimento (evaporadoras, condensadoras, capacidade instalada DECLARADA — "capacidade
não declarada" em vermelho quando falta) e os símbolos que existem, com a quantidade.
`TipoDePrancha` + `CLIMATIZACAO`/`LEGENDA_CLIMATIZACAO`/`DETALHES_CLIMATIZACAO`,
`InclusaoNoConjunto.climatizacao` (ausente = falso, templates salvos não mudam), prancha avulsa
"Climatização" na aba Versões (planta + folha de legenda, PDF e PNG), camadas DXF `PLANTA-CLIMA-LINHA`,
`-DRENO`, `-DUTO` e `-TEXTO` (a camada sai da cor do traço; o preenchimento branco dos símbolos não vai
para o CAD) e a linha de cobertura do DXF. Com climatização no conjunto, o corte sai com as
instalações (o duto retangular da E7 já era cortado na meia-altura).

**Achado do harness, corrigido:** o split nasce com evaporadora e condensadora coladas, uma de cada lado
da parede — as duas tags saíam uma por cima da outra. As etiquetas agora fogem umas das outras, dos
símbolos e do nome/área do ambiente (`posicaoLivre`: seis candidatos em volta da peça, quatro em volta
do meio do trecho; sem lugar livre, desce até sair). Teste de regressão que falha sem o desvio.

**8.2 Isométrico e detalhes.** `utils/blueprintDetalhesClimatizacao.ts`: `isometricoDeClimatizacao` —
a rede INTEIRA, todos os pavimentos, pela mesma projeção e desenho do incêndio (`RedeDaPrancha` +
`CLIMATIZACAO`; o segmento ganhou `rotulo` opcional para L×A e Ø líquido/sucção; o resto continua
`øN`); detalhes típicos SÓ do que existe (instalação da evaporadora, suporte da condensadora com a maior
capacidade do desenho, dreno com sifão, ligação do difusor com plenum), todos "sem escala — medidas:
CONFERIR com o fabricante".

**8.3 Memoriais.** O memorial de cálculo ganha, com o desenho, as seções 5–8 que existirem:
equipamentos e terminais (número, peça, pavimento, capacidade, vazão, cota), linha e dreno (faixa como
HIPÓTESE, comprimento/desnível contra o máximo, Ø encontrado × pedido, isolamento, gás adicional,
curvas, declividade do dreno trecho a trecho), VRF (taxa, comprimentos, desníveis contra os limites) e
rede de ar (vazão, perda crítica × pressão disponível, seção/velocidade/atrito por trecho, renovação e
exaustão) — cada uma com a MESMA conferência da gaveta. O descritivo ganha "Instalações" em prosa. Os
memoriais saíram da gaveta de carga térmica para **Mecânica › Documentos** ("Memoriais e ART").
**PDF sem "?":** o `⚠` do CONFERIR virava "?" — agora "(!)"; e o teste que varre o texto achou mais
um: a condutividade **λ** da memória da carga virava "?" — agora "lambda".

**8.4 Emissão com ART.** `utils/blueprintClimatizacaoExecutivo.ts` no molde do incêndio: responsável e
ART/RRT; as verificações saem das conferências das gavetas (carga, equipamento × carga — sem o item do
catálogo, que é da organização —, linha e dreno, VRF, rede de ar): FALTA não atende, AVISO atende com o
aviso escrito, NÃO AVALIADO não entra; sem ambiente climatizado não emite. **Hash da base = desenho +
premissas + materiais da biblioteca + cidade do contexto** (o que a carga lê de fora do desenho).
Capa (responsável, base, verificações, declaração com CONFERIR NA NORMA ou HIPÓTESE) + os dois
memoriais; ida e volta em texto sem perda. Migration `aplicar_20271007000010_blueprint_climatizacao_executivo.sql`
(CHECK + `CLIMATIZACAO`, idempotente, só alarga) **aplicada com o OK do usuário** e conferida no banco
(`pg_get_constraintdef` com as cinco disciplinas). `DisciplinaExecutiva` e a linha do tipo alargadas.

**Prova.** `blueprintPranchaClimatizacao.test.ts` (12: conjunto só com pavimentos que têm
climatização e sem folha vazia; rótulos das três redes; cada folha com o seu pavimento, os números do
desenho inteiro e as tags; avulsa; etiquetas que não se cobrem; quadro-resumo com e sem capacidade;
legenda só do que existe; desenho vazio; isométrico com todos os pavimentos e a elevação somada;
detalhes só do que existe; folha de detalhes; DXF com as quatro camadas só quando pedido),
`blueprintMemorialClimatizacao.test.ts` (+3: seções 5–6 com a cadeia E4→E5, descritivo com e sem
instalação, nenhum caractere vira "?" no WinAnsi), `blueprintClimatizacaoExecutivo.test.ts` (5: sem
responsável não emite; grupos das gavetas; desenho vazio; linha apagada = FALTA trava; AVISO atende;
hash muda com desenho, premissa, material e cidade; capa + memoriais com ida e volta e sem "?"), editor
"Mecânica › Memoriais e ART" (memorial e emissão travada com o motivo no botão). **Harness**
`docs/spikes/prancha-climatizacao/` no Edge: o desenho montado pela CADEIA (carga → split E4 → linha e
dreno E5; dutada + 4 difusores → espinha E7), as 4 folhas sem erro de página. **PDF lido**
(`pdftotext`): o conjunto e os dois memoriais com Ø, ×, ³, · e "(!)" certos — os únicos "?" são
interrogações do próprio texto. DXF: entidades nas quatro camadas.

**Não entrou (dito):** as cotas da arquitetura passam por cima da condensadora que fica fora da
parede (a cadeia de cotas é da planta; vale também para o incêndio); no isométrico, peças muito
próximas ainda podem ter os rótulos encostados (o desenho é o compartilhado com hidro/incêndio — mexer
nele muda as pranchas deles); a prova da emissão no app real (emitir num estudo descartável e ver uma
premissa invalidar) fica para o passeio com login, junto das E5–E7.

### Etapa 9 — Quantitativo e orçamento · 07/10/2026 (frente `clima-e9`, base dccccd12, **quant-1.25.0**)

**9.1 Quantitativo.** `QuantidadeTrecho`/`QuantidadePorBitola` ganharam `bitolaSuccaoMm` e
`isolamentoMm` (omitidos quando o trecho não declara — a saída dos desenhos de sempre não muda; entram
na chave do grupo): a linha Ø6/10 isol. 9 e a Ø6/13 isol. 13 deixaram de somar numa linha.
`especificacaoDoTerminal` ganhou capacidade ("12.000 BTU/h" — milhar sem `Intl`, o quantitativo é
cache por versão), vazão ("300 m³/h") e, só no terminal de ar, a medida declarada ("600×600 mm"): a
evaporadora de 9.000 e a de 12.000 deixaram de ser uma linha. `medidaDaBitola` no kernel (L×A, Ø
líquido/sucção, DN; o isolamento no fim) — a MESMA para a tela, a planilha e o orçamento. Pinos da
versão: 15 testes trocados por script sobre o glob (`'quant-1.24.0'` → `'quant-1.25.0'`, 15
ocorrências em 15 arquivos); pacote da planta-api regerado (`plantaApi.test.ts` compara a saída).

**Defeitos achados e corrigidos no caminho:** a tela de quantitativos e a aba Totais diziam "Mecânica
DN 600" para o duto 600×300; dois dutos 600×300 e 600×400 com o mesmo código tinham o MESMO id de
lançamento (o `alturaDutoMm` não entrava na chave do tubo) e a mesma chave React; a chave do ponto na
tela não tinha a especificação (extintores e evaporadoras repetiam chave).

**O que a compra acrescenta** (`utils/blueprintMateriaisClimatizacao.ts`, fora do kernel): o cobre por
diâmetro em polegada (cada trecho da linha são DOIS tubos — líquido e sucção), o isolamento por
diâmetro × espessura (um por tubo; no duto, manta em m²), a chapa do duto rígido em m² (perímetro ×
comprimento + a perda) e em kg (espessura pela maior dimensão — tabela típica #26…#18, HIPÓTESE), o
cabo de interligação (o caminho da linha + a sobra; no VRF, a árvore + a sobra por evaporadora), a
carga adicional de gás do split (a faixa da E5), os suportes pelo espaçamento. As folgas são premissas
do estudo, editáveis: `HipotesesClimatizacao.materiais` (espaçamento dos suportes da linha/dreno/duto,
sobra do cabo, perda da chapa — com faixa e padrão). O que não dá para comprar fica nos AVISOS:
evaporadora sem capacidade, linha sem isolamento, sistema sem linha, a curva do cobre (tubo curvado,
não joelho — sem peça), o gás do VRF (do fabricante).

**9.2 Orçamento.** `FRIGORIGENA`, `DRENO_AC` e `MECANICA` em `REDES_HIDROSSANITARIAS` (grupo "de
climatização"; o duto vai para "— dutos"); a chave do tubo ganha a seção SÓ quando existe
(`…:6s10i9:…`, `…:600x300:…`) — o id do tubo de sempre é o mesmo de antes (teste). Medidas novas no
de-para: `COMPRIMENTO_TUBO_FRIGORIGENA` (pelo par e o isolamento), `COMPRIMENTO_TUBO_DRENO_AC`,
`AREA_CHAPA_DUTO` (m², perímetro × comprimento, sem perda — a perda é da lista) e
`CONTAGEM_EQUIPAMENTOS_CLIMATIZACAO` (tipo × especificação). A evaporadora/condensadora/dreno saíram de
"Pontos hidráulicos"; a dutada e o exaustor saíram de "Terminais de ar" (têm a medida dos
equipamentos); o terminal de ar diz a vazão e a medida (no `ref` só quando existe). Composição por
peça: as três redes na tela de composições — o kit do split pela especificação ("12.000 BTU/h") ou
genérico.

**9.3 Lista de materiais.** Folha `MATERIAIS_CLIMATIZACAO` no conjunto (depois do isométrico e
detalhes; total, por sistema e por pavimento, as premissas padrão ditas quando o estudo não as envia),
aba "Climatização — materiais" no XLSX (com a coluna "Como saiu" e os avisos) e o painel na gaveta
Mecânica › Documentos (premissas editáveis + a mesma lista). As premissas do estudo chegam à exportação
pela aba Versões.

**Prova.** `blueprintQuantitativoClimatizacao.test.ts` (6: versão; separação pelo par e isolamento; o
tubo de água sem campo novo; a medida de compra; evaporadora por capacidade e difusor por vazão e
medida, extintor intacto; linhas "de climatização" por peça/tubo/duto com o id do tubo de água igual ao
de antes e dois dutos com dois ids; as quatro medidas novas medindo — chapa 7,2 + 4 m²; evaporadora fora
dos pontos hidráulicos, dutada fora dos terminais de ar), `blueprintListaDeMateriaisClimatizacao.test.ts`
(7, sobre a cadeia E4→E5: cobre = 2 × linha; isolamento por tubo; chapa 7,92 m² e 40,4 kg #24; manta
7,2 m²; perda zero = área nua; cabo = caminho + sobra; suportes 2 → 4 com espaçamento 1 m; avisos;
premissas da coluna; **o XLSX lido de volta** com a aba, o cobre, a chapa, o sistema e o Totais dizendo
"Mecânica 600×300"), `blueprintPreviaComposicaoClimatizacao.test.ts` (2, **pelo serviço com o catálogo
que só responde ao pedido**: o kit de 12.000 pega só as duas de 12.000 — EVAP12 2, cabo 10 m —, a
condensadora pela genérica — 2 e 4 mãos-francesas —, a linha pelo código 5 m, zero divergências),
`PainelMateriaisClimatizacao` (2), `PainelComposicoesDePeca` (+1: o kit do split na linha frigorígena),
editor "Mecânica › Memoriais e ART" (a lista com "Evaporadora hi-wall — 12.000 BTU/h"), a ordem do
conjunto da E8 com a folha nova.

**Não entrou (dito):** o gás do VRF; o cabo pelo traçado elétrico real (o cabo segue a linha); o
quantitativo por pavimento da tela de quantitativos sem colunas próprias de climatização (a lista de
materiais tem o recorte por pavimento e por sistema); peso do painel pré-isolado (só m²).

### Etapa 9b — o que a E9 deixou fora · 07/10/2026 (frente `clima-e9b`, base 8c52adc1, sem bump)

Pedido do usuário depois da E9: "implementar: gás do VRF, o cabo pelo traçado elétrico real e o peso do
painel pré-isolado".

- **Gás do VRF:** Σ comprimento de cada trecho da árvore × o fator do Ø de LÍQUIDO dele
  (`FATOR_DE_GAS_DO_VRF_KG_POR_M`: 0,022 kg/m em 1/4" … 0,37 kg/m em 7/8"; acima da tabela, o último),
  sem desconto de pré-carga — a fórmula típica de fabricante para R-410A, transcrita de memória:
  HIPÓTESE, CONFERIR no manual. Linha própria na lista ("Carga adicional de gás refrigerante (VRF)") e
  no sistema; o aviso "não estimada" saiu.
- **Cabo pelo traçado elétrico real:** `caboPeloEletroduto` — o menor caminho pelos ELETRODUTOS
  desenhados, do ponto de força da evaporadora (o `AR_CONDICIONADO` da E4.3) até a condensadora; as
  pontas fora do eletroduto (até o alcance declarado) entram no comprimento. **Achado no teste:** com a
  condensadora a ~0,6 m do ponto de força, as duas pontas virtuais caíam no MESMO nó e o "caminho pelo
  eletroduto" não usava eletroduto nenhum — o grafo passou a ter duas camadas e só se chega ao lado da
  condensadora percorrendo um trecho real. Sem eletroduto que ligue as duas peças, o cabo segue a linha
  frigorígena e a lista diz (aviso + coluna "Cabo medido por" na aba). VRF: o cabo de comunicação
  continua seguindo a árvore (vai de evaporadora em evaporadora).
- **Peso do painel pré-isolado:** kg = m² com a perda × o peso por m² declarado (padrão 1,4 kg/m² — o
  painel de 20 mm com alumínio nas duas faces, HIPÓTESE).
- Premissas novas em `HipotesesClimatizacao.materiais` (com faixa e padrão, editáveis no painel):
  `raioDoEletrodutoM` (1 m) e `pesoDoPainelKgM2` (1,4).

**Prova** (`blueprintListaDeMateriaisClimatizacao.test.ts`, +3): VRF de 5 m em Ø3/8" + 3 m em Ø1/4" =
0,361 kg; o split da cadeia E4→E5 sem eletroduto → cabo pela linha com aviso; com um eletroduto com
desvio do ponto de força à condensadora → o comprimento exato do desvio + a sobra, origem
"eletroduto"; o eletroduto que para a 1,5 m da condensadora não liga com alcance de 0,3 m e liga com 2 m
(os 1,5 m entram); painel 600×300 de 4 m = 7,92 m² × 1,4 kg/m², sem linha de aço.

### Passeio no app real, E5–E9 · 07/10/2026 (produção `b11c1ca`, estudo descartável)

Login do agente-leitura (senha dada pelo usuário na sessão, não guardada), estudo novo na Alpa,
catálogo de splits só na LEITURA (GET interceptado, nada gravado no catálogo da organização). 18/18
passos, 0 erro de página, 0 resposta HTTP de erro: paredes em retângulo → Sala → TBS 34/TBU 25 → carga
(11.090 W · 37.841 BTU/h) → split lançado ("atende") e aceito (3 peças) → **E5** linha e dreno lançados
(1 linha 3,2 m / 50 m, Ø 10·19 isol. 13, gás dentro da pré-carga, 2 curvas com raio ≥ 80 mm, 1 dreno) →
**E6/E7** gavetas VRF e Dutos abrem e conferem → **E8** memoriais na gaveta Documentos → **E9** lista de
materiais (cobre, cabo, suportes) → **E8.4 emissão com ART gravada** ("Emitido — ART nº PROVA-E8-0001 …
Vale para o desenho e as premissas atuais") → **TBS mudada para 35 → a emissão deixa de valer**.
Limpeza no banco: estudo, ramo (snapshots em cascata), a emissão de prova e as premissas apagados e
conferidos (0); fica 1 linha em `blueprint_audit_events` — imutável por gatilho, por projeto.

**Achado e corrigido (frente `clima-secoes`):** os títulos das seções dos memoriais de climatização
traziam o número no texto ("1. Condições de projeto") e o painel lista em `<ol>` — saía "1. 1." na tela.
Os memoriais de hidro, elétrica e incêndio guardam o título sem número; a climatização passou a fazer o
mesmo (teste de regressão: nenhum título começa com dígito).

### Etapa 10.1 — IFC da climatização · 07/10/2026 (frente `clima-e10-ifc`, sem bump do kernel)

Pedido do usuário: "apos 1 e 2, implementar E10" (a 10.1 é a primeira das quatro fases, cada uma
publicada à parte).

**Exportar.**
- **Achado: a cobertura do IFC mentia de novo** (o mesmo padrão do achado 9): dizia "NÃO CONTÉM linha
  frigorígena, dreno, duto retangular, conexões de duto, terminal de ar classificado" — falso desde a
  E3/E7 — e listava os sistemas sem a linha e o dreno. Reescrita no mesmo commit que mudou a emissão, com
  os dois testes que a fixavam (`blueprintClimatizacaoTrilhos`, `blueprintTrocaDeArquivos`).
- **Achado: o joelho/tê do DUTO saía `IfcPipeFitting` com bolsa redonda** de 1,3 × a LARGURA (um Ø780
  num 600×300). Agora `IfcDuctFitting` (mesmos enums) com bolsa retangular (o ramal derivado ganhou
  `alturaDutoMm` — derivado, fora do canônico, sem bump) e o nome com a seção.
- **A curva da linha frigorígena não sai como peça** (cobre curvado, E5.3) — antes saía `IfcPipeFitting
  .BEND.`.
- **O par da linha:** um `IfcPipeSegment` com DOIS sólidos lado a lado (líquido e sucção), simétricos em
  torno do eixo (`parDaLinha`); **o sólido é o ENVELOPE com o isolamento** declarado (linha, dreno e
  duto) — é o que ocupa lugar na coordenação; os diâmetros reais vão no Pset.
- **`Pset_OpuraClimatizacao`** (molde do incêndio): na peça, `Numero_Derivado`,
  `CapacidadeBtuH_Declarada`, `VazaoM3h_Declarada`, `Condensadora_Declarada` (o NÚMERO da condensadora
  do sistema — é por ele que a importação religa); no trecho, `BitolaSuccaoMm_Declarada`,
  `IsolamentoMm_Declarado`, `AlturaDutoMm_Declarada`; e `_Calculada` (carga do ambiente e atende da
  evaporadora, vazão derivada do terminal de ar) quando o arquivo é gerado com as premissas do estudo
  (`resultadosDeClimatizacaoParaIfc` no serviço — o cálculo não mora no gerador).
- Pacote da planta-api regerado.

**Importar** (molde do incêndio E9.3): o leitor paramétrico passou a saber os SISTEMAS de cada elemento
(não só o de incêndio), a ler vários tipos de tubo, os Psets também dos tubos, a SEÇÃO RETANGULAR pela
malha (extremos no X e no Y locais) e a fundir o PAR paralelo da linha no eixo do trecho.
`lerClimatizacaoParametrica` lê equipamentos, terminais de ar, exaustor, damper, bomba e ponto de dreno,
caixa/plenum e derivador do VRF — o tubo só nos sistemas de refrigeração e drenagem (o esgoto é
`.SEWAGE.`); a conexão derivada não é lida (o desenho a refaz). `traduzirClimatizacao`: o tipo pelo
ObjectType, senão pela classe e o enum — e o que a norma não distingue (`.SPLITSYSTEM.` é evaporadora ou
condensadora?) é RECUSADO com o motivo; a reserva de lugar antiga também, dita como tal. A
**religação do sistema** é no MESMO lote (um Ctrl+Z): os comandos são aplicados numa cópia — os ids do
lote são determinísticos, o truque da E4 — e o `SetTerminalProps` da condensadora entra no fim
(`religarSistemasImportados`); condensadora fora do arquivo vira recusa antes de importar. No painel de
importação, a climatização é lida protegida (falhar não trava o resto) e conta na pegada.

**Prova** (`ifcImportarClimatizacao.test.ts`, 9): o joelho de duto `IfcDuctFitting` .BEND. com bolsa
440×275; o derivador é o ÚNICO `IfcPipeFitting` (a curva da linha não sai); envelope 450×300 do duto
isolado e os dois círculos de 12 e 14 mm; o Pset com o declarado, o número e — com premissas — o
calculado; **web-ifc** lendo Name/ObjectType/PredefinedType no campo certo de cada classe (o árbitro
destas, já que nenhum IFC de MEP está ao alcance — a lista `SEM_REFERENCIA` do portão de contagem fala
disso) em IFC4 e IFC4X3; **ida e volta** em IFC4 e IFC4X3 — as MESMAS peças (tipo, posição, cota,
capacidade, vazão, disciplina), os 5 tubos (Ø6/10 isol. 9, 400×250 isol. 25, dreno com a declividade),
o par de volta ao eixo (± 1 mm), água/esgoto/incêndio de fora, a reserva recusada; os comandos religam
evaporadora → condensadora e derivador → VRF no mesmo lote; a condensadora que não veio = aviso; e o
arquivo de outro programa (classe + enum). `PainelImportarIfc` +1 (a falha da leitura vira recusa).
37 arquivos de IFC/exportação verdes.

**Não entrou (dito):** a bolsa do joelho de duto no 3D DA TELA ainda é redonda (é o viewer — vai na
10.3); `.VENTILATION.` para rede só de exaustão; o `IfcCovering` do isolamento (o envelope cumpre a
coordenação).

### Etapa 10.2 — Compatibilização da climatização · 07/10/2026 (frente `clima-e10-clash`, sem bump)

- **O ENVELOPE no conflito** (`envelopeDoTrecho`, o mesmo do IFC da 10.1): o isolamento declarado soma
  em planta e na vertical; a LINHA FRIGORÍGENA são dois tubos lado a lado — Ø6/10 isol. 9 ocupa 33 mm
  de cada lado em planta e 14 mm na vertical (antes contava só o tubo de líquido, 3 mm: um pilar a 25 mm
  do eixo passava).
- **Achado: o falso conflito linha × dreno na evaporadora** (apontado no mapa da E10): os dois nascem
  no MESMO nó, e a distância entre eixos lá é zero — todo split acusava. Agora, quando dois trechos de
  disciplinas diferentes têm uma ponta comum, a distância é medida a partir de onde eles se SEPARAM
  (cada um aparado do alcance + 50 mm a partir do nó) — e o encontro real mais adiante continua
  aparecendo (teste: nascem juntos e se cruzam de novo a 2 m → REDE).
- **Classe nova `EQUIPAMENTO`**: o trecho que atravessa a CAIXA de uma peça de climatização a que ele
  NÃO se liga (a ponta dentro da caixa + 50 mm = é a ligação dela). As medidas vêm de quem chama
  (`volumesDasPecasDeClimatizacao` — a ficha mora fora do kernel); sem elas, o motor faz o de sempre.
  Lista de conflitos, BCF e frase do "nenhum conflito" conhecem a classe nova; o aceite usa a mesma
  chave de par de uids.
- **A marca no desenho também para o DUTO**: o "cruza viga" do duto só aparecia no relatório.
- Linha × estrutura e dreno × viga já eram verificados (todo trecho contra a estrutura); agora com o
  envelope.

**Prova** (`blueprintConflitosClimatizacao.test.ts`, 6): o envelope; o pilar a 25 mm (sem par passa,
com par pega); **a cena** — 4 não-conflitos (linha e dreno nascendo na evaporadora, duto terminando no
difusor, duto 30 cm abaixo da viga, linha nascendo na condensadora) e 4 conflitos (linha atravessando a
condensadora do vizinho → EQUIPAMENTO; dreno atravessando a viga → ESTRUTURA; duto cruzando a linha →
REDE; linha e dreno que nascem juntos e voltam a se cruzar → REDE), exatamente 1/1/2; sem as caixas,
o resto idêntico; a marca do duto. 24 arquivos de conflito/BCF/verificação verdes.

### Etapa 10.3 — Editor no 3D · 08/10/2026 (frente `clima-e10-3d`, sem bump)

Transversal: vale para todas as disciplinas, não só para a climatização.

- **Seleção múltipla no 3D**: Shift, Ctrl ou ⌘ somam à seleção, e o segundo clique tira a peça
  (`selecaoDoClique`, a mesma regra do 2D). A seleção é a MESMA do canvas: as quatro famílias que
  tinham `onClick` próprio passaram pelo mesmo clique.
- **Mover no 3D**: uma alça (`PivotControls` do drei) aparece no centro em planta da seleção, a meio
  pé-direito, só com as setas X e Z (sem rotação, sem escala, sem subir). Durante o arraste, uma prévia
  translúcida da seleção acompanha. Ao soltar, o deslocamento vira mm no plano da planta
  (`deltaDoMundoParaModelo`: X do 3D = x, Z do 3D = y, sem troca de sinal; passo de 10 mm). Ele vira o
  MESMO `TranslateEntities` do mover do 2D (`comandoDeMover`): é um passo de Ctrl+Z, e respeita o modo de
  junção da barra. Parede, terminal, componente, núcleo, vaga e bloco se movem juntos.
- **Caixa de corte**: um botão na barra do 3D, e seis planos com controle deslizante por eixo. O corte é
  LOCAL por material (`Recortado`), não global. Assim o contorno da caixa e a alça não são recortados, e
  a sombra continua certa. A caixa nasce do enquadramento com folga; "Centralizar" não mexe nela.
- **Planta + 3D lado a lado**: um botão no grupo Vistas, só na planta (e nas vistas dependentes, que são a
  planta). Numa elevação o botão desliga, e o rótulo diz por quê. O 3D ao lado é a MESMA cena da aba 3D
  (`renderCena3d`), com a mesma seleção. O canvas da planta não remonta ao ligar (zoom e ferramenta
  ficam). A escolha é persistida (`blueprint:vista3dLadoALado`).
- **A bolsa do joelho de duto no 3D da tela** (o que tinha ficado da 10.1): agora é RETANGULAR, 1,1× a
  seção (440×275 para o duto 400×250), com a base do duto daquele lado. O duto não tem corpo esférico no
  nó. A curva da linha frigorígena não é peça, pelo mesmo predicado do IFC (`conexaoViraPeca`, agora no
  kernel e usado pelos dois). O tê dela continua.

**Prova:**

- `blueprint3dEditor.test.ts` (10 testes):
  - a seleção por modificador;
  - o sinal do arraste conferido contra o eixo de um trecho a +y;
  - os seis planos da caixa;
  - o mover de parede + terminal + componente em UM comando, e o desfazer que devolve o desenho;
  - a alça a meio pé-direito;
  - sem comando para deslocamento zero;
  - as bolsas retangulares;
  - a curva frigorígena fora.
- `BlueprintEditor.test.tsx` (+1 teste): o lado a lado entra ao lado do canvas (o MESMO nó); o botão
  desliga na elevação; a escolha é persistida.
- **Harness do 3D** (`docs/spikes/blueprint-3d/passeio.mjs`, modo novo `?editar=1` com o `ModelHistory`
  do kernel):
  - **caixa de corte**: 4,1 % de geometria sem a caixa, 4,0 % com ela recém-ligada, 1,8 % com o plano
    leste–oeste no meio;
  - **mover**: o passeio acha a seta X da alça pelos pixels, arrasta ao longo dela, e a parede vai de
    0,0 a 4760,0 (só em x); o **Ctrl+Z** a devolve a 0,0.

**Não entrou (dito):**

- O portão antigo `cena=estrutura` do mesmo passeio dá 2,33 % (o mínimo é 3 %). O valor é **idêntico
  sem as mudanças desta frente** (medido no base a2175a43): é anterior, fica registrado e não é
  corrigido aqui.
- O mover no 3D não sobe nem desce a peça (a cota). Ela continua editada no painel.

### Etapa 10.4a — Alinhar e arranjo da instalação · 08/10/2026 (frente `clima-e10-ref`, sem bump)

A 10.4 sai em três publicações: **(a)** alinhar/arranjo, **(b)** IFC externo como referência no 3D e
**(c)** DXF como fundo vetorial. Esta é a (a).

- **Distribuir** (novo, `comandosDeDistribuicao`):
  - deixa espaçamento IGUAL entre os centros, ao longo do eixo de maior espalhamento (ou do eixo dado);
  - a primeira e a última peça ficam, e as do meio andam SÓ naquele eixo;
  - o centro de cada peça é o meio do eixo (parede, divisa, viga, trecho), o centro do contorno (pilar)
    ou o ponto (terminal, quadro, componente);
  - pede 3 peças ou mais e diz por quê.
  - Botão no grupo de edição, ao lado de Alinhar; um lote = um Ctrl+Z.
- **Alinhar** passa a mover o **trecho** (paralelo, pelo meio, como a parede) e o **componente** (pelo
  centro, como o terminal). Antes, os dois ficavam de fora ("não entram no alinhamento"). A referência
  também pode ser um **trecho**: alinhar as evaporadoras ao duto.
- **Matriz** passa a copiar **pontos, trechos e quadros**, porque o `DuplicateEntities` os copia desde a
  E1.3 do elétrico. O **componente** fica de fora, com aviso (o comando ainda não o copia, e incluí-lo
  pede bump).
- Alinhar e distribuir usam a mesma partição por deslocamento (`GruposDeDeslocamento`: peças que andam
  o mesmo tanto vão no mesmo `TranslateEntities`).

**Prova:**

- `blueprintArranjo.test.ts` (6 testes):
  - distribuir em X sem mexer no y;
  - componente e trecho pelo centro, com eixo Y dado;
  - as três recusas;
  - alinhar ao DUTO: duas evaporadoras, a condensadora e o trecho paralelo na reta; o perpendicular
    fica, com aviso;
  - matriz de evaporadora + trecho;
  - componente fora da matriz, com aviso.
- `blueprintSelecao.test.ts`: 3 asserções atualizadas para o comportamento novo (o ponto vai na matriz;
  a recusa agora é a da esquadria avulsa; o aviso da referência cita o trecho).
- `BlueprintEditor.test.tsx` (+1 teste): o botão desligado diz "selecione 3 peças ou mais"; com três
  pilares selecionados por Shift, o do meio vai de 2000 a 4000; um Desfazer o devolve.

### Etapa 10.4b — IFC externo como referência no 3D · 08/10/2026 (frente `clima-e10-ref`, sem bump)

- **Referência 3D** (Inserir › Importar › Referência 3D): escolhe um IFC na biblioteca da organização
  (Modelo 3D (IFC), tabela `digital_files`). Cada referência tem olho, opacidade, deslocamento em x e
  y, cota e giro próprios. Ela é desenhada no 3D (e no lado a lado da 10.3) só para coordenar: **não
  vira desenho, não se clica** (o raycast a atravessa até a peça de trás), **não entra no
  enquadramento nem no hash**. A caixa de corte da 10.3 a recorta junto.
- **Os dois mundos** (`utils/blueprintReferenciaExterna.ts`, puro):
  - o web-ifc deita o plano do IFC em X/−Z; o viewer põe o y da planta em +Z;
  - a `matrizDaReferencia` espelha Z, gira (anti-horário na planta = −θ em Y) e desloca (mm → m).
- **Onde mora:** a lista fica **no navegador, por estudo** (`blueprint:referenciasExternas:<estudo>`),
  lida sem confiar no guardado (`lerReferencias`). Os bytes são baixados do bucket `bim_files` só
  quando a referência está visível, uma vez por arquivo, e lidos pelo `carregarIfc` (o mesmo parser do
  visualizador de IFC).
- ⚠️ **Decisão pendente do usuário:** guardar a lista no ESTUDO, para todos que abrem a Planta, pede uma
  tabela própria (migration). Nesta fase ela é por navegador.

**Prova:**

- `blueprintReferenciaExterna.test.ts` (6 testes):
  - a matriz sem THREE;
  - **o IFC exportado pela própria Planta, lido pelo web-ifc de verdade e posto pela matriz, cai EM CIMA
    das duas paredes** (caixa −0,075…4 em x, −0,075…3 em +Z, 0…2,8 de altura);
  - deslocado 10 m e girado 90°, a parede de 4 m passa a correr em +Z a partir de x = 10;
  - o hash do modelo não muda;
  - a leitura do navegador descarta item sem arquivo e repetido, e volta número estragado ao padrão.
- `BlueprintEditor.test.tsx` (+1 teste): o arquivo da biblioteca entra na lista do estudo, baixa uma
  vez, o botão da biblioteca desliga com o motivo, e o olho e a lixeira mexem só na lista.
- **Harness do 3D** (`?referencia=1&dx=…`): o IFC da casa lido no navegador, com o wasm de `/wasm/`.
  - **9 m ao lado**: 13,8 % da tela muda (a segunda casa apareceu, console limpo);
  - **em cima (dx = 0)**: 5,1 % muda — ele cai sobre o desenho; o que sobra é o z-fighting das faces
    coincidentes e o 2º pavimento do IFC.

### Etapa 10.4c — DXF como fundo vetorial · 08/10/2026 (frente `clima-e10-ref`, sem bump)

- A prancha de fundo que veio de DXF/DWG guarda o desenho de origem ao lado do PNG (`.desenho.json`,
  P2.38). Agora o canvas traça as **linhas** desse desenho no lugar do PNG: o traço fica com ~1 px de
  tela em qualquer zoom, sem o serrilhado de esticar um raster de 4096 px.
- **Onde cada linha cai:** o traço é desenhado no espaço de pixel do PNG e passa pela MESMA matriz que
  o canvas já usava para a imagem (pixel → aferição ATUAL da prancha → tela). Assim o vetor segue a
  prancha se ela foi movida, girada ou reaferida depois de importada.
- **Só quando bate** (`fundoVetorialDoDesenho`):
  - o plano é refeito do desenho guardado e só vale se bater pixel a pixel com a imagem guardada (largura
    e altura), que é a prova de que a importação usou as mesmas opções;
  - dois jeitos de ter importado são tentados: pela camada/unidade escolhidas, ou pela leitura da própria
    ÒPURA (mm);
  - se nenhum bater, fica o PNG — nunca um vetor fora do lugar;
  - acima de 80 mil traços também fica o PNG, que custa menos a cada quadro.
- O fundo de PDF e o de imagem continuam como estavam.

**Prova:**

- `dxfFundoVetorial.test.ts` (6 testes):
  - os dois candidatos;
  - a imagem que não bate e o desenho grande demais (fica o PNG);
  - **o pixel do traço, levado pela aferição da prancha, é o ponto do DXF × unidade + ancoragem**;
  - o traço fixo, com a camada em destaque 1,5× mais grossa.
- **Harness** `docs/spikes/fundo-vetorial/` (novo): o DXF da própria Planta, rasterizado como a
  importação faz, no `BlueprintCanvas` real.
  - A caixa do traço com o PNG e com o vetor difere em **1 px**.
  - Depois do mesmo zoom forte, o PNG tem **3,77 %** da tela escura e o vetor **0,18 %**. Os prints
    mostram as mesmas três linhas, grossas no PNG e finas no vetor.

### Pendências da E10 · 10/10/2026 (frente `clima-e10-pendencias`)

Os três itens do pedido de 10/10/2026 (acima, junto do pedido original).

1. **Componente na matriz.**
   - O `DuplicateEntities` do kernel ganhou `componenteIds`:
     - uid novo, sem a marca de "sugerido";
     - o filho de conjunto aponta para a cópia do pai quando o pai também vai, e fica solto quando não
       vai (a regra do `DuplicateLevel`).
   - **E o sistema da climatização acompanha:** a evaporadora copiada junto com a condensadora dela
     passa a apontar para a CÓPIA (antes, a matriz de splits penduraria N evaporadoras na primeira
     condensadora). Copiada sozinha, a evaporadora fica no sistema de origem — o caso do VRF.
   - **Sem bump:** a versão do kernel acompanha o formato do MODELO, e comando não é gravado nem
     reproduzido (o `componenteIds` do `TranslateEntities`, P2.4, também entrou sem bump). O pacote
     da `planta-api` não aplica comandos, então não foi reconstruído.
   - O Ctrl+D (duplicar) continua sem instalações e componentes: não foi pedido, e os testes dele
     fixam esse comportamento.
2. **Subir e descer no 3D.**
   - A alça ganhou a seta VERDE (Y) quando o editor oferece `onElevar`. O Y do arraste vira mm de
     cota (`deltaVerticalMm`, passo de 10 mm).
   - `comandosDeElevar` gera um `Set*Props` por peça: ponto, trecho (as duas pontas), quadro e
     componente. É um lote, portanto um Ctrl+Z.
   - O componente para no piso. Parede, divisa, estrutura e telhado não têm cota própria e ficam onde
     estão, com aviso. O trecho ligado que ficou fora da seleção também é dito: a rede abriria um
     degrau.
3. **Referências IFC no ESTUDO** (aprovado pelo usuário).
   - Migration `aplicar_20271010002100_blueprint_study_referencias.sql`, **aplicada** em 10/10/2026
     (`db query -f`). Conferida no banco: RLS ligada, 1 policy (`is_org_member`, uma perna só) e `anon`
     sem SELECT.
   - Uma linha por estudo com a lista em JSONB (CHECK de array); a FK `(study_id, organization_id)`
     amarra a organização à do estudo.
   - Hook `useBlueprintReferencias`, no molde da climatização:
     - o estudo com lista → vale a lista do estudo;
     - o estudo sem lista → **adota a que o navegador já tinha** e grava (quem montou antes não perde);
     - a tabela não respondeu → segue no navegador, e o painel avisa.

**Prova:**

- `blueprintArranjo.test.ts`:
  - o componente copiado;
  - o split copiado inteiro (a evaporadora da cópia liga na condensadora da cópia) e só a evaporadora
    (as duas no mesmo sistema);
  - o conjunto inteiro × o filho sozinho.
- `blueprint3dEditor.test.ts` (+3 testes): o Y do arraste; ponto, trecho e componente sobem num lote e
  um Ctrl+Z desce tudo; o piso, a parede e o trecho ligado.
- `BlueprintEditor.test.tsx`:
  - a lista é gravada no estudo (`save` com a lista; o olho e a lixeira também);
  - o navegador é adotado quando o estudo não tem lista;
  - a lista do estudo vence a do navegador.
- **Harness do 3D** (`?editar=1&peca=ponto`): o passeio acha a seta verde pelos pixels e arrasta para
  cima. A cota foi de **2200 → 6770**, e o **Ctrl+Z** a devolveu a **2200**. Achado no caminho: o
  `idInicial` do harness lia `model.walls[0]` no carregamento e derrubava a cena sem paredes — corrigido.

### Etapa 11 — Gerador de climatização · 10/10/2026 (frente `clima-e11`, sem bump)

**11.1 Encadeamento** — `gerarClimatizacao(modelo, premissas, contexto)` (`utils/blueprintGeradorClimatizacao.ts`,
no molde do `gerarPpci`). Cada etapa propõe sobre a cópia, já com as anteriores aplicadas:

1. **carga térmica** por ambiente (só cálculo);
2. **equipamento**: seleção pelo catálogo da organização e posição do split, com o ponto elétrico e o
   sistema ligados;
3. **linha frigorígena e dreno**;
4. **VRF**, só quando há condensadora VRF no desenho;
5. **rede de dutos**, só quando há terminal de ar;
6. **circuito do ar-condicionado**;
7. **conflitos que a proposta criou**;
8. **quantitativo e medidas do orçamento** (só cálculo);
9. **verificações** que ainda faltam.

Um lote, um Ctrl+Z; `conferirPlanoDaClimatizacao` é a trava antes de gravar (o lote recria os mesmos
ids no desenho de agora).

- **O circuito não mexe no que o gerador não criou.** O planejador de circuitos da Elétrica liga TODOS
  os pontos soltos do pavimento. Por isso o gerador só o roda quando os únicos pontos soltos são os
  que ele criou e há um quadro inequívoco: o único do pavimento ou, sem nenhum lá, o único do desenho
  (quadro de outro pavimento vale, regra de 17/09). Fora disso, o caso vai para o relatório, como
  "o gerador não decide".
- **O orçamento não é lançado pelo gerador.** A composição de cada item é escolha do orçamentista. A
  etapa mostra as medidas (equipamentos, tubo, dreno, chapa, terminais) e manda ao painel Orçamento.
- **Rodar de novo dá o MESMO desenho.** Os planejadores de split, linha, VRF e dutos apagam as
  próprias sugestões antes de propor, então gerar de novo não acumula. O lote não sai vazio, por
  isso a lei do teste é "mesmas peças nos mesmos lugares", e não "lote vazio" (a
  `propostasIdempotentes.test.ts` não se aplica a esses planejadores).

**11.2 Relatório e botão.**

- Mecânica › Gerador › **Gerar climatização** abre uma gaveta larga. É a MESMA gaveta do PPCI
  (`PainelGeradorPpci`, com o tipo do plano afrouxado para `PlanoDoGerador`, e a situação nova
  "Calculou" para as etapas só de cálculo).
- O relatório tem os grupos: verificação em falta, premissa, sem solução, conflito, não decide e
  CONFERIR. Sai em PDF ou DOCX (`relatorioDaClimatizacao`).
- As peças nascem SUGERIDAS e se aceitam nos painéis Split e Linha e dreno.

**Prova:**

- `blueprintGeradorClimatizacao.test.ts` (7 testes):
  - a cadeia, com as situações de cada etapa;
  - **a lei**: reaplicar no original dá os mesmos ids e o mesmo hash, e mexer no desenho trava;
  - **gerar de novo sobre o resultado dá o mesmo desenho**;
  - com uma TUG solta no pavimento, o ar fica sem circuito e o relatório diz;
  - sem quadro no desenho;
  - sem ambiente climatizado (lote vazio, premissa dita) e catálogo vazio;
  - o relatório.
- `blueprintGeradorPpci.test.ts` continua verde com o tipo comum.
- `BlueprintEditor.test.tsx` (+1 teste):
  - Mecânica › Gerar climatização: a prévia mostra as etapas e o grupo "não decide" traz o quadro que
    falta;
  - "Lançar tudo" grava evaporadora e linha num lote, e um Desfazer tira tudo.
- **Harness** `docs/spikes/gerador-climatizacao/` (a gaveta real ao lado da planta real, Sala + Quarto +
  Cozinha + quadro):
  - a prévia: 2 evaporadoras, 2 condensadoras, 8 trechos de linha, 6 de dreno e 2 pontos de ar com
    circuito;
  - o lançado: idêntico à prévia;
  - o **Ctrl+Z**: volta a zero;
  - o relatório traz a única verificação em falta, que é real: a Cozinha sem janela pede exaustão.

### Os dois itens que ficaram de fora · 10/10/2026 (frente `clima-e10-sobras`)

1. **Ctrl+D (duplicar) com tudo o que o kernel copia.** `comandoDeDuplicacao` passa a mandar ao
   `DuplicateEntities`, além de paredes, divisas, estruturas e esquadrias:
   - as águas do telhado;
   - as instalações (ponto, trecho e quadro). A cópia nasce sem circuito, e o aviso diz;
   - os componentes. A evaporadora duplicada com a condensadora liga na cópia dela.

   O teste antigo "só de tomada não duplica" virou "a tomada duplica, sem circuito, com o aviso". Há
   um teste novo de componente + split.
2. **O portão `cena=estrutura` do harness 3D (2,33 % < 3 %) não era o enquadramento.** O harness não
   carregava o CSS do app, e o viewer se dimensiona por classes do Tailwind (`h-full`, `absolute`).
   Assim o canvas caía na altura padrão, e a cena ficava espremida numa faixa. A correção foi um
   `harness.css` que importa o `index.css` e aponta o Tailwind para os componentes (o mesmo do harness
   do gerador de PPCI). Com a tela do tamanho certo:
   - `cena=estrutura` mede **10,1 %** (o histórico era 8,4 %);
   - todos os outros portões continuam verdes.

   **Achado no caminho:** o portão da referência IFC (10.4b) só passava por causa do canvas espremido.
   Ele media "quanto da tela muda", e com a tela inteira a malha em cima do desenho muda 17 % sem sair
   do lugar (outra cor, as faces coincidentes brigando, o 2º pavimento). Ele foi reescrito para medir
   ONDE muda:
   - a caixa da casa sai da imagem sem referência;
   - **ao lado**, 71 % dos pixels que mudaram caem fora da casa (mínimo 50 %);
   - **em cima**, 0 % (máximo 10 %).

   **Defeito plantado:** com a referência girada 180°, o portão acusou (57 % fora da casa).

### Pendências D1–D4 e C12–C16 · 10/10/2026 (frente `clima-cd`)

Itens do "Plano das pendências C e D" (no topo, depois do status), mais a regraduação da Parte 1.

- **D1, símbolo proporcional.** `proporcaoDoSimbolo` dá profundidade ÷ largura (0,15–1) para as
  evaporadoras hi-wall, piso-teto e dutada e para as condensadoras. O canvas e a prancha desenham com
  a LARGURA como lado e o contorno com a profundidade da peça. A hi-wall de 900 × 220 desenha
  900 × 220 (antes, 900 × 360). A legenda, sem proporção, segue a forma de sempre.
- **D2, difusor tipado.** O item "Difusor / grelha" (texto livre) SAIU do menu da Mecânica: o difusor
  tipado da E7 já estava no mesmo menu, em "Climatização — terminais de ar", e um segundo "Difusor"
  ao lado confundiria. De carona: o menu da Mecânica não recebia o tipo do ponto escolhido, e por isso
  nenhuma peça tipada escolhida nele (evaporadora, difusor…) aparecia como a ativa no botão. `terminaisDeArAntigos` / `comandosDeConverterTerminaisAntigos` fazem o
  de-para: Difusor → DIFUSOR, Grelha de retorno → GRELHA_RETORNO, Tomada de ar exterior →
  TOMADA_AR_EXTERIOR. A gaveta de Dutos mostra quantos terminais antigos há e converte num lote
  (um Ctrl+Z). Nada muda sozinho.
- **D3, densidade pela área útil.** A carga continua pela área de EIXO (conservadora). A densidade
  W/m² reporta pela área ÚTIL (`areaUtilM2`: área recuada menos ilhas, a mesma do quantitativo), no
  painel e no memorial.
- **D4, link direto.** Reproduzido em teste: com a lista de plantas na tela, o `hashchange` não
  remontava o módulo, e o `studyId` só era lido na montagem. O módulo passou a ouvir a troca de
  endereço.
- **C12, cotas além das peças de fora.** `pecasForaDoLado` mede, por lado, até onde avançam os
  equipamentos e os componentes de fora (até 2,5 m da fachada). O canvas, o PDF e o DXF afastam a
  cadeia de cotas além disso, com 150 mm de respiro, e as linhas de chamada acompanham.
- **C13, rótulos do isométrico.** `lugarDoRotulo` tenta a posição de sempre e as alternativas em volta,
  marcando as caixas já escritas. O rótulo da peça afastado ganha uma linha fina até ela.
- **C14, sistema de exaustão.** `idsDaRedeDeExaustao` acha as componentes conexas de duto com exaustor
  e sem insuflamento. Elas saem num `IfcDistributionSystem` próprio, `.VENTILATION.` ("MECANICA
  (exaustão)"). A frase de cobertura do IFC muda no mesmo commit, e a importação não muda (o duto é
  reconhecido pela classe).
- **C15, isolamento no IFC.** O isolamento declarado sai como `IfcCovering .WRAPPING.`, sem geometria
  própria (o sólido do tubo já é o envelope), ligado ao tubo por `IfcRelCoversBldgElements`, com
  `Pset_OpuraIsolamento.EspessuraMm`.
- **C16, quantitativo por pavimento.** `QuantitativoDoPavimento` ganha linha, dreno e duto (m),
  equipamentos e terminais de ar, e a tela de quantitativos ganha a coluna "Climatização". Os pontos
  da climatização saem dos "pontos hidráulicos", onde se misturavam.
- **Regraduação da Parte 1** (247 itens, contra o código atual, `arquivo:linha`):
  - Essenciais: **162 ✅ / 56 🟡 / 10 ❌**; eram 51 / 83 / 94;
  - "vai além": 6 ✅ / 11 🟡;
  - as linhas que D1–D4 e C12–C16 resolveram já entram como ✅;
  - os achados novos da regraduação, fora da lista C/D, estão no grupo F do status, para o usuário
    decidir.

**Prova:**

| Item | Teste | O que prova |
|---|---|---|
| D1 | `blueprintSimbolosClimatizacao.test.ts` (+4) | 900 × 220; condensadora com a hélice dentro; quadrados intocados; prancha |
| D2 | `blueprintRedeDeAr.test.ts` (+1); `BlueprintEditor.test.tsx` | o de-para e o lote; o menu com UM "Difusor", sem "Difusor / grelha", e o botão mostrando o difusor escolhido |
| D3 | `blueprintCargaTermica.test.ts` | a densidade pela útil, menor que a de eixo |
| D4 | `BlueprintModuleLinkDireto.test.tsx` (novo, 3) | reproduzia: 2 falhavam antes |
| C12 | `blueprintCotasPorLado.test.ts` (+1) | o lado da condensadora mede 500 + meia diagonal; os outros, 0 |
| C13 | `blueprintIsometricoPrancha.test.ts` (+2) | três peças a 10 cm, nenhum par de rótulos sobreposto |
| C14/C15 | `blueprintIfcVentilacao.test.ts` (novo, 4) | os dois sistemas; a rede mista fica ar-condicionado; o covering lido pelo web-ifc, ligado ao IfcPipeSegment |
| C16 | `blueprintQuantitativosPorPavimento.test.ts` (+1) | linha, dreno, duto, equipamentos e terminais; o lavatório é o único ponto hidráulico |
