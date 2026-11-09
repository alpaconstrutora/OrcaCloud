# Identificação da massa no corte e nas fachadas, com liga/desliga (09/11/2026)

## Pedido original

> "nos corte habilite exibir / ocultar indentificacao dos blocos, unidades, posiccao etc"

**Decisão do usuário:** os quatro elementos, cada um com seu liga/desliga no Exibir.
- Nomes dos blocos.
- Unidades.
- Posição das unidades.
- Pavimentos.

## Mudança

1. **Puro (`utils/blueprintMassaNaVista.ts`):**
   - `BlocoNaVista` ganha `pavimentos` e `peDireitoMm`.
   - `unidadesNaVista(blocos, base, origem, fatiasDoPiso)` devolve os trechos de unidade de cada pavimento:
     - **Bloco cortado:** as unidades que o plano atravessa (`trechosCortados` de cada fatia), dentro do trecho do
       bloco.
     - **Bloco em vista** (fachada, ou atrás do plano): a unidade mais perto de quem olha cobre as de trás. Cada fatia,
       da mais perto para a mais longe, fica com o que ainda não foi coberto.
2. **Editor:**
   - `pisosDaMassa`: por bloco ligado a uma torre, cada pavimento com o nome e a elevação do Empreendimento e as
     unidades na planta. Vem de `arranjoDoPiso`, a mesma arrumação do 3D e da planta baixa.
   - Quatro preferências e quatro itens no Exibir das vistas: `vistaNomesDosBlocos`, `vistaUnidades`,
     `vistaPosicaoDasUnidades` e `vistaPavimentos`, todas ligadas por padrão.
   - Cada item desligado diz o motivo: sem bloco; sem Empreendimento; ou, na posição, "ligue Unidades".
3. **Vista (`ElevationCanvas`):**
   - **Nome do bloco:** obedece ao liga/desliga.
   - **Unidades (camada 1e):** divisa tracejada e o número, com "· Frente/Fundos/Lateral" quando a posição está ligada
     e cabe. Se só o número cabe, sai só o número.
   - **Pavimentos (camada 1f):** "nome +elevação" de cada pavimento. Fica por fora, à esquerda do bloco da borda
     esquerda e à direita do da direita; o bloco do meio leva por dentro. Sem Empreendimento: "1º pav" e a cota do
     desenho.

**Fora do escopo:** a prancha exportada (PDF/DXF) continua com os blocos e o nome deles, sem as unidades e os
pavimentos.

## Verificação

- **Testes:**
  - `unidadesNaVista`: +3 (corte pelas unidades 101/103, fachada em que a fileira da frente cobre a de trás, pavimento
    sem unidades).
  - Suítes de vista, corte, prancha e catálogo: 253/253.
  - `BlueprintEditor.test.tsx` sozinho: 284/284.
- **Mecânicas:** tsc; check-ui-standard.
- **Visual:** página de teste temporária com a geometria do Garden, sem banco, fotografada no Playwright.
  - Corte com tudo ligado: nomes, unidades com posição, divisas e pavimentos com elevação.
  - Corte com tudo desligado: só os volumes.
  - Lateral: as unidades da fileira da frente.
  - Nenhum erro de página.
