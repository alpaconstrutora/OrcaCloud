# Planta Inteligente › Terreno › Curvas de nível (topografia)

## Pedido original

> avalie esse PRD e inclui-lo na planta inteligente
>
> (anexo: `PRD_Modulo_Mapas_Topograficos_OPURA (1).md`, v1.0, 30/08/2026 — o
> mesmo PRD já reconciliado em
> `docs/planos/2026-08-30-reconciliacao-prd-mapas-topograficos.md`)

Sessão `5a9ec3fd-30ee-4723-b0a7-4bee36bd0996` · 2026-09-10.

## O que este pedido decide

A reconciliação de 30/08 terminou numa pergunta de portão (§7): **qual decisão
de negócio muda por causa da curva de nível?** — com duas respostas possíveis,
(a) *briefing de gleba dentro do Market Intelligence* ou (b) *implantação,
acessos e corte/aterro dentro da Planta Inteligente*. "Incluí-lo na planta
inteligente" responde **(b)**. Este plano registra a resposta e executa a
primeira fatia dela.

## Avaliação do PRD, atualizada em 10/09 (o que mudou desde 30/08)

A reconciliação de 30/08 continua valendo por inteiro (DR-01…DR-08, E-01…E-15).
Três coisas mudaram no produto desde então e mudam o tamanho do trabalho:

| Em 30/08 | Em 10/09 (lido em `origin/main` `5967f5b2`) | Consequência |
|:---|:---|:---|
| Kernel `0.8.0`, **sem** georreferência | Kernel **`0.25.0`**, com `BlueprintModel.georreferencia` (lat/long, cota, giro do norte, E/N+CRS) desde 07/09 (`f23c765f`) | A dependência que a §3.3(b) apontava como "entrega própria não orçada" **já existe**. O caminho (b) ficou alcançável. |
| Roadmap BIM na Etapa 1 | Seis etapas fechadas (`2026-09-09-status-planta-inteligente-bim.md`); corte, elevações e 3D existem | Há onde a topografia aparecer além da planta baixa: perfil no CORTE e malha no 3D (fatias futuras). |
| Nenhuma fonte de elevação medida | Medido de fora hoje: **Open-Meteo** (Copernicus GLO-90, 90 m) responde com CORS liberado; **OpenTopoData** (SRTM 30 m) responde **sem** CORS — só serve atrás de Edge Function | O adaptador remoto do navegador só pode ser o Open-Meteo hoje; SRTM 30 m exige uma function. |

O que **não** mudou e continua sendo a limitação central: **DEM público (30–90 m)
não resolve lote urbano.** Um lote de 12 × 30 m cabe dentro de UM pixel. Por
isso, dentro da Planta Inteligente, a fonte que serve de verdade é o
**levantamento do topógrafo** — os pontos cotados que todo projeto real tem —
e o DEM remoto entra como segunda fonte, para gleba, com a recusa da DR-08.

Aviso de licença (E-12, decisão jurídica pendente): a API do Open-Meteo é
gratuita para uso **não comercial**; uso comercial exige assinatura. O dado
(Copernicus DEM) é livre com atribuição. O adaptador expõe isso na proveniência
e o piloto é interno.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-10 | Quais fontes nesta fatia? | **Pontos cotados + Open-Meteo GLO-90** (navegador), com a recusa da DR-08 |
| 2026-09-10 | Onde a topografia aparece? | **Planta baixa + perfil no CORTE + malha no 3D** — as três nesta fatia |
| 2026-09-10 | O que fazer ao terminar? | **Publicar em `main` e aplicar a migration** (`db query -f`), provar de fora |

## Decisões de arquitetura (minhas, registradas)

| Data | Pergunta | Decisão | Por quê |
|---|---|---|---|
| 2026-09-10 | Onde a topografia vive? | **Fora do payload canônico**, em tabela própria por estudo, versionada e imutável (`blueprint_study_topografia`) | Mesma razão da zona urbanística e da planta de fundo: é dado do MUNDO, não geometria do desenho; gravá-la no snapshot mudaria o hash porque alguém amostrou um DEM. E é grande (milhares de cotas). |
| 2026-09-10 | Quais fontes no MVP? | **Duas**: `PONTOS_COTADOS` (levantamento, TIN) e `OPEN_METEO_GLO90` (DEM remoto) | A primeira é a que serve lote; a segunda é a única chamável do navegador hoje. Mesmo pipeline (grade → curvas) para as duas. |
| 2026-09-10 | Processar onde? | **No navegador**, em TS puro (`utils/`), com o resultado + hashes persistidos | Desvio declarado do PRD §13.5. Volume dentro do lote é pequeno (teto de 10.000 nós); Edge Function entra quando o SRTM 30 m entrar (é a mesma hora em que uma function passa a ser necessária). Reprodutibilidade fica garantida pelos hashes de entrada e resultado (CA-010), não pelo lugar onde rodou. |
| 2026-09-10 | Recusa por resolução (DR-08)? | **Sim**: fonte remota é recusada quando o lado menor do lote tem menos de **3 células** da fonte | Com GLO-90 isso é 270 m. Abaixo disso a curva é ficção gráfica. A mensagem ensina o caminho: pontos cotados. |
| 2026-09-10 | Unidade | Metros para cota, mm inteiro no desenho. Sem pés (DR-06). | |
| 2026-09-10 | Exportação | **SVG e CSV** com fonte, data, algoritmo e o aviso do RF-020 embutidos. KML/DXF fora (E-03). | |
| 2026-09-10 | Imutabilidade | A tabela **não concede UPDATE** a `authenticated` — versão gerada não se edita, só se gera outra ou se apaga | RN-005 no nível do schema. |

