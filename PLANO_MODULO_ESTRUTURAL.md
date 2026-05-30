# Plano Técnico — Módulo Estrutural (Ferragem Armada)

> ⚠️ **Correção de stack** — a 1ª versão deste plano assumiu vanilla JS (errado).
> Stack **real** verificada no repositório:
> - **React 19 + TypeScript + Vite + PWA**
> - Estado global: **Zustand** (`store/useStore.ts`, hook `useStore()`)
> - Dados/cache: **TanStack React Query** (`lib/queryClient.ts`, `lib/queryKeys.ts`)
> - Backend: **Supabase**, migrations versionadas em `supabase/migrations/YYYYMMDDHHMMSS_*.sql` (200+)
> - Roteamento: `activeView: string` no store + `components/AppRouter.tsx` + `lib/tabRouter.ts` (sync hash). **Não há react-router.**
> - UI: Tailwind v4 + lucide-react; cada feature é um `components/XxxModule.tsx` com sub-componentes
> - Lógica pura: `utils/*.ts` (ex.: `schedulingEngine.ts`, `financialMath.ts`) com testes em `__tests__/*.test.ts` (vitest)
> - Acesso a dados por feature: `services/xxxService.ts` (usa o client `lib/supabase.ts`)
> - **Export já instalado**: `xlsx` (SheetJS), `exceljs`, `jspdf`, `jspdf-autotable`, `file-saver`, `html2canvas` — nada novo a adicionar. `pdfjs-dist` já presente (base para a futura leitura de PDF).
> - NBR já no repo: `constants_nbr.ts` (inclui aço CA-50 da NBR 12721)
>
> **Princípio inegociável: QUANTIFICAR, não DIMENSIONAR.** Recebe a armadura já
> definida pelo projetista; nunca recebe cargas. Evita responsabilidade técnica (ART)
> e não compete com TQS/Eberick/Cype.

---

## Decisões confirmadas com o usuário (2026-05-30)
- **Export**: SheetJS/jsPDF → **já instalados**, reusar (`xlsx`, `jspdf`+`jspdf-autotable`, `exceljs`).
- **Elementos**: **todos os 9 tipos** (viga, pilar, sapata, bloco, radier, laje, escada, muro, baldrame).
- **Próximo passo**: **implementar o E1**.

---

## 1. Escopo do MVP (Fase 1)
1. Catálogo de aço (NBR 7480).
2. Entrada de armadura por elemento (manual, estruturada) — 9 tipos.
3. Engine de cálculo: comprimento + dobra + transpasse + peso + perda + custo.
4. Tabela de corte e dobra.
5. **Otimizador de barras** (cutting stock 1D — diferencial visível).
6. Quantitativo consolidado + custo + export (xlsx/pdf).

Fora do MVP (Fase 2+): OCR/PDF estrutural (usa `pdfjs-dist`), visualizador 2D/3D, DWG/IFC/BIM, produção (cortado/dobrado/enviado/montado).

---

## 2. Camada de dados — migration Supabase

Arquivo: `supabase/migrations/20260530xxxxxx_create_structural_module.sql`
(seguir o timestamp/ordenação das migrations existentes; mirar uma migration recente
como `20260530000000_create_tasks_module.sql` para **copiar exatamente** o padrão de:
colunas de auditoria, `org_id`, função de RLS `is_org_member(org_id)` e policies).

Tabelas (FK reusando `obras`/`organizacoes`/`auth.users` já existentes):

- **`structural_steel_catalog`** — catálogo NBR 7480
  `id, org_id (null=global), tipo, bitola_mm, peso_linear_kg_m, comprimento_barra_m default 12, fabricante, custo_kg, custo_barra, perda_pct_padrao default 10` + auditoria.
- **`structural_assemblies`** — agrupador na obra ("Fundação", "Pav. Térreo")
  `id, obra_id, org_id, nome, tipo` + auditoria.
- **`structural_elements`** — elemento (9 tipos)
  `id, assembly_id, org_id, tipo, nome, quantidade default 1, geometria jsonb, cobrimento_cm` + auditoria.
- **`structural_rebars`** — armadura (uma "chamada")
  `id, element_id, org_id, funcao, posicao, bitola_id→catalog, quantidade, espacamento_cm, comprimento_unit_cm, formato_dobra, dobras jsonb` + auditoria.

`cortes`/`quantitativos`/`plano_corte` **não viram tabela** — são derivados no client (utils puros). Persistir só na Fase 2 (produção/histórico).

RLS: habilitar em todas; policy por `org_id` via helper existente. Catálogo global (`org_id is null`) legível por todos, escrita só na própria org.

Seed NBR 7480 (pesos lineares tabelados): 5.0=0.154 · 6.3=0.245 · 8.0=0.395 · 10.0=0.617 · 12.5=0.963 · 16.0=1.578 · 20.0=2.466 · 25.0=3.853 (kg/m). Seguir o padrão de `supabase/seed/operational-control.ts` (seed em TS) ou inserts na própria migration.

---

## 3. Tipos — `types/structural.ts`
Interfaces TS espelhando as tabelas (`SteelCatalogItem`, `StructuralAssembly`, `StructuralElement`, `Rebar`, e os derivados `CutPiece`, `BarPlan`, `QuantitativeRow`). Exportar em `types/index.ts`.

---

## 4. Engine de cálculo (puro) — `utils/rebarEngine.ts` + teste

Funções puras, testáveis com vitest (`__tests__/rebarEngine.test.ts`). Só geometria (NBR 6118/7480), nunca dimensionamento.

