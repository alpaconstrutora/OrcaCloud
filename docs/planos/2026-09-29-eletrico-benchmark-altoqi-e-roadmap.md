# Elétrico: o AltoQi Builder como régua — benchmark e roadmap para o ÒPURA

> Parte 1 é benchmark (o que existe, com evidência `arquivo:linha`); Parte 2 é o plano de
> implementação. Nada da Parte 2 foi executado ao escrever este documento — cada fase
> ganha uma seção em "Execução" quando for feita.

## Pedido original

Sessão de 29/09/2026 (VS Code, Claude Code), transcrito literalmente:

<details>
<summary>Mensagem do usuário (clique para abrir — é longa: 55 categorias, 599 itens)</summary>

> avalie as funcionalidades abaixo para implementacao no incorporacao < planta inteligente.
> avalie o que ja foi implementado e o que falta implementar e faço um plano de implementacao
> 
> Considerando a versão atual do AltoQi Builder Elétrico, incluindo os recursos disponíveis até a atualização 2026-08, o sistema cobre praticamente todo o ciclo de projeto: lançamento → circuitação → dimensionamento → BIM → documentação → quantitativos. AltoQi
> 1. Criação e organização do projeto elétrico
> - Criação de edificações com múltiplos pavimentos.
> - Definição dos níveis da edificação.
> - Organização do projeto por pavimentos.
> - Organização por quadros.
> - Organização por circuitos.
> - Organização por comandos.
> - Sub-redes elétricas.
> - Projeto elétrico segmentado ou unificado.
> - Referências externas de arquitetura.
> - Aproveitamento de lançamentos entre pavimentos.
> - Cópia de elementos entre pavimentos.
> - Espelhamento de lançamentos.
> - Níveis de desenho independentes.
> - Controle de visibilidade dos níveis.
> - Perfis de visualização.
> - Importação das configurações de outro projeto.
> - Mesclagem de projetos.
> - Kits reutilizáveis de instalações.
> - Planta de passagens para furos e aberturas de instalações. AltoQi Suporte
> 2. Pontos elétricos
> Permite lançar e configurar diversos tipos de pontos:
> - tomadas TUG;
> - tomadas TUE;
> - tomadas 2P+T;
> - tomadas bifásicas;
> - tomadas trifásicas;
> - tomadas múltiplas;
> - tomadas combinadas;
> - pontos de força;
> - pontos de espera;
> - pontos para equipamentos;
> - condicionadores de ar;
> - bombas;
> - motores;
> - portões motorizados;
> - persianas motorizadas;
> - ventiladores;
> - exaustores;
> - campainhas;
> - carregadores para veículos elétricos;
> - pontos de detecção e alarme;
> - pontos de aterramento;
> - pontos instalados em conduletes;
> - múltiplos pontos em uma mesma caixa;
> - pontos aparentes e embutidos.
> Cada ponto pode possuir potência, tensão, fase, tipo, subtipo, representação 2D/3D e informações para dimensionamento. AltoQi Suporte
> 3. Iluminação
> - Lançamento de luminárias.
> - Lançamento de lâmpadas.
> - Arandelas.
> - Fitas LED.
> - Luminárias com múltiplas lâmpadas.
> - Distribuição automática de luminárias.
> - Posicionamento manual.
> - Definição de potência.
> - Fluxo luminoso associado à peça.
> - Comandos de iluminação.
> - Interruptor simples.
> - Interruptor paralelo.
> - Interruptor intermediário.
> - Interruptores múltiplos.
> - Interruptores de várias teclas.
> - Comando da mesma luminária por vários locais.
> - Comandos entre pavimentos.
> - Relé fotoelétrico.
> - Painéis de comando.
> - Iluminação externa automatizada.
> - Associação entre luminárias e comandos.
> - Criação de esquemas personalizados de ligação. AltoQi Suporte
> 4. Distribuição automática de tomadas
> Uma funcionalidade particularmente interessante:
> - identifica o ambiente;
> - considera área;
> - considera perímetro;
> - calcula quantidade mínima de tomadas;
> - utiliza critérios da NBR 5410;
> - posiciona automaticamente as tomadas;
> - permite posteriormente ajustar os pontos manualmente.
> Também existe comando específico para distribuição automática de tomadas. AltoQi
> 5. Circuitos elétricos
> - Criação de circuitos.
> - Circuitos terminais.
> - Circuitos alimentadores.
> - Associação dos pontos aos circuitos.
> - Associação dos circuitos aos quadros.
> - Alteração de circuitos.
> - Movimentação de circuitos entre quadros.
> - Circuitos reserva.
> - Numeração automática.
> - Prefixos personalizados.
> - Nomes personalizados.
> - Descrições dos circuitos.
> - Ordenação dos circuitos.
> - Definição da tensão.
> - Monofásico.
> - Bifásico.
> - Trifásico.
> - Seleção das fases.
> - Balanceamento por fase.
> - Definição do método de instalação.
> - Tipo de carga.
> - Fator de demanda.
> - Fator de potência.
> - Dispositivo de proteção.
> - IDR.
> - DPS.
> - Disjuntor de manutenção.
> - Condutores.
> - Condutor de proteção.
> - Configuração de queda de tensão.
> - Configuração de circuitos independentes.
> - Circuitos de força e iluminação separados.
> A atualização 2026-08 também trouxe ordenação flexível dos circuitos no diagrama unifilar. AltoQi Suporte
> 6. Comandos elétricos
> Além do conceito de circuito, o Builder possui um objeto específico de comando.
> Permite:
> - criar comandos;
> - nomear comandos;
> - numerar comandos;
> - relacionar interruptor e luminária;
> - alterar comandos posteriormente;
> - comandar diversos pontos;
> - comandar um ponto de locais diferentes;
> - comandos atravessando pavimentos;
> - cadastrar esquemas de ligação personalizados.
> Essa separação entre circuito e comando é arquiteturalmente importante: alimentação e lógica de acionamento são entidades diferentes. AltoQi Suporte
> 7. Quadros elétricos
> O sistema suporta:
> - quadro de distribuição;
> - quadro de medição;
> - quadro com transformador;
> - quadro geral;
> - caixas de passagem;
> - alimentador predial;
> - entrada de serviço;
> - transformadores;
> - nobreaks;
> - dispositivos de transferência;
> - quadros associados hierarquicamente.
> Também permite:
> - numeração automática;
> - prefixos;
> - organização de circuitos;
> - circuitos reserva;
> - mudança de circuitos entre quadros;
> - associação entre quadros;
> - cópia de quadros entre pavimentos;
> - dimensionamento das alimentações;
> - geração do quadro de cargas. AltoQi Suporte
> 8. Centro de cargas
> O Builder possui cálculo do centro de cargas.
> Considera:
> - coordenadas dos pontos;
> - potência instalada;
> - distribuição das cargas.
> A partir disso, indica em planta uma região recomendada para posicionar o quadro de distribuição.
> É uma funcionalidade bastante interessante para automatização de projetos. AltoQi
> 9. Entrada de energia
> - Alimentador predial.
> - Entrada de serviço.
> - Padrão de entrada.
> - Quadro de medição.
> - Medidores.
> - Associação dos apartamentos/unidades.
> - Alimentadores.
> - Configuração de tensão.
> - Tipo de fornecimento.
> - Unidade consumidora individual.
> - Edificação de uso coletivo.
> - Dimensionamento conforme concessionária.
> - Dimensionamento do ramal de entrada.
> - Demanda da edificação.
> O sistema possui cadastros de concessionárias de energia e suas tabelas de fornecimento. AltoQi Suporte
> 10. Cálculo de demanda
> O sistema calcula automaticamente:
> - potência instalada;
> - potência demandada;
> - fatores de demanda;
> - demanda por tipo de carga;
> - demanda dos circuitos;
> - demanda dos quadros;
> - demanda do quadro de medição;
> - demanda do alimentador;
> - demanda de edificações de uso coletivo;
> - corrente demandada;
> - demanda do barramento blindado.
> Para edificações coletivas, há inclusive critérios específicos utilizados por concessionárias e metodologia baseada no CODI. AltoQi Suporte
> 11. Dimensionamento dos condutores
> O Builder dimensiona automaticamente os condutores considerando, entre outros:
> - corrente de projeto;
> - corrente corrigida;
> - capacidade de condução;
> - método de instalação;
> - agrupamento;
> - temperatura;
> - FCA;
> - queda de tensão;
> - seção mínima;
> - sobrecarga;
> - curto-circuito;
> - requisitos da concessionária.
> Também permite:
> - seção mínima configurável;
> - fixação manual de seção;
> - condutores em paralelo por fase;
> - neutro com seção diferente;
> - terra com seção diferente;
> - retorno com seção diferente;
> - terra independente;
> - configuração da seção do retorno. AltoQi Suporte
> 12. Queda de tensão
> - Cálculo automático.
> - Queda parcial.
> - Queda acumulada.
> - Limite máximo configurável.
> - Verificação por circuito.
> - Verificação nos alimentadores.
> - Uso da queda de tensão como critério de dimensionamento.
> - Identificação de circuitos fora dos limites.
> - Relatórios de queda de tensão. AltoQi Suporte
> 13. Fator de correção e agrupamento — FCA
> O sistema considera:
> - número de circuitos agrupados;
> - quantidade de condutores;
> - forma de instalação;
> - condição do eletroduto/conduto;
> - FCA resultante;
> - capacidade corrigida do condutor.
> A AltoQi também vem introduzindo novos critérios de cálculo de FCA nas versões atuais. AltoQi
> 14. Dimensionamento de disjuntores
> - Dimensionamento automático.
> - Corrente nominal.
> - Proteção contra sobrecarga.
> - Proteção contra curto-circuito.
> - Capacidade de interrupção.
> - Compatibilidade cabo × disjuntor.
> - Seleção da peça.
> - Disjuntor de manutenção.
> - Configuração das capacidades disponíveis.
> - Alteração manual da peça escolhida. AltoQi Suporte
> 15. IDR / DR
> Dimensionamento e configuração de proteção diferencial:
> - IDR individual por circuito;
> - IDR para grupos de circuitos;
> - IDR geral do quadro;
> - cálculo de corrente nominal;
> - agrupamento de circuitos;
> - associação à proteção;
> - seleção automática da peça;
> - identificação de incompatibilidades. AltoQi Suporte
> 16. DPS
> - Inserção de DPS.
> - DPS em quadros de distribuição.
> - Configuração do dispositivo.
> - Disjuntor de desconexão do DPS.
> - Representação nos diagramas.
> - Quantificação na lista de materiais. AltoQi Suporte
> 17. Curto-circuito
> O dimensionamento considera aspectos de curto-circuito como:
> - corrente de curto-circuito;
> - capacidade de interrupção;
> - proteção dos circuitos;
> - compatibilidade do disjuntor;
> - proteção contra corrente de curto-circuito;
> - corrente de curto-circuito em barramentos blindados.
> O sistema gera alertas quando a capacidade de interrupção é insuficiente. AltoQi Suporte
> 18. Eletrodutos e condutos
> - Eletrodutos circulares.
> - Condutos retangulares.
> - Eletrocalhas.
> - Eletrocalhas lisas.
> - Eletrocalhas perfuradas.
> - Leitos/canalizações conforme cadastro.
> - Condutos aparentes.
> - Condutos embutidos.
> - Condutos enterrados.
> - Ligações horizontais.
> - Ligações verticais.
> - Passagem entre pavimentos.
> - Curvas.
> - Conexões.
> - Caixas.
> - Conduletes.
> Também existem representações realistas em 3D para condutos retangulares e eletrocalhas. AltoQi Suporte
> 19. Lançamento automático de eletrodutos
> Uma das principais automações do Builder.
> Depois que pontos e circuitos são definidos, o software:
> - identifica os quadros;
> - procura caminhos possíveis;
> - analisa as conexões;
> - encontra rotas válidas;
> - busca uma rota economicamente favorável;
> - conecta os pontos;
> - cria os eletrodutos.
> Também possui desvio automático de eletrodutos. AltoQi
> 20. Dimensionamento dos eletrodutos
> - Dimensionamento automático.
> - Verificação da ocupação.
> - Quantidade de condutores.
> - Seção dos condutores.
> - Diâmetro mínimo.
> - Percentual de ocupação.
> - Regras normativas.
> - Seleção do diâmetro comercial.
> - Alertas de dimensionamento.
> - FCA relacionado ao agrupamento. AltoQi Suporte
> 21. Lançamento automático da fiação
> O sistema possui mais de 60 esquemas elétricos predefinidos.
> A partir dos pontos, circuitos e eletrodutos, insere automaticamente:
> - fase;
> - neutro;
> - terra;
> - retorno;
> - condutores de comando.
> O algoritmo analisa os caminhos possíveis e seleciona os trajetos para a fiação. AltoQi
> 22. Fiação manual
> Apesar da automação, é possível:
> - lançar fios manualmente;
> - remover fiação;
> - alterar caminho;
> - verificar traçado;
> - adicionar aterramento;
> - lançar cabos isolados;
> - alterar seção;
> - colocar condutores paralelos;
> - determinar cores;
> - modificar representação. AltoQi Suporte
> 23. Esquemas de ligação
> Existe um motor de esquemas elétricos.
> Um esquema define:
> combinação de pontos + tipo de circuito + condutores necessários.
> Por exemplo:
> Interruptor simples + lâmpada → Fase + Neutro + Retorno + Terra
> O usuário também pode:
> - criar novos esquemas;
> - editar esquemas;
> - definir tipos e subtipos de pontos;
> - definir condutores;
> - criar combinações personalizadas. AltoQi Suporte
> Para um sistema como o ÒPURA, considero esse motor mais importante do que simplesmente possuir uma biblioteca de símbolos.
> 24. Otimização gráfica da fiação
> O Builder possui algoritmos para:
> - eliminar sobreposição de textos;
> - eliminar sobreposição da fiação;
> - afastar indicações;
> - organizar símbolos;
> - organizar condutos;
> - representar trechos complexos numericamente;
> - gerar legenda correspondente;
> - configurar espaçamentos.
> Isso melhora bastante a geração automática de plantas executivas. AltoQi
> 25. Barramento blindado
> Nas licenças compatíveis, permite:
> - modelagem do barramento;
> - traçado horizontal;
> - traçado vertical;
> - ligação entre pavimentos;
> - curvas;
> - derivações;
> - caixas de derivação;
> - caixas cofre;
> - plug-ins;
> - unidades de derivação;
> - conexão aos quadros;
> - dimensionamento;
> - cálculo de corrente demandada;
> - cálculo de curto-circuito;
> - cálculo de queda de tensão;
> - representação no diagrama unifilar;
> - esquema vertical;
> - memorial;
> - relatório de queda de tensão. AltoQi Suporte
> 26. Transformadores
> - Transformador em baixa tensão.
> - Quadro com transformador.
> - Transformador independente.
> - Relação de transformação.
> - Tensão de entrada.
> - Tensão de saída.
> - Ligação a quadros subordinados.
> - Dimensionamento das alimentações.
> - Representação gráfica.
> - Quantitativos. AltoQi Suporte
> 27. Nobreak
> O Builder permite trabalhar com:
> - nobreak;
> - alimentação subordinada;
> - circuitos associados;
> - integração à estrutura de quadros;
> - representação no projeto.
> A própria documentação agrupa o lançamento como Transformador/Nobreak. AltoQi Suporte
> 28. Geradores
> Recurso relativamente recente:
> - lançamento do gerador;
> - propriedades elétricas;
> - associação às cargas;
> - dimensionamento do gerador;
> - ligação ao sistema;
> - representação BIM;
> - documentação;
> - quantitativos. AltoQi Suporte
> 29. QTA / dispositivo de transferência
> Associado ao gerador:
> - quadro/dispositivo de transferência;
> - fonte normal;
> - fonte alternativa;
> - quadros de entrada;
> - quadros de saída;
> - ligação entre gerador e instalação;
> - transferência entre fontes;
> - ligações entre pavimentos.
> Na atualização 2026-08, o dispositivo de transferência passou a permitir ligações com quadros situados em outros pavimentos. AltoQi Suporte
> 30. Aterramento
> - Pontos de aterramento.
> - Condutor PE.
> - Terra associado aos circuitos.
> - Terra independente.
> - Dimensionamento do condutor de proteção.
> - Representação em planta.
> - Inclusão automática na fiação.
> - Quantitativos. AltoQi Suporte
> 31. Corrente contínua — CC
> Além de CA, o Builder permite projetos em corrente contínua:
> - tensão CC configurável;
> - condutores CC;
> - circuitos CC;
> - dimensionamento;
> - Disjuntor CC;
> - Fusível CC;
> - Seccionadora CC;
> - representação da fiação;
> - diagramas unifilares;
> - diagramas multifilares. AltoQi
> 32. Quadro de cargas
> Geração automática contendo informações como:
> - circuitos;
> - descrição;
> - potência;
> - tensão;
> - esquema;
> - fases;
> - corrente;
> - demanda;
> - fator de potência;
> - condutores;
> - seção;
> - proteção;
> - queda de tensão;
> - status do dimensionamento.
> Atualizado automaticamente quando o projeto é modificado. AltoQi
> 33. Quadro de cargas e demanda
> Permite apresentar:
> - carga instalada;
> - carga demandada;
> - fatores de demanda;
> - distribuição por circuito;
> - distribuição por quadro;
> - distribuição por fase.
> Também é possível gerar esquema de cargas instaladas e demandadas. AltoQi Suporte
> 34. Diagrama unifilar
> Geração automática:
> - quadros;
> - circuitos;
> - alimentadores;
> - disjuntores;
> - DPS;
> - IDR;
> - condutores;
> - seções;
> - fases;
> - cargas;
> - barramento;
> - transformadores;
> - hierarquia do sistema.
> É um desenho inteligente: alterações no projeto são refletidas no diagrama. AltoQi
> 35. Diagrama multifilar
> Também pode ser produzido automaticamente mostrando os condutores de forma individual:
> - fases;
> - neutro;
> - terra;
> - dispositivos de proteção;
> - circuitos;
> - ligações.
> O usuário pode personalizar simbologias e apresentação. AltoQi
> 36. Esquema vertical elétrico
> Geração automática da distribuição vertical da edificação:
> - pavimentos;
> - quadros;
> - alimentadores;
> - prumadas;
> - conexões entre pavimentos;
> - hierarquia de alimentação;
> - barramento blindado.
> É especialmente relevante para edifícios verticais. AltoQi Suporte
> 37. Plantas de luz e força
> O sistema permite gerar plantas específicas, inclusive:
> - planta de iluminação;
> - planta de tomadas;
> - planta de força;
> - plantas adicionais;
> - diferentes níveis de informação;
> - diferentes configurações de visualização. AltoQi Suporte
> 38. Detalhamento frontal
> Gera automaticamente vistas/cortes verticais dos elementos elétricos.
> Pode mostrar:
> - caixas;
> - tomadas;
> - eletrodutos;
> - eletrocalhas;
> - peças;
> - alturas;
> - relações entre elementos.
> Pode ser inserido nas pranchas e documentação do projeto. AltoQi
> 39. Modelagem 3D
> - Visualização tridimensional.
> - Pontos elétricos 3D.
> - Quadros.
> - Condutos.
> - Eletrocalhas.
> - Cabos/elementos associados.
> - Transformadores.
> - Equipamentos.
> - Curvas realistas.
> - Alteração de elementos no 3D.
> - Propriedades dos elementos.
> - Controle de aparência.
> - Ocultar/exibir componentes.
> - Perfis de vistas.
> - Caixa de corte 3D.
> - Croqui 2D e 3D simultâneos.
> - Mover elementos diretamente em 3D.
> - Ajuste automático das conexões adjacentes.
> - Desfazer/refazer operações 3D. AltoQi Suporte
> 40. Ligação volumétrica
> Os objetos possuem pontos de conexão tridimensionais.
> Isso permite ligar fisicamente:
> - tomadas;
> - caixas;
> - quadros;
> - eletrodutos;
> - equipamentos.
> O conduto termina efetivamente no ponto correto do componente BIM, não apenas sobre seu símbolo 2D. AltoQi
> 41. BIM / IFC
> O Builder é OpenBIM:
> - importação IFC;
> - exportação IFC;
> - arquitetura vinculada;
> - estrutura vinculada;
> - demais disciplinas MEP;
> - propriedades IFC;
> - atributos personalizados;
> - comprimento;
> - área;
> - volume;
> - potência;
> - corrente;
> - outras propriedades.
> Os quantitativos podem acompanhar o modelo BIM. AltoQi
> 42. Importação Revit
> A atualização 2026-08 acrescentou suporte à importação de:
> - RVT;
> - RTE;
> como modelos externos para referência/compatibilização. AltoQi Suporte
> 43. Clash detection
> - Detecção de colisões.
> - Elétrica × arquitetura.
> - Elétrica × estrutura.
> - Elétrica × hidráulica.
> - Elétrica × incêndio.
> - Elétrica × demais instalações.
> - Identificação gráfica.
> - Filtro por pavimentos.
> - Visualização 3D da interferência. AltoQi
> 44. BCF
> - Criação de notas BCF.
> - Comentários.
> - Imagens.
> - Localização do problema no modelo.
> - Controle das alterações.
> - Filtro por data.
> - Compartilhamento com outros projetistas.
> - Integração com AltoQi Cloud. AltoQi
> 45. Biblioteca de peças
> Há uma biblioteca nativa ampla — a AltoQi informa mais de 25 mil peças considerando o Builder.
> Para elétrico inclui:
> - tomadas;
> - interruptores;
> - luminárias;
> - caixas;
> - eletrodutos;
> - eletrocalhas;
> - conexões;
> - quadros;
> - disjuntores;
> - DPS;
> - IDR;
> - condutores;
> - equipamentos etc. AltoQi
> 46. Cadastro personalizado
> O usuário pode cadastrar:
> - peças;
> - itens;
> - materiais;
> - símbolos 2D;
> - objetos 3D;
> - luminárias;
> - tomadas;
> - interruptores;
> - caixas;
> - conexões;
> - condutores;
> - disjuntores;
> - DPS;
> - tipos de ponto;
> - subtipos;
> - esquemas elétricos;
> - fabricantes;
> - concessionárias;
> - fatores de demanda. AltoQi Suporte
> 47. Quantitativos
> Geração automática dos materiais:
> - cabos;
> - fios;
> - eletrodutos;
> - eletrocalhas;
> - caixas;
> - tomadas;
> - interruptores;
> - luminárias;
> - quadros;
> - disjuntores;
> - IDRs;
> - DPS;
> - equipamentos;
> - acessórios.
> Pode gerar quantitativo:
> - por projeto;
> - por pavimento;
> - por quadro;
> - por circuito. AltoQi
> 48. Exportação da lista de materiais
> Formatos disponíveis:
> - XLSX;
> - DOCX;
> - HTML;
> - inserção diretamente no desenho/croqui.
> Também é possível personalizar campos e informações de fabricante. AltoQi Suporte
> 49. Legendas automáticas
> - legenda de símbolos;
> - legenda de fiação;
> - legenda de condutos;
> - legenda de materiais;
> - legenda de indicações;
> - legenda numérica para trechos com muita fiação.
> As legendas permanecem vinculadas ao projeto e podem ser atualizadas automaticamente. AltoQi
> 50. Memorial descritivo
> Geração automática com:
> - informações do projeto;
> - textos padrão;
> - textos personalizados;
> - relatórios;
> - quantitativos;
> - legendas;
> - informações técnicas.
> O projetista pode configurar blocos de textos reutilizáveis. AltoQi
> 51. Relatórios técnicos
> Entre os relatórios disponíveis estão:
> - dimensionamento de circuitos;
> - dimensionamento de quadros;
> - demanda;
> - queda de tensão;
> - barramento blindado;
> - memorial de barramento;
> - quantitativos;
> - lista de materiais;
> - documentação técnica. AltoQi Suporte
> 52. Verificação automática e diagnóstico
> O Builder identifica problemas como:
> - carga excessiva;
> - condutor insuficiente;
> - proteção inadequada;
> - queda de tensão excessiva;
> - ausência de esquema compatível;
> - IDR não encontrado;
> - disjuntor incompatível;
> - capacidade de interrupção insuficiente;
> - ponto acima de 10 A sem circuito adequado;
> - iluminação e força no mesmo circuito;
> - problemas relacionados à concessionária.
> Esses diagnósticos aparecem durante o processamento/dimensionamento. AltoQi Suporte
> Recursos relacionados que fazem parte do ecossistema Builder Elétrica
> Dependendo da licença, o pacote Builder Elétrica também pode envolver três disciplinas adicionais.
> 53. Fotovoltaico
> - módulos fotovoltaicos;
> - inversores;
> - baterias;
> - controladores;
> - caixas de junção;
> - sistemas on-grid;
> - sistemas off-grid;
> - strings/séries;
> - arranjos;
> - dimensionamento CC;
> - dimensionamento CA;
> - proteções CC;
> - integração CC/CA;
> - diagramas;
> - quantitativos;
> - cálculo de geração;
> - análise de retorno do investimento. AltoQi
> 54. SPDA
> - análise de risco;
> - NBR 5419;
> - nível de proteção;
> - captores;
> - captores naturais;
> - descidas;
> - malha de aterramento;
> - dimensionamento;
> - verificação gráfica;
> - quantitativos;
> - memoriais;
> - relatórios.
> A versão 2026-08 foi adequada à NBR 5419:2026. AltoQi
> 55. Cabeamento estruturado
> - pontos de telecomunicação;
> - racks;
> - cabos;
> - patch panels e componentes;
> - tomadas RJ45;
> - lançamento da rede;
> - dimensionamento;
> - esquema vertical;
> - mapa de cabos;
> - identificação de origem/destino;
> - comprimento dos cabos;
> - quantitativos;
> - detalhamento BIM. AltoQi
> Como eu dividiria isso para o ÒPURA
> Para uma ferramenta elétrica dentro do ÒPURA / Planta Inteligente, eu não transformaria essas 55 categorias em 55 módulos. A arquitetura mais coerente seria:
> 1. Modelo Elétrico
> → pontos + equipamentos + condutos + quadros + geometria.
> 2. Motor de Circuitação
> → circuitos + comandos + fases + hierarquia dos quadros.
> 3. Motor de Conectividade
> → esquemas elétricos + rotas + eletrodutos + passagem automática da fiação.
> 4. Motor de Cálculo
> → carga + demanda + corrente + seção + queda de tensão + FCA + eletrodutos.
> 5. Motor de Proteção
> → disjuntores + IDR + DPS + curto-circuito.
> 6. Motor de Entrada e Distribuição
> → medição + concessionária + transformador + gerador + QTA + barramento blindado.
> 7. Motor BIM
> → 2D/3D + IFC + Revit + clash + BCF.
> 8. Motor de Documentação
> → unifilar + multifilar + esquema vertical + quadro de cargas + legendas + relatórios.
> 9. Motor de Quantitativos
> → materiais + orçamento + integração com suprimentos.
> 10. Extensões
> → Fotovoltaico + SPDA + Cabeamento Estruturado.
> Há um ponto particularmente relevante para a Planta Inteligente: o diferencial não está em desenhar tomadas e eletrodutos, mas em construir quatro motores combinados — distribuição automática de pontos + circuitação automática + roteamento de eletrodutos + geração automática da fiação. A partir deles, quadro de cargas, diagramas, quantitativos e boa parte da documentação tornam-se consequências do modelo, em vez de funcionalidades isoladas.

