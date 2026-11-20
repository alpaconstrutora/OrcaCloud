# Imovib — aba "Espelho de vendas" separada, tabela padrão (Grupo/ordenar/expandir/ajuste) e triângulo de alerta


## Pedido original (20/11/2026, sessão 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0)

> Aba receitas:
> 1. implementar filtro Grupo + botoes classificação e expandir/recolher. Incluir também botão de ajuste automático de largura de colunas
> 2. Criar triangulo de alerta como em engenharia > planejamento. A mensagem:
> 5 unidade(s) do espelho fora do VGV · 5 não vendável no empreendimento (ocultas na lista — Preferências). Para mudar o que é vendável, use a coluna "Vendável" em Empreendimento › Espelho de vendas.
> 3.A aba receita tem 4 sessões: tabela com as unidades; Curva de vendas; Perfil de recebimento e Distrato e inadimplência.
> Seria ideal ficar tudo em uma mesma tela, mas no caso do garden que são 38 unidades a tela ficou longa. Imagine um empreendimento com 100 unidades.
> Analise se seria melhor uma aba para unidades e outra para as outras 3 (Curva de vendas; Perfil de recebimento e Distrato e inadimplência).

Respostas (20/11): **duas abas**; triângulo **abre um painel com ações**.

## Contexto

A aba Receitas empilha a tabela do espelho (hoje `<table>` feita à mão em `components/ImovibSalesMapTab.tsx`) e as três
seções de premissas; com 38 unidades já empurra Curva/Perfil/Distrato para baixo, com 100+ some. A tabela não tem
Grupo, ordenação, expandir/recolher nem ajuste de largura (o padrão do app — §6.10/§6.12/§6.1.2). O aviso "fora do
VGV" é um banner âmbar grande; pelo guia (§5.3, "aviso persistente não vira banner") vira botão-ícone com contador.

## Desenho

**1. Duas abas** (`components/ImovibDetailView.tsx`, `ABAS_DO_ESTUDO`):
`… | Orçamento (CAPEX) | Espelho de vendas | Receitas | Capital | …`
- **Espelho de vendas** (id `espelho`): `ImovibSalesMapTab` sozinho (KPIs + tabela).
- **Receitas**: Curva de vendas, Perfil de recebimento, Distrato e inadimplência (o resto do `ImovibReceitasForm`),
  com uma linha no topo "VGV R$ X — do Espelho de vendas" (link para a aba) para não perder a referência.
- Avisos do motor que apontam o espelho (`espelho_sem_vinculo`) passam a ir para `espelho` (`ImovibAba` ganha
  `'espelho'`; rótulo no `ImovibAvisosBanner`); texto "Use "Alinhar" no Espelho de vendas".
  Pela memória "valor novo num enum": caçar quem trata `ImovibAba`/`'receitas'` um a um (`irPara`, rótulos de aba).

**2. Tabela padrão** — `ImovibSalesMapTab` troca a `<table>` por `components/ui/StandardTable.tsx`, que já traz
busca, `SortableHeader`, `AgruparControles` (Grupo + ordem dos grupos + expandir/recolher), `ColumnConfigButton` e
auto-ajuste (`cols.autoFit`). Modelo: `components/LaborPortal.tsx:681-800` (agrupamento como constante de módulo).
- `columns`: as 11 de hoje (Unidade, Torre, Andar, Á. priv., Preço, Vlr/m², Peso pos., Peso sol, Posição, Sol, Status),
  com `width`/`align`; `renderCell` mantém os selects de Posição/Sol/Status gravando na hora e as marcas
  "Não vendável…"/"Sem unidade…"/"fora do VGV"; o `<fieldset disabled={!pode}>` continua em volta.
- `sortValue` por coluna; `searchText` = nome + torre.
- `agrupamento` (constante): **Torre**, **Andar** (ordem numérica), **Status** (ordem do fluxo Disponível → Reservado →
  Vendido → Permutado), **No VGV** (Conta / Não vendável / Sem unidade); `padrao: 'torre'`; `valor` = o que a unidade
  soma no VGV (preço, ou área × preço/m² da torre; marcada = sem valor), `tituloTotal: 'VGV'`. Reusar
  `utils/agruparLinhas.ts` (`chavePorRotulo`…) — a regra pura vai para `utils/imovibEspelhoGrupos.ts`.
- `storageKey: 'imovib:espelho'`; filtro de não vendáveis da Preferência continua (antes do `rows`).

**3. Triângulo de alerta** (como `components/schedule/ScheduleHeader.tsx:447-467`): `ActionIconButton` com
`AlertTriangle`, tom `attention`, contador (`absolute -right-1.5 -top-1.5 … rounded-full`, âmbar), `title` = a
mensagem inteira; no `toolbarRight` do `StandardTable`. Só aparece com unidade fora do VGV. **Clique → Sheet**
"Unidades fora do VGV": a mensagem, contagem por motivo, botões **"Abrir Preferências"** (abre o
`ImovibPreferenciasSheet` do estudo — o `ImovibDetailView` passa `onAbrirPreferencias`) e, quando houver,
**"Remover as sem unidade no empreendimento"** (o `removerSemUnidade` de hoje, sem mudança). O banner âmbar sai.

