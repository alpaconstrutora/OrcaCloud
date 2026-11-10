# Abas pelo teclado

## Pedido original

> Corrigir abas

(10/11/2026, logo depois do polish da negociação, cujo relatório dizia: "a barra de abas
usada em outras 53 telas ainda não anda pelas setas; só esta negociação ganhou o recurso".)

## Problema

`TabsBar` (`components/ui/TabsBar.tsx`, ~50 telas) e `TabsList`/`TabsTrigger`
(`components/ui/tabs.tsx`) diziam ao leitor de tela que eram abas (`role="tablist"`/`"tab"`),
mas o teclado não seguia o padrão de abas: o Tab parava em cada aba e as setas não faziam
nada. Os botões não tinham `type="button"` (dentro de um `<form>`, escolher aba enviaria o
formulário) nem anel de foco. Três trilhos feitos à mão (painel e Ribbon da Planta, Extrato
do Síndico) tinham o mesmo defeito.

## Feito

- `components/ui/abasPeloTeclado.ts`: `moverEntreAbas` (←/→ dando a volta, Home/End; foco +
  `click()`, então a escolha passa pelo mesmo `onClick` do mouse) e `tabIndexDaAba` (só a
  ativa no Tab; sem nenhuma ativa, a primeira).
- Aplicado em `TabsBar` (anel na cor do `accent`), `TabsList`/`TabsTrigger`, `AbasDoPainel`,
  `Ribbon`, `PainelExtratoDoSindico`; `DealModal` troca a cópia local pelo módulo.
- Venda de Ativos (`SalesModule`): o trilho de 8 abas copiado à mão (sem papel de aba) virou
  `TabsBar`.
- Sem mudança: galeria do Decorado (`DecoradoDaUnidade`) e app de Tarefas
  (`TasksMobileApp`) já tratavam as setas. A Planta só ouve setas com o desenho em foco
  (`BlueprintCanvas`), então as setas nas abas não movem a seleção.
- Teste: `__tests__/components/abasPeloTeclado.test.tsx` (TabsBar real: Tab só na ativa,
  setas, volta nas pontas, Home/End, valor fora da lista, não envia formulário).

## Pendente

46 arquivos ainda copiam o trilho à mão (`bg-gray-50 p-1 rounded-[10px] border
border-gray-100 gap-1` fora do `TabsBar`), sem papel de aba — ex.: subabas "Planos |
Rentabilidade" de Venda de Ativos. Parte deles é ABA (troca a vista) e parte é SELETOR
(grade/lista, PF/PJ, filtro) — converter às cegas faria seletor virar aba. Cada um precisa
ser classificado antes; fica para uma frente própria.

## Estado

- [x] Tratador compartilhado + componentes + Venda de Ativos — conferido no dev local com
  escritas bloqueadas (Venda de Ativos: → duas vezes de Negociações chega a Planos de vendas,
  com foco e anel; negociação: End → Contrato, → na ponta volta a Dados do Cliente).
- [ ] Os 46 trilhos copiados à mão.
