---
type: módulo
title: "Planta Inteligente: kernel geométrico e editor 2D/3D"
description: O kernel geométrico próprio (utils/blueprintKernel) — modelo canônico em milímetros inteiros, ids determinísticos × uids de identidade, comandos puros com invariantes, serialização canônica com hash SHA-256 — e como o editor (Konva 2D, Three.js 3D) só emite intenção. Estudos, ramos, rascunho e snapshots publicados, colaboração em tempo real sem CRDT, importação DXF/DWG/IFC/Collada e exportação com escala e cobertura declarada.
tags: [blueprint, planta, geometry-kernel, canonical-hash, commands, konva, threejs, ifc, dxf, collaboration]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-78d737f2312d9fd11a2242c6
    resource: repo://hooks/useBlueprintEditor.ts
  - id: openwiki-source-e8aa18139f731c39fd904137
    resource: repo://services/blueprintService.ts
  - id: openwiki-source-c0492ca72308865f04b89e97
    resource: repo://utils/blueprintColaboracao.ts
  - id: openwiki-source-796e921dd9a07358c926f6b4
    resource: repo://utils/blueprintExport.ts
  - id: openwiki-source-5ec84ceee67692090c1be8a2
    resource: repo://utils/blueprintIfc.ts
  - id: openwiki-source-09ac9279b02e8cf5fee45edb
    resource: repo://utils/blueprintKernel/canonical.ts
  - id: openwiki-source-6fd95f48c213cffd02453a09
    resource: repo://utils/blueprintKernel/commands.ts
  - id: openwiki-source-b12933e59d7152eb4e455d37
    resource: repo://utils/blueprintKernel/index.ts
  - id: openwiki-source-8c9027abe34f40befb77ad31
    resource: repo://utils/blueprintKernel/model.ts
  - id: openwiki-source-f690cf45e855059a823baa4d
    resource: repo://utils/blueprintKernel/units.ts
  - id: openwiki-source-469bb29a602729bbbd7967af
    resource: repo://utils/colladaParaKernel.ts
  - id: openwiki-source-8386944dfb73dd0e584dd774
    resource: repo://utils/ifcParaKernel.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Planta Inteligente: kernel geométrico e editor 2D/3D

A Planta Inteligente é um editor de plantas e modelo de edificação dentro do
app. O coração é um **kernel geométrico próprio** em TypeScript
(`utils/blueprintKernel/`, ~28 mil linhas), nascido como "braço TypeScript" de
um spike que comparava com Rust/WASM. As disciplinas e geradores que rodam sobre
ele estão em [Disciplinas e geradores](./disciplinas-e-geradores.md).

## Princípio: o renderer não é o modelo

```
Canvas 2D (Konva) / Vista 3D (Three.js)
   │ emite INTENÇÃO: "adicionar parede daqui até ali"
   ▼
useBlueprintEditor ── MODELO (só o kernel altera, por comando)
                  ├─ HISTÓRICO (desfazer/refazer)
                  └─ RASCUNHO (o que está no banco; autosave com debounce)
   ▼
kernel: applyCommand / applyBatch → novo modelo + diff + hash
```

O canvas nunca muta geometria; quem valida e transforma é o kernel. Isso é o
que permite colaboração, geradores automáticos e hash reprodutível.

## Contrato público

`utils/blueprintKernel/index.ts` é a **superfície pública**: nada fora do kernel
deve importar os módulos internos direto. Principais arquivos:

| Arquivo | Conteúdo |
|---|---|
| `units.ts` | política numérica, `KERNEL_VERSION`, `roundToMm`, tolerância |
| `geom.ts` | primitivas geométricas (interseção, polígonos, ortogonalidade, eixos de parede) |
| `model.ts` | entidades: níveis, paredes (com camadas), aberturas/esquadrias, espaços, estrutura, escadas, telhados, muros, unidades, blocos, vagas, redes MEP (trechos, terminais, quadros, circuitos), loteamento (quadras, lotes, vias)… |
| `commands.ts` | o tipo `Command`, `applyCommand`, `applyBatch`, `ModelHistory`, sincronização de grupos e pavimentos vinculados |
| `canonical.ts` + `hash.ts` | serialização canônica e SHA-256 |
| `identity.ts` | `uid` de identidade externa |
| `quantities.ts` | quantitativos a partir do modelo |
| `arrangement.ts`, `juncoes.ts`, `conflitos*.ts` | arranjo de paredes, junções e detecção de conflitos |

## Invariantes numéricas e de identidade

- **Comprimento persiste em milímetros inteiros.** Ponto flutuante só existe
  dentro de um cálculo e volta a inteiro por `roundToMm`. Com float, duas somas
  logicamente iguais em ordem de avaliação diferente divergem no último bit e o
  hash muda sem a geometria mudar. Uma edificação cabe em ±100 m, e os produtos
  vetoriais (~1e10) ficam muito abaixo de `Number.MAX_SAFE_INTEGER` — os
  predicados de orientação são **exatos**.
- **`id` é determinístico**, atribuído por contador do próprio modelo, nunca
  `crypto.randomUUID()` — senão o payload mudaria a cada execução.
- **`uid` é a identidade externa** (IFC, cronograma, ferragem, comentários):
  nasce na criação, sobrevive a autosave/publicação/reload e **fica fora do
  hash**. Cópias recebem uid novo; uid duplicado viola os invariantes
  (`DUPLICATE_UID`). Nenhum comando aceita `uid` como argumento.
- `assertModelInvariants` valida o modelo depois de cada comando.

## Serialização canônica e hash

`canonical.ts` garante igualdade **bit a bit** do payload entre navegador e
servidor:

