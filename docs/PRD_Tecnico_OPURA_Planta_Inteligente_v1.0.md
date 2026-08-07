# ÒPURA Planta Inteligente

## PRD técnico completo — Digitalizador de Plantas e Gerador Paramétrico

**Versão:** 1.0  
**Data:** 4 de agosto de 2026  
**Status:** Proposta para aprovação e decomposição em épicos  
**Produto:** ÒPURA, por Altimedia  
**Público:** Produto, Engenharia, Arquitetura, IA/ML, Dados, Segurança, QA e Operações

> **Decisão recomendada.** Construir uma fundação geométrica única e lançar primeiro o Digitalizador assistido. O Gerador Inteligente deve entrar apenas depois que editor, topologia, regras e métricas de qualidade estiverem estáveis. O sistema deve tratar a IA como produtora de hipóteses revisáveis, nunca como fonte silenciosa da verdade.

## 1. Controle do documento

| Campo | Definição |
|:----------------------|:--------------------------------------------------|
| Identificador | PRD-OPURA-PI-001 |
| Módulo | Planta Inteligente |
| Componentes | Digitalizador, Editor Paramétrico, Validador e Gerador |
| Proprietário do produto | ÒPURA / Altimedia |
| Horizonte | Fundação + quatro releases incrementais |
| Classificação | Documento interno de produto e engenharia |
| Aprovação mínima | Produto, Engenharia, especialista de Arquitetura e Segurança |

### 1.1 Histórico de versões

| Versão | Data | Alteração | Estado |
|:--------|:---------------------------------------------|:------------:|:------------:|
| 0.1 | 04/08/2026 | Estrutura inicial e decisões de arquitetura | Substituída |
| 1.0 | 04/08/2026 | PRD técnico completo para aprovação | Atual |

### 1.2 Termos normativos

- **DEVE** indica requisito obrigatório para a release indicada.
- **DEVERIA** indica requisito importante, sujeito a priorização explícita.
- **PODE** indica capacidade opcional ou posterior.
- **Candidato** é um elemento sugerido por IA ainda não aceito pelo usuário.
- **Objeto confirmado** é um elemento incorporado à versão do modelo por ação humana ou regra determinística aprovada.
- **Regra dura** elimina uma solução; **regra branda** apenas reduz sua pontuação.

## 2. Resumo executivo

O ÒPURA Planta Inteligente será a camada de captura, edição, validação e geração de plantas 2D do ecossistema ÒPURA. O produto receberá imagens, fotografias ou PDFs; calibrará escala e orientação; identificará paredes, aberturas, textos e cotas; apresentará candidatos com confiança; permitirá revisão em editor paramétrico; reconstruirá ambientes; executará validações; calculará áreas e quantitativos; e integrará o modelo aprovado aos módulos de orçamento, planejamento, incorporação e documentos.

O produto possui dois casos de uso que parecem semelhantes na interface, mas têm riscos técnicos diferentes:

1. **Digitalizador de Plantas:** interpreta uma representação existente e a transforma em objetos editáveis.
2. **Gerador Inteligente:** sintetiza novas alternativas a partir do terreno, programa de necessidades e restrições.

O primeiro reduz trabalho manual com risco controlável por revisão. O segundo é um problema de otimização multiobjetivo, sujeito a legislação, julgamento de projeto e restrições conflitantes. Portanto, a entrega será progressiva: primeiro a fundação geométrica e o Digitalizador; depois validações e quantitativos; por fim o Gerador.

### 2.1 Resultado de negócio esperado

- Reduzir o tempo de transformar uma planta raster/PDF em modelo editável.
- Diminuir retrabalho na extração de ambientes, áreas e quantitativos preliminares.
- Criar uma fonte geométrica reutilizável por orçamento, planejamento e incorporação.
- Permitir estudos rápidos de massa e distribuição sem apresentar o resultado como projeto executivo.
- Formar um ativo de dados proprietário: correções humanas, regras versionadas e desempenho por tipo de documento.

### 2.2 Princípios não negociáveis

- Geometria confirmada é a fonte da verdade; a imagem original é evidência e referência.
- Toda inferência deve carregar confiança, origem, versão do modelo e histórico de revisão.
- Nenhuma norma ou regra municipal será embutida sem jurisdição, vigência e fonte identificáveis.
- O backend validará operações críticas; o cliente não será a única autoridade.
- Cálculos usarão unidades inteiras determinísticas, evitando divergência de ponto flutuante.
- O produto apoiará o responsável técnico, sem afirmar aprovação legal ou substituir autoria profissional.

## 3. Problema, oportunidade e contexto

### 3.1 Problemas atuais

- Plantas chegam em formatos heterogêneos: foto, PDF digital, escaneamento, croqui e desenho sem escala confiável.
- Redesenhar paredes, portas, janelas e ambientes consome tempo e cria divergência entre desenho, área e orçamento.
- Ferramentas genéricas de desenho não conhecem o contexto de obra, empreendimento, composição orçamentária e planejamento do ÒPURA.
- Reconhecimento automático sem revisão pode transformar erro visual em dado financeiro incorreto.
- Geração de layout sem regras versionadas tende a produzir alternativas visualmente plausíveis, porém inexequíveis ou incompatíveis com legislação.

### 3.2 Oportunidade do ÒPURA

O diferencial não é apenas vetorizar uma imagem. É converter o traçado em semântica construtiva e conectá-lo ao restante do ERP: parede com espessura e material; abertura hospedada em parede; ambiente com uso, área e perímetro; regra com evidência; quantidade com fórmula e versão; alternativa com justificativas e score.

### 3.3 Hipóteses de produto

| ID | Hipótese | Como validar |
|:------------------------------|:-----------------------------------|:-----------------------------------|
| H-01 | Usuários aceitam IA quando podem revisar por confiança e zona | Taxa de aceitação, rejeição e edição de candidatos |
| H-02 | Parede + abertura + ambiente cobrem a maior parte do ganho inicial | Tempo até modelo utilizável e percentual de correções |
| H-03 | Integração com quantitativos aumenta retenção mais que exportação isolada | Uso recorrente e conversão para orçamento |
| H-04 | Regras explicáveis geram mais confiança do que um único “aprovado/reprovado” | Uso de evidências, overrides e revalidação |
| H-05 | O gerador cria valor quando oferece alternativas comparáveis, não uma resposta única | Alternativas visualizadas, comparadas e adotadas |

## 4. Objetivos e não objetivos

### 4.1 Objetivos mensuráveis

| Objetivo | Meta de aceite para produção controlada |
|:----------------------|:--------------------------------------------------|
| Digitalização útil | Pelo menos 80% das plantas elegíveis chegam a um modelo revisável sem reinício manual |
| Eficiência | Mediana de 50% de redução no tempo até planta editável em relação ao redesenho manual |
| Topologia | Pelo menos 95% dos ambientes confirmados formam polígonos fechados sem auto-interseção |
| Área | Erro absoluto mediano menor ou igual a 2% após calibração e revisão |
| Confiabilidade | Zero publicação silenciosa de objetos de IA como confirmados |
| Rastreabilidade | 100% dos cálculos e validações reproduzíveis por versão de entrada e regras |

As metas de reconhecimento serão calibradas com conjunto de dados real do ÒPURA. Valores iniciais são gates de lançamento controlado, não promessa universal para qualquer qualidade de arquivo.

### 4.2 Não objetivos do primeiro ciclo

- Produzir projeto executivo, aprovação automática ou responsabilidade técnica.
- Substituir software BIM 3D completo.
- Fazer cálculo estrutural, hidráulico, elétrico ou de desempenho.
- Inferir com segurança dimensões ausentes sem referência de escala.
- Garantir leitura integral de manuscritos, plantas degradadas ou perspectivas fotográficas extremas.
- Exportar IFC semanticamente completo na primeira release.
- Treinar modelo fundacional próprio antes de haver volume e qualidade de dados suficientes.

## 5. Usuários e trabalhos a realizar

### 5.1 Personas primárias

