# Planejamento: acesso rápido e recolher a faixa, iguais aos da Planta Inteligente

## Pedido original

Sessão de 16/11/2026 (continuação da 2ª crítica de Engenharia › Planejamento), depois das quatro
publicações daquela crítica:

> implemente menu e botões em engenharia > planejamento  como foi implementado em incorporação > planta inteligente

Pergunta feita antes do plano: *"O que entra nessa linha de ícones?"* → resposta do usuário:
**"Vistas + Estrutura + Arquivo (Recomendado)"**. Ou seja: as 12 vistas como ícones em 3 grupos;
Expandir/Recolher tudo (só em Tabela e Gantt); Arquivo com Importar datas, PDF, Excel, CSV e Tela
cheia; a aba Exportar sai, porque os três botões dela passam a ficar sempre à vista.

## Diagnóstico

O editor do Planejamento já usa o `Ribbon` da Planta desde 21/09/2026
(`docs/planos/2026-09-21-planejamento-ribbon.md`). Depois disso a Planta ganhou duas peças que o
Planejamento não tinha (comparado pela foto dos dois editores):

1. **Acesso rápido** (17/09/2026): linha própria sob as abas, só ícones, em grupos com alça ⋮⋮ que se
   arrastam (`components/blueprint/AcessoRapido.tsx`).
2. **Recolher a faixa** (24/09/2026): setinha ao lado das abas, ou duplo clique numa aba.

A lista de plantas (Incorporação › Planta Inteligente) não tem menu próprio — título, "Nova planta" e
tabela. O pedido é sobre o editor.

## Itens

### 1. `components/blueprint/Ribbon.tsx` — `BotaoDoAcessoRapido`
O botão só de ícone do acesso rápido, exportado: o mesmo desenho do `BotaoBarra` local do
`BlueprintEditor.tsx` (borda, `p-1.5`, `title` + `aria-label` = rótulo, `aria-pressed` só em modo).
Diferença deliberada: desligado com `cursor-not-allowed`, **sem** `pointer-events-none`, para o
`title` com o motivo aparecer. O `BotaoBarra` da Planta não foi tocado (editor de 22 mil linhas com
frentes abertas): quem tocar lá troca por este.

**Como sei:** `Ribbon.test.tsx` › `BotaoDoAcessoRapido` (nome acessível, `aria-pressed` só em modo,
desligado sem `pointer-events-none`, ícone girando, texto curto).

### 2. `components/schedule/ScheduleHeader.tsx` — o arranjo da Planta
- Acesso rápido com os grupos `vistas-cronograma`, `vistas-analise`, `vistas-execucao`, `estrutura`
  ("Expandir e recolher", só em Tabela/Gantt) e `arquivo`; ordem em `schedule:ordemDoAcessoRapido`.
- Faixa recolhível, estado em `schedule:ribbonRecolhido`; a barra de opções continua à vista.
- Aba Exportar removida; `exportar` salvo em `schedule:abaDoRibbon` cai em Cronograma (`abaEfetiva`).
- Tela cheia saiu do slot direito para o grupo Arquivo (como na Planta).
- **Desvio do plano aprovado:** o plano dizia dar ao Auto Programar a medida do "Publicar versão" da
  Planta (`py-1.5 text-sm`). O guia (§17) diz que o primário válido é o compacto `h-9`, e o Auto
  Programar já é assim — quem destoa do guia é o botão da Planta. Ficou como estava.

**Como sei:** `ScheduleRibbon.test.tsx` (4 abas; `exportar` salvo cai em Cronograma; grupos na ordem
padrão e com alça; 12 vistas com a atual acesa; Expandir desligado com o motivo no `title`; Arquivo
chama os handlers; ordem salva vale ao reabrir; recolher persiste e a aba devolve) e
`ScheduleHeaderTelaCheia.test.tsx` (tela cheia dentro do grupo Arquivo, em toda vista).

### 3. Guia `docs/ui_ux_guia_unificado.md` §19.5
Acesso rápido nos dois editores, `BotaoDoAcessoRapido`, recolher a faixa e a aba Exportar que virou
grupo.

**Como sei:** o texto antigo ("quando são dois… cabem no slot `direita`") não existe mais.

## Verificação

- `tsc` limpo; vitest dos arquivos tocados + `orgContextGuard` (58/58, a conta fecha);
  `check-ui-standard.sh` limpo em `ScheduleHeader.tsx` e `Ribbon.tsx`.
- Tela local (Playwright, Divino, só leitura, 0 escritas tentadas, 0 `pageerror`): grupos na ordem,
  12 vistas, abas sem Exportar, linha alinhada à esquerda com o voltar, menu Níveis por cima da grade,
  ícone troca a vista, recolher pela setinha e pelo duplo clique, recolhida sobrevive ao recarregar,
  Curva S sem o grupo da EAP, arrastar a alça reordena e grava, celular 390 px sem rolagem horizontal.
  Roteiro: `c:/tmp/pwtest/acesso-rapido-ver.cjs`.

## Estado

⏳ Publicação: uma PR.