## Arquivos

- `components/ImovibDetailView.tsx` — aba `espelho`, render, `onAbrirPreferencias` para o espelho.
- `components/ImovibReceitasForm.tsx` — tira o `ImovibSalesMapTab`; linha do VGV com link.
- `components/ImovibSalesMapTab.tsx` — `StandardTable` + agrupamento + triângulo + Sheet; banner removido.
- `components/ImovibEspelhoForaDoVgvSheet.tsx` (novo) — o painel.
- `utils/imovibEspelhoGrupos.ts` (novo) — chaves/ordem dos grupos e valor no VGV (puro, testado).
- `utils/imovibMotor.ts` — `ImovibAba` + `'espelho'`; aviso `espelho_sem_vinculo` → `aba: 'espelho'`.
- `components/ImovibAvisosBanner.tsx` — rótulo da aba nova.
- Testes: `__tests__/imovibEspelhoGrupos.test.ts` (novo), `__tests__/components/ImovibEspelhoForaDoVgv.test.tsx`
  (triângulo com contador e `title`; clique abre o painel; remover/abrir Preferências), `ImovibDetailEdicaoDeVersao`
  (aba "Espelho de vendas" existe antes de "Receitas"), `ImovibReceitasFormFoco` (sem o espelho).

## Verificação

1. TDD em cada item (teste vermelho antes): grupos/valor; triângulo/painel; abas; Receitas sem a tabela.
2. `npm run typecheck`; `npx vitest run imovib Imovib Espelho preferencias Guard guard rotulo campoAltura`;
   `bash scripts/check-ui-standard.sh` nos `.tsx` tocados; ler §5.2/§5.3/§6.10/§6.12/§6.1.2 do guia antes de editar.
3. Navegador (build da frente com o banco real, só leitura): Garden — aba Espelho de vendas com Grupo Torre
   (2 grupos, 14/24 un., totais = R$ 9,20 mi / R$ 15,80 mi), recolher/expandir, ordenar por Preço, ajuste de largura,
   triângulo "5", painel; aba Receitas com a linha do VGV e as 3 seções no topo. 1600 px e 390 px.
4. PR, CI, merge, `conferir-producao.sh "Unidades fora do VGV"`, plano atualizado.

## Estado (20/11/2026)

- [x] Código, testes vistos falhando antes, 137 arquivos / 1224 testes, `tsc` limpo, `check-ui-standard.sh` limpo nos 5 `.tsx`.
- [x] **Publicado no PR #599** (squash `fce2fccd7`, servido pelo domínio). Conferido em produção (só leitura, 0 gravações,
  0 erros): abas "… | Orçamento (CAPEX) | Espelho de vendas | Receitas | …"; espelho agrupado por Torre (Torre A 14 un.
  R$ 9.203.167 · Torre B 24 un. R$ 15.796.835); recolher/expandir, ordenar por Preço e ajustar largura funcionando;
  triângulo "5" com a mensagem no hover; painel com mensagem, contagem e "Abrir Preferências"; Receitas com
  "VGV R$ 25.000.002, do Espelho de vendas" e as 3 seções; 390 px sem rolagem horizontal da página.
- Observado, não mexido: o KPI "Total Unidades" do espelho conta 43 (inclui as 5 não vendáveis), enquanto os grupos
  somam 38 — é o menor já registrado no plano 2026-11-19-espelho-vendavel-vgv ("KPIs contam as marcadas").

## Correção (20/11/2026) — sub-abas dentro de Receitas, não aba principal

> nao era para ser apenas a aba original receita e dentro dela dividir em duas abas: espelho de vendas e outra com Curva de vendas, Perfil de recebimento e Distrato e inadimplência?

> Por favor nao erre mais desta maneira. Isso leva desperdiço de tokens e tempo.
> corrigja

Erro meu: o pedido era dividir **dentro** de Receitas; o #599 criou "Espelho de vendas" como aba principal (o desenho
mostrado na pergunta já estava no mesmo nível, e eu não deixei isso claro). **Corrigido no PR #602** (squash
`d8f4c3fda`): Receitas é aba principal única, com as sub-abas **Espelho de vendas** e **Curva, perfil e distrato**; o
aviso que aponta o espelho e o link do VGV levam à sub-aba. Também **PR #601**: sai o título "Vendas de Ativos /
Unidades individualizadas do empreendimento" do topo do espelho (pedido de 20/11: *"Remova titulo … nao tem necessidade
nenhuma"*).
