# Aba Estrutural no ribbon da Planta Inteligente

> Plano e execução de 08/10/2026. Frente `aba-estrutural` (REGRA #8).

## Pedido (literal)

*"o menu arquitetura ficou um pouco misturado elementos voltados mais a arquitetura e outros mais a Estrutural. Vamos
criar um novo menu chamado estrutural. analise os elementos dentro de arquitetrura que são candidatos a migrar para a
nova aba Estrutral e faça uma sugestão"*

## Análise (o que era estrutural e onde estava)

- Arquitetura › Projeto › menu **Estrutural**: Eixo, Eixos automáticos, Pilares, Vigas, Lajes e Fundações automáticas.
- Arquitetura › Construir › **Componentes**, misturado com parede e esquadria: seções **Estrutura** (Pilar, Viga, Laje)
  e **Fundação** (Estaca, Bloco de coroamento, Viga baldrame).
- Analisar › Quantidades: **Armadura**.

Ficam onde estão, de propósito: escada, rampa, shaft e elevador (desenho da arquitetura); telhado; Conflitos e Tipos
(multidisciplinares); o grupo contextual "Estrutura" da aba Modificar.

## Decisões do usuário (08/10/2026)

1. Pilar, viga, laje e fundação manuais: **só na aba Estrutural** (saem de Arquitetura › Componentes).
2. Armadura: **nos dois lugares** (atalho na Estrutural, continua em Analisar › Quantidades).
3. Laje: **na Estrutural** (piso e forro do ambiente continuam em Arquitetura › Acabamentos).

## Execução

- `ABAS_DO_RIBBON`: `estrutural` logo depois de `arquitetura` (não aparece fora da planta, como Arquitetura).
- Aba Estrutural: **Malha** (Eixo, Eixos automáticos) · **Elementos** (`MenuComponentes familia="ESTRUTURA"`) ·
  **Lançamento automático** (Pilares, Vigas, Lajes, Fundações) · **Análise** (Armadura).
- `MenuComponentes`: família nova `ESTRUTURA` (grupos "Estrutura" e "Fundação"), fora de `CONSTRUCAO`.
- Arquitetura › Projeto fica com Reforma, Acabamentos e Vistas.
- Textos que apontavam "Arquitetura › Estrutural" (Armadura, Quantitativos, Exibir › Eixos) passaram a dizer "aba Estrutural".
- Testes: os do editor que chegavam às peças e aos lançamentos por Arquitetura abrem a aba Estrutural; novos casos para
  a ordem das abas, os grupos, a Armadura nos dois lugares e Arquitetura sem lançamento automático.
