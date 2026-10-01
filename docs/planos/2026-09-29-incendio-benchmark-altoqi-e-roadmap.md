# Incêndio: o AltoQi Builder como régua — benchmark e roadmap para o ÒPURA

> A Parte 1 é o benchmark: o que existe, com evidência `arquivo:linha`. A Parte 2 é o plano de
> implementação. Nada da Parte 2 foi executado quando este documento foi escrito; cada fase
> ganha uma seção em "Execução" quando for feita.

## Pedido original

Sessão de 29–30/09/2026 (VS Code, Claude Code), transcrita literalmente:

<details>
<summary>Mensagem do usuário (clique para abrir; é longa: 48 categorias + os 10 motores + o gerador de PPCI)</summary>

> analise essas funcionalidades do autoqi para implementarmos em incroporacao < planta inteligente:
>
> Considerando o AltoQi Builder – Prevenção e Combate a Incêndio, na versão disponível até a atualização 2026-08, o módulo concentra três grupos principais: sistemas hidráulicos de combate, preventivos/representação e BIM/documentação. A AltoQi destaca como principais recursos hidrantes, sprinklers, bombas, extintores, sinalização, detecção, iluminação de emergência, quantitativos e relatórios. AltoQi
> 1. Estrutura do projeto de incêndio
> - Edificação com múltiplos pavimentos.
> - Organização por pavimentos.
> - Níveis e elevações.
> - Rede de hidrantes.
> - Rede de sprinklers.
> - Rede denominada Preventivo para equipamentos não hidráulicos.
> - Tubulações horizontais e verticais.
> - Colunas/prumadas de incêndio.
> - Ligações entre pavimentos.
> - Lançamento em planta baixa.
> - Lançamento em detalhe isométrico.
> - Lançamento pelas coordenadas X, Y e Z.
> - Diferentes planos de trabalho XY/XZ/YZ.
> - Ajuste de elevação dos componentes.
> - Ajuste do sentido de fluxo.
> - Representação e edição 3D. AltoQi Suporte
> 2. Rede de hidrantes
> - Lançamento de hidrantes.
> - Hidrantes simples.
> - Hidrantes duplos.
> - Mangotinhos.
> - Hidrantes com múltiplos rolos de mangueira.
> - Hidrantes com proporcionador de espuma mediante cadastro.
> - Tubulação de alimentação.
> - Colunas de incêndio.
> - Ramais.
> - Conexões.
> - Registros.
> - Válvulas.
> - Esguichos.
> - Mangueiras.
> - Abrigos.
> - Cadastro personalizado de hidrantes.
> - Simbologias 2D e 3D.
> - Associação de materiais aos hidrantes. AltoQi Suporte
> 3. Dimensionamento da rede de hidrantes
> Um dos motores mais importantes do AltoQi.
> Permite definir:
> - vazão mínima;
> - pressão mínima;
> - quantidade de hidrantes simultâneos;
> - velocidade limite;
> - diâmetro das tubulações;
> - critérios específicos do projeto.
> O sistema então realiza:
> - cálculo hidráulico;
> - cálculo das vazões;
> - cálculo das pressões;
> - cálculo de perdas de carga;
> - dimensionamento dos tubos;
> - identificação dos hidrantes mais desfavoráveis;
> - análise dos hidrantes simultaneamente em operação;
> - verificação da pressão nos demais hidrantes;
> - cálculo do ponto de equilíbrio de pressão;
> - geração da planilha de pressões.
> O software trabalha com métodos de perda de carga como Hazen-Williams, fórmula universal e Fair-Whipple-Hsiao. AltoQi
> 4. Redes ramificadas e redes em malha
> O sistema não fica restrito a redes simples.
> Suporta:
> - rede ramificada;
> - rede em anel;
> - rede em malha;
> - rede em grelha;
> - caminhos hidráulicos múltiplos;
> - balanceamento das vazões;
> - cálculo iterativo;
> - classificação dos tubos como alimentadores, ramais e sub-ramais. AltoQi Suporte
> 5. Sprinklers
> - Lançamento manual de sprinklers.
> - Lançamento automático.
> - Sprinkler pendente.
> - Sprinkler upright.
> - Diferentes diâmetros de rosca.
> - Diferentes fatores K.
> - Configuração da altura.
> - Configuração do número de sprinklers.
> - Configuração da quantidade por ramal.
> - Espaçamento entre sprinklers.
> - Espaçamento entre ramais.
> - Alimentadores.
> - Ramais.
> - Sub-ramais.
> - Ramais de contorno.
> - Ramais de derivação.
> - Redes em malha/grelha.
> - Integração com hidrantes. AltoQi Suporte
> 6. Distribuição automática de sprinklers
> Uma das automações mais importantes.
> O usuário delimita uma região e o sistema pode criar:
> - quantidade de ramais;
> - espaçamento dos ramais;
> - quantidade de sprinklers por ramal;
> - espaçamento dos sprinklers;
> - elevação dos sprinklers;
> - tubulação;
> - ramais de contorno;
> - alimentação;
> - área de operação.
> Também existe preview dinâmico para visualizar alternativas antes de confirmar o traçado. AltoQi
> 7. Lançamento automático da tubulação de sprinklers
> O Builder cria automaticamente:
> Sprinklers → ramais → derivações → alimentadores → rede principal
> e permite incluir ramais de derivação perpendiculares ao ramal principal. AltoQi
> 8. Área de operação dos sprinklers
> O software possui um objeto específico denominado Área de Operação.
> Permite:
> - área retangular;
> - área poligonal;
> - criação automática;
> - criação manual;
> - associação aos sprinklers;
> - identificação da região hidraulicamente desfavorável;
> - configuração da área de aplicação;
> - número máximo de sprinklers;
> - cálculo da vazão necessária. AltoQi Suporte
> A área de operação poligonal é especialmente interessante para geometrias arquitetônicas irregulares.
> 9. Classificação de risco
> O Builder permite classificar a ocupação para o projeto de sprinklers, incluindo:
> - risco leve;
> - ordinário grupo 1;
> - ordinário grupo 2;
> - extraordinário grupo 1;
> - extraordinário grupo 2.
> A classificação interfere automaticamente em parâmetros como:
> risco → área de operação → densidade → vazão → tubulações → pressão da bomba. AltoQi Suporte
> 10. Densidade de projeto dos sprinklers
> Pode trabalhar com critério:
> - automático;
> - manual.
> No automático, o Builder relaciona risco e área de operação para obter a densidade.
> No manual, o projetista define diretamente:
> L/min/m²
> permitindo adaptar critérios específicos do projeto. AltoQi Suporte
> 11. Fator K dos sprinklers
> Permite definir e cadastrar:
> - fator K;
> - diâmetro;
> - modelo do sprinkler;
> - item comercial;
> - simbologia;
> - parâmetros de cálculo.
> O fator K entra diretamente na relação:
> vazão × pressão do sprinkler. AltoQi Suporte
> 12. Dimensionamento hidráulico dos sprinklers
> O sistema calcula:
> - vazão de cada sprinkler;
> - vazão da área de operação;
> - pressão dos sprinklers;
> - perdas de carga;
> - pressão nos nós;
> - vazões dos trechos;
> - diâmetros;
> - alimentação necessária.
> Há suporte a:
> - cálculo hidráulico;
> - método das tabelas;
> - redes ramificadas;
> - redes em malha;
> - processo iterativo;
> - balanceamento das vazões. AltoQi Suporte
> 13. Integração sprinkler + hidrante
> É possível compartilhar a alimentação hidráulica.
> O cálculo considera simultaneamente:
> - demanda da área de operação dos sprinklers;
> - hidrantes associados;
> - vazão requerida;
> - pressão necessária.
> Isso permite representar redes combinadas de proteção. AltoQi Suporte
> 14. VGA — Válvula de Governo e Alarme
> O Builder contempla VGA na rede de sprinklers.
> Permite:
> - lançamento da válvula;
> - inserção na rede;
> - representação gráfica;
> - representação BIM;
> - conexão hidráulica;
> - associação aos sprinklers;
> - inclusão nos quantitativos.
> A biblioteca atual inclusive possui kits para VGA. AltoQi Suporte
> 15. Bombas de incêndio
> O software permite lançar e dimensionar a bomba principal.
> Considera:
> - vazão requerida;
> - altura manométrica;
> - pressão requerida;
> - perdas da instalação;
> - curva do sistema;
> - curva da bomba.
> O Builder confronta a curva da instalação × curva da bomba e auxilia na escolha de um equipamento compatível. AltoQi Suporte
> 16. Curva da bomba
> Recursos incluem:
> - curva vazão × altura manométrica;
> - ponto de funcionamento;
> - curva do sistema;
> - seleção da bomba;
> - análise da condição de funcionamento;
> - representação da curva;
> - documentação associada.
> Há inclusive geração automática do traçado da curva da bomba para redes de hidrantes. AltoQi
> 17. Bomba jockey
> O Builder contempla especificamente:
> - lançamento da bomba jockey;
> - associação à bomba principal;
> - manutenção da pressurização da rede;
> - parâmetros próprios;
> - representação;
> - quantitativos. AltoQi Suporte
> 18. Cadastro de bombas
> Pode-se cadastrar:
> - fabricante;
> - modelo;
> - potência;
> - dados hidráulicos;
> - curva de funcionamento;
> - diâmetros;
> - itens comerciais;
> - simbologia 2D;
> - simbologia 3D;
> - materiais associados.
> Isso permite construir uma biblioteca baseada em bombas reais de fabricantes. AltoQi Suporte
> 19. Reservação e alimentação hidráulica
> A modelagem da instalação permite representar a origem hidráulica do sistema e sua relação com:
> - reservatório;
> - cisterna;
> - alimentação;
> - bomba;
> - rede pressurizada;
> - colunas de incêndio.
> O cálculo verifica se a fonte consegue atender às pressões e vazões exigidas pela rede. AltoQi Suporte
> 20. Extintores
> Permite lançamento de:
> - extintores portáteis;
> - extintores sobre rodas/carreta;
> - água/espuma conforme biblioteca;
> - pó químico;
> - CO₂;
> - diferentes cargas;
> - componentes personalizados.
> Cada elemento pode possuir:
> - símbolo 2D;
> - geometria 3D;
> - modelo;
> - fabricante;
> - carga;
> - item comercial;
> - associação à lista de materiais. AltoQi Suporte
> 21. Sinalização de emergência
> Permite inserir:
> - placas de equipamentos;
> - indicação de hidrante;
> - indicação de extintor;
> - sinalizações de emergência;
> - placas direcionais;
> - sinalização de rota de fuga;
> - símbolos personalizados;
> - códigos nas placas;
> - sinalizações associadas a outros elementos.
> Existe suporte à representação de códigos nas placas e à criação de simbologias personalizadas. AltoQi Suporte
> 22. Rota de fuga — sinalização
> Há componentes específicos para representar:
> - direção de saída;
> - seguir em frente;
> - esquerda;
> - direita;
> - mudanças de direção;
> - saídas;
> - demais sinalizações de abandono.
> O ponto importante é que, na documentação pública consultada, isso aparece principalmente como lançamento/modelagem da sinalização, e não como um motor completo que calcula automaticamente toda a rota de fuga. AltoQi Suporte
> 23. Detecção de incêndio
> O Builder permite inserir no projeto elementos de detecção de incêndio, com representação no modelo, pranchas e quantitativos. AltoQi
> Entre os elementos modeláveis estão os pontos de detecção disponíveis na biblioteca/cadastro.
> 24. Alarme de incêndio
> Também permite lançar elementos de alarme, representá-los na planta/modelo e incluí-los na lista de materiais. AltoQi
> Nesse ponto existe uma diferença importante: a documentação pública da AltoQi destaca claramente lançamento e documentação, mas não apresenta esse módulo como um simulador elétrico completo do sistema de detecção e alarme.
> 25. Iluminação de emergência
> Permite inserir:
> - equipamentos de iluminação de emergência;
> - símbolos;
> - elementos BIM;
> - representação nas pranchas;
> - inclusão na lista de materiais. AltoQi
> Novamente, o recurso é apresentado pela AltoQi principalmente como modelagem/documentação do sistema preventivo.
> 26. Preventivos personalizados
> A rede Preventivo pode receber equipamentos adicionais.
> Por exemplo, a própria documentação demonstra cadastro de:
> - motor de ventilação de escada pressurizada;
> - equipamentos auxiliares;
> - elementos personalizados.
> Assim, o usuário consegue criar componentes que não estão nativamente disponíveis. AltoQi Suporte
> 27. Escada pressurizada — representação de equipamentos
> É possível representar equipamentos relacionados à pressurização, como:
> - motor;
> - ventilador;
> - componentes auxiliares.
> Mas isso não significa que o módulo Incêndio realize o cálculo aerodinâmico completo da pressurização da escada; a documentação encontrada demonstra principalmente cadastro/modelagem desses equipamentos. AltoQi Suporte
> 28. Cadastro de peças
> O Builder permite criar componentes próprios.
> Cada peça pode possuir:
> - nome;
> - categoria;
> - fabricante;
> - dimensões;
> - propriedades;
> - parâmetros hidráulicos;
> - materiais;
> - itens associados;
> - custo/identificação comercial;
> - símbolo 2D;
> - símbolo 3D;
> - pontos de conexão.
> Isso vale para hidrantes, sprinklers, bombas, extintores e preventivos. AltoQi Suporte
> 29. Kits de instalações
> O Builder possui conceito de Kit de Instalações, permitindo agrupar elementos usados repetidamente.
> Exemplos fornecidos pela própria AltoQi:
> - hidrante + placa;
> - extintor + sinalizações;
> - VGA.
> O projetista também pode criar seus próprios kits. AltoQi Suporte
> Para o ÒPURA, considero esse recurso particularmente interessante porque funciona como um componente paramétrico reutilizável.
> 30. Diagnóstico do lançamento
> Durante a modelagem, existem indicadores para situações como:
> - conexão sem peça;
> - tubo desconectado;
> - falta de fluxo de entrada;
> - falta de fluxo de saída;
> - fluxo incorreto;
> - peça inadequada para o sentido do fluxo;
> - peça subdimensionada;
> - peça superdimensionada;
> - inconsistências hidráulicas. AltoQi Suporte
> 31. Processamento e verificações hidráulicas
> O motor pode verificar:
> - diâmetros;
> - vazões;
> - pressões;
> - perdas de carga;
> - sentido de fluxo;
> - simultaneidade dos hidrantes;
> - área de operação;
> - capacidade da bomba;
> - pressão mínima;
> - velocidade da água;
> - condições dos sprinklers.
> As inconsistências são apresentadas ao projetista para correção. AltoQi
> 32. Configurações por normas e Corpo de Bombeiros
> O Builder permite adaptar parâmetros do projeto às exigências locais.
> A documentação possui orientações específicas para diferentes estados, como:
> - São Paulo;
> - Bahia;
> - Paraná;
> - Mato Grosso;
> - Rio de Janeiro.
> Isso é importante porque o projeto brasileiro de incêndio não depende apenas das normas ABNT; as Instruções Técnicas dos Corpos de Bombeiros estaduais alteram requisitos e critérios. AltoQi Suporte
> 33. Normas hidráulicas
> Entre as referências explicitamente indicadas pela AltoQi estão:
> - NBR 13714 — hidrantes e mangotinhos;
> - NBR 10897 — chuveiros automáticos/sprinklers.
> O software permite também adaptar parâmetros para instruções técnicas estaduais. AltoQi
> 34. Planilha de pressão
> O Builder gera planilhas contendo dados como:
> - trechos;
> - diâmetros;
> - comprimentos;
> - vazões;
> - perdas de carga;
> - pressões;
> - pressão disponível;
> - pressão necessária;
> - hidrantes desfavoráveis.
> É uma das principais saídas para conferência do cálculo. AltoQi
> 35. Diagrama de pressões
> Além da planilha, permite localizar graficamente no projeto os trechos associados ao cálculo de pressão.
> Isso facilita identificar:
> reservatório/bomba → tubulação → hidrante crítico. AltoQi
> 36. Numeração automática
> Há recursos como:
> - numeração de hidrantes;
> - numeração de sprinklers;
> - identificação dos componentes;
> - referências para documentação e detalhamento. AltoQi
> 37. Detalhamento de hidrantes
> O Builder gera blocos de detalhamento de hidrantes utilizáveis diretamente nas pranchas. AltoQi
> Pode incluir representação dos elementos que compõem o conjunto de hidrante.
> 38. Detalhes isométricos
> É possível gerar/editar instalações em detalhe isométrico.
> Permite visualizar:
> - tubos;
> - conexões;
> - registros;
> - hidrantes;
> - bombas;
> - sprinklers;
> - elevações;
> - mudanças de direção;
> - prumadas.
> O lançamento pode inclusive ser feito diretamente no isométrico. AltoQi Suporte
> 39. Esquema vertical
> A disciplina Incêndio suporta geração/apresentação de esquema vertical, especialmente útil para edifícios de múltiplos pavimentos. AltoQi Suporte
> Pode representar conceitualmente:
> reservatório → bombas → coluna de incêndio → pavimentos → hidrantes/sprinklers.
> 40. Cortes
> Também suporta cortes para visualização das instalações de incêndio, permitindo interpretar:
> - alturas;
> - tubulações;
> - equipamentos;
> - interferências;
> - posicionamento vertical. AltoQi Suporte
> 41. Modelagem BIM 3D
> O projeto de incêndio participa do ambiente BIM do Builder:
> - tubulações 3D;
> - conexões;
> - hidrantes;
> - sprinklers;
> - bombas;
> - extintores;
> - sinalizações;
> - equipamentos;
> - propriedades dos objetos;
> - geometria realista.
> A AltoQi apresenta a disciplina como integrada às demais instalações em ambiente BIM. AltoQi
> 42. Compatibilização multidisciplinar
> Como o Incêndio está dentro do Builder, ele pode ser trabalhado junto com:
> - arquitetura;
> - estrutura;
> - hidráulica;
> - elétrica;
> - gás;
> - climatização;
> - SPDA;
> - cabeamento.
> Isso é particularmente útil para identificar problemas como:
> sprinkler × luminária
> tubulação de incêndio × viga
> hidrante × arquitetura
> prumada × estrutura. AltoQi
> 43. Plantas do projeto de incêndio
> O sistema gera plantas com:
> - rede de hidrantes;
> - rede de sprinklers;
> - extintores;
> - sinalização;
> - detecção;
> - alarmes;
> - iluminação de emergência;
> - demais preventivos.
> A documentação pode ser preparada em pranchas para apresentação. AltoQi
> 44. Simbologia específica para pranchas
> É possível utilizar representações diferentes entre:
> modelo/projeto
> e
> prancha de impressão.
> Por exemplo, um extintor pode aparecer em 3D/realista durante a modelagem, mas apenas com a simbologia técnica na prancha. AltoQi Suporte
> Isso é uma boa solução de UX para o ÒPURA: separar representação de projeto de representação documental.
> 45. Quantitativos
> O Builder gera quantitativos automáticos de elementos do projeto.
> Podem entrar:
> - tubos;
> - conexões;
> - válvulas;
> - registros;
> - hidrantes;
> - mangueiras;
> - sprinklers;
> - VGA;
> - bombas;
> - extintores;
> - placas;
> - detectores;
> - alarmes;
> - iluminação de emergência;
> - equipamentos auxiliares.
> A AltoQi informa que os elementos preventivos lançados são também exportados para a lista de materiais. AltoQi
> 46. Lista de materiais
> Os componentes cadastrados podem possuir itens associados.
> Isso permite transformar o objeto BIM:
> Hidrante
> em uma composição física, por exemplo:
> abrigo + válvula + mangueiras + esguicho + adaptador + chave + placa.
> O mesmo conceito é utilizado no cadastro das bombas e demais peças. AltoQi Suporte
> 47. Relatórios
> A AltoQi informa geração automática de:
> - relatórios técnicos;
> - resultados de dimensionamento;
> - planilhas hidráulicas;
> - quantitativos;
> - documentação do projeto. AltoQi
> 48. Bibliotecas personalizáveis
> O projetista pode criar:
> - fabricantes;
> - modelos;
> - peças;
> - equipamentos;
> - símbolos;
> - materiais;
> - novos extintores;
> - novos hidrantes;
> - bombas;
> - preventivos;
> - elementos especiais.
> Isso evita limitar o sistema ao catálogo padrão. AltoQi Suporte
> O que eu considero o núcleo funcional do AltoQi Incêndio
> Para usarmos como benchmark do ÒPURA, eu reduziria tudo isso a 10 motores, em vez de replicar dezenas de funcionalidades isoladas:
> 1. Motor de Classificação e Requisitos
> → ocupação + risco + normas + IT estadual + requisitos obrigatórios.
> 2. Motor de Hidrantes
> → cobertura + pontos + simultaneidade + tubulação + pressão + vazão.
> 3. Motor de Sprinklers
> → distribuição + cobertura + densidade + área de operação + fator K.
> 4. Motor Hidráulico
> → vazão + perda de carga + pressão + diâmetro + balanceamento de redes.
> 5. Motor de Bombeamento
> → bomba principal + jockey + curva da bomba + ponto de operação.
> 6. Motor Preventivo
> → extintores + sinalização + iluminação + rota de fuga + equipamentos auxiliares.
> 7. Motor de Detecção e Alarme
> → detectores + acionadores + alarmes + central + circuitos/laços.
> 8. Motor BIM
> → planta + 3D + isométrico + IFC + compatibilização.
> 9. Motor de Documentação
> → plantas + detalhes + esquemas + memoriais + planilhas + pranchas.
> 10. Motor de Quantitativos
> → materiais + composições + orçamento + integração com suprimentos.
> Um ponto em que eu iria além do AltoQi
> Para a Planta Inteligente do ÒPURA, eu não faria apenas um equivalente ao Builder. O ganho real seria criar um Gerador Automático de PPCI/PSCIP.
> A arquitetura poderia funcionar assim:
> Arquitetura BIM
> → identifica áreas, usos, pavimentos e ambientes
> → classifica automaticamente ocupação e risco
> → determina sistemas obrigatórios
> → calcula população
> → analisa saídas e rotas de fuga
> → posiciona extintores
> → posiciona hidrantes
> → distribui sprinklers
> → distribui detectores
> → posiciona sinalização
> → posiciona iluminação de emergência
> → roteia tubulações
> → dimensiona rede
> → dimensiona bombas/reserva
> → verifica normas/IT estadual
> → gera projeto 3D
> → gera pranchas
> → gera memorial
> → gera quantitativos.
> Esse nível de automação seria significativamente mais interessante do que simplesmente reproduzir os comandos do AltoQi, porque transforma o sistema de ferramenta de desenho/cálculo em um motor de projeto preventivo orientado a regras.

</details>

**Decisões do usuário na mesma sessão** (perguntas feitas antes do benchmark):

| Pergunta | Resposta |
|---|---|
| Régua do grau Essencial | **"Paridade total com AltoQi"**: sprinklers com malha iterativa, VGA, curva de bomba e área de operação também são Essenciais |
| Corpo de Bombeiros do motor de regras | **"MINAS GERAIS"** (CBMMG) |
| Entregável | **"Benchmark + roadmap"**: execução depois, etapa por etapa |

## Critério e legenda

**Critério do grau: paridade total com o AltoQi Builder Incêndio.** A régua não é a mesma do
hidrossanitário e do elétrico, que usaram "substituir o projetista no residencial". Aqui um item
é **E** se o AltoQi o faz e, sem ele, o projetista ainda precisaria do AltoQi para entregar
**qualquer** projeto de incêndio que o AltoQi entrega. Isso inclui hidrantes, sprinklers com
malha, bombas com curva, VGA, preventivos, documentação e quantitativo, aprovado no **Corpo de
Bombeiros Militar de Minas Gerais**.

