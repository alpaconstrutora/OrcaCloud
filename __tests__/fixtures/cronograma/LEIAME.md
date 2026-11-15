# Arquivos de teste — importação de cronograma (Planejamento)

Gerados em 15/11/2026 para o item 2b de `docs/planos/2026-11-14-planejamento-lista-critica.md`
(leitores de MS Project XML e do modelo Excel). **São sintéticos:** seguem a especificação do
MSPDI (o XML que o MS Project grava em *Arquivo › Salvar como › XML*), mas não carregam manias de
um Project real (versão, idioma, calendário próprio, campos personalizados). Quando a equipe mandar
um XML de verdade, ele entra aqui como mais um caso — os leitores não podem depender destes.

Base: a EAP real do planejamento Divino Espirito Santo (37 itens, 4 grupos), com o nome da obra
trocado por "Obra Exemplo".

| Arquivo | O que testa |
|---|---|
| `msproject-divino.xml` | 58 tarefas (20 resumos, 36 itens, 2 sem par). Folhas nos níveis 2, 3 e 4 (subetapa com um item só é a própria tarefa). Acentos. 19 vínculos (TI e II, defasagem de 1 dia). |
| `modelo-cronograma.xlsx` | O **mesmo** conteúdo no modelo Excel do app (abas *Cronograma* e *Como preencher*). Os dois leitores têm de devolver a mesma coisa. |
| `msproject-pequeno.xml` | 7 tarefas sem orçamento: os 4 tipos de vínculo (TI, II, TT, IT), defasagem −1, +2 e +5 dias, um marco. |
| `gabarito.json` | O que cada tarefa deve trazer (EAP, nome, datas, %, predecessoras) e, para a fase de casamento (2c/2d), qual item do orçamento ela deve casar (`itemId`, `null` = sem par). |

Situações de teste embutidas (ver `gabarito.json`):

- **Datas replanejadas** em 3 itens, de forma CONSISTENTE com os vínculos (como o Project grava): 3 dias
  úteis de atraso, mesma duração, em itens que não são predecessores de ninguém (Fiscalização 01.01.01,
  Combustíveis 02.01.01, Impermeabilização de muro 04.07.02). Arquivo que não respeita os próprios vínculos
  tem as datas empurradas pelo motor do app ao abrir o planejamento — ver o teste da montagem.
- **Convenção de término:** `Finish` = último dia trabalhado e `Duration` = dias de trabalho (como o MS
  Project). No app, término = início + duração; `gabarito.json` traz os dois (`termino` e `importadoNoApp`).
- **% diferente do app** em 3 itens (Terraplanagem 80→100, Fiscalização 82→85, Escoramento vazio→40).
- **Sem par no orçamento:** "Mobilização do canteiro" (24 a 30/07) e o marco "Aprovação do projeto na prefeitura"; a
  Terraplanagem tem a Mobilização como predecessora (vínculo para tarefa que o usuário pode ignorar).
- **Nome sem acento e em minúsculas:** "tapume com telha metalica" (casamento tem de normalizar).
- **Item do orçamento fora do arquivo:** Assessorias Contábeis (01.02.03) — ao atualizar, fica como está.
- **Erro de digitação real da EAP** mantido: "BLOCO DE CORoAMENTO e viga baldrame".

O gerador (Node + ExcelJS) ficou fora do repositório: ele lê um extrato do banco. Para refazer,
gerar de novo a partir da EAP e atualizar o gabarito junto.
