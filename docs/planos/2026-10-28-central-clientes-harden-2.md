# Central de Clientes — `harden` da crítica 2 (teclado nos seletores, estados)

## Pedido original

> /impeccable critique analise e dados > Central de Clientes

Sessão `1880c008-dd77-4f94-9d0d-2c1d01ed5ec4` · 28/10/2026. Crítica 2: **23/40** (antes 21/40);
registro em `.impeccable/critique/2026-10-28T12-55-11Z__components-centralcliente-tsx.md`.
Respostas do usuário às perguntas da crítica: escopo **"Tudo"**; gráfico **"Trocar por faixas
de atraso"**; limiar **"Os dois"** (30% do em aberto OU vencido há mais de 90 dias); termo
**"Em aberto"**. Ordem combinada: **"um de cada vez"** — este plano é o 1º (`harden`).

> Os três (Recomendado)

Resposta, 28/10, à pergunta "o seletor de cliente sem teclado tem o mesmo defeito no de
Fornecedor (28 telas) e no de Unidade (2): corrijo só o de cliente ou os três?".

## Achado no caminho (defeito meu, do #213)

O #213 deixou a gaveta fechada `inert`. Seletor que monta o `Sheet` FECHADO e abre um quadro
depois (`requestAnimationFrame(() => setShown(true))`) e usa `autoFocus` na busca perdeu o foco
inicial: o `autoFocus` dispara na montagem, ainda dentro do `inert`, e o navegador recusa
(conferido no Chrome: `focus()` dentro de `inert` = falso). Em produção desde o #213:
`SupplierSelect` (28 telas), `HierarchicalSelect` (gaveta), `BuildingSystemSelect`,
`VincularSuprimentosSheet`. `ClientSelect` e `UnitSelect` já focavam ao abrir (escaparam).

## Plano

1. **`hooks/useSeletorEmGaveta.ts`** (novo) — `useFocoAoAbrir(shown, ref)` e
   `useListaDeEscolhaPorTeclado(buscaRef)`: linha `tabIndex 0` + Enter/Espaço escolhe; ↓/↑ entre
   linhas (↑ na primeira volta à busca); ↓ na busca entra na lista; Enter na busca com texto
   escolhe o 1º resultado.
   - Pronto quando: teste de componente cobre abrir → foco na busca → ↓ → Enter escolhe.
2. **`ClientSelect`, `SupplierSelect`, `UnitSelect`** — linhas e busca pelo hook; `SupplierSelect`
   troca `autoFocus` por `useFocoAoAbrir`.
   - Pronto quando: no navegador, Tab/↓/Enter escolhem um cliente na Central sem mouse.
3. **`HierarchicalSelect` (gaveta), `BuildingSystemSelect`, `VincularSuprimentosSheet`** —
   `autoFocus` da busca → `useFocoAoAbrir`.
   - Pronto quando: abrir a gaveta deixa o cursor na busca (conferido em 1 tela real).
4. **`CentralCliente.tsx` — volta do recorte** — chip "Cliente: X ×" ao lado do título quando há
   cliente escolhido; recortar pela tabela leva o foco ao chip; Enter/clique no chip volta a
   "Todos os clientes" e devolve o foco à tabela.
   - Pronto quando: Enter numa linha de "Por cliente" → foco no chip → Enter → Todos, sem mouse.
5. **`CentralCliente.tsx` — estados** — esqueleto nos KPIs enquanto não há número (não mais
   "R$ 0,00 · nada em aberto"); erro do extrato dentro da gaveta com "Tentar novamente" (não
   mais "Sem lançamentos."); região `role="status"` anunciando o recorte carregado.
   - Pronto quando: conferido no navegador (rede lenta/erro forçado) e pelo DOM.

## Estado

- [x] 1 · hook — `SeletorEmGavetaTeclado.test.tsx` 7/7. A 1ª suíte inteira pegou 1 falha minha
  (`BuildingSystemSelect` "nome repetido"): o foco de 50 ms ROUBAVA o foco de quem já tinha clicado
  "Novo" e digitava o nome. Guarda: não foca se o foco já está dentro da gaveta (fora o próprio
  painel). Teste novo da guarda — provado nos dois sentidos (sem a guarda falha, com ela passa).
  Ressalva: o jsdom não tem `inert`, então o teste NÃO prova a regressão do foco; essa foi no navegador.
- [x] 2 · três seletores — navegador: Central de Clientes, Enter no gatilho → foco na busca (com `inert`
  real), 64 linhas escolhíveis, "wal" + Enter → Waldir, foco volta ao gatilho. Contas a Pagar › Novo
  pagamento avulso (seletor DENTRO de gaveta): fornecedor → foco na busca, 300 linhas, Esc devolve o
  foco. `UnitSelect` só por código/teste (mesmo hook).
- [x] 3 · foco ao abrir — navegador: Centro de Custo (`HierarchicalSelect`) no mesmo formulário →
  foco na busca. `BuildingSystemSelect` e `VincularSuprimentosSheet` só por código/teste (mesmo hook).
- [x] 4 · chip — navegador: Enter na linha "Waldir" → foco no chip "Cliente: Waldir… ×" (`:focus-visible`);
  Enter no chip → "Todos" e foco de volta na linha do Waldir.
- [x] 5 · estados — navegador, sequência pintada na carga medida a cada 20 ms: "sem tela → esqueleto →
  números" (antes: "R$ 0,00 · nada em aberto" e, antes da lista de clientes chegar, "Nenhum cliente
  cadastrado." — os dois falsos; o 2º achado aqui, não na crítica). Erro do extrato simulado
  (fetch rejeitado): alerta na gaveta + cabeçalho "não carregou"; "Tentar novamente" com a rede de
  volta carrega. Achado: o detalhe saía "[object Object]" (erro do Supabase não é `Error`) — corrigido
  com `mensagemDeErro()` nos 3 pontos. Anúncio: "Mostrando Todos os clientes: R$ 923.551,42 vencido de
  R$ 946.437,14 em aberto."

`check-ui-standard`: 4 avisos §3 (busca em `useState`) em `ClientSelect`, `SupplierSelect`,
`UnitSelect`, `HierarchicalSelect` — exceção documentada §3.1 do guia ("busca dentro de um seletor
(drawer de escolha) é transitória"), citada no código de cada um; linhas não alteradas aqui.

## Verificação

`tsc`; `check-ui-standard`; teste novo + suíte de componentes inteira (lição do #213: rodar
TUDO, não só a pasta); navegador em 127.0.0.1:3140 (Área do Desenvolvedor).