| Persona | Necessidade central | Risco percebido | Valor entregue |
|:--------|:---------------------------------------------|:------------:|:------------:|
| Arquiteto/projetista | Redesenhar e testar alternativas rapidamente | Perder controle autoral ou precisão | Edição paramétrica, revisão e comparação |
| Engenheiro de orçamento | Obter áreas e quantidades rastreáveis | Orçar em cima de geometria errada | Quantitativos com versão e evidência |
| Incorporador/analista | Estudar aproveitamento e programa | Confundir estudo preliminar com aprovação | Cenários comparáveis e premissas explícitas |
| Coordenador de obra | Consultar geometria vinculada ao projeto | Trabalhar com versão desatualizada | Publicação controlada e histórico |
| Administrador da organização | Governar regras, permissões e consumo | Vazamento, custo e uso indevido | RLS, limites, auditoria e políticas |

### 5.2 Jobs to be done

- Quando recebo um PDF ou foto de planta, quero transformá-lo em objetos editáveis para não redesenhar tudo.
- Quando a escala está incerta, quero calibrá-la e conhecer a confiança para não confiar em áreas falsas.
- Quando uma parede ou abertura foi detectada incorretamente, quero corrigir em poucos gestos e ensinar o sistema sem interromper o trabalho.
- Quando estudo um terreno, quero comparar alternativas por área, circulação, iluminação e custo preliminar.
- Quando gero quantitativos, quero saber qual versão da planta e quais fórmulas os produziram.

## 6. Escopo e estratégia de releases

| Release | Objetivo | Conteúdo obrigatório | Gate de saída |
|:--------|:---------------------------------------------|:------------:|:------------:|
| R0 — Fundação | Estabelecer núcleo geométrico e versionamento | Projeto, níveis, unidades, paredes, aberturas, ambientes, snapshots, auditoria, editor básico | Operações determinísticas e testes geométricos aprovados |
| R1 — Digitalizador MVP | Converter imagem/PDF em modelo revisável | Upload, renderização, calibração, OCR, detecção, revisão por confiança e exportação PDF/PNG | Tempo de correção menor que desenho manual no piloto |
| R2 — Engenharia conectada | Entregar regras e quantidades | Pacotes de regras, evidências, overrides, áreas, perímetros, quantitativos e integração com orçamento | Reprodutibilidade e reconciliação de quantidades |
| R3 — Gerador beta | Produzir e ranquear alternativas | Terreno, recuos, programa, solver, alternativas, hard/soft constraints e comparador | Soluções válidas em conjunto de casos controlados |
| R4 — Interoperabilidade | Ampliar colaboração e formatos | DXF, IFC parcial, biblioteca avançada, colaboração em tempo real e APIs públicas | Round-trip e compatibilidade certificados por testes |

> **Fora do MVP.** Incluir o Gerador na primeira entrega aumentaria simultaneamente o risco de geometria, UX, regras e otimização. A recomendação é validar o ciclo “importar → corrigir → publicar → quantificar” antes de financiar síntese automática.

## 7. Experiência e fluxos do usuário

### 7.1 Fluxo principal do Digitalizador

1. Usuário cria um estudo e associa organização, empreendimento, obra e nível quando aplicável.
2. Envia PDF ou imagem; o sistema valida, armazena o original e cria representações processáveis.
3. Usuário seleciona página, recorta área útil, corrige rotação/perspectiva e define uma medida conhecida.
4. Pipeline extrai textos, cotas, linhas e símbolos e cria candidatos com confiança.
5. Interface apresenta zonas problemáticas primeiro e permite aceitar, corrigir, fundir, dividir ou rejeitar.
6. Núcleo geométrico fecha junções, hospeda aberturas e reconstrói ambientes.
7. Usuário revisa áreas e nomes, executa validadores e resolve avisos.
8. Uma versão imutável é publicada e pode alimentar quantitativos, orçamento e exportações.

![Fluxo do Digitalizador assistido](prd_assets/digitalizer_flow.png){width=90%}

### 7.2 Fluxo principal do Gerador

1. Usuário cadastra polígono do terreno, orientação, acessos, níveis e contexto.
2. Seleciona pacote de regras vigente e informa parâmetros que não puderam ser obtidos de fonte confiável.
3. Define programa de necessidades, adjacências, faixas de área, prioridades e elementos fixos.
4. Sistema valida contradições antes de consumir processamento.
5. Solver produz alternativas válidas sob regras duras e pontua regras brandas.
6. Usuário compara área, eficiência, circulação, fachada, iluminação aproximada e custo preliminar.
7. Alternativa escolhida vira uma ramificação editável, sem perder linhagem e premissas.

### 7.3 Estados da tela de processamento

- Preparando arquivo.
- Aguardando calibração obrigatória.
- Em fila, processando ou reprocessando região.
- Revisão necessária, com contagem por tipo e confiança.
- Modelo consistente, com avisos não bloqueantes.
- Publicado, com versão e integrações disponíveis.
- Falha recuperável, oferecendo diagnóstico e repetição idempotente.

### 7.4 Regras de UX

- Mostrar sempre unidade, escala e estado da versão no cabeçalho do editor.
- Diferenciar visualmente original, candidato de IA, objeto confirmado e conflito.
- Exibir confiança por faixa e causa, evitando falsa precisão decimal.
- Priorizar correção em lote quando os erros compartilham padrão.
- Nunca ocultar mudanças automáticas após um comando de reparo topológico.
- Manter desfazer/refazer local e histórico de versões publicado no servidor.
- Garantir uso por teclado nas ações essenciais e alvos compatíveis com telas e dispositivos modestos.

## 8. Requisitos funcionais

### 8.1 Projetos, fontes e calibração

| ID | Requisito | Prioridade | Release |
|:--------|:---------------------------------------------|:------------:|:------------:|
| RF-001 | Criar estudo com organização, vínculo opcional a obra/empreendimento, sistema de unidades e fuso | Must | R0 |
| RF-002 | Suportar múltiplos níveis e múltiplas folhas/fontes por estudo | Must | R0 |
| RF-003 | Importar PDF, PNG e JPEG; TIFF deve ser convertido no ingresso | Must | R1 |
| RF-004 | Validar tipo real, tamanho, páginas, malware e integridade antes do processamento | Must | R1 |
| RF-005 | Preservar original imutável e gerar derivados com checksum e metadados | Must | R1 |
| RF-006 | Permitir corte, rotação, deskew e correção de perspectiva com pré-visualização | Must | R1 |
| RF-007 | Calibrar escala por segmento conhecido; duas ou mais referências devem revelar inconsistência | Must | R1 |
| RF-008 | Bloquear área/quantitativo oficial quando a escala estiver ausente ou não confirmada | Must | R1 |

### 8.2 Reconhecimento e revisão assistida

| ID | Requisito | Prioridade | Release |
|:--------|:---------------------------------------------|:------------:|:------------:|
| RF-020 | Detectar candidatos a paredes, aberturas, textos, cotas e símbolos | Must | R1 |
| RF-021 | Associar confiança, região de origem, modelo e execução a cada candidato | Must | R1 |
| RF-022 | Manter candidatos separados do modelo confirmado até ação do usuário | Must | R1 |
| RF-023 | Permitir aceitar/rejeitar individualmente, por região, classe e faixa de confiança | Must | R1 |
| RF-024 | Exibir sobreposição do original com opacidade ajustável e modo antes/depois | Must | R1 |
| RF-025 | Permitir reprocessar somente uma região e preservar correções confirmadas fora dela | Must | R1 |
| RF-026 | Sugerir reparo de lacunas, linhas duplicadas, paredes quase paralelas e junções abertas | Must | R1 |
| RF-027 | Capturar o motivo de rejeição/correção para avaliação e aprendizado, conforme consentimento | Should | R1 |
| RF-028 | Detectar baixa qualidade e recomendar ações específicas antes de processar | Must | R1 |

### 8.3 Editor paramétrico 2D

