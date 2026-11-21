# Empreendimentos: Objetivo "Serviço" e botão expandir/recolher

## Pedido original (21/11/2026, sessão Claude Code)

> tela Empreendimentos:
> 1. Objetivo: incluir item Serviço.
> 2. implementar botão expandir/recolher.

### Decisão do usuário (AskUserQuestion, mesma sessão)
- **Serviço não mostra nenhum espelho.** É obra ou prestação de serviço para terceiro, sem unidade à venda e sem unidade para locar, então as abas Espelho de Vendas e Espelho de Locações somem da ficha. Se houver unidade publicada, o campo avisa quantas, como já faz para Vendas e Locação.

## Contexto
- O Objetivo nasceu em 21/11 (`docs/planos/2026-11-21-empreendimento-visao-geral-objetivo.md`), com `VENDAS | LOCACAO | MISTO` e a regra em `utils/empreendimentoObjetivo.ts`.
- A lista (`EmpreendimentoModule.tsx`) tinha um agrupamento feito à mão: `FilterPopover` com botão próprio de ordem e sem "recolher/expandir todos". O guia §6.12 manda telas assim usarem as peças comuns (`useAgrupamento`, `AgruparControles`, `LinhaDeGrupo`, `agruparLinhas`).

## Itens

### 1. Migration `aplicar_20271121997500_empreendimento_objetivo_servico.sql`
Nasceu `…996000…`, mas outra frente publicou `aplicar_20271121996000_unidade_de_medida_nova.sql` antes. Como cheguei depois, eu é que mudei o número. A migration é idempotente, e o banco já a tinha recebido sob o número antigo.
Troca o CHECK `empreendimentos_objetivo_check` para `VENDAS | LOCACAO | MISTO | SERVICO`. É idempotente e não cria policy nem função, então a REGRA #7 não se aplica. É aplicada com `db query --linked -f` antes do push.
**Pronto quando:** `pg_get_constraintdef` lista os 4 valores.

### 2. Regra: `types/empreendimento.ts` e `utils/empreendimentoObjetivo.ts`
- `SERVICO` entra no tipo, em `OBJETIVOS` (depois de Misto) e em `ROTULO_DO_OBJETIVO` ("Serviço").
- `objetivoDe` reconhece o valor novo.
- `espelhosDoObjetivo('SERVICO')` devolve `{ vendas: false, locacoes: false }`.

**Pronto quando:** `__tests__/empreendimentoObjetivo.test.ts` cobre o Serviço.

### 3. Ficha: quem dependia de "pelo menos um espelho"
- `EmpreendimentoDetail.tsx`: as duas abas de espelho somem. A `abaDoEspelho` vira `null`, e a unidade única deixa de oferecer o link para o espelho.
- `SyncCenterTab.tsx`: sem espelho, o aviso diz que as pontes com Venda de Ativos e Locações não se aplicam. Antes, citava a aba Locações, que não existe nesse caso.
- `EmpreendimentoForm.tsx`: o aviso do campo cobre os dois espelhos escondidos ao mesmo tempo, e o texto de ajuda inclui "nenhum (Serviço)".

**Pronto quando:** `__tests__/components/EmpreendimentoDetailAbasObjetivo.test.tsx` mostra o Serviço sem nenhuma aba de espelho.

### 4. Lista: Agrupar com as peças comuns e o botão expandir/recolher
- Nova função pura `utils/empreendimentoGrupos.ts`, com as opções Tipo, Objetivo (na ordem do seletor), Status (na ordem do ciclo) e Organização (a chave é o id).
- `EmpreendimentoModule.tsx` passa a usar `useAgrupamento('empreendimentoList:agrupar')`, `AgruparControles` (seletor, Crescente/Decrescente e recolher/expandir todos, sempre visível e desligado com o motivo quando não há agrupamento) e `LinhaDeGrupo`.
- O total do grupo é a soma do VGV, e só aparece com a coluna VGV visível.
- Com a chave nova, a escolha antiga de agrupamento (`empreendimentoList:groupBy`, que guardava `''` como "sem grupo") não é lida, porque `''` seria tomado por "agrupando".

**Pronto quando:** `__tests__/empreendimentoGrupos.test.ts` passa e o botão recolhe e expande todos os grupos no navegador.

## Verificação
- `tsc` limpo, os testes acima, `check-ui-standard.sh` nos dois `.tsx` e o `orgContextGuard`.
- No app local:
  - Empreendimentos › Agrupar por Status: recolher todos, depois expandir todos, e alternar um grupo só.
  - A opção Serviço aparece no Objetivo da ficha, com o texto de ajuda novo. A conferência é feita **sem salvar**, para não gravar no histórico de um empreendimento real. Que as abas de espelho somem com Serviço fica provado pelo teste `EmpreendimentoDetailAbasObjetivo`.
- Publicação: PR, CI, eu faço o merge e rodo `conferir-producao.sh`.

## Estado
- [x] 1 (aplicada: CHECK com os 4 valores) · [x] 2 · [x] 3 · [x] 4 · [x] Verificação (tsc, 66 testes, check-ui nos 4 .tsx, guarda de org; navegador: recolher/expandir todos, um grupo, Decrescente, Serviço no seletor sem salvar) · [ ] Publicação
