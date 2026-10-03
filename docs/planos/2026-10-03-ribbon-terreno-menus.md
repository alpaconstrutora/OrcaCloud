# Aba Terreno do ribbon numa linha só

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 03/10/2026, com print da aba Terreno quebrada em duas linhas. Pedido, literal:

> menubar terreno esta com duas linhas.épossivel agrupar algo?

Proposta oferecida em duas opções; resposta do usuário: **"Lote à vista, resto em menus (Recomendado)"**.

## O que foi feito

A aba tinha 26 comandos em cinco grupos (Lote 9, Loteamento 7, Massa 4, Garagem 1, Topografia 5). Seguindo o que a
Arquitetura já faz desde 24/09/2026 (`MenuDoRibbon`, Ribbon.tsx):

- **Lote**, à vista: Terreno, Digitar, Sub-região, Divisa, Dados do lote e o menu **Documentos ▾** (Nomear vértices,
  Roteiro, SIGEF, CAR).
- **Implantação**: três menus — **Loteamento ▾** (Quadra, Lote, Via, Área pública, Lotear, Numerar, REURB), **Massa ▾**
  (Bloco, Estudo de massa, Produto, Gerar massa, Vagas — a Garagem entrou aqui) e **Topografia ▾** (Importar
  levantamento, Perfil, Drenagem, Eixo de projeto, Vias e greide).

Os comandos são os mesmos, com o mesmo rótulo, contagem, ajuda e motivo de desligado; só passam a custar um clique.

## Verificação

- Teste novo trava o arranjo (o que fica à vista, os quatro menus e o conteúdo de cada um); os testes que buscavam
  comandos agora dentro de menus passam pelo `botao()` (que abre o menu), como na Arquitetura.
- Medição no app real: a aba Terreno numa linha, com a barra lateral aberta.
