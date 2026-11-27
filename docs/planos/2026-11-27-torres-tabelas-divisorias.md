# Torres & Unidades › tabelas Pavimentos e Unidades no padrão de divisórias do app

## Pedido original (27/11/2026)

> incorporação > empreendimento > torres e unidades: Analise esta tela do ponto de vista UI/UX.
> A tabela Pavimentos tem uma linha cinza bastante fraca dividindo cada linha e colunas. Qual a melhor pratica
> UI/UX? Manter assim com visual mais limpo ou com uma cor um pouco mais forte?

## Diagnóstico

O guia (§6.11 e o padrão do `<tbody>`) já define o meio-termo. As duas tabelas da aba estavam fora dele:

| Parte | Guia | Pavimentos / Unidades (antes) |
|---|---|---|
| Fundo do cabeçalho | `bg-white` (§6.11, cinza lia como "desabilitado") | `bg-gray-50/50` / `bg-gray-50` |
| Rótulo do cabeçalho | `text-gray-700` (a cor das células) | `text-gray-500` |
| Linha entre linhas | `divide-y divide-gray-200` | `border-gray-50` (contraste ~1,04:1, praticamente invisível) |
| Divisória entre colunas | `border-r border-gray-100` | nenhuma |

## Correção

- `components/empreendimento/FloorEditor.tsx` e `UnitEditor.tsx` passam ao padrão:
  - cabeçalho branco com rótulo `text-gray-700` e linha `gray-200` embaixo;
  - `divide-y divide-gray-200` entre as linhas;
  - `border-r border-gray-100 last:border-r-0` nas células.
- Nas Unidades, a linha de cabeçalho do grupo fica sem divisórias verticais (é um rótulo, não dados) e mantém o
  fundo `gray-50/70`.

*Pronto quando:*
- `check-ui-standard.sh` fica limpo nos dois arquivos;
- os testes do UnitEditor, FloorEditor e TowerEditor e o `cabecalhoSemCinzaGuard` passam;
- no navegador, as cores calculadas batem com o guia.

## Estado
- [x] Código, testes (38), check-ui
- [x] Navegador (Garden): cabeçalho `rgb(255,255,255)`, texto gray-700, linha entre linhas gray-200, divisória de
  coluna gray-100 nas duas tabelas
- [ ] Publicação
