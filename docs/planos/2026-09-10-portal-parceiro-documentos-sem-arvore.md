# Portal do Parceiro › Documentos — sai a árvore lateral, entram os selects do GED

**Frente:** `parceiro-documentos-arvore`
**Data do pedido:** 10/09/2026

---

## Pedido original

Mensagem do usuário, transcrita literalmente:

> a aba documentos no portal do parceiro na visão do parceiro ainda contem o painel laterial esquerdo com o tree que ja nao existe mais no GED. Atualizar

---

## O que eu errei antes de começar — e por quê vale registrar

Li `components/OpuraDocsModule.tsx` no **checkout de integração**
(`C:\D\ORÇACLOUD\orçacloud-saas`) e achei o comentário `PAINEL LATERAL ESQUERDO:
Árvore de Disciplinas/Pastas` bem vivo. Concluí que o GED **ainda tinha** a
árvore e que o usuário estava enganado.

O checkout de integração estava **116 commits atrás** de `origin/main`. O GED
de verdade tirou a árvore em `b19f216c` ("sai o painel lateral de pastas e
disciplinas; a tabela ocupa a tela"). Só vi isso abrindo as duas telas no
navegador, a partir da frente — que é criada de `origin/main`.

**Regra que sai daí:** o checkout de integração não é fonte para LER, só para
abrir frente. Ler dele é ler o passado com a confiança de quem lê o presente.
Ver REGRA #8 e `project_regra8_checkout_velho_sem_hooks`.

---

## O alvo (o GED de hoje, medido na tela)

Toolbar da tabela: busca · **`Todas as pastas`** (select, hierarquia na
indentação do rótulo) · **`Todas as disciplinas`** (select, rótulo
`CÓDIGO — Nome`) · atualizar · Filtros · colunas · autofit. Tabela na largura
toda. Sem painel lateral.

Regra de produto fixada em `b19f216c`: **pasta e disciplina valem JUNTOS**
(AND). A anterior — "disciplina manda mais que pasta" — existia só porque
clicar numa disciplina da árvore setava a pasta junto.

---

## Itens

### 1. `components/partner/PartnerPortal.tsx`

**O que muda**
- Sai a coluna `lg:col-span-1` com a árvore "Pastas e disciplinas", e com ela
  `renderPortalFolderNode`, `expandedNodes` e o efeito de auto-expandir,
  `rootFolders`, `hasNoFolderDocs`, o bucket `NO_FOLDER` ("Sem pasta" — o GED
  também deixou de ter, em `5b00c758`), `getDisciplineColor` e dois ícones que
  só a árvore usava.
- O memo `tree` (contadores da árvore) vira `relevantFolderIds` +
  `folderSelectOptions` + `disciplineFilterOptions`, na mesma forma dos do GED.
- Entram os dois selects na toolbar, entre a busca e "Filtros", com as mesmas
  classes do GED e o acento do parceiro no foco.
- O filtro já combinava pasta e disciplina em AND — fica um comentário
  apontando a regra, para não voltar.

**Como sei que terminou**
- [x] `tsc` exit 0; `check-ui-standard.sh` limpo.
- [x] Na tela real (servidor novo em 3190, PID 228304 provado, `127.0.0.1`,
      `serviceWorkers:'block'`), link do parceiro AFONSO H VILELA:

      | | antes | depois |
      |---|---|---|
      | árvore "Pastas e disciplinas" | presente | **ausente** |
      | select pasta | — | `Todas as pastas`, `Projetos` |
      | select disciplina | — | `Todas as disciplinas`, `CON — Contenções`, `SON — Sondagem` |
      | filtrar por CON | — | **5 → 4 linhas** |
      | largura da tabela | 3/4 | **inteira** (aparecem Obra Vinculada, Emissão, Validade, Status) |

      Zero erros de console.
- [x] `__tests__/components/PartnerPortalDocumentosToolbar.test.tsx` — 5 casos:
      a árvore não volta; hierarquia na indentação; rótulo `CÓDIGO — Nome`;
      pasta filtra a subárvore; **pasta E disciplina em AND** (cruzamento vazio
      quando não há doc que satisfaça os dois).

### 2. Verificação

- [x] `npm run test` → 231 arquivos / 3463 testes antes do teste novo, 0 falhas.

---

## Fora de escopo

- As ações que o GED colou nos selects (compartilhar pasta, editar, excluir,
  compartilhar disciplina) — são ações de quem ADMINISTRA o GED; o portal do
  parceiro é leitura.
- Migrar o Portal do Parceiro para o `PortalKit` (§24).
