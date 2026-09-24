# O drawer de Centro de Custo do condomínio não era o padrão do app

## Pedido original

Sessão de 24/09/2026, transcrito literalmente:

> o modal Selecionar Centro de Custo nao é o padrao do app. use como referencia
> suprimentos < pedidos

## O que a comparação na tela mostrou

As duas telas usam o **mesmo componente** (`CostCenterSelect` →
`HierarchicalSelect`), com o mesmo título e a mesma busca. A diferença não
estava no componente: estava nos **dados passados**.

| | Suprimentos › Pedidos (referência) | Condomínio › Ficha (o meu) |
|---|---|---|
| Desenho | **accordion**: grupo com chevron, filhos dentro | **lista plana**, tudo no primeiro nível |
| Código | texto simples, recuado ao lado do nome | **badge escuro** colado à esquerda |
| Origem dos dados | `costCenterService.list(orgId)` — a árvore INTEIRA | `listarDisponiveis`, já **achatada** para `{id, name, code, parent_name}` |

A causa está escrita no próprio `HierarchicalSelect.tsx:11-18`:

> *"Quando algum item traz `parentId`, a lista vira o mesmo desenho da tela
> Minha Organização › Centro de Custo: accordion por grupo (chevron abre/fecha
> os filhos), código em texto simples, sem badge colorido. **Sem `parentId`,
> comportamento antigo (nível pelos pontos do código, badges).**"*

Eu passava `parent_name` (um rótulo) mas **não** `parent_id`, e os GRUPOS nem
estavam na lista — então todo centro de custo virava raiz e o componente caía
no modo antigo. O defeito era meu, não do componente.

## Plano

### 1. `services/condominioRateioService.ts` (editado)

`listarDisponiveis` devolve a **árvore parcial** em vez da lista achatada: os
filhos livres **mais os grupos pais deles**, com `parent_id` e
`organization_id`. É a presença de um `parent_id` que aponta para um item
PRESENTE na mesma lista que faz o accordion existir.

Os grupos vêm com `selecionavel: false` — grupo não recebe lançamento, e
apontar o condomínio para um grupo faria a despesa cair num nível que não é
unidade de caixa. Clicar nele só abre/fecha os filhos.

**Como sei que terminou:** o drawer mostra os 6 grupos com chevron, e expandir
"Condomínios" revela `011 · 007 - Bella Vista`.

### 2. `components/CostCenterSelect.tsx` (editado)

`CostCenterOption` ganha `selecionavel?: boolean`, repassado ao item do
`HierarchicalSelect` (que já suporta o campo — era usado só nos cabeçalhos de
organização). Aditivo: quem não passa nada continua escolhível, como antes.

### 3. `components/condominio/CondominioDetail.tsx` e `FinanceiroTab.tsx` (editados)

As duas telas param de achatar a lista e passam as linhas cruas. O
`FinanceiroTab` tinha o **mesmo defeito** no drawer do estado vazio — corrigir
no service consertou os dois de uma vez.

Na Ficha, o desvincular passou a **recarregar** os livres em vez de recolocar o
item à mão: a linha vinculada só guarda id/código/nome, e sem o `parent_id` do
grupo o item voltaria órfão — recriando exatamente o defeito.

## Estado — 24/09/2026: concluído

Conferido na tela (dado real, escritas bloqueadas, zero erro de console),
comparando com o drawer de Suprimentos › Pedidos aberto no mesmo roteiro:

- **22 chevrons** (accordion) onde antes havia zero
- grupos: Obra · Administrativo · Comercial · Condomínios · Assistência Técnica · Ativos
- **0 badges** de código (o marcador do modo antigo)
- expandir "Condomínios" → `011` + `007 - Bella Vista`, código em texto simples
- clicar no GRUPO não escolhe nada: o gatilho segue em "Selecione para vincular"

Mecânica: `tsc` limpo · **5.158 testes** · `check-ui-standard.sh` limpo nos 3
arquivos tocados.