| Grau | Significa |
|---|---|
| **E** | Essencial: o AltoQi faz, e a paridade exige |
| **A** | Alto: vai **além** do AltoQi (o gerador de PPCI proposto pelo usuário: classificação automática, população, saídas, rota de fuga calculada, posicionamento automático de preventivos), ou é paridade em estado que não é MG |
| **M** | Médio: o AltoQi faz, mas é nicho fora do mercado da incorporadora (espuma) |
| **B** | Baixo: não aparece neste benchmark |
| **N** | Não replicar: o próprio AltoQi não faz, e o texto do pedido diz isso (cálculo aerodinâmico da pressurização, simulador elétrico do laço de detecção) |

O estado foi conferido no código em 30/09/2026, na frente `incendio-benchmark` criada a partir de
`origin/main` (kernel `blueprint-kernel-ts-0.78.0`, quantitativos `quant-1.23.0`). Legenda:
**✅** implementado, **🟡** parcial (a base existe, mas não serve ao incêndio sem trabalho),
**❌** não existe.

**Não existe nada de incêndio no código.** A busca por
`incêndio|sprinkler|hidrante|extintor|PPCI|emergência|IfcFireSuppression` em `utils/`,
`components/blueprint/`, `hooks/`, `types/` e `services/` encontra só:
- `types/project.ts:70` (`sprinklers?: boolean`, um atributo solto de obra);
- os itens de manutenção preventiva do condomínio (`services/maintenanceCatalog.ts:55-58`);
- o comentário `model:2358`, que prevê incêndio como valor novo de `DisciplinaDeRede`.

Por isso a coluna de evidência diz o que **se reaproveita** e o que **falta**. Um 🟡 quer dizer
que a peça genérica existe (trecho, ponto, pavimento, prancha) e o incêndio só precisa se ligar
nela.

A varredura foi feita por três leituras independentes (rede e hidráulica; dados de PPCI e
preventivos; documentação, quantitativo e BIM). As linhas citadas foram reabertas na frente
antes de entrar aqui.

Abreviações nas evidências:

| Sigla | Arquivo |
|---|---|
| `model` | `utils/blueprintKernel/model.ts` |
| `commands` | `utils/blueprintKernel/commands.ts` |
| `grafo` | `utils/blueprintKernel/grafoDeRede.ts` |
| `conexoes` | `utils/blueprintKernel/conexoes.ts` |
| `quant` | `utils/blueprintKernel/quantities.ts` |
| `conflitos` | `utils/blueprintKernel/conflitos.ts` |
| `Pressao` | `utils/blueprintPressaoDaRede.ts` |
| `HidP` | `utils/blueprintHidraulicaPressao.ts` |
| `AguaAuto` | `utils/blueprintAguaAutomatica.ts` |
| `Recalque` | `utils/blueprintRecalque.ts` |
| `Reserv` | `utils/blueprintReservacao.ts` |
| `Distr` | `utils/blueprintDistribuicao.ts` |
| `Rota` | `utils/blueprintRotaPelasParedes.ts` |
| `Obst` | `utils/blueprintObstaculosEstruturais.ts` |
| `GrafoEsp` | `utils/blueprintGrafoEspacial.ts` |
| `Verif` | `utils/blueprintVerificacaoRede.ts` |
| `Rede` | `utils/blueprintRede.ts` |
| `PtsHidro` | `utils/blueprintPontosHidraulicos.ts` |
| `Pranchas` | `utils/blueprintPranchas.ts` |
| `PHidro` | `utils/blueprintPranchaHidro.ts` |
| `PEletr` | `utils/blueprintPranchaEletrica.ts` |
| `Iso` | `utils/blueprintIsometricoPrancha.ts` |
| `EsqV` | `utils/blueprintEsquemaVertical.ts` |
| `MemHidro` | `utils/blueprintMemorialHidro.ts` |
| `HidroExec` | `utils/blueprintHidroExecutivo.ts` |
| `ExecSvc` | `services/blueprintProjetoExecutivoService.ts` |
| `Budget` | `utils/blueprintBudget.ts` |
| `Ifc` | `utils/blueprintIfc.ts` |
| `3D` | `components/blueprint/Blueprint3DViewer.tsx` |
| `Ed` | `components/blueprint/BlueprintEditor.tsx` |

---

# Parte 1 — Benchmark

## Onde o ÒPURA está, em uma página

O incêndio é a **única disciplina de instalações sem nenhuma linha de código**. Mesmo assim, ele
chega a um ponto de partida melhor do que o hidrossanitário e o elétrico tiveram, porque setembro
deixou pronto quase tudo que ele precisa emprestar:

1. **Modelo de rede.**
   - `Trecho` com disciplina, DN, material, cotas e prumada entre pavimentos pela laje
     (`model:2434`, `grafo:35`).
   - `Terminal` com tipo, ficha e papel de reservatório (`model:2767, 2863`).
   - Conexões derivadas (curva, tê, junção, luva, ponta aberta) (`conexoes:191`).
   - Marcas de verificação no desenho (`Verif:31-47`).
   - `DisciplinaDeRede` é um tipo fechado de seis valores (`model:2362`), e o comentário logo
     acima (`model:2358`) já prevê o incêndio como "mais um valor". Várias tabelas são
     `Record<DisciplinaDeRede, …>` (`Rede:278, 327, 336`; `model:2718`), então o compilador vai
     listar cada lugar que precisa da entrada nova.
2. **Hidráulica.**
   - Perda de carga por Darcy-Weisbach com Swamee-Jain e comprimento equivalente de conexões
     (`HidP:136-144, 189-205`).
   - Pressão por ponto e ajuste de DN pelo caminho crítico (`Pressao:308, 346, 402`).
   - Recalque com Hman, potência e motor comercial (`Recalque:78, 84`).
   - Reservação (`Reserv:127`), que **exclui de propósito a reserva de incêndio** (`Reserv:13`).
3. **Automação.**
   - Pontos em malha dentro do ambiente (`Distr:835`).
   - Rota pelas paredes com árvore de Steiner (`Rota:70`).
   - Desvio de pilar e viga (`Obst:55-131`).
   - Percurso até a saída pelas portas (`GrafoEsp:409, 434`).
   - O molde propõe → prévia → um `runBatch` → Ctrl+Z, com `conferirPlano`.
4. **Entrega.**
   - Pranchas por disciplina (`Pranchas:189`), isométrico (`Iso:95`), esquema vertical
     (`EsqV:66`) e corte com as redes.
   - Memorial em blocos com PDF e DOCX (`MemHidro:46`).
   - Emissão com ART e hash da base (`ExecSvc:25`, `HidroExec:288`).
   - Quantitativo e orçamento por peça (`quant:1397`, `Budget:1605`).
   - IFC por disciplina (`Ifc:2067-2091`) e clash automático entre disciplinas
     (`conflitos:260`).

**O que falta, uma linha cada:**
- a disciplina INCENDIO e seus tipos de peça (hidrante, mangotinho, sprinkler, VGA, recalque,
  bomba principal e jockey, extintor, placa, luminária de emergência, detector, acionador,
  avisador, central);
- **o motor hidráulico de incêndio**: vazão fixa por hidrante, Q = K·√P no sprinkler,
  Hazen-Williams e Fair-Whipple-Hsiao, simultaneidade, ponto de equilíbrio e, acima de tudo,
  **redes em malha**. O cálculo de hoje é só em árvore: `Pressao:178-182` descarta sem aviso a
  aresta que fecha um anel;
- curva da bomba × curva do sistema, jockey, reserva técnica de incêndio;
- a área de operação e a distribuição automática de sprinklers;
- os preventivos e a rota de fuga;
- o motor de exigências do CBMMG: ocupação, altura, área e carga de incêndio levam aos sistemas
  obrigatórios;
- planilha e diagrama de pressões, detalhe de hidrante, numeração H-n e SPK-n;
- composição por peça (hidrante = abrigo + válvula + mangueira + esguicho…), que é backlog do
  hidrossanitário;
- as entidades IFC de incêndio.

## 1. Estrutura do projeto de incêndio

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Edificação com múltiplos pavimentos | E | ✅ | `Level` (`model:45`); o mesmo modelo de todas as disciplinas |
| Organização por pavimentos | E | ✅ | `levelId` em trecho e terminal (`model:2434, 2767`) |
| Níveis e elevações | E | ✅ | `elevationMm`/`defaultHeightMm` por nível (`model:45`) |
| Rede de hidrantes | E | ❌ | não existe a disciplina: `DisciplinaDeRede` tem 6 valores sem incêndio (`model:2362`) |
| Rede de sprinklers | E | ❌ | idem; decidir se é derivada dos terminais ou declarada (§ "O modelo único") |
| Rede Preventivo (equipamentos não hidráulicos) | E | ❌ | não há família de ponto preventivo; `tipoEletrico` não tem luminária de emergência nem detector (`model:2559`) |
| Tubulações horizontais e verticais | E | 🟡 | `Trecho` com `cotaAMm`/`cotaBMm` e prumada `a == b` (`model:2434`); falta a disciplina |
| Colunas/prumadas de incêndio | E | 🟡 | coluna é derivada, não entidade (trechos verticais no mesmo x,y; `EsqV:66`); a sigla só aceita `AF`/`AQ`/`TQ` (`EsqV:27`) |
| Ligações entre pavimentos | E | 🟡 | nó na laje: a cota ≤ 0 vira nó do nível de baixo (`grafo:35`); herdado |
| Lançamento em planta baixa | E | 🟡 | ferramentas de trecho e ponto da hidráulica; falta a disciplina e os tipos |
| Lançamento em detalhe isométrico | E | ❌ | o isométrico é só saída de prancha (`Iso:95`); nenhuma disciplina é lançada nele |
| Lançamento pelas coordenadas X, Y e Z | E | 🟡 | cota (Z) editável pelo `SetTerminalProps` (`commands:726`); X e Y só por clique e encaixe; não há campo de coordenada absoluta |
| Diferentes planos de trabalho XY/XZ/YZ | E | ❌ | só a planta (XY) é editável; corte e elevação são vistas |
| Ajuste de elevação dos componentes | E | 🟡 | `cotaMm` no terminal e cotas no trecho; herdado |
| Ajuste do sentido de fluxo | E | 🟡 | o sentido é **derivado** (BFS da origem, `Pressao:178`; árvore do esgoto) e não se ajusta à mão; no incêndio a origem é a bomba/reservatório; declarar o sentido só onde a malha deixar ambíguo |
| Representação e edição 3D | E | 🟡 | 3D representa trecho como cilindro na cor da disciplina e terminal como caixa (`3D:37, 741`); no 3D só se SELECIONA (`3D:886`), não se edita |

## 2. Rede de hidrantes

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento de hidrantes | E | ❌ | tipo de ponto `HIDRANTE` a criar em `TIPOS_DE_PONTO_HIDRAULICO` (`model:2650`) ou numa lista própria `tipoIncendio` |
| Hidrantes simples | E | ❌ | — |
| Hidrantes duplos | E | ❌ | — |
| Mangotinhos | E | ❌ | — |
| Hidrantes com múltiplos rolos de mangueira | E | ❌ | atributo de quantidade e comprimento de mangueira na ficha |
| Hidrantes com proporcionador de espuma mediante cadastro | M | ❌ | nicho (LGE); entra pelo cadastro personalizado (§28) |
| Tubulação de alimentação | E | 🟡 | trecho genérico; papel "alimentador" derivado (§4) |
| Colunas de incêndio | E | 🟡 | ver §1 "Colunas" |
| Ramais | E | 🟡 | trecho genérico; papel derivado (§4) |
| Conexões | E | 🟡 | conexões derivadas da geometria (`conexoes:191`); falta a tabela de conexões de aço roscado/ranhurado e DN até 150 |
| Registros | E | 🟡 | `REGISTRO_*` existe na água (`model:2650`); falta o registro de incêndio (globo angular 45°) e liberar os tipos para a disciplina (`model:2718`) |
| Válvulas | E | 🟡 | `VALVULA_RETENCAO` existe (`model:2650`); faltam VGA, alívio, chave de fluxo |
| Esguichos | E | ❌ | componente do conjunto do hidrante (§46) |
| Mangueiras | E | ❌ | idem |
| Abrigos | E | ❌ | caixa com medidas + símbolo; molde `CAIXA_PASSAGEM` elétrica (terminal com medidas) |
| Cadastro personalizado de hidrantes | E | 🟡 | tipos por organização em `blueprint_element_types` (migration `aplicar_20270918000040`, família `TERMINAL`) + parâmetros (`blueprint_parameter_definitions`); faltam dados hidráulicos no tipo |
| Simbologias 2D e 3D | E | ❌ | símbolo 2D por tipo (molde `simboloDoPonto` da elétrica) e forma 3D (hoje caixa, `3D:741`) |
| Associação de materiais aos hidrantes | E | ❌ | **composição por peça**: backlog do hidrossanitário (`Budget:1582-1651` faz uma linha por `itemCode`) |

## 3. Dimensionamento da rede de hidrantes

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Definir vazão mínima | E | ❌ | hipótese por estudo (`blueprint_study_incendio`), com o preset do CBMMG por tipo de sistema |
| Definir pressão mínima | E | 🟡 | a água tem mínima por ponto (`minimaKpa`, `Pressao:74`) nas premissas do estudo (`MemHidro:53`); no incêndio a mínima é no esguicho e por tipo de sistema |
| Definir quantidade de hidrantes simultâneos | E | ❌ | a demanda de hoje é pela soma de pesos, Q = 0,3·√ΣP (`AguaAuto:113`); não existe "N mais desfavoráveis abertos" |
| Definir velocidade limite | E | 🟡 | a água escolhe o menor DN dentro da velocidade-limite (`dimensionarDN`, `AguaAuto:115-125`); valor próprio do incêndio |
| Definir diâmetro das tubulações | E | 🟡 | `bitolaMm` declarado vence o sugerido; faltam DN 65–150 nas tabelas (`HidP:117, 189`) |
| Critérios específicos do projeto | E | ❌ | hipóteses nomeadas por estudo (molde `useBlueprintHidro`, `hooks/useBlueprintHidro.ts:121`) |
| Cálculo hidráulico | E | 🟡 | motor de pressão da água (`Pressao:308`), só árvore e só com demanda de pesos |
| Cálculo das vazões | E | ❌ | vazão fixa por hidrante e redistribuída pela pressão real (Q = K·√P no esguicho) |
| Cálculo das pressões | E | 🟡 | pressão por nó (`Pressao:80`); reaproveitável depois de trocar a demanda |
| Cálculo de perdas de carga | E | 🟡 | Darcy + Swamee-Jain (`HidP:136-144`) e Leq (`HidP:189`); faltam Hazen-Williams e FWH e a tabela Leq de aço |
| Dimensionamento dos tubos | E | 🟡 | `ajustarDnPorPressao` sobe um DN por vez no caminho crítico (`Pressao:346`); falta o critério de velocidade do incêndio e DN > 75 (a tabela para no 75 e extrapola) |
| Identificação dos hidrantes mais desfavoráveis | E | ❌ | o "ponto crítico" de hoje é o de menor pressão sob a demanda de pesos |
| Análise dos hidrantes simultaneamente em operação | E | ❌ | — |
| Verificação da pressão nos demais hidrantes | E | ❌ | — |
| Cálculo do ponto de equilíbrio de pressão | E | ❌ | iteração vazão × pressão nos esguichos abertos, que exige o solver da E2 |
| Geração da planilha de pressões | E | 🟡 | a tabela `Trecho, DN, L, ΣP, Q, V, J, hf, P` já sai no memorial hidro (`MemHidro:156`); falta a versão de incêndio e a folha própria (§34) |
| Hazen-Williams | E | ❌ | não existe (`HidP` só tem Darcy) |
| Fórmula universal | E | ✅ | Darcy-Weisbach com Swamee-Jain (`HidP:144`); rugosidade por material (`HidP:16-46`); falta a rugosidade de aço |
| Fair-Whipple-Hsiao | E | ❌ | não existe |

## 4. Redes ramificadas e redes em malha

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Rede ramificada | E | ✅ | o motor de pressão percorre a árvore a partir da origem (`Pressao:178-182`) |
| Rede em anel | E | ❌ | **o BFS guarda o primeiro pai e descarta a aresta que fecha o laço** (`Pressao:181`): o trecho do anel fica sem vazão, sem aviso |
| Rede em malha | E | ❌ | idem; precisa de Hardy-Cross ou do método do gradiente |
| Rede em grelha | E | ❌ | idem |
| Caminhos hidráulicos múltiplos | E | ❌ | idem |
| Balanceamento das vazões | E | ❌ | idem |
| Cálculo iterativo | E | ❌ | não há iteração; o cálculo é uma passada |
| Classificação dos tubos (alimentadores, ramais e sub-ramais) | E | 🟡 | o papel do trecho existe no esgoto (`esgotoTrechoATrecho`, citado em `utils/blueprintNbr8160.ts:15`) e o rótulo na água (`AguaAuto:172`); falta derivar no incêndio (geral, subgeral, ramal, sub-ramal) |

## 5. Sprinklers

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento manual de sprinklers | E | ❌ | tipo `SPRINKLER` a criar |
| Lançamento automático | E | 🟡 | malha de pontos no ambiente (`Distr:835`: n = ⌈área ÷ m² por ponto⌉, células dentro do polígono); faltam espaçamento máximo, distância à parede e obstrução |
| Sprinkler pendente | E | ❌ | atributo de posição na ficha |
| Sprinkler upright | E | ❌ | idem |
| Diferentes diâmetros de rosca | E | ❌ | idem |
| Diferentes fatores K | E | ❌ | idem |
| Configuração da altura | E | 🟡 | `cotaMm` do terminal; distância ao teto é regra nova |
| Configuração do número de sprinklers | E | ❌ | parâmetro do lançamento automático (§6) |
| Configuração da quantidade por ramal | E | ❌ | idem |
| Espaçamento entre sprinklers | E | ❌ | idem |
| Espaçamento entre ramais | E | ❌ | idem |
| Alimentadores | E | 🟡 | trecho genérico; papel derivado (§4) |
| Ramais | E | 🟡 | idem |
| Sub-ramais | E | 🟡 | idem |
| Ramais de contorno | E | ❌ | traçado automático (§7) |
| Ramais de derivação | E | ❌ | idem |
| Redes em malha/grelha | E | ❌ | ver §4 |
| Integração com hidrantes | E | ❌ | ver §13 |

## 6. Distribuição automática de sprinklers

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Delimitar uma região | E | 🟡 | o ambiente (`Space`, `model:735`) já é a região natural; falta a região desenhada livre (molde: os polígonos `Quadra`/`AreaPublica` do loteamento, `model:2104, 2192`) |
| Quantidade de ramais | E | ❌ | — |
| Espaçamento dos ramais | E | ❌ | — |
| Quantidade de sprinklers por ramal | E | ❌ | — |
| Espaçamento dos sprinklers | E | ❌ | — |
| Elevação dos sprinklers | E | ❌ | — |
| Tubulação | E | ❌ | ver §7 |
| Ramais de contorno | E | ❌ | — |
| Alimentação | E | ❌ | — |
| Área de operação | E | ❌ | ver §8 |
| Preview dinâmico com alternativas antes de confirmar | E | 🟡 | todo automático tem prévia (propõe → prévia → `runBatch` → Ctrl+Z; `conferirPlano`, `utils/blueprintCircuitosAutomaticos.ts:520`); falta a comparação de alternativas lado a lado |

## 7. Lançamento automático da tubulação de sprinklers

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Sprinklers → ramais → derivações → alimentadores → rede principal | E | 🟡 | a água faz origem → barrilete → colunas → ramais (`AguaAuto:250`) e a elétrica faz Prim + Dijkstra (`grafo:171`); o incêndio precisa do traçado em espinha (ramais paralelos, subgeral perpendicular) |
| Ramais de derivação perpendiculares ao ramal principal | E | ❌ | — |
| Desvio de viga e pilar no traçado | E | 🟡 | `Obst:55-131` (pilar custa +10 m, rede sob a viga); herdado |

## 8. Área de operação dos sprinklers

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Objeto Área de Operação | E | ❌ | entidade nova no kernel (polígono + nível + risco); bump |
| Área retangular | E | ❌ | — |
| Área poligonal | E | ❌ | — |
| Criação automática | E | ❌ | região hidraulicamente mais distante, com proporção da NBR 10897 (CONFERIR NA NORMA) |
| Criação manual | E | ❌ | — |
| Associação aos sprinklers | E | ❌ | derivada: sprinklers dentro do polígono |
| Identificação da região hidraulicamente desfavorável | E | ❌ | sai do solver (E2) |
| Configuração da área de aplicação | E | ❌ | — |
| Número máximo de sprinklers | E | ❌ | — |
| Cálculo da vazão necessária | E | ❌ | densidade × área, conferida contra Σ K·√P |

## 9. Classificação de risco

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Risco leve | E | ❌ | hipótese por estudo ou por área de operação |
| Ordinário grupo 1 | E | ❌ | — |
| Ordinário grupo 2 | E | ❌ | — |
| Extraordinário grupo 1 | E | ❌ | — |
| Extraordinário grupo 2 | E | ❌ | — |
| Risco → área → densidade → vazão → tubos → pressão da bomba, em cadeia | E | ❌ | todos derivados, nunca copiados (molde do elétrico: hipótese muda o hash da base) |
| Classificação automática do risco pelo uso do ambiente | A | ❌ | vai além: `usoDoNome` (`utils/blueprintPrograma.ts:327`) já deduz o uso residencial do nome; falta a tabela uso → risco |

## 10. Densidade de projeto dos sprinklers

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Critério automático (risco × área → densidade) | E | ❌ | tabela da NBR 10897 (CONFERIR NA NORMA) |
| Critério manual (L/min/m²) | E | ❌ | hipótese declarada vence a sugerida (padrão do projeto) |

## 11. Fator K dos sprinklers

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Fator K | E | ❌ | atributo na ficha e no tipo cadastrado |
| Diâmetro | E | ❌ | — |
| Modelo do sprinkler | E | 🟡 | tipo por organização (`blueprint_element_types`) + parâmetros livres |
| Item comercial | E | 🟡 | `itemCode` no terminal vira linha de orçamento (`Budget:1605-1649`) |
| Simbologia | E | ❌ | — |
| Parâmetros de cálculo | E | ❌ | — |
| Q = K·√P | E | ❌ | a demanda do motor de hoje é por pesos (`AguaAuto:113`) |

## 12. Dimensionamento hidráulico dos sprinklers

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Vazão de cada sprinkler | E | ❌ | K·√P |
| Vazão da área de operação | E | ❌ | — |
| Pressão dos sprinklers | E | 🟡 | pressão por nó (`Pressao:80`) |
| Perdas de carga | E | 🟡 | ver §3 (falta Hazen-Williams) |
| Pressão nos nós | E | 🟡 | idem |
| Vazões dos trechos | E | 🟡 | `TrechoCalculado` (`Pressao:80`); só árvore |
| Diâmetros | E | 🟡 | `ajustarDnPorPressao` (`Pressao:346`) |
| Alimentação necessária | E | ❌ | Q e P na origem, entregues à bomba (§15) |
| Cálculo hidráulico | E | 🟡 | ver §3 |
| Método das tabelas | E | ❌ | DN pelo número de sprinklers a jusante (NBR 10897, CONFERIR NA NORMA) |
| Redes ramificadas | E | ✅ | ver §4 |
| Redes em malha | E | ❌ | ver §4 |
| Processo iterativo | E | ❌ | ver §4 |
| Balanceamento das vazões | E | ❌ | ver §4 |

## 13. Integração sprinkler + hidrante

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Compartilhar a alimentação hidráulica | E | ❌ | uma disciplina INCENDIO com duas famílias de terminal na mesma rede resolve sem modelo novo |
| Demanda da área de operação + hidrantes associados, no mesmo cálculo | E | ❌ | cenário de demanda = {área de operação} ∪ {hidrantes simultâneos} |
| Vazão requerida | E | ❌ | — |
| Pressão necessária | E | ❌ | — |

