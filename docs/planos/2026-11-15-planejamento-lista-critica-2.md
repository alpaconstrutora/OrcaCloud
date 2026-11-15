# Engenharia › Planejamento — 2ª crítica (26/40): atraso em dias, cards, importar datas, painel único

## Pedido original (sessão 98868220, 15/11/2026)

> /impeccable critique engenharia > planejamento

Respostas às perguntas da crítica (nota 16/40 → 26/40):

> Prioridade: "Atraso em dias na lista (Recomendado)"
> Escopo: "Tudo, incluindo os menores"
> Criar: "Painel único com 3 origens (Recomendado)"

> fazer um por vez siginifica fazer deploy um por vez?

> Faça uma proposta para apenas duas publicacoes

> aprovado

Crítica gravada em `C:\D\frentes\critica-planejamento\.impeccable\critique\2026-11-15T21-33-51Z__components-projectlist-tsx.md`
(fora do repositório). Plano anterior: `docs/planos/2026-11-14-planejamento-lista-critica.md`.

## Publicação 1 — a lista responde "quanto atrasa"

**O que muda**
1. **Término = último dia trabalhado.** O motor grava `endDate = início + duração` (o dia útil
   SEGUINTE ao último trabalhado: Divino, última tarefa 18/11 + 10 dias úteis → 02/12, trabalhada até
   01/12, que é o Término declarado no cabeçalho). `indicadoresDePrazo` passa a devolver o último dia
   trabalhado em `fimPrevisto` e `fimBaseline` (o desvio compara término com término) e a contar como
   atrasada a tarefa cujo último dia já passou sem 100%. O PV segue na convenção do motor (fração do
   tempo decorrido). Vale para a lista, os cards, os grupos e a Central de Comando (mesma conta).
2. **Atraso em dias.** `atrasoDias` = cronograma ganho (earned schedule): o avanço real de hoje é o
   que estava previsto para a data X; atraso = hoje − X. Coluna Prazo: "Vencido há N dias" (término
   passou sem 100%), "Atrasado · N dias", "No prazo"… A lista abre ordenada pelo Prazo (pior primeiro)
   para quem nunca escolheu ordenação.
3. **Término com desvio.** A célula mostra a data e, ao lado, "+Nd"/"−Nd" vs. a linha de base;
   vermelha quando o término já venceu.
4. **Avanço com a marca do previsto.** A barra pinta o trecho entre o real e o previsto.
5. **Cards novos:** Término vencido · Mais de 15 dias de atraso · Terminam em 30 dias · Sem linha de
   base. Número maior (`size="lg"`) e zero em cinza.
6. **Menores da lista:** foco no 1º card depois de "Tentar de novo"; foco no diálogo de colunas ao
   abrir; grupo "Calculando" vira "Sem dados" quando a busca falhou; título "Planejamentos" (como
   "Obras" e "Orçamentos"); na grade, o ícone de pasta vira o ícone da situação; Agrupar com nome
   acessível.

**Como sei que terminou:** testes da conta (término = último dia trabalhado, atraso em dias,
vencido, desvio término × término) e dos grupos; tela local sem gravar (Divino: Término 01/12/2026 na
lista = cabeçalho; Garden: "Vencido há N dias" no topo); tsc, padrão de UI, suíte do módulo; CI verde;
conferido em produção.

## Publicação 2 — criar e importar

1. Painel único "Novo planejamento" com 3 origens (em branco a partir de um orçamento, importar
   arquivo, duplicar); orçamento obrigatório e primeiro; organização vem dele; "Criar" desligado
   dizendo o que falta. O modal e o botão "Importar cronograma" separado saem.
2. "Importar datas": "Só o que muda" ligado, alteradas no topo; confirmação com término antes → depois
   vs. linha de base; What-If bloqueia ao abrir.
3. Foco no título de cada passo com anúncio; tabela do passo 2 empilhada no celular; datas com ano;
   nome da organização no passo 3; contraste do "Auto Programar"; h2→h4, botões, cantos e caixa alta
   (somem com o modal).

**Como sei que terminou:** testes; tela local; teste com gravação num planejamento descartável
(com autorização na hora) e apagado depois; CI verde; conferido em produção.

## Fora deste plano (anotado)
- A grade do cronograma (dentro do planejamento) mostra o término de cada tarefa na convenção do motor
  (02/12 para a tarefa trabalhada até 01/12). Mexer nela muda a edição de datas — fica para outra rodada.
- Contrastes da casca do app (sidebar/topo) e da grade do cronograma apontados pelo detector.