</details>

## Critério e legenda

**Critério do grau — o mesmo do hidrossanitário: "substituir o projetista".** O ÒPURA deve
permitir **fechar o projeto executivo elétrico** de uma casa ou de um edifício residencial
comum (NBR 5410:2004, NBR 5444, padrão de entrada da concessionária) sem outro software:
cálculo normativo completo, prancha, quadro de cargas, unifilar, memorial e lista de materiais.
Um item é **E** se, sem ele, o projetista ainda precisaria do AltoQi para entregar.

| Grau | Significa |
|---|---|
| **E** | Essencial — sem isso não se entrega o executivo residencial |
| **A** | Alto — entrega comum, mas não em todo projeto (edifício, alto padrão, automação de projeto) |
| **M** | Médio — ganho real, mas nicho ou contornável |
| **B** | Baixo — raro no residencial da incorporadora (barramento blindado, CC, nobreak) |
| **N** | Não replicar — produto de terceiro; consumir via IFC/integração |

Estado (conferido no código em 29/09/2026, commit `b888c00b`, kernel `0.68.0`, quantitativos
`quant-1.18.0`): **✅** implementado · **🟡** parcial · **❌** não existe. Caminhos relativos
à raiz do repositório. A varredura foi feita por quatro leituras independentes (modelo; motores
automáticos; cálculo e proteção; documentação, quantitativos e BIM), cada uma com
`arquivo:linha`; onde duas leituras discordaram, prevaleceu a que citou a linha.

Abreviações nas evidências: `model` = `utils/blueprintKernel/model.ts` · `commands` =
`utils/blueprintKernel/commands.ts` · `Dim` = `utils/blueprintEletricaDimensionamento.ts` ·
`Nbr` = `utils/blueprintNbr5410.ts` · `Distr` = `utils/blueprintDistribuicao.ts` · `CircAuto`
= `utils/blueprintCircuitosAutomaticos.ts` · `Eletr` = `utils/blueprintEletrodutos.ts` ·
`Cond` = `utils/blueprintCondutores.ts` · `Prancha` = `utils/blueprintPranchaEletrica.ts` ·
`Unifilar` = `utils/blueprintUnifilar.ts` · `Ifc` = `utils/blueprintIfc.ts` · `Ed` =
`components/blueprint/BlueprintEditor.tsx` · `Exec` = `utils/blueprintEletricaExecutivo.ts`.

---

# Parte 1 — Benchmark

## Onde o ÒPURA está, em uma página

O que existe hoje nasceu em três ondas de setembro/2026, todas no kernel da Planta Inteligente
(o módulo elétrico antigo, de 11 tabelas, foi removido em 08–09/09 depois que o kernel ganhou
`Quadro` e `Circuito`):

1. **Modelo** — 11 tipos fechados de ponto (`TIPOS_DE_PONTO_ELETRICO`, `model:2550-2562`:
   3 de iluminação, TUG, TUE, 4 de dados, ligação direta, interruptor com 5 variantes),
   `Quadro` (nome, posição, medidas, ligação, tensão, metros do alimentador), `Circuito`
   (nome, tipo, tensão, ligação FN/FF/FFF, fase R/S/T, seção e disjuntor declarados, DR
   booleano) e `Trecho` de eletroduto (bitola, cotas, contagem de condutores, lista de circuitos).
2. **Quatro motores automáticos**, todos no padrão *propõe → prévia → um lote → Ctrl+Z*:
   distribuição de tomadas e iluminação mínima pela NBR 5410 9.5.2 (com interruptor junto à
   porta); circuitos automáticos (luz/TUG/TUE sempre separados, critério ambiente|carga|função);
   eletrodutos automáticos por quadro (Prim + Dijkstra com rota limitada, compartilhados entre
   circuitos, prumada entre pavimentos); e pré-dimensionamento (IB, Tab. 36/40/42/47 transcritas
   do PDF, disjuntor IB ≤ In ≤ Iz na série comercial, queda de tensão pelo eletroduto, ocupação
   6.2.11.1.6, demanda e alimentador por quadro).
3. **Entrega** — prancha elétrica NBR 5444 (planta + quadro de cargas + unifilar em PDF/PNG,
   DXF parcial), conferência NBR 5410 com 11 regras em três estados, emissão executiva com ART
   e hash da base, memorial de cálculo em PDF, IFC com as classes certas
   (IfcOutlet/IfcLightFixture/IfcSwitchingDevice/IfcCableCarrierSegment/IfcDistributionCircuit),
   clash de eletroduto × estrutura/outra disciplina e BCF.

O que **não** existe, dito em uma linha cada: hierarquia de quadros e entrada de energia
(medidor, padrão de entrada, concessionária); comando como entidade e **motor de esquemas de
ligação** (a fiação é uma contagem por trecho, o retorno nunca é calculado); DR como peça, DPS,
curva e capacidade de interrupção do disjuntor, curto-circuito; balanceamento e centro de cargas;
quantitativo de fios, quadros, disjuntores, DR e DPS (só eletroduto e contagem de pontos);
plantas de luz e força separadas, multifilar, esquema vertical, detalhamento frontal, memorial
descritivo e DOCX; caixas, curvas, eletrocalhas; desvio de viga/pilar (existe na água, não é
reaproveitado); tipos de ponto além dos 11 (AC, bomba, motor, VE, campainha, espera…).

## 1. Criação e organização do projeto elétrico

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Criação de edificações com múltiplos pavimentos | E | ✅ | `Level` (`model:45-71`); `AddLevel`/`DuplicateLevel` (`commands:172, 1205`) |
| Definição dos níveis da edificação | E | ✅ | `elevationMm`, `defaultHeightMm` por nível |
| Organização do projeto por pavimentos | E | ✅ | `levelId` em trecho, terminal e quadro (`model:2432, 2730, 2862`); o circuito NÃO tem pavimento e pode juntar andares (`model:2910-2915`) |
| Organização por quadros | E | ✅ | `Circuito.quadroId` obrigatório (`model:2934`, invariante `:5483-5491`) |
| Organização por circuitos | E | ✅ | `Terminal.circuitoId` (`model:2746`); "Ligar a…" (`PainelEletrica.tsx:748, 812`) |
| Organização por comandos | A | 🟡 | comando é só a letra `Terminal.comando` (`model:2759-2772`); não há entidade nem lista de comandos |
| Sub-redes elétricas | M | ❌ | — |
| Projeto elétrico segmentado ou unificado | M | ❌ | uma rede por quadro; nada separa em arquivos/vistas por sistema |
| Referências externas de arquitetura | E | ✅ | a arquitetura É o modelo; fundo por imagem/PDF/DXF (`utils/blueprintUnderlay.ts:1-40`); IFC importado vira parede e estrutura (`utils/ifcParaKernel.ts:120-124`) |
| Aproveitamento de lançamentos entre pavimentos | A | ❌ | pavimento-tipo não copia instalação (`model:63-65` "As INSTALAÇÕES não são copiadas") |
| Cópia de elementos entre pavimentos | A | ❌ | `DuplicateEntities` só aceita parede/limite/estrutura/água/abertura (`commands:1229-1248`); área de transferência sem terminal/trecho/quadro (`utils/blueprintAreaDeTransferencia.ts:27-49`) |
| Espelhamento de lançamentos | A | ✅ | `MirrorEntities` com trecho/terminal/quadro (`commands:1032-1044`); girar e mover idem (`:1070-1081, 991-993`) |
| Níveis de desenho independentes | A | 🟡 | `CamadasDaPlanta` só tem `circuitos` como item elétrico (`utils/blueprintTemplatesDeVista.ts:21-35`) |
| Controle de visibilidade dos níveis | A | 🟡 | idem; "Isolar seleção" (`Ed:6968-6974`) |
| Perfis de visualização | M | 🟡 | templates de vista genéricos (`blueprintTemplatesDeVista.ts:1-60`), sem perfil elétrico |
| Importação das configurações de outro projeto | M | ❌ | hipóteses são por estudo (`blueprint_study_eletrica`); não se importam de outro |
| Mesclagem de projetos | M | ❌ | — |
| Kits reutilizáveis de instalações | A | ❌ | kits só na hidráulica (`utils/blueprintPontosHidraulicos.ts:6-11`) |
| Planta de passagens para furos e aberturas | A | ❌ | furos derivados só de escada e núcleo; clash lista trecho×estrutura mas não gera furo (`utils/blueprintKernel/conflitos.ts:257-278`) |

## 2. Pontos elétricos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Tomadas TUG | E | ✅ | `TUG` (`model:2554`); cota 300 (`utils/blueprintRede.ts:657`); potência padrão 100/600 VA (`utils/blueprintPotenciaPadrao.ts:65-77`) |
| Tomadas TUE | E | ✅ | `TUE` (`model:2555`); cota 1200; sem potência padrão (`PotenciaPadrao:23-25`) |
| Tomadas 2P+T | E | 🟡 | o símbolo NBR 5444 já é a tomada 2P+T; não há atributo de padrão/pinos nem de tensão no ponto |
| Tomadas bifásicas | E | 🟡 | só pelo circuito (`ligacao: FF`, `model:2951, 2963`); o terminal não tem tensão/fase própria |
| Tomadas trifásicas | A | 🟡 | idem, `FFF` |
| Tomadas múltiplas | A | ❌ | — |
| Tomadas combinadas | M | ❌ | — |
| Pontos de força | E | ✅ | `LIGACAO_DIRETA` "chuveiro, aquecedor" (`model:2560`); IFC `IfcJunctionBox .POWER.` (`Ifc:2190-2196`) |
| Pontos de espera | A | ❌ | `PONTO_ESPERA` só nas redes hidráulicas (`model:2622, 2671-2672`) |
| Pontos para equipamentos | E | 🟡 | só como `LIGACAO_DIRETA` genérica ou `Terminal.tipo` texto livre (`model:2733`) |
| Condicionadores de ar | E | 🟡 | `Componente` CLIMATIZACAO (EVAPORADORA/CONDENSADORA, `model:1630, 1714-1715`) sem circuito nem potência (`model:1800-1826`); a carga fica numa TUE avulsa |
| Bombas | A | 🟡 | `BOMBA` é tipo hidráulico (`model:2624, 2693`), sem carga elétrica |
| Motores | M | ❌ | fora por decisão (plano 13/09 §7) |
| Portões motorizados | A | ❌ | — |
| Persianas motorizadas | B | ❌ | — |
| Ventiladores | A | ❌ | — |
| Exaustores | A | 🟡 | `Componente EXAUSTOR` (`model:1717`, IFC IfcFan) sem carga elétrica |
| Campainhas | A | ❌ | — |
| Carregadores para veículos elétricos | A | ❌ | — |
| Pontos de detecção e alarme | M | ❌ | — |
| Pontos de aterramento | A | ❌ | — |
| Pontos instalados em conduletes | M | ❌ | — |
| Múltiplos pontos em uma mesma caixa | A | ❌ | não há entidade "caixa"; N terminais no mesmo (x,y) não são agrupados |
| Pontos aparentes e embutidos | A | 🟡 | "embutido no piso" derivado da cota ≤ 0 (`blueprintRede.ts:669-690`); não há atributo "aparente" |
| Atributos por ponto (potência, tensão, fase, tipo, subtipo, 2D/3D, dimensionamento) | E | 🟡 | tem `potenciaW` (tratado como VA), `tipoEletrico`, `interruptor`, `cotaMm`, medidas, símbolo 2D e caixa 3D (`model:2724-2848`; `Blueprint3DViewer.tsx:1160-1201`); tensão e fase só no circuito |

