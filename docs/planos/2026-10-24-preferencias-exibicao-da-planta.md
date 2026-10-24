# Preferências da Planta — o que se exibe (planta baixa, vistas, 3D) acompanha o usuário

## Pedido original

Sessão `9e26b316`, 23–24/10/2026, depois do PR #116 (aba Preferências na Planta):

> A aba preferência é exclusiva da planta inteligente . Então deve ficar apenas em Planta elétrica

Esclarecido em seguida: *"Escrevi errado . Aba preferência não é exclusiva da planta elétrica , mas sim da planta
inteligente em geral"*.

À proposta de trazer as ~40 chaves do menu Vista › Exibir (hoje só no navegador) para a aba Preferências,
acompanhando o usuário em qualquer computador: **"Sim"**. Ao desenho apresentado: **"aprovado"**.

## Desenho aprovado

1. Cada chave de EXIBIÇÃO vira preferência do USUÁRIO na tabela `preferencias` (sem tabela nova), chave
   `planta.exibir.<item>`.
2. A aba Preferências ganha os grupos **Planta baixa**, **Vistas**, **3D** e **Estilos**, além de Elétrica.
3. O menu Vista › Exibir continua igual (atalho rápido); ele e a aba mostram a MESMA escolha.
4. Ninguém perde o que já escolheu: sem linha no banco e com valor no navegador (`blueprint:*`), vale o do navegador,
   gravado no banco uma vez.

Fica de fora: estado de trabalho (aba aberta, vista atual, pavimento, seções, acesso rápido, `filtroDeFase`,
`casasDaLegenda`) e hipóteses de projeto (gerador, guarda-corpos, rodapés, vagas, mobiliário, insolação, eletrodutos…).

**Pronto quando:** desligo "Grade" e "Eixos" num computador, abro a planta em outro e continuam desligados; a mesma
chave aparece igual no menu Exibir e na aba Preferências.

---

# Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans. Passos com caixa (`- [ ]`).

**Objetivo:** as chaves do Vista › Exibir passam a ser preferências do usuário (banco), editáveis também na aba
Preferências da Planta.

**Arquitetura:** catálogo puro de itens de exibição (`utils/preferencias/catalogoExibir.ts`); hook
`usePreferenciaDaPlanta(item)` com a MESMA assinatura de `usePersistedState` (troca mecânica no editor), lendo a
mesma query de linhas USUARIO do `usePreferenciasEletricas`; migração única do navegador; gaveta com os grupos.

**Stack:** React 19 + TS strict, TanStack Query, Supabase (`preferencias`, escopo USUARIO — RLS já existente), Vitest.

**Spec:** a primeira metade deste arquivo. Base: `docs/planos/2026-10-22-preferencias-planta-eletrica.md`.

## Restrições globais

- SEM migration: a tabela `preferencias` e a RLS já existem (CHECK `chave LIKE 'planta.%'`, `length(chave) <= 100`,
  `pg_column_size(valor) <= 1024`).
- O PADRÃO de cada item é EXATAMENTE o valor padrão que o `usePersistedState` dele usa hoje em
  `components/blueprint/BlueprintEditor.tsx` (copiar do código; não inventar). Sem nada gravado e sem nada no
  navegador, a planta abre IGUAL a hoje.
- Chave no banco: `planta.exibir.<item>`; `<item>` = a chave antiga sem o prefixo `blueprint:` (ex.:
  `blueprint:mostrarGrade` → `planta.exibir.mostrarGrade`; `blueprint:vista3dTerreno:v2` → `planta.exibir.vista3dTerreno`).
- Valor gravado: o mesmo tipo do estado (boolean; texto para estilos/modo de cor; `null` só no terreno 3D = automático).
  Valor fora do tipo/opções do catálogo → padrão, nunca lança.
- REGRA #5: não depende de organização (escopo USUARIO). Avisos por `useToast` (provider global).
- REGRA #1: `docs/ui_ux_guia_unificado.md` antes da tarefa 4; `scripts/check-ui-standard.sh` nos `.tsx` tocados.
- Teste de componente: `// @vitest-environment jsdom` na primeira linha.

## Foco de revisão

1. Dois menus (planta e vista) ligam a MESMA chave (`mostrarEixos`, `cotasSubRegioes`, `mostrarMedidasLoteMassa`,
   `mostrarPreenchimentoTerreno`): mudar num muda no outro e na aba — teste na tarefa 3.
2. Leitura do banco falha → a planta abre com o valor do navegador/padrão (não em branco, não tudo desligado) — teste
   na tarefa 2.
3. Migração do navegador roda UMA vez (não regrava a cada render nem a cada aba aberta) e não sobrescreve escolha já
   no banco — teste na tarefa 2.
4. Clique rápido repetido numa chave termina igual ao banco (otimista + releitura, como na elétrica) — teste na tarefa 2.
5. Sem sessão (usuário deslogado no meio) → o valor local continua funcionando, sem gravar — teste na tarefa 2.

---

### Tarefa 1: Catálogo de exibição (puro)