## 14. VGA — Válvula de Governo e Alarme

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento da válvula | E | ❌ | tipo `VGA` |
| Inserção na rede | E | 🟡 | ponto no meio do trecho já existe para registro e válvula (conexão manual, `conexoes:52`) |
| Representação gráfica | E | ❌ | — |
| Representação BIM | E | ❌ | `IfcValve` com o sistema de incêndio |
| Conexão hidráulica | E | 🟡 | idem "inserção" |
| Associação aos sprinklers | E | ❌ | derivada: sprinklers a jusante da VGA |
| Inclusão nos quantitativos | E | 🟡 | terminal com `itemCode` já vira linha (`Budget:1629`) |
| Kits de VGA | E | ❌ | ver §29 |

## 15. Bombas de incêndio

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançar a bomba principal | E | 🟡 | `BOMBA` existe na água e o recalque a posiciona ao lado da cisterna (`Recalque:84`); falta a bomba de incêndio (principal) |
| Dimensionar a bomba principal | E | 🟡 | Hman, potência e motor comercial (`Recalque:15, 121`); a vazão hoje vem do consumo diário, não da demanda de incêndio |
| Vazão requerida | E | ❌ | sai do solver (E2) |
| Altura manométrica | E | 🟡 | `Recalque` soma desnível e perdas |
| Pressão requerida | E | ❌ | — |
| Perdas da instalação | E | 🟡 | `HidP` |
| Curva do sistema | E | ❌ | H(Q) varrendo Q no solver |
| Curva da bomba | E | ❌ | pontos Q×H do cadastro (§18) |
| Confrontar as curvas e escolher um equipamento compatível | E | ❌ | ponto de operação = interseção |

## 16. Curva da bomba

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Curva vazão × altura manométrica | E | ❌ | — |
| Ponto de funcionamento | E | ❌ | — |
| Curva do sistema | E | ❌ | — |
| Seleção da bomba | E | ❌ | — |
| Análise da condição de funcionamento | E | ❌ | faixa de operação, shutoff, 150 % da vazão (CONFERIR NA NORMA) |
| Representação da curva | E | ❌ | desenho no `Desenhista` da prancha (molde: unifilar em SVG/PDF) |
| Documentação associada | E | ❌ | memorial de cálculo (§47) |
| Traçado automático da curva da bomba para redes de hidrantes | E | ❌ | — |

## 17. Bomba jockey

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançamento da bomba jockey | E | ❌ | tipo `BOMBA_JOCKEY` |
| Associação à bomba principal | E | ❌ | relação por id (molde `quadroPaiId` da elétrica) |
| Manutenção da pressurização da rede | E | ❌ | pressostatos de partida e parada como hipótese |
| Parâmetros próprios | E | ❌ | — |
| Representação | E | ❌ | — |
| Quantitativos | E | 🟡 | terminal com `itemCode` |

## 18. Cadastro de bombas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Fabricante | E | 🟡 | parâmetro livre por organização (`blueprint_parameter_definitions`) |
| Modelo | E | 🟡 | tipo por organização (`blueprint_element_types`) |
| Potência | E | 🟡 | motor comercial em cv no recalque (`Recalque:15`); falta no cadastro |
| Dados hidráulicos | E | ❌ | — |
| Curva de funcionamento | E | ❌ | tabela de pontos Q×H: coluna JSONB no tipo ou tabela nova |
| Diâmetros | E | ❌ | sucção e recalque |
| Itens comerciais | E | 🟡 | `itemCode` |
| Simbologia 2D | E | ❌ | — |
| Simbologia 3D | E | ❌ | — |
| Materiais associados | E | ❌ | composição por peça (§46) |

## 19. Reservação e alimentação hidráulica

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Reservatório | E | 🟡 | `RESERVATORIO` com `volumeL` e `papelReservatorio` SUPERIOR/INFERIOR (`model:2704, 2863`); falta o papel ou a fração de **RTI** |
| Cisterna | E | 🟡 | reservatório INFERIOR |
| Alimentação | E | 🟡 | `utils/blueprintAlimentador.ts` (hidrômetro → boia) é consumo, não incêndio |
| Bomba | E | 🟡 | ver §15 |
| Rede pressurizada | E | ❌ | — |
| Colunas de incêndio | E | 🟡 | ver §1 |
| Verificar se a fonte atende pressões e vazões | E | ❌ | a água confere a pressão nos pontos pela cota da caixa; falta pela bomba e pela vazão de incêndio |
| Volume da RTI pela tabela do CBMMG | E | ❌ | `Reserv:13` exclui a reserva de incêndio de propósito; volume por tipo de sistema × área (CONFERIR NA IT) |
| Consumo tomado acima da RTI | E | ❌ | regra de verificação: a saída de consumo fica acima do volume reservado |

## 20. Extintores

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Extintores portáteis | E | ❌ | tipo `EXTINTOR` com agente e carga |
| Extintores sobre rodas/carreta | E | ❌ | — |
| Água/espuma conforme biblioteca | E | ❌ | — |
| Pó químico | E | ❌ | — |
| CO₂ | E | ❌ | — |
| Diferentes cargas | E | ❌ | — |
| Componentes personalizados | E | 🟡 | tipo por organização + parâmetros |
| Símbolo 2D | E | ❌ | — |
| Geometria 3D | E | ❌ | caixa com medidas hoje (`3D:741`) |
| Modelo | E | 🟡 | tipo por organização |
| Fabricante | E | 🟡 | parâmetro livre |
| Carga | E | ❌ | — |
| Item comercial | E | 🟡 | `itemCode` |
| Associação à lista de materiais | E | ❌ | lista de materiais de incêndio (molde `utils/blueprintListaDeMateriaisEletrica.ts:41`) |
| Posicionamento automático por distância a percorrer e capacidade extintora | A | ❌ | vai além (gerador de PPCI): percurso pelo `GrafoEsp:409` |

## 21. Sinalização de emergência

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Placas de equipamentos | E | ❌ | tipo `PLACA` com código e categoria; hoje só existe `Anotacao` TEXTO (`model:1910`) como paliativo |
| Indicação de hidrante | E | ❌ | — |
| Indicação de extintor | E | ❌ | — |
| Sinalizações de emergência | E | ❌ | — |
| Placas direcionais | E | ❌ | direção = rotação do terminal |
| Sinalização de rota de fuga | E | ❌ | — |
| Símbolos personalizados | E | ❌ | — |
| Códigos nas placas | E | ❌ | catálogo de códigos da NBR 13434 e da IT do CBMMG (CONFERIR NA NORMA) |
| Sinalizações associadas a outros elementos | E | ❌ | placa com `alvoId` (o equipamento); o kit cria as duas (§29) |
| Posicionamento automático ao longo da rota de fuga | A | ❌ | vai além (gerador de PPCI) |

## 22. Rota de fuga — sinalização

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Direção de saída | E | ❌ | variantes de placa |
| Seguir em frente | E | ❌ | — |
| Esquerda | E | ❌ | — |
| Direita | E | ❌ | — |
| Mudanças de direção | E | ❌ | — |
| Saídas | E | ❌ | — |
| Demais sinalizações de abandono | E | ❌ | — |
| Motor que calcula a rota de fuga (o AltoQi não tem) | A | 🟡 | vai além: `percursoAteASaida` (`GrafoEsp:434`) já faz Dijkstra ambiente → porta → exterior e dá a porta mais estreita; faltam vários pavimentos pela escada, o ponto mais desfavorável e contornar obstáculos |

## 23. Detecção de incêndio

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Inserir elementos de detecção | E | ❌ | tipos `DETECTOR_FUMACA`/`_TEMPERATURA`/`_CHAMA` |
| Representação no modelo | E | ❌ | — |
| Representação nas pranchas | E | ❌ | — |
| Quantitativos | E | ❌ | — |
| Pontos de detecção da biblioteca/cadastro | E | 🟡 | tipo por organização |
| Distribuição automática por área de cobertura | A | 🟡 | vai além: `malhaDeLuminarias` (`Distr:835`) serve de molde; falta raio e distância à parede (NBR 17240, CONFERIR NA NORMA) |

## 24. Alarme de incêndio

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Lançar elementos de alarme | E | ❌ | `ACIONADOR_MANUAL`, `AVISADOR` (sonoro/visual), `CENTRAL_ALARME` |
| Representá-los na planta/modelo | E | ❌ | — |
| Incluí-los na lista de materiais | E | ❌ | — |
| Laço/circuito como relação e eletroduto pela elétrica | A | ❌ | vai além: `Circuito` da elétrica é o molde; o eletroduto automático (`grafo:171`) pode rotear o laço |
| Simulador elétrico completo do laço | N | ❌ | o próprio pedido diz que o AltoQi não faz |

## 25. Iluminação de emergência

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Equipamentos de iluminação de emergência | E | ❌ | tipo `LUMINARIA_EMERGENCIA` (bloco autônomo / central), como preventivo ou como `tipoEletrico` ligado a circuito |
| Símbolos | E | ❌ | — |
| Elementos BIM | E | ❌ | `IfcLightFixture` com `.SECURITYLIGHTING.` (a elétrica já emite `IfcLightFixture`) |
| Representação nas pranchas | E | ❌ | — |
| Inclusão na lista de materiais | E | ❌ | — |
| Posicionamento automático ao longo da rota, em escadas e em mudanças de direção | A | ❌ | vai além: NBR 10898 (espaçamento, CONFERIR NA NORMA) sobre a rota derivada (§22) |

## 26. Preventivos personalizados

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Rede Preventivo recebe equipamentos adicionais | E | ❌ | tipo `PREVENTIVO_PERSONALIZADO` que lê o tipo por organização |
| Motor de ventilação de escada pressurizada | E | ❌ | — |
| Equipamentos auxiliares | E | ❌ | — |
| Elementos personalizados | E | 🟡 | tipos e parâmetros por organização (`blueprint_element_types`, `blueprint_parameter_definitions`); faltam símbolo e forma próprios |

## 27. Escada pressurizada — representação de equipamentos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Motor | E | ❌ | preventivo personalizado (§26) |
| Ventilador | E | ❌ | idem; a família MECANICA já existe na rede (`model:2362`) |
| Componentes auxiliares | E | ❌ | idem |
| Tipo de escada exigido (NE/EP/PF) × escada desenhada | A | ❌ | vai além: `Escada` tem `tipo` ESCADA/RAMPA e `larguraMm` (`model:1500`), sem enclausurada nem à prova de fumaça |
| Cálculo aerodinâmico da pressurização | N | ❌ | o próprio pedido diz que o AltoQi não faz |

## 28. Cadastro de peças

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Nome | E | ✅ | `blueprint_element_types.nome` (migration `aplicar_20270918000040`) |
| Categoria | E | 🟡 | `familia` com CHECK fechado (ESTRUTURA/TERMINAL/ESCADA/TELHADO/COMPONENTE/PISO/FORRO, migration `aplicar_20270919000051`); o incêndio cabe em TERMINAL, mas falta a categoria de incêndio dentro dele |
| Fabricante | E | 🟡 | parâmetro livre (`blueprint_parameter_definitions`, `components/blueprint/PainelParametros.tsx:5`) |
| Dimensões | E | 🟡 | medidas no terminal (larguraMm/profundidadeMm/alturaMm) |
| Propriedades | E | 🟡 | `propriedadesDoTerminal` (`utils/blueprintTipos.ts:112`) |
| Parâmetros hidráulicos | E | ❌ | K, perda, vazão nominal |
| Materiais | E | ❌ | — |
| Itens associados | E | ❌ | composição por peça (§46) |
| Custo/identificação comercial | E | 🟡 | `itemCode` |
| Símbolo 2D | E | ❌ | catálogo de símbolos é fechado no código (`model:1636`) |
| Símbolo 3D | E | ❌ | idem |
| Pontos de conexão | E | 🟡 | a conexão do terminal é o seu ponto; peça com várias bocas (VGA, bomba: sucção e recalque) é nova |

## 29. Kits de instalações

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Conceito de kit | E | 🟡 | kits por AMBIENTE na hidráulica (BANHEIRO/COZINHA/ÁREA DE SERVIÇO, `PtsHidro:45, 239`) e peças da caixa (`utils/blueprintPecasDaCaixa.ts:48`); falta o kit como conjunto de peças posicionadas |
| Hidrante + placa | E | ❌ | — |
| Extintor + sinalizações | E | ❌ | — |
| VGA | E | ❌ | — |
| Kit criado pelo projetista | E | ❌ | tabela por organização (molde `blueprint_element_types`) |

## 30. Diagnóstico do lançamento

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Conexão sem peça | E | 🟡 | conexões derivadas (`conexoes:191`) não precisam de peça: a peça É derivada; o aviso vale para peça declarada que não casa |
| Tubo desconectado | E | ✅ | `PONTA_ABERTA` (`Verif:31, 104`); vale para a disciplina nova quando entrar em `HIDRAULICAS` (`conexoes:148`) |
| Falta de fluxo de entrada | E | 🟡 | `redeDaOrigem` (`AguaAuto:205`) acha o que não chega à origem; falta a marca |
| Falta de fluxo de saída | E | ❌ | — |
| Fluxo incorreto | E | 🟡 | `CONTRAFLUXO` no esgoto (`Verif:38, 123`) |
| Peça inadequada para o sentido do fluxo | E | ❌ | retenção e VGA ao contrário |
| Peça subdimensionada | E | 🟡 | `PRESSAO_BAIXA` (`Verif:35`); falta DN da peça × DN do tubo |
| Peça superdimensionada | E | ❌ | — |
| Inconsistências hidráulicas | E | 🟡 | "N trechos no mesmo nó" (`conexoes:191-332`), `DN_DIMINUI` |

## 31. Processamento e verificações hidráulicas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Diâmetros | E | 🟡 | conferência da água (`HidroExec:60`) |
| Vazões | E | ❌ | — |
| Pressões | E | 🟡 | idem |
| Perdas de carga | E | 🟡 | idem |
| Sentido de fluxo | E | 🟡 | idem (esgoto) |
| Simultaneidade dos hidrantes | E | ❌ | — |
| Área de operação | E | ❌ | — |
| Capacidade da bomba | E | ❌ | — |
| Pressão mínima | E | 🟡 | `EstadoDaPressao` com NAO_AVALIADO (`Pressao:66`) |
| Velocidade da água | E | 🟡 | só no dimensionamento, não como regra |
| Condições dos sprinklers | E | ❌ | — |
| Inconsistências apresentadas ao projetista | E | ✅ | molde de conferência por norma + marcas no desenho + emissão travada (`HidroExec:60`, `Verif`) |

## 32. Configurações por normas e Corpo de Bombeiros

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Adaptar parâmetros às exigências locais | E | 🟡 | premissas por estudo com preset nomeado (molde `PRESETS_DE_DEMANDA` da elétrica, `utils/blueprintEletricaDimensionamento.ts:929`, e `useBlueprintHidro`) |
| **Minas Gerais (CBMMG): Decreto + ITs** | E | ❌ | preset MG é o primeiro; tabelas transcritas ficam "CONFERIR NA IT" até o texto ser colado |
| São Paulo | A | ❌ | preset nomeado vazio (a régua do usuário é MG) |
| Bahia | A | ❌ | idem |
| Paraná | A | ❌ | idem |
| Mato Grosso | A | ❌ | idem |
| Rio de Janeiro | A | ❌ | idem |
| Classificação da edificação: ocupação/divisão, altura, área, carga de incêndio → **sistemas exigidos** | A | 🟡 | vai além (motor 1 da proposta). Existe: área por pavimento (`quant:1189`), pavimentos, ambientes com nome e uso residencial deduzido (`utils/blueprintPrograma.ts:327`). Falta: ocupação, altura pela regra do bombeiro (a `altura` de `utils/blueprintRegras.ts:99` é o topo do último pavimento, outra coisa), carga de incêndio |

## 33. Normas hidráulicas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| NBR 13714 — hidrantes e mangotinhos | E | ❌ | constantes com fonte, conferência por item |
| NBR 10897 — chuveiros automáticos | E | ❌ | idem |
| Adaptar para as ITs estaduais | E | ❌ | ver §32 |

## 34. Planilha de pressão

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Trechos | E | 🟡 | a tabela de trechos do memorial hidro (`MemHidro:156`) tem Trecho, DN, L, ΣP, Q, V, J, hf e P a jusante |
| Diâmetros | E | 🟡 | idem |
| Comprimentos | E | 🟡 | idem |
| Vazões | E | 🟡 | idem |
| Perdas de carga | E | 🟡 | idem |
| Pressões | E | 🟡 | idem |
| Pressão disponível | E | 🟡 | idem (`disponivelKpa`) |
| Pressão necessária | E | 🟡 | idem (`minimaKpa`) |
| Hidrantes desfavoráveis | E | ❌ | — |
| Planilha como folha de prancha e como XLSX | E | ❌ | hoje só dentro do memorial; falta o `TipoDePrancha` (`Pranchas:153`) e a exportação |

## 35. Diagrama de pressões

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Localizar no projeto os trechos do cálculo | E | 🟡 | `components/blueprint/PainelPressoesDaAgua.tsx` mostra a pressão por ponto; não destaca o caminho |
| Reservatório/bomba → tubulação → hidrante crítico, destacado | E | ❌ | caminho crítico por `menorCaminhoEntre` (`grafo:89`) + destaque por uid (molde `coresPorUid` do clash no 3D, `3D:128`) |

## 36. Numeração automática

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Numeração de hidrantes | E | ❌ | derivada (H-1…), como `nomesDasColunas` (`EsqV:118`); `Terminal.rotulo` declarado vence |
| Numeração de sprinklers | E | ❌ | idem (SPK-n por área ou por ramal) |
| Identificação dos componentes | E | 🟡 | `renumerarCircuitos` (`utils/blueprintCircuitosAutomaticos.ts:246`) e `trechosNumerados` (`utils/blueprintKernel/fiacao.ts:293`) são o molde |
| Referências para documentação e detalhamento | E | ❌ | — |

## 37. Detalhamento de hidrantes

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Blocos de detalhamento de hidrantes nas pranchas | E | ❌ | folha de detalhes (molde `DETALHES_HIDRO`, `Pranchas:259`) |
| Elementos que compõem o conjunto | E | ❌ | sai da composição (§46) |

## 38. Detalhes isométricos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Gerar isométrico | E | 🟡 | `isometricosDoModelo` (`Iso:95`) está fixo em `['AGUA','ESGOTO']` (`Iso:102`) e recorta por ambiente; o incêndio recorta por coluna ou ramal |
| Editar no isométrico | E | ❌ | — |
| Tubos | E | 🟡 | herdado |
| Conexões | E | 🟡 | herdado |
| Registros | E | 🟡 | herdado |
| Hidrantes | E | ❌ | — |
| Bombas | E | ❌ | — |
| Sprinklers | E | ❌ | — |
| Elevações | E | 🟡 | cotas no isométrico (hidro E2.4) |
| Mudanças de direção | E | 🟡 | herdado |
| Prumadas | E | 🟡 | herdado |
| Lançamento direto no isométrico | E | ❌ | ver §1 |

## 39. Esquema vertical

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Esquema vertical da disciplina | E | 🟡 | hidro (`EsqV:66, 158`) e elétrico (`utils/blueprintEsquemaVerticalEletrico.ts`); a sigla da coluna é fechada em AF/AQ/TQ (`EsqV:27`) |
| Reservatório → bombas → coluna → pavimentos → hidrantes/sprinklers | E | ❌ | — |

## 40. Cortes

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Alturas | E | ✅ | o corte leva as redes de qualquer disciplina (`utils/blueprintCorte.ts:210`) |
| Tubulações | E | ✅ | idem |
| Equipamentos | E | ❌ | terminais não aparecem no corte |
| Interferências | E | 🟡 | clash é relatório à parte (§42) |
| Posicionamento vertical | E | ✅ | idem "alturas" |

## 41. Modelagem BIM 3D

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Tubulações 3D | E | 🟡 | cilindro na cor da disciplina (`3D:37`); falta a cor de incêndio (`Rede:278`) |
| Conexões | E | 🟡 | peças derivadas no 3D (hidro) |
| Hidrantes | E | ❌ | forma do abrigo |
| Sprinklers | E | ❌ | — |
| Bombas | E | ❌ | — |
| Extintores | E | ❌ | — |
| Sinalizações | E | ❌ | — |
| Equipamentos | E | 🟡 | caixa com medidas (`3D:741`) |
| Propriedades dos objetos | E | 🟡 | painel de propriedades e parâmetros |
| Geometria realista | E | ❌ | — |
| IFC com as classes de incêndio | E | ❌ | `IfcFireSuppressionTerminal` (FIREHYDRANT, HOSEREEL, SPRINKLER, BREECHINGINLET), `IfcAlarm`, `IfcSensor`, sistema `.FIREPROTECTION.` — nenhuma citada no código; a lista de exclusões diz "NÃO CONTÉM … incêndio" (`Ifc:181`); classe e sistema por disciplina já existem (`Ifc:2067, 2082`) |
| Importar incêndio de IFC | E | ❌ | a elétrica foi importada pelos vértices na E7.2 (`utils/ifcParaKernel.ts`) |

## 42. Compatibilização multidisciplinar

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Com arquitetura | E | ✅ | trecho × vão de porta ou janela e × parede estrutural (`conflitos:260`) |
| Com estrutura | E | ✅ | trecho × pilar/viga/laje (`conflitos:260`) |
| Com hidráulica | E | ✅ | trecho × trecho de outra disciplina, automático para disciplina nova |
| Com elétrica | E | ✅ | idem |
| Com gás | E | ❌ | não há disciplina de gás |
| Com climatização | E | 🟡 | MECANICA existe na rede |
| Com SPDA | E | ❌ | não existe |
| Com cabeamento | E | 🟡 | dados como ponto elétrico |
| Sprinkler × luminária | E | ❌ | **terminal × terminal não existe** no clash |
| Tubulação de incêndio × viga | E | 🟡 | vem de graça com a disciplina |
| Hidrante × arquitetura | E | ❌ | ponto × estrutura existe (`utils/blueprintKernel/conflitosArquitetonicos.ts:84`); falta ponto × porta e porta do abrigo |
| Prumada × estrutura | E | 🟡 | vem de graça |
| BCF dos conflitos | E | ✅ | `utils/blueprintBcf.ts` |

## 43. Plantas do projeto de incêndio

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Rede de hidrantes | E | ❌ | bloco de disciplina em `planejarConjunto` (`Pranchas:189`), recorte por família (molde `utils/blueprintRecorteEletrico.ts:64`) |
| Rede de sprinklers | E | ❌ | idem |
| Extintores | E | ❌ | — |
| Sinalização | E | ❌ | — |
| Detecção | E | ❌ | — |
| Alarmes | E | ❌ | — |
| Iluminação de emergência | E | ❌ | — |
| Demais preventivos | E | ❌ | — |
| Pranchas para apresentação (carimbo, índice, DXF) | E | 🟡 | conjunto de pranchas, carimbo e DXF por camada (`utils/blueprintDxf.ts:55`); faltam as camadas de incêndio |
| Quadro-resumo das medidas de segurança do PPCI (formato do CBMMG) | E | ❌ | — |

## 44. Simbologia específica para pranchas

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Representação de modelo ≠ representação de prancha | E | 🟡 | já são dois desenhistas separados (canvas × prancha: `simboloDoPonto` da elétrica com mm fixos; `itensDaLegendaEletrica`, `PEletr:649`), mas não há escolha declarada por tipo; o hidro usa a mesma geometria nos dois (`PHidro:249`) |
| Legenda com o símbolo real | E | 🟡 | `desenharLegendaEletrica` (`PEletr:731`), `desenharLegendaHidro` (`PHidro:282`) |