## 3. Iluminação

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento de luminárias | E | ✅ | `ILUMINACAO_TETO/PAREDE/PISO` (`model:2551-2553`); IFC `IfcLightFixture` (`Ifc:2173-2176`) |
| Lançamento de lâmpadas | M | ❌ | não há lâmpada separada da luminária |
| Arandelas | E | ✅ | `ILUMINACAO_PAREDE`; nota 2 da 9.5.2.1 (luz na parede em cômodo pequeno) conferida |
| Fitas LED | M | ❌ | — |
| Luminárias com múltiplas lâmpadas | M | ❌ | — |
| Distribuição automática de luminárias | A | 🟡 | `comandosDeIluminacao` cria UMA luz de teto por cômodo no ponto interior, só se faltar (`Distr:824-906, 869`); sem malha nem luminotécnica |
| Posicionamento manual | E | ✅ | clique no canvas |
| Definição de potência | E | ✅ | `potenciaW` + mínimo da área na primeira luz (`PotenciaPadrao:78-81`) |
| Fluxo luminoso associado à peça | M | ❌ | só VA mínimo da 9.5.2.1.2 (`Distr:573`) |
| Comandos de iluminação | E | ✅ | letra `comando` na luz e no interruptor |
| Interruptor simples | E | ✅ | `UMA_SECAO` (`model:2573-2579`) |
| Interruptor paralelo | E | ✅ | `PARALELO`; par conferido no pavimento (`Distr:668-691`; faltas `Nbr:168-183`); não gera fiação |
| Interruptor intermediário | A | ✅ | `INTERMEDIARIO`; exige os dois paralelos |
| Interruptores múltiplos | E | ✅ | vários no mesmo cômodo, letras distintas |
| Interruptores de várias teclas | E | ✅ | `DUAS_SECOES`/`TRES_SECOES` com "ab"/"abc" (`model:2768-2771`); gerado automaticamente (`Distr:880-903`) |
| Comando da mesma luminária por vários locais | E | 🟡 | mesma letra em vários interruptores; só conferência e símbolo, sem fiação de retorno |
| Comandos entre pavimentos | A | ❌ | o par é procurado no MESMO pavimento (`Distr:629-632, 669-670`) |
| Relé fotoelétrico | A | ❌ | — |
| Painéis de comando | B | ❌ | — |
| Iluminação externa automatizada | M | ❌ | — |
| Associação entre luminárias e comandos | E | 🟡 | só pela letra; o motor de circuitos ignora a letra e liga o interruptor à luz do AMBIENTE (`CircAuto:383-391`) |
| Criação de esquemas personalizados de ligação | M | ❌ | — |

## 4. Distribuição automática de tomadas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Identifica o ambiente | E | ✅ | ponto no polígono do ambiente (`Distr:476-484`); tipo declarado na etiqueta, 5 classes (`Distr:50-65`); o gerador preenche do programa (`utils/blueprintGerador.ts:640, 889`) |
| Considera área | E | ✅ | área recuada (`Nbr:220-221`); menor lado (`Distr:430-435`) |
| Considera perímetro | E | ✅ | perímetro pela FACE das paredes (`Distr:487-493`) |
| Calcula quantidade mínima de tomadas | E | ✅ | `minimoDeTomadas` (`Distr:364-427`), "ou fração" para cima, cozinha ≥ 2, tomadas externas admitidas (e.1 / nota da varanda) |
| Utiliza critérios da NBR 5410 | E | ✅ | 9.5.2.2 auditada contra o texto (plano 13/09 `nbr5410-previsao-de-carga-auditoria`) |
| Posiciona automaticamente as tomadas | E | ✅ | `distribuirAoLongo` fora de portas/janelas com folga de canto (`Distr:205-250, 124-185`) |
| Permite ajustar os pontos manualmente | E | ✅ | nasce `sugerida`; mover apaga a marca (`commands:2285`); "Aceitar sugeridas" (`Ed:2880-2887`) |
| Comando específico de distribuição | E | ✅ | "Distribuir N" e "Completar pela norma" (`components/blueprint/DistribuirTomadas.tsx:27-239`) |

## 5. Circuitos elétricos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Criação de circuitos | E | ✅ | manual (`PainelEletrica.tsx:130, 921-980`) e automática (`CircAuto:277-455`) |
| Circuitos terminais | E | ✅ | é o único tipo que existe |
| Circuitos alimentadores | E | ❌ | não há quadro alimentando quadro (`Quadro` sem pai, `model:2856-2905`); só `alimentadorM` até um medidor que "não está no desenho" |
| Associação dos pontos aos circuitos | E | ✅ | `circuitoId`; "Ligar todos a…" |
| Associação dos circuitos aos quadros | E | ✅ | obrigatória |
| Alteração de circuitos | E | ✅ | `SetCircuitoProps` (`commands:785-795`); célula editável na tabela |
| Movimentação de circuitos entre quadros | A | ❌ | `SetCircuitoProps` não aceita `quadroId`; só apagar e recriar |
| Circuitos reserva | A | ❌ | nenhuma ocorrência |
| Numeração automática | E | 🟡 | `proximoNumeroDeCircuito` = quantidade + 1 (`CircAuto:206-208`) — pode REPETIR número após exclusão; sem renumerar |
| Prefixos personalizados | M | 🟡 | só `nome` texto |
| Nomes personalizados | E | ✅ | `Circuito.nome` |
| Descrições dos circuitos | A | 🟡 | `tipo` texto livre (`model:2937-2938`) não vira coluna |
| Ordenação dos circuitos | A | 🟡 | automático luz→TUG→TUE; tabela por nome (`quadroDeCargas.ts:129, 141`); sem ordem manual |
| Definição da tensão | E | ✅ | `tensaoV` herda do quadro (`CircAuto:444`) |
| Monofásico | E | ✅ | `FN` |
| Bifásico | E | ✅ | `FF` |
| Trifásico | A | ✅ | `FFF`; o automático NÃO herda FFF do quadro (`CircAuto:412-413`) |
| Seleção das fases | A | 🟡 | `fase` R/S/T só para FN em quadro FFF (`PainelQuadroAlimentador.tsx:107-124`); FF fica fora (`Dim:843-844`) |
| Balanceamento por fase | A | ❌ | só MEDE carga por fase e avisa desequilíbrio > 10 % (`Dim:828-861`); nenhum motor atribui fase |
| Definição do método de instalação | E | 🟡 | `HipotesesEletricas.metodoDeInstalacao` A1…D vale para o ESTUDO inteiro (`Dim:46-47, 263`) |
| Tipo de carga | E | 🟡 | `tipo` texto; grupo deduzido dos pontos (`Dim:185-192, 673-678`) |
| Fator de demanda | E | 🟡 | só no quadro, 3 grupos, padrão 1,00, não editável na tela (`Dim:680-688`; `PainelPreDimensionamento.tsx:148-194`) |
| Fator de potência | A | ❌ | "S em VA — não há fator de potência" (`Dim:284-287`) |
| Dispositivo de proteção | E | ✅ | `disjuntorA` declarado + sugerido |
| IDR | E | 🟡 | `protecaoDR: boolean` (`model:2952-2957`) |
| DPS | E | ❌ | — |
| Disjuntor de manutenção | B | ❌ | — |
| Condutores | E | ✅ | `secaoMm2` no circuito; contagem no trecho |
| Condutor de proteção | E | 🟡 | terra DERIVADO para o símbolo (`Cond:37, 93-103`); sem seção própria |
| Configuração de queda de tensão | E | 🟡 | limite terminal 4 % editável; total 5 % só no JSON (`Dim:208, 225-226`) |
| Configuração de circuitos independentes | E | ✅ | TUE/ligação direta um por ponto; 9.5.3.1 conferido (`Nbr:379-420`) |
| Circuitos de força e iluminação separados | E | ✅ | sempre (`CircAuto:19-21, 352-404`); 9.5.3.3 conferido |
| Ordenação flexível dos circuitos no unifilar | M | ❌ | ordem fixa (`Unifilar:254-306`) |

## 6. Comandos elétricos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Criar comandos | E | 🟡 | letra a–z automática ou digitada (`Distr:790-799, 836-844`); sem objeto |
| Nomear comandos | A | 🟡 | só a letra |
| Numerar comandos | A | 🟡 | só a letra, por pavimento (`model:2764`) |
| Relacionar interruptor e luminária | E | 🟡 | mesma letra; conferência 9.5.2.1 (`Distr:641-666`) |
| Alterar comandos posteriormente | E | ✅ | editar a letra no painel |
| Comandar diversos pontos | E | ✅ | mesma letra em várias luzes; "ab"/"abc" |
| Comandar um ponto de locais diferentes | E | 🟡 | paralelo/intermediário conferidos, sem fiação |
| Comandos atravessando pavimentos | A | ❌ | — |
| Cadastrar esquemas de ligação personalizados | M | ❌ | — |

## 7. Quadros elétricos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Quadro de distribuição | E | ✅ | `Quadro` (`model:2856-2905`), medidas 400×300×200, símbolo, 3D |
| Quadro de medição | E | ❌ | — |
| Quadro com transformador | M | ❌ | — |
| Quadro geral | E | ❌ | não há tipo de quadro; todo quadro é igual |
| Caixas de passagem | E | ❌ | — |
| Alimentador predial | E | ❌ | — |
| Entrada de serviço | E | ❌ | — |
| Transformadores | M | ❌ | — |
| Nobreaks | B | ❌ | — |
| Dispositivos de transferência | M | ❌ | — |
| Quadros associados hierarquicamente | E | ❌ | sem `quadroPai`; unifilar por quadro isolado (`Unifilar:118`) |
| Numeração automática de quadros | A | ❌ | nome livre |
| Prefixos | M | ❌ | — |
| Organização de circuitos | E | ✅ | tabela por quadro (`PainelEletrica.tsx`) |
| Circuitos reserva | A | ❌ | — |
| Mudança de circuitos entre quadros | A | ❌ | — |
| Associação entre quadros | E | ❌ | — |
| Cópia de quadros entre pavimentos | A | ❌ | — |
| Dimensionamento das alimentações | E | ✅ | por quadro: `preDimensionarQuadroCompleto` (`Dim:743-826`) — IB, seção, disjuntor geral, queda; `alimentadorM` à mão |
| Geração do quadro de cargas | E | ✅ | tela, prancha, PDF, PNG, DXF-texto (ver §32) |

## 8. Centro de cargas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Considera coordenadas dos pontos | A | ❌ | o único "centro de carga" é de fundação (`utils/blueprintGrupoDeFundacao.ts:19`) |
| Considera potência instalada | A | ❌ | — |
| Considera distribuição das cargas | A | ❌ | — |
| Indica em planta a região recomendada para o quadro | A | ❌ | `AddQuadro` é manual (`commands:742`) |

## 9. Entrada de energia

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Alimentador predial | E | ❌ | — |
| Entrada de serviço | E | ❌ | — |
| Padrão de entrada | E | ❌ | — |
| Quadro de medição | E | ❌ | — |
| Medidores | E | ❌ | "o medidor não está no desenho" (`model:2899-2900`) |
| Associação dos apartamentos/unidades | A | ❌ | — |
| Alimentadores | E | 🟡 | só `alimentadorM` por quadro (`PainelQuadroAlimentador.tsx:69-81`) |
| Configuração de tensão | E | ✅ | `Quadro.tensaoV` |
| Tipo de fornecimento | E | 🟡 | `Quadro.ligacao` FN/FF/FFF; deduzido dos circuitos quando ausente (`Dim:725-741`); sem categoria da concessionária |
| Unidade consumidora individual | E | 🟡 | implícito: um quadro = uma UC |
| Edificação de uso coletivo | A | ❌ | — |
| Dimensionamento conforme concessionária | E | ❌ | excluído por decisão ("verdade da concessionária: sempre preset nomeado", plano 13/09 §7) |
| Dimensionamento do ramal de entrada | E | ❌ | — |
| Demanda da edificação | E | 🟡 | só por quadro (`Dim:771-772`) |
| Cadastro de concessionárias e tabelas de fornecimento | A | ❌ | — |

## 10. Cálculo de demanda

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Potência instalada | E | ✅ | `sInstaladaVA` (`Dim:755-770`; `quadroDeCargas.ts:25-56`) |
| Potência demandada | E | ✅ | `sDemandadaVA` = Σ grupo × fator (`Dim:771-772`) |
| Fatores de demanda | E | 🟡 | 3 grupos fixos, padrão 1,00, sem tabela escalonada por kVA, sem edição na tela |
| Demanda por tipo de carga | E | 🟡 | ILUMINACAO / TUG / FORCA (`Dim:670-688`); dados caem em TUG; sem motores/AC |
| Demanda dos circuitos | M | ❌ | por decisão: terminal usa carga cheia (plano 13/09 F1) |
| Demanda dos quadros | E | ✅ | `preDimensionarQuadroCompleto` |
| Demanda do quadro de medição | E | ❌ | — |
| Demanda do alimentador | E | ✅ | do quadro: IB do alimentador (`Dim:803`) |
| Demanda de edificações de uso coletivo | A | ❌ | — |
| Corrente demandada | E | ✅ | `Dim:803` |
| Demanda do barramento blindado | B | ❌ | — |
| Metodologia CODI / critérios de concessionária | A | ❌ | — |

## 11. Dimensionamento dos condutores

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Corrente de projeto | E | ✅ | `correnteDeProjetoA` S/V ou S/(√3·V) (`Dim:280-291`) |
| Corrente corrigida | E | ✅ | `capacidadeCorrigidaA` = Iz × f_temp × f_agrup (`Dim:296-305`) |
| Capacidade de condução | E | 🟡 | Tab. 36 só cobre/PVC 70 °C (`Dim:46-93`); Tab. 37 (EPR/XLPE) e alumínio não transcritas (`Dim:31-33`) |
| Método de instalação | E | 🟡 | A1, A2, B1, B2, C, D — um só para o estudo (`Dim:263`), não por circuito |
| Agrupamento | E | 🟡 | Tab. 42 só linha 1 (`Dim:120-134`); nº de circuitos MEDIDO no pior trecho do eletroduto (`Dim:1022-1026 → :504`); o alimentador usa a hipótese (`Dim:805`) |
| Temperatura | E | ✅ | Tab. 40 PVC ar/solo (`Dim:100-118`) |
| FCA | E | ✅ | produto dos fatores (`Dim:304`), não exibido como número próprio |
| Queda de tensão | E | ✅ | critério de seção via `secaoParaQuedaMm2` (`Dim:620-638`) |
| Seção mínima | E | ✅ | Tab. 47 1,5/2,5 (`Dim:152-170`); TUE 4,0 é HIPÓTESE declarada (`Dim:142-149`) |
| Sobrecarga | E | 🟡 | IB ≤ In ≤ Iz + "a seção tem de aceitar o menor disjuntor comercial" (`Dim:325-356, 603-617`); **não verifica I2 ≤ 1,45·Iz** |
| Curto-circuito | A | ❌ | fora por decisão (plano 13/09 §7) |
| Requisitos da concessionária | A | ❌ | — |
| Seção mínima configurável | A | 🟡 | só a de TUE (`PainelPreDimensionamento.tsx:183-186`) |
| Fixação manual de seção | E | ✅ | `secaoMm2` declarada é conferida (`Dim:561-589`); não nominal → "não avaliado" |
| Condutores em paralelo por fase | A | ❌ | — |
| Neutro com seção diferente | A | ❌ | uma seção por circuito (`model:2454-2460`); unifilar escreve "2#s + Ts" (`Unifilar:85-90`) |
| Terra com seção diferente | A | ❌ | Tab. 58 não transcrita |
| Retorno com seção diferente | M | ❌ | — |
| Terra independente | M | ❌ | — |
| Configuração da seção do retorno | M | ❌ | — |

## 12. Queda de tensão

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Cálculo automático | E | ✅ | ΔV% = k·ρ·L·IB/(S·V)·100, k = 2 ou √3, só resistência (`Dim:370-386`). ⚠️ o plano 13/09 diz ρ = 0,0217; o código usa 0,0206 (`Dim:266`) — registrar qual vale |
| Queda parcial | A | ❌ | uma conta do quadro ao ponto mais distante; nada por trecho |
| Queda acumulada | E | ✅ | alimentador + pior terminal (`Dim:808-819`) — um nível só, porque não há quadro→quadro |
| Limite máximo configurável | E | 🟡 | terminal 4 % na tela; total 5 % só no JSON; 7 % com trafo só em comentário (`Dim:225`) |
| Verificação por circuito | E | ✅ | `Dim:620-644` |
| Verificação nos alimentadores | E | ✅ | `Dim:808-810`, com a seção CALCULADA (o quadro não tem seção/disjuntor declarados) |
| Queda como critério de dimensionamento | E | ✅ | `secaoParaQuedaMm2` (sugestão, não altera a calculada) |
| Identificação de circuitos fora dos limites | E | ✅ | FALTA 6.2.7 / 6.2.7.1 (`Dim:625-637, 813-819`) |
| Relatórios de queda de tensão | E | ✅ | coluna ΔV na prancha (`Prancha:427`) e no memorial (`Exec:160-166`) |