| ID | Requisito | Prioridade | Release |
|:--------|:---------------------------------------------|:------------:|:------------:|
| RF-040 | Criar, mover, estender, dividir, unir e excluir paredes com snaps | Must | R0 |
| RF-041 | Representar parede por eixo, espessura, altura, tipo e material opcional | Must | R0 |
| RF-042 | Hospedar porta/janela em segmento de parede com offset, largura e orientação | Must | R0 |
| RF-043 | Preservar abertura ou solicitar decisão quando a parede hospedeira for alterada | Must | R0 |
| RF-044 | Disponibilizar seleção, multiseleção, propriedades, copiar/colar, desfazer/refazer e atalhos | Must | R0 |
| RF-045 | Suportar grades, ortogonalidade, ângulos, alinhamentos, guias e snaps configuráveis | Must | R0 |
| RF-046 | Manter coordenadas internas em milímetros inteiros e exibir unidade preferida | Must | R0 |
| RF-047 | Criar anotações e cotas vinculadas à geometria, não apenas texto solto | Should | R1 |
| RF-048 | Salvar rascunho automaticamente sem publicar nova versão a cada gesto | Must | R0 |

### 8.4 Ambientes, áreas e semântica

| ID | Requisito | Prioridade | Release |
|:--------|:---------------------------------------------|:------------:|:------------:|
| RF-060 | Derivar contornos de ambientes a partir da topologia de paredes e limites | Must | R0 |
| RF-061 | Identificar e explicar ambiente aberto, sobreposto ou auto-intersectante | Must | R0 |
| RF-062 | Nomear ambiente, definir uso, ocupação, acabamento e tags | Must | R1 |
| RF-063 | Calcular área, perímetro, área de abertura e áreas líquidas por política versionada | Must | R2 |
| RF-064 | Permitir limites manuais controlados sem romper a origem derivada | Should | R2 |
| RF-065 | Recalcular dependências de forma incremental após edição geométrica | Must | R1 |
| RF-066 | Comparar áreas entre versões e destacar variação por ambiente | Should | R2 |

### 8.5 Validação e regras

| ID | Requisito | Prioridade | Release |
|:--------|:---------------------------------------------|:------------:|:------------:|
| RF-080 | Executar pacote de regras por jurisdição, tipologia, vigência e versão | Must | R2 |
| RF-081 | Classificar resultado como aprovado, falhou, aviso, não aplicável ou dados insuficientes | Must | R2 |
| RF-082 | Mostrar elemento afetado, fórmula, entradas, limiar, fonte e ação sugerida | Must | R2 |
| RF-083 | Distinguir regras duras e brandas e impedir publicação conforme política | Must | R2 |
| RF-084 | Permitir override justificado, com responsável, data, evidência e permissão específica | Must | R2 |
| RF-085 | Revalidar somente regras impactadas por mudança de dependências | Should | R2 |
| RF-086 | Manter execução histórica reproduzível mesmo após atualização do pacote | Must | R2 |
| RF-087 | Permitir regras organizacionais adicionais sem alterar pacote oficial | Should | R2 |

### 8.6 Gerador Inteligente

| ID | Requisito | Prioridade | Release |
|:--------|:---------------------------------------------|:------------:|:------------:|
| RF-100 | Cadastrar terreno como polígono válido, frentes, norte, acessos e obstáculos | Must | R3 |
| RF-101 | Calcular envelope edificável a partir de recuos e restrições confirmadas | Must | R3 |
| RF-102 | Definir programa por ambiente, quantidade, área mínima/alvo/máxima e prioridade | Must | R3 |
| RF-103 | Definir adjacências desejadas, proibidas, circulação, fachada e elementos fixos | Must | R3 |
| RF-104 | Detectar premissas contraditórias antes de iniciar geração | Must | R3 |
| RF-105 | Produzir múltiplas alternativas com seed, solver, regras e tempo limite registrados | Must | R3 |
| RF-106 | Garantir validade das regras duras antes de apresentar uma alternativa como viável | Must | R3 |
| RF-107 | Pontuar alternativas por objetivos normalizados e pesos editáveis | Must | R3 |
| RF-108 | Explicar violações brandas, trade-offs e motivos do score | Must | R3 |
| RF-109 | Transformar alternativa em ramificação editável preservando linhagem | Must | R3 |
| RF-110 | Permitir fixar ambientes/elementos e regenerar somente o restante | Should | R3 |

### 8.7 Quantitativos, publicação e integrações

| ID | Requisito | Prioridade | Release |
|:--------|:---------------------------------------------|:------------:|:------------:|
| RF-120 | Gerar quantidades preliminares de parede, revestimento, rodapé, piso e aberturas | Must | R2 |
| RF-121 | Registrar fórmula, entradas, arredondamento, perdas e versão de cada resultado | Must | R2 |
| RF-122 | Mapear tipos geométricos para composições/itens do orçamento do ÒPURA | Must | R2 |
| RF-123 | Publicar snapshot imutável com notas, autor e dependências | Must | R1 |
| RF-124 | Comparar snapshots e emitir conjunto de alterações semânticas | Should | R2 |
| RF-125 | Exportar PDF e PNG com escala, legenda, versão e aviso de finalidade | Must | R1 |
| RF-126 | Exportar DXF em camadas previsíveis e unidades explícitas | Should | R4 |
| RF-127 | Exportar IFC parcial somente com declaração de cobertura semântica | Could | R4 |
| RF-128 | Emitir eventos para orçamento, planejamento, documentos e incorporação | Must | R2 |

### 8.8 Colaboração, governança e administração

| ID | Requisito | Prioridade | Release |
|:--------|:---------------------------------------------|:------------:|:------------:|
| RF-140 | Aplicar RBAC e RLS por organização, estudo e vínculo a obra | Must | R0 |
| RF-141 | Registrar trilha de auditoria para alterações, publicação, override e exportação | Must | R0 |
| RF-142 | Permitir comentários ancorados em objeto ou coordenada | Should | R2 |
| RF-143 | Evitar sobrescrita concorrente por revisão otimista e presença/lock de edição | Must | R1 |
| RF-144 | Administrar limites de arquivo, processamento, retenção e consumo por plano | Must | R1 |
| RF-145 | Permitir desativar uso de correções em datasets de melhoria por organização | Must | R1 |
| RF-146 | Disponibilizar painel de falhas, filas, versões de modelos e custo por execução | Must | R1 |

## 9. Regras de negócio e invariantes

### 9.1 Invariantes geométricos

- Uma versão publicada é imutável; correções geram nova versão.
- Cada abertura possui no máximo uma parede hospedeira na mesma versão.
- Abertura não pode ultrapassar os limites úteis da parede sem decisão explícita.
- Segmentos de parede não podem ter comprimento zero ou espessura não positiva.
- Ambientes oficiais devem ser polígonos simples, fechados e associados a um nível.
- Cotas e quantidades oficiais dependem de escala confirmada.
- Alterações na origem ou transformação da fonte invalidam candidatos derivados, não objetos já confirmados sem confirmação do usuário.

### 9.2 Unidades e precisão

- Persistir comprimento em milímetros inteiros; áreas em milímetros quadrados; ângulos em micros de grau ou representação racional definida pelo kernel.
- Converter para a unidade de exibição somente na borda da aplicação.
- Definir política única de arredondamento por domínio e persistir valor bruto e exibido.
- Operações booleanas e fechamento topológico devem usar tolerância explícita por versão do kernel.
- Checksums do snapshot devem incluir geometria canônica, propriedades relevantes, versão do kernel e política de unidades.

### 9.3 Responsabilidade e publicação

- Resultado gerado deve trazer “estudo preliminar assistido; requer validação de profissional habilitado”.
- O sistema não deve usar “aprovado pela prefeitura”, “conforme todas as normas” ou equivalentes.
- Regra não avaliada por ausência de dado deve aparecer como “dados insuficientes”, nunca como aprovada.
- Exports devem carregar identificador do snapshot e data de geração.

## 10. Arquitetura proposta

### 10.1 Visão geral

![Arquitetura lógica proposta](prd_assets/architecture.png){width=90%}

| Camada | Responsabilidade | Tecnologia/abordagem recomendada |
|:------------------------------|:-----------------------------------|:-----------------------------------|
| Shell ÒPURA | Navegação, organização, permissões e integrações | Aplicação web React/TypeScript existente |
| Editor 2D | Renderização, interação, seleção e feedback instantâneo | Canvas WebGL/SVG híbrido; comandos desacoplados do renderer |
| Kernel geométrico | Operações exatas, snapping, topologia, ambientes e diffs | Núcleo determinístico em Rust, compilado para WASM e serviço nativo |
| API de domínio | Comandos, queries, publicação, políticas e orquestração | Serviço tipado; autenticação e autorização centralizadas |
| Persistência | Modelos, versões, regras, jobs, auditoria e eventos | PostgreSQL/PostGIS via Supabase; JSONB apenas para extensões controladas |
| Objetos | Originais, tiles, previews, modelos e exports | Object storage com chaves por organização e URLs temporárias |
| Pipeline IA | Pré-processamento, OCR, detecção, vetorização e confiança | Workers Python isolados, fila idempotente e artefatos versionados |
| Gerador | Restrições, busca, pontuação e diversidade | Solver de restrições/otimização; ML inicialmente apenas para ranking opcional |
| Integrações | Orçamento, planejamento, DMS, incorporação e notificações | Outbox transacional + consumidores idempotentes |