## 45. Quantitativos

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Tubos | E | 🟡 | `agruparPorBitola` (`quant:1372`); falta material de aço e DN > 75 |
| Conexões | E | 🟡 | `agruparPorConexao` (`quant:1419`) |
| Válvulas | E | 🟡 | `agruparPorTerminal` (`quant:1397`) |
| Registros | E | 🟡 | idem |
| Hidrantes | E | ❌ | depende do tipo |
| Mangueiras | E | ❌ | depende da composição |
| Sprinklers | E | ❌ | — |
| VGA | E | ❌ | — |
| Bombas | E | ❌ | — |
| Extintores | E | ❌ | — |
| Placas | E | ❌ | — |
| Detectores | E | ❌ | — |
| Alarmes | E | ❌ | — |
| Iluminação de emergência | E | ❌ | — |
| Equipamentos auxiliares | E | ❌ | — |
| Por pavimento | E | 🟡 | `redeDoPavimento` (`utils/blueprintQuantitativosPorPavimento.ts:74`) |
| Lançamento no orçamento | E | 🟡 | `gerarLancamentosDeInstalacoes` (`Budget:1605`) só aceita as disciplinas de `REDES_HIDROSSANITARIAS` (`Budget:1582`) |

## 46. Lista de materiais

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Itens associados a um componente cadastrado | E | ❌ | uma linha por `itemCode` (`Budget:1629, 1651`); **composição por peça** é backlog do hidro |
| Hidrante → abrigo + válvula + mangueiras + esguicho + adaptador + chave + placa | E | ❌ | tabela de composição por organização + expansão no quantitativo |
| O mesmo para bombas e demais peças | E | ❌ | idem |
| Lista de materiais da disciplina como folha | E | 🟡 | molde `materiaisEletricos` + `desenharListaDeMateriaisEletrica` (`utils/blueprintListaDeMateriaisEletrica.ts:41, 77`) |
| Integração com Suprimentos | A | ❌ | vai além (motor 10 da proposta): o orçamento já existe; pedido de compra a partir da lista, não |

## 47. Relatórios

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Relatórios técnicos | E | 🟡 | memoriais em blocos PDF/DOCX (`MemHidro:46`, `services/blueprintMemorialHidroService.ts:103`, `utils/blueprintMemorialDocx.ts:88`) |
| Resultados de dimensionamento | E | 🟡 | memorial de cálculo (`MemHidro:156`) |
| Planilhas hidráulicas | E | 🟡 | ver §34 |
| Quantitativos | E | 🟡 | XLSX do quantitativo |
| Documentação do projeto | E | 🟡 | emissão com ART e hash (`ExecSvc:25` aceita TERRAPLENAGEM, ELETRICA e HIDROSSANITARIA; falta INCENDIO + migration do CHECK); memorial descritivo (`MemHidro:557`) |

## 48. Bibliotecas personalizáveis

| Funcionalidade | Grau | Estado | Evidência / o que falta |
|---|---|---|---|
| Fabricantes | E | 🟡 | parâmetro livre por organização |
| Modelos | E | 🟡 | tipo por organização |
| Peças | E | 🟡 | idem |
| Equipamentos | E | 🟡 | idem |
| Símbolos | E | ❌ | catálogo fechado no código |
| Materiais | E | ❌ | `MATERIAIS_DE_TUBO` é fechado (`model:2414`) |
| Novos extintores | E | ❌ | depende do tipo |
| Novos hidrantes | E | ❌ | idem |
| Bombas | E | ❌ | idem (§18) |
| Preventivos | E | ❌ | idem (§26) |
| Elementos especiais | E | ❌ | idem |

## O modelo único

A regra é a mesma do hidrossanitário e do elétrico: só se grava o que o projetista decide, e o
resto é derivado a cada mudança.

- **O que passa a ser guardado:**
  - trechos da disciplina `INCENDIO` (DN, material, cotas), com a mesma estrutura de hoje;
  - terminais de incêndio (hidrante, mangotinho, recalque, sprinkler, VGA, chave de fluxo, bomba
    principal e jockey, pressostato, extintor, placa, luminária de emergência, detector,
    acionador, avisador, central, preventivo personalizado), cada um com a sua ficha;
  - o papel `RTI` no reservatório (ou o volume reservado dentro do superior);
  - a **Área de Operação** (polígono + nível), a única entidade geométrica nova;
  - as relações por id: jockey → principal, placa → equipamento, detector → laço;
  - as **premissas do estudo** (`blueprint_study_incendio`): preset do CBMMG, ocupação/divisão
    declarada, risco, vazões e pressões mínimas, número de hidrantes simultâneos, velocidade-
    limite, fórmula de perda, curva da bomba escolhida;
  - no cadastro por organização: tipos, fabricantes, curva Q×H das bombas e **composição de
    cada peça**.
- **O que é derivado, e nunca copiado:**
  - a rede de hidrantes × a rede de sprinklers: um trecho é "de sprinkler" quando só alimenta
    sprinklers; a rede combinada é a mesma rede com as duas famílias;
  - o papel do trecho (geral, subgeral, ramal, sub-ramal);
  - vazões, pressões e perdas; hidrantes e área mais desfavoráveis; ponto de equilíbrio;
  - curva do sistema e ponto de operação;
  - numeração H-n e SPK-n;
  - sprinklers dentro da área de operação;
  - a classificação da edificação e os sistemas exigidos;
  - população, rota de fuga e percurso máximo;
  - planilha e diagrama de pressões, isométrico, esquema vertical, pranchas, memorial, IFC,
    clash, quantitativo e composição.
- **Onde a regra precisa de peça nova no modelo** (e não de tela nova), que é o que ordena o
  roadmap:
  - o valor `INCENDIO` e a lista de tipos com ficha;
  - materiais de aço, com rugosidade, C de Hazen-Williams, DI e Leq até DN 150;
  - a Área de Operação;
  - a bomba com curva;
  - o tipo de escada exigido e a marca de "porta de saída" (para a rota de fuga).

## Os motores

Os 10 motores da proposta do usuário, como camadas do mesmo modelo:

| Motor (proposta) | Hoje | Arquivos que servem de base | Falta o essencial |
|---|---|---|---|
| 1. Classificação e Requisitos | ❌ | `quant:1189` (área), `utils/blueprintPrograma.ts:327` (uso do nome), `GrafoEsp` | ocupação/divisão do CBMMG, altura pela regra do bombeiro, carga de incêndio, **tabela de exigências** |
| 2. Hidrantes | ❌ | `GrafoEsp:409` (percurso), `Distr`, `Rota:70` | tipos, cobertura pelo alcance da mangueira pelo percurso, abrigo junto à saída, coluna, recalque |
| 3. Sprinklers | ❌ | `Distr:835` (malha), `Obst` | risco → densidade × área, **Área de Operação**, distribuição com espaçamento e parede, traçado em espinha, VGA |
| 4. Hidráulico | 🟡 | `HidP`, `Pressao`, `grafo` | **solver de malha**, Hazen-Williams/FWH, vazão fixa e K·√P, simultaneidade, equilíbrio, DN até 150 |
| 5. Bombeamento | 🟡 | `Recalque` | curva Q×H, curva do sistema, ponto de operação, jockey, NPSH, seleção |
| 6. Preventivo | ❌ | `GrafoEsp:434`, `Distr` | extintor, sinalização com código, iluminação de emergência, rota de fuga multipavimento |
| 7. Detecção e Alarme | ❌ | `Circuito` da elétrica, eletroduto automático (`grafo:171`) | detector por cobertura, acionador pelo percurso, avisador, central, **laço como relação** |
| 8. BIM | 🟡 | `Ifc:2067-2091`, `conflitos:260`, `3D`, BCF | classes IFC de incêndio, clash terminal × terminal, forma 3D, importar |
| 9. Documentação | 🟡 | `Pranchas:189`, `Iso:95`, `EsqV:66`, `MemHidro`, `ExecSvc:25` | plantas por sistema, planilha e diagrama de pressões, detalhe de hidrante, curva da bomba, memoriais, ART |
| 10. Quantitativos | 🟡 | `quant:1372-1419`, `Budget:1605`, lista de materiais elétrica | tipos no agrupamento, `INCENDIO` em `REDES_HIDROSSANITARIAS`, **composição por peça**, Suprimentos |

## O gerador de PPCI, passo a passo

A proposta do usuário, na ordem dele, com o que cada passo encontra hoje:

| Passo | Hoje | O que o passo usa ou precisa |
|---|---|---|
| Identifica áreas, usos, pavimentos e ambientes | 🟡 | `Space` + `SpaceLabel` (`model:735, 878`), `usoDoNome` (residencial), área por pavimento; falta uso não residencial |
| Classifica ocupação e risco | ❌ | tabela do CBMMG (divisão) e risco da NBR 10897; ocupação declarada vence a deduzida |
| Determina sistemas obrigatórios | ❌ | tabela de exigências do CBMMG × altura × área × carga de incêndio (CONFERIR NA IT) |
| Calcula população | 🟡 | `populacaoDoModelo` (`Reserv:66`) conta dormitórios; falta pessoas por m² por divisão |
| Analisa saídas e rotas de fuga | 🟡 | `percursoAteASaida` (`GrafoEsp:434`), porta mais estreita; faltam escada no grafo, ponto mais desfavorável, unidades de passagem |
| Posiciona extintores | ❌ | percurso máximo + capacidade extintora |
| Posiciona hidrantes | ❌ | alcance pelo percurso |
| Distribui sprinklers | ❌ | §6 |
| Distribui detectores | ❌ | cobertura |
| Posiciona sinalização | ❌ | kit por equipamento + placas na rota |
| Posiciona iluminação de emergência | ❌ | espaçamento na rota |
| Roteia tubulações | 🟡 | `Rota:70`, `grafo:171`, `Obst` |
| Dimensiona rede | 🟡 | `Pressao` (árvore) → solver |
| Dimensiona bombas/reserva | 🟡 | `Recalque`, `Reserv` → curva e RTI |
| Verifica normas/IT estadual | 🟡 | molde de conferência (`HidroExec:60`) |
| Gera projeto 3D | 🟡 | `3D` |
| Gera pranchas | 🟡 | `Pranchas:189` |
| Gera memorial | 🟡 | `MemHidro`, DOCX |
| Gera quantitativos | 🟡 | `quant`, `Budget` |

O encadeamento em si (um botão que roda tudo) é o molde que o projeto já usa: cada motor produz um
plano de comandos puro, a prévia soma os planos, **um** `runBatch` aplica e Ctrl+Z desfaz tudo.
O que falta é cada motor existir.

## Leitura geral

Contagem feita por script sobre as tabelas das seções 1–48: 407 linhas, sendo os itens do pedido
na mesma ordem mais os desdobramentos que o próprio texto pede (as fórmulas de perda nomeadas, os
presets estaduais, o volume da RTI, o quadro-resumo do PPCI, o IFC e o "vai além" de cada grupo).

| Grau | ✅ | 🟡 | ❌ | Total |
|---|---|---|---|---|
| **E** | 17 | 129 | 243 | 389 |
| **A** | 0 | 3 | 12 | 15 |
| **M** | 0 | 0 | 1 | 1 |
| **B** | 0 | 0 | 0 | 0 |
| **N** | 0 | 0 | 2 | 2 |
| **Total** | 17 | 132 | 258 | 407 |

**O que isso diz:**

- **Dos 389 Essenciais, 17 estão prontos (4 %).** São todos herança do modelo comum: pavimentos,
  níveis, rede ramificada, fórmula universal, tubo desconectado, corte com as redes, clash com
  arquitetura, estrutura e outras redes, BCF. Nenhum é de incêndio.
- **129 Essenciais são 🟡, e aí está a vantagem.** A peça genérica existe (trecho, terminal,
  conexão derivada, pressão por nó, malha de pontos, percurso até a saída, prancha, memorial,
  emissão, quantitativo, IFC por disciplina). O incêndio precisa se ligar nela, não reescrevê-la.
  Foi o mesmo padrão do hidro (40 % no dia do benchmark) e do elétrico (58 %). Aqui a régua é
  mais alta (paridade), mas o chão também é mais alto.
- **O que não existe em lugar nenhum** e é trabalho novo de verdade: o **solver de malha**, a
  **Área de Operação**, a **curva da bomba**, o **motor de exigências do CBMMG** e a
  **composição por peça**. Todo o resto é extensão.
- **Os 15 A são o "vai além" do usuário** (o gerador de PPCI) e os presets de outros estados;
  entram no roadmap depois da paridade, com a rota de fuga antes dos preventivos.

**O caminho crítico: os 372 Essenciais ❌/🟡 agrupados pelo que precisam no código** (cada seção
está em exatamente um bloco; a soma foi conferida por script):

| # | Bloco | Itens E | Seções | Peça principal que falta |
|---|---|---|---|---|
| 1 | **Modelo e cadastro da disciplina** | 83 | 1, 2, 11, 14, 26, 27, 28, 29, 36, 48 | `INCENDIO`, tipos com ficha e símbolo, K, VGA, abrigo, preventivo personalizado, cadastro com dados hidráulicos, kits, numeração |
| 2 | **Motor hidráulico** | 60 | 3, 4, 12, 30, 31, 33 | solver de malha, Hazen-Williams/FWH, vazão fixa e K·√P, simultaneidade, equilíbrio, papel do trecho, diagnóstico e conferência |
| 3 | **Sprinklers** | 54 | 5, 6, 7, 8, 9, 10, 13 | risco → densidade × área, Área de Operação, distribuição e traçado automáticos, rede combinada |
| 4 | **Bombas e reservação** | 42 | 15, 16, 17, 18, 19 | curva Q×H, curva do sistema, ponto de operação, jockey, cadastro de bomba, RTI |
| 5 | **Preventivos** | 43 | 20, 21, 22, 23, 24, 25 | extintor, placa com código, sinalização de rota, detector, alarme, luminária de emergência |
| 6 | **Regras do CBMMG** | 2 | 32 | preset MG com as tabelas da IT (poucos itens, mas o bloco destrava o motor 1 e todo o "vai além") |
| 7 | **Documentação** | 47 | 34, 35, 37, 38, 39, 40, 43, 44, 47 | plantas por sistema, planilha e diagrama de pressões, detalhe, isométrico e esquema vertical de incêndio, terminais no corte, símbolo de prancha, memoriais, ART |
| 8 | **Quantitativo** | 21 | 45, 46 | tipos no agrupamento, disciplina no orçamento, composição por peça |
| 9 | **BIM** | 20 | 41, 42 | IFC de incêndio, forma 3D, clash terminal × terminal, importar |
| | **Total** | **372** | | |

## Achados

Não são funcionalidade, mas precisam de decisão antes do roadmap. Vieram das três leituras e
foram reabertos na frente:

1. **O motor de pressão perde vazão sem avisar em rede com anel** (`Pressao:178-182`): o BFS guarda
   o primeiro pai de cada nó e pula a aresta que fecha o laço, então aquele trecho sai com vazão
   zero e ninguém é avisado. Isso vale **já hoje para a água**, se alguém desenhar um anel.
   Proposta: na E0, uma marca "anel não calculado" em `Verif`; o cálculo de verdade vem com o
   solver da E2.
2. **O comprimento equivalente vai só até o DN 75** e, acima, cresce proporcional ao DN
   (`HidP:189-216`). A tabela é de PVC e é aplicada a todos os materiais, o que é declarado no
   código. Para aço DN 65–150 é preciso uma tabela própria (CONFERIR NA NORMA).
3. **Duas "alturas" com o mesmo nome.** A variável `altura` das regras é o topo do pavimento mais
   alto (`utils/blueprintRegras.ts:99`). A altura da classificação de incêndio é outra coisa:
   do piso de descarga ao piso do último pavimento habitável (CONFERIR NA IT). O nome novo precisa
   dizer qual é (`alturaParaIncendioM`).
4. **A reservação exclui a RTI de propósito** (`Reserv:13`). É preciso decidir se a RTI é um papel
   de reservatório próprio ou um volume reservado dentro do superior, com a saída de consumo acima
   dele. A segunda é o comum no residencial.
5. **O IFC declara "NÃO CONTÉM … incêndio"** (`Ifc:181`). A frase tem de mudar no mesmo commit que
   emitir a primeira peça de incêndio. Na E7.1 da elétrica, quatro testes fixavam frases falsas
   de cobertura.
6. **`ExecSvc:25` e o CHECK da tabela `blueprint_study_projeto_executivo`** aceitam só
   TERRAPLENAGEM/ELETRICA/HIDROSSANITARIA. Emitir com ART exige migration (molde
   `aplicar_20270929000001_blueprint_hidro_executivo.sql`).
7. **`types/project.ts:70 sprinklers?: boolean`** é uma caixa de seleção da obra
   (`components/ProjectModal.tsx:1579`), sem relação com a Planta. Não é fonte do motor, e fica
   assim.
8. **Pré-requisito de norma.** Nenhuma tabela do CBMMG está no repositório nem na pasta raiz. A E0
   depende do texto do Decreto estadual e das ITs de: classificação e exigências; saídas de
   emergência; carga de incêndio; hidrantes e mangotinhos; chuveiros automáticos; extintores;
   sinalização; iluminação de emergência; detecção e alarme. O documento **não** cita número de
   IT de memória: cada constante nasce "CONFERIR NA IT" até o PDF ser colado na pasta
   `c:\D\ORÇACLOUD` (onde já estão as planilhas SINAPI/CUB/NBR 12721).

---

# Parte 2 — Roadmap: paridade com o AltoQi Incêndio, aprovado no CBMMG

## Corte e ordem

| Entra | Fica para o backlog (registrado no fim) |
|---|---|
| Os **372 Essenciais** pendentes; os **A** do gerador de PPCI (classificação automática, população, rota de fuga, posicionamento automático), porque o usuário os pediu e o preset MG os exige para dizer "o que o prédio precisa" | Presets de SP/BA/PR/MT/RJ (a estrutura nasce pronta, os números não), espuma, edição no isométrico e em planos XZ/YZ, gás e SPDA no clash, simulador elétrico do laço, cálculo aerodinâmico da pressurização (N), integração com Suprimentos |

**Ordem e por quê:**
- **E0 primeiro**: é barata, não mexe no kernel e já diz ao usuário o que o prédio exige. Também
  fecha o achado 1, o anel que some sem aviso, que afeta a água hoje.
- **O modelo (E1) antes de qualquer motor**: sem tipo não há o que calcular.
- **O solver (E2) antes de hidrantes, bombas e sprinklers**: os três leem as vazões e pressões
  dele, e a régua de paridade exige malha.
- **Hidrantes (E3) → bombas (E4) → sprinklers (E5)**: a curva do sistema precisa de uma rede
  que já feche, e a de hidrantes é a mais simples; o sprinkler soma a área de operação à mesma
  bomba.
- **A rota de fuga (E6) antes dos preventivos (E7)**: extintor, placa e luminária de emergência
  se posicionam pelo percurso.
- **Documentação (E8) e quantitativo/BIM (E9) fecham.** Cada etapa anterior já acrescenta sua
  regra à conferência e sua seção ao memorial; o fim só junta as folhas.
- **O gerador (E10) é só orquestração** dos motores que as etapas anteriores deixaram prontos.

## Regras que valem para todas as fases

- **REGRA #8:** uma frente por etapa (`bash scripts/nova-frente.sh incendio-e<N>`); o push em
  `main` é o deploy e o `conferir-producao.sh` é a prova. Ritual de cada fase: `tsc`, suíte cheia
  (só vale com a conta do reporter JSON fechando), `check-ui-standard` nos `.tsx` tocados,
  `check-xss-sinks`, harness visual quando há desenho (moldes: `docs/spikes/prancha-hidro` e
  `docs/spikes/prancha-eletrica`, com Edge headless), plano atualizado, commit, push e conferência
  de fora.
- **Modelo único:** só se grava o que o projetista decide. Vazão, pressão, papel do trecho,
  numeração, área de operação associada, curva do sistema, exigências, rota, memorial e
  quantitativo são **derivados**. Quando um derivado admite ajuste (DN, rótulo, ocupação), vale
  "o declarado vence o sugerido, e o sugerido sai marcado".
- **Kernel:** campo ou entidade nova no canônico exige:
  - bump de `KERNEL_VERSION` e dos goldens (`__tests__/blueprintKernelGoldens.test.ts`), trocando
    os pinos de versão por script sobre o glob e nunca por `grep | head`;
  - `node scripts/build-planta-api-kernel.mjs` e o redeploy da `planta-api`, provado com
    `GET /v1/estudos` sem token = 401.

  Mudança de quantitativo exige subir `POLITICA_PADRAO.version`. Mudança de premissa muda o hash
  da base das emissões, e a tela diz isso.
- **Norma com fonte:** toda constante cita a norma e o item (NBR 13714, 10897, 12693, 13434, 10898,
  17240, 9077, 14880; Decreto e ITs do CBMMG). **O que foi transcrito de memória leva a marca
  "CONFERIR NA NORMA/IT"** no código, no drawer e no memorial até o usuário colar o texto (molde:
  as tabelas da NBR 8160 e 7229 no hidro). O que não é norma é **hipótese declarada**, com nome.
- **Conferência em três estados + "não avaliada"** (molde `blueprintNbr5410.ts` /
  `HidroExec:60`): regra nova entra na conferência, nas marcas do desenho, na emissão e no memorial
  no mesmo commit.
- **Automático segue o molde:** propõe → prévia → um `runBatch` → Ctrl+Z, com `conferirPlano`
  quando prevê ids.
- **Prova na planta real** só em estudo descartável, conferindo o banco depois (o bloqueio de
  escrita do Playwright não segurou o autosave da Planta).
- **Arquivo novo:** `ls` antes do `Write`. `blueprintCondutores.ts` já foi sobrescrito uma vez
  por nome parecido.

---

## Etapa 0 — Premissas e classificação MG · sem bump (migration) · 4 fases · **✅ CONCLUÍDA em 30/09/2026 (4 de 4; migration a aplicar com OK)**

| Fase | Entrega (o que muda) | Pronto quando (como sei que terminou) |
|---|---|---|
| 0.1 Premissas do estudo | Tabela `blueprint_study_incendio` (uma linha por estudo, `hipoteses` JSONB, FK composta, UNIQUE, RLS por organização; molde `aplicar_20270929000001`). Hook `useBlueprintIncendio` (molde `hooks/useBlueprintHidro.ts:121`: completa com o padrão ao ler e grava com espera de 500 ms). Aba **Incêndio** no ribbon (`Ed:928`), com o grupo "Premissas". Migration aplicada só com OK do usuário | teste do leitor da coluna (padrão, anuláveis tipados); a aba aparece; a premissa gravada volta depois de recarregar num estudo descartável |
| 0.2 Motor de classificação | `utils/blueprintIncendioClassificacao.ts`, puro: ocupação/divisão (declarada; sugestão pelo uso dos ambientes), **altura para incêndio** (piso de descarga → último pavimento, nome próprio, achado 3), área total e por pavimento (`quant:1189`), carga de incêndio (tabela por divisão) e risco. Cada tabela com fonte ou "CONFERIR NA IT" | testes com um sobrado, um residencial de 8 pavimentos e um misto com loja no térreo; a divisão declarada vence a sugerida |
| 0.3 Exigências do CBMMG | `exigenciasDoCbmmg(classificacao)` → lista de medidas (extintor, hidrante, sprinkler, alarme, detecção, iluminação, sinalização, saídas, brigada, compartimentação…) com o motivo ("altura > X m") e a fonte. Painel "O que este prédio exige", no molde de `PainelConferenciaNbr`. Presets de outros estados como estrutura vazia com nome | teste de tabela: cada combinação de altura × área da IT dá a lista certa; o painel mostra o motivo de cada linha; preset não-MG diz "sem tabela" |
| 0.4 Trilhos | Marca `ANEL_NAO_CALCULADO` em `Verif` quando o BFS de `Pressao:178` pula uma aresta (achado 1, vale para a água); a pasta `docs/normas/incendio-mg/` lista os PDFs esperados (achado 8) | teste: um anel na água gera a marca; a conferência hidro diz "não avaliado" no trecho |

