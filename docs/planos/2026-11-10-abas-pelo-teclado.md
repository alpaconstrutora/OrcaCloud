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

Nada da lista original. Fora dela: trilhos de abas com OUTRO desenho (sublinhado, `bg-slate-100`
etc.) que não usam a classe do trilho padrão não foram varridos — o `OperacionalDetail` entrou
por usar o mesmo `TabBtn` do Operacional.

## Estado

- [x] Tratador compartilhado + componentes + Venda de Ativos — conferido no dev local com
  escritas bloqueadas (Venda de Ativos: → duas vezes de Negociações chega a Planos de vendas,
  com foco e anel; negociação: End → Contrato, → na ponta volta a Dados do Cliente).
- [x] Tratador compartilhado: PR #333, `4ad51ef`; `conferir-producao.sh` provou o domínio
  servindo `4ad51ef` com "Como conciliar".
- [x] Os trilhos copiados à mão (pedido do usuário, 10/11/2026: "Faça isso como próxima
  frente"). 57 ocorrências em 46 arquivos, classificadas uma a uma:
  - **Aba (38 + Operacional + OperacionalDetail):** trocam a vista inteira → `role="tablist"`
    + `moverEntreAbas`; cada botão `role="tab"`, `aria-selected`, Tab só na ativa,
    `type="button"`, anel de foco. Conciliação Bancária: era `role="navigation"` com
    `aria-current="page"` → `tablist`. Operacional e OperacionalDetail: o `TabBtn` local.
  - **Seletor (12):** filtro, escopo ou modo (Contas a Pagar: conjunto e status; Dívida:
    camada e modo; Documentos do condomínio: arquivo/link; Fiscal: filtros; Corretor:
    finalidade, empreendimento, preço venda/locação; Ajuda dos portais: portal e tipo) →
    `aria-pressed` + `type="button"` + anel. Não viram aba.
  - **Já certos (6):** 2D/3D do estoque, base de atraso da Central do Cliente, período do
    Painel Financeiro, tipo de pessoa, leitura da análise (Vendas e Locação) — já tinham
    `aria-pressed`/`radiogroup`.
  - GED: "Ajustes do GED" abre uma janela — saiu de DENTRO do trilho de abas (aba inválida)
    para o lado direito da barra, junto de "Pendências", como botão secundário.
  - Conversão por script (`role`/atributos inseridos a partir da condição de "ativa" já usada
    na classe de cada botão), revisada por amostra; `typecheck` ok; `check-ui-standard` sem
    nenhuma violação NOVA em relação ao `main` nos 44 arquivos; GED conferido no dev local
    (← na primeira aba dá a volta até "Saúde Documental", com anel).
  - Testes: `EmpreendimentoDetailCuradoria` e `WarrantyModule` achavam as abas como `button` →
    `tab` (inclusive a checagem NEGATIVA "a aba Análise sai do DOM", que com `button` passaria a
    ser verde sem testar nada). Suíte: só `espelhoDoInvestidor` (Windows, passa no CI).
