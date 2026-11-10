# Empreendimento de unidade única — Lote, Chácara, Casa Residencial

## Pedido original
> incoporacao > empreendimento: quando o empreedimento for um lote a unidade é o proprio lote. torres unidades deve ser adaptada
> Sessão: 32515b13-426f-4f4b-a0d9-dba174c16b30 · 09/11/2026

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 09/11/2026 | Como o sistema sabe que o empreendimento é "lote"? | "o campo tipo lista todos os tipos de empreendimento, um dos itens é Lote" → **o Tipo decide**. Como o slug não serve (o de "Casa Residencial" é `teste` e o mesmo slug se repete por org), o tipo guarda o comportamento em `empreendimento_types.estrutura`. A migration já marca os três, então o usuário continua escolhendo só o Tipo. |
| 09/11/2026 | Além de Lote, algum outro tipo é "a unidade é o próprio imóvel"? | Chácara e Casa Residencial. |

Decisão de execução: Lote e Casa/Chácara não são iguais. No Lote, a área da unidade **é** a do terreno; na casa/chácara, a unidade é a construção sobre ele. Por isso `estrutura` tem três valores: `TORRES` (o de sempre), `LOTE` e `IMOVEL_UNICO`.

## Contexto
Até aqui, a aba **Torres & Unidades** só aceitava torre → pavimentos → unidades. Os 9 empreendimentos desses tipos (4 Lote, 1 Chácara, 4 Casa Residencial) estavam **sem nenhuma torre nem unidade**, e por isso nada deles chegava ao Espelho de Vendas, ao Comercial, ao Condomínio ou ao Portal. Todas essas telas leem `empreendimento_units` dentro de `empreendimento_towers`.

O modelo de dados **não muda**: por baixo existe uma torre implícita (com o nome do tipo) que guarda uma única unidade. O que muda é a tela.

## Plano
1. **Migration** `aplicar_20271109900000_empreendimento_tipo_estrutura.sql`: coluna `estrutura` com CHECK e backfill (`lote` → LOTE; `chacara` e "Casa Residencial" → IMOVEL_UNICO). Sem policy nem função. *Terminou quando:* o SELECT no banco mostrar os três tipos marcados.
2. **`utils/empreendimentoTipos.ts`**: `EstruturaDoTipo`, `ESTRUTURAS_DO_TIPO` e `estruturaDoTipo()`, com a org do registro tendo prioridade sobre a de sistema. *Terminou quando:* houver teste cobrindo slug repetido e tipo sem coluna.
3. **`services/empreendimentoTypeService.ts`**: `estrutura` no registro, no select, em create/update e ao duplicar.
4. **`components/EmpreendimentoTypesSettings.tsx`**: coluna "Unidades" (listar, ordenar, criar e editar).
5. **`components/empreendimento/TerrenoSecao.tsx`** (novo): a seção Terreno saiu do TowerEditor sem mudar comportamento, e ganhou `onSalvo`. *Terminou quando:* os testes do Terreno do TowerEditor continuarem verdes.
6. **`components/empreendimento/UnidadeUnicaEditor.tsx`** (novo): Terreno + Lote (identificação, quadra, nº; área e testada vêm do terreno, e salvar o terreno as leva à unidade) ou Unidade (UnitFormFields `semPavimento`). Mostra o status de venda e um link para o Espelho. Se o cadastro estiver fora do molde (mais de 1 torre ou mais de 1 unidade), mostra um aviso e o TowerEditor como antes.
7. **`services/empreendimentoService.ts`**: `salvarUnidadeUnica()` cria a torre e a unidade que faltarem, ou atualiza o que já existe. Só grava no clique.
8. **`UnitFormFields.tsx`**: props `semPavimento` e `rotuloDoNome`.
9. **`EmpreendimentoDetail.tsx`**: a aba se chama "Lote", "Unidade" ou "Torres & Unidades" (com o mesmo id `torres`) e renderiza o editor certo. Os tipos são lidos da org do empreendimento.
10. **`CaracteristicasAdicionaisTab.tsx`**: "Nova Unidade" fica desligado em unidade única, e o título explica o motivo.

## Estado
- [x] 1–10 implementados (frente `empreendimento-unidade-unica`)
- [x] migration aplicada no banco (09/11, pelo usuário; SELECT conferido: lote → LOTE, chacara/Casa Residencial → IMOVEL_UNICO, resto TORRES)
- [x] conferido na tela de verdade (dev server da frente, conta desenvolvedor@): "Lote Vale do Sol" com aba "Lote", área 134,00 m², "Cadastrar unidade" gravou 1 torre "Lote" + 1 unidade de 134 m² (DISPONIVEL), que aparece no Espelho de Vendas (unidade MANTIDA, é dado real); Padre Caramurú (Casa) e Tamareiras (Chácara) com aba "Unidade" sem pavimento; Coronel Lambert 316 (Edifício Comercial) com Torres & Unidades como antes

## Verificação
- `npx vitest run __tests__/empreendimentoUnidadeUnica.test.ts __tests__/components/UnidadeUnicaEditor.test.tsx __tests__/components/TowerEditorTerreno*.test.tsx`
- `bash scripts/check-ui-standard.sh` nos .tsx tocados, mais `npm run typecheck`.
- Banco: `SELECT slug, name, estrutura FROM empreendimento_types ORDER BY 1`.
- Tela, em "Lote Vale do Sol" (134 m²):
  - a aba aparece como "Lote", com área 134,00 m²;
  - "Cadastrar unidade" grava 1 torre "Lote" + 1 unidade;
  - a unidade aparece no Espelho de Vendas;
  - um empreendimento Vertical continua com Torres & Unidades igual a antes.