- **Peso linear** (validação): `peso_linear_kg_m ≈ 0.006165 · bitola_mm²` (Ø12.5 → 0.963 ✓). Usar valor do catálogo; fórmula valida o cadastro.
- **Cobrimento default** (NBR 6118 Tab 7.2, CAA II): laje 2.5; viga/pilar 3.0; fundação 4.0–5.0 (editável).
- **Barra longitudinal**: `L = comprimento − 2·cobrimento + ancoragem/ganchos + Σ dobras`.
- **Transpasse** (peça > 12 m): `L = k·bitola` (k configurável por org, default ~50); +1 por emenda.
- **Estribos**: `perímetro = 2·((b−2c)+(h−2c)) + 2·gancho`; `n = floor(vão_útil/espaçamento)+1`.
- **Desconto de dobra**: MVP usa comprimento desenvolvido; refinar tabela de descontos por ângulo/bitola na 1.1.
- **Perdas**: processo (% do catálogo) + real (vem do otimizador).

## 5. Otimizador — `utils/cuttingStock.ts` + teste

Cutting stock 1D por **First Fit Decreasing** (sem dependências). Agrupar por bitola; barra 1200 cm; kerf opcional. Retorna nº de barras, aproveitamento %, mapa de corte e sobra (cm/kg/R$). Fase 1.1: ILP via edge function (`supabase/functions/`), opcional.

```ts
export function cuttingStockFFD(
  pieces: { id: string; lengthCm: number; qty: number }[],
  barCm = 1200, kerfCm = 0,
) {
  const items = pieces
    .flatMap(p => Array.from({ length: p.qty }, () => ({ id: p.id, len: p.lengthCm })))
    .sort((a, b) => b.len - a.len);
  const bars: { left: number; cuts: string[] }[] = [];
  for (const it of items) {
    let bar = bars.find(b => b.left >= it.len + (b.cuts.length ? kerfCm : 0));
    if (!bar) { bar = { left: barCm, cuts: [] }; bars.push(bar); }
    bar.left -= it.len + (bar.cuts.length ? kerfCm : 0);
    bar.cuts.push(it.id);
  }
  const waste = bars.reduce((s, b) => s + b.left, 0);
  return { nBars: bars.length, usagePct: 1 - waste / (bars.length * barCm), wasteCm: waste, bars };
}
```

## 6. Service — `services/structuralService.ts`
CRUD via `lib/supabase.ts` (mesmo padrão dos outros services). Funções: `listSteelCatalog`, `upsertSteel`, `listAssemblies(obraId)`, `listElements(assemblyId)`, `listRebars(elementId)`, e mutações correspondentes. Sempre passar `org_id` (RLS).

## 7. React Query — `hooks/useStructuralQueries.ts` / `useStructuralMutations.ts`
Espelhar `hooks/useLaborQueries.ts`/`useLaborMutations.ts`. Adicionar chaves em `lib/queryKeys.ts` (`structural: { catalog, assemblies, elements, rebars }`).

## 8. UI — `components/StructuralModule.tsx` (+ sub-componentes)
Componente React com abas (usar `components/ui/tabs.tsx`):
**Catálogo · Árvore obra→assembly→elemento · Editor de elemento+armaduras · Corte/Dobra · Plano de corte · Quantitativo**.
Tabela de corte/dobra e quantitativo exportáveis por `services/exportService.ts` (xlsx) e jspdf-autotable (pdf).

## 9. Wiring (3 pontos de integração)
1. **Store** (`store/useStore.ts`): garantir que `activeView` aceita `'structural'` (é string livre).
2. **`components/AppRouter.tsx`**: `case 'structural': return <StructuralModule .../>`.
3. **`components/Layout.tsx`**: item de navegação "Estrutural / Ferragem" (ícone lucide). Opcional: `lib/tabRouter.ts` se a view precisar de deep-link por hash.

---

## 10. Roadmap E1–E7
| Sprint | Entrega |
|---|---|
| **E1** | Migration `create_structural_module` (4 tabelas + RLS + seed NBR 7480) · `types/structural.ts` · `services/structuralService.ts` · catálogo de aço na UI · wiring no AppRouter/Layout |
| E2 | Árvore obra→assembly→elemento + editor de armaduras (9 tipos) |
| E3 | `utils/rebarEngine.ts` + testes (comprimento, estribo, transpasse, peso, perda) |
| E4 | Tabela de corte/dobra + export xlsx/pdf (reusa `exportService`) |
| E5 | `utils/cuttingStock.ts` + testes + tela plano de corte (aproveitamento %) |
| E6 | Quantitativo consolidado + integração com orçamento (`budget`) |
| E7 (1.1) | Descontos de dobra refinados + otimizador ILP (edge function) |
| F2+ | OCR/PDF (usa `pdfjs-dist`) · visualizador 2D · produção |

---

## 11. Riscos & decisões
- **Responsabilidade técnica**: nunca aceitar carga; só quantificar.
- **Concorrência**: aSa domina centrais de corte/dobra; nosso ganho é integração com orçamento + simplicidade web/mobile.
- **RLS**: copiar exatamente o helper/policy de uma migration recente (há histórico de hardening: `remove_backdoor`, `remove_dev_anon_policies`) — não inventar policy.
- **CI**: `npm run ci` = typecheck + vitest + build. Engine/otimizador puros entram com teste desde o E3/E5.
- **Calibração**: validar com 2–3 projetos reais antes de vender o quantitativo.
