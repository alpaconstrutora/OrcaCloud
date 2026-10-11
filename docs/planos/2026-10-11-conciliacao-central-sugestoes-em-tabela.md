# Central de Conciliação: sugestões em tabela padrão (StandardTable)

## Pedido original

> veja print. inves de cards com informações empilhadas dificultando visualizacao, seria melhor em formato de tabela padrão ao nosso app.
> analise e me retorne

(print: Financeiro › Conciliação Bancária › Central, conta Banco Itaú, sugestões em cards de
três blocos — Sistema | Confiança | Extrato — com "+2 candidato(s) alternativo(s)" no rodapé)

Depois da análise (proposta: tabela + (1) ver candidatos alternativos + (2) busca/ordenação +
(3) seleção em lote):

> faca os 3

Sessão: a9d65fb7-e896-475d-a49c-45a7fb6ded2a · 11/10/2026

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 11/10 | Cards → tabela padrão do app | Sim |
| 11/10 | Ver candidatos alternativos (linha expandida) | Sim |
| 11/10 | Busca e ordenação por coluna | Sim |
| 11/10 | Seleção em lote ("Conciliar selecionados") | Sim |

## Plano

### 1. `components/SmartReconciliationCenter.tsx` — lista de cards vira `StandardTable`

Uma linha por movimento do extrato (o melhor candidato). Colunas, na ordem — os dois valores
ficam lado a lado em volta da Confiança, e o texto livre vai para o fim (é o que corta
primeiro em tela estreita, com `title` devolvendo o texto inteiro):

| Coluna | Largura | Visível | Conteúdo |
|---|---|---|---|
| Data | 110 | sim | data do extrato |
| Extrato | 210 | sim | pagador/favorecido; sem ele, a descrição; `title` = texto do banco |
| Valor | 135 | sim | valor do extrato (+ verde / − vermelho, como Extrato/Pendentes) |
| Confiança | 115 | sim | `78%` em texto colorido por faixa (§8), motivos no `title`; `· +2` abre os alternativos |
| Valor previsto | 150 | sim | `valor_esperado` (líquido); bruto no `title` |
| Vencimento | 125 | sim | vencimento do título |
| Cliente/credor | 190 | sim | contraparte do título |
| Lançamento | 230 | sim | descrição do título |
| Descrição no banco | 230 | não | texto bruto do extrato |
| Valor bruto | 130 | não | `amount` do título |
| Motivos | 300 | não | motivos do score |

Ações (§9): **Conciliar** em texto azul + Descartar em `<ActionIconButton>`.
Toolbar acoplada: busca (extrato, contraparte, lançamento, valores), `FilterPopover`
Confiança, a frase "Última execução…" e Reprocessar / Regras / Tolerâncias / ação primária
em `toolbarRight`.

**Pronto quando:** a Central renderiza a tabela com essas colunas; `check-ui-standard.sh`
limpo no arquivo; tsc 0 erros.

### 2. Candidatos alternativos (`renderExpanded`)

`· +N` na célula de Confiança abre, logo abaixo da linha, os outros candidatos do mesmo
movimento (lançamento, cliente/credor, vencimento, valor previsto, confiança, motivos), cada
um com o próprio **Conciliar**.

**Pronto quando:** teste de componente abre o alternativo e o Conciliar dele chama
`onConfirm(bankId, idDoAlternativo)`.

### 3. Seleção em lote (§10)

Checkbox por linha; barra fixa azul no rodapé com "N selecionados · R$ total",
**Conciliar selecionados** (com `useConfirm`) e Desmarcar. Cada movimento vai com o melhor
candidato. Se dois movimentos selecionados apontam para o MESMO título, só o primeiro é
conciliado e o outro é avisado — o banco recusa título já conciliado (migration
`aplicar_20271011007000`), e a tela não deve depender da recusa. "Conciliar alta confiança"
passa pela mesma rotina.

**Pronto quando:** teste de componente: 2 selecionados → 2 `onConfirm`; 2 selecionados com o
mesmo título → 1 `onConfirm` + aviso.

## Ajuste durante a execução (11/10)

A primeira grade (8 colunas visíveis, ~1.465 px com seleção e ações) **não cabia** nos
~1.290 px úteis do app com a barra lateral aberta: a coluna Ações — com o Conciliar — nasceria
fora da tela. Medido no navegador. Ficou: Data 120 · Extrato 185 · Valor 150 · Confiança 120 ·
Valor previsto 165 · Vencimento 130 · Lançamento 195 = 1.065 + seleção 40 + ações 160 =
1.265 px. **Cliente/credor nasce oculta** (liga na engrenagem): o pagador/favorecido já está
na coluna Extrato. Também no navegador: o sinal +/− do Valor quebrava linha (`whitespace-nowrap`)
e "Valor previsto" quebrava o cabeçalho (165 px).

Achado na conferência visual: com 2 linhas marcadas e uma busca que escondia uma delas, a barra
dizia "2 selecionados" e o lote agiria sobre a linha invisível. A busca passou a ser controlada
pela tela e a seleção acompanha o que está visível (busca + filtro de Confiança).

## Estado

- [x] 1 tabela — `StandardTable`, colunas acima; `check-ui-standard.sh` limpo; tsc 0 erros.
- [x] 2 alternativos — `· +N` na Confiança abre a sub-tabela com Conciliar por candidato.
- [x] 3 lote — seleção §10 + barra fixa; título repetido no lote fica de fora com aviso;
      "Conciliar alta confiança" usa a mesma rotina; seleção some com a linha escondida.
- [x] testes — `__tests__/components/ConciliacaoCentralTabela.test.tsx` (7).
- [x] conferência visual — harness local com a Central num contêiner de 1.290 px, dados de
      exemplo, Playwright 1600×1000: tabela 1.288 px, Ações termina em 1.289 px, sem rolagem
      lateral, nenhum cabeçalho cortado; prints da tabela, alternativos, lote e busca.
      **Não exercitado:** o clique em Conciliar contra o banco (o harness usa `onConfirm`
      falso). O caminho de gravação é o mesmo de antes (`handleConfirmMatch` →
      `fn_reconcile_match`), sem mudança.
- [x] publicação — commit `ddc583e9` em main; CI `ci` success; domínio serve `ddc583e` com "Conciliar selecionados" no bundle.