**Arquivos:** criar `utils/preferencias/catalogoExibir.ts`; teste `__tests__/preferenciasCatalogoExibir.test.ts`.

**Interfaces (produz):**
```ts
export type GrupoDeExibicao = 'PLANTA' | 'VISTAS' | '3D' | 'ESTILOS';
export interface ItemDeExibicao {
  item: string;               // ex.: 'mostrarGrade' (chave antiga sem 'blueprint:' e sem ':v2')
  chaveAntiga: string;        // ex.: 'blueprint:mostrarGrade' (a do usePersistedState de hoje)
  rotulo: string;             // o MESMO rótulo do menu Exibir (ex.: 'Grade')
  grupo: GrupoDeExibicao;
  tipo: 'booleano' | 'opcao' | 'automatico';   // 'automatico' = boolean | null (terreno 3D)
  opcoes?: readonly { valor: string; rotulo: string }[];   // só em 'opcao'
  padrao: boolean | string | null;
}
export const ITENS_DE_EXIBICAO: readonly ItemDeExibicao[];
export function chaveDeExibicao(item: string): string;                 // 'planta.exibir.<item>'
export function valorDeExibicao(linhas: readonly LinhaDePreferencia[], item: string): boolean | string | null | undefined; // undefined = sem escolha válida
export function linhasParaMigrar(linhasDoUsuario: readonly LinhaDePreferencia[], lerDoNavegador: (chaveAntiga: string) => unknown): { chave: string; valor: boolean | string | null }[];
```
Itens: TODOS os `ligado:` dos dois `<MenuExibir>` do editor (planta e vista/3D: ver `grep -n "<MenuExibir" components/blueprint/BlueprintEditor.tsx`)
cujo estado vem de `usePersistedState('blueprint:…')`, mais `estiloPlanta`, `vista3dEstilo` (opções = os valores
que o código aceita hoje) e `modoDeCor` (opções `'AMBIENTE' | 'NENHUM'`, rótulo "Uma cor por ambiente"). O terreno 3D
(`blueprint:vista3dTerreno:v2`, `boolean | null`) entra como `'automatico'`. "Camadas por disciplina" (`secoes.camadas`)
NÃO entra (é seção do painel). Um item repetido nos dois menus aparece UMA vez (grupo do menu da planta).

- [ ] **Passo 1:** testes que falham: sem item repetido; toda `chaveAntiga` começa por `blueprint:`; `chaveDeExibicao('mostrarGrade') === 'planta.exibir.mostrarGrade'` e todas ≤ 100 caracteres; `valorDeExibicao` devolve o booleano gravado, `undefined` sem linha / com valor de outro tipo / com opção fora de `opcoes`, e `null` no item `'automatico'` com `null` gravado; `linhasParaMigrar` devolve só itens SEM linha no banco e COM valor válido no navegador (JSON já parseado pelo chamador), e nada quando tudo já está no banco; um teste-trava que lê `BlueprintEditor.tsx` (fs) e confere que nenhuma `chaveAntiga` do catálogo ainda aparece num `usePersistedState(` do editor (fica vermelho até a tarefa 3 — marcar `it.todo`/`skip` nesta tarefa e ativar na 3).
- [ ] **Passo 2:** rodar → FAIL. **Passo 3:** implementar. **Passo 4:** PASS.
- [ ] **Passo 5:** commit `feat(preferencias): catálogo do que a planta exibe`.

### Tarefa 2: Serviço, hook e migração do navegador

**Arquivos:** modificar `services/preferenciasService.ts` (valor `boolean | string | null`; `gravarVarios`),
criar `hooks/usePreferenciaDaPlanta.ts`; testes `__tests__/preferenciasService.test.ts` (acrescentar),
`__tests__/components/usePreferenciaDaPlanta.test.tsx`.

**Interfaces:**
- Consome: tarefa 1; `preferenciasKeys.usuario(userId)` e o `queryFn` de linhas USUARIO já usados por
  `hooks/usePreferenciasEletricas.ts` (mesma chave = uma leitura só para os dois).
- Produz:
```ts
// services/preferenciasService.ts
gravar(escopo, dono, chave, valor: boolean | string | null, opcoes?: { apagarQuandoNull?: boolean }): Promise<void>; // hoje null apaga; o terreno 3D grava null de verdade → passa { apagarQuandoNull: false }
gravarVarios(linhas: readonly { chave: string; valor: boolean | string | null }[]): Promise<void>; // USUARIO, upsert único em lote
// hooks/usePreferenciaDaPlanta.ts
export function usePreferenciaDaPlanta<T extends boolean | string | null>(item: string): [T, React.Dispatch<React.SetStateAction<T>>];
export function useMigracaoDaExibicaoDaPlanta(): void;   // monta uma vez no editor
```
`usePreferenciaDaPlanta`: valor = banco (válido) → navegador (`chaveAntiga`, JSON) → padrão do catálogo. O setter é
otimista (`setQueryData`), grava em `planta.exibir.<item>`, e ao fim invalida a chave do usuário; falha → reverte e
avisa `Não foi possível salvar a preferência: <mensagem>`. Também espelha no `localStorage` (`chaveAntiga`) para quem
estiver sem sessão/offline continuar com a escolha. Sem sessão: só local, sem gravar.
`useMigracaoDaExibicaoDaPlanta`: depois da 1ª leitura bem-sucedida, `linhasParaMigrar` → `gravarVarios` UMA vez por
usuário por carga (guarda em módulo), e invalida a chave.