## 13. Fator de correção e agrupamento — FCA

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Número de circuitos agrupados | E | ✅ | medido no desenho: máximo de circuitos num mesmo trecho do caminho (`Dim:1022-1026`) |
| Quantidade de condutores | E | 🟡 | contagem por trecho sem retorno (ver §21) |
| Forma de instalação | E | 🟡 | método global do estudo |
| Condição do eletroduto/conduto | A | ❌ | Tab. 42 só linha 1 (feixe/embutido/conduto fechado) |
| FCA resultante | E | ✅ | `Dim:304` |
| Capacidade corrigida do condutor | E | ✅ | `Dim:296-305` |

## 14. Dimensionamento de disjuntores

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Dimensionamento automático | E | 🟡 | é SUGESTÃO: menor In com IB ≤ In ≤ Iz (`Dim:363-366, 591-602`); grava só com "usar sugerido" (`PainelPreDimensionamento.tsx:87-103`) |
| Corrente nominal | E | ✅ | `SERIE_COMERCIAL_DE_DISJUNTORES_A` (`Dim:249-260`) |
| Proteção contra sobrecarga | E | ✅ | 5.3.4.1 (`Dim:603-617`) |
| Proteção contra curto-circuito | A | ❌ | — |
| Capacidade de interrupção | E | ❌ | não há Icn/Icu nem declarado nem verificado |
| Compatibilidade cabo × disjuntor | E | ✅ | contra a Iz da seção declarada (`Dim:593, 610-615`); critério DISJUNTOR na seção mínima (`Dim:337-351`) |
| Seleção da peça | A | 🟡 | só In; sem curva, polos, fabricante |
| Disjuntor de manutenção | B | ❌ | — |
| Configuração das capacidades disponíveis | A | 🟡 | série fixa 10…200 A (73 A por decisão do usuário); `hipotesesDaColuna` ignora a lista gravada (`hooks/useBlueprintEletrica.ts:40-43`) |
| Alteração manual da peça escolhida | E | ✅ | `<select>` com a série; legado fora da série em âmbar (`PainelEletrica.tsx:429-453`) |

## 15. IDR / DR

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| IDR individual por circuito | E | 🟡 | `protecaoDR: boolean` (`model:2952-2957`; `PainelEletrica.tsx:418-428`); sem peça |
| IDR para grupos de circuitos | E | ❌ | — |
| IDR geral do quadro | E | ❌ | — |
| Cálculo de corrente nominal | E | ❌ | — |
| Agrupamento de circuitos | E | ❌ | — |
| Associação à proteção | E | ❌ | — |
| Seleção automática da peça | A | ❌ | — |
| Identificação de incompatibilidades | A | ❌ | só a regra 5.1.3.2.2 (banheiro, cozinha/serviço, varanda, chuveiro) exige o booleano (`Nbr:551-601`); 30 mA só no texto |

## 16. DPS

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Inserção de DPS | E | ❌ | nenhuma ocorrência de "DPS"/"surto" |
| DPS em quadros de distribuição | E | ❌ | — |
| Configuração do dispositivo | E | ❌ | — |
| Disjuntor de desconexão do DPS | A | ❌ | — |
| Representação nos diagramas | E | ❌ | — |
| Quantificação na lista de materiais | E | ❌ | — |

## 17. Curto-circuito

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Corrente de curto-circuito | A | ❌ | fora por decisão: exige dado da concessionária/trafo (plano 13/09 §7) |
| Capacidade de interrupção | A | ❌ | — |
| Proteção dos circuitos | A | ❌ | — |
| Compatibilidade do disjuntor | A | ❌ | — |
| Proteção contra corrente de curto-circuito | A | ❌ | — |
| Curto-circuito em barramentos blindados | B | ❌ | — |
| Alertas de capacidade de interrupção insuficiente | A | ❌ | — |

## 18. Eletrodutos e condutos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Eletrodutos circulares | E | ✅ | `Trecho.bitolaMm` (`model:2448`); comerciais 20/25/32/40 (`Eletr:114`) |
| Condutos retangulares | M | ❌ | seção retangular só em calha PLUVIAL (`model:2409`) |
| Eletrocalhas | A | ❌ | — |
| Eletrocalhas lisas | M | ❌ | — |
| Eletrocalhas perfuradas | M | ❌ | — |
| Leitos/canalizações conforme cadastro | B | ❌ | — |
| Condutos aparentes | A | 🟡 | sem atributo; o método de instalação é global |
| Condutos embutidos | E | ✅ | padrão (teto/parede; piso tracejado quando cota ≤ 0, `blueprintRede.ts:688`) |
| Condutos enterrados | A | 🟡 | cota negativa permitida (`model:2436`), sem método D por trecho |
| Ligações horizontais | E | ✅ | `a`,`b` + `cotaAMm/cotaBMm` (`model:2383-2392`) |
| Ligações verticais | E | ✅ | prumada; eletroduto em "L" (`blueprintRede.ts:943-972`) |
| Passagem entre pavimentos | E | ✅ | cota além do pé-direito (`model:5258-5262`); automático sobe/desce na posição do quadro |
| Curvas | A | ❌ | conexões derivadas só hidráulicas (`utils/blueprintKernel/conexoes.ts:148, 196`); a curva 2D é só desenho |
| Conexões | A | ❌ | — |
| Caixas | E | ❌ | não há caixa de passagem/derivação como entidade |
| Conduletes | M | ❌ | — |
| Representação 3D de retangulares/eletrocalhas | M | ❌ | 3D só cilindros (`Blueprint3DViewer.tsx:1101-1158`) |

## 19. Lançamento automático de eletrodutos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Identifica os quadros | E | ✅ | um plano por quadro (`Eletr:495-501`) |
| Procura caminhos possíveis | E | ✅ | grafo nó = pavimento·x·y·cota, laje como encontro (`utils/blueprintGrafoDeRede.ts:35-50`) |
| Analisa as conexões | E | ✅ | BFS ponto→quadro (`GrafoDeRede:131-157`; `Eletr:369-381`) |
| Encontra rotas válidas | E | ✅ | ponto sem circuito fica fora (`Eletr:56-57`) |
| Busca rota economicamente favorável | E | ✅ | Prim com rota limitada + Dijkstra (`GrafoDeRede:55-124, 171-204`); `rotaMaximaVezes` 1,25/1,5/2/∞ (`Eletr:91-111`) |
| Conecta os pontos | E | ✅ | prumada do ponto ao teto (`Eletr:340-346`) |
| Cria os eletrodutos | E | ✅ | `AddTrecho` sugerido; trecho existente GANHA circuitos (`Eletr:239-257, 413-426`); relançar/refazer (`:456-492`) |
| Desvio automático de eletrodutos | A | ❌ | reta no teto (`Eletr:25-44`); o desvio de pilar/viga existe na ÁGUA (`utils/blueprintObstaculosEstruturais.ts`, `utils/blueprintRotaPelasParedes.ts`) e não é reaproveitado |

## 20. Dimensionamento dos eletrodutos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Dimensionamento automático | E | ✅ | `bitolaMinimaPorOcupacao` (`Dim:1003-1015`) no lançamento |
| Verificação da ocupação | E | ✅ | 53 / 31 / 40 % (`Dim:875-879`) |
| Quantidade de condutores | E | 🟡 | contagem por ligação, sem retorno |
| Seção dos condutores | E | ✅ | seção do circuito, ou calculada, ou 2,5 assumida (`Eletr:116-117, 384-391`) |
| Diâmetro mínimo | E | ✅ | `bitolaMm` da hipótese (padrão 25) |
| Percentual de ocupação | E | ✅ | painel do trecho (`PainelTrechoSelecionado.tsx:601`) |
| Regras normativas | E | ✅ | 6.2.11.1.6 na conferência (`Nbr:636-665`) |
| Seleção do diâmetro comercial | E | 🟡 | 20/25/32/40; acima de 40 o automático fixa 40 (`Eletr:396-398`) embora a tabela de Ø interno vá a 85 (`Dim:244-246`) |
| Alertas de dimensionamento | E | ✅ | "Ø X atenderia" |
| FCA relacionado ao agrupamento | E | ✅ | `agrupamentoDoCircuito` medido |

## 21. Lançamento automático da fiação

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Mais de 60 esquemas predefinidos | E | ❌ | 3: `BASE_POR_LIGACAO` FN→F,N,T · FF→F,F,T · FFF→F,F,F,T (`Cond:46-50`) |
| Fase | E | 🟡 | contagem somada por circuito (`Eletr:392-411`); tipo derivado no desenho (`Cond:18-31, 56-67`) |
| Neutro | E | 🟡 | idem |
| Terra | E | 🟡 | idem |
| Retorno | E | ❌ | nunca calculado; "o que passa da base é retorno" só ao desenhar (`Cond:27-29, 63-66`) |
| Condutores de comando | E | ❌ | — |
| Algoritmo escolhe trajetos da fiação | A | ❌ | a fiação é atributo do eletroduto; não há escolha de trajeto |

## 22. Fiação manual

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançar fios manualmente | A | 🟡 | editar a contagem do trecho (`PainelTrechoSelecionado.tsx:582-587`); não há fio como objeto |
| Remover fiação | A | 🟡 | idem |
| Alterar caminho | A | ❌ | — |
| Verificar traçado | A | 🟡 | só o desenho dos traços |
| Adicionar aterramento | A | 🟡 | terra derivado, sempre presente |
| Lançar cabos isolados | M | ❌ | — |
| Alterar seção | E | ✅ | seção do circuito |
| Colocar condutores paralelos | M | ❌ | — |
| Determinar cores | M | ❌ | traço na cor da disciplina (`BlueprintCanvas.tsx:5691`) |
| Modificar representação | M | ❌ | — |

## 23. Esquemas de ligação

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Motor de esquemas (ponto + tipo de circuito → condutores) | E | ❌ | nada depende do tipo do ponto ou do interruptor; só a base por ligação |
| Criar novos esquemas | A | ❌ | — |
| Editar esquemas | A | ❌ | `condutoresPorLigacao` existe na hipótese (`Eletr:88-89`) mas a UI só expõe bitola e rota (`Ed:7058-7061`) |
| Definir tipos e subtipos de pontos | A | 🟡 | taxonomia fechada de 11 tipos + 5 interruptores; sem cadastro |
| Definir condutores | A | ❌ | — |
| Criar combinações personalizadas | A | ❌ | — |

## 24. Otimização gráfica da fiação

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Eliminar sobreposição de textos | A | 🟡 | "MENOS TEXTO" abaixo de 75 % do espaçamento (`BlueprintCanvas.tsx:5662-5741`); sem algoritmo geral de colisão de rótulos |
| Eliminar sobreposição da fiação | A | ✅ | curva alternada em colineares/leque (`utils/blueprintEletrodutoSobreposto.ts:62-164`) |
| Afastar indicações | A | ❌ | — |
| Organizar símbolos | M | ❌ | — |
| Organizar condutos | A | ✅ | entradas espalhadas em 80 % da largura do quadro (`Sobreposto:177-225`) |
| Representar trechos complexos numericamente | A | ❌ | texto escondido sem legenda (`Canvas:5671-5679`); `Trecho.rotulo` não é impresso |
| Gerar legenda correspondente | A | ❌ | — |
| Configurar espaçamentos | M | ❌ | constantes fixas 20 mm / 12° / 14 px (`Sobreposto:36-40`) |

## 25. Barramento blindado

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Modelagem do barramento | B | ❌ | nenhuma ocorrência de "barramento" no código |
| Traçado horizontal | B | ❌ | — |
| Traçado vertical | B | ❌ | — |
| Ligação entre pavimentos | B | ❌ | — |
| Curvas | B | ❌ | — |
| Derivações | B | ❌ | — |
| Caixas de derivação | B | ❌ | — |
| Caixas cofre | B | ❌ | — |
| Plug-ins | B | ❌ | — |
| Unidades de derivação | B | ❌ | — |
| Conexão aos quadros | B | ❌ | — |
| Dimensionamento | B | ❌ | — |
| Cálculo de corrente demandada | B | ❌ | — |
| Cálculo de curto-circuito | B | ❌ | — |
| Cálculo de queda de tensão | B | ❌ | — |
| Representação no diagrama unifilar | B | ❌ | — |
| Esquema vertical | B | ❌ | — |
| Memorial | B | ❌ | — |
| Relatório de queda de tensão | B | ❌ | — |

## 26. Transformadores

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Transformador em baixa tensão | M | ❌ | só o comentário "7 % com transformador próprio" (`Dim:225`) |
| Quadro com transformador | M | ❌ | — |
| Transformador independente | M | ❌ | — |
| Relação de transformação | M | ❌ | — |
| Tensão de entrada | M | ❌ | — |
| Tensão de saída | M | ❌ | — |
| Ligação a quadros subordinados | M | ❌ | — |
| Dimensionamento das alimentações | M | ❌ | — |
| Representação gráfica | M | ❌ | — |
| Quantitativos | M | ❌ | — |

## 27. Nobreak

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Nobreak | B | ❌ | — |
| Alimentação subordinada | B | ❌ | — |
| Circuitos associados | B | ❌ | — |
| Integração à estrutura de quadros | B | ❌ | — |
| Representação no projeto | B | ❌ | — |

## 28. Geradores

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento do gerador | M | ❌ | `model:2068` "gerador" é o de pontos sugeridos (falso positivo) |
| Propriedades elétricas | M | ❌ | — |
| Associação às cargas | M | ❌ | — |
| Dimensionamento do gerador | M | ❌ | — |
| Ligação ao sistema | M | ❌ | — |
| Representação BIM | M | ❌ | — |
| Documentação | M | ❌ | — |
| Quantitativos | M | ❌ | — |

## 29. QTA / dispositivo de transferência

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Quadro/dispositivo de transferência | M | ❌ | — |
| Fonte normal | M | ❌ | — |
| Fonte alternativa | M | ❌ | — |
| Quadros de entrada | M | ❌ | — |
| Quadros de saída | M | ❌ | — |
| Ligação entre gerador e instalação | M | ❌ | — |
| Transferência entre fontes | M | ❌ | — |
| Ligações entre pavimentos | M | ❌ | — |

## 30. Aterramento

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Pontos de aterramento | A | ❌ | não há tipo |
| Condutor PE | E | 🟡 | derivado da ligação para o símbolo (`Cond:1-66, 93-103`); "+ T" no unifilar |
| Terra associado aos circuitos | E | 🟡 | implícito em toda ligação |
| Terra independente | M | ❌ | — |
| Dimensionamento do condutor de proteção | E | ❌ | Tab. 58 (S_PE por S_fase) não existe; PE herda a seção da fase |
| Representação em planta | E | 🟡 | traço do terra na simbologia NBR 5444 (`Prancha:220-273`) |
| Inclusão automática na fiação | E | 🟡 | sempre 1 terra na base por ligação |
| Quantitativos | E | ❌ | nenhum condutor é quantificado (ver §47) |

## 31. Corrente contínua — CC

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Tensão CC configurável | B | ❌ | `LIGACOES_DO_CIRCUITO` é só FN/FF/FFF (`model:2963`) |
| Condutores CC | B | ❌ | — |
| Circuitos CC | B | ❌ | — |
| Dimensionamento | B | ❌ | — |
| Disjuntor CC | B | ❌ | — |
| Fusível CC | B | ❌ | — |
| Seccionadora CC | B | ❌ | — |
| Representação da fiação | B | ❌ | — |
| Diagramas unifilares | B | ❌ | — |
| Diagramas multifilares | B | ❌ | — |

## 32. Quadro de cargas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Circuitos | E | ✅ | `PainelEletrica.tsx:97`; prancha `Prancha:408` |
| Descrição | E | 🟡 | o nome ("C1 — Iluminação social") faz o papel; `tipo` não vira coluna |
| Potência | E | ✅ | `:104`; `Prancha:423` |
| Tensão | E | ✅ | `:98`; `Prancha:421` |
| Esquema (ligação) | E | ✅ | `:99` FN/FF/FFF |
| Fases | E | 🟡 | R/S/T só no `<select>` da aba Quadros em quadro FFF (`PainelQuadroAlimentador.tsx:101-113`); não é coluna |
| Corrente | E | ✅ | IB (`PainelPreDimensionamento.tsx:59`; `Prancha:424`) |
| Demanda | E | 🟡 | só por quadro |
| Fator de potência | A | ❌ | — |
| Condutores (quantidade) | E | ❌ | não é coluna; só o unifilar escreve "2#2,5 + T2,5" |
| Seção | E | ✅ | declarada ao lado da mínima (`:102`; `Prancha:425`) |
| Proteção | E | ✅ | disjuntor declarado/sugerido e DR (`:100-101`; `Prancha:416, 426`) |
| Queda de tensão | E | ✅ | com "(est.)" quando o comprimento é estimado (`Prancha:427`) |
| Status do dimensionamento | E | ✅ | faltas em vermelho, avisos em âmbar, "Fora da avaliação" (`PainelPreDimensionamento.tsx:106-117`) |
| Atualizado automaticamente | E | ✅ | `quadroDeCargas(model)` derivado (`PainelEletrica.tsx:182`); prancha recalcula na exportação (`Prancha:403`) |

## 33. Quadro de cargas e demanda

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Carga instalada | E | ✅ | prancha `Prancha:440`; `PainelQuadroAlimentador.tsx:86` |
| Carga demandada | E | ✅ | idem; `PainelUnifilar.tsx:112` |
| Fatores de demanda | E | 🟡 | 3 grupos, padrão 1,00, sem edição |
| Distribuição por circuito | E | 🟡 | carga sim; demanda por circuito não (decisão) |
| Distribuição por quadro | E | ✅ | — |
| Distribuição por fase | E | ✅ | carga por fase R/S/T e desequilíbrio (`Dim:828-861`; `Prancha:445`) — carga, não demanda |
| Esquema de cargas instaladas e demandadas | M | ❌ | — |

## 34. Diagrama unifilar

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Quadros | E | ✅ | um diagrama por quadro (`Unifilar:118-145`) |
| Circuitos | E | ✅ | ramais (`Unifilar:254-306`) |
| Alimentadores | E | ✅ | condutores, IB, VA demandado, metros (`Unifilar:219-243`) |
| Disjuntores | E | ✅ | geral (`:232-234`) e por ramal com "sug." (`:271-272`) |
| DPS | E | ❌ | — |
| IDR | E | ✅ | quando declarado (`:277-282`) |
| Condutores | E | ✅ | `:85-90, 288` |
| Seções | E | ✅ | idem |
| Fases | E | ❌ | FFF vira "3#"; R/S/T não aparecem |
| Cargas | E | ✅ | VA e nº de pontos (`:305`) |
| Barramento | B | ❌ | — |
| Transformadores | M | ❌ | — |
| Hierarquia do sistema | E | ❌ | sem quadro→quadro |
| Reflete alterações do projeto | E | ✅ | derivado; tela (`PainelUnifilar.tsx:78-125`), PDF folha 3 e PNG (`services/blueprintExportService.ts:411, 443, 688-701`); **não sai em DXF** |