### 10.2 Decisões arquiteturais

**ADR-01 — Geometria canônica independente do canvas.** O renderer não será o modelo de domínio. Todo gesto vira comando; todo comando é validado pelo kernel e produz eventos/diff.

**ADR-02 — Mesmo kernel no cliente e servidor.** O WASM oferece interação rápida; a execução servidor confirma operações críticas e publicação. A versão do kernel acompanha o snapshot.

**ADR-03 — Persistência híbrida.** Entidades consultáveis ficam normalizadas; a geometria canônica do snapshot também possui payload compacto versionado para reconstituição determinística. Não depender apenas de um grande JSON mutável.

**ADR-04 — IA propõe; domínio confirma.** Resultados de inferência residem em tabelas de candidatos. A promoção ao modelo exige comando auditável.

**ADR-05 — Solver antes de IA generativa.** Regras duras e geometria exigem determinismo. Modelos aprendidos podem sugerir adjacências e ranquear alternativas, mas não devem contornar o validador.

**ADR-06 — Outbox transacional.** Publicação e eventos de integração são confirmados na mesma transação; consumidores tratam duplicidade.

### 10.3 Fronteiras de serviço

- **Project Service:** estudo, níveis, vínculos, membros e metadados.
- **Model Service:** comandos geométricos, snapshots, branches e diffs.
- **Ingestion Service:** upload, sanitização, renderização e derivados.
- **Inference Service:** jobs, modelos, candidatos, confiança e artefatos.
- **Rules Service:** pacotes, execução, evidências, overrides e impacto.
- **Generation Service:** problemas, runs, alternativas, score e linhagem.
- **Quantity Service:** fórmulas, mapeamentos e snapshots quantitativos.
- **Export Service:** PDF/PNG/DXF/IFC parcial e manifestos.
- **Integration Service:** outbox e adaptadores para módulos ÒPURA.

No início, esses limites podem existir como módulos de um monólito modular e workers separados. Microserviços independentes só se justificam por isolamento de processamento, escala ou equipe.

## 11. Pipeline de digitalização e IA

### 11.1 Etapas

![Pipeline versionado de digitalização](prd_assets/inference_pipeline.png){width=95%}

1. **Ingresso seguro:** valida assinatura, limites, malware, checksum e duplicidade.
2. **Normalização:** renderiza página, gera tiles, remove bordas, corrige rotação e perspectiva.
3. **Qualidade:** mede resolução, blur, contraste, compressão, perspectiva e cobertura.
4. **OCR e cotas:** extrai textos e dimensões com caixas, confiança e alternativas.
5. **Segmentação/detecção:** identifica paredes, aberturas e símbolos por região.
6. **Vetorização:** converte máscaras/linhas em eixos e polígonos no sistema da imagem.
7. **Escala e transformação:** aplica matriz afim para coordenadas do modelo.
8. **Reparo topológico:** une extremidades, remove duplicidade e sugere junções.
9. **Semântica:** associa aberturas a paredes e infere ambientes candidatos.
10. **Revisão:** ordena incertezas e registra ações humanas.

### 11.2 Contrato do candidato

Cada candidato deve conter: `candidate_id`, `run_id`, `source_region`, `class`, `geometry_image`, `geometry_model`, `properties`, `confidence_band`, `confidence_components`, `model_version`, `preprocessor_version`, `evidence_refs`, `status`, `reviewed_by`, `reviewed_at` e `superseded_by`.

### 11.3 Confiança

A confiança exibida deve ser uma faixa calibrada — alta, média ou baixa — derivada de componentes observáveis: qualidade da imagem, probabilidade do detector, consistência com OCR/cotas, coerência geométrica e suporte topológico. O valor bruto pode ser armazenado para avaliação, mas a UI não deve sugerir precisão inexistente.

### 11.4 Estratégia de modelos

- Começar com componentes especializados e substituíveis, não um modelo monolítico.
- Usar visão clássica onde for determinística: deskew, Hough/linhas, morfologia, contornos e snapping.
- Usar detecção/segmentação treinada para classes visuais variáveis.
- Usar OCR com léxico técnico e pós-processamento de cotas.
- Não promover automaticamente candidato abaixo do limiar configurado.
- Manter registro de dataset, licença, modelo, parâmetros, métricas e rollback.

### 11.5 Reprocessamento e idempotência

`job_key = sha256(source_checksum + page + crop + transform + pipeline_version + parameters)`. A mesma chave deve reaproveitar resultado válido. Reprocessamento regional cria nova execução e marca candidatos anteriores da região como superados, sem apagar evidência histórica.

### 11.6 Dados de melhoria

- Correções só entram no conjunto elegível conforme política e consentimento da organização.
- Separar telemetria operacional de dataset de treinamento.
- Remover metadados pessoais e segredos visuais quando tecnicamente possível.
- Manter conjuntos de treino, validação e teste separados por projeto/organização para evitar vazamento.
- Executar avaliação por qualidade de documento, tipologia, idioma, escala e origem.

## 12. Kernel geométrico

### 12.1 Modelo canônico

- **Level:** origem Z, altura padrão e ordem.
- **Wall:** polyline de eixo, espessura, altura, joins e tipo.
- **Opening:** referência de parede/segmento, offset, largura, altura, peitoril, tipo e orientação.
- **Boundary:** segmento auxiliar para delimitação sem material físico.
- **Space:** face derivada do grafo planar, identificador estável e propriedades semânticas.
- **Annotation/Dimension:** âncoras geométricas e representação.
- **SourceTransform:** mapeamento versionado entre pixels/pontos PDF e milímetros do modelo.

### 12.2 Grafo e ambientes

Paredes e limites formam um arranjo planar. O kernel faz interseção, segmentação e snapping com tolerância; constrói half-edges; identifica faces internas; exclui face externa e buracos; e associa identidades de ambientes entre recalculações por sobreposição e vizinhança. A identidade não deve depender apenas da ordem de descoberta.

### 12.3 Comandos

| Grupo | Exemplos de comando | Saída |
|:------------------------------|:-----------------------------------|:-----------------------------------|
| Criação | AddWall, AddOpening, AddBoundary | Diff + objetos afetados |
| Edição | MoveVertex, SetThickness, ResizeOpening | Diff + invalidações |
| Topologia | JoinEndpoints, SplitWall, MergeWalls | Diff explícito e mapa de IDs |
| Revisão IA | AcceptCandidate, RejectCandidate, AcceptRegion | Promoção auditada |
| Versão | CreateBranch, SaveDraft, PublishSnapshot | Snapshot/hash/eventos |
| Reparação | CloseGap, RemoveDuplicate, ResolveIntersection | Prévia + confirmação |

Todo comando inclui `command_id`, `study_id`, `branch_id`, `base_revision`, `actor`, `timestamp`, `kernel_version` e payload validado. Repetir o mesmo `command_id` não pode duplicar efeito.

### 12.4 Concorrência

R0 usa revisão otimista por `base_revision`. R1 adiciona presença e bloqueio temporário por região/objeto. Colaboração simultânea baseada em CRDT só deve ser adotada se o piloto demonstrar necessidade; geometria topológica concorrente exige resolução semântica, não apenas merge textual.

## 13. Motor de regras

### 13.1 Estrutura da regra

Uma regra contém identificador estável, versão, pacote, jurisdição, tipologia, vigência, severidade, categoria, descrição, entradas, expressão, unidade, tolerância, mensagem, ação sugerida, referência documental e testes. Regras oficiais e organizacionais são camadas distintas.

### 13.2 Execução

