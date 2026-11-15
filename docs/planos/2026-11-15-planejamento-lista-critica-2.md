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

✅ **No ar em 15/11/2026 — PR #479 (222ab59), conferido em produção e CI do main verde.** Tela local:
Divino "Atrasado · 105 dias" e Término 01/12/2026 (= cabeçalho); Garden "Vencido há 215 dias" no topo;
cards 1/2/1/2; foco no diálogo de colunas e de volta; foco no 1º card após "Tentar de novo"; grupo "Sem
dados" na falha; 1.143 testes de 68 arquivos.

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

**Feito (local):**
- `ImportarCronogramaSheet` modo criar = "Novo planejamento": origem em 3 cartões (rádio); em branco
  e duplicar num passo só, importar com os 3 passos de antes; orçamento primeiro; nome preenchido
  sozinho (orçamento, arquivo, "(cópia)"); organização pelo nome; "Criar" desligado diz o que falta.
- Serviço: `criarPlanejamentoEmBranco` grava como o modal gravava (herda do orçamento o mesmo que o
  "Vincular" copiava — `herdadoDoOrcamento`); `duplicarPlanejamento` copia sem o código
  (`settingsDaCopia`) — o "Duplicar" antigo deixava dois "001". O "Duplicar" da linha abre o painel.
- Lista: sai "Importar cronograma"; "Novo planejamento" abre o painel (o modal não cria mais planejamento).
- Importar datas: abre com "Só o que muda ou precisa de decisão", alteradas no topo; confirmação com
  Término antes → depois (+N dias, linha de base) e Prazo antes → depois; What-If avisa ao abrir.
  `aplicarAtualizacao` limpa early/late das tarefas com datas novas (a lista lia o término velho).
- Foco no conteúdo a cada passo + anúncio "Passo N de 3"; passo 2 empilhado abaixo de md; datas com
  ano; "Auto Programar" emerald-700; ProjectModal: cantos 10px, h4→h3, placeholders e valor herdado
  legíveis, botões h-9, sem caixa alta/itálico na tabela Vincular e no "herdada da obra".
- Pré-existente, não mexido: `check-ui-standard` acusa `useState` na busca da aba Vincular do
  ProjectModal (igual no main; busca dentro de modal não precisa persistir).
- **Teste com gravação** (pedido: *"Autorizado (Recomendado)"*), pela tela local, só o POST de criação
  liberado. 1ª rodada achou 2 defeitos: (a) "Em branco" gravado como o modal gravava (budget vazio)
  abria VAZIO logo após criar — a reidratação de `hooks/usePersistenceSync.ts` põe nos itens a coluna
  `budget` crua e corre contra o `handleLoadProject` (que resolve o vínculo); (b) a cópia saía sem
  `organization_id`/`empresa_id` — o gatilho `sync_org_from_empresa` tira a org da COLUNA empresa_id e
  o Divino tem empresa só na coluna. Correção: "Em branco" nasce com o orçamento congelado (snapshot +
  versão + budget, como a importação); a cópia leva a empresa na coluna. 2ª rodada: em branco abre com
  os 37 itens na hora, org/empresa/cliente/vínculo/snapshot certos, código 002; cópia com org e
  empresa, código 003 (não repete 001). 4 registros de teste apagados (0 referências em 76 chaves
  estrangeiras; 0 restantes).

## Fora deste plano (anotado)
- A grade do cronograma (dentro do planejamento) mostra o término de cada tarefa na convenção do motor
  (02/12 para a tarefa trabalhada até 01/12). Mexer nela muda a edição de datas — fica para outra rodada.
- Contrastes da casca do app (sidebar/topo) e da grade do cronograma apontados pelo detector.
- Planejamento criado pelo modal ANTIGO com budget vazio (vínculo "ao vivo") pode abrir vazio depois
  de recarregar a página: a reidratação de `usePersistenceSync` não resolve o vínculo como o
  `handleLoadProject`. Os criados pelo painel novo já nascem congelados e não sofrem disso.
- O "Duplicar" antigo (Orçamentos/Obras) segue copiando o código e sem a empresa na coluna.