Fecha o **bloco 6** e os achados 1, 3 e 8. Abre o motor 1.

## Etapa 1 — Modelo da disciplina · kernel bump · 4 fases · **✅ CONCLUÍDA em 30/09/2026 (4 de 4; kernel 0.78.0 → 0.80.0; os kits foram para a E7.2)**

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1.1 Disciplina e tipos (kernel 0.79.0) | `INCENDIO` em `DisciplinaDeRede` (`model:2362`); entradas em `HIDRAULICAS` (`conexoes:148`) e nas tabelas `Record<DisciplinaDeRede,…>` (o compilador lista: `Rede:278, 327, 336`); lista `tipoIncendio` com **ficha** (cota usual, DN de conexão, K e rosca no sprinkler, agente e carga no extintor, código na placa, entidade IFC) para os tipos da seção "O modelo único"; invariante de disciplina por tipo (molde `model:2718`) | goldens com os tipos; teste de taxonomia ("desenha ≠ alcança": cada tipo chega a menu, 2D, 3D, quantitativo e IFC); `tsc` limpo depois do `Record` |
| 1.2 Materiais e tabelas (kernel 0.80.0) | `MATERIAIS_DE_TUBO` + aço galvanizado, aço carbono (schedule) e CPVC de incêndio, com rugosidade, **C de Hazen-Williams**, DI e Leq **até DN 150** (achado 2); invariante `model:5537` libera material para INCENDIO | testes de DI e Leq por material; interpolação acima do 75 sem extrapolar proporcional |
| 1.3 Símbolos e forma | Símbolo 2D de **modelo** e símbolo de **prancha** por tipo (§44: o extintor aparece realista no modelo e técnico na prancha); forma 3D (abrigo, sprinkler, extintor, placa); cor da disciplina; visibilidade por família no 3D (molde `idsForaDaVistaEletrica`) | harness visual do canvas e da prancha; teste do contexto 2D falso (grava as chamadas) para cada símbolo |
| 1.4 Numeração, cadastro e kits | Numeração derivada H-n, MG-n, SPK-n, EXT-n (`Terminal.rotulo` declarado vence; molde `EsqV:118`); categoria de incêndio no cadastro por organização (`blueprint_element_types`) com dados hidráulicos em parâmetro; **kit** como tabela por organização (migration: hidrante + placa, extintor + placa, VGA + manômetros), inserido como um lote | teste: apagar H-2 renumera na prévia e não no banco; inserir kit cria N peças num Ctrl+Z; tipo cadastrado aparece no menu |

Fecha o **bloco 1**.

## Etapa 2 — Motor hidráulico · sem bump · 4 fases · **✅ CONCLUÍDA em 30/09/2026 (4 de 4, sem bump)**

| Fase | Entrega | Pronto quando |
|---|---|---|
| 2.1 Fórmulas | `utils/blueprintHidraulicaIncendio.ts`: Hazen-Williams, fórmula universal (reusa `HidP:144`) e Fair-Whipple-Hsiao, escolhidas na premissa; Leq de aço | testes contra valores de exemplo da NBR 13714/10897 (CONFERIR NA NORMA) e contra Darcy no mesmo trecho |
| 2.2 Solver de malha | Método do gradiente (Todini) ou Hardy-Cross sobre `grafo`: nós com demanda por **vazão fixa** ou **Q = K·√P**, iterativo com tolerância e limite de iterações, **balanceamento**; cobre a árvore como caso particular (o resultado da árvore bate com o de `Pressao`) | testes: anel simétrico divide ao meio; grelha 3×3 fecha a conservação em cada nó; árvore dá o mesmo que o motor de hoje; não converge = estado "não avaliado" com motivo |
| 2.3 Cenários de demanda | Hidrantes: os **N mais desfavoráveis** abertos (N da premissa), vazão mínima no mais desfavorável, **ponto de equilíbrio** (os outros recebem a vazão que a pressão real deles dá), pressão nos demais; papel do trecho (geral/subgeral/ramal/sub-ramal) derivado; velocidade-limite; **DN automático** (molde `Pressao:346`) | testes de cenário num prédio de 8 pavimentos: o mais desfavorável é o do último andar mais longe; subir o DN do recalque sobe a pressão no crítico |
| 2.4 Diagnóstico e conferência | Marcas: sem entrada, sem saída, peça contra o fluxo (retenção/VGA), peça sub/superdimensionada, velocidade acima do limite, pressão acima da máxima no esguicho; conferência com os grupos NBR13714/NBR10897/CBMMG | cada marca tem teste; a conferência lista "não avaliada" quando falta a premissa |

Fecha o **bloco 2**.

## Etapa 3 — Hidrantes e reserva · kernel bump · 3 fases · **✅ CONCLUÍDA em 01/10/2026 (3 de 3; kernel 0.80.0 → 0.81.0)**

| Fase | Entrega | Pronto quando |
|---|---|---|
| 3.1 Rede de hidrantes | Ferramentas de lançamento de hidrante, mangotinho e abrigo (o kit da E1.4); **coluna de incêndio** automática (prumada no mesmo x,y com sigla própria em `EsqV:27`); **registro de recalque** no passeio; traçado automático origem → coluna → ramais pelas paredes (reusa `Rota:70` e `Obst`) | prédio de prova com 8 pavimentos lança, calcula (E2) e fecha a conferência |
| 3.2 RTI (kernel 0.81.0) | Papel ou volume reservado de **RTI** no reservatório (achado 4), volume pela tabela do CBMMG (CONFERIR NA IT), regra "consumo acima da RTI"; `Reserv` soma RTI + consumo quando é a mesma caixa | goldens; teste da regra com a saída de consumo abaixo do volume reservado = FALTA |
| 3.3 Cobertura (A) | Verificação e proposta de hidrantes por **alcance da mangueira pelo percurso** (Dijkstra sobre `GrafoEsp`, estendido a pontos quaisquer), com o abrigo junto a escada/saída | teste: um ambiente fora do alcance vira marca; a proposta cobre tudo com o menor número de hidrantes |

Fecha a parte de hidrante do **bloco 4** (§19).

## Etapa 4 — Bombeamento · kernel bump · 3 fases · **✅ CONCLUÍDA 01/10/2026 (4.1, 4.2 e 4.3; kernel 0.81.0 → 0.82.0)**

| Fase | Entrega | Pronto quando |
|---|---|---|
| 4.1 Cadastro de bombas | Curva Q×H em pontos (JSONB no tipo por organização), potência, diâmetros de sucção/recalque, NPSHr, item comercial | tela de cadastro passa no `check-ui-standard`; curva com menos de 3 pontos é recusada com motivo |
| 4.2 Curva do sistema e ponto de operação | Curva do sistema = H(Q) varrendo Q no solver da E2; interseção com a curva da bomba; seleção automática entre as cadastradas; análise (folga, ponto a 150 %, shutoff — CONFERIR NA NORMA); NPSH disponível | teste: bomba subdimensionada = FALTA com o ponto; a seleção escolhe a de menor potência que atende |
| 4.3 Jockey e casa de bombas (kernel 0.82.0) | `BOMBA_JOCKEY` com `bombaPrincipalId`, pressostatos de partida/parada como premissa, manômetros; bomba principal no lugar da `BOMBA` do recalque quando o sistema é de incêndio | goldens; jockey sem principal = marca; quantitativo conta as duas |

Fecha o **bloco 4**.

## Etapa 5 — Sprinklers · kernel bump · 4 fases · **✅ CONCLUÍDA em 01/10/2026 (4 de 4; kernel 0.82.0 → 0.83.0)**

| Fase | Entrega | Pronto quando |
|---|---|---|
| 5.1 Risco e densidade | Risco (leve, OH1, OH2, EH1, EH2) por estudo e por área; densidade × área de operação automática (tabela da NBR 10897, CONFERIR NA NORMA) ou manual (L/min/m²); cadeia risco → área → densidade → vazão → bomba derivada | teste: mudar o risco muda a vazão exigida na bomba |
| 5.2 Área de Operação (kernel 0.83.0) | Entidade `AreaDeOperacao` (polígono + nível + risco opcional), retangular ou poligonal, manual ou **automática** na região hidraulicamente mais desfavorável (forma pela proporção da norma); sprinklers associados derivados; vazão necessária conferida contra Σ K·√P | goldens; teste da automática num salão em L |
| 5.3 Distribuição automática | Região (ambiente ou polígono) → ramais e sprinklers por espaçamento máximo, área por sprinkler, distância à parede e ao teto, obstrução de viga; **prévia com alternativas** (sentido dos ramais, espaçamento) antes de confirmar | teste de cobertura; a prévia mostra 2+ alternativas com contagem e comprimento |
| 5.4 Traçado e rede combinada | Sprinkler → ramal → subgeral → geral em espinha, ramais de derivação perpendiculares, contorno, grelha e malha (resolvidas pela E2), VGA com os sprinklers a jusante derivados, **método das tabelas** como alternativa, demanda sprinkler + hidrante na mesma bomba | teste: grelha fecha no solver; o método das tabelas dá o DN pelo número de sprinklers; a rede combinada soma as demandas |

Fecha o **bloco 3**.

## Etapa 6 — Saídas e rota de fuga (vai além) · kernel bump · 3 fases · **✅ CONCLUÍDA em 01/10/2026 (3 de 3; kernel 0.83.0 → 0.84.0)**

| Fase | Entrega | Pronto quando |
|---|---|---|
| 6.1 População e saídas | População por ambiente pela divisão (pessoas por m², CONFERIR NA IT; residencial continua por dormitório, `Reserv:66`); unidades de passagem; número de saídas e de escadas; largura mínima × `larguraUtilDaAbertura` (`GrafoEsp:192`) | teste com um pavimento-tipo: a escada estreita vira FALTA com a largura exigida |
| 6.2 Escada e portas (kernel 0.84.0) | `Escada.protecao` (NE/EP/PF, pressurizada) e a marca de **porta de saída** / corta-fogo / antipânico em `Opening` (ou em `parametros`); tipo exigido × desenhado | goldens; teste da regra de tipo de escada por altura |
| 6.3 Percurso máximo e rota | Percurso a partir do **ponto mais desfavorável** do ambiente, **vários pavimentos pela escada**, contornando paredes (estende `GrafoEsp:409-457`); rota de fuga como polilinha **derivada** desenhada numa camada | teste: sobrado e prédio; a rota passa pela escada; percurso acima do limite = FALTA com o comprimento |

Fecha os **A** das seções 22 e 27.

## Etapa 7 — Preventivos · kernel bump · 4 fases · **✅ CONCLUÍDA em 01/10/2026 (4 de 4; kernel 0.84.0 → 0.88.0)**

| Fase | Entrega | Pronto quando |
|---|---|---|
| 7.1 Extintores | Lançamento com agente, carga e capacidade extintora; classe de fogo por ambiente (cozinha, casa de máquinas, QD); proposta automática pela **distância a percorrer** (E6) e pela área por unidade extintora (NBR 12693/IT, CONFERIR) | teste: um ponto além do percurso vira marca; a proposta usa o kit extintor + placa |
| 7.2 Sinalização e kits (kernel 0.85.0) | **Kits** (vindos da E1.4: hidrante + placa, extintor + placa, VGA + manômetros, e o kit criado pelo projetista em tabela por organização), inseridos num lote; `PLACA` com código e categoria (catálogo NBR 13434/IT), `alvoId` para o equipamento, variantes direcionais (frente, esquerda, direita, mudança, saída) pela rotação; proposta automática: uma por equipamento (kit) e ao longo da rota nas mudanças de direção e nas portas | goldens; teste: apagar o hidrante apaga ou marca a placa dele |
| 7.3 Iluminação de emergência | Luminária de emergência (bloco autônomo/central) com autonomia; proposta pela rota (espaçamento, escadas, mudanças de direção — NBR 10898, CONFERIR); ligação opcional a circuito da elétrica | teste de espaçamento na rota; a luminária entra no quadro de cargas quando está em circuito |
| 7.4 Detecção e alarme (kernel 0.86.0) | Detector de fumaça/temperatura/chama por cobertura (raio e parede — NBR 17240, CONFERIR); acionador manual pelo percurso; avisador; central; **laço** como relação (molde `Circuito`), com o eletroduto roteado pelo automático da elétrica; preventivo personalizado (motor e ventilador de pressurização) | goldens; teste de cobertura; laço sem central = marca |

Fecha o **bloco 5** e os A das seções 20, 21, 23, 24 e 25.

## Etapa 8 — Documentação · sem bump · 4 fases · **✅ concluída 01/10/2026 (8.1–8.4)**

| Fase | Entrega | Pronto quando |
|---|---|---|
| 8.1 Plantas | `TipoDePrancha` INCENDIO_HIDRANTES / INCENDIO_SPRINKLERS / INCENDIO_PREVENTIVO (`Pranchas:153, 189`), recorte por família (molde `recorteEletrico`), legenda com o símbolo de prancha, camadas DXF (`utils/blueprintDxf.ts:55`), quadro-resumo das medidas de segurança no formato do CBMMG | harness visual das três plantas; DXF abre com as camadas |
| 8.2 Planilha e diagrama de pressões | Folha **planilha de pressões** (trecho, DN, L, Q, J, hf, P disponível × necessária, hidrantes desfavoráveis) + XLSX; **diagrama**: caminho reservatório/bomba → hidrante crítico destacado na planta e no esquema; **curva da bomba** desenhada com o ponto de operação | o Read do PDF final mostra a planilha sem "?" nos símbolos (`paraWinAnsi`); o caminho destacado bate com o solver |
| 8.3 Detalhes, isométrico, esquema e corte | Detalhe de hidrante e de VGA gerados da composição; casa de bombas; isométrico por coluna/ramal (`Iso:102` aceita INCENDIO); esquema vertical reservatório → bombas → coluna → pavimentos; terminais no corte | harness visual; teste de `isometricosDoModelo` com incêndio |
| 8.4 Memoriais e ART | `memorialDescritivoIncendio` e `memorialDeCalculoIncendio` em `BlocoDoMemorial` (PDF/DOCX pelo serviço do hidro), com a classificação, as exigências, o cálculo e as premissas "CONFERIR"; emissão com ART (`DisciplinaExecutiva` + INCENDIO e migration do CHECK, achado 6; `hashDaBaseIncendio`) | emissão num estudo descartável grava capa + cálculo + descritivo; mudar premissa invalida a emissão e a tela diz |

Fecha o **bloco 7**.

## Etapa 9 — Quantitativo e BIM · quant bump · 4 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 9.1 Quantitativo (quant-1.24.0) | Tipos de incêndio no agrupamento (`quant:1397`), tubos por material e DN, conexões de aço, por pavimento; `INCENDIO` em `REDES_HIDROSSANITARIAS` (`Budget:1582`); folha de lista de materiais (molde `blueprintListaDeMateriaisEletrica.ts:41`) | teste portão de `POLITICA_PADRAO.version`; XLSX com a aba de incêndio |
| 9.2 Composição por peça | Tabela de composição por organização (peça → N itens com quantidade e código), expandida no quantitativo e no orçamento: hidrante = abrigo + válvula + mangueiras + esguicho + adaptador + chave + placa; fecha o backlog do hidro (louça, caixa) | um hidrante lança 7 linhas no orçamento de um estudo de prova, apagado depois |
| 9.3 IFC | `IfcFireSuppressionTerminal` (FIREHYDRANT, HOSEREEL, SPRINKLER, BREECHINGINLET), `IfcAlarm`, `IfcSensor`, `IfcPump`, `IfcValve`, sistema `.FIREPROTECTION.`, Psets com sufixo de quem decidiu (_Declarado/_Calculada); troca a frase `Ifc:181` (achado 5); importar incêndio pelos vértices (molde E7.2 da elétrica) | o arquivo abre no visualizador IFC com as classes certas (IFC4X3 quando o IFC4 não lê); ida e volta preserva os tipos |
| 9.4 Clash | Terminal × terminal (sprinkler × luminária, hidrante × porta) em `conflitos`; o trecho de incêndio já entra de graça; destaque no 3D por uid | teste com sprinkler a 10 cm de uma luminária; o painel filtra por pavimento |

Fecha os **blocos 8 e 9**.

## Etapa 10 — Gerador de PPCI (vai além) · sem bump · 2 fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 10.1 Orquestração | "Gerar PPCI": classificação (E0) → exigências → população e rota (E6) → extintores, sinalização, iluminação, detecção (E7) → hidrantes (E3) e sprinklers (E5) → traçado → solver (E2) → bomba e RTI (E4, E3) → conferência. Tudo como **uma prévia, um lote, Ctrl+Z**, cada motor com seu plano puro | teste de ponta a ponta num prédio de 8 pavimentos: zero FALTA na conferência ou a lista exata do que faltou |
| 10.2 Pendências e entrega | Relatório do que o gerador não decidiu (premissa faltando, tabela "CONFERIR", conflito sem saída) + pranchas, memorial e quantitativo gerados | o relatório lista cada "CONFERIR" ainda aberto |

---

## Backlog nomeado

- Presets de SP, BA, PR, MT e RJ (estrutura pronta desde a E0.3; faltam os números).
- Hidrante com proporcionador de espuma (M), pelo cadastro personalizado.
- Edição no isométrico e em planos XZ/YZ.
- Gás e SPDA no clash, quando as disciplinas existirem.
- Simulador elétrico do laço de detecção e cálculo aerodinâmico da pressurização da escada (N: o
  AltoQi também não faz).
- Pedido de compra a partir da lista de materiais (Suprimentos).

## Execução

### Etapa 0 — 30/09/2026 (frente `incendio-e0`)

Pedido: "sim" ao "Publico em `main` e começo a E0?". Os PDFs do CBMMG **não** estavam na pasta,
então a E0 foi feita com a regra combinada: o que não foi transcrito sai **SEM_TABELA** (nunca
exigido nem dispensado por palpite), e o que veio de memória sai com `rascunho: true` e o aviso
"não use para aprovação" no topo do painel.

- **0.1 Premissas do estudo.**
  - Migration `aplicar_20270930000001_blueprint_study_incendio.sql`, **ainda não aplicada**: aplicar
    só com o OK do usuário.
  - `services/blueprintIncendioService.ts`, `hooks/useBlueprintIncendio.ts` e o
    `BlueprintIncendioRow` em `types/blueprint.ts`.
  - Sem a tabela, as premissas valem só na sessão, e o painel diz isso.
  - Aba **Incêndio** no ribbon, com a tarefa "Classificação e exigências".
- **0.2 Classificação** (`utils/blueprintIncendioClassificacao.ts`):
  - a divisão declarada vence a sugerida (A-1 com 0–1 unidade, A-2 com 2 ou mais, se há ambiente
    residencial);
  - `alturaParaIncendio` vai do pavimento de descarga (o declarado ou o de cota mais próxima de 0)
    ao último pavimento com ambientes, sem contar barrilete, casa de máquinas e ático;
  - a área vem de `areaConstruidaMm2`;
  - a carga é a da tabela (só o grupo A, 300 MJ/m²) ou a declarada.
- **0.3 Exigências.** 16 medidas, cada uma com estado e motivo.
  - Grupo A em MG, rascunho: A-1 fica dispensada.
  - A-2 sempre exige saídas, sinalização e extintores.
  - Fora do regime simplificado (> 750 m² ou > 12 m), A-2 exige também acesso de viatura,
    segurança estrutural, iluminação e hidrantes.
  - Todo o resto é SEM_TABELA. Os presets de outros estados existem com nome e dão tudo
    SEM_TABELA.
- **0.4 Anel.**
  - `PressoesDaRede.trechosDoAnel` lista os trechos fora da árvore do BFS, com aviso no cálculo.
  - Marca `ANEL_NAO_CALCULADO` no desenho e na gaveta de verificação, válida já para a ÁGUA.
  - `docs/normas/incendio-mg/README.md` lista os textos esperados e o que cada um destrava.
- **Testes:** `blueprintIncendioClassificacao.test.ts` (11), `components/PainelIncendio.test.tsx`
  (3) e 3 casos de anel em `blueprintPressaoDaRede.test.ts`.

### Etapa 1.1 — 30/09/2026 (frente `incendio-e1`, kernel 0.78.0 → 0.79.0)

Decisões do usuário no começo da E1:
- **"Hidráulicos agora, preventivos na E7".** Extintor, placa, luminária, detector e alarme nascem
  na E7, com o comportamento deles. Aqui, só a rede de combate.
- **"Uma fase por push".**

Entregue:
- **Disciplina `INCENDIO` e dez tipos de ponto** (como `tipoHidraulico`, o molde da PLUVIAL):
  HIDRANTE_SIMPLES, HIDRANTE_DUPLO, MANGOTINHO, HIDRANTE_RECALQUE, SPRINKLER, VGA, CHAVE_FLUXO,
  BOMBA_INCENDIO, BOMBA_JOCKEY e PRESSOSTATO.
  - Gaveta, retenção, espera e conexões forçadas aceitam INCENDIO; o registro de pressão, não.
  - Fichas com cota, DN e medidas **usuais** (ponto de partida, não norma), em dois grupos novos:
    "Incêndio — hidrantes e chuveiros" e "Incêndio — bombas e válvulas".
- **Sprinkler:** `Terminal.fatorK` (L/min/bar^½, inteiro ≤ 1000) e `Terminal.posicaoSprinkler`
  (PENDENTE/EM_PE/LATERAL). São declarados, com a ficha dando K 80 e pendente quando ausentes, e
  saem do canônico quando ausentes. Invariante `BAD_SPRINKLER`; trocar o tipo apaga os dois campos.
- **Rede:** a cor é laranja-avermelhada (`#ea580c`, para não confundir com a água quente); cota
  2600 e DN 65 são os de partida; as conexões derivadas e as pontas abertas valem para a nova rede.
- **IFC:**
  - hidrante, mangotinho, recalque e sprinkler viram `IfcFireSuppressionTerminal` (FIREHYDRANT,
    HOSEREEL, BREECHINGINLET, SPRINKLER);
  - VGA vira `IfcValve` (USERDEFINED);
  - chave de fluxo e pressostato viram `IfcSensor` (FLOWSENSOR, PRESSURESENSOR);
  - as bombas viram `IfcPump`;
  - o sistema é `.FIREPROTECTION.`.

  Tudo lido de volta pelo web-ifc. A frase "NÃO CONTÉM … incêndio" (achado 5) passou a dizer o que
  o arquivo contém; o painel de versões e o teste que fixava a frase foram atualizados juntos.
- **Tela:** o menu "Incêndio" (família própria: tubulação, hidrantes/chuveiros, bombas/válvulas)
  entra no grupo "Rede e peças" da aba Incêndio.
- **Ritual do bump:** goldens 7/7 ainda em 0.78.0; depois do bump, só os seis hashes; 22 pinos de
  versão trocados por script; `kernel.bundle.mjs` regerado.
- **Testes:** `blueprintIncendioTipos.test.ts` (10 casos). A taxonomia hidráulica aceita os grupos
  de incêndio, e a contagem de cores distintas passou de 6 para 7.

### Etapa 1.2 — 30/09/2026 (frente `incendio-e1`, kernel 0.79.0 → 0.80.0)

- **Três materiais novos:** `ACO_GALVANIZADO`, `ACO_CARBONO` (SCH 40) e `CPVC_INCENDIO` (SDR 13,5).
  - `MATERIAIS_DA_DISCIPLINA` diz o que cada rede admite, e a invariante passou a ler dele.
  - A água segue com PVC, CPVC, PPR e cobre. O incêndio admite aço, CPVC de sprinkler e cobre.
  - O padrão derivado do incêndio é o aço galvanizado.
  - O painel do trecho só oferece os materiais da rede.