1. **ordem total** — tudo é ordenado por chave explícita antes de escrever, e as
   chaves de objeto saem em ordem fixa (`JSON.stringify` preserva ordem de
   inserção, que varia por caminho de código);
2. **SHA-256 próprio** (`hash.ts`), idêntico dos dois lados por construção.

O payload tem duas partes: a **geometria**, que entra em `snapshotHash`, e a
**identidade** (uids), que não entra — dois desenhos iguais com uids diferentes
são o mesmo desenho.

`applyCommand(model, command)` devolve `{ model, diff, hash }`.
`ModelHistory` guarda **estados inteiros** (não comandos inversos) para
desfazer/refazer, e expõe o hash do estado corrente.

## Persistência: estudo, ramo, rascunho, snapshot

`services/blueprintService.ts`:

| Conceito | Operações |
|---|---|
| **Estudo** (`BlueprintStudy`) — um desenho de uma organização, opcionalmente ligado a obra e empreendimento | `listStudies`, `createStudy`, `duplicateStudy`, `archiveStudy`, `setStudyProject`, `vincularEmpreendimento` |
| **Ramo** (alternativa de projeto); um é o principal | `listBranches`, `createAlternative`, `setPrincipalBranch`, `deleteBranch` |
| **Rascunho** do ramo | `saveDraft`, `loadBranchModel` |
| **Snapshot publicado** (imutável, com hash e versão do kernel) | `publishSnapshot` → RPC `fn_blueprint_publish_snapshot`; `verifySnapshotIntegrity` recalcula o hash |

Publicar envia o `snapshotHash` calculado no cliente. Se o ramo andou desde a
revisão enviada, a RPC levanta **`23001`** ("recarregue o desenho"). Não se usa
`40001`: o PostgREST o trata como retentável e reexecuta em laço até o corte de
20 s, e o usuário via falha de rede.

Snapshots publicados alimentam quantitativos (`computeAndStoreQuantities`),
orçamento, pranchas e emissão executiva — todos amarrados ao hash.

⚠️ O modelo lido do banco **não preserva a ordem** de algumas coleções (ex.:
divisas do terreno); compare por identidade, não por índice.

## Colaboração em tempo real

`utils/blueprintColaboracao.ts` (puro) + `hooks/useBlueprintColaboracao.ts`
(canal Supabase Realtime):

- **Sem CRDT**: como todo comando é determinístico e validado, dois clientes que
  partem do mesmo modelo e aplicam a mesma sequência chegam ao mesmo hash. Basta
  difundir o `Command` e o **hash esperado**; quem recebe aplica e confere — se
  divergiu, avisa com o autor e oferece recarregar.
- **Trava por elemento**: o que outra pessoa tem selecionado está em edição por
  ela; isso evita a maioria dos conflitos antes de acontecerem.
- **Presença** por ramo, **papéis por estudo** (leitor não edita: a tela trava
  e a RLS recusa) e **menções** `@nome` em comentários.

## Editor

`components/blueprint/` (~190 arquivos): `BlueprintEditor`, `BlueprintCanvas`
(Konva, 2D), `Blueprint3DViewer` / `Blueprint3DTab` (Three.js via
@react-three/fiber), `ElevationCanvas`, `EditorDeCamadas`, ribbon por disciplina
(guia de UI §19.5), painéis de importação, comentários, pranchas e
disciplinas. Utilitários de 3D em `utils/blueprint3d*.ts`, câmera, cortes,
isométricos e vistas de planta em `utils/blueprint*`. Encaixe (snap) em
`utils/blueprintEncaixe.ts`; atalhos em `utils/blueprintAtalhos.ts`.

## Importação

Toda importação termina em **comandos do kernel** aplicados por `applyBatch`:

| Formato | Caminho |
|---|---|
| DXF | `utils/dxfLeitor.ts` → `utils/dxfParaKernel.ts` (escala e pareamento de linhas em paredes); também como fundo (`dxfParaFundo`) |
| DWG | Edge Function `dwg-converter` (libredwg em WASM no servidor) → DXF → mesmo caminho |
| IFC | `services/ifcParametricoService.ts` lê com `web-ifc` (WASM servido em `/wasm/web-ifc.wasm`) → `utils/ifcParaKernel.ts` traduz peça paramétrica em comando |
| SketchUp | exportar Collada (`.dae`) → `utils/colladaParaKernel.ts` (o `.skp` é binário fechado) |
| Underlay | PDF/imagem como fundo (`useBlueprintUnderlay`) |

## Exportação

- `utils/blueprintExport.ts`: exportação com **escala real** (1:100 = 1 m mede
  10 mm no papel), legenda, versão e aviso de finalidade — escala é requisito,
  não enfeite.
- `utils/blueprintIfc.ts`: IFC **somente com declaração de cobertura
  semântica** — o arquivo diz o que não modela, porque IFC é lido como modelo de
  informação.
- BCF para coordenação (`utils/blueprintBcf*.ts`), DXF, memoriais DOCX,
  pranchas em PDF.
- API externa por token: Edge Function `planta-api` (kernel empacotado por
  `scripts/build-planta-api-kernel.mjs`), webhooks em `planta-webhooks`.

## Onde olhar

| Pergunta | Arquivo |
|---|---|
| o que é uma entidade e seus limites | `utils/blueprintKernel/model.ts` |
| como uma edição muda o modelo | `utils/blueprintKernel/commands.ts` |
| por que o hash mudou | `utils/blueprintKernel/canonical.ts` |
| estado do editor e autosave | `hooks/useBlueprintEditor.ts` |
| publicar/ramos | `services/blueprintService.ts` |
| colaboração | `utils/blueprintColaboracao.ts` |