- Resolver aplicabilidade antes de calcular resultado.
- Capturar valores de entrada e suas origens.
- Produzir evidência legível e geometria afetada.
- Manter `rule_version_id` na execução.
- Invalidar por grafo de dependências, não por reprocessamento total.
- Bloquear publicação somente conforme política da organização e severidade.

### 13.3 Versionamento e fonte

Normas técnicas e legislação municipal devem ser configuradas como conteúdo versionado, sujeito a revisão especializada. O PRD não presume que uma regra esteja completa apenas por citar uma norma. Cada pacote precisa de data de vigência, fonte, responsável pela transcrição, revisão e testes de exemplos limites.

### 13.4 Override

Override exige permissão, justificativa, objeto/regra afetada, evidência opcional, responsável, prazo ou versão de validade. A UI deve distinguir “regra passou” de “falha aceita por override”. Uma mudança material reabre o override quando as entradas relevantes mudarem.

## 14. Gerador de alternativas

### 14.1 Formulação

O problema combina geometria contínua e escolhas discretas. A abordagem recomendada é hierárquica:

1. Construir envelope e zonas válidas.
2. Resolver alocação aproximada de ambientes e adjacências em grade/grafo.
3. Refinar dimensões e corredores.
4. Gerar geometria de paredes.
5. Validar regras duras no kernel.
6. Pontuar objetivos brandos e diversidade.
7. Executar reparos limitados; descartar se persistir violação dura.

### 14.2 Função de score

`score_total = Σ (peso_i × score_normalizado_i) − penalidades`, com componentes versionados e visíveis. Exemplos: atendimento de área-alvo, eficiência de circulação, compacidade, adjacências, comprimento de fachada útil, iluminação/ventilação aproximada, repetição construtiva e custo preliminar.

Nenhum score compensa violação de regra dura. Pesos devem ser salvos por execução e alternativas devem apresentar componentes, não apenas nota única.

### 14.3 Diversidade

O gerador deve evitar cinco variantes quase idênticas. Após ordenar soluções válidas, aplicar distância por topologia de adjacências, posição relativa, acesso e distribuição de área. A interface deve poder explicar o principal diferencial de cada alternativa.

### 14.4 Falha honesta

Se as restrições forem inviáveis, o sistema retorna conflito mínimo ou aproximação útil: por exemplo, soma de áreas acima do envelope, adjacências incompatíveis ou largura mínima impossível. Não deve inventar solução nem relaxar regra dura sem consentimento.

## 15. Modelo de dados

### 15.1 Entidades principais

| Entidade | Campos essenciais | Observação |
|:------------------------------|:-----------------------------------|:-----------------------------------|
| `plan_studies` | id, org_id, project_id, name, unit_system, status | Raiz de autorização |
| `plan_levels` | id, study_id, name, elevation_mm, default_height_mm | Ordenação por estudo |
| `plan_sources` | id, study_id, storage_key, checksum, mime, metadata | Original imutável |
| `source_pages` | id, source_id, page_no, width_px, height_px, quality | Página processável |
| `source_transforms` | id, page_id, matrix, scale_status, references | Pixels/pontos para modelo |
| `model_branches` | id, study_id, parent_snapshot_id, revision | Linha de trabalho |
| `model_snapshots` | id, branch_id, revision, hash, kernel_version, payload | Publicação imutável |
| `model_objects` | id, snapshot_id/draft_id, type, geom, props | Índices e consultas |
| `inference_runs` | id, page_id, pipeline_version, job_key, status, metrics | Execução idempotente |
| `inference_candidates` | id, run_id, class, geom, confidence, status | Separado do confirmado |
| `rule_packages` | id, jurisdiction, type, effective dates, version | Conteúdo governado |
| `rule_definitions` | id, package_id, expression, inputs, severity, source | Regra executável |
| `validation_runs` | id, snapshot_id, package_versions, status | Execução reprodutível |
| `validation_results` | id, run_id, rule_version_id, status, evidence | Resultado por regra/objeto |
| `rule_overrides` | id, result_id, actor, reason, evidence, validity | Exceção auditada |
| `generation_problems` | id, study_id, input_snapshot, constraints, weights | Entrada canônica |
| `generation_runs` | id, problem_id, solver_version, seed, status, budget | Execução reproduzível |
| `generation_variants` | id, run_id, rank, score, components, snapshot_id | Alternativa imutável |
| `quantity_snapshots` | id, model_snapshot_id, policy_version, totals | Quantidades reproduzíveis |
| `audit_events` | id, org_id, actor, action, target, metadata, timestamp | Append-only |
| `integration_outbox` | id, aggregate, event_type, payload, status | Entrega idempotente |

### 15.2 Estratégia PostGIS

Manter `geometry` local em SRID interno/documental, sem fingir georreferenciamento. O terreno pode ter uma geometria geográfica separada quando coordenadas reais existirem. Índices espaciais devem apoiar seleção regional, interseção e impacto; cálculos canônicos continuam no kernel para evitar comportamento divergente entre banco, cliente e worker.

### 15.3 Identidade e hashes

- `snapshot_identity_hash`: identifica conteúdo canônico + versões de políticas críticas.
- `source_checksum`: identifica bytes originais.
- `job_key`: identifica processamento repetível.
- IDs de objetos persistem quando equivalência semântica for mantida; split/merge produz mapa de ancestralidade.

## 16. APIs e contratos

### 16.1 Convenções

- REST tipado para comandos e consultas; tarefas longas retornam `202 Accepted` e `job_id`.
- Idempotência obrigatória em upload finalizado, comandos, publicação, geração e exportação.
- `If-Match` ou `base_revision` para concorrência otimista.
- Erro no formato Problem Details, com `code`, `message`, `field_errors`, `trace_id` e `recoverable`.
- Paginação por cursor; URLs de objetos temporárias e de curta duração.

### 16.2 Endpoints essenciais

| Método e rota | Finalidade | Regras principais |
|:------------------------------|:-----------------------------------|:-----------------------------------|
| `POST /plan-studies` | Criar estudo | Valida organização e vínculo |
| `POST /plan-studies/{id}/sources:initiate` | Iniciar upload | Retorna sessão e limites |
| `POST /sources/{id}:complete` | Finalizar e verificar | Idempotente por checksum |
| `POST /source-pages/{id}/transforms` | Calibrar/corrigir fonte | Nova versão de transformação |
| `POST /source-pages/{id}/inference-runs` | Processar página/região | Retorna job |
| `GET /inference-runs/{id}` | Consultar progresso e diagnóstico | Percentual por etapa |
| `POST /model-branches/{id}/commands` | Aplicar lote atômico de comandos | Exige base_revision |
| `POST /model-branches/{id}:publish` | Criar snapshot imutável | Valida blockers e hash |
| `POST /snapshots/{id}/validations` | Executar pacotes de regras | Versões explícitas |
| `POST /validation-results/{id}/overrides` | Registrar exceção | Permissão e justificativa |
| `POST /snapshots/{id}/quantity-snapshots` | Calcular quantidades | Política e mapeamentos explícitos |
| `POST /generation-problems` | Definir problema | Valida contradições |
| `POST /generation-problems/{id}/runs` | Gerar alternativas | Seed e orçamento computacional |
| `POST /snapshots/{id}/exports` | Gerar artefato | Formato, escala e template |
| `GET /plan-studies/{id}/events` | Sincronizar mudanças | Cursor e autorização |

### 16.3 Exemplo de comando

```json
{
  "command_id": "01J...",
  "base_revision": 184,
  "kernel_version": "geom-1.3",
  "commands": [
    {
      "type": "AddWall",
      "payload": {
        "level_id": "lvl_01",
        "axis_mm": [[0, 0], [4200, 0]],
        "thickness_mm": 150,
        "height_mm": 2800
      }
    }
  ]
}
```

### 16.4 Eventos de domínio

- **`plan.snapshot.published.v1`:** consumidores: orçamento, DMS e notificações; conteúdo mínimo: org, study, snapshot, hash e actor.
- **`plan.quantities.calculated.v1`:** consumidores: orçamento e compras; conteúdo mínimo: snapshot, policy, totals e mapping status.
- **`plan.validation.completed.v1`:** consumidores: qualidade e workflow; conteúdo mínimo: snapshot, packages, blockers e warnings.
- **`plan.variant.selected.v1`:** consumidores: incorporação e planejamento; conteúdo mínimo: problem, variant, snapshot e scores.
- **`plan.export.ready.v1`:** consumidores: DMS e portal; conteúdo mínimo: snapshot, format, artifact e expiry policy.