- **Fichas:** todo material ganhou `cHazenWilliams` (plásticos e cobre 150, aço 120; **CONFERIR NA
  NORMA**). O aço usa o diâmetro interno SCH 40 de DN 15 a 150, a favor da segurança em relação
  ao galvanizado NBR 5580.
- **Achado 2 resolvido:** `COMPRIMENTO_EQUIVALENTE_ACO_M` até DN 150.
  - Tabela da NFPA 13 para aço C = 120, convertida de pés (**CONFERIR com a NBR 10897/13714**).
  - A passagem direta do tê não soma perda nessa tabela.
  - `comprimentoEquivalenteM(peca, dn, material?)` usa a tabela de aço só para aço. A água não muda
    (prova no teste). `perdaLocalizadaMca` passa o material adiante.
- **Ritual do bump:** goldens 7/7 em 0.79.0; depois só os seis hashes; 22 pinos; bundle regerado.
- **Resultados:** suíte 6.463 testes (6.430 + 33 pendentes, conta fechada), build ok.
  `blueprintIncendioMateriais.test.ts` tem 8 casos.

### Etapa 1.3 — 30/09/2026 (frente `incendio-e1`, sem bump)

- **`utils/blueprintSimbolosIncendio.ts`** é a fonte única do símbolo 2D de cada um dos dez tipos:
  primitivas num quadrado unitário.
  - O canvas escala pelo zoom (mínimo de 14 px). `desenharSimboloDeIncendio(Desenhista…)` desenha
    o mesmo símbolo em mm de papel para a prancha da E8.
  - Essa é a separação modelo × prancha do AltoQi: o 3D mostra a peça com as medidas; 2D e prancha,
    o símbolo técnico.
  - São símbolos de TRABALHO. **CONFERIR** a simbologia oficial (NBR 14100 / IT do CBMMG) antes da
    prancha de aprovação.
- **Sprinkler:** o símbolo muda com a posição (pendente = cruz, em pé = metade cheia, lateral =
  seta).
- **Canvas:** a peça de incêndio desenha o símbolo, girado com a peça, no lugar da caixa cheia; a
  sigla continua ao lado.
- **Exibir → "Rede de incêndio":** tira trechos e peças de incêndio do 2D, do 3D e do clique, pelo
  mesmo conjunto de ocultos da elétrica (`idsDaRedeDeIncendio`).
- ⭐ **O harness visual (SVG → Edge headless) pegou dois defeitos que os testes não pegavam:** a
  chave de fluxo e o sprinkler lateral eram idênticos (círculo com seta), e o "J" da jockey
  atropelava o triângulo. A chave de fluxo virou quadrada, e um teste fixa a forma de fora.
- **Testes:** `blueprintSimbolosIncendio.test.ts` (8) e `components/BlueprintCanvasIncendio.test.tsx`
  (3, contexto 2D falso). Suíte com 6.473 testes, conta fechada; build ok.

### Etapa 1.4 — 30/09/2026 (frente `incendio-e1`, sem bump)

- **Numeração derivada** (`utils/blueprintNumeracaoIncendio.ts`): H-n (hidrante simples e duplo
  dividem a série), MG-n, RR-n, SPK-n, VGA-n, CF-n, BI-n, BJ-n e PS-n.
  - A ordem é: pavimento de baixo para cima; na planta, de cima para baixo e da esquerda para a
    direita. Nada é gravado, e apagar uma peça renumera as outras.
  - O **rótulo declarado vence e reserva** o número dele; os derivados pulam por cima.
  - O canvas escreve o número no lugar da sigla, e o painel do ponto diz se é derivado ou
    declarado.
- **Lacuna da E1.1 fechada:** o painel do sprinkler ganhou os campos **fator K** (comerciais 57,
  80, 115, 161, 202, 242 e 363; CONFERIR no catálogo do fabricante) e **posição**. O vazio volta ao
  da ficha.
- **Cadastro de tipos:** `PropriedadesDeTerminal` leva `fatorK`/`posicaoSprinkler` **só quando
  declarados**, para não mudar a assinatura dos tipos de ponto já salvos (teste). O resumo do tipo
  mostra "K 115".
- **Kits → E7.2 (desvio de escopo):** os kits do AltoQi (hidrante + placa, extintor + placa)
  dependem da placa, que pela decisão "preventivos na E7" nasce lá. O kit de VGA vai junto, para
  haver um mecanismo só.
- **Testes:** `blueprintNumeracaoIncendio.test.ts` (6), `components/PainelPecaDeIncendio.test.tsx`
  (3) e o canvas com o número (4). Suíte com 6.483 testes: 6.450 + 33 pulados. Na 1ª rodada, 33
  testes do `BlueprintEditor.test.tsx` ficaram "pending" (não rodaram: queda de worker); na 2ª, a
  conta fechou limpa.

### Etapa 2.1 + 2.2 + 2.3 — 30/09/2026 (frente `incendio-e2`, sem bump, um push)

As três foram juntas porque fórmula e solver são motor puro, sem tela: só ficam visíveis com o
cálculo da 2.3.

- **2.1 Fórmulas** (`utils/blueprintHidraulicaIncendio.ts`): Hazen-Williams, universal (a mesma
  `perdaDistribuida` da água) e Fair-Whipple-Hsiao (aço × plástico/cobre), sempre pelo diâmetro
  interno do material.
  - ⭐ A Hazen-Williams foi conferida por uma prova **independente**: a forma americana da NFPA 13
    (psi/pé, gpm, polegadas) bate até a 2ª casa.
- **2.2 Solver de malha** (`resolverRede`): método do gradiente (Todini-Pilati, o do EPANET),
  Newton sobre cargas e vazões ao mesmo tempo, com eliminação de Gauss densa.
  - O **emissor** (Q = K·√P) é um elo até a atmosfera, e o ponto de equilíbrio sai do próprio
    solver.
  - Nó sem caminho até a fonte fica isolado, sem tornar a matriz singular.
  - Provas: anel simétrico divide ao meio; no anel assimétrico, as perdas se igualam e a razão das
    vazões é 4^(1/1,852); a grelha 3×3 conserva vazão em todo nó.
- **2.3 Cálculo** (`utils/blueprintCalculoIncendio.ts`):
  - **Rede:** a fonte é a `BOMBA_INCENDIO`; a cota do nó vem da ponta do tubo (não da chave da laje).
    O comprimento equivalente soma joelho, tê (lateral para o ramal perpendicular, passagem dividida
    entre os colineares), gaveta, retenção e chave de fluxo, e a VGA conta como retenção (hipótese).
  - **Hidrante aberto:** mangueira (Hazen-Williams, C da mangueira) mais esguicho com
    K = Qmín/√Pmín.
  - **Sprinkler:** o K dele.
  - **Carga necessária:** bisseção até 600 m.
  - **Mais desfavoráveis:** a carga de cada hidrante sozinho; os N maiores abrem juntos.
  - **Também:** estática nos hidrantes para a pressão máxima, papel do trecho
    (geral/coluna/ramal/sub-ramal/anel) pela árvore de menor caminho, e DN automático pela velocidade
    (um lote, Ctrl+Z).
- **Premissas:** o grupo `hidraulica` em `blueprint_study_incendio`, sem migration (JSONB). Os
  padrões são **CONFERIR**: hidrante 300 L/min a 300 kPa no esguicho, mangueira 30 m Ø 40, 2
  simultâneos, mangotinho 100 L/min, sprinkler 50 kPa, máxima 1000 kPa, 5 m/s.
- **Tela:** Incêndio → Cálculo → "Cálculo hidráulico" (`PainelCalculoIncendio`).
- **Sonda dos números** (galpão de 30 m, 2 hidrantes): carga de 47,2 m = 30,6 (esguicho) + 11,9
  (mangueira, conferido à mão) + 3,8 (tubos) + 1,0 (desnível). Equilíbrio: 300,0 × 304,9 L/min.
- **Testes:** 13 (fórmulas/solver) + 12 (cálculo) + 4 (painel). Suíte com 6.512 testes: 6.479 + 33
  pulados, 0 pendentes. Build ok.

### Etapa 2.4 — 30/09/2026 (frente `incendio-e2`, sem bump)

- **Diagnóstico do lançamento** (`utils/blueprintConferenciaIncendio.ts`): barato e sempre ligado,
  entra em `marcasDeVerificacao`.
  - `INCENDIO_FORA_DA_REDE`: peça de nó sem tubo chegando.
  - `INCENDIO_SEM_BOMBA`: uma marca por pedaço de rede com consumidor que não chega à bomba (a
    "falta de fluxo de entrada").
  - `INCENDIO_DN_PECA`: tubo abaixo do DN mínimo da peça (a "peça subdimensionada").
  - A tubulação de incêndio entrou no filtro de estrutura: `ATRAVESSA_PILAR` e `CRUZA_VIGA` (o
    "tubulação × viga" do AltoQi).
  - A ponta aberta já vinha das conexões derivadas.
- **Diagnóstico do cálculo**, só com a tarefa aberta (é bisseção por hidrante):
  `INCENDIO_VELOCIDADE`, `INCENDIO_PRESSAO_ALTA` (estática) e `INCENDIO_NAO_ATENDE`. O canvas
  ganhou a prop `marcasDoCalculo`.
- **Conferência** em três estados + "não avaliado", com o grupo (NBR 13714 / CBMMG / Lançamento):
  bomba ligada, toda peça recebe água, DN das peças, vazão dos N mais desfavoráveis, velocidade,
  pressão estática, simultaneidade e RTI (não avaliada até a E3.2).
  - Sem bomba, o cálculo fica NÃO AVALIADO; nunca aparece "atende" por omissão (teste).
  - O item que falta seleciona as peças.
- **Tela:** o painel do cálculo ganhou a conferência e a lista "Verificação da rede" de incêndio.
- **Fica para depois:** "peça contra o sentido do fluxo" (retenção/VGA). O ponto não tem direção
  declarada; entra quando a bomba ganhar sucção/recalque na E4. "Peça superdimensionada" também
  ficou de fora: não há critério de norma à mão.
- **Testes:** `blueprintConferenciaIncendio.test.ts` (9) e o painel (5). Suíte com 6.544 testes:
  6.511 + 33 pulados, 0 pendentes. Build ok.

### Etapa 3.1 — 30/09/2026 (frente `incendio-e3`, sem bump)

- **`utils/blueprintRedeDeHidrantes.ts`** monta bomba → geral → colunas → ramais → hidrantes.
  - Os hidrantes a até `raioDaColunaMm` em planta formam um grupo, e cada grupo vira **uma coluna**
    (30 cm ao lado, para não sobrepor a descida). A coluna sobe da cota do ramal no pavimento da
    bomba até o último pavimento com hidrante, partida em 0 / cota do ramal / teto em cada
    pavimento, porque o kernel liga trecho a trecho pelas pontas e atravessa a laje pela chave.
  - Em cada pavimento, um ramal no forro vai da coluna até sobre o hidrante e desce à válvula.
  - O geral sobe da bomba e corre num tronco partido em cada x de coluna, com um braço por x (sem
    tubo sobreposto).
  - Tudo nasce `sugerido`. Relançar apaga os sugeridos anteriores no mesmo lote, e o hidrante já
    ligado por tubo confirmado não é religado.
  - Hidrante abaixo do pavimento da bomba gera um motivo dito na tela (a coluna sobe da bomba).
- **`conferirPlanoDaRede`** aplica o lote numa cópia e prova que todo hidrante chega à bomba. O
  botão Lançar fica desligado, com o motivo, se não chegar.
- **Prova de ponta a ponta:** num prédio de 5 andares, a rede lançada se calcula pela E2, e o
  hidrante mais desfavorável é o do último andar.
- **Premissas:** o grupo `rede` no estudo (cota do ramal 2600, raio da coluna 2000, DN 65), sem
  migration.
- **Tela:** Incêndio → Automático → "Rede de hidrantes", com Lançar/Relançar e "Aceitar a rede".
- **Conferência:** "Registro de recalque ligado à rede" (CBMMG, CONFERIR). A posição automática dele
  depende do limite do lote (passeio) e ficou para depois.
- **Testes:** planejador (6), painel (4) e o recalque na conferência (1). Suíte com 6.555 testes:
  6.522 + 33 pulados, 0 pendentes. Build ok.

### Etapa 3.2 — 30/09/2026 (frente `incendio-e3`, kernel 0.80.0 → 0.81.0)

**Achado 4 decidido: as duas formas.**

- **Caixa compartilhada:** `Terminal.volumeRtiL` na caixa de ÁGUA FRIA (os litros reservados ao
  incêndio). É inteiro e ≤ `volumeL`; a invariante `BAD_RTI` aceita só na caixa de água fria, e o
  campo sai do canônico quando ausente.
  - A reservação da água conta só o volume acima da RTI.
  - Um item da conferência pede a tomada de consumo X cm acima do fundo (X = V_RTI / área da base),
    como NÃO AVALIADO, porque o desenho não guarda a altura da tomada.
- **Caixa só de incêndio:** `RESERVATORIO` passou a existir na rede de `INCENDIO`, e o volume dela
  inteiro é RTI.
  - Sem bomba, ela é a **fonte por gravidade**: a carga é a cota do fundo. O cálculo diz o que a
    caixa entrega e, se não atende, quantos metros acima a água teria de estar.
  - A rede automática agora **desce** da caixa no alto (a coluna vai da fonte ao hidrante mais
    longe, para cima ou para baixo). O motivo antigo "hidrante abaixo da bomba" deixou de existir.
- **O lado da água ignora a caixa de incêndio:** alimentador, recalque, memorial, reservação e
  peças da caixa (boia, extravasor) olham só a caixa de água fria.
- **Menu:** a caixa de incêndio aparece no menu de Incêndio como "Caixa de incêndio (RTI)", e não
  como variante no menu da Hidráulica.
  - Regra única em `grupoDoPontoNaDisciplina`, usada pelo menu e pelo inventário. As peças sobre o
    trecho ficam no grupo da ficha.
  - Quem pegou isso foi o teste do menu Hidráulica.
- **RTI exigida** = vazão na fonte × autonomia (premissa `autonomiaMin` 60 min, **CONFERIR NA IT**).
  A desenhada é a soma das reservas compartilhadas e das caixas de incêndio. A conferência sai em
  ATENDE/FALTA; sem cálculo, NÃO AVALIADO.
- **Tela:** "Reserva de incêndio (L)" no painel da caixa d'água. O painel do cálculo ganhou a
  autonomia, a linha da RTI e a mensagem de gravidade.
- **Ritual do bump:** goldens 7/7 em 0.80.0; depois os seis hashes; 22 pinos; bundle regerado. O
  script `bump.py` do scratchpad automatizou os dois passos.
- **Testes:** `blueprintRtiIncendio.test.ts` (6) e a conferência com RTI (1). Suíte com 6.562
  testes: 6.529 + 33 pulados. Na 1ª rodada, 110 testes do `BlueprintEditor.test.tsx` ficaram
  "pending" (worker caído); o arquivo sozinho passou 193/193, e na 2ª rodada da suíte a conta
  fechou limpa.

### Etapa 3.3 — 01/10/2026 (frente `incendio-e3`, sem bump)

- **`utils/blueprintCoberturaIncendio.ts`:** todo ponto de todo ambiente tem de ter algum hidrante
  ao alcance. O alcance é mangueira + jato (`alcanceDoJatoM` 10 m, CONFERIR NA IT), medido pelo
  percurso das portas do grafo espacial: hidrante → portas → ponto. No ambiente do próprio
  hidrante, a reta. Um pavimento por vez.
  - Os pontos testados são os cantos e um a cada 2 m ao longo das paredes.
  - O cache dos percursos entre ambientes deixa o caso de 11 ambientes em ~80 ms.
- ⚠️ **O 1º critério estava errado, e uma sonda pegou.** O critério era "um hidrante cobre o
  ambiente inteiro", e com 25 m de alcance ele deixava o corredor de 60 m sem solução: o corredor
  só é coberto por **dois** hidrantes, cada um com a sua metade. O critério passou a ser por ponto,
  e a proposta passou a cobrir pontos.
- ⚠️ **A 1ª expectativa de teste também estava errada:** "2 ou 3 hidrantes" para o corredor com
  40 m. O certo é **um**, no meio do corredor (30 m + ~6 m até o canto < 40 m), e o teste agora
  prova a posição.
- **Proposta gulosa:** os candidatos ficam 10 cm para dentro da face da parede mais próxima do
  centro de cada ambiente e, na circulação, junto a cada ponto testado. A circulação tem
  preferência. Os hidrantes nascem `sugerida`, num lote.
- **Tela:** Incêndio → Cobertura → "Cobertura dos hidrantes", com a marca `INCENDIO_SEM_COBERTURA`
  no centro de cada ambiente fora do alcance (com a tarefa aberta) e "Propor hidrantes".
- **Testes:** `blueprintCoberturaIncendio.test.ts` (5) e o painel (3). Suíte com 6.570 testes
  (6.536 + 33 pulados + 1, corrigida e reconferida isolada). Build ok.

### Etapa 4.1 — 01/10/2026 (frente `incendio-e4`, kernel 0.81.0 → 0.82.0)

Os campos novos da bomba e da jockey (que o roadmap previa na 4.1 e na 4.3) entraram juntos, para
haver um bump só.

- **Kernel:**
  - `Terminal.curvaBomba`: pontos {vazão L/min, altura mm}, inteiros, ≥ 3, com vazão crescente e
    altura que não sobe.
  - `Terminal.npshrMm`.
  - Na jockey, `Terminal.bombaPrincipalId`. No canônico ele vai **por índice** (`principal`), num
    segundo passo depois da ordenação, como o `pai` dos quadros.
  - Invariante `BAD_PUMP`. `limparBombasOrfas` roda no fim de todo comando: apagar a principal (ou
    trocar o tipo dela) solta a jockey, em vez de quebrar a invariante.
- **Cadastro de bombas = o tipo salvo da organização.** `PropriedadesDeTerminal` leva a curva e o
  NPSH só quando declarados (a assinatura dos tipos antigos fica intacta), e o resumo do tipo diz
  "curva N pontos". Fabricante e modelo vão no nome do tipo e nos parâmetros. Nenhuma tabela nova.
- **Tela** (`CamposDaBombaDeIncendio`, no painel do ponto):
  - a curva numa tabela (+ ponto), aplicada num passo só. O botão diz por que está desligado, com
    a mesma validação do kernel (`curvaDigitada`).
  - "Tirar a curva", o NPSH em m e, na jockey, a principal.
- **Ritual do bump:** 7/7 em 0.81.0; depois os seis hashes; 22 pinos; bundle regerado.
- **Testes:** `blueprintBombaIncendio.test.ts` (5) e `components/CamposDaBombaDeIncendio.test.tsx`
  (4). Suíte com 6.579 testes: 6.546 + 33 pulados. Build ok.

### Etapa 4.2 — 01/10/2026 (frente `incendio-e4`, sem bump)

- **`utils/blueprintBombeamentoIncendio.ts`:**
  - **Curva da bomba:** interpolada em linha reta e nunca extrapolada. Fora da faixa do catálogo,
    "fora da curva".
  - **Curva do sistema:** sai do mesmo solver da E2, com os N mais desfavoráveis abertos e a carga
    variando.
  - **Ponto de operação:** o cruzamento das duas curvas, por bisseção (a bomba cai, o sistema sobe,
    o cruzamento é único). Diz se os hidrantes atendem ali.
  - **Ponto de projeto:** a carga necessária da E2.
  - **Análise:** 150 % da vazão ≥ 65 % da carga (NFPA 20, CONFERIR); o shutoff leva a estática do
    hidrante mais baixo contra a pressão máxima.
  - **NPSH disponível:** Patm pela altitude − pv (0,24) + (fundo da caixa de RTI mais baixa − eixo
    da bomba) − perda na sucção. Sem caixa, a água fica na cota da bomba.
- **Seleção:** `bombasQueAtendem` filtra as bombas cadastradas (tipos da organização com curva) que
  passam por cima do ponto de projeto, da menor folga para a maior. "Aplicar" copia **só** a curva,
  o NPSH e o nome; a cota e a posição da bomba no desenho não mudam.
- ⚠️ **Defeito do solver da E2 achado e corrigido:** o emissor (esguicho/sprinkler) deixava fluxo
  NEGATIVO. Com carga zero e o hidrante acima da bomba, entravam −84 L/min pelo esguicho. Quem
  pegou foi a curva do sistema. O emissor agora tem retenção (resistência enorme ao contrário), e o
  resíduo numérico (centésimos de L/min) é tratado como zero. Os 50 testes da E2/E3 continuaram
  verdes.
- **Tela:** `PainelBombaIncendio`, abaixo do cálculo, com o gráfico da §28 (recharts): bomba em azul,
  sistema em cinza, projeto e operação como pontos, legenda em HTML e texto quando falta a curva,
  nunca gráfico zerado. Também mostra as verificações, a altitude, a perda na sucção e as
  candidatas.
  - O catálogo de tipos carrega quando o cálculo abre.
  - A conferência ganhou "bomba atende o ponto de projeto", "shutoff" e "NPSH".
- ⭐ **Harness visual `docs/spikes/bomba-incendio`** (porta 3161 + Edge). Ele mostrou as curvas se
  cruzando onde o ponto de operação diz. Também pegou o ponto de operação faltando na legenda, que
  foi acrescentado.
  - ⚠️ Lição do harness: o Vite com a pasta do spike como raiz precisa de `--config vite.config.ts`
    E de um CSS com `@source "../../../components/blueprint"`. Sem isso, o Tailwind v4 não gera as
    classes dos componentes, e a tela sai crua.
- **Typecheck:** os formatadores do tooltip do recharts aceitam `undefined` (corrigido com
  `Number(v ?? 0)`).
- **Testes:** `blueprintBombeamentoIncendio.test.ts` (10) e o painel (3). Suíte com 6.591 testes:
  6.558 + 33 pulados. Build ok.

### Etapa 4.3 — 01/10/2026 (frente `incendio-e4`, sem bump) — fecha a E4

- **`pressurizacaoDaRede`** (`utils/blueprintBombeamentoIncendio.ts`): a jockey é a `BOMBA_JOCKEY`
  com `bombaPrincipalId` igual à bomba da fonte. Os pressostatos são contados na rede.
  - **Ajustes**, no recalque, derivados do shutoff da principal (esquema da NFPA 20, CONFERIR NA
    IT): a jockey para no shutoff; parte `diferencialJockeyKpa` abaixo (70 kPa); a principal parte
    `diferencialPrincipalKpa` abaixo disso (35 kPa). Os dois diferenciais são hipóteses editáveis.
    Conferido à mão: shutoff de 70 m → parada 686 kPa, partida da jockey 616, da principal 581.
  - **A jockey alcança a parada?** O shutoff dela ≥ a pressão de parada.
  - **Hidrante mais alto pressurizado?** Com a rede na partida da principal, a pressão no hidrante
    mais alto continua > 0. Senão a rede esvazia lá em cima antes de a bomba partir.
  - Sem a curva da principal, não há ajustes (o painel diz o que fazer). A gravidade não tem
    pressurização: a função devolve `null`.
- **Conferência:** "Bomba jockey ligada à principal", "Pressostatos (um por bomba)" (≥ 2 com
  jockey), "Jockey alcança a pressão de parada" e "Rede pressurizada no hidrante mais alto".
- **Tela:** seção "Jockey e pressostatos" no `PainelBombaIncendio`: ajustes em kPa e mca, os dois
  diferenciais e a jockey clicável (seleciona no desenho).
