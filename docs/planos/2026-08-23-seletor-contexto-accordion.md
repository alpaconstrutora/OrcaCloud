# Seletor de contexto do topo → accordion multi-nível com ícones

## Pedido original

Sessão de 2026-08-23, primeira mensagem do usuário, transcrita literalmente:

> Seletor de organização no topo da página: aplicar accordion (Multi-level with Icon
> Multi-level accordion with icons on parent items):
> primeiro nível: organização
> Segundo nível: empreendimentos
> Terceiro nível: obra

## Contexto

O seletor de contexto do topo (`components/Layout.tsx:1346-1442`, antes desta mudança)
era um dropdown caseiro com **lista plana em três blocos independentes**: Organização
(+ "Todas"), "Consolidado (sair da obra)" e Empresas. Ele não mostrava a hierarquia real
do produto — Organização → Empreendimento → Obra — e as obras **não apareciam**: dava
para *sair* de uma obra pelo topo, nunca para *entrar* nela.

Decisões tomadas com o usuário na mesma sessão (via AskUserQuestion):

- **Empreendimento (2º nível) é só agrupador** — expande/colapsa, não vira contexto ativo.
  Não foi criado `activeEmpreendimentoId`; nenhuma tela precisou mudar.
- **Empresas viraram sub-nível da organização** (nó irmão dos empreendimentos), em vez de
  bloco separado.
- **Obras sem empreendimento** ficam num nó "Sem empreendimento" no fim de cada organização.

## Estrutura entregue

```
[ 🔍 Buscar organização ou obra ]
  ⬡  Todas as organizações                  ← só com mais de uma organização
  ⬡  Consolidado (sair da obra)             ← só com obra ativa
▾ 🏢 Alpa Construtora                       ← N1 (chevron expande; rótulo seleciona a org)
    ▾ 🏛 Residencial Aurora        2        ← N2 (só expande)
         🦺 Torre A                         ← N3 (seleciona a obra)
         🦺 Torre B
    ▸ 📁 Sem empreendimento        2        ← N2
    ▸ 💼 Empresas                  2        ← N2 → empresas em N3
▸ 🏢 Beta Incorporadora
```

## Itens

### 1. `hooks/useContextTree.ts` (novo) — ✅ concluído

Monta a árvore. Carrega sob demanda, na primeira abertura do painel (quatro queries),
com cache em memória e invalidação quando a lista de organizações muda.

**Não usa `useStore().projects` nem `useStore().companies`**: as duas listas já vêm
recortadas pela organização ativa (`fetchProjects` filtra por `activeOrganizationId`;
`setActiveOrganizationId` zera `companies`), então numa árvore de todas as organizações
só o nó da org ativa ficaria povoado. Busca direta sem filtro de org, RLS recorta —
mesmo precedente de `components/empreendimento/VinculacoesTab.tsx:194-199`.

Fontes: `projectService.listProjects(undefined, undefined, true)` + `onlyObras` (regra #3;
o service já corta projeto de sistema, regra #2), `empreendimentoService.list(undefined)`,
`empreendimentoService.mapObrasToEmpreendimentos(undefined)` (cobre os **dois** caminhos de
vínculo: obra principal e obra por torre) e `companyService.list(undefined)`.

A montagem foi extraída para `buildContextTree()`, função pura exportada — é o que o teste
exercita.

**Pronto quando:** `__tests__/contextTree.test.ts` passa. ✅ 9/9.

### 2. `__tests__/contextTree.test.ts` (novo) — ✅ concluído

Cobre as armadilhas conhecidas do módulo: vínculo órfão (as colunas não têm FK),
empreendimento em SPE com a obra na organização do grupo, obra ligada por torre,
descarte de orçamento/planejamento, ordenação e empresas.

**Pronto quando:** 9 testes verdes. ✅

### 3. `components/ContextSelector.tsx` (novo) — ✅ concluído

Substitui o bloco inline do `Layout.tsx`. Sem props de contexto — lê do store (regra #5).

- Rótulo do botão preservado, com a mesma cascata e os comentários que registram os bugs
  já corrigidos (ordem obra × organização).
- Expansão persistida em `contextSelector:expanded` via `usePersistedState`; busca em
  `contextSelector:search` (§3).
- Ao abrir, auto-expande o caminho do contexto ativo (organização e o empreendimento da
  obra carregada).
- Com busca ativa, tudo aparece expandido.
- **Correções que o painel antigo não tinha:** fecha ao clicar fora, fecha no `Escape`,
  `aria-expanded`/`role="menu"`.
- Escolher um filho fixa o ancestral: obra e empresa também definem a organização, nessa
  ordem (`setActiveOrganizationId` zera a empresa ativa, então vem primeiro).
- "Consolidado (sair da obra)" mantido — é o único caminho de saída da obra.

**Pronto quando:** o painel mostra os três níveis e a troca de contexto reflete no store.
✅ verificado em harness Playwright (ver Verificação).

### 4. `components/Layout.tsx` (edição) — ✅ concluído

Bloco de 97 linhas removido e trocado por `<ContextSelector />`; `isHeaderEmpresaDropdownOpen`
e os setters que ficaram órfãos (`setProjectId`, `setActiveOrganizationId`) saíram do arquivo.
O seletor deixou de ser `hidden lg:block` — agora aparece também no header mobile.

**Pronto quando:** `npx tsc --noEmit` limpo e nenhuma referência remanescente. ✅

## Verificação executada

| Verificação | Resultado |
|---|---|
| `bash scripts/check-ui-standard.sh components/ContextSelector.tsx components/Layout.tsx` | ✅ sem violações |
| `bash scripts/check-project-classification.sh` (arquivos novos) | ✅ |
| `bash scripts/check-system-projects.sh` (arquivos novos) | ✅ |
| `npx vitest run __tests__/orgContextGuard.test.ts` | ✅ 14/14 |
| `npx vitest run` (suíte completa) | ✅ 1579 passed, 24 skipped |
| `npx tsc --noEmit` / `npm run build` | ✅ |

Harness visual (Playwright sobre um `__ui_harness_context.html` temporário, já removido),
com duas organizações, três empreendimentos, seis obras e três empresas:

- três níveis renderizam e expandem; auto-expand revela a obra ativa; ✅
- obra vinculada a empreendimento de **outra** organização cai em "Sem empreendimento" da
  organização dela; ✅
- busca ("lambert") filtra e expande os ancestrais; ✅
- clicar numa obra de outra organização troca as duas coisas no store; ✅
- escolher empresa de outra organização **não** zera `activeEmpresaId`; ✅
- clicar fora e `Escape` fecham; expansão sobrevive ao reload; ✅
- em 390px de largura o painel cabe na viewport (ancoragem à direita abaixo de `sm`). ✅

## O que ficou de fora

- Navegação por teclado dentro do painel (setas). Existe `role="menu"`/`aria-expanded`,
  mas não roving tabindex.
- Empreendimento continua sem ser contexto ativo — decisão do usuário nesta sessão. Se um
  dia virar, o lugar é `store/useStore.ts` + a cascata de `hooks/useOrgContext.tsx`.