Eventos não devem transportar o arquivo completo. Devem referenciar artefatos autorizados e incluir versão do schema. Dados sensíveis permanecem protegidos pela autorização do consumidor.

## 17. Segurança, privacidade e conformidade

### 17.1 Ameaças prioritárias

- Acesso cruzado entre organizações por falha de RLS.
- Arquivo malicioso, zip bomb, PDF complexo ou exaustão de recursos.
- Vazamento por URL de objeto longa, logs, thumbnails ou dataset.
- Prompt injection em texto de planta enviado a componentes multimodais.
- Escalada por override de regra, publicação ou exportação.
- Dependência comprometida em parsers CAD/PDF.

### 17.2 Controles

- RLS por `org_id`, testes negativos automatizados e contas de serviço com escopo mínimo.
- Upload direto para quarentena, varredura, limites de página/pixels/tempo e sandbox de parser.
- Criptografia em trânsito e repouso; segredos em cofre; rotação e auditoria.
- URLs assinadas curtas; nenhum storage key previsível exposto como permissão.
- Logs sem conteúdo visual, tokens ou dados pessoais; redaction na telemetria.
- Ações sensíveis com permissão separada: publicar, sobrescrever, override, exportar e administrar regras.
- Componentes de IA tratam texto extraído como dados não confiáveis, nunca como instrução.
- SAST, SCA, SBOM, verificação de imagens e política de atualização de dependências.

### 17.3 LGPD e retenção

- Definir finalidade, base legal e retenção por categoria: original, derivado, telemetria e correção.
- Permitir exclusão lógica imediata e purga assíncrona verificável, respeitando obrigações contratuais.
- Propagar exclusão a thumbnails, caches, candidatos e datasets ainda não congelados.
- Registrar consentimento/política para uso em melhoria de modelos.
- Disponibilizar exportação e trilha de acesso conforme política do ÒPURA.

## 18. Requisitos não funcionais

| ID | Categoria | Requisito alvo |
|:------------------------------|:-----------------------------------|:-----------------------------------|
| RNF-001 | Disponibilidade | API principal 99,9% mensal; workers degradáveis sem bloquear edição manual |
| RNF-002 | Latência | p95 de comandos simples até 300 ms no servidor, excluindo rede e render local |
| RNF-003 | Interação | Pan/zoom e arrasto a 45–60 fps em hardware-alvo para planta de referência |
| RNF-004 | Salvamento | Autosave reconhecido em até 2 s; nenhuma edição confirmada perdida após ack |
| RNF-005 | Processamento | Página típica entra em revisão em até 120 s no p95 do piloto |
| RNF-006 | Escala | Suportar inicialmente 20 mil objetos por nível e fontes até limites configurados |
| RNF-007 | Recuperação | RPO de dados confirmados próximo de zero; RTO do serviço principal até 4 h |
| RNF-008 | Acessibilidade | Fluxos essenciais compatíveis com teclado, foco visível e contraste adequado |
| RNF-009 | Compatibilidade | Duas últimas versões estáveis de navegadores corporativos suportados |
| RNF-010 | Observabilidade | 100% dos jobs e comandos com trace_id, duração, versão e resultado |
| RNF-011 | Determinismo | Mesmo snapshot + kernel/políticas produz mesmo hash, validação e quantidade |
| RNF-012 | Localização | pt-BR inicial; strings, unidades e formatos desacoplados para internacionalização |

Metas de desempenho devem ser confirmadas com três classes de documento: simples, típico e estresse. Não utilizar apenas arquivo sintético pequeno.

## 19. Observabilidade e operação

### 19.1 Métricas técnicas

- Taxa, latência e erro por endpoint/comando.
- Profundidade, idade e throughput de filas.
- Duração por etapa do pipeline e motivo de falha.
- Memória/CPU/GPU, custo por página e taxa de cache por `job_key`.
- Conflitos de revisão, falhas de autosave e tempo de publicação.
- Regras executadas, invalidações incrementais e divergência de determinismo.

### 19.2 Métricas de produto e IA

- Tempo do upload ao primeiro modelo publicável.
- Tempo ativo de revisão por área e por classe.
- Aceitação, rejeição e edição de candidatos por faixa de confiança.
- Precisão/recall de paredes e aberturas; erro de comprimento e área.
- Taxa de ambientes fechados sem reparo manual.
- Quantidade de alternativas geradas, válidas, comparadas e selecionadas.
- Uso de overrides, regras com dados insuficientes e recorrência de falhas.

### 19.3 Alertas

- Fila acima do SLO, falhas repetidas por versão de pipeline ou parser.
- Crescimento de acesso negado entre tenants.
- Aumento de candidatos aceitos e posteriormente desfeitos.
- Divergência entre kernel cliente e servidor.
- Custo por página acima de limite.
- Evento outbox não entregue após tentativas e janela definida.

## 20. Avaliação, testes e qualidade

### 20.1 Pirâmide de testes

- **Unitários:** operações geométricas, unidades, arredondamento, expressões e serializers.
- **Baseados em propriedades:** invariantes de polígonos, split/merge, reversão e idempotência.
- **Golden files:** snapshots conhecidos com hashes, áreas e diffs esperados.
- **Contrato:** API, eventos, schemas e compatibilidade de versões.
- **Integração:** upload até publicação; publicação até orçamento.
- **E2E:** fluxos por persona e condições de falha.
- **Segurança:** RLS, autorização negativa, arquivos hostis, SSRF e isolamento de worker.
- **Carga:** canvas, comandos, filas, grandes PDFs e geração concorrente.

### 20.2 Dataset de avaliação

O conjunto deve estratificar PDF vetorial, scan limpo, foto, baixa resolução, planta com hachura, idioma, espessura de linha, escala e tipologia. Projetos da mesma origem não podem atravessar treino e teste. Toda amostra precisa de direitos de uso e anotação auditável.

### 20.3 Métricas geométricas

| Classe | Métricas mínimas |
|:----------------------|:--------------------------------------------------|
| Parede | Precision/recall por segmento, distância média do eixo, erro de espessura, continuidade |
| Abertura | Precision/recall, parede correta, erro de posição/largura, orientação |
| Ambiente | Taxa de fechamento, IoU, erro de área/perímetro, identidade após edição |
| OCR/cota | CER/WER, acerto de valor/unidade, associação à geometria |
| Sistema | Tempo de revisão, comandos por correção, taxa de reinício manual |

### 20.4 Gates de release

- Nenhum blocker de segurança ou perda de dados aberto.
- Todos os invariantes geométricos cobertos por testes.
- RLS testada para cada tabela exposta.
- Migração e rollback ensaiados.
- Métricas do piloto atingidas por classe de documento, sem esconder subgrupo ruim na média.
- Responsáveis de produto e domínio aprovam mensagens, limites e finalidade do resultado.

## 21. Critérios de aceitação ponta a ponta

### CA-01 — Importação e escala

**Dado** um PDF suportado com uma dimensão conhecida, **quando** o usuário selecionar os dois pontos e informar 4,20 m, **então** o sistema deverá criar transformação versionada, mostrar a escala, recalcular candidatos e registrar evidência; quantitativos permanecerão bloqueados até a confirmação.

### CA-02 — Separação entre IA e modelo

**Dado** um processamento concluído, **quando** o usuário abrir o editor, **então** nenhum candidato será contabilizado como parede, ambiente ou quantidade oficial antes de aceitação explícita ou política aprovada de autoaceite para classe/faixa autorizada.

### CA-03 — Correção regional

**Dado** que uma região possui paredes incorretas, **quando** o usuário ajustar o recorte e reprocessar somente essa região, **então** correções confirmadas fora dela permanecerão intactas e os candidatos antigos dentro dela ficarão historicamente superados.

### CA-04 — Topologia e ambiente

**Dado** um pequeno vão entre duas paredes, **quando** o usuário aplicar “fechar lacuna”, **então** o sistema mostrará prévia, objetos afetados e tolerância; após confirmação, o ambiente será recalculado sem perder propriedades quando a equivalência for segura.