- **Testes:** `blueprintPressurizacaoIncendio.test.ts` (5) e mais um caso no painel. Suíte com 6.597
  testes: 6.564 + 33 pulados. Build ok.

### Etapa 5.1 — 01/10/2026 (frente `incendio-e5`, sem bump)

- **`utils/blueprintSprinklersIncendio.ts`:** a cadeia risco → densidade × área de operação → vazão por
  sprinkler e da área → duração.
  - **Tabela:** riscos leve, ordinário 1/2 e extraordinário 1/2, pelo método hidráulico da NBR 10897.
    Transcrita de memória pelos pontos de área mínima da NFPA 13, em que a NBR se baseia: **CONFERIR NA
    NORMA**. Cada linha traz densidade, área de operação, área máxima por sprinkler, duração e o
    adicional de mangueiras (este fica para a E5.4).
  - **Origem de cada número:**
    - o risco declarado vence o sugerido pela divisão da E0 (A/B/D/E/H/F → leve, G → ordinário 1,
      C/I/J → ordinário 2, L/M → sem sugestão);
    - a densidade, a área e a área por sprinkler declaradas vencem a tabela;
    - o estudo grava só o declarado (`hipoteses.sprinklers`).
  - N = ⌈área de operação ÷ área por sprinkler⌉. A vazão mínima no pior sprinkler é a densidade ×
    a área por sprinkler.
- **Cálculo (`calculoDeIncendio`), um cenário por SISTEMA:**
  - **Hidrantes:** como antes.
  - **Sprinklers:** abrem os N mais desfavoráveis (cada um sozinho com a mesma carga; o de menor
    pressão é o pior), e cada sprinkler aberto tem de dar a vazão E a pressão mínimas. Até a Área de
    Operação desenhada (E5.2), é esta a escolha.
  - **O que governa a bomba:** o sistema de maior Q × H; um sistema que não fecha governa, para a tela
    dizer o porquê. A bomba, a curva do sistema e o ponto de operação usam as premissas EFETIVAS do
    cálculo (`c.hip`).
  - **RTI:** a duração do sistema que governa (30 min no risco leve, não os 60 dos hidrantes).
  - A demanda SOMADA (sprinkler + mangueiras) é a E5.4.
- **Conferência (grupo NBR 10897):** risco definido; vazão e pressão nos N mais desfavoráveis;
  vazão da área de operação (diz quando a rede tem menos sprinklers que a área pede).
  - Os itens de hidrante passaram a ler o cenário DOS HIDRANTES, seja quem for que governe.
  - As marcas de velocidade e de "não atende" saem dos dois cenários.
  - A estática e o "ponto mais alto pressurizado" contam hidrantes e sprinklers.
- **Tela:** seção "Sprinklers — risco e densidade" no painel do cálculo. Tem a classe de risco (vazio =
  pela ocupação, com a sugestão no rótulo), campos opcionais com o valor da tabela como dica, a tabela
  da cadeia com a origem de cada número e o resultado dos sprinklers. Diz também quem governa a bomba.
- **Harness `docs/spikes/sprinklers-incendio`** (porta 3162 + Edge): ramal de 10 sprinklers e um
  hidrante. Ele mostrou a cadeia, os 7 mais distantes abertos e o pior exatamente nos 86 L/min. Também
  pegou a lista "mais desfavoráveis" (que é só de hidrantes) solta sob a tabela de sprinklers: virou
  "Hidrantes mais desfavoráveis" e some sem hidrante.
