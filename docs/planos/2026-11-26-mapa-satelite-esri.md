# Mapa: satélite (Esri World Imagery) — 26/11/2026

## Pedido

- *"pergunta: é possivel inserirnos visão via satelite? estamos usando o open street maps e ele nao tem imagem por
  satelite? se nao qual alternativa para complementarmos gratuitamente?"* → comparativo de licenças (EOX Sentinel-2
  só não comercial e 10 m; Esri sem chave sem respaldo para produto comercial; Esri pela ArcGIS Location Platform,
  Google e Mapbox com cota grátis) → *"siga com a Esri"*.

## O que entrou

- Fonte `SATELITE` em `utils/blueprintMapaDeFundo.ts` (por baixo de ruas e relevo): World Imagery pelo serviço COM
  chave `ibasemaps-api.arcgis.com/.../World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false&token=…`
  (CORS `*` — vira textura no 3D). Créditos do item World Imagery (conferidos 26/11): "Powered by Esri · Esri,
  Vantor, Earthstar Geographics, and the GIS User Community".
- A chave: `VITE_ARCGIS_API_KEY` (chave de navegador; restringir por referrer no painel da Esri). Sem ela, a linha
  "Mapa: satélite" das Camadas fica desligada dizendo por quê, e o editor não a baixa.
- Onde: Camadas › Terreno (planta 2D e textura do relevo no 3D) e a aba "Satélite" do "Desenhar no mapa".
- Créditos do mapa no 3D (na caixa dos créditos da Maquete, canto inferior esquerdo) — antes o 3D não os mostrava.
- RECUO quando falta imagem: medido em 26/11 — interior (MT, BA, AM) só até o zoom 17, MG/PR até o 18, cidades até o
  19. Com `blankTile=false` o servidor devolve 404 em vez do ladrilho "Map data not yet available"; planta e 3D caem
  para o pai (`ladrilhoAcima`, até `NIVEIS_DE_RECUO` = 3).

## Estado

- [x] Testes: mapa de fundo 26 (RED → GREEN), Camadas (satélite sem chave desligado com motivo), suítes atingidas +
  travas + canvas 554/554; `tsc` limpo.
- [x] Prova local (sem chave real): pedidos ao servidor com chave atendidos com o ladrilho público da Esri — 3D:
  42 ladrilhos z19 → 404 → 16 pais z18, foto sobre o relevo, créditos no canto; 2D: o mesmo, sob o lote.
- [ ] O usuário cria a conta na ArcGIS Location Platform, a API key (privilégio Basemaps, referrers do app) e põe
  `VITE_ARCGIS_API_KEY` na Vercel (Production + Preview); o satélite liga no deploy seguinte. Depois: prova logada.
