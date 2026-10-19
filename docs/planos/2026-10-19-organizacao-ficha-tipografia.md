# Minha Organização › Organização — tipografia da ficha no padrão do app

## Pedido original

Sessão de 19/10/2026 (VS Code), mensagem do usuário, literal:

> minha organização > organização:  verifique as fonts parece que estão fora de padrao do app

## Diagnóstico

A lista de organizações (`OrganizationList.tsx`) já segue §6/§7 — tipografia
das células igual à de `ClientList.tsx`. O desvio está na **ficha**
(Detalhes → `OrganizationDetail.tsx`), que monta numa barra só:

- aba **Organização** (`OrganizationPage.tsx`) — já no §21/§30: rótulo
  `text-xs font-semibold text-slate-500`, título de seção `text-sm
  font-semibold`, campo `h-9 rounded-[6px] bg-gray-50`;
- abas da **empresa matriz** (`CompanyDetailPage.tsx` + `Company*Tab.tsx`) e
  **Empresas do grupo** (`CompaniesModule.tsx`) — ainda no vocabulário antigo:
  rótulo `text-form-label font-black uppercase tracking-widest`, título de seção
  `text-xs font-black uppercase tracking-widest text-blue-600`, pílulas
  `rounded-full uppercase font-black` (§8), botões `font-black uppercase` (§17),
  cantos `rounded-xl`/`rounded-3xl` (§16).

Trocar de aba na mesma barra troca de "produto" — é o que salta aos olhos.

## Régua aplicada (copiada de `OrganizationPage.tsx`, a aba vizinha)

| Elemento | De | Para | Guia |
|---|---|---|---|
| rótulo de campo | `text-form-label font-black uppercase tracking-widest text-gray-500 mb-1` | `text-xs font-semibold text-slate-500 mb-1.5` | §21, §30 |
| título de seção | `text-xs font-black uppercase tracking-widest text-blue-600 mb-3` | `h3 text-sm font-semibold text-gray-900` + `border-b border-gray-100 pb-3 mb-4` | §30 |
| campo | `px-3 py-2 border-gray-200 rounded-xl bg-white` | `px-3 h-9 bg-gray-50 border-gray-100 rounded-[6px] text-gray-900` | §16, §30, §32 |
| card da aba | `border-gray-200 rounded-3xl` | `border-gray-100 rounded-[10px]` | §16 |
| status/etiqueta | pílula `rounded-full uppercase font-black bg-*` | texto colorido `text-xs`/`text-sm font-normal` | §8 |
| botão secundário | `font-black text-button uppercase tracking-wide rounded-xl` | `h-9 px-3.5 rounded-[6px] font-medium text-[13px]` | §17 |
| nome de item em lista | `font-black text-gray-900 text-sm` | `text-sm font-semibold text-gray-900` | §7/§21 |

Fora do escopo (não é tipografia): reordenar campos, mudar grids/gaps (§30
completo), trocar formulário inline por drawer.

## Itens

Cada item termina quando `grep -nE "font-black|uppercase|tracking-wide|rounded-(xl|2xl|3xl|full)"`
no arquivo só devolver exceção justificada aqui, e `check-ui-standard.sh` passar.

- [x] `components/CompanyDetailPage.tsx` — `Field`, `Section`, `inputCls`, cards das abas, cabeçalho e barra de abas do modo não-embutido (`TabsBar`, §19.1), cartões de retenção/regimes, botões do certificado, avisos.
- [x] `components/CompaniesModule.tsx` — `Field`, `inputCls`, títulos de seção e do formulário "Nova empresa", "Cancelar", estado vazio "Nenhuma organização selecionada".
- [x] `components/CompanyPartnersTab.tsx`
- [x] `components/CompanyBankAccountsTab.tsx`
- [x] `components/CompanyBranchesTab.tsx`
- [x] `components/CompanyDocumentsTab.tsx`
- [x] `components/CompanyIncorporacaoTab.tsx`
- [x] `components/CompanyTargetsTab.tsx`
- [x] `components/CompanyDepartmentsTab.tsx`
- [x] `components/OrganizationList.tsx` — `h2` → `h1` no título da tela (§20), estado vazio da aba Detalhes sem `font-black uppercase`, nome da org na célula `text-gray-700` (§7).
- [x] `components/CertificateExpiryWarning.tsx` — (achado no caminho) aviso de validade do certificado na aba Tributário e o `CertificateBadge`: `font-black`/pílula → §8.
- [x] Fundo dos formulários embutidos (Novo sócio/conta/filial/documento/metas/departamento) `bg-gray-50` → `bg-white` — com o campo novo também em `bg-gray-50`, o campo sumia no fundo (visto no print).
- [x] `confirm()` nativo → `useConfirm()` em 5 abas (§14; o checador acusaria nos arquivos tocados).
- [x] Prova visual: harness `docs/spikes/organizacao-ficha/` (sem login, PostgREST em memória, só leitura) — `passeio.mjs` passa por todas as 12 abas da ficha (abrindo o formulário nas abas de lista), pela empresa do grupo aberta em "Gerenciar" e pela lista: **54 portões ok** — todo rótulo em 12px/600 sem caixa alta, todo título de seção em 14px/600, nenhum CSS `uppercase` (exceto rótulo do `KpiCard`, §4), nada em `font-black` fora do h1 e do título de formulário (§21), zero escrita tentada.
- [x] `check-ui-standard.sh` nos 12 arquivos tocados: exit 0 em todos.
- [x] `tsc --noEmit` (heap 8 GB, `npm run typecheck`): exit 0, 0 erros.
- [x] `valorDeCampoSemCinzaGuard`, `orgContextGuard`, `OrganizationUsersPermissaoClique`: 23/23.
- [x] Suíte inteira: 10.040 passaram, 1 falhou — `PainelVersoes.test.tsx` (Planta, fora deste diff), que rodado sozinho passa 26/26: tempo esgotado sob carga, não regressão.

### Fora do escopo, anotado

- `CityStateSelect` tem rótulo antigo como PADRÃO (`font-bold uppercase tracking-wider`) e é usado em 8 formulários (Cliente, Fornecedor, Colaborador, Obra…). Aqui ele recebe `labelCls` novo; mudar o padrão mexeria em telas fora do pedido.
- Títulos de seção da matriz não têm o ícone azul que a aba Organização tem (o `Section` só recebe texto). Tipografia igual; ícone é outro pedido.