- **Testes:** `blueprintSprinklersIncendio.test.ts` (11; inclui "mudar o risco muda a vazão exigida na
  bomba") e mais 2 no painel. Suíte com 6.610 testes: 6.577 + 33 pulados. Build ok.

### Etapa 5.2 — 01/10/2026 (frente `incendio-e5`, kernel 0.83.0)

- **Kernel 0.83.0 — `model.areasDeOperacao`:**
  - **Entidade:** contorno (≥ 3 vértices inteiros), com risco próprio e nome opcionais.
  - **Comandos:** `Add`/`SetAreaDeOperacaoProps`/`DeleteAreaDeOperacao`. `risco: null` volta ao risco
    do estudo.
  - **Invariante:** `BAD_OPERATION_AREA`.
  - **Canônico:** pavimento por índice, omitida quando não há; ida e volta preserva o uid.
  - A área some com o pavimento (`RemoveLevel`). `RISCOS_DE_SPRINKLER` passou a morar no kernel.
  - Ritual do bump: goldens 7/7 em 0.82.0, 6 hashes, 22 pinos. Bundle da planta-api regerado.
- **Derivado (`blueprintSprinklersIncendio`/`blueprintAreaDeOperacao`):**
  - os sprinklers da área são os do mesmo pavimento com o ponto dentro (a borda conta);
  - o critério da área é o risco dela, se declarado, senão o do estudo; as outras premissas vêm do
    estudo.
- **Cálculo:** com área desenhada, cada área abre os sprinklers DELA, com o critério dela, e governa a
  de maior Q × H. Sem área, vale a escolha da E5.1 (os N mais desfavoráveis). `c.areas` traz uma linha
  por área; `c.hip` é o da área que governa (a bomba usa este).
- **Conferência:** "Área de operação AO-n: tamanho" compara a área desenhada com a exigida pelo risco
  dela e diz quantos sprinklers há dentro.
- **Proposta automática (`proporAreaDeOperacao`):**
  - **Âncora:** o sprinkler mais desfavorável (aberto sozinho, mesma carga).
  - **Forma:** retângulo 1,2√A × A/(1,2√A), com o lado maior na direção do ramal dele (NBR 10897 /
    NFPA 13, CONFERIR), nas quatro posições em volta dele.
  - **Ambiente:** cada posição cresce até a parte DENTRO do ambiente fechar a área. Ambiente menor que
    a área exigida = o ambiente inteiro.
  - **Escolha:** vence a mais COMPACTA (área ÷ retângulo envolvente) e, no empate, a que cresceu menos.
  - É um comando só, então um Ctrl+Z desfaz.
- ⚠️ **O harness `docs/spikes/area-operacao`** (canvas real, porta 3163) pegou a proposta, que fechava
  os 139 m² dentro do L mas era uma tira de 3,8 m na perna estreita virando uma faixa fina de 28 m ao
  longo da perna larga. As quatro posições crescem quase empatadas, e vencia a de crescimento
  minimamente menor. A compacidade veio antes do crescimento. Agora a área é a perna estreita INTEIRA
  na largura (as duas colunas de sprinklers), com 139,0 m². O teste fixa isso. O rótulo do centroide
  caía fora do contorno em L e foi para `interiorPoint`.
- **Tela:**
  - **Ferramenta `area-operacao`:** polígono, que fecha no 1º vértice; lados em 90° fazem o
    retângulo. Tracejado laranja, com nome e m².
  - **Painel do cálculo:** lista das áreas com a desenhada / a exigida, os sprinklers dentro, o risco
    próprio e "Apagar".
  - **Botões:** "Desenhar" e "Propor na região mais desfavorável". O segundo fica desligado com o
    motivo no título e no texto.
- **Testes:** `blueprintAreaDeOperacao.test.ts` (11: entidade, canônico, pavimento, cálculo por área,
  risco da área, duas áreas, salão em L, ambiente inteiro) e mais 1 no painel. Suíte com 6.626 testes:
  6.593 + 33 pulados. Build ok.

### Etapa 5.3 — 01/10/2026 (frente `incendio-e5`, sem bump)

- **`utils/blueprintDistribuicaoSprinklers.ts`:** o ambiente vira ramais paralelos com sprinklers a
  espaçamento regular.
  - **Malha:** no referencial do ramal, o retângulo envolvente é dividido em células iguais. Cada
    célula tem su × sv ≤ a área máxima por sprinkler (do critério da E5.1), e su, sv ≤ o espaçamento
    máximo do risco. Do sprinkler à parede fica meio espaçamento.
  - **Ponto de cada célula:** a célula que toca o ambiente leva um sprinkler, no centro, ou, se o
    centro cai fora, no ponto interior da parte de dentro. Assim o canto interno do L não perde
    cobertura.
  - **Viga:** o sprinkler sob viga anda através do ramal, de 10 em 10 cm, até meio espaçamento.
  - **Cota:** a do defletor é o pé-direito menos a distância ao teto, uma premissa nova
    (`hipoteses.sprinklers.distanciaAoTetoMm`, padrão 150 mm).
  - **Norma (spray padrão, CONFERIR):** espaçamento máximo de 4,6 m (leve e ordinário) e 3,7 m
    (extraordinário), mínimos de 1,8 m entre sprinklers e de 10 cm até a parede.
- **Alternativas:** sentido dos ramais (x/y) × espaçamento (máximo no ramal / malha quadrada), sem
  repetidas, ordenadas da que tem menos sprinklers para a que tem mais; no empate, a de ramais mais
  curtos. "Lançar" é um lote só (um Ctrl+Z). Os tubos são a E5.4.
  - O teste do ordinário pegou o meu cálculo à mão: eu esperava 9 como melhor, mas com ramais em y
    dá 8 (4 × 3 m = 12 m² ≤ 12,1). É exatamente por isso que as alternativas existem.
- **Tela:** `DistribuicaoDeSprinklers` na seção de sprinklers do cálculo. A seção agora aparece mesmo
  sem sprinkler no desenho, porque é onde se lançam os primeiros. Mostra o ambiente do pavimento, as
  alternativas LADO A LADO (desenho em SVG com o ambiente, os ramais e os sprinklers; contagem;
  espaçamentos; m² por sprinkler; comprimento dos ramais; deslocados por viga) e "Lançar N
  sprinklers", desligado com o motivo. Há também o campo "Defletor até o teto".
- **Harness `docs/spikes/distribuir-sprinklers`** (porta 3164): o salão em L com risco ordinário 1
  mostrou 4 alternativas (39 a 45 sprinklers), todas cobrindo o L. O botão quebrava em duas linhas e
  ficou sem quebra.
- **Testes:** `blueprintDistribuicaoSprinklers.test.ts` (7: retângulo com cobertura total e 2+
  alternativas, ordinário, extraordinário, L sem buraco nem sprinkler fora, viga, lote, sem risco)
  e `DistribuicaoDeSprinklers.test.tsx` (2). Suíte com 6.640 testes: 6.607 + 33 pulados. Build ok.

### Etapa 5.4 — 01/10/2026 (frente `incendio-e5`, sem bump) — fecha a E5

- **Traçado (`utils/blueprintRedeDeSprinklers.ts`, `tracarRedeDeSprinklers`):** parte dos ramais da
  alternativa da E5.3 (`linhas`, os sprinklers de cada ramal em ordem).
  - **Espinha pela PONTA:** subgeral a ¼ de espaçamento (até 50 cm) antes do 1º sprinkler.
  - **Espinha pelo CENTRO:** o subgeral passa entre os dois sprinklers do meio do ramal mais longo.
  - **GRELHA:** subgeral nas duas pontas; os ramais fecham laços.
  - **Geral:** liga o subgeral, em L, ao nó MAIS PRÓXIMO da rede de incêndio do pavimento, contando a
    diferença de cota. Sem isso, na prumada (dois nós no mesmo x,y) ele desceria por cima do tubo que
    já existe; achado ao escrever o teste. Sem rede no pavimento, ele diz para ligar à mão.
  - **DN:** pelo método das tabelas na árvore planejada. Na grelha é ponto de partida, e o DN final é
    o do cálculo.
  - O botão "Lançar" leva os sprinklers E os tubos num lote só (um Ctrl+Z). A tubulação é escolhida
    na distribuição: só os sprinklers, ponta, centro ou grelha.
- **Método das tabelas (`metodoDasTabelas`):** o DN exigido pelo número de sprinklers a jusante na
  árvore a partir da fonte, contra o desenhado. Fica "não avaliado" com laço (grelha/malha) e no risco
  extraordinário, que exige o cálculo. A tabela é a de aço do método das tabelas (pipe schedule da
  NFPA 13), CONFERIR NA NORMA. Tem um botão "Ajustar DN pelas tabelas" (um lote).
- **VGA (`vgasDaRede`):** os sprinklers a jusante de cada VGA são DERIVADOS: os que a rede só alcança
  passando por ela. Sprinkler sem VGA vira FALTA na conferência.
- **Demanda combinada (premissa `demandaCombinada`, padrão sim, CONFERIR NA IT):**
  - com hidrantes e sprinklers na mesma rede, a área de operação e os hidrantes simultâneos abrem
    JUNTOS, cada um com a sua exigência;
  - esse cenário governa a bomba, e a RTI é a vazão somada × a maior duração;
  - desligada, volta o "governa o maior" da E5.1. Item novo na conferência.
- **Harness `docs/spikes/tracado-sprinklers`** (canvas real, porta 3165, `?t=PONTA|CENTRO|GRELHA`):
  a espinha e a grelha no salão de 12 × 8 m. O geral chega na prumada da bomba, com DN 25 nos
  ramais, 32 no subgeral e 50 no geral, e a grelha fecha pelo subgeral da direita.
- **Testes:** `blueprintRedeDeSprinklers.test.ts` (8: tabela, espinha pela ponta e pelo centro com
  todo sprinkler na rede e o cálculo fechando, grelha fechando no solver com laço e tabelas "não
  vale", sem rede, VGA, demanda somada), o caso da E5.1 refeito sem a demanda combinada, e 3 de tela.
  Suíte com 6.649 testes: 6.616 + 33 pulados. Build ok.

**Fecha o bloco 3** (sprinklers): risco e densidade, Área de Operação, distribuição com alternativas,
traçado em espinha e grelha, método das tabelas, VGA e demanda somada.

### Etapa 6.1 — 01/10/2026 (frente `incendio-e6`, sem bump)

- **`utils/blueprintSaidasIncendio.ts`:**
  - **População por pavimento:** no grupo A, pessoas por dormitório (padrão 2); nas outras divisões,
    a área ÷ m² por pessoa da tabela (B 15, C 5, D 7, E 1,5, F 1, G 40, H 7, I 10, J 30). O m² por
    pessoa declarado vence a tabela.
  - **Unidades de passagem:** N = ⌈P ÷ C⌉, com C a capacidade da unidade por grupo e tipo (acesso,
    escada, porta; ex. grupo A: 60/45/100). A largura é N × 0,55 m, com o mínimo de 2 unidades
    (1,10 m) em acesso e escada e 1 em porta.
  - **Tabelas:** CONFERIR NA IT de saídas do CBMMG / NBR 9077, transcritas de memória.
- **Conferências contra o desenho:**
  - cada **escada**, pela população do pavimento mais populoso que desce por ela (a largura não
    soma andares);
  - cada **corredor** (circulação pelo nome, ou pela forma), pela população do pavimento dele;
  - as **saídas para o exterior** do pavimento de descarga (soma das portas), pela maior população
    entre ele e os de cima.
  - Pendências: sem divisão; prédio de vários pavimentos sem escada; descarga sem porta para fora.
- ⚠️ **Achado: o contorno do ambiente passa pelo EIXO das paredes.** O corredor de 1,20 m entre eixos
  tem 1,05 m livres com paredes de 15 cm, e medir eixo a eixo aprovava o que a norma reprova. A
  largura do corredor agora desconta meia espessura das paredes dos dois lados compridos (corredor
  alinhado a x/y). Quem pegou foi a asserção do teste, quando troquei "entre 1,00 e 1,20" pelo valor
  exato.
- **Premissas:** `hipoteses.saidas` (pessoas por dormitório, m² por pessoa).
- **Tela:** `PainelSaidasIncendio` na tarefa Incêndio, abaixo da classificação. Mostra a população
  por pavimento com a base (dormitórios ou m²) e a largura exigida × desenhada, em vermelho quando
  falta, com a população e as unidades de cada item. Clicar seleciona a peça.
- **Harness `docs/spikes/saidas-incendio`** (porta 3166): o pavimento-tipo com a escada de 0,90 m e
  o corredor de 1,05 m em vermelho, e a descarga atendendo.
- **Testes:** `blueprintSaidasIncendio.test.ts` (6: unidades, premissas, escada estreita no
  pavimento-tipo, corredor livre e descarga, comércio pela área, pendências) e
  `PainelSaidasIncendio.test.tsx` (2). Suíte com 6.657 testes: 6.624 + 33 pulados. Build ok.

### Etapa 6.2 — 01/10/2026 (frente `incendio-e6`, kernel 0.84.0)

- **Kernel 0.84.0:**
  - `Escada.protecao`: NE, EP, PF ou PRESSURIZADA; `null` no `SetEscadaProps` volta a não declarada.
  - `Opening.emergencia`: SAIDA, CORTA_FOGO, ANTIPANICO. O comando `SetOpeningEmergencia` normaliza
    (sem repetição, na ordem da lista); a lista vazia some.
  - Invariantes `BAD_STAIR_PROTECTION`/`BAD_EMERGENCY_MARKS`. Os dois campos são omitidos do canônico
    quando ausentes.
  - Ritual do bump: goldens 7/7 em 0.83.0, 6 hashes, 22 pinos. Bundle da planta-api regerado.
- **Regra (`protecaoExigida`, CONFERIR NA IT):** pela altura da E0, até 12 m não enclausurada, até
  30 m enclausurada protegida, acima à prova de fumaça; na saúde, 6 e 12 m. A pressurizada vale como
  PF. A declarada atende quando é a mesma ou acima; não declarada fica "não avaliada" com "declare a
  proteção".
- **Portas da caixa:** com EP/PF exigida, em cada pavimento que a escada serve, as portas da CAIXA
  sem corta-fogo viram pendência. Há um botão "Marcar corta-fogo" (um lote).
  - **Caixa:** é o ambiente fechado próprio da escada, com "escada"/"caixa" no nome ou até 40 m².
  - ⚠️ **O harness `saidas-incendio` pegou:** bastava "conter a escada", e com ela solta num salão o
    salão inteiro virava a caixa, cobrando corta-fogo na porta da rua. Agora, sem caixa própria, a
    análise diz que a escada não está enclausurada.
- **Tela:** "Proteção das escadas" no painel de saídas mostra, por escada, a seleção da proteção, a
  exigida com o motivo (em vermelho quando a declarada não basta), "sem caixa" e as portas da caixa
  sem corta-fogo, que dá para selecionar ou marcar.
- **Testes:** `blueprintEscadaDeEmergencia.test.ts` (8: proteção e marcas no kernel, canônico, regra
  por altura, escada de 20 m com as duas portas da caixa, NE sem cobrança, salão sem caixa, escada
  fora de ambiente) e mais 1 no painel. Suíte com 6.666 testes: 6.633 + 33 pulados. Build ok.
- **Fica para a E7.2:** o antipânico (a marca existe; a regra de quando se exige depende da IT) e a
  placa de saída.

### Etapa 6.3 — 01/10/2026 (frente `incendio-e6`, sem bump) — fecha a E6

- **`utils/blueprintRotaDeFuga.ts`, `percursoDeFuga`:** um grafo de vários pavimentos.
  - **Nós:** as portas de cada pavimento e as "bocas" das escadas (o começo do eixo na partida, o fim
    na chegada, e em cada pavimento de uma multiandares).
  - **Arestas:** os pares de nós do mesmo ambiente, pela distância POR DENTRO dele; os lances, pelo
    comprimento inclinado (√(horizontal² + desnível²)); e a porta → exterior.
  - **Saída:** só conta a porta para o exterior do pavimento de DESCARGA (a da varanda lá em cima não
    é saída).
  - **Busca:** Dijkstra a partir do exterior.
- **Contornar paredes (`caminhoDentro`):** reto quando o segmento cabe no ambiente; senão, pelo grafo
  de visibilidade dos vértices do contorno (o L passa pelo canto de dentro).
- **Ponto mais desfavorável:** cada canto recuado 40 cm para dentro, e o centro. Vale o que fica mais
  longe da saída, e a rota parte dele.
- **Limite (`limiteDoPercursoM`, CONFERIR NA IT):** 30 m sem chuveiros e 45 m com, nos grupos
  A/B/D/E/F/H; 40/55 em C/G/I/J. O "com" liga sozinho quando o desenho tem sprinkler. O percurso
  máximo declarado (`hipoteses.saidas.percursoMaximoM`) vence a tabela.
- **Rota:** é uma polilinha DERIVADA por pavimento, com o lance desenhado no pavimento de baixo, pelo
  eixo da escada. Na planta (tarefa Incêndio) sai tracejada com a seta no fim: verde atende, vermelha
  estoura o limite. As vermelhas vão POR CIMA. O harness `rota-de-fuga` mostrou o pedaço do térreo
  de uma rota vermelha que desce do 1º sumindo sob as verdes do térreo, que correm junto.
- **Tela:** "Percurso até a saída" no painel de saídas: os 8 maiores, do mais longo para o mais curto,
  em vermelho acima do limite, "sem saída" sem caminho e "pela escada". Há o campo do percurso máximo e
  "Rotas na planta" liga/desliga.
- **Testes:** `blueprintRotaDeFuga.test.ts` (6: L pelo canto; sobrado com a rota de cima pela escada
  até a porta da rua; origem no canto oposto; prédio de 4 pavimentos somando lances e FALTA com o
  comprimento; sem porta da rua ninguém sai; limites) e mais 1 no painel. Suíte com 6.673 testes:
  6.640 + 33 pulados. Build ok.

**Fecha os A das seções 22 e 27** (motor que calcula a rota de fuga; população e saídas).

### Etapa 7.1 — 01/10/2026 (frente `incendio-e7`, kernel 0.85.0)

- ⚠️ **Desvio do roadmap: a 7.1 também sobe o kernel.** O extintor não existia (pela decisão
  "preventivos na E7"), e vocabulário novo leva bump, como em todas as etapas. A sequência fica 0.85.0
  (7.1 extintor), 0.86.0 (7.2 placa e kits) e 0.87.0 (7.4 detecção e alarme).
- **Kernel 0.85.0:**
  - O tipo `EXTINTOR` entra na lista de pontos da disciplina INCENDIO, no grupo novo "Incêndio —
    preventivos". Não liga em tubo, e a marca "fora da rede" só olha uma lista fechada de tipos.
  - Só nele: `agenteExtintor` (água, espuma, pó BC, pó ABC, CO₂), `cargaExtintorKg` e
    `capacidadeExtintora` ("2-A:20-B:C", com A, B, C nessa ordem, validada por
    `capacidadeExtintoraValida` e gravada em maiúsculas). Trocar de tipo leva os três.
  - Omitidos do canônico quando ausentes. Ritual: goldens 7/7 em 0.84.0, 6 hashes, 22 pinos. Bundle da
    planta-api regerado.
- **Ficha, símbolo, número e IFC:** a cota é a da alça, 1,60 m, CONFERIR. O símbolo é um triângulo com
  o cilindro. A numeração é EXT-n. O IFC é `IfcFireSuppressionTerminal` USERDEFINED, porque o enum
  não tem extintor.
- **Regra (`utils/blueprintExtintores.ts`, CONFERIR NA IT de extintores / NBR 12693):**
  - **Classes por ambiente:** A sempre; B na cozinha e na garagem; C onde há quadro elétrico ou nome de
    casa de máquinas, subestação, gerador ou medidores.
  - **Risco:** sai do nível da carga de incêndio da E0 (sem carga, o médio, com pendência). Dá a
    distância a percorrer: 25, 20 ou 15 m.
  - **Cobertura:** do ponto mais desfavorável de cada ambiente, pelo menor caminho no pavimento
    (portas, contornando paredes, o motor da E6.3), até um extintor cujo agente combata cada classe
    pedida. O extintor sem agente conta só para A.
  - **Capacidade mínima** nas classes do agente: 2-A/20-B, 3-A/40-B e 4-A/80-B. Também aparece o
    pavimento ocupado sem nenhum extintor.
- ⚠️ **Dois achados na cobertura:**
  - **O ponto entre dois extintores:** só cantos e centro não pegam o pior ponto de um corredor de
    60 m com extintores a 10 e 50 m, que fica no meio. A cobertura passou a valer numa malha a cada
    3 m, além de cantos e centro; um teste fixa o limite exato nos 20 m.
  - **Corredor longo:** a proposta cobria por ambiente inteiro e o corredor ficava sem cobertura. Agora
    cobre ponto a ponto, descontando o que os extintores existentes já cobrem.
- ⚠️ **O harness `extintores` (canvas real, porta 3168) pegou extintor no vão da porta:** o candidato
  "30 cm ao lado da porta" ainda caía dentro da porta de 90 cm e no eixo da parede. Agora a posição é
  ao lado do batente (meia porta + 30 cm) e 40 cm para dentro, com 15 cm de folga de qualquer parede;
  o teste confere a folga.
- **Proposta:** gulosa, a posição que cobre mais pontos primeiro, com o extintor padrão das premissas
  (pó ABC 4 kg 2-A:20-B:C). Diz o que não dá para cobrir. É um lote só.
- **Tela:**
  - **Painel da peça:** agente, carga e capacidade; a capacidade inválida é recusada no blur.
  - **Painel "Extintores"** na tarefa Incêndio: risco e distância, os ambientes longe demais do pior
    para o melhor (com a classe e o motivo), a capacidade fraca, o pavimento sem extintor, a distância
    e o agente da proposta, e "Propor N extintor(es)", desligado com o motivo.
- **Testes:** `blueprintExtintores.test.ts` (9), os dois painéis (3) e a taxonomia, que ganhou o grupo
  dos preventivos. Suíte com 6.685 testes, todos passando, incluindo os 33 pulados de propósito.
  Build ok.

### Etapa 7.2 — 01/10/2026 (frente `incendio-e7`, kernel 0.86.0)

- **Kernel 0.86.0:**
  - **Tipo `PLACA`** (grupo preventivos, base a 1,80 m, CONFERIR). Só nele: `codigoPlaca` (letra(s) +
    número, ex. E5, S12) e `alvoId`, o equipamento de incêndio que ela sinaliza. O alvo não pode ser
    outra placa.
  - **Canônico:** o alvo vai por ÍNDICE (`alvo`), num segundo passo, como a principal da jockey.
  - **Equipamento apagado:** a placa perde o alvo (`limparPlacasOrfas`). Só o alvo que SUMIU é limpo;
    o que existe mas é inválido fica para a invariante recusar. O teste pegou: a limpeza apagava em
    silêncio uma placa apontando para si mesma.
  - **`AddTerminal` aceita `rotacaoGraus`:** a placa de rota nasce apontando. A rotação só era
    aplicada quando havia medidas, e o teste da seta pegou isso também.
  - Ritual do bump: goldens 7/7 em 0.85.0, 6 hashes, 22 pinos. Bundle da planta-api regerado.
- **`utils/blueprintSinalizacao.ts` (CONFERIR NA NBR 13434 / IT):**
  - **Catálogo:** E5 extintor, E7 mangotinho, E8 hidrante, E9 recalque, S3 rota (seta) e S12 saída.
  - **Placa de equipamento:** extintor, hidrante, mangotinho e recalque pedem a deles. Contam como
    pendência o equipamento sem placa, a placa sem equipamento e a placa sem código.
  - **Placa de rota:** nas rotas da E6.3, em cada mudança de direção ≥ 30° vai a seta virada para o
    trecho seguinte; no fim da rota no pavimento de descarga, "saída" a 2,20 m. Pontos a menos de
    1,5 m são a mesma placa. A dobra de 14° no canto da caixa não pede placa; a de 70° na porta da
    caixa, sim.
  - **Kit (`comPlacas`):** os equipamentos e a placa de cada um num lote só. Os ids que o lote cria
    são previstos aplicando-o numa cópia, e a previsão é conferida, como no `conferirPlano`. A
    proposta de extintores passou a lançar o kit.
- ⚠️ **O harness `sinalizacao` (canvas real, porta 3169) pegou:** a placa no mesmo ponto do equipamento
  escondia o símbolo dele, e os números se sobrepunham (EXT-1 sobre PL-2). Agora ela se desenha 40 cm
  ao lado, para dentro do ambiente e com folga das paredes.
- **Tela:**
  - **Painel da peça:** o código da placa pelo catálogo e o que ela sinaliza (ou "sem equipamento: foi
    apagado").
  - **Painel "Sinalização"** na tarefa Incêndio: o que falta, selecionável, e "Propor N placa(s)".
- **Fica para depois (backlog nomeado):** o kit da VGA com os manômetros (precisa do tipo manômetro)
  e os kits criados pelo projetista, guardados por organização (precisam de uma tabela nova, ou seja,
  de migration, que só se aplica com o OK do usuário).
- **Testes:** `blueprintSinalizacao.test.ts` (6) e 3 de tela. Suíte com 6.694 testes: 6.661 + 33
  pulados. Build ok.

### Etapa 7.3 — 01/10/2026 (frente `incendio-e7`, kernel 0.87.0)

- **Kernel 0.87.0:** o tipo `LUMINARIA_EMERGENCIA` (grupo preventivos, a 2,20 m, acima das portas) e,
  só nele, `autonomiaMin` (inteiro, 1–600; ausente = 60 da ficha), omitida quando ausente. IFC
  `IfcLightFixture` `.SECURITYLIGHTING.`, símbolo do bloco autônomo e numeração LE-n. Ritual:
  goldens 7/7 em 0.86.0, 6 hashes, 22 pinos. Bundle regerado.
  - Desvio já anunciado na 7.1: o roadmap previa a 7.3 sem bump, mas o tipo é vocabulário novo.
    Detecção e alarme (7.4) ficam com 0.88.0.
- **Regra (`utils/blueprintIluminacaoEmergencia.ts`, CONFERIR NA NBR 10898):**
  - **Pontos obrigatórios:** cada mudança de direção e saída das rotas da E6.3 (os mesmos pontos da
    sinalização) e cada boca de escada em cada pavimento pedem luminária a até 2 m.
  - **Espaçamento:** nenhum ponto da rota (a cada 1 m) a mais de meio espaçamento máximo da luminária
    mais próxima do pavimento, o que equivale a luminárias a no máximo 15 m umas das outras. Há um
    espaçamento declarável.
  - **Autonomia:** abaixo de 60 min é dita.
- **Proposta:** primeiro os pontos obrigatórios; depois, ao longo das rotas, cada luminária nova meio
  espaçamento ADIANTE do primeiro ponto descoberto, que cobre para trás e para a frente. É um lote só.
- **Harness `docs/spikes/iluminacao-emergencia`** (canvas real, porta 3170): no andar de 60 m com dez
  salas, lançou 11 luminárias, uma sobre cada porta de sala (onde a rota dobra para o corredor) e uma
  na saída. Ficaram 0 trechos sem luz e 0 pontos obrigatórios faltando.
- **Tela:**
  - **Painel da peça:** a autonomia.
  - **Painel "Iluminação de emergência"** na tarefa Incêndio: o que falta por tipo, os trechos sem
    luz, a autonomia curta selecionável, o espaçamento declarável e "Propor N luminária(s)".
- **Fica para depois:** ligar a luminária a um circuito da elétrica, para entrar no quadro de cargas.
  Hoje a luminária é do incêndio e não tem circuito.
- **Testes:** `blueprintIluminacaoEmergencia.test.ts` (4) e o painel (2). Suíte com 6.700 testes:
  6.667 + 33 pulados. Build ok.

### Etapa 7.4 — 01/10/2026 (frente `incendio-e7`, kernel 0.88.0) — fecha a E7

- **Kernel 0.88.0:**
  - **Tipos:** DETECTOR_FUMACA, DETECTOR_TEMPERATURA, ACIONADOR_MANUAL, AVISADOR, CENTRAL_ALARME e
    PREVENTIVO_PERSONALIZADO (ventilador de pressurização, motor: nome e item vêm do cadastro).
  - **Laço:** é uma RELAÇÃO. Detector, acionador e avisador têm `centralAlarmeId`, que tem de apontar
    uma central. No canônico vai por índice (`central`), num segundo passo. Apagar a central solta o
    laço (`limparLacosOrfos`; só o alvo que sumiu, como na placa).
  - **IFC:** IfcSensor SMOKESENSOR/HEATSENSOR, IfcAlarm MANUALPULLBOX/SIREN, IfcController USERDEFINED.
  - Ritual: goldens 7/7 em 0.87.0, 6 hashes, 22 pinos. Bundle regerado.
- **Regra (`utils/blueprintDeteccaoAlarme.ts`, CONFERIR NA NBR 17240 / IT):**
  - **Detectores:** quando a detecção é exigida (E0), todo ponto de cada ambiente (exceto banheiro e
    lavabo) fica a até o raio de um detector DO MESMO AMBIENTE (a fumaça não atravessa parede):
    6,3 m o de fumaça, 4,2 m o de temperatura. Cozinha e garagem pedem o de temperatura.
  - **Acionadores:** quando o alarme é exigido, a distância a percorrer até um acionador é de no
    máximo 30 m, pelo motor da E7.1 (portas, contornando paredes, malha a cada 3 m).
  - **Avisador:** um por pavimento com dispositivo, ou com alarme exigido.
  - **Laço:** sistema sem central e dispositivo fora do laço são ditos.
- **Proposta:** primeiro a central, se falta, junto da saída do pavimento mais baixo; os ids do lote
  são previstos, como no kit. Depois a malha de detectores por ambiente (células inscritas no círculo
  de cobertura), os acionadores pela cobertura gulosa ao lado das portas, um avisador por pavimento e
  a ligação dos existentes fora do laço. Tudo no laço, num lote só.
- **Harness `docs/spikes/deteccao-alarme`** (canvas real, porta 3171): no andar de 60 m lançou 1
  central junto da saída, 15 detectores de fumaça (um por sala e uma linha no corredor), 4 de
  temperatura na cozinha (raio 4,2 m → malha 2 × 2), nenhum no banheiro, 3 acionadores e 1 avisador.
  Ficaram 0 ambientes descobertos, 0 longe de acionador e 0 fora do laço.
- **Tela:**
  - **Painel da peça:** a central do laço; "fora do laço" fica em vermelho.
  - **Painel "Detecção e alarme"** na tarefa Incêndio: o que é exigido pela classificação, o que
    falta (central, cobertura, acionador com a pior distância, avisador, laço), selecionável, e
    "Propor N item(ns)".
- **Fica para depois (backlog nomeado):**
  - o eletroduto do laço roteado pelo automático da elétrica;
  - o detector de chama;
  - a cobertura do avisador pelo nível sonoro;
  - o antipânico, que depende da IT (desde a E6.2).
- **Testes:** `blueprintDeteccaoAlarme.test.ts` (6) e 3 de tela. Suíte com 6.709 testes: 6.676 + 33
  pulados. Build ok.

**Fecha o bloco 5** (preventivos) e os A das seções 20, 21, 23, 24 e 25.

### Etapa 8.1 — 01/10/2026 (frente `incendio-e8`, sem bump)

- **`utils/blueprintPranchaIncendio.ts`:**
  - **Três famílias por pavimento:** HIDRANTES (rede, hidrantes, mangotinho, recalque, bombas,
    pressostato, caixa), SPRINKLERS (rede, sprinklers, VGA, chave de fluxo) e PREVENTIVO
    (extintores, placas com o código, luminárias, detecção, alarme, personalizado).
  - **Desenho:** a tubulação com o DN (bifilar quando cabe), a coluna como círculo, o símbolo técnico
    de prancha em escala (mínimo de 2,6 mm) e o número do desenho INTEIRO (H-1, SPK-3, EXT-2), não o
    do pavimento recortado.
- **Conjunto de pranchas** (opção "Incêndio" no template, `incluir.incendio`):
  - por família e por pavimento, só as que o pavimento TEM;
  - no fim, a folha "Incêndio — quadro-resumo e legenda" (tipos `INCENDIO`/`LEGENDA_INCENDIO`).
  - **Quadro-resumo:** classificação e as medidas de segurança da E0, com exigência e motivo, no
    formato do CBMMG. Sai das premissas do estudo, que o painel Versões agora recebe. Sem elas, a
    folha diz que a classificação não foi informada.
  - **Legenda:** por família, só o que existe, com a quantidade.
- **Prancha avulsa "Incêndio"** no painel Versões (PDF/PNG): as três famílias numa folha.
- **DXF:** camadas `PLANTA-INCENDIO` e `PLANTA-INCENDIO-TEXTO`, pelo MESMO desenho da prancha.
- ⚠️ **O harness `docs/spikes/prancha-incendio`** (o conjunto em canvas, `?folha=`, porta 3172) pegou
  uma folha a mais: o pavimento só com tubo ia para a de hidrantes "para a coluna não sumir", mas o
  tubo era dos sprinklers dele, e saía uma folha de hidrantes só com a rede dos sprinklers. Agora essa
  regra vale só sem sprinkler no pavimento. O conjunto de prova tem 5 folhas: hidrantes do térreo,
  sprinklers do 1º, preventivo de cada pavimento e o quadro.
- **Testes:** `blueprintPranchaIncendio.test.ts` (6: famílias por pavimento, folha só com a família
  dela e o DN, quadro-resumo com e sem premissas, legenda, prancha avulsa, DXF). Na DXF, a tabela de
  camadas declara todas, então o teste confere as ENTIDADES. Suíte com 6.715 testes: 6.682 + 33
  pulados. Build ok.

### Etapa 8.2 — 01/10/2026 (frente `incendio-e8`, sem bump)

- **`utils/blueprintPlanilhaDePressoes.ts`:**
  - **`calculoDoEstudo`:** o MESMO cálculo da tela (critério dos sprinklers pela divisão da E0) a
    partir das premissas do estudo.
  - **`caminhoCritico`:** os trechos da fonte até a peça aberta de MENOR folga. É a peça do solver, e
    o teste confere que, no galpão da E2, é o hidrante do fundo, pelos 4 trechos na ordem.
  - **`planilhaDePressoes`:** o resumo (sistema que governa, vazão, altura manométrica, fórmula) e os
    trechos com o caminho crítico primeiro (marcado *), cada um com papel, DN, material, L, Leq, Q,
    V, J, hf e P nas duas pontas. Vêm também as peças abertas com Q, P no nó, P no bico, o exigido e
    a situação.
- **Papel:**
  - **Folha "Incêndio — planilha de pressões e curva da bomba":** vai no conjunto quando há rede. Traz
    as tabelas (cortadas com aviso quando não cabem; a íntegra vai no XLSX) e, com bomba e curva, o
    gráfico da curva da bomba × a do sistema com os pontos de projeto e de operação.
  - **Plantas de hidrantes e sprinklers:** o caminho crítico em vermelho por baixo do tubo.
- **XLSX:** aba "Incêndio — pressões" no quantitativo, quando há rede e as premissas.
- ⚠️ **PDF e WinAnsi:** o `DesenhistaPdf` passou a mandar todo texto pelo `paraWinAnsi`. As fontes do
  jsPDF são WinAnsi, e "→", "≥" e "√" viravam lixo em QUALQUER prancha; antes só o memorial
  convertia.
  - Prova no PDF REAL: o conjunto do galpão gerado pelo `montarConjuntoPdf` tem 227 textos, nenhum
    "?", e a seta saiu "->". Os números batem com a E4: projeto 605 L/min a 47,2 m, operação 644
    L/min a 53,2 m.
- **Harness `prancha-incendio`** (`?folha=5`): a folha com a demanda combinada governando (758 L/min a
  46,3 mca) e o gráfico com as curvas se cruzando no ponto de operação.
  - Na 1ª passada a folha disse "sem planilha" com o motivo, porque a rede do 1º do modelo de prova
    não estava ligada à prumada. Era o modelo de prova, e a folha agiu certo; a prumada foi ligada até
    a laje.
- **Testes:** `blueprintPlanilhaDePressoes.test.ts` (6) e o conjunto da E8.1, que agora tem a folha a
  mais. Suíte com 6.721 testes: 6.688 + 33 pulados. Build ok.

### Etapa 8.3 — 01/10/2026 (frente `incendio-e8`, sem bump)

- **A rede de incêndio entrou nas peças de prancha que já existiam.** `RedeDaPrancha` ganhou
  `INCENDIO` (`DISCIPLINAS_DA_REDE.INCENDIO = ['INCENDIO']`). A planta dela continua sendo a de
  `blueprintPranchaIncendio` (E8.1).
- **Esquema vertical:** a coluna de incêndio sai como **CI-n** (sigla nova `CI`, depois de AF/AQ/TQ),
  e na legenda aparece como "Coluna de incêndio". A descida ao hidrante (ou ao sprinkler) é ramal,
  como a da água.
  - ⚠️ **O harness pegou:** o recalque que sai da BOMBA e não chega ao teto era descartado como
    "descida ao ponto", porque terminava na cota da bomba, e a CI-1 começava a 2,60 m. A bomba
    (principal e jockey) é a ORIGEM da coluna, não um ponto de consumo; hoje a coluna nasce nela.
- **`utils/blueprintDetalhesIncendio.ts`:**
  - **`isometricoDeIncendio`:** o isométrico da REDE INTEIRA, em todos os pavimentos e na cota
    absoluta, e não por ambiente molhado como o do hidro. Mostra as peças da rede com o número do
    desenho (H-1, SPK-2, VGA-1, BI-1). Com mais de 30 sprinklers eles saem sem rótulo, e o título
    avisa.
  - **Detalhes típicos paramétricos**, só do que o desenho tem:
    - **abrigo de hidrante/mangotinho** em vista, com as medidas do terminal ou da ficha, a válvula
      na cota dela com o DN do tubo e a mangueira das premissas;
    - **VGA** em esquema, numerado de 1 a 6 (bloqueio, manômetros, VGA, câmara de retardo e gongo,
      dreno), com o DN do tubo que passa por ela (no meio do tubo também) e as chaves de fluxo;
    - **casa de bombas** em esquema (RTI, sucção, BI e BJ com retenção e registro, barrilete,
      pressostato, manômetro), com as contagens.
  - Os detalhes são "sem escala", e as medidas e alturas exigidas estão marcadas **CONFERIR NA IT do
    CBMMG**.
- **Folha nova "Incêndio — isométrico, esquema vertical e detalhes"** (`DETALHES_INCENDIO`): vai no
  conjunto depois da de pressões, quando há rede. Em cima ficam o isométrico e o esquema vertical da
  CI; embaixo, os detalhes lado a lado.
- **Corte:** o tubo de incêndio já saía (todas as disciplinas, na cor delas), mas nenhuma peça
  aparecia. Agora `ProjecaoCorte.pecasDeIncendio` traz as peças ATRÁS do plano. O abrigo e a bomba
  saem nas medidas deles, o resto como marca, sempre com a sigla. As instalações no corte também
  ligam quando o conjunto (ou a prancha avulsa) tem incêndio.
- **Harness `prancha-incendio`** (`?folha=6`): a folha com o isométrico do prédio de prova, a CI-1 de
  0,30 m até o 1º e os três detalhes. O modelo de prova ganhou jockey e pressostato.
- **Testes:** `blueprintDetalhesIncendio.test.ts` (9: CI-1 nos dois andares e a descida que não é
  coluna, o recalque da bomba, o esquema só com a CI, o isométrico na cota absoluta, sprinklers sem
  rótulo, os detalhes pelo que existe, a folha, o conjunto e as peças no corte). As listas fixas da
  E8.1 e da E8.2 ganharam a folha nova. Suíte com 6.730 testes: 6.697 + 33 pulados. Na 1ª e na 2ª
  rodada o worker do `BlueprintEditor.test.tsx` caiu (pending); sozinho ele dá 193/193, e na 3ª
  rodada a suíte inteira fechou. Build ok.

### Etapa 8.4 — 01/10/2026 (frente `incendio-e8`, sem bump, 1 migration)

- **`utils/blueprintIncendioExecutivo.ts`:**
  - **`analisesDeIncendio`:** classificação e exigências (E0), cálculo hidráulico e bomba
    (`calculoDoEstudo`), saídas, rota de fuga, extintores, sinalização, iluminação e alarme. Roda
    UMA vez e os três documentos leem dela; são as mesmas funções das gavetas.
  - **`memorialDeCalculoIncendio`:**
    - classificação e as medidas exigidas, com fonte e o aviso de rascunho;
    - premissas hidráulicas e a planilha de pressões (resumo, trechos com o caminho crítico e
      peças), que entra IGUAL à da E8.2, como o teste confere;
    - critério dos sprinklers, bomba (projeto, operação, 150 %, shutoff, NPSH, pressostatos) e
      reserva técnica;
    - saídas (população, larguras, escadas), percurso de fuga por ambiente, extintores, iluminação,
      sinalização, detecção e alarme.
    - Cada seção só aparece se o sistema existe ou é exigido.
  - **`memorialDescritivoIncendio`:** objeto, normas, sistemas com as peças do desenho (extintores
    por agente e capacidade, placas por código), tubulação por material × DN com o comprimento, as
    **medidas exigidas que o desenho não modela** (acesso de viatura, brigada, compartimentação…)
    "a cargo do responsável", e execução e ensaios.
  - **`verificacoesIncendio`:**
    - responsável e ART, ocupação definida, regulamento com tabela;
    - cada medida exigida que o desenho modela tem de ter peça lançada;
    - **toda a conferência da gaveta de cálculo** (`conferenciaDeIncendio`, com a reserva técnica),
      e o teste confere que é a MESMA;
    - larguras e proteção das escadas, percurso, extintores (alcance e capacidade), sinalização,
      iluminação e alarme.
    - Itens NÃO AVALIADOS (sistema que não há) não entram.
  - **`hashDaBaseIncendio`** (desenho + premissas) e **`memorialExecutivoIncendio`** (capa:
    responsável, base, verificações, declaração, e os dois memoriais).
    - ⚠️ As tabelas CONFERIR NA NORMA/IT **não bloqueiam a emissão**: a DECLARAÇÃO diz que o
      responsável as conferiu no texto vigente e projetou as medidas que o desenho não modela.
      Bloquear deixaria a emissão inutilizável até o texto das ITs ser colado, e quem emite é o
      responsável.
- **Tela:** aba Incêndio → **Documentos → "Memoriais e ART"**. Os memoriais vêm em PDF/DOCX no
  `PainelMemoriaisHidro`, com textos próprios. A emissão usa o `PainelHidroExecutivo`,
  parametrizado com `textos` (rótulos dos grupos, conferência, disciplina, testId); o hidro segue
  igual. Na disciplina `INCENDIO`, o fluxo de `useBlueprintProjetoExecutivo` é o mesmo.
- **Migration `aplicar_20271001000030_blueprint_incendio_executivo.sql`:** o CHECK de
  `blueprint_study_projeto_executivo.disciplina` passa a aceitar `INCENDIO`. Aplicada com o OK do
  usuário em 01/10/2026 (`db query -f`) e conferida no `pg_constraint`. A tabela tinha 0 linhas.
- ⚠️ **PDF:** o "₂" de CO₂ virava "?" no WinAnsi, e `paraWinAnsi` agora troca por "2". O teste
  confere que nenhum caractere do memorial descritivo vira "?". Conferido também no PDF real da
  emissão (128 kB).
- **Testes:**
  - `blueprintIncendioExecutivo.test.ts` (8): a planilha igual à da tela, nenhuma seção hidráulica
    sem rede, o descritivo com as peças e o comprimento por DN, a medida não modelada, a
    conferência igual à da gaveta, a ocupação pendente, o hash e a capa com ida e volta em texto;
  - `PainelHidroExecutivo.test.tsx` (+1, o painel com os textos de incêndio).
  - Suíte com 6.739 testes: 6.706 + 33 pulados (na 1ª rodada o worker caiu; a 2ª fechou). Build
    ok.