## Plano

### F1 — Motor puro (`utils/blueprintTopografia.ts`)
**O que muda:** grade regular sobre a caixa do lote, marching squares com
`nodata`, união de segmentos, recorte no anel do lote, níveis e sugestão de
equidistância (RF-009), estatísticas (RF-013), TIN (Bowyer–Watson) para pontos
cotados, conversão local→lat/long pela georreferência, hashes de entrada e
resultado, recusa por resolução.
**Como sei que terminou:** `__tests__/blueprintTopografia.test.ts` com as
fixtures do PRD §20.2 — plano (zero curvas), rampa (paralelas), cone (anéis
fechados concêntricos), sela, `nodata`, lote côncavo, determinismo do hash,
recusa de lote pequeno com DEM.

### F2 — Fontes de elevação (`utils/blueprintElevacaoProvedores.ts`)
**O que muda:** registro de fontes com proveniência (RF-007): resolução,
referência vertical, dataset, licença, atribuição, classe. Adaptador Open-Meteo
em lotes de 100 coordenadas, com `fetch` injetável.
**Como sei que terminou:** teste com `fetch` falso prova o particionamento, a
ordem das cotas e o erro seguro em falha do provedor (CA-009).

### F3 — Persistência (`aplicar_20270921000005_blueprint_topografia.sql`, `services/blueprintTopografiaService.ts`, `types/blueprint.ts`)
**O que muda:** tabela versionada e imutável, FK composta ao estudo, RLS
`is_org_member`, sem UPDATE. Serviço `listar/criar/apagar`.
**Como sei que terminou:** migration passa em `segurancaMigrations.test.ts` e
`migrationsPrefixo.test.ts`; aplicada com `db query -f` e conferida de fora.

### F4 — Hook (`hooks/useBlueprintTopografia.ts`)
**O que muda:** estado da fonte, pontos cotados, equidistância, qualidade;
`gerar()` orquestra grade → fonte → curvas → hashes → persistir; lista de
versões; degrada sem a migration como a zona urbanística.
**Como sei que terminou:** editor abre sem a tabela e sem erro; com a tabela,
gerar cria versão e recarregar a traz de volta.

### F5 — Painel (`components/blueprint/PainelTopografia.tsx`) + canvas
**O que muda:** seção "Curvas de nível" dentro do painel Terreno (slot, como a
zona): fonte, pontos cotados (tabela §6.9), equidistância com sugestão,
qualidade, Gerar, estatísticas, proveniência, aviso RF-020, versões, exportar.
Canvas desenha curvas (mestras mais grossas, com cota) e pontos cotados; toggle
"Curvas de nível" no menu Exibir.
**Como sei que terminado:** `check-ui-standard.sh` limpo; conferido por print no
app; a curva clicada mostra a cota (RF-012) — fatia posterior se não couber.

### F6 — Exportação (`utils/blueprintTopografiaExport.ts`)
**O que muda:** SVG (curvas, limite, cotas nas mestras, título, escala, norte
quando há giro, aviso e proveniência em `<metadata>` e em texto) e CSV da grade
(RF-018). Download pelo mesmo `baixarArtefatos` das outras exportações.
**Como sei que terminou:** teste abre o SVG e o CSV e encontra fonte, data,
algoritmo e o aviso.

### F7 — Perfil do terreno no CORTE (`utils/blueprintCorte.ts`, `ElevationCanvas.tsx`)
**O que muda:** `projetarCorte` recebe opcional `terreno: { cotaEmM(p), cotaZeroM }`
(dado do mundo entra como parâmetro, nunca no modelo) e devolve
`perfilDoTerreno` — pedaços `{u,v}` amostrados ao longo do plano de corte, com o
`u` ABSOLUTO (armadilha nº 1 do plano de 05/09) e a inversão exata
`p = u·base.u + (corte.a·d)·base.d`. `nodata` quebra a polilinha, não interpola.
`bboxDoCorte` inclui o perfil; **`linhaDoSolo` continua sendo o piso**. O canvas
desenha o perfil logo após a linha do solo, com hachura de terra até `vMin`.
`cotaZeroM = georreferencia.elevacaoM`; sem ela, a cota média do levantamento,
com aviso.
**Como sei que terminou:** teste em `blueprintCorte.test.ts` com um plano
inclinado conhecido: o `v` do perfil nos extremos bate com a conta à mão; sem
terreno, a projeção é byte a byte a de antes.

