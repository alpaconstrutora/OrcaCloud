# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Equipe interna do grupo Alpa** (administração, RH, financeiro, suprimentos, engenharia):
  opera a ÒPURA no computador, o dia todo. Perfis `ADMIN` e `USER`.
- **Públicos externos, pelo celular, por portais próprios:** colaborador de obra
  (Portal do Colaborador, por link sem conta), cliente/comprador, fornecedor,
  corretor, investidor e síndico. Perfis `CLIENT`, `SUPPLIER`, `BROKER`, `INVESTOR`.
- **Colaborador de obra** (o público do Portal do Colaborador): pedreiro, servente,
  mestre de obras. Usa o celular no canteiro, muitas vezes ao sol e perto de colegas;
  entra pelo link que o RH manda. A tarefa mais frequente é conferir o holerite.

## Product Purpose

A ÒPURA é a plataforma operacional da construção civil e do mercado imobiliário:
orçamento (SINAPI/CUB), planejamento e diário de obra, financeiro, fiscal (NF-e),
suprimentos, RH/folha, comercial e locação, planta 2D/3D, e os portais externos.
Sucesso é a operação inteira de uma construtora rodar num lugar só, e cada público
externo resolver o que precisa sem ligar para o escritório.

## Positioning

Construída por dentro de uma construtora em operação (Alpa), com as regras de obra,
folha e fiscal brasileiras como domínio, não como integração.

## Operating Context

- Multiempresa: cada organização (construtora, SPE, condomínio, pessoa física) é um
  inquilino isolado por RLS. Hoje as 7 organizações cadastradas são do grupo Alpa.
- Portais externos abrem por link com token (sessão anônima) ou por e-mail e senha;
  toda leitura de portal é por RPC que recorta pelo token.
- O Portal do Colaborador é PWA no navegador do celular, sem conta.

## Capabilities and Constraints

- Holerite no portal: só folha FECHADA (RPC por token).
- Folha nasce na organização em que o colaborador é registrado.
- Vocabulários de status vêm de CHECK do banco; a tela traduz (ver
  `utils/portalColaboradorTextos.ts`).
- Regras obrigatórias do projeto: `CLAUDE.md` (seletor de organização é autoridade,
  "obra" nunca misturada com orçamento/planejamento, guia de UI unificado).

## Brand Commitments

- **ÒPURA** é a marca da plataforma (título do app, PWA). "Academia ÒPURA" é o nome
  da área de cursos e **se mantém** dentro dos portais (decisão do usuário, 26/10/2026).
- **Portais externos levam a marca da organização do usuário**, não a da ÒPURA:
  o logo vem de `organizations.logo_url` (decisão do usuário, 26/10/2026, para o
  Portal do Colaborador). Logos cadastrados variam de formato (símbolo quadrado da
  Alpa; logo horizontal com texto preto da SPE), sempre sobre fundo branco.
- **Paleta da Alpa** (manual de marca enviado pelo usuário, 26/10/2026), adotada no
  Portal do Colaborador para todas as organizações:
  laranja `#FF884C`, off-white `#EDEDE8`, cinza-azulado `#808EA1`, grafite `#4B4B4D`,
  branco `#FFFFFF`. Símbolo: dois retângulos arredondados entrelaçados por uma diagonal.

## Evidence on Hand

- Logo da Alpa: horizontal (símbolo laranja + "ALPA Construtora e Incorporadora")
  e símbolo isolado, em `organizations.logo_url`; manual de cores em PDF (enviado
  pelo usuário, não versionado).
- Não há depoimentos, métricas de uso nem clientes externos à Alpa: não inventar.

## Product Principles

1. **Quem está fora do escritório não liga para o escritório:** o portal responde
   sozinho (estado de carregando, erro com saída, vazio que orienta).
2. **A voz do usuário, não a do banco:** datas, status e termos como a pessoa fala.
3. **O que o usuário vê na prévia é o que ele vê de verdade:** mesmo caminho, mesmo
   token.
4. **Dinheiro é privado por padrão** em tela de celular usada em público.

## Accessibility & Inclusion

Público de obra: leitura ao sol, dedos grossos, letramento variado. Contraste
≥ 4,5:1 no texto, alvos de toque ≥ 44px, nada dito só por cor, frases curtas.