## 35. Diagrama multifilar

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Fases | A | ❌ | nenhuma ocorrência de "multifilar"/"trifilar" |
| Neutro | A | ❌ | — |
| Terra | A | ❌ | — |
| Dispositivos de proteção | A | ❌ | — |
| Circuitos | A | ❌ | — |
| Ligações | A | ❌ | — |
| Personalizar simbologia e apresentação | M | ❌ | — |

## 36. Esquema vertical elétrico

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Pavimentos | E | ❌ | `utils/blueprintEsquemaVertical.ts:27-30` é só AF/AQ/TQ ("ESQUEMA VERTICAL HIDROSSANITÁRIO") |
| Quadros | E | ❌ | — |
| Alimentadores | E | ❌ | — |
| Prumadas | E | 🟡 | só o círculo ↑/↓ na planta (`Prancha:207-212`) |
| Conexões entre pavimentos | A | ❌ | — |
| Hierarquia de alimentação | E | ❌ | depende de quadro→quadro |
| Barramento blindado | B | ❌ | — |

## 37. Plantas de luz e força

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Planta de iluminação | E | ❌ | uma prancha `'eletrica'` só (`blueprintExportService.ts:71-85`); `desenharEletrica` desenha tudo junto (`Prancha:188-335`) |
| Planta de tomadas | E | ❌ | idem |
| Planta de força | E | ❌ | idem |
| Plantas adicionais | M | ❌ | — |
| Diferentes níveis de informação | A | 🟡 | template de vista "Instalações" e toggle `circuitos` (`blueprintTemplatesDeVista.ts:26, 137`) |
| Diferentes configurações de visualização | A | 🟡 | idem |

## 38. Detalhamento frontal

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Caixas | A | ❌ | elevação e corte projetam só TRECHOS (`utils/blueprintElevation.ts:572-606`; `utils/blueprintCorte.ts:493-502`) |
| Tomadas | A | ❌ | — |
| Eletrodutos | A | 🟡 | no corte em PDF só quando uma prancha HIDRÁULICA está marcada (`blueprintExportService.ts:135-137` ignora a elétrica) |
| Eletrocalhas | M | ❌ | — |
| Peças | A | ❌ | — |
| Alturas | A | ❌ | — |
| Relações entre elementos | A | ❌ | — |
| Inserção nas pranchas | A | ❌ | — |

## 39. Modelagem 3D

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Visualização tridimensional | E | ✅ | `Blueprint3DViewer.tsx` |
| Pontos elétricos 3D | E | ✅ | caixa nas medidas (`:1160-1201`) |
| Quadros | E | ✅ | `:1241` |
| Condutos | E | ✅ | cilindros por segmento do "L" (`:1101-1158`) |
| Eletrocalhas | M | ❌ | — |
| Cabos/elementos associados | A | ❌ | — |
| Transformadores | M | ❌ | — |
| Equipamentos | A | 🟡 | componentes (AC, exaustor) sem vínculo elétrico |
| Curvas realistas | M | ❌ | a curva é só 2D (`Sobreposto:16-19`) |
| Alteração de elementos no 3D | A | ❌ | — |
| Propriedades dos elementos | A | 🟡 | seleção a partir do 3D abre o painel; não confirmado para todos os tipos elétricos |
| Controle de aparência | A | 🟡 | "Diâmetros das redes" (`Ed:~11218`) |
| Ocultar/exibir componentes | A | ✅ | olho por componente (memória `project_blueprint_3d_componentes_visibilidade`) |
| Perfis de vistas | M | 🟡 | templates de vista genéricos |
| Caixa de corte 3D | M | ❌ | não encontrado |
| Croqui 2D e 3D simultâneos | A | 🟡 | 3D em vista própria; não conferido lado a lado |
| Mover elementos diretamente em 3D | A | ❌ | — |
| Ajuste automático das conexões adjacentes | A | 🟡 | no 2D: `pontasPresasAsPecas` leva a ponta do trecho junto (`model:4272-4304`); no 3D não há mover |
| Desfazer/refazer operações 3D | M | ❌ | não há operação 3D |

## 40. Ligação volumétrica

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Tomadas | A | 🟡 | a ponta encaixa no `at` + `cotaMm` = CENTRO da peça (`blueprintRede.ts:725-760`) |
| Caixas | A | ❌ | não há caixa |
| Quadros | A | 🟡 | "ancorado no centro do quadro" (`Sobreposto:15-17`) |
| Eletrodutos | A | 🟡 | "conectado" = mesma coordenada no mesmo pavimento/disciplina, sem vínculo por id (`model:4257-4294`) |
| Equipamentos | A | ❌ | — |
| O conduto termina no ponto correto do componente | A | 🟡 | termina no centro, não na face/bocal |

## 41. BIM / IFC

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Importação IFC | E | 🟡 | arquitetura e estrutura sim (`utils/ifcParaKernel.ts:120-124`); elementos ELÉTRICOS não |
| Exportação IFC | E | ✅ | `IfcCableCarrierSegment .CONDUITSEGMENT.` (`Ifc:1966`), `IfcOutlet`/`IfcLightFixture`/`IfcSwitchingDevice`/`IfcJunctionBox` (`Ifc:2164-2202`), `IfcDistributionSystem .ELECTRICAL.` + `IfcDistributionCircuit` (`Ifc:1052-1107`) |
| Arquitetura vinculada | E | ✅ | é o mesmo modelo |
| Estrutura vinculada | E | ✅ | é o mesmo modelo |
| Demais disciplinas MEP | E | ✅ | hidráulica, esgoto, pluvial, mecânica no mesmo kernel |
| Propriedades IFC | E | 🟡 | `Pset_OpuraEletrica` (Tipo, TensaoV, DisjuntorA_Declarado, SecaoMm2_Declarada), `PotenciaW`, `BitolaMm`, `CotaA/B` (`Ifc:928-937, 1004-1012`); sem IB, ligação, DR, fase, condutores; o eletroduto não entra no circuito IFC (`Ifc:1014`); quadro sai como `IfcFlowController` (IFC4 sem ADD2) |
| Atributos personalizados | M | ❌ | — |
| Comprimento | E | ✅ | `Qto_CableCarrierSegmentBaseQuantities` com o "L" real |
| Área | M | ❌ | — |
| Volume | M | ❌ | — |
| Potência | E | ✅ | `PotenciaW` |
| Corrente | A | ❌ | — |
| Outras propriedades | A | 🟡 | ver acima |
| Quantitativos acompanham o modelo BIM | A | 🟡 | eletroduto sim; condutores/peças não (ver §47) |

## 42. Importação Revit

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| RVT | N | ❌ | formato proprietário; o caminho é IFC exportado do Revit |
| RTE | N | ❌ | idem |

## 43. Clash detection

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Detecção de colisões | E | ✅ | `conflitosDoModelo` (`utils/blueprintKernel/conflitos.ts:33-38, 247-299`) |
| Elétrica × arquitetura | E | 🟡 | só trecho × ESTRUTURA; parede/abertura não |
| Elétrica × estrutura | E | ✅ | trecho × pilar/viga/laje |
| Elétrica × hidráulica | E | ✅ | trecho × trecho de outra disciplina |
| Elétrica × incêndio | M | ❌ | não há disciplina de incêndio |
| Elétrica × demais instalações | A | ✅ | mecânica incluída |
| Identificação gráfica | A | 🟡 | "selecionar" na lista (`PainelConflitos.tsx`; `Ed:16040-16057`); sem destaque no 3D |
| Filtro por pavimentos | A | ❌ | — |
| Visualização 3D da interferência | A | ❌ | — |

⚠️ **Possível defeito a confirmar:** o clash usa a DIAGONAL entre as pontas do eletroduto (`pontasNoMundo`, `conflitos.ts:65-70, 254`), enquanto 3D, corte e quantitativo usam o caminho em "L". Um eletroduto com desnível pode acusar colisão onde o 3D não mostra, e vice-versa. Pontos e quadros ficam fora do clash.

## 44. BCF

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Criação de notas BCF | A | ✅ | tópicos `Clash` por trecho, guid igual ao IFC (`utils/blueprintBcf.ts:1-40, 206-271`; export `Ed:3488`) |
| Comentários | A | 🟡 | aceite com justificativa (mín. 3 caracteres) |
| Imagens | M | ❌ | — |
| Localização do problema no modelo | A | ✅ | guid + posição |
| Controle das alterações | A | 🟡 | aceito/aberto |
| Filtro por data | M | ❌ | — |
| Compartilhamento com outros projetistas | A | ✅ | arquivo BCF exportado e lido (`blueprintExportService.ts:1018`) |
| Integração com AltoQi Cloud | N | ❌ | produto de terceiro |

## 45. Biblioteca de peças

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Tomadas | E | ✅ | símbolos NBR 5444 fixos (`Prancha:132-182`) |
| Interruptores | E | ✅ | 5 variantes |
| Luminárias | E | ✅ | 3 tipos |
| Caixas | A | ❌ | — |
| Eletrodutos | E | ✅ | Ø 20/25/32/40 |
| Eletrocalhas | M | ❌ | — |
| Conexões | A | ❌ | — |
| Quadros | E | ✅ | retângulo com diagonal; 3D caixa |
| Disjuntores | E | 🟡 | só a série de In (`Dim:260`), sem peça/curva/fabricante |
| DPS | E | ❌ | — |
| IDR | E | 🟡 | só booleano |
| Condutores | E | 🟡 | só seções nominais (`Dim:78`) |
| Equipamentos etc. | A | 🟡 | componentes de climatização sem carga |

## 46. Cadastro personalizado

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Peças | A | ❌ | — |
| Itens | A | 🟡 | `itemCode` no ponto e no trecho (`model:2449-2450, 2737`) só chega ao IFC |
| Materiais | A | ❌ | — |
| Símbolos 2D | M | ❌ | — |
| Objetos 3D | M | ❌ | — |
| Luminárias | A | 🟡 | famílias/tipos com 4 sementes elétricas (`utils/blueprintCatalogoDeTipos.ts:63-66`; família TERMINAL `utils/blueprintTipos.ts:25, 47-59`), sem itemCode/fabricante |
| Tomadas | A | 🟡 | idem |
| Interruptores | A | 🟡 | idem |
| Caixas | A | ❌ | — |
| Conexões | M | ❌ | — |
| Condutores | M | ❌ | — |
| Disjuntores | A | 🟡 | série fixa, não editável |
| DPS | A | ❌ | — |
| Tipos de ponto | A | 🟡 | taxonomia fechada |
| Subtipos | M | ❌ | — |
| Esquemas elétricos | M | ❌ | — |
| Fabricantes | A | ❌ | — |
| Concessionárias | A | ❌ | — |
| Fatores de demanda | E | 🟡 | só pelo JSON de hipóteses (`hooks/useBlueprintEletrica.ts:46`) |

## 47. Quantitativos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Cabos | E | ❌ | `Trecho.condutores` nunca é multiplicado pelo comprimento (`utils/blueprintKernel/quantities.ts:1686-1721`) |
| Fios | E | ❌ | idem — não há metro de fio por seção |
| Eletrodutos | E | ✅ | comprimento em "L" por bitola (`quantities.ts:1698-1699, 1138-1161`) |
| Eletrocalhas | M | ❌ | — |
| Caixas | E | ❌ | — |
| Tomadas | E | ✅ | contagem por classificação × itemCode (`agruparPorTerminal`, `quantities.ts:1163-1183`); aba Instalações (`TelaQuantitativos.tsx:326-332`); FORA do Resumo (`:291`) |
| Interruptores | E | ✅ | idem |
| Luminárias | E | ✅ | idem |
| Quadros | E | ❌ | fora do `computeQuantities`; só na aba Parâmetros do XLSX (`utils/blueprintPlanilha.ts:477`) |
| Disjuntores | E | ❌ | — |
| IDRs | E | ❌ | — |
| DPS | E | ❌ | — |
| Equipamentos | A | 🟡 | componentes |
| Acessórios | A | ❌ | — |
| Por projeto | E | ✅ | — |
| Por pavimento | E | 🟡 | filtro existe (`blueprintQuantitativosPorPavimento.ts:68`); o resumo por pavimento só tem campos hidráulicos (`:36-44`) |
| Por quadro | A | ❌ | — |
| Por circuito | A | ❌ | — |

Única medida elétrica no de-para do orçamento: `COMPRIMENTO_ELETRODUTO` (`utils/blueprintBudget.ts:367`). `gerarLancamentosDeInstalacoes` cobre AF/AQ/ESG/PLUVIAL e **não a elétrica** (`blueprintBudget.ts:1441, 1488, 1510`). `CONTAGEM_PONTOS_HIDRAULICOS` exclui a elétrica (`:951`).

## 48. Exportação da lista de materiais

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| XLSX | E | ✅ | `blueprintExportService.ts:909-946` (com as lacunas do §47) |
| DOCX | M | ❌ | — |
| HTML | B | ❌ | — |
| Inserção diretamente no desenho | A | ❌ | o quadro de cargas sai na prancha; a lista de materiais não |
| Personalizar campos e fabricante | M | ❌ | — |

## 49. Legendas automáticas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Legenda de símbolos | E | 🟡 | em TEXTO, só tipos presentes, sem o desenho do símbolo; na folha do quadro de cargas e no DXF, não na planta (`Prancha:338-353, 456-457`) |
| Legenda de fiação | E | ✅ | texto (`Prancha:348-349`); rodapé do unifilar (`Unifilar:310-317`) |
| Legenda de condutos | E | ✅ | idem |
| Legenda de materiais | A | ❌ | — |
| Legenda de indicações | A | ❌ | — |
| Legenda numérica para trechos com muita fiação | A | ❌ | — |
| Vinculadas ao projeto e atualizadas automaticamente | E | ✅ | derivadas na exportação |

## 50. Memorial descritivo

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Memorial descritivo (o documento) | E | ❌ | só existe o memorial de CÁLCULO, gerado na emissão da ART (`Exec:130-178`; `Ed:4187-4204`); o hidro tem descritivo + cálculo em PDF e DOCX |
| Informações do projeto | E | ✅ | responsável, ART, hash da base |
| Textos padrão | E | 🟡 | fixos no PDF |
| Textos personalizados | A | ❌ | — |
| Relatórios | E | ✅ | quadros e circuitos, verificações |
| Quantitativos | E | ❌ | não entram no memorial |
| Legendas | A | ❌ | — |
| Informações técnicas | E | ✅ | hipóteses e normas citadas |
| Blocos de texto reutilizáveis | M | ❌ | — |
| DOCX | A | ❌ | `utils/blueprintMemorialDocx.ts:9` consome `BlocoDoMemorial` do hidro; a elétrica não gera blocos |

## 51. Relatórios técnicos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Dimensionamento de circuitos | E | ✅ | tela, prancha e memorial |
| Dimensionamento de quadros | E | ✅ | bloco "Alimentação" e memorial |
| Demanda | E | ✅ | instalada × demandada por quadro |
| Queda de tensão | E | ✅ | coluna ΔV |
| Barramento blindado | B | ❌ | — |
| Memorial de barramento | B | ❌ | — |
| Quantitativos | E | 🟡 | XLSX sem condutores/peças |
| Lista de materiais | E | ❌ | — |
| Documentação técnica | E | 🟡 | prancha + memorial de cálculo; sem descritivo |

## 52. Verificação automática e diagnóstico

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Carga excessiva | E | ✅ | IB > Iz (`Dim:567-573`); circuito comum > 16 A (`Nbr:487-501`); aviso na prévia (`CircAuto:417, 428-430`) |
| Condutor insuficiente | E | ✅ | Tab. 36 e Tab. 47 (`Dim:567-587`) |
| Proteção inadequada | E | ✅ | 5.3.4.1 (`Dim:603-617`) |
| Queda de tensão excessiva | E | ✅ | 6.2.7 (`Dim:620-641`); 6.2.7.1 da origem só no painel do quadro, **não na aba Conferência** (`PainelQuadroAlimentador.tsx:128-137`) |
| Ausência de esquema compatível | A | ❌ | não há esquemas |
| IDR não encontrado | E | ✅ | 5.1.3.2.2 (`Nbr:578-601`) |
| Disjuntor incompatível | E | ✅ | cabo × disjuntor |
| Capacidade de interrupção insuficiente | A | ❌ | — |
| Ponto acima de 10 A sem circuito adequado | E | ✅ | 9.5.3.1 (`Nbr:379-420`) |
| Iluminação e força no mesmo circuito | E | ✅ | 9.5.3.3 com as condições da norma (`Nbr:462-527`) |
| Problemas relacionados à concessionária | A | ❌ | — |

Onde a conferência aparece: aba "Conferência NBR 5410" do Quadro de cargas, por pavimento
(`PainelConferenciaNbr.tsx`; `Ed:4166-4169, 8915`), três estados + "Fora da avaliação" +
"(parcial)"; emissão executiva confere o modelo inteiro (`Exec:63-110`); memorial seção 5. Na
prancha só saem as FALTAs do pré-dimensionamento (`Prancha:368, 432-435`). ⚠️ A regra PRE-DIM
não filtra por pavimento (`Nbr:612`).

## 53. Fotovoltaico

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Módulos fotovoltaicos | M | ❌ | nenhuma ocorrência de "fotovolt" |
| Inversores | M | ❌ | — |
| Baterias | B | ❌ | — |
| Controladores | B | ❌ | — |
| Caixas de junção | M | ❌ | — |
| Sistemas on-grid | M | ❌ | — |
| Sistemas off-grid | B | ❌ | — |
| Strings/séries | M | ❌ | — |
| Arranjos | M | ❌ | — |
| Dimensionamento CC | M | ❌ | — |
| Dimensionamento CA | M | ❌ | — |
| Proteções CC | M | ❌ | — |
| Integração CC/CA | M | ❌ | — |
| Diagramas | M | ❌ | — |
| Quantitativos | M | ❌ | — |
| Cálculo de geração | M | ❌ | — |
| Análise de retorno do investimento | B | ❌ | — |

## 54. SPDA

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Análise de risco | A | ❌ | fora por decisão ("outra norma, outro módulo", plano 13/09 §7); só `services/maintenanceCatalog.ts:43-45` cita SPDA |
| NBR 5419 | A | ❌ | — |
| Nível de proteção | A | ❌ | — |
| Captores | A | ❌ | — |
| Captores naturais | A | ❌ | — |
| Descidas | A | ❌ | — |
| Malha de aterramento | A | ❌ | — |
| Dimensionamento | A | ❌ | — |
| Verificação gráfica | A | ❌ | — |
| Quantitativos | A | ❌ | — |
| Memoriais | A | ❌ | — |
| Relatórios | A | ❌ | — |