- [ ] **Passo 1:** testes que falham — serviço: `gravarVarios` faz UM `upsert` com N linhas USUARIO (`user_id` da sessão,
  `onConflict 'escopo,user_id,chave'`); `gravar(..., null, { apagarQuandoNull: false })` faz upsert com `valor: null`.
  Hook: sem linha no banco → valor do navegador; sem nenhum dos dois → padrão; com linha → banco vence o navegador;
  setter muda na hora e grava `planta.exibir.mostrarGrade`; falha → volta e avisa; leitura falha → navegador/padrão
  (foco 2); sem sessão → muda local e não chama o serviço (foco 5); dois cliques rápidos → termina igual ao banco
  (foco 4); migração: 1 chamada de `gravarVarios` com só os itens que faltam, e NENHUMA na 2ª montagem (foco 3).
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS + `__tests__/orgContextGuard.test.ts`.
- [ ] **Passo 5:** commit `feat(preferencias): o que a planta exibe acompanha o usuário (hook + migração)`.

### Tarefa 3: O editor lê e grava pelas preferências

**Arquivos:** modificar `components/blueprint/BlueprintEditor.tsx`; testes `__tests__/components/BlueprintEditor.test.tsx`
(e os que montam o editor), ativar o teste-trava da tarefa 1.

- [ ] **Passo 1:** trocar cada `usePersistedState('<chaveAntiga>', <padrao>)` dos itens do catálogo por
  `usePreferenciaDaPlanta('<item>')` (mesma tupla; tipos explícitos onde o estado é união). Montar
  `useMigracaoDaExibicaoDaPlanta()` uma vez no editor. Os menus Exibir NÃO mudam.
- [ ] **Passo 2:** testes — o teste-trava (nenhuma `chaveAntiga` do catálogo restante em `usePersistedState` no editor)
  passa; no editor, alternar "Grade" no menu Exibir chama a gravação de `planta.exibir.mostrarGrade`; "Eixos" no menu
  da planta e no da vista mostram o mesmo valor (foco 1); os testes existentes do editor seguem verdes (mockar o
  serviço de preferências onde já se mocka o hook da elétrica).
- [ ] **Passo 3:** rodar `BlueprintEditor.test.tsx` isolado e os de canvas/painel tocados → PASS; `tsc` 0.
- [ ] **Passo 4:** commit `feat(planta): Exibir lê e grava nas preferências do usuário`.

### Tarefa 4: Grupos na aba Preferências

**Arquivos:** criar `components/preferencias/SecaoExibicaoDaPlanta.tsx`; modificar `components/blueprint/BlueprintEditor.tsx`
(aba Preferências: grupo **Exibição** com o botão **"Planta, vistas e 3D"**; a gaveta "Preferências da Planta" passa a
mostrar a seção pedida — `secao: 'eletrica' | 'exibicao'`); teste `__tests__/components/SecaoExibicaoDaPlanta.test.tsx`
e o caso da aba em `BlueprintEditor.test.tsx`.

- [ ] **Passo 1:** ler `docs/ui_ux_guia_unificado.md` e `UI_PATTERNS.md`.
- [ ] **Passo 2:** testes — a seção lista os itens por grupo (títulos "Planta baixa", "Vistas", "3D", "Estilos") com
  o mesmo rótulo do menu Exibir; chave booleana usa o switch do repositório (`TableSwitch`); opção usa o seletor padrão;
  terreno 3D com "Automático | Ligado | Desligado"; clicar grava pelo hook; no editor, aba Preferências › "Planta,
  vistas e 3D" abre a gaveta na seção de exibição, e mudar "Grade" ali muda o menu Exibir (foco 1).
- [ ] **Passo 3:** FAIL → implementar → PASS; `check-ui-standard.sh` nos `.tsx` tocados.
- [ ] **Passo 4:** commit `feat(planta): aba Preferências com planta baixa, vistas, 3D e estilos`.

### Tarefa 5: Fecho

- [ ] **Passo 1:** `tsc` 0; suíte com relatório JSON e conta fechando, 0 falhas.
- [ ] **Passo 2:** prova por imagem no harness local (sem login): a aba e a gaveta.
- [ ] **Passo 3:** marcar este plano; levar as pendências que a memória manda marcar no próximo PR (#116, #117, #114);
  PR, CI, merge (eu faço o merge após a CI verde) e `conferir-producao.sh`.

## Estado
- [x] desenho aprovado ("aprovado", 24/10/2026)
- [ ] tarefas 1–5
- [ ] PR + CI
- [ ] publicação
