# Condomínio › Manutenção — gerenciar Sistemas prediais (CRUD) a partir do campo

## Pedido original

Sessão de 15/10/2026 (VS Code), transcrito literalmente:

> comercial > condominios > manutencao > gaveta Novo item do plano:
>  1. campo Sistema predial: implementra gerenciamento CRUD

## O que existia

- O campo era um `<select>` nativo sobre `building_systems` (por organização).
  Não havia tela nenhuma para cadastrar, renomear ou tirar um sistema: com a
  lista vazia, o aviso dizia para rodar o "bloco 9 da migration" — SQL na mão.
- `building_systems` (migration `aplicar_20270905000018`): `UNIQUE (organization_id, slug)`,
  RLS `is_org_member` nas 4 operações. O `slug` é a chave do catálogo de itens
  padrão (`CATALOGO_MANUTENCAO`) — renomear não pode trocá-lo.
- Quem aponta para o sistema: `maintenance_plan_items` e `opura_assets`
  (FK `ON DELETE SET NULL`) e `maintenance_orders` (coluna **sem FK** — excluir
  um sistema usado deixaria id órfão nas ordens).

## Decisões

- **O campo vira um seletor em drawer** (`BuildingSystemSelect`), a única
  exceção de drawer sobre drawer do UI_PATTERNS §4 (seletor de campo, por
  portal, Esc fecha só ele). O CRUD mora dentro dele: busca, cadastrar,
  editar (nome + norma), desativar/reativar, excluir. Escolher fecha.
- **Organização = a do registro** (`empreendimento.organization_id`), nunca
  perguntada — o mesmo `orgId` com que a aba já lê a lista (REGRA #5).
- **Excluir só o que ninguém usa.** Antes de excluir conta itens de plano,
  ativos e ordens; se houver uso, oferece **desativar** (some da escolha nova,
  continua no que já aponta para ele). Sem isso o `SET NULL` desligaria itens
  e ativos calado, e as ordens ficariam com id órfão.
- **Lista vazia oferece cadastrar os 12 sistemas da NBR 14037** (a semente que
  estava comentada no bloco 9), em vez de mandar rodar SQL. Upsert com
  `ignoreDuplicates` em `(organization_id, slug)`.
- **Slug nasce do nome** ao cadastrar (sem acento, `_`→ hífen) e não muda ao
  renomear. Nome repetido (sem caixa/acento) é recusado na tela, apontando o
  existente — inclusive se estiver inativo.
- Sistema inativo não entra na proposta de "Criar plano de manutenção".

## Itens

1. **Funções puras** (`services/maintenanceCatalog.ts`): `SISTEMAS_PADRAO`,
   `slugDoSistema`, `slugLivre`. — Pronto quando: teste unitário cobre acento,
   espaço, colisão de slug.
2. **Service** (`maintenanceService`): `updateSystem`, `deleteSystem`,
   `countSystemUsage`, `seedDefaultSystems`. — Pronto quando: tsc limpo.
3. **`components/condominio/BuildingSystemSelect.tsx`** com o CRUD. — Pronto
   quando: na tela real, cadastrar/editar/desativar/reativar/excluir funcionam
   e o item do plano grava o sistema escolhido.
4. **ManutencaoTab**: o campo do "Novo item do plano" (e o da "Nova ordem",
   mesma lista) usa o seletor; renomear atualiza a coluna Sistema das tabelas
   sem recarregar (§22); avisos "bloco 9 da migration" trocados. — Pronto
   quando: check-ui-standard + tsc + vitest passam.

## Fora do escopo (não feito)

- Mesmo campo em Condomínio › Ativos (`AtivosTab`, edição em lote) continua
  `<select>` — pode adotar o componente depois.
- Reordenar sistemas (`sort_order`): novo entra no fim.

5. **Defeito achado na conferência visual — `ui/sheet.tsx`.** Com o seletor
   aberto, cadastrar/excluir re-renderiza o pai; o `onClose` inline do
   formulário mudava de identidade, o efeito da pilha rodava de novo e punha o
   formulário de volta no TOPO — o Esc fechava a gaveta de baixo e deixava o
   seletor aberto. A pilha agora segue só a ordem de abertura (o fechamento
   atual vem por ref). Vale para todo seletor em drawer do app. — Pronto
   quando: `__tests__/components/SheetPilhaEscape.test.tsx` falha sem o
   conserto e passa com ele; Esc no harness fecha só o seletor.

## Andamento

- 15/10/2026 — itens 1–5 feitos, na frente `condominio-sistema-predial-crud`:
  - item 1: `__tests__/sistemaPredialCatalogo.test.ts` (7 testes) passa;
  - item 2: `tsc --noEmit` sem erro; o `ON CONFLICT (organization_id, slug) DO
    NOTHING` do "cadastrar padrão" provado no banco em transação desfeita
    (existente ignorado, novo inserido, 0 linhas sobrando);
  - item 3: `__tests__/components/BuildingSystemSelect.test.tsx` (7 testes) +
    conferência por print no harness `docs/spikes/sistema-predial-crud/`
    (`ManutencaoTab` real, banco stubado pelo Playwright — `conferir.cjs`):
    cadastrar já escolhe, editar, desativar com o aviso de uso, reativar,
    excluir, estado vazio, item salvo com o sistema novo;
  - item 4: `check-ui-standard.sh` sem violação nos 3 arquivos de tela;
    `orgContextGuard` passa; suíte inteira 9.621 ✓ / 0 ✗;
  - item 5: teste de regressão falha sem o conserto, passa com ele.
  - Conferência LOGADA (agente-leitura, frente local contra o banco real,
    010 - Galeria Altavista): os 12 sistemas reais listados; cadastrar já
    escolhe; "elevadores" recusado como repetido; excluir "Elevadores" mostrou
    a contagem REAL ("2 itens de plano, 2 ordens de serviço") e ofereceu
    desativar; excluir o sistema sem uso confirmou e limpou o campo; Esc fechou
    só o seletor. Escritas de `building_systems` respondidas pelo roteiro,
    nenhuma outra escrita REST; banco conferido depois (12 sistemas, 0
    desativados, nada de teste sobrando).
  - **Não verificado ainda:** produção (a frente não foi publicada).