## 55. Cabeamento estruturado

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Pontos de telecomunicação | M | 🟡 | `DADOS_TELEFONE/TV/REDE/USB` → `IfcOutlet` (`model:2556-2559`) |
| Racks | M | ❌ | — |
| Cabos | M | ❌ | — |
| Patch panels e componentes | M | ❌ | — |
| Tomadas RJ45 | M | 🟡 | `DADOS_REDE` |
| Lançamento da rede | M | ❌ | — |
| Dimensionamento | M | ❌ | — |
| Esquema vertical | M | ❌ | — |
| Mapa de cabos | M | ❌ | — |
| Identificação de origem/destino | M | ❌ | — |
| Comprimento dos cabos | M | ❌ | — |
| Quantitativos | M | 🟡 | contagem dos pontos de dados |
| Detalhamento BIM | M | ❌ | — |

## O modelo único

Como no hidrossanitário, o ÒPURA já funciona com um modelo do qual tudo deriva — e é por isso
que quadro de cargas, unifilar, prancha, IFC, conferência e memorial já saem sem sincronização:

- **O que é guardado**: `Terminal` (ponto tipado, potência, comando-letra, circuito),
  `Circuito` (quadro, tensão, ligação, fase, seção e disjuntor DECLARADOS, DR), `Quadro`
  (posição, ligação, tensão, metros do alimentador), `Trecho` (eletroduto com bitola, cotas,
  contagem de condutores, circuitos) e as `HipotesesEletricas` por estudo.
- **O que é derivado, e nunca copiado**: IB, Iz corrigida, seção mínima, disjuntor sugerido,
  queda, ocupação, demanda, carga por fase, condutores por tipo no desenho, quadro de cargas,
  unifilar, conferência NBR 5410, hash da base, memorial, IFC, clash.
- **Onde a regra ainda vai precisar de peça nova no modelo** (e não de tela nova) — e é isto
  que ordena o roadmap:
  - **comando** como relação tipada (hoje é uma letra por pavimento) e **condutores por trecho
    derivados de um esquema de ligação** (hoje uma contagem fixa por ligação, sem retorno);
  - **quadro com pai e tipo** (QD, QGBT, medição) e a **entrada de energia** no desenho;
  - **DR e DPS como peças**, disjuntor com curva e capacidade de interrupção;
  - tipos de ponto para **AC, motores/bombas, campainha, portão, VE, espera** e a **caixa**
    como entidade;
  - **seção por condutor** (neutro e PE — Tab. 58).

## Os motores

Os 10 motores da proposta do usuário, como camadas do mesmo modelo:

| Motor (proposta) | Hoje | Arquivos | Falta o essencial |
|---|---|---|---|
| 1. Modelo Elétrico | 🟡 | `blueprintKernel/model.ts` (Terminal/Quadro/Circuito/Trecho) | tipos de ponto (AC, motor, VE, espera…), caixa, quadro com tipo e pai, entrada, tensão/fase visíveis no ponto |
| 2. Circuitação | ✅ / 🟡 | `blueprintCircuitosAutomaticos.ts`, `PainelEletrica.tsx` | comando como relação, alimentador quadro→quadro, balanceamento, mover circuito, reserva, numeração sem repetir |
| 3. Conectividade | 🟡 | `blueprintEletrodutos.ts`, `blueprintGrafoDeRede.ts`, `blueprintCondutores.ts` | **motor de esquemas de ligação e fiação com retorno**, desvio estrutural (reaproveitar a água), caixas de passagem |
| 4. Cálculo | ✅ / 🟡 | `blueprintEletricaDimensionamento.ts` | demanda por tabela nomeada, Tab. 37, Tab. 42 completa, I2 ≤ 1,45·Iz, PE/neutro (Tab. 58), queda multinível |
| 5. Proteção | 🟡 | idem + `blueprintNbr5410.ts` (5.1.3.2.2) | **DR como peça (grupo/geral), DPS, curva, Icn, Ik simplificado** |
| 6. Entrada e Distribuição | ❌ | — | medição, padrão de entrada por preset de concessionária, hierarquia; trafo/gerador/QTA/barramento ficam no backlog |
| 7. BIM | ✅ / 🟡 | `blueprintIfc.ts`, `conflitos.ts`, `blueprintBcf.ts`, `Blueprint3DViewer.tsx` | propriedades elétricas completas, eletroduto no circuito IFC, importar elétrica, clash com pontos/quadros, destaque 3D |
| 8. Documentação | 🟡 | `blueprintPranchaEletrica.ts`, `blueprintUnifilar.ts`, `blueprintEletricaExecutivo.ts` | plantas de luz e força, esquema vertical, legenda desenhada, memorial descritivo + DOCX, unifilar em DXF; multifilar e detalhamento frontal são A |
| 9. Quantitativos | 🟡 | `quantities.ts`, `blueprintBudget.ts` | **fios por seção, quadros, disjuntores, DR, DPS, caixas; por quadro/circuito; lançamento no orçamento** |
| 10. Extensões | ❌ | — | fotovoltaico, SPDA, cabeamento — backlog por decisão |

Dos quatro motores combinados que o usuário destacou — **distribuição de pontos + circuitação
+ roteamento de eletrodutos + fiação** —, três estão de pé e o quarto (fiação por esquema de
ligação) é o maior buraco: sem ele não há retorno, não há metro de fio, e o quadro de cargas
não sabe quantos condutores cada circuito tem.

## Leitura geral

Contagem feita por script sobre as tabelas acima (623 linhas: os 599 itens do pedido, na mesma
ordem, mais 24 desdobramentos que o próprio texto do pedido pedia — atributos do ponto,
comando de distribuição, algoritmo da fiação, motor de esquemas, memorial descritivo, DOCX…):

| Grau | ✅ | 🟡 | ❌ | Total |
|---|---|---|---|---|
| **E** | 158 | 59 | 57 | 274 |
| **A** | 10 | 49 | 118 | 177 |
| **M** | 0 | 6 | 112 | 118 |
| **B** | 0 | 0 | 51 | 51 |
| **N** | 0 | 0 | 3 | 3 |
| **Total** | 168 | 114 | 341 | 623 |

**O que isso diz:**

- **Dos 274 Essenciais, 158 estão prontos (58 %)** — proporção maior que a do hidrossanitário
  no dia do benchmark dele (40 %), porque setembro já entregou os motores de tomadas, circuitos,
  eletrodutos e pré-dimensionamento, com prancha, unifilar e ART. O "lançar, circuitar e
  pré-dimensionar" de uma casa está de pé.
- **Os 116 Essenciais que faltam (57 ❌ + 59 🟡) estão em três lugares**: o que o modelo ainda
  não representa (entrada de energia, hierarquia de quadros, DR/DPS como peças, comando e
  fiação por esquema), o que a entrega ainda não mostra (plantas de luz e força, esquema
  vertical, memorial descritivo, lista de materiais) e o que o quantitativo ainda não conta
  (fios, quadros, disjuntores).
- **Tudo o que é B (51) e quase tudo o que é M (112 de 118) está em ❌ de propósito**:
  barramento blindado, CC, nobreak, trafo, gerador/QTA, fotovoltaico, cabeamento. É onde o
  AltoQi cobre o industrial/comercial que a incorporadora não projeta.

**O caminho crítico — os 116 Essenciais ❌/🟡 agrupados pelo que precisam no código** (cada
item está em exatamente um bloco; a soma é conferida por seção):

| # | Bloco | Itens E | Seções | Peça principal que falta |
|---|---|---|---|---|
| 1 | **Hierarquia de quadros e entrada de energia** | 26 | 5, 7, 9, 10, 34, 36 | `Quadro.tipo` + `quadroPaiId`, circuito alimentador derivado, medidor/entrada no desenho, preset nomeado de concessionária, demanda e queda acumuladas, unifilar hierárquico, esquema vertical |
| 2 | **Cálculo fino e hipóteses na tela** | 18 | 5, 10, 11, 12, 13, 14, 20, 32, 33, 46 | fatores de demanda por tabela nomeada e editáveis, Tab. 37, Tab. 42 completa, método por circuito, I2 ≤ 1,45·Iz, limite total na tela, Ø > 40 |
| 3 | **Proteção: DR, DPS e disjuntor** | 18 | 5, 14, 15, 16, 34, 45 | DR como peça (In, IΔn, escopo circuito/grupo/geral), DPS no quadro, curva e Icn do disjuntor, alertas |
| 4 | **Comandos, esquemas de ligação e fiação** | 22 | 3, 5, 6, 13, 20, 21, 23, 30, 32, 45 | comando como relação, tabela de esquemas (ponto + ligação → F/N/R/T), condutores por trecho DERIVADOS com retorno, PE e neutro por Tab. 58, condutores no quadro de cargas |
| 5 | **Modelo de pontos e caixas** | 7 | 2, 5, 18 | tipos AC/equipamento com carga, tensão e padrão da tomada visíveis, caixa como entidade, numeração de circuitos sem repetir |
| 6 | **Quantitativos e orçamento** | 11 | 30, 47, 51 | metro de fio por seção, quadros, disjuntores, DR, DPS, caixas; por pavimento/quadro/circuito; lançamento no orçamento; lista de materiais |
| 7 | **Documentação** | 11 | 32, 34, 37, 49, 50, 51 | plantas de luz e força separadas, fases no unifilar e no quadro, legenda desenhada na planta, memorial descritivo, quantitativos no memorial |
| 8 | **BIM** | 3 | 41, 43 | propriedades elétricas no IFC, importar elétrica, clash com parede/abertura |
| | **Total** | **116** | | |

**Desvio inverso** (esforço acima do grau): pequeno — a curva dos eletrodutos sobrepostos, a
entrada espalhada no quadro e a emissão com hash são A/E de verdade. O que sobrou de A pronto
(espelhar, BCF, 3D) já era da Planta e não custou nada à elétrica.

**Achados que não são funcionalidade, mas precisam de decisão antes do roadmap** (vieram das
quatro leituras):

1. `ρ` da queda de tensão: o plano de 13/09 diz 0,0217 Ω·mm²/m; o código usa 0,0206
   (`Dim:266`). Escolher um e registrar a fonte.
2. O clash mede pela DIAGONAL do eletroduto, o resto do sistema pelo "L" (§43).
3. `proximoNumeroDeCircuito` conta circuitos e pode repetir número após exclusão (§5).
4. A regra PRE-DIM da conferência não filtra por pavimento (`Nbr:612`), as outras filtram.
5. 6.2.7.1 (queda da origem) aparece só no painel do quadro, não na aba Conferência.
6. `model.ts:2875-2877` diz que o quadro "NÃO tem rotação", mas `rotacaoGraus` existe em `:2895`.
7. A nota de 17/09 no plano de circuitos ("prumada entre pisos fica para depois") está
   desatualizada — o código faz desde 15/09.

---

# Parte 2 — Roadmap: "substituir o projetista" na elétrica residencial

## Corte e ordem

| Entra | Fica (registrado no fim) |
|---|---|
| Os **116 Essenciais** pendentes, e os itens A que um deles exige para funcionar (mover circuito entre quadros junto da hierarquia; balanceamento e centro de cargas como motor de automação; desvio estrutural porque já existe na água) | O resto dos A, os M e os B viram backlog nomeado: barramento blindado, trafo, nobreak, gerador/QTA, CC, fotovoltaico, SPDA, cabeamento estruturado, multifilar, detalhamento frontal, eletrocalhas, Revit, biblioteca personalizada/fabricantes, luminotécnica |

**Ordem:** a Etapa 0 primeiro porque é barata e visível (hipóteses na tela, quantitativo do que
já existe, os 7 achados). Depois **modelo → fiação → proteção → entrada**, porque cada uma
dessas quatro muda o kernel e as seguintes leem o que a anterior gravou: a fiação por esquema
(E2) precisa dos tipos de ponto (E1); DR por grupo (E4) precisa dos condutores por circuito
(E2); a hierarquia (E3) precisa de DR/DPS para o unifilar hierárquico sair completo. A
documentação (E5) vem depois, para que cada cálculo novo já tenha onde aparecer — mas cada
etapa anterior acrescenta sua linha à prancha e ao memorial existentes, não deixa para o fim.
Automação (E6) e BIM (E7) fecham.

## Regras que valem para todas as fases

- **REGRA #8:** uma frente por etapa (`bash scripts/nova-frente.sh eletrico-e<N>`); push em
  `main` é o deploy; `conferir-producao.sh` prova. Ritual: `tsc`, suíte cheia,
  `check-ui-standard` nos `.tsx` tocados, `check-xss-sinks`, harness visual quando há desenho
  (molde: `docs/spikes/prancha-eletrica`), plano atualizado, commit, push, conferência de fora.
- **Modelo único:** só se grava o que o projetista decide (ponto, circuito, quadro, peça
  declarada, hipótese). Corrente, seção sugerida, condutores por trecho, demanda, quadro de
  cargas, unifilar, memorial e quantitativo são **derivados**, recalculados a cada mudança.
  Quando um derivado admite ajuste (seção, disjuntor, condutores), o padrão é "declarado vence
  sugerido, sugerido sai marcado" — o mesmo do pré-dimensionamento de hoje.
- **Kernel:** campo ou entidade nova no canônico → bump de `KERNEL_VERSION` + goldens
  (`__tests__/blueprintKernelGoldens.test.ts`) + `node scripts/build-planta-api-kernel.mjs` +
  redeploy da `planta-api` com prova de 401. Mudança de quantitativo → `POLITICA_PADRAO.version`.
  Mudança de hipótese → lembrar que muda `hashDaBaseEletrica` das emissões antigas (dito na tela).
- **Norma citada com fonte** (NBR 5410:2004 item/tabela) em cada constante; o que não for norma
  é **hipótese declarada** no código, no drawer e no memorial (molde: TUE 4 mm²). Tabela
  transcrita de memória fica marcada "CONFERIR NA NORMA" até o usuário colar o texto.
- **Verificação com três estados + "não avaliado"** (molde `PainelConferenciaNbr` /
  `blueprintNbr5410.ts`); toda regra nova entra na conferência, na emissão executiva e no
  memorial no mesmo commit.
- **Automatismo novo segue o molde** propõe → prévia → um `runBatch` → Ctrl+Z, com
  `conferirPlano` quando prevê ids.
- **Prova na planta real** só em estudo descartável, conferindo o banco depois
  (`feedback_bloqueio_playwright_nao_segurou_autosave_planta`).

---

## Etapa 0 — Trilhos rápidos (sem bump de kernel) · 4 fases · **✅ CONCLUÍDA em 29/09/2026 (4 de 4)**

| Fase | Entrega (o que muda) | Pronto quando (como sei que terminou) |
|---|---|---|
| 0.1 Hipóteses na tela e os 7 achados ✅ (5 de 7; achados 2 e 3 vão para 0.4 e 0.2) | `PainelPreDimensionamento` ganha: fatores de demanda **por tabela nomeada** (presets "sem demanda", "NBR 5410 residencial — hipótese" e "personalizado", cada grupo editável), `limiteQuedaTotalPct`, `desequilibrioMaxPct`; decisão registrada do `ρ`; `I2 ≤ 1,45·Iz` na sobrecarga (5.3.4.1 completo); 6.2.7.1 entra na aba Conferência; PRE-DIM filtra por pavimento; comentário do quadro corrigido; nota de 17/09 corrigida no plano | teste de `preDimensionarCircuito` com I2 falhando; conferência lista 6.2.7.1; hipóteses gravadas em `blueprint_study_eletrica` aparecem no memorial; `blueprintEletricaDimensionamento.test.ts` verde; harness da prancha olhado |
| 0.2 Circuitos: numeração, mover e ordenar ✅ (ordem manual → E4.1) | `proximoNumeroDeCircuito` = maior número existente + 1, com "Renumerar" (lote, Ctrl+Z); `SetCircuitoProps.quadroId` (mover circuito entre quadros — trechos que só serviam ao circuito seguem marcados "conferir"); ordem manual (`Circuito.ordem` opcional é payload → **fica para E3**; aqui só ordenação por número); coluna Descrição (`tipo`) e coluna Fases na tabela padrão | teste: apagar C2 e criar → C4, não C2; mover circuito muda o unifilar dos dois quadros; `check-ui-standard` em `PainelEletrica.tsx` |
| 0.3 Quantitativo do que já existe · quant-1.19.0 ✅ | `computeQuantities` passa a contar **quadros** (por medidas), **disjuntores** (por In declarado), **DR** (por circuito com `protecaoDR`), **pontos por circuito e por quadro**, e **metros de condutor por seção** = Σ trecho (comprimento em "L" × `condutores`), com o aviso "sem retorno até a E2"; resumo por pavimento ganha os campos elétricos; medidas `COMPRIMENTO_CONDUTOR`, `CONTAGEM_QUADROS`, `CONTAGEM_DISJUNTORES`, `CONTAGEM_DR`, `CONTAGEM_PONTOS_ELETRICOS` no de-para; `gerarLancamentosDeInstalacoes` cobre `ELETRICA` | teste portão de `POLITICA_PADRAO.version`; XLSX com as abas novas; um estudo de prova lança linhas UN/M no orçamento e é apagado depois |
| 0.4 Clash pelo "L" e fases visíveis ✅ (pontos/quadros no clash → E7.2) | `conflitos.ts` usa `segmentosDoEletroduto` (o "L") no lugar da diagonal; pontos e quadros entram no clash como caixas; fases R/S/T no unifilar (3 barras rotuladas) e coluna no quadro de cargas | teste com eletroduto em desnível: colisão onde o 3D mostra; unifilar de quadro FFF mostra R/S/T; `blueprintUnifilar.test.ts` |

Fecha o bloco **6** (parcial — o fio completo depende da E2), parte do **2** e do **7**, e os achados.

## Etapa 1 — Modelo de pontos e caixas · kernel bump · 3 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1.1 Tipos de ponto que faltam | `TIPOS_DE_PONTO_ELETRICO` ganha `AR_CONDICIONADO`, `MOTOR_BOMBA`, `CAMPAINHA`, `PORTAO`, `CARREGADOR_VE`, `PONTO_ESPERA`, `VENTILADOR_EXAUSTOR`, `ATERRAMENTO`, cada um com cota usual, potência padrão (hipótese nomeada — AC por BTU, VE 7,4 kW), grupo de carga (novo grupo `MOTOR` com fator próprio), uso do circuito (TUE/FORCA), símbolo NBR 5444, entidade IFC (`IfcElectricAppliance`, `IfcElectricMotor`, `IfcAudioVisualAppliance`…) e regra 9.5.3.1 quando > 10 A | goldens com os tipos novos; `blueprintPontoEletricoTipos.test.ts`; menu de inserir mostra os grupos; IFC valida no visualizador |
| 1.2 Componente com carga | `Componente` de CLIMATIZACAO/EXAUSTOR **lança o ponto elétrico** ao ser inserido (molde: louça → ponto hidráulico, 27/09) e o ponto carrega a potência do componente; caixa `CAIXA_PASSAGEM` como terminal com medidas (4×2, 4×4, octogonal) — a tomada/interruptor já é a própria caixa | inserir evaporadora cria `AR_CONDICIONADO` na parede atrás dela; apagar o componente apaga o ponto (invariante); caixa aparece no 2D/3D/IFC/quantitativo |
| 1.3 Tensão e padrão visíveis no ponto; copiar entre pavimentos | painel do ponto mostra tensão e ligação **derivadas do circuito** e o padrão da tomada (2P+T 10 A / 20 A por potência, hipótese); `DuplicateLevel`/área de transferência aceitam terminal, trecho e quadro (com `circuitoId` remapeado ou zerado — dito na prévia) | teste: duplicar pavimento copia pontos e eletrodutos, circuitos ficam por criar; Ctrl+V de seleção elétrica funciona; goldens |

