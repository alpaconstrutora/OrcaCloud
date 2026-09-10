# Verificação das fatias no app real + área construída que explodia

## Pedido original

> o que falta implementar das fatias e pendencias?
> implemente na ordem sugerida, 1. 2 e 3

Item 1 da ordem: abrir o editor **de verdade** (não o harness) e exercitar as
três fatias. Item 3: olhar o eletroduto em L no 3D.

## Como foi feito — sem UMA escrita em produção

Playwright contra o servidor da frente, login com a conta do `.env.local`, e
**todo POST/PATCH/PUT/DELETE ao PostgREST abortado** na camada de rede. O
editor acusou "Falha ao salvar · blueprint/saveDraft: Failed to fetch" — a
prova de que o autosave tentou e não passou. Estudo aberto: "Planta
23/08/2026" (publicada, 41 paredes, 6 ambientes), sem alterar nada nela.

## O que se viu funcionando no app

- Lista de ambientes com o select **Tipo** (6 selects), a linha da norma
  ("NBR 5410: mín. 5 (1 a cada 5 m de 20,7 m) · há 5 — atende") e
  **Distribuir**; "Completar pela norma" criou 2 sugeridas.
- **Quadro de cargas** em VA ("0 VA") e o painel **Conferência NBR 5410**
  abaixo dele, com "9.5.2.2.2 … Ambiente 1: 5 tomadas sem potência declarada",
  "Fora da avaliação: 1 tomada fora de qualquer ambiente fechado" e os
  "(parcial)".
- Vista 3D do estudo abre sem erro de JS.
- Harness novo `docs/spikes/eletroduto-3d/`: tomada (300) → luminária (2.800)
  **sobe pela parede e corre pelo teto**, e não em diagonal. Olhado.

## ⚠️ O que o app mostrou de errado — e foi corrigido

**"136,79 m² úteis · 91.863.221.361.873,47 m² construídos."**

Baixei o rascunho real (leitura) e reproduzi: o contorno externo do Térreo
passa por uma **ponta solta** — `(26075,−29925) → (26075,−31150) → (26075,−29925)`,
uma parede que entra e volta pela mesma linha. É um giro de 180°, e o termo de
canto de `areaRecuada` é `d² · tan(giro/2)` = `tan(90°)`.

Correção: o giro é limitado a 160° no termo de canto. Ponta não tem mitra; a
contribuição dela é da ordem de d² (≈ 0,03 m²) — pequena, mas finita.
Polígono sem ponta solta não muda de número (teste do retângulo 6 × 4 =
22,5225 m² intacto). Política de quantidades `quant-1.9.0 → 1.10.0`.

Portão: `blueprintAreaPontaSolta.test.ts` falha no código anterior (medido
com `git stash`).

Ajuste menor visto no mesmo print: área e perímetro da lista com PONTO
("19.24 m²") ao lado da linha da norma com VÍRGULA ("20,7 m") — agora vírgula.

## Fora deste commit

Item 2 da ordem — interruptor e iluminação mínima (9.5.2.1) — segue em
commit próprio.