### CA-05 — Concorrência

**Dado** que dois usuários editam a mesma revisão, **quando** o segundo enviar comando incompatível, **então** a API rejeitará com conflito recuperável e retornará revisão atual e objetos afetados, sem sobrescrever silenciosamente.

### CA-06 — Regra explicável

**Dado** um pacote aplicável, **quando** uma largura mínima falhar, **então** o resultado mostrará valor medido, limite, unidade, elementos, fonte, versão e ação sugerida. Se faltar dado, o estado será “dados insuficientes”.

### CA-07 — Publicação e integração

**Dado** um modelo publicável, **quando** o usuário publicar, **então** um snapshot imutável e hash serão criados e o evento de publicação será gravado na mesma transação. Repetição com a mesma chave não duplicará efeitos.

### CA-08 — Quantidade reproduzível

**Dado** um snapshot, política e mapeamento, **quando** o cálculo for repetido, **então** valores brutos, exibidos e fórmulas serão idênticos. Mudança de política criará novo snapshot quantitativo.

### CA-09 — Geração inviável

**Dado** programa cuja soma de áreas e circulação excede o envelope, **quando** o usuário solicitar geração, **então** o sistema não apresentará solução como viável e explicará o conjunto de restrições conflitantes.

### CA-10 — Exportação

**Dado** um snapshot publicado, **quando** exportado para PDF, **então** o arquivo conterá escala ou indicação “sem escala”, unidade, identificador da versão, data e aviso de finalidade.

## 22. Integrações com o ÒPURA

### 22.1 Orçamento e suprimentos

- Tipos de parede, ambiente e acabamento podem mapear para composições.
- Quantidade importada deve permanecer vinculada a `quantity_snapshot_id`.
- Atualização de planta não altera orçamento aprovado silenciosamente; gera proposta de reconciliação.
- Divergências mostram criado, removido, alterado e impacto estimado.

### 22.2 Planejamento 4D/5D

- Objetos e ambientes recebem códigos EAP opcionais.
- Snapshot publicado pode produzir pacotes de trabalho preliminares.
- Futura ligação IFC reutiliza IDs persistentes e linhagem.

### 22.3 Incorporação e inteligência

- Variantes entregam áreas privativas/comuns preliminares conforme política definida.
- Indicadores de aproveitamento carregam premissas e não substituem quadros normativos oficiais.
- Comparador pode receber preço, custo e eficiência para análise, mantendo separação entre geometria e finanças.

### 22.4 DMS e portal

- Originais, snapshots e exports podem ser registrados no DMS com classificação e versão.
- Portal exibe apenas snapshots publicados e autorizados.
- Links públicos, se existirem, precisam de expiração, escopo e revogação.

## 23. Analytics e experimentação

### 23.1 Eventos de produto

`study_created`, `source_uploaded`, `scale_confirmed`, `inference_started`, `inference_completed`, `candidate_reviewed`, `repair_applied`, `snapshot_published`, `validation_viewed`, `override_created`, `quantities_sent`, `generation_started`, `variant_compared`, `variant_selected`, `export_requested`.

Eventos devem evitar coordenadas e conteúdo do desenho por padrão. Propriedades analíticas incluem classe do documento, faixa de tamanho, release, duração, resultado e flags de consentimento.

### 23.2 Experimentos permitidos

- Ordem de revisão por confiança versus por região.
- Visualização de candidatos por contorno versus preenchimento.
- Sugestão de correção em lote.
- Número e diversidade de alternativas.

Experimentos nunca devem mudar silenciosamente regra dura, cálculo oficial, segurança ou responsabilidade do resultado.

## 24. Migração, rollout e suporte

### 24.1 Ambientes e feature flags

- Desenvolvimento, homologação, piloto e produção separados.
- Feature flags por organização para pipeline, modelo, autoaceite, regras e gerador.
- Modelos e pacotes novos entram em shadow mode antes de afetar o usuário.

### 24.2 Piloto recomendado

| Fase | Amostra | Objetivo |
|:------------------------------|:-----------------------------------|:-----------------------------------|
| Interna | 20–30 plantas anotadas | Estabilidade do kernel e pipeline |
| Assistida | 3–5 profissionais, 50–100 plantas | Medir tempo e padrões de correção |
| Controlada | 10–20 organizações selecionadas | Operação, custo, segurança e retenção |
| Geral | Elegibilidade definida | Escala, suporte e monetização |

### 24.3 Rollback

- Reverter pipeline/modelo por flag sem invalidar resultados históricos.
- Desabilitar geração mantendo editor e snapshots disponíveis.
- Pausar consumidor de integração sem perder eventos outbox.
- Migrações de banco devem ser expand/contract e compatíveis durante deploy.

### 24.4 Suporte

Diagnóstico deve incluir trace, checksum, página, pipeline, qualidade, erro sanitizado e opção de enviar pacote técnico com consentimento. O suporte não deve pedir o arquivo por canais informais quando o produto puder compartilhar acesso auditado.

## 25. Riscos e mitigação

| Risco | Prob. | Impacto | Mitigação | Sinal antecipado |
|:----------------------|:----------:|:----------:|:----------------------------------------------|:----------------------|
| Falsa confiança em traçado | Alta | Alto | Revisão por confiança, gates e mensagens | Alto undo após aceitação |
| Escopo excessivo no MVP | Alta | Alto | Separar R1 de R3 e gates objetivos | Epics sem critério fechado |
| Kernel inconsistente | Média | Crítico | Núcleo compartilhado e golden files | Hash divergente cliente/servidor |
| Regras desatualizadas | Média | Alto | Pacotes versionados, vigência e revisão | Muitos overrides recorrentes |
| Custo de inferência | Média | Alto | Cache, processamento regional e limites | Custo/página crescente |
| Dataset enviesado | Alta | Alto | Estratificação e métricas por subgrupo | Queda em scans/fotos específicos |
| Interoperabilidade ruim | Média | Médio | Manifesto de cobertura e testes round-trip | Suporte por DXF/IFC corrompido |
| Responsabilidade indevida | Média | Crítico | Linguagem, logs e validação profissional | Usuário trata estudo como aprovação |
| Concorrência destrutiva | Média | Alto | Revisão otimista e locks | Conflitos e perda percebida |
| Vazamento multi-tenant | Baixa | Crítico | RLS negativa e storage segregado | Acesso negado/anomalia de tenant |

## 26. Dependências

- Identidade, organizações, RBAC/RLS e auditoria do ÒPURA.
- Storage seguro, antivírus e renderização de PDF.
- Serviço de filas e workers observáveis.
- Especialistas para anotação e revisão arquitetônica.
- Catálogo de tipos construtivos e composições do orçamento.
- Processo editorial para regras técnicas e municipais.
- Infraestrutura de feature flags, analytics e gestão de modelos.

## 27. Decisões pendentes para o kickoff

| ID | Decisão | Recomendação inicial | Responsável |
|:--------|:---------------------------------------------|:------------:|:------------:|
| DP-01 | Nome comercial do módulo | ÒPURA Planta Inteligente; subprodutos Digitalizador e Gerador | Produto/Marca |
| DP-02 | Cliente desktop ou web | Web primeiro; desktop somente se arquivos/desempenho exigirem | Engenharia |
| DP-03 | Renderer | Spike comparando canvas WebGL e SVG híbrido com 20 mil objetos | Frontend |
| DP-04 | Kernel Rust/WASM | Aprovar após prova de determinismo e custo de equipe | Arquitetura |
| DP-05 | Política de autoaceite | Desabilitada no piloto; habilitação por classe e organização | Produto/Risco |
| DP-06 | Limites de upload | Definir por plano após benchmark real | Produto/Operações |
| DP-07 | Primeiro pacote de regras | Escolher uma tipologia e município piloto | Domínio |
| DP-08 | Cobertura de DXF/IFC | Especificar entidades suportadas e round-trip | BIM |
| DP-09 | Uso de correções em treino | Opt-in organizacional explícito | Jurídico/Privacidade |
| DP-10 | Monetização | Medir custo/página e valor por estudo antes de preço final | Estratégia |

## 28. Backlog técnico inicial

### Épico E0 — Fundação de domínio