Fecha o bloco **5**.

## Etapa 2 — Comandos, esquemas de ligação e fiação · kernel bump · 4 fases · **o motor que falta**

| Fase | Entrega | Pronto quando |
|---|---|---|
| 2.1 Comando como relação | `Comando {id, letra, nome?, levelIds[]}` derivado das letras (índice), com **letra global opcional** para comando entre pavimentos (`Terminal.comandoGlobal: boolean`); painel "Comandos" no Navegador: renomear, listar interruptores e luzes, achar par de paralelo em outro andar | conferência 9.5.2.1 aceita paralelo em pavimentos diferentes quando global; goldens; teste `blueprintNbr5410Iluminacao` |
| 2.2 Motor de esquemas de ligação | `utils/blueprintEsquemasDeLigacao.ts` puro: tabela **ESQUEMAS** (interruptor simples / 2 e 3 seções / paralelo / intermediário / luz sem interruptor / tomada / TUE / ligação direta × FN/FF/FFF → condutores F, N, R, T por TRECHO entre os pontos do comando), com fonte (NBR 5410 6.1.5 + prática de prancha); `condutoresDoTrecho(model, trecho)` passa a **derivar** fase/neutro/retorno/terra por circuito e por comando que atravessa o trecho — retorno só entre interruptor e luz; `Trecho.condutores` vira **declarado opcional** que sobrescreve (marcado na tela) | teste com sala: interruptor paralelo + 2 luzes → o trecho entre os interruptores tem 2 retornos e nenhum neutro; prancha mostra os traços certos; `blueprintCondutores.test.ts` reescrito |
| 2.3 Seção por condutor | `SECOES_PE_TAB58` (S_PE por S_fase, NBR 5410 Tab. 58) e regra do neutro (6.2.6.2: igual à fase em FN/FF e FFF ≤ 25 mm²; redução admitida acima, hipótese); `Circuito.secaoNeutroMm2`/`secaoPeMm2` declarados opcionais; unifilar escreve "2#2,5 + N2,5 + T2,5" quando diferem; quantitativo de fio **por tipo e seção** substitui o total da 0.3 | teste Tab. 58 pontos contra o PDF; `Trecho.condutores` declarado ≠ derivado aparece em âmbar; quant bump |
| 2.4 Fiação na planta e no quadro de cargas | rótulo por trecho com contagem por tipo; coluna "Condutores" no quadro de cargas ("2F+N+T"); ocupação do eletroduto usa a seção real de cada condutor (não mais a do 1º circuito); legenda numérica de trecho quando > N condutores (`Trecho.rotulo` impresso + tabela na folha) | harness da prancha olhado com trecho de 7 condutores; `ocupacaoDoEletrodutoCompartilhado` com seções mistas testado |

Fecha o bloco **4** e completa o **6** (fios).

## Etapa 3 — Proteção: DR, DPS e disjuntor · kernel bump · 3 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 3.1 DR como peça | `Quadro.drs[]: {id, inA, idnMa (30/100/300), polos, escopo: 'GERAL' \| circuitoIds[]}` substitui `Circuito.protecaoDR` (migração de leitura: booleano vira DR individual de 30 mA); sugestão automática: In ≥ disjuntor do grupo, 30 mA onde 5.1.3.2.2 exige; regra "circuito exigido sem DR", "DR com In < soma", "mais de N circuitos no mesmo DR (hipótese)"; unifilar e quadro de cargas mostram o DR na posição certa (geral / grupo / ramal) | goldens; `blueprintNbr5410DrEPreDim.test.ts`; legado com `protecaoDR: true` lê igual; quantitativo conta DR por In/IΔn |
| 3.2 DPS no quadro | `Quadro.dps?: {classe (I/II), upKv, inKa, disjuntorDesconexaoA}` com sugestão (classe II, 20 kA, hipótese) e regra 6.3.5.2 "quadro de entrada sem DPS" (aviso, porque depende da exposição — declarada como hipótese `exposicaoARaios`); unifilar, quadro de cargas, quantitativo, memorial | teste: quadro sem pai e sem DPS → AVISO; com DPS → símbolo no unifilar |
| 3.3 Disjuntor completo e curto simplificado | `Circuito.curva ('B' \| 'C' \| 'D')` e `Quadro.icnKa` declarados; hipótese `ikEntradaKa` (corrente de curto na entrada, padrão 4,5 kA "a confirmar com a concessionária"); regra "Icn < Ik" (FALTA) e `quadroDeCargas` com coluna Curva/Icn; **fora**: cálculo de Ik por impedância (backlog) | teste Icn 3 kA × Ik 4,5 → FALTA citando 5.3.5.5; memorial lista Icn e Ik assumido |

Fecha o bloco **3**.

## Etapa 4 — Hierarquia de quadros e entrada de energia · kernel bump · 5 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 4.1 Quadro com tipo e pai | `Quadro.tipo: 'QD' \| 'QGBT' \| 'MEDICAO'` e `quadroPaiId?`; **circuito alimentador derivado** (quadro filho = uma linha no quadro de cargas do pai, com IB = demanda do filho); `alimentadorM` passa a ser derivado do eletroduto entre os dois quadros quando existe, declarado quando não; `Circuito.reserva: boolean` (linha sem pontos, conta no quadro e no unifilar) | goldens; `preDimensionarQuadroCompleto` do pai soma os filhos; ciclo de pais → invariante; teste com QGBT → QD1, QD2 |
| 4.2 Demanda e queda acumuladas | demanda do pai = Σ demanda dos filhos + cargas próprias, com **fatores por tabela nomeada** (presets por concessionária como hipótese com fonte e data — a "verdade da concessionária" continua preset, nunca embutida); queda acumulada multinível até a origem (6.2.7.1: 5 %, ou 7 % com trafo — hipótese `origemComTransformador`) | teste: QGBT→QD→C1 com quedas 1 + 2 + 2,5 → FALTA; memorial mostra a cadeia |
| 4.3 Entrada de energia no desenho | terminal `ENTRADA_SERVICO` (poste/mureta) e `MEDIDOR` (por unidade), ligados ao quadro de MEDICAO; **preset de padrão de entrada** (tabela `PADROES_DE_ENTRADA` por concessionária: categoria × demanda → ramal, disjuntor geral, eletroduto de entrada, aterramento — cada preset com fonte e "CONFERIR na norma da concessionária"); dimensionamento do ramal = o mesmo motor de condutores com método D/B1 | teste com preset "genérico — hipótese": 12 kVA → categoria, ramal 16 mm², disjuntor 63 A; falta se demanda > categoria; goldens |
| 4.4 Uso coletivo (A, mas destravado aqui) | medição por unidade do Empreendimento (unidades já existem em `empreendimento_*`): um MEDIDOR por unidade, demanda do condomínio = Σ unidades × fator de diversidade (hipótese nomeada) + serviço; fora: CODI por concessionária (backlog) | teste com 8 unidades; unifilar do QGBT lista os medidores |
| 4.5 Unifilar hierárquico e esquema vertical elétrico | unifilar em árvore (QGBT no topo, filhos abaixo, um diagrama só ou por quadro — opção); `utils/blueprintEsquemaVertical.ts` ganha a disciplina ELETRICA: pavimentos × quadros × prumadas × alimentadores, folha "ESQUEMA VERTICAL ELÉTRICO" na prancha; unifilar sai em DXF | harness da prancha olhado; `blueprintEsquemaVertical` testado com sobrado de 2 quadros; DXF abre com camada `UNIFILAR` |

Fecha o bloco **1** e o resto do **2**.

## Etapa 5 — Documentação · sem bump · 3 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 5.1 Plantas de luz e força | `TipoDePrancha` ELETRICA ganha variantes `ILUMINACAO` (luzes, interruptores, comandos e seus eletrodutos) e `TOMADAS_FORCA` (TUG, TUE, LD, dados e seus eletrodutos) além da unificada; filtro por tipo no `desenharEletrica` e nas camadas da vista (`CamadasDaPlanta` por tipo de ponto); DXF com camadas `ELETRICA-ILUMINACAO` / `ELETRICA-FORCA` | PDF sem `ILUMINACAO` sai byte a byte igual ao de hoje; harness com as duas plantas |
| 5.2 Legenda desenhada e lista de materiais na prancha | legenda com o SÍMBOLO desenhado (não só texto) na folha da planta, só dos tipos presentes; folha "Lista de materiais" com o quantitativo elétrico (0.3 + 2.3) por pavimento e por quadro | `DesenhistaDeProva.textos()` lista a legenda; PDF com a folha nova |
| 5.3 Memorial descritivo e DOCX | `utils/blueprintMemorialEletrico.ts` gera **memorial descritivo** (blocos: objeto, normas, entrada, quadros, circuitos, proteção, condutores, eletrodutos, aterramento, quantitativos) e **memorial de cálculo** como `BlocoDoMemorial`; PDF e DOCX pelo `blueprintMemorialDocx.ts` (já existe); textos padrão editáveis por estudo (hipótese `textosDoMemorial`); a emissão com ART anexa os dois | DOCX abre no Word; memorial gerado antes da emissão (não só nela); `paraWinAnsi` aplicado |

Fecha o bloco **7** e a parte do **6** que é "lista de materiais".

## Etapa 6 — Automação: fases, centro de cargas e desvio · sem bump · 3 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 6.1 Balanceamento de fases | `utils/blueprintBalanceamento.ts` puro: atribuição gulosa por carga (maior circuito na fase menos carregada, FF ocupa duas), prévia com desequilíbrio antes/depois, um lote, Ctrl+Z; "Balancear" na aba Quadros | teste: 6 circuitos desiguais → desequilíbrio ≤ 10 %; `conferirPlano` |
| 6.2 Centro de cargas | `utils/blueprintCentroDeCargas.ts`: centroide ponderado por VA dos pontos do quadro (ou de todos, se o quadro não existe), região sugerida na planta (círculo tracejado), botão "Sugerir posição do quadro" que move o quadro sugerido ou cria um `sugerido` | teste com 4 pontos; canvas mostra a região; mover apaga a marca |
| 6.3 Desvio estrutural e caixas de passagem | `planejarEletrodutos` usa `blueprintObstaculosEstruturais` (pilar +custo, viga: descer sob a viga como a água faz) e `rotaPelasParedes` como opção "pela parede" (hipótese `rotaPelaParede`); caixa de passagem automática a cada 15 m e em curva > 2 (hipótese com fonte 6.2.11.1.7); Ø comerciais até 85; distribuição de luminárias em malha por área (A) | teste: eletroduto que cruzava pilar contorna; caixas aparecem no 2D/3D/quantitativo; `blueprintEletrodutos.test.ts` |

Fecha os A do motor 3 e o que o usuário chamou de "quatro motores combinados".

## Etapa 7 — BIM · sem bump · 2 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 7.1 IFC completo | `Pset_OpuraEletrica` ganha IB, ligação, fase, DR, DPS, curva, Icn, condutores; `IfcCableSegment` por circuito (comprimento total por seção); eletroduto entra no `IfcDistributionCircuit`; `IfcDistributionBoard` quando o schema declarado for IFC4 ADD2 (opção de exportação); `Pset_ElectricalDeviceCommon` nas peças | validação no visualizador IFC (`services/ifcViewerService`); `blueprintIfc.test.ts` |
| 7.2 Importar elétrica e clash completo | `ifcParaKernel.ts` lê `IfcOutlet`, `IfcLightFixture`, `IfcSwitchingDevice`, `IfcCableCarrierSegment` → terminais e trechos ELETRICA; clash trecho × parede/abertura (sem furo previsto) e destaque no 3D dos conflitos; filtro por pavimento na lista | importar o próprio IFC exportado devolve os mesmos pontos; `PainelConflitos` com filtro |

Fecha o bloco **8**.

## Sequência e dependências

```
E0 ─► E1 (tipos, caixa) ─► E2 (comandos, esquemas, fiação) ─► E3 (DR, DPS, disjuntor)
                                                                  └─► E4 (hierarquia, entrada) ─► E5 (documentação)
E6 (automação) depende de E1 (caixas) e E2 (retorno para o balanceamento)
E7 (BIM) depende de E3/E4 (peças a exportar)
```

**Tamanho:** 27 fases em 8 etapas; **4 bumps de kernel** (E1, E2, E3, E4) e 3 bumps de
quantitativo (0.3, 2.3, 3.1) — as demais são cálculo, desenho ou documento derivado.

## Cobertura dos 116 Essenciais pendentes

| Bloco do benchmark | E pendentes | Onde fecha |
|---|---|---|
| 1 Hierarquia e entrada | 26 | 4.1–4.5 |
| 2 Cálculo fino e hipóteses | 18 | 0.1, 0.4, 4.2 (Tab. 37 e método por circuito em 0.1) |
| 3 Proteção | 18 | 3.1–3.3 |
| 4 Comandos, esquemas e fiação | 22 | 2.1–2.4 |
| 5 Modelo de pontos e caixas | 7 | 1.1–1.3, 0.2 (numeração) |
| 6 Quantitativos e orçamento | 11 | 0.3, 2.3, 3.1, 5.2 |
| 7 Documentação | 11 | 0.4 (fases), 4.5, 5.1–5.3 |
| 8 BIM | 3 | 7.1–7.2 |
| **Total** | **116** | |

## Fora do plano (backlog nomeado)

| Item | Grau | Por que fica |
|---|---|---|
| Barramento blindado (§25), nobreak (§27), corrente contínua (§31) | B | industrial/comercial; a incorporadora não projeta |
| Transformador (§26), gerador (§28), QTA (§29) | M | condomínio grande; entram quando um empreendimento pedir — a hierarquia da E4 já deixa o lugar (`quadroPaiId` + `origemComTransformador`) |
| Cálculo de Ik por impedância, seletividade | A | exige dado da concessionária e do trafo; a E3 fixa Ik como hipótese declarada |
| Fotovoltaico (§53) | M/B | disciplina própria; CC e inversor primeiro |
| SPDA (§54) | A | NBR 5419 é outra norma e outro módulo (decisão de 13/09); reaproveita o terreno e o telhado da Planta quando vier |
| Cabeamento estruturado (§55) | M | os pontos de dados já existem; rack, cabos e mapa pedem disciplina |
| Diagrama multifilar (§35), detalhamento frontal (§38), lançamento em 3D | A/M | documentação secundária no residencial; o unifilar + planta + esquema vertical fecham a prancha |
| Eletrocalhas, condutos retangulares, conduletes, leitos (§18) | A/M | tipologia de prédio comercial |
| Importação Revit RVT/RTE (§42), AltoQi Cloud (§44) | N | produto de terceiro; IFC/BCF são o caminho |
| Biblioteca personalizada, fabricantes, símbolos/3D do usuário (§45–46) | A/M | exige editor de famílias; o catálogo fechado é decisão (`taxonomia-do-ponto-eletrico`, 09/09) |
| Esquemas de ligação editáveis pelo usuário (§23) | A | a E2 entrega a tabela fixa com fonte; editar exige UI de tabela + validação — depois de a fixa provar-se |
| Luminotécnica (lux, fluxo), luminárias em malha por iluminância (§3) | M | a 5410 pede VA mínimo; lux é NBR 8995, outra norma |
| Demanda por circuito, CODI por concessionária (§10) | M/A | decisão de 13/09 mantida; CODI entra com a concessionária que pedir |
| Kits de instalação elétrica, mesclagem/importação de configurações (§1) | A/M | produtividade, não entrega |
| Fator de potência por circuito (§5) | A | a carga entra em VA; FP só muda quando houver motores dimensionados |

## Execução

(Cada fase ganha aqui uma subseção `### E<N>.<M> — <título> (<data>)` com o que foi feito, o
commit, o que os testes/harness pegaram antes de publicar e o que ficou fora. Nada executado
ao escrever este documento.)

### E0.1 — Hipóteses na tela e os 7 achados (29/09/2026) · frente `eletrico-e0` · sem bump

**O que mudou**

- `components/blueprint/PainelPreDimensionamento.tsx` — o painel "Hipóteses do
  pré-dimensionamento" ganhou três coisas que só existiam no JSON: **queda máxima da origem ao
  pior ponto (6.2.7.1)**, **desequilíbrio de fases tolerado** e os **fatores de demanda do
  alimentador** como preset NOMEADO — `sem demanda (1,00)` (padrão) ou `informada (nomear a
  fonte)`, que abre a fonte e os três fatores (0–1, clampados). Não entrou nenhuma tabela de
  demanda "de memória": a tabela é da concessionária, e quem a informa nomeia a fonte. O resumo
  recolhido mostra `(origem 5 %)` e `demanda: <fonte>` quando informada.
- `utils/blueprintNbr5410.ts` — regra nova **`6.2.7.1`** ("Alimentador do quadro: queda da origem
  ao pior ponto e equilíbrio de fases"): lê `preDimensionarQuadroCompleto` de cada quadro do
  pavimento, FALTA 6.2.7.1 e AVISO de desequilíbrio, "ver" seleciona o quadro, não avaliado dito
  ("comprimento do alimentador não declarado"). Antes isso só aparecia no painel do quadro
  (achado 5). **`PRE-DIM` passou a filtrar por pavimento**: circuito é "do pavimento" quando
  tem ponto nele; com `levelId` nulo (emissão) continua vendo tudo (achado 4).
- `utils/blueprintEletricaExecutivo.ts` — o portão da ART pula `6.2.7.1` na iteração das
  regras porque a mesma falta já entra por quadro no grupo QUADROS (evita contar duas vezes).
- `utils/blueprintEletricaDimensionamento.ts` — **I2 ≤ 1,45·Iz (5.3.4.1 b)**: comentário
  registrando que, para minidisjuntor NBR NM 60898, I2 = 1,45·In por norma de produto, então
  In ≤ Iz implica a condição b) — não é omissão, é a mesma conta; se entrar disjuntor de outra
  norma, volta a precisar de linha própria. O item "Sobrecarga" do §11 passa a ✅ com essa nota.
