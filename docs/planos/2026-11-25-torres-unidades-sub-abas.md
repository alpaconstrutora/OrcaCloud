# Empreendimento › Torres & Unidades em sub-abas

> Frente `torres-unidades-sub-abas` (REGRA #8). Plano aprovado pelo usuário em 25/11/2026.

## Pedido original (25/11/2026)

> Analise a tela da aba torres e unidades do empreendimento garden cambuhy. tem varias sessoes deixando a tela longa
> com tabela em cima de tabela. Se o torre tiver 200 unidades cada imagine o tamanho da tela. Sugiro dividir algumas
> dessas sessoes em uma abas. Quero ouvir sua sugestão. sessões (Terreno, Torres, Unidades, Vista da janela, Plantas
> por tipologia, Decorado por tipologia)

### Decisões do usuário (AskUserQuestion)
- **Terreno vira sub-aba**, mesmo aparecendo também na Visão Geral.
- **Plantas e Decorado juntos** numa sub-aba "Tipologias".

## Context — o que a tela é hoje (`components/empreendimento/TowerEditor.tsx`)

A tela é uma coluna só, nesta ordem:
1. Terreno.
2. Torres: um card por torre. Ao expandir, mostra **Pavimentos + Unidades + Vista da janela** daquela torre.
3. Distância entre torres e o Total geral.
4. Plantas por tipologia.
5. Decorado por tipologia.

Com 2 torres de 200 unidades abertas, as tabelas ficam uma em cima da outra. Plantas e Decorado acabam no fim de
uma página de milhares de pixels.

Três detalhes do código pesam no desenho:
- **Os dados de pavimentos e unidades só existem depois de abrir a torre.** `floorsByTower` e `unitsByTower` são
  preenchidos pelos callbacks do `FloorEditor` e do `UnitEditor` quando eles montam. Por isso o card mostra "sem
  pavimentos" e não mostra a contagem de unidades até ser aberto. Separar as seções em abas, sem carregar esses dados
  no pai, quebraria:
  - o "Gerar a partir dos pavimentos", que lê `floors`;
  - a elevação na aba Unidades;
  - o `unidadesDaTorre` da Vista da janela.
- Trocar a aba do empreendimento com edição pendente pergunta antes. Isso usa `haPendenciaDeSaida()` + confirmar
  (`EmpreendimentoDetail.tsx:198`). A troca de sub-aba precisa da mesma guarda, porque o Terreno e os painéis de
  unidade desmontam ao trocar.
- O `TowerEditor` também é usado sem `empreendimento` (estudos, o `UnidadeUnicaEditor` fora do molde e o spike).
  Nesse caso Terreno, Vista e Tipologias já não aparecem hoje.

## Sugestão: 5 sub-abas, uma tabela grande por vez

Trilho `TabsBar` (`components/ui/TabsBar.tsx`, guia §19.1) no topo da aba:

| Sub-aba | Conteúdo | Contador |
|---|---|---|
| **Terreno** | `TerrenoSecao`, igual à de hoje | — |
| **Torres** | Os cards das torres (editar, excluir, obra vinculada). Ao abrir a torre, só os **Pavimentos**. Abaixo, Distância entre torres e Total geral | nº de torres |
| **Unidades** | Seletor de torre + `UnitEditor` de **uma** torre (com o Agrupar e o recolher todos do #745) | nº de unidades |
| **Vista da janela** | Seletor de torre + `VistasDaTorreSecao` | — |
| **Tipologias** | `PlantasPorTipologiaSecao` + `DecoradoPorTipologiaSecao`, uma sobre a outra | — |

Regras da troca de sub-aba:
- **Quais aparecem:**
  - Terreno, Vista e Tipologias só com `empreendimento`, a mesma condição de hoje;
  - Unidades, Vista e Tipologias só com pelo menos 1 torre (sem torre não há o que mostrar);
  - nos estudos, sem `empreendimento`, ficam só Torres e Unidades.
- **Seletor de torre:**
  - botões no mesmo desenho do "Pela posição / Pelas setas", com o nome da torre e a contagem ("Torre A · 17");
  - com 1 torre só, o seletor some;
  - a torre escolhida vale nas abas Unidades e Vista;
  - a contagem vem do `unitsByTower` carregado no pai.
- **A escolha da sub-aba fica no navegador** (`usePersistedState`, chave `empreendimentoTorres:aba`).
  - Na 1ª visita abre em Terreno, a 1ª do trilho, que é o que se via no topo até hoje.
  - Uma escolha gravada que não existe naquele contexto (por exemplo Vista num estudo) cai na 1ª aba disponível.
- **Guarda de saída:** a troca de sub-aba passa pelo mesmo `haPendenciaDeSaida()` + confirmar da aba do empreendimento.

## Itens

1. **Pai carrega os dados** (`TowerEditor.tsx`)
   - Ao carregar as torres, carrega também os pavimentos (`empreendimentoService.listFloorsDasTorres`, uma consulta)
     e as unidades de cada torre (`listUnits`).
   - Os callbacks `handleFloorsChange` e `handleUnitsChange` seguem atualizando o estado depois de editar.
   - *Pronto quando:* o card da torre fechado mostra pavimentos e unidades, e o Total geral aparece sem abrir nada.
2. **Sub-abas** (`TowerEditor.tsx`)
   - `TabsBar` com as 5 abas e as regras acima.
   - O conteúdo de cada seção é movido sem mudar: os mesmos componentes e as mesmas props.
   - O card da torre perde Unidades e Vista e fica só com Pavimentos.
   - Seletor de torre num pequeno componente local, usado por Unidades e Vista.
   - *Pronto quando:* `check-ui-standard.sh` passa no arquivo.
3. **Testes**
   - Adaptar `__tests__/components/TowerEditorTerrenoDaPlanta.test.tsx` e `TowerEditorTerrenoLocalizacao.test.tsx`, se
     dependerem da ordem.
   - Novo `__tests__/components/TowerEditorSubAbas.test.tsx` cobrindo:
     - abre em Terreno;
     - cada aba mostra só a sua seção;
     - a torre escolhida troca a tabela de Unidades;
     - "Gerar a partir dos pavimentos (N)" ligado na aba Unidades sem passar pela aba Torres (prova do item 1);
     - sem `empreendimento`, só Torres e Unidades;
     - troca com pendência pergunta antes.
4. **Guia**: anotar o caso na §19.1 (sub-abas dentro de uma aba do empreendimento). **Memória**: atualizar o ponteiro do
   módulo em `index_modulos.md`.

## Verificação
- `tsc --noEmit` limpo.
- `npx vitest run` nos testes do TowerEditor, UnitEditor, FloorEditor e no `orgContextGuard`.
- `check-ui-standard.sh` e `check-org-selector-guard.sh`.
- Navegador, porta 5193, no Garden, só leitura sem gravar:
  - percorrer as 5 abas;
  - trocar Torre A ↔ Torre B em Unidades e em Vista;
  - conferir "Gerar a partir dos pavimentos (16)" na Torre A direto em Unidades;
  - recarregar a página e voltar na mesma aba;
  - conferir que não há rolagem lateral em 1600 px;
  - medir a altura da página antes e depois.
- Publicar: PR → CI com todos os jobs verdes → eu faço o merge → `conferir-producao.sh` → fechar a frente.

## Estado

- [x] Item 1 — pai carrega pavimentos (`listFloorsDasTorres`) e unidades; o `UnitEditor` só avisa o pai depois de
  carregar (o `[]` do 1º render zerava as contagens).
- [x] Item 2 — sub-abas, seletor de torre, guarda de saída; `check-ui-standard.sh` limpo.
- [x] Item 3 — `TowerEditorSubAbas.test.tsx` (6) + Terreno/UnidadeUnica adaptados.
- [x] Item 4 — guia §19.1.
- [x] Navegador (Garden, 1600 px, sem gravar): trilho Terreno · Torres 2 · Unidades 43 · Vista da janela · Tipologias; cards fechados já com "17 unid." / "26 unid." e o Total geral (43); Unidades da Torre A com "Gerar a partir dos pavimentos (16)" ligado sem passar por Torres; Torre B troca a tabela (26 linhas); Vista segue a torre escolhida; recarregar volta em Tipologias; sem rolagem lateral.
- [ ] Publicação.