- Definir schema canônico, unidades, hashes e versionamento.
- Implementar comandos básicos e golden files.
- Criar branches, autosave, publicação e auditoria.
- Provar kernel no navegador e servidor com os mesmos resultados.

### Épico E1 — Ingestão

- Upload multipart, quarentena, checksum e limites.
- Render de PDF, thumbnails/tiles e análise de qualidade.
- Recorte, rotação, perspectiva e calibração.

### Épico E2 — Digitalização

- Baseline de linhas/contornos e OCR.
- Contrato de candidatos, fila idempotente e reprocessamento regional.
- Interface de revisão e telemetria de correções.

### Épico E3 — Editor e topologia

- Ferramentas de paredes/aberturas, snaps e propriedades.
- Grafo planar, ambientes e reparos.
- Undo/redo, conflitos e desempenho.

### Épico E4 — Publicação e exportação

- Snapshot, diff semântico, PDF/PNG e manifesto.
- Eventos outbox e integração inicial com DMS.

### Épico E5 — Regras e quantidades

- DSL segura, pacotes, execução, evidências e overrides.
- Fórmulas versionadas, mapeamento e reconciliação com orçamento.

### Épico E6 — Gerador

- Problema canônico, verificação de consistência e solver baseline.
- Score, diversidade, comparador, explicação e ramificação.

## 29. Definition of Ready e Definition of Done

### 29.1 Ready para desenvolvimento

- Fluxo e persona definidos.
- Requisito e critério de aceitação verificável.
- Contrato de API/evento e impacto de dados revisados.
- Estados de erro, permissão, auditoria e telemetria especificados.
- Dependências e dados de teste disponíveis.
- Especialista de domínio aprovou regras relevantes.

### 29.2 Done

- Código revisado, testes e análise de segurança aprovados.
- Telemetria, dashboards e alertas ativos.
- Migração e rollback testados.
- Documentação de suporte e limitações atualizada.
- Acessibilidade e desempenho verificados no hardware-alvo.
- Feature flag e plano de rollout configurados.
- Evidência de aceite anexada ao item de entrega.

## 30. Plano de descoberta e provas técnicas

### Spike A — Kernel

Implementar conjunto de 25 casos: junções T/L/X, paredes curvas futuras tratadas como fora de escopo, split/merge, aberturas próximas às pontas, ambientes com ilha, tolerâncias e undo. Critério: igualdade bit a bit de payload canônico entre navegador e servidor.

### Spike B — Canvas

Testar 5 mil, 10 mil e 20 mil objetos; seleção regional; pan/zoom; overlay raster em tiles; snapping e acessibilidade. Critério: interação compatível com RNF-003 no hardware-alvo.

### Spike C — Digitalização

Comparar pipeline clássico, detector especializado e composição híbrida em pelo menos 50 plantas estratificadas. Critério: ganho de tempo de revisão, não apenas métrica offline.

### Spike D — Solver

Resolver 10 programas pequenos com regras duras conhecidas e explicar inviabilidade. Critério: alternativas válidas, diversas e reproduzíveis sob seed.

### Spike E — Round-trip

Definir subconjunto DXF/IFC, exportar/importar em ferramentas-alvo e medir perda. Critério: manifesto de cobertura e erros conhecidos documentados.

## 31. Matriz de rastreabilidade de resultados

- **Candidato de parede:** fonte + execução de IA; requer pipeline, modelo e transformação; pode ser aceito, corrigido ou rejeitado.
- **Parede confirmada:** deriva de comando do usuário; requer kernel e revisão; editável em branch.
- **Ambiente:** deriva da topologia de objetos; requer kernel e snapshot; propriedades editáveis, contorno derivado.
- **Validação:** deriva de snapshot e regras; requer kernel e pacote/regra; não é editável, exigindo novo run ou override.
- **Quantidade:** deriva de snapshot, política e mapeamento; requer fórmula e arredondamento; mudança cria novo snapshot quantitativo.
- **Variante:** deriva de problema, solver e seed; requer solver, regras e pesos; deve ser ramificada para edição.
- **Export:** deriva de snapshot e template; requer exporter e formato; é artefato imutável e regenerável.

## 32. Critério de sucesso estratégico

O módulo será bem-sucedido se o ÒPURA converter uma entrada imperfeita em uma base geométrica confiável, revisável e conectada às decisões de engenharia. A métrica decisiva não é “a IA desenhou sozinha”, mas “o profissional chegou mais rápido a um modelo que consegue explicar, validar, quantificar e reutilizar”.

O Gerador deve ser avaliado com o mesmo rigor: ele não vence por produzir uma planta visualmente atraente, e sim por gerar alternativas válidas, diversas, comparáveis e transparentes quanto às premissas. Essa disciplina é o que diferencia uma demonstração de desenho automático de um componente confiável do ERP ÒPURA.

## Apêndice A — Matriz de permissões proposta

| Ação | Visualizador | Colaborador | Projetista | Aprovador | Administrador |
|:----------------------|:--------------:|:--------------:|:--------------:|:--------------:|:--------------:|
| Ver snapshot publicado | Sim | Sim | Sim | Sim | Sim |
| Ver rascunho | Não | Conforme convite | Sim | Sim | Sim |
| Editar geometria | Não | Limitado | Sim | Sim | Sim |
| Executar IA | Não | Conforme plano | Sim | Sim | Sim |
| Publicar snapshot | Não | Não | Conforme política | Sim | Sim |
| Criar override | Não | Não | Não | Sim | Sim |
| Administrar regras | Não | Não | Não | Não | Sim |
| Exportar | Conforme política | Conforme política | Sim | Sim | Sim |

## Apêndice B — Taxonomia de erros

- **`SOURCE_UNSUPPORTED` — Entrada:** PDF protegido ou formato inválido; orientar conversão segura.
- **`SCALE_REQUIRED` — Domínio:** área solicitada sem calibração; bloquear e abrir calibração.
- **`GEOMETRY_CONFLICT` — Geometria:** parede auto-intersectante; mostrar região e opção de reparar.
- **`REVISION_CONFLICT` — Concorrência:** base revision desatualizada; oferecer rebase/revisão assistida.
- **`INFERENCE_LOW_QUALITY` — IA:** imagem desfocada; recomendar nova fonte ou ajuste.
- **`RULE_INPUT_MISSING` — Regra:** pé-direito ausente; apresentar estado “dados insuficientes”.
- **`GENERATION_INFEASIBLE` — Solver:** programa excede envelope; explicar conflitos.
- **`EXPORT_PARTIAL` — Interoperabilidade:** objeto sem suporte no DXF/IFC; gerar manifesto e aviso.
- **`TENANT_ACCESS_DENIED` — Segurança:** recurso de outra organização; negar e auditar.
- **`JOB_RETRYABLE` — Operação:** worker indisponível; repetir com backoff e idempotência.

## Apêndice C — Checklist de readiness para piloto

- Dataset de avaliação aprovado e licenciado.
- Pelo menos 50 golden files geométricos.
- RLS e storage testados com tentativas cruzadas.
- Pipeline com rollback e shadow mode.
- Painel de fila, custo, falha e qualidade.
- Mensagens de responsabilidade validadas.
- Processo para feedback e correção de regra.
- Limites de arquivo e hardware-alvo publicados.
- Integração com orçamento protegida por reconciliação.
- Canal de suporte com acesso auditado.
- Critérios de saída do piloto assinados pelos responsáveis.

## Apêndice D — Glossário técnico

| Termo | Definição |
|:----------------------|:--------------------------------------------------|
| Branch | Linha editável derivada de um snapshot |
| Snapshot | Versão imutável e endereçável por hash |
| Candidate | Hipótese produzida pelo pipeline de IA |
| Kernel | Biblioteca determinística de geometria e topologia |
| Face | Região fechada encontrada no grafo planar |
| Hard constraint | Restrição cuja violação invalida alternativa |
| Soft constraint | Preferência que afeta score sem invalidar |
| Outbox | Registro transacional de eventos a entregar |
| Golden file | Caso de teste com saída canônica esperada |
| Shadow mode | Execução sem afetar resultado apresentado ao usuário |
| Round-trip | Exportar e reimportar preservando o subconjunto declarado |
| RLS | Políticas de segurança de linha por organização/usuário |