- **ρ decidido: 0,0206** (0,01724 a 20 °C × (1 + 0,00393 × 50) — a conta já estava no
  comentário de `rhoOhmMm2PorM`). O plano de 13/09 ganhou nota de atualização (achado 1).
- `utils/blueprintKernel/model.ts` — comentário do quadro corrigido: dizia "NÃO tem rotação"
  três linhas acima de `rotacaoGraus` (achado 6).
- `docs/planos/2026-09-14-circuitos-automaticos-secao-minima.md` — nota de 17/09 sobre
  "prumada entre pisos fica para depois" ganhou a atualização: feito em 15/09 (achado 7).
- **Não entrou nesta fase**: achado 2 (clash pela diagonal → fase 0.4) e achado 3 (numeração
  repete → fase 0.2). Tab. 37 (EPR/XLPE) e método por circuito, que a tabela de cobertura
  apontava para 0.1, **ficam para 0.4**: exigem transcrever a tabela do PDF da norma, que o
  usuário ainda não colou — não se transcreve de memória.

**Testes** (`__tests__/blueprintNbr5410DrEPreDim.test.ts` +2, `__tests__/components/PainelEletricaPreDim.test.tsx` +2, `__tests__/blueprintNbr5410Conferencia.test.ts` lista de códigos):
PRE-DIM some da conferência do Pavimento 1 quando o circuito só tem pontos no Térreo e continua
no modelo inteiro; alimentador de 120 m em 127 V → FALTA `QDC (6.2.7.1)` com `ids = [quadro]`,
sem `alimentadorM` → não avaliado dito, quadro do Térreo invisível na conferência do andar de
cima; na tela, os três campos novos chamam `onHipoteses` com o objeto certo, a demanda começa
sem fatores visíveis, `informada` nomeia a fonte, fator 1,4 vira 1, voltar a `sem demanda`
restaura o preset inteiro.

**O que os testes pegaram antes de publicar**: o teste da lista de códigos da conferência
(`blueprintNbr5410Conferencia.test.ts:286`) enumerava as 11 regras e caiu com a 12ª — é o
comportamento novo, a lista foi atualizada com o comentário do porquê.

**Verificação**: `tsc` ✓ · suíte inteira 6.176 ✓ / 0 ✗ / 33 skip (561 arquivos) · `build` ✓ ·
`check-ui-standard PainelPreDimensionamento.tsx` ✓ · `check-xss-sinks` ✓. **Harness visual não
rodou**: a mudança de tela é um formulário coberto pelos testes jsdom; a regra nova aparece na
aba pela mesma `LinhaDaRegra` das outras onze.

**Efeito no benchmark (Parte 1, foto de `b888c00b`)**: §5 "Configuração de queda de tensão"
🟡→✅; §10/§33 "Fatores de demanda" continuam 🟡 (editáveis e nomeados, mas sem tabela escalonada
por kVA — essa é a E4.2); §11 "Sobrecarga" 🟡→✅ (nota do I2); §12 "Limite máximo configurável"
🟡→✅; §46 "Fatores de demanda" 🟡→✅; §52 "Queda de tensão excessiva" perde a ressalva do
6.2.7.1. Cinco dos sete achados fechados; 2 e 3 ficam para 0.4 e 0.2.

### E0.2 — Circuitos: numeração, mover e colunas (29/09/2026) · frente `eletrico-e0` · sem bump

**O que mudou**

- `utils/blueprintCircuitosAutomaticos.ts` — `proximoNumeroDeCircuito` passa a ser **o maior
  número existente + 1** (lido do nome por `numeroDoCircuito`: "C3 — Iluminação" → 3), não a
  contagem + 1: com C1, C2, C3, apagar o C2 e criar de novo dava outro "C3" (achado 3). Nome sem o
  prefixo `C<n>` não entra na conta. **`renumerarCircuitos(model, quadroId | null)`** devolve
  só os `SetCircuitoProps` que mudam algo — C1…Cn por quadro, na ordem atual (número, depois
  nome), sem prefixo vai para o fim como "C<n> — <nome>"; o que vem depois do número fica.
  Vazio = já em sequência.
- `utils/blueprintKernel/commands.ts` — **`SetCircuitoProps.quadroId`** move o circuito de
  quadro (quadro inexistente → `BOARD_NOT_FOUND`). Os pontos vão junto porque apontam para o
  circuito; os eletrodutos também guardam só o circuito, mas foram TRAÇADOS até o quadro
  antigo — o kernel não apaga trecho nenhum e o painel avisa que a rede do quadro novo precisa
  ser relançada. `quadroId` já era campo do `Circuito`: **sem mudança de payload, sem bump**.
- `utils/blueprintKernel/quadroDeCargas.ts` — ordem **numérica** dos circuitos
  (`localeCompare(…, 'pt-BR', { numeric: true })`): "C2" antes de "C10". Tabela, prancha e
  unifilar leem daqui, então os três saem em ordem a partir do décimo circuito.
- `components/blueprint/PainelEletrica.tsx` — colunas **Descrição** (`Circuito.tipo`, que existia
  no modelo e não tinha coluna) e **Fase** (R/S/T; só abre em F-N, F-F e trifásico mostram "—"
  com o motivo); a célula **Quadro** vira seletor quando há 2+ quadros e move o circuito, com o
  aviso dos eletrodutos no title; botão **Renumerar** na barra de abas (aba Circuitos), que fica
  desligado quando já está em sequência — e o title diz isso — e informa quantos mudam quando
  ligado; respeita o filtro por quadro (filtro vazio = todos, quadro a quadro).
- `components/blueprint/BlueprintEditor.tsx` — `onRenumerarCircuitos` roda o lote em
  `editor.runBatch` (um passo de undo).
- **Fora desta fase**: ordem MANUAL dos circuitos (`Circuito.ordem` é payload novo → E4.1, junto
  com o circuito reserva); prefixo configurável (M).

**Testes** (`__tests__/blueprintCircuitosAutomaticos.test.ts` +4 no lugar do antigo "conta os do
quadro (+1)"; `__tests__/components/PainelEletrica.test.tsx` +3): apagar C2 e criar → 4, não 3;
nome sem prefixo ignorado; renumerar C1/C3/C7 — luz/Bomba → C1/C2/C3 — luz/C4 — Bomba com 3
comandos (o C1 não muda) e depois vazio; com `null` numera quadro a quadro; mover circuito leva os
pontos e quadro inexistente lança erro nomeado. Na tela: coluna Descrição chama `{ tipo }`, Fase
chama `{ fase }`, seletor de quadro só com 2+ quadros e chama `{ quadroId }`, Renumerar
desligado com "já estão numerados em sequência" e ligado com "1 muda", chamando com o filtro.

**O que o `tsc` pegou antes dos testes**: o tipo do prop `onCircuitoProps` no painel enumerava
os campos e não tinha `quadroId`; `Circuito` não estava importado no módulo de circuitos.

**Verificação**: `tsc` ✓ · alvo 91 ✓ · suíte inteira 6.163 ✓ / 0 ✗ / 33 skip (561 arquivos) ·
`build` ✓ · `check-ui-standard PainelEletrica.tsx` ✓ · `check-xss-sinks` ✓. Harness visual não
rodou: as células novas usam o mesmo `CAMPO_NA_CELULA` das existentes e o botão o mesmo molde
secundário da barra; cobertos por jsdom.

**Efeito no benchmark**: §5 "Numeração automática" 🟡→✅, "Movimentação de circuitos entre
quadros" ❌→✅, "Descrições dos circuitos" 🟡→✅, "Seleção das fases" 🟡 (agora na tabela; segue
só F-N em quadro FFF), "Ordenação dos circuitos" 🟡 (numérica; sem manual); §7 "Mudança de
circuitos entre quadros" ❌→✅; §32 "Descrição" 🟡→✅, "Fases" 🟡→✅. Achado 3 fechado; resta o
2 (clash pela diagonal → 0.4).

### E0.3 — Quantitativo elétrico do que já existe (29/09/2026) · frente `eletrico-e0` · **quant-1.19.0**, sem bump de kernel

**O que mudou**

- `utils/blueprintKernel/quantities.ts` — o eletroduto (`QuantidadeTrecho`) ganhou
  **`condutores`** (a contagem DECLARADA; sem ela, a base da ligação dos circuitos — 3 por F-N/F-F,
  4 por trifásico — e **`condutoresAssumidos`** diz que foi assumida), **`condutorM`** (condutores ×
  comprimento real em "L") e **`condutoresPorSecao`** (a repartição entre os circuitos, com a seção
  DECLARADA de cada um; `null` = sem seção). Os totais ganharam **`porCondutor`** (metro de fio por
  seção), `comprimentoCondutorM`, **`porQuadro`** (`QuantidadeDoQuadro`: circuitos, pontos,
  disjuntores por In, DRs, eletroduto e fio do quadro), `quadros`, **`porDisjuntor`** e **`drs`**.
  Até aqui o orçamento comprava eletroduto e contava pontos — **nenhum fio, quadro, disjuntor ou
  DR era quantificado**, e o metro de fio é a maior verba da elétrica residencial.
- **`repartirCondutores`** passou para o kernel (era `condutoresPorCircuitoNoTrecho` no
  dimensionamento, que agora delega): a ocupação do eletroduto e o quantitativo de fio fazem a
  MESMA conta — duas cópias divergiriam em silêncio. Ganhou o `indice` do circuito, porque quando
  faltam condutores a saída pula os que ficaram sem.
- `utils/blueprintBudget.ts` — cinco medidas novas no de-para, escopo INSTALACAO:
  **`COMPRIMENTO_CONDUTOR`** (M, uma linha por seção, "sem seção" à parte), **`CONTAGEM_PONTOS_ELETRICOS`**
  (UN, por tipo e código), **`CONTAGEM_QUADROS`** (UN, uma por quadro, rótulo = nome),
  **`CONTAGEM_DISJUNTORES`** (UN, por In declarado — o geral do quadro não entra: é calculado),
  **`CONTAGEM_DR`** (UN). `gerarLancamentosDeInstalacoes` passa a lançar **peça elétrica com
  código** (UN) e **eletroduto com código** (M) nos grupos "Instalações elétricas — peças /
  eletrodutos".
- `utils/blueprintQuantitativosPorPavimento.ts` — `RedeDoPavimento.porCondutor` e, por pavimento,
  `eletrodutoM`, `condutorM`, `pontosEletricos` (as mesmas funções de agrupamento do total: a soma
  dos pavimentos fecha por construção).
- `components/blueprint/TelaQuantitativos.tsx` — o Resumo deixa de pular os pontos ELÉTRICOS
  (`if (p.disciplina === 'ELETRICA') continue` saiu) e ganha fio por seção, quadros, disjuntores e
  DR; a aba Instalações ganha as famílias Condutor / Quadro / Disjuntor / DR (o quadro só do
  pavimento filtrado); a coluna por pavimento mostra eletroduto, fio e pontos elétricos.
- `utils/blueprintPlanilha.ts` — aba Totais com as mesmas linhas.
- **`planta-api` redeployada** com o bundle regenerado (`scripts/build-planta-api-kernel.mjs`;
  o `plantaApi.test.ts` acusa bundle velho) — prova em `GET /v1/estudos`: sem token **401**,
  token falso **401** (`/docs` e `/openapi.json` são públicos por desenho; POST é 405).
- **Não entrou**: retorno (a contagem é a do eletroduto — E2.2); metro de fio por TIPO de condutor
  (fase/neutro/terra — E2.3); disjuntor geral do quadro e DR como peça (E3/E4); composição de
  insumos por peça (backlog, decisão do hidro).

**Testes** — novo `__tests__/blueprintQuantitativoEletrico.test.ts` (8): versão; `repartirCondutores`
(base, excedente no primeiro, falta nos últimos, índice); casa com QDC, C1 (2,5 mm², 16 A, DR) e C2
(1,5 mm², 10 A), eletroduto compartilhado de 4 m com 6 condutores, prumada de 2,5 m com 3 e 2 m
SEM contagem → **2,5 mm² = 19,5 m; 1,5 mm² = 18 m** (12 + 6 assumidos e ditos); quadro com 2
circuitos, 3 pontos, `[{10,1},{16,1}]`, 1 DR, 8,5 m de eletroduto, 37,5 m de fio; as cinco medidas
no catálogo; de-para com 2 linhas de fio, filtro por "1,5 mm²", disjuntores por In, DR, quadro,
pontos (3), unidade errada = divergência; lançamento por peça da tomada com código (UN, grupo
elétrico); por pavimento fecha com o total; desenho sem elétrica = listas vazias e zeros.
Pinos de versão `quant-1.18.0 → 1.19.0` em **9 arquivos** (Acabamentos, Calhas, CortinaEBrise,
Quantities, Rodape, GuardaCorpo, Fases, VolumeEFace, EsquadriaSaidas).

**O que os testes pegaram antes de publicar**: o `grep … | head -8` dos pinos de versão cortou a
lista — 3 corrigidos, 4 acusados pela suíte inteira, e depois mais 5; a suíte inteira é o portão,
não o grep (memória `feedback_grep_v_version_escondeu_funcao` tem irmã nova).

**Verificação**: `tsc` ✓ · alvo 163 ✓ · suíte inteira **6.172 ✓ / 0 ✗ / 33 skip** (562 arquivos,
depois dos pinos) · `build` ✓ · `check-ui-standard TelaQuantitativos.tsx` ✓ · `check-xss-sinks` ✓ ·
`planta-api` 401/401. **Harness visual não rodou e a tela não ganhou teste jsdom nesta fase**: as
linhas novas usam as mesmas células e famílias das existentes; o que está provado é o dado
(`computeQuantities`, de-para, planilha), não o pixel — fica dito.

**Efeito no benchmark**: §47 "Cabos" e "Fios" ❌→🟡 (metro por seção, sem tipo/retorno),
"Quadros" ❌→✅, "Disjuntores" ❌→✅, "IDRs" ❌→🟡 (contagem, sem peça), "Por pavimento" 🟡→✅,
"Por quadro" ❌→✅, "Por circuito" ❌→🟡 (fio por circuito está no payload, sem tela); §30
"Quantitativos" ❌→🟡; §46 "Itens" 🟡→✅ (código da peça elétrica chega ao orçamento); §51
"Quantitativos" 🟡→✅, "Lista de materiais" ❌→🟡 (XLSX e tela; folha na prancha é a E5.2).

### E0.4 — Clash pelo "L" e fases visíveis (29/09/2026) · frente `eletrico-e0` · sem bump de kernel · **fecha a Etapa 0**

**O que mudou**

- **`utils/blueprintKernel/caminhoDoEletroduto.ts`** (novo) — `SegmentoDoTrecho` e
  `segmentosDoEletroduto` saíram de `utils/blueprintRede.ts` para o kernel, recortados
  literalmente (doc de 10/09 incluída): o clash precisava do MESMO "L" que o 3D, o corte e o
  quantitativo usam, e o kernel não importa de fora. `blueprintRede.ts` reexporta os dois —
  os 7 importadores (Collada, Corte, Elevation, Ifc, 3DViewer, Canvas, teste) não mudaram.
- `utils/blueprintKernel/conflitos.ts` — `conflitosDoModelo` deixa de medir a DIAGONAL entre as
  pontas: cada trecho vira os **pedaços do "L"** (`pedacosDe`), o conflito com estrutura soma o
  que está dentro pelos pedaços e guarda a menor folga (um conflito por par, como antes), e a
  folga trecho × trecho é o mínimo entre todos os pares de pedaços. Tubo hidráulico continua
  reto (a função devolve o trecho inteiro fora da elétrica) — achado 2 fechado.
- `utils/blueprintUnifilar.ts` — `RamalUnifilar.fase`, `DiagramaUnifilar.comFases`; a letra
  R/S/T vai **sobre o nó do ramal** no barramento; o rodapé explica só quando alguma fase aparece.
- `utils/blueprintPranchaEletrica.ts` — folha do quadro de cargas ganha a coluna **Fase**
  (R/S/T; "—" em F-N sem fase; vazio fora de F-N).
- **`planta-api` redeployada** (bundle regenerado): `GET /v1/estudos` sem token **401**, token
  falso **401**.
- **Não entrou (declarado)**: **pontos e quadros no clash** — a tabela do roadmap para 0.4 previa
  "pontos e quadros entram no clash como caixas", mas `Conflito` é `{trechoId, trechoUid, outroId…}`
  e é consumido pelo painel, pelo BCF (`guid` por trecho) e pela tabela de aceite; alargar a forma é
  mudança de contrato, não de geometria. **Vai para a E7.2** (BIM), onde já estava listado
  ("clash com pontos/quadros"). Coluna Fases na TABELA já entrou na 0.2.
- **Dívida pequena registrada**: existem dois `numeroDoCircuito` — `blueprintCondutores.ts:74`
  (string, "?" sem número, para o unifilar) e `blueprintCircuitosAutomaticos.ts` (number | null,
  da E0.2). Semânticas diferentes, nomes iguais; unificar quando a E4.1 mexer no `Circuito`.

**Testes** — `__tests__/blueprintConflitos.test.ts` +3: tomada (300) → luminária (2800) cruzando a
viga (2400–2800): a diagonal passava a 1,55 m, por baixo; o "L" corre no teto e **atravessa 200 mm**
(1 conflito ESTRUTURA); o ESGOTO com a mesma geometria continua reto e não acusa; eletroduto × água
a 2200 cruzando a **prumada** acusa REDE com folga 0 (a diagonal estaria a 1,9 m). Novo
`__tests__/blueprintUnifilarFases.test.ts` (3): ramal com `fase: 'S'` e null; o traçado escreve a
letra uma vez, sem R nem T; o rodapé só com `comFases`.

**Verificação**: `tsc` ✓ · alvo 82 ✓ (conflitos, status, arquitetônicos, unifilar, prancha,
caminho, collada, goldens, BCF) · suíte inteira **6.178 ✓ / 0 ✗ / 33 skip** (563 arquivos) · `build` ✓ ·
`check-xss-sinks` ✓ (nenhum `.tsx` tocado) · `planta-api` 401/401. Goldens do kernel intactos: o
payload canônico não mudou (o caminho é derivado).

**Efeito no benchmark**: §43 "Detecção de colisões" ✅ (agora pelo caminho real), "Elétrica ×
estrutura" ✅, "Elétrica × hidráulica" ✅ — as três com a ressalva removida; §34 "Fases" ❌→✅;
§32 "Fases" ✅ (tabela na 0.2 + prancha aqui). Sete achados do benchmark: **todos fechados**
(1 e 4–7 na 0.1, 3 na 0.2, 2 aqui).

**Etapa 0: 4 de 4 fases** ✓. Próxima: **E1 — Modelo de pontos e caixas** (bump de kernel).
