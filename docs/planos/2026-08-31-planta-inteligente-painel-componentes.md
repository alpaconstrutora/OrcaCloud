# Planta Inteligente — acordeão "Componentes" (gerenciador de peças)

## Pedido original

> incorporacao < planta inteligente:
> 1. quando seleciono um componete ele apaerece em ambiente no painel lateral. Crie um novo acordion chamado componentes e inclua todos os componentes que estão em uso de forma a ser um gerenciador

Sessão: `173a7f9b-72cd-49d6-972f-e29192178ac2` · 2026-08-31

## Contexto

O painel lateral virou accordion multi-aberto em 29/08/2026 e o menu
**Componentes** (barra superior) nasceu em 31/08/2026, reunindo as treze peças
que o desenho constrói — parede, esquadria, estrutura e fundação. Faltavam duas
coisas, e o pedido cobre as duas:

1. **A peça selecionada aparecia dentro de "Ambientes"** — seção cujo subtítulo
   é "Derivados da topologia — não são desenhados à mão". Parede, porta e pilar
   são o oposto disso. Quem clicava numa parede procurava as medidas dela na
   seção dos ambientes.
2. **Não havia lista.** O único caminho até uma peça era acertá-la com o clique
   no canvas — pilar atrás de parede, janela estreita em zoom de trabalho e viga
   sob a laje eram inalcançáveis sem caçar zoom.

## Decisões

| Pergunta | Decisão |
|---|---|
| O que é "componente" na lista? | O mesmo recorte do `MenuComponentes`: alvenaria, esquadria, estrutura, fundação. Divisa/terreno é limite jurídico (`PainelTerreno`), medição é afirmação sobre a planta de fundo (`PainelMedicoes`), ambiente é derivado. |
| Onde ficam as propriedades da peça selecionada? | Dentro de "Componentes", **acima** da lista. Ficar abaixo de quarenta linhas de inventário faria o clique parecer sem resposta. |
| Escopo da lista | O **pavimento ativo**, como todo o resto do painel. |
| Nome e ícone de cada peça | Saem do catálogo do `MenuComponentes` (`fichaDoComponente`), não de uma tabela nova — duas tabelas divergiriam no primeiro componente novo. |
| Confirmação ao excluir | Não. O módulo inteiro (medições, painel de estrutura) exclui direto, e o editor tem Ctrl+Z. |

## Plano

### 1. Catálogo exportável · `components/blueprint/MenuComponentes.tsx` ✅

`fichaDoComponente(chave)` → `{ rotulo, icone, grupo }` e `ORDEM_DOS_GRUPOS`,
derivados do mesmo `GRUPOS` que o menu já usava.

**Pronto quando:** o painel novo não declara nome nem ícone próprio de peça.

### 2. Inventário puro · `utils/blueprintComponentes.ts` ✅

`linhasDeComponentes(paredes, aberturas, estruturas)` → uma linha por peça com
`{ id, chave, rotulo, medida, detalhe }`. Numeração **por tipo** ("Porta 1,
Porta 2, Janela 1"); rótulo do calculista (`Structural.rotulo`) vence a
numeração automática; esquadria diz em que parede mora.

**Pronto quando:** `__tests__/blueprintComponentes.test.ts` passa (6 casos).

### 3. Painel · `components/blueprint/PainelComponentes.tsx` ✅

Grupos de leitura na ordem da obra, contagem por grupo, grupo vazio não aparece.
Clique seleciona; Ctrl/⌘/Shift+clique acrescenta; lixeira por linha; slot
`propriedades` para os painéis de peça selecionada.

**Pronto quando:** `__tests__/components/PainelComponentes.test.tsx` passa
(7 casos).

### 4. Ligação no editor · `components/blueprint/BlueprintEditor.tsx` ✅

- Seção `componentes` em `SECOES_DO_PAINEL`, entre Pavimentos e Ambientes,
  aberta por padrão (é onde as propriedades passaram a morar);
- `componentesDoNivel` — o recorte por pavimento, feito aqui porque a abertura
  não guarda `levelId`;
- efeito que **abre a seção ao selecionar um componente** (corpo de seção
  fechada é desmontado — sem isso o clique no canvas não teria resposta);
- `excluirComponente(id)` — exclusão avulsa, separada de `removerSelecionada`
  para a lixeira não trocar a seleção do usuário;
- `PainelSelecaoMultipla`, `PainelEstruturaSelecionada` e
  `PainelParedeSelecionada` saíram de "Ambientes" e entraram no slot.

**Pronto quando:** `npx tsc --noEmit` limpo e `__tests__/components/BlueprintEditor.test.tsx` verde (57 casos).

### 5. Conferência em Chrome real · `docs/spikes/componentes/` ✅

jsdom não faz layout: a linha tem ícone + rótulo + detalhe + medida + lixeira
dentro de 307 px, e só o navegador diz se cabe (foi assim que a aba "Versões"
sumiu — ver `docs/spikes/abas-editor/`).

```bash
npx vite --port 3103
PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
  node docs/spikes/componentes/medir.mjs http://127.0.0.1:3103
```

**Pronto quando:** 13 linhas, nenhuma cortada, nenhuma medida truncada, sem
rolagem horizontal, sem erro no console — e a captura (`painel.png`) confere a
olho.

## Resultado

Todos os cinco itens concluídos em 31/08/2026. `npx tsc --noEmit` limpo; suíte
do blueprint 709 passando; harness aprovado com captura conferida.

## Pendências conhecidas

- **Renomear pela lista** — hoje só a peça estrutural tem `rotulo`, e ele se
  edita no painel de propriedades. Parede e esquadria não têm nome no modelo;
  dar um a elas é mudança de kernel, fora deste pedido.
- **Filtro/busca na lista** — numa planta com 200 paredes a rolagem vai pesar.
  Deixado de fora até haver planta real que doa.