### F8 — Malha do terreno no 3D (`utils/blueprintTopografia.ts:malhaDaGrade`, `Blueprint3DViewer.tsx`, `blueprint3dEnquadramento.ts`)
**O que muda:** malha indexada em números crus (sem `THREE`, testável fora do
`@ts-nocheck`), em coordenadas de mundo SEM negar `y` (padrão `geometriaDaAgua`),
células com `nodata` sem triângulo, decimada a ≤ 20 mil triângulos. O viewer
troca o plano chato pela malha quando há versão selecionada; a grade do chão
desce abaixo do ponto mais baixo. `enquadramentoDoModelo` ganha o relevo e
passa a mover `topo/fundo` (hoje o lote só toca X/Z).
**Como sei que terminou:** caso novo em `blueprint3dEnquadramento.test.ts` (uma
colina de 8 m entra na caixa); teste de `malhaDaGrade` (contagem de triângulos,
`nodata` não gera triângulo, `minY/maxY`).

## Fora desta fatia (declarado)

- Walk acompanhar o relevo (`Percorrer` força o olho a 1,6 m do zero) e sombra
  numa malha de 300 m — próxima fatia.
- SRTM 30 m / NASADEM via Edge Function `terrain-elevation` (com gate próprio,
  REGRA #7 pergunta 3) — entra quando a licença dos provedores for decidida.
- Corte e aterro, declividade, perfil por linha, KML/DXF, aprovação técnica,
  notificações — Fase 2/3 do PRD.
- Geometria em `commercial_properties` (§3.3a da reconciliação) — fundação de
  outro módulo.
- Clicar numa curva para ver a cota — a cota já vai escrita nas mestras.

## Estado

- [x] F1 — motor puro + testes (`utils/blueprintTopografia.ts`, 35 casos)
- [x] F2 — fontes de elevação + teste com fetch falso (8 casos)
- [x] F3 — migration + serviço + tipo
- [x] F4 — hook (`hooks/useBlueprintTopografia.ts`)
- [x] F5 — painel + canvas + toggle "Curvas de nível" em Exibir
- [x] F6 — exportação SVG/CSV + teste (7 casos)
- [x] F7 — perfil no corte (`perfilDoTerreno`, 5 casos)
- [x] F8 — malha no 3D + enquadramento (3 casos)
- [x] Suíte (251 arquivos, 3.665 testes, 0 falhas), typecheck limpo, `check-ui-standard.sh` limpo nos 7 `.tsx` tocados
- [x] Conferência por print — harness `docs/spikes/topografia/` (componentes REAIS: canvas da planta + painel, `ElevationCanvas` no corte, `Blueprint3DViewer`), 5 vistas sem erro de console. Dois achados só do print: o campo de cota em `w-14` cortava "100,60" (→ `w-16`) e o placeholder da equidistância saía "0.5" (→ "0,5"). ⚠️ Não foi dirigido o app COM LOGIN (a senha do agente de leitura não fica gravada) — ver "Verificação" abaixo para o roteiro.
- [x] Migration aplicada (`db query -f`) e conferida de fora — ⚠️ achado: os privilégios padrão do Supabase davam ALL a `anon`/`authenticated`; `REVOKE … FROM PUBLIC` não os alcança. Corrigido na própria migration (`REVOKE … FROM PUBLIC, anon, authenticated`) e reaplicado: `authenticated` = SELECT/INSERT/DELETE, `anon` = nada
- [ ] Publicado (`git push origin HEAD:main`) e provado com `conferir-producao.sh`

## Verificação

1. Desenhar um lote fechado (ferramenta Terreno).
2. Fonte **Pontos cotados**: "Usar vértices do lote", digitar cotas diferentes
   (ex.: 100, 101, 103, 102), Gerar → curvas paralelas atravessando o lote,
   estatísticas coerentes (mín/máx = as cotas digitadas).
3. Fonte **Open-Meteo**: sem georreferência → aviso; com lat/long e lote pequeno
   → recusa com a mensagem da DR-08; com lote grande (≥ 270 m) → gera.
4. Gerar duas vezes com os mesmos parâmetros → mesmo `hash_resultado`.
5. Recarregar a página → versão volta; escolher outra versão troca as curvas.
6. Exportar SVG e CSV → abrir fora e achar o aviso e a fonte.
7. Menu Exibir › "Curvas de nível" desliga a camada.
