# Preferências — o que a planta elétrica exibe (tela e prancha)

## Pedido original

Sessão `9e26b316`, 22/10/2026, logo depois do PR #110 (textos elétricos sem sobreposição):

> Seria interesante criar um menu "Preferencias", onde usuário  pode escolher o que ele quer. Um exemplo para darmos um ponta pé seria o que ele quer ver exibido na planta em relacao a parte eletrica

Respostas do usuário no desenho (mesma sessão):

- Para que serve a escolha: **"Os dois, separados"** — uma escolha para a TELA (pessoal) e outra para a PRANCHA.
- A escolha da prancha vale para: **"Para a empresa"** (padrão por organização; cada estudo pode trocar).
- A escolha da tela fica guardada: **"No usuário"** (segue a pessoa em qualquer computador).
- Lista de itens: **"Vamos iniciar com esses"** (os 9 da tabela abaixo).
- Onde guardar: **"A — tabela própria"**.
- Partes 1, 2 e 3 do desenho: **"sim"** a cada uma.

## Entendimento

- **O que se quer:** cada usuário escolhe o que vê da elétrica na planta enquanto trabalha; a empresa escolhe o que
  sai na prancha elétrica (PDF/PNG/DXF) de todos; um estudo pode ter o seu padrão de prancha.
- **Pronto quando (critérios do usuário):**
  1. Desligo "Potência" na Tela, abro a planta em outro computador → continua desligada.
  2. O administrador desliga "Instrução da sugerida" na Prancha → todo PDF elétrico da empresa sai sem ela; a tela de
     cada um não muda.
- **Sem surpresa:** o padrão de cada item reproduz o comportamento atual (PR #110) — ninguém vê mudança até escolher.

## Os itens (catálogo inicial)

| Item (`<item>`) | Exemplo | Padrão |
|---|---|---|
| `fios` — traços fase/neutro/retorno/terra no eletroduto | ╫ | ligado |
| `circuitoNosFios` — número do circuito em cima do grupo | "3" | ligado |
| `bitola` — seção dos fios | "2,5" | ligado |
| `diametro` — Ø do eletroduto (o diferente do predominante) | "Ø 40" | ligado |
| `circuitoNoPonto` — circuito escrito no ponto | "-20-", "C3", "TUG · C2" | ligado |
| `potencia` — potência do ponto | "600 VA" | ligado |
| `comando` — letra do comando | "a" | ligado |
| `instrucaoSugerida` — instrução da tomada sugerida | "Posicione sobre a bancada…" | ligado |
| `condutoresDoTrecho` — "N cond." do trecho cheio | "34 cond." | ligado |

Cada item gera duas chaves: `planta.eletrica.tela.<item>` e `planta.eletrica.prancha.<item>`.

**Decididas no plano (23/10/2026), ao ler o código:**
- A prancha NÃO escreve `instrucaoSugerida` nem `condutoresDoTrecho` (só a tela escreve): esses dois itens têm só a
  coluna Tela; a célula Prancha aparece travada com o motivo ("a prancha não escreve este item").
- `comando` esconde também as letras das seções do INTERRUPTOR — a letra na luz sem a do interruptor (ou o contrário)
  deixa o par sem correspondência.
- `potencia` esconde também o número dentro do círculo da LUMINÁRIA.

## Desenho

### 1. Dados e segurança

Tabela `public.preferencias` (migration aplicada com `npx supabase db query --linked -f`, NUNCA `db push`):

| coluna | |
|---|---|
| `id` uuid PK | |
| `escopo` text | CHECK em `USUARIO` · `ORGANIZACAO` · `ESTUDO` |
| `user_id` uuid → `auth.users` | preenchido só em `USUARIO` |
| `organization_id` uuid → `organizations` | preenchido só em `ORGANIZACAO` |
| `study_id` uuid → `blueprint_studies` (ON DELETE CASCADE) | preenchido só em `ESTUDO` |
| `chave` text NOT NULL | |
| `valor` jsonb NOT NULL | |
| `updated_at` timestamptz, `updated_by` uuid | |

- CHECK: exatamente o dono do escopo preenchido, os outros dois nulos.
- Índice único por dono e chave (um por escopo, parcial: `(user_id, chave) WHERE escopo='USUARIO'`, etc.).
- RLS (perguntas da REGRA #7 respondidas em comentário na migration):

| Escopo | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `USUARIO` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `ORGANIZACAO` | `is_org_member(organization_id)` | `is_org_manager(organization_id)` |
| `ESTUDO` | `is_org_member(<org do estudo>)` | `is_org_member(<org do estudo>)` — a mesma regra de quem edita a planta (`blueprint_studies_org`) |

  Cada perna é autossuficiente e amarrada ao escopo (`escopo = 'USUARIO' AND user_id = auth.uid()` …). Sem
  `SECURITY DEFINER`, sem RPC nova. GRANT só a `authenticated`; nada a `anon`.
- ⚠️ A escolha da empresa NÃO vai em `organizations.settings` (gravação na organização já foi desfeita em silêncio por
  gatilho — memória "Org PJ…").

### 2. Catálogo e quem vence (código puro)

- `utils/preferencias/catalogo.ts` — uma entrada por item: chave, rótulo, explicação de uma linha, padrão, grupo
  ("Planta › Elétrica"), e de quais outros itens depende (`fios` para `circuitoNosFios`, `bitola`,
  `condutoresDoTrecho`).
- `utils/preferencias/resolver.ts` — `resolverPreferencias(linhas, contexto)`:
  - Tela: usuário → padrão.
  - Prancha: estudo → empresa → padrão.
  - Valor que não é do tipo do catálogo, ou chave fora do catálogo: ignorado (vale o padrão), nunca lança.
- `exibicaoEletricaDaTela(...)` / `exibicaoEletricaDaPrancha(...)` → `ExibicaoEletrica` (os 9 sim/não, já com as
  regras de convivência aplicadas).

**Regras de convivência**

1. "Circuito nos pontos" (Vista › Exibir) continua a chave GERAL da tela: desligada, nada elétrico se escreve (como
   hoje). As preferências refinam o que aparece quando ela está ligada.
2. `fios` desligado leva `circuitoNosFios`, `bitola`, o círculo do trecho cheio e `condutoresDoTrecho` — na tela de
   Preferências eles aparecem esmaecidos com o motivo escrito.
3. A pendência "?" (ponto sem circuito / sem tipo) NUNCA se esconde, nem com `circuitoNoPonto` desligado: é aviso de
   erro de projeto.
4. Bloco da tomada ("-20- / 600 VA / Posicione…"): monta-se só com as linhas ligadas.

**Quem consome:** `BlueprintCanvas` recebe `exibicaoEletrica` (prop) e `desenharEletrica` recebe
`opcoes.exibicao`; cada item corta só o seu `anotar` (o motor do PR #110). Sem a prop/opção = tudo ligado (padrão).

### 3. Tela, gravação e erros

- **Gaveta Preferências** (`components/PreferencesSheet.tsx`, já existente, aberta pelo topo): nova seção
  "Planta › Elétrica" — lista dos 9 itens, cada um com nome, explicação e duas chaves **Tela** | **Prancha**; em cada
  coluna, "Voltar ao padrão do sistema".
  - Coluna Prancha = padrão da empresa do seletor do topo (`useOrgContext`).
    - Quem não é gestor da organização: travada, com o motivo ("só quem administra a organização muda o padrão da
      prancha").
    - Topo em "Todas as organizações": travada, com o motivo ("o padrão da prancha é de UMA empresa — escolha a
      organização no topo") — exceção da REGRA #5 item 4 (escolha de uma organização só, por natureza).
- **Troca por estudo** (última fase): onde a Planta exporta a prancha elétrica, "Padrão da prancha: da empresa |
  personalizado para esta planta"; personalizado abre a mesma lista, gravada em `ESTUDO`.
- **Gravação:** `services/preferenciasService.ts` (única camada que fala com o Supabase) + hook `usePreferencias`
  (TanStack Query, chave em `lib/queryKeys.ts`). Clicar grava na hora (otimista) e o desenho muda na hora; falha →
  a chave volta e um aviso diz o motivo (toast que de fato renderiza — memória "Toast MUDO").
- **Leitura que falha:** a planta desenha com os padrões (nunca em branco) e o aviso diz que as preferências não
  carregaram.

## Fases (cada uma com o seu critério)

- [ ] **F1 — Migration + RLS.** Pronto quando: `segurancaMigrations.test` verde; no banco, com o usuário de leitura
      (membro comum), gravar `ORGANIZACAO` é recusado, a linha `USUARIO` de outro não aparece; `check-rls-postura.sh`.
- [ ] **F2 — Catálogo + resolver.** Pronto quando: testes puros — usuário > padrão; estudo > empresa > padrão; valor
      inválido = padrão; catálogo sem chave repetida; todos os padrões = comportamento do PR #110; convivência (`fios`
      desligado leva os dependentes).
- [ ] **F3 — Serviço + hook.** Pronto quando: testes do serviço (filtra pelo dono certo; upsert por escopo) e do hook
      (otimista; reverte na falha).
- [ ] **F4 — Canvas e prancha consomem `ExibicaoEletrica`.** Pronto quando: para cada um dos 9 itens, desligar tira
      só o texto dele (testes no molde de `BlueprintCanvasAnotacoesEletricas.test.tsx` e
      `blueprintPranchaEletrica.test.ts`); pendência "?" continua com `circuitoNoPonto` desligado; tudo no padrão = desenho
      idêntico ao de hoje.
- [ ] **F5 — Seção "Planta › Elétrica" na gaveta Preferências.** Pronto quando: teste de componente (grava; falha
      reverte e avisa; colunas travadas dizem o motivo; dependentes de `fios` esmaecidos com motivo);
      `check-ui-standard.sh` no `.tsx` tocado; guia de UI lido antes (REGRA #1).
- [ ] **F6 — Personalizar a prancha por estudo.** Pronto quando: estudo personalizado vence a empresa no PDF; "da
      empresa" apaga as linhas `ESTUDO`.
- [ ] **F7 — Prova no app real.** Os dois critérios do usuário, com o usuário de leitura (senha pedida na hora) e
      prints; conferir no banco que nenhuma linha de teste ficou.

## Fora do escopo (agora)

- As outras ~30 chaves do Vista › Exibir (cotas, eixos, mobiliário…) e as outras disciplinas — entram depois, uma
  linha de catálogo por item.
- Migrar as escolhas que hoje estão no navegador (`blueprint:*` do localStorage).

## Estado
- [x] desenho aprovado em 3 partes (22/10/2026)
- [x] revisão desta especificação pelo usuário ("Ok", 23/10/2026)
- [ ] plano de implementação (escrito abaixo; aguarda revisão e escolha do modo de execução)
- [ ] PR + CI
- [ ] publicação

---

# Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans. Passos com caixa (`- [ ]`) para acompanhar.

**Objetivo:** o usuário escolhe o que a planta elétrica escreve na TELA (dele) e a empresa escolhe o que sai na
PRANCHA, com troca por estudo.

**Arquitetura:** tabela `preferencias` com RLS por escopo; catálogo + resolvedor puros em `utils/preferencias/`;
serviço + hook com TanStack Query; o canvas e a prancha recebem um `ExibicaoEletrica` (9 sim/não) e cortam o seu
`anotar` (motor do PR #110).

**Stack:** Postgres/RLS (Supabase), React 19 + TanStack Query, Vitest (+ Testing Library, jsdom).

**Spec:** a primeira metade deste arquivo.

## Restrições globais

- Migration aplicada com `npx supabase db query --linked -f <arquivo>`; NUNCA `supabase db push`.
- Nome da migration: `supabase/migrations/aplicar_20271023300000_preferencias.sql` — antes de criar, conferir
  `ls supabase/migrations | grep -o "2027[0-9]\{10\}" | sort -u | tail` e rodar `__tests__/migrationsPrefixo.test.ts`
  depois de cada fetch/rebase.
- REGRA #7: sem `SECURITY DEFINER`, sem função nova; GRANT só a `authenticated`; perguntas 1–2 respondidas em comentário.
- REGRA #5: a organização vem de `useOrgContext()` (tela de Preferências) ou de `study.organization_id` (exportação e
  canvas); nunca de `organizations[0]`.
- REGRA #1: ler `docs/ui_ux_guia_unificado.md` antes da tarefa 5; `bash scripts/check-ui-standard.sh` nos `.tsx` tocados.
- Avisos pelo `useToast()` renderizando `{localToast}` (memória "Toast MUDO").
- Teste de componente: `// @vitest-environment jsdom` na PRIMEIRA linha.
- Padrão de todo item = `true` (comportamento do PR #110). Sem preferências gravadas, o desenho é IDÊNTICO ao de hoje.
- Textos de motivo (exatos):
  - `MOTIVO_PRANCHA_SO_GESTOR = 'Só quem administra a organização muda o padrão da prancha.'`
  - `MOTIVO_PRANCHA_TODAS = 'O padrão da prancha é de UMA empresa — escolha a organização no topo.'`
  - `MOTIVO_SEM_FIOS = 'Depende de "Fios" — ligue "Fios" para escolher este item.'`
  - `MOTIVO_SO_NA_TELA = 'A prancha não escreve este item.'`

## Foco de revisão

1. Topo trocado de organização com a gaveta aberta → a coluna Prancha recarrega a da nova organização (a chave da query
   inclui `organizationId`) — teste na tarefa 5.
2. Linhas gravadas com `fios = false` e `circuitoNosFios = true` → efetivo `circuitoNosFios = false` — teste na tarefa 2.
3. Leitura das preferências falha (rede) → canvas e PDF saem com o padrão, nunca em branco, e o aviso aparece — teste na
   tarefa 3.
4. Estudo apagado → as linhas `ESTUDO` vão junto (FK `ON DELETE CASCADE`) — conferência no banco na tarefa 1.
5. Membros da organização ainda não carregados no store → coluna Prancha travada com o motivo (não liberada "por
   engano"); o banco é a trava final — teste na tarefa 5.

---

### Tarefa 1: Migration `preferencias` + RLS

**Arquivos:**
- Criar: `supabase/migrations/aplicar_20271023300000_preferencias.sql`
- Teste: `__tests__/segurancaMigrations.test.ts`, `__tests__/migrationsPrefixo.test.ts` (já existem)

- [ ] **Passo 1:** escrever a migration — tabela da spec (seção 1) com `user_id uuid DEFAULT auth.uid()`; CHECK do dono
      por escopo; 3 índices únicos parciais (`(user_id, chave) WHERE escopo='USUARIO'`, `(organization_id, chave) WHERE
      escopo='ORGANIZACAO'`, `(study_id, chave) WHERE escopo='ESTUDO'`); FKs `ON DELETE CASCADE`; `ENABLE ROW LEVEL
      SECURITY`; policies por escopo e operação, cada perna amarrada ao `escopo` (ESTUDO via `EXISTS (SELECT 1 FROM
      blueprint_studies s WHERE s.id = study_id AND is_org_member(s.organization_id))`); `REVOKE ALL … FROM PUBLIC,
      anon; GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated`. Idempotente (`IF NOT EXISTS`, `DROP POLICY IF
      EXISTS`).
- [ ] **Passo 2:** `npx vitest run __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts` → PASS.
- [ ] **Passo 3:** aplicar com `npx supabase db query --linked -f supabase/migrations/aplicar_20271023300000_preferencias.sql`.
- [ ] **Passo 4:** conferir no banco: `pg_policies` da tabela; `has_table_privilege('anon','public.preferencias','SELECT')
      = false`; FKs com `confdeltype = 'c'` em `pg_constraint` (foco 4).
- [ ] **Passo 5:** commit `feat(preferencias): tabela preferencias com RLS por escopo`.

### Tarefa 2: Catálogo e resolvedor (puros)

**Arquivos:**
- Criar: `utils/preferencias/catalogo.ts`, `utils/preferencias/resolver.ts`
- Teste: `__tests__/preferenciasResolver.test.ts`

**Interfaces (produz):**
```ts
export type ItemEletrico = 'fios' | 'circuitoNosFios' | 'bitola' | 'diametro' | 'circuitoNoPonto' | 'potencia' | 'comando' | 'instrucaoSugerida' | 'condutoresDoTrecho';
export type AlvoDaPreferencia = 'tela' | 'prancha';
export type EscopoDaPreferencia = 'USUARIO' | 'ORGANIZACAO' | 'ESTUDO';
export interface ItemDoCatalogo { item: ItemEletrico; rotulo: string; explicacao: string; padrao: boolean; dependeDe?: ItemEletrico; naPrancha: boolean }
export const ITENS_ELETRICOS: readonly ItemDoCatalogo[];                                    // ordem = ordem da tela
export function chaveDoItem(alvo: AlvoDaPreferencia, item: ItemEletrico): string;          // 'planta.eletrica.<alvo>.<item>'
export interface LinhaDePreferencia { escopo: EscopoDaPreferencia; chave: string; valor: unknown }
export type ExibicaoEletrica = Readonly<Record<ItemEletrico, boolean>>;
export const EXIBICAO_ELETRICA_PADRAO: ExibicaoEletrica;                                    // tudo true
export function exibicaoEletricaDaTela(linhas: readonly LinhaDePreferencia[]): ExibicaoEletrica;    // USUARIO > padrão
export function exibicaoEletricaDaPrancha(linhas: readonly LinhaDePreferencia[]): ExibicaoEletrica; // ESTUDO > ORGANIZACAO > padrão
export function origemDoValor(linhas: readonly LinhaDePreferencia[], alvo: AlvoDaPreferencia, item: ItemEletrico): EscopoDaPreferencia | 'PADRAO';
```
`dependeDe: 'fios'` em `circuitoNosFios`, `bitola`, `condutoresDoTrecho`. `naPrancha: false` em `instrucaoSugerida`
e `condutoresDoTrecho` (a função da prancha devolve `false` para eles).

- [ ] **Passo 1:** testes que falham:
  - sem linhas → `EXIBICAO_ELETRICA_PADRAO` (tela; e prancha com os 2 `naPrancha:false` em `false`);
  - `USUARIO potencia=false` → `tela.potencia=false`, `prancha.potencia=true` (a tela não vaza para a prancha);
  - `ORGANIZACAO bitola=false` + `ESTUDO bitola=true` → `prancha.bitola=true`; só ORGANIZACAO → `false`;
  - `fios=false` e `circuitoNosFios=true` gravados → `circuitoNosFios`, `bitola`, `condutoresDoTrecho` efetivos `false` (foco 2);
  - valor `'sim'` ou chave `'planta.eletrica.tela.xyz'` → ignorados (padrão), sem lançar;
  - `ITENS_ELETRICOS` sem item repetido, 9 itens, todos `padrao: true`; `chaveDoItem('tela','fios') === 'planta.eletrica.tela.fios'`;
  - `origemDoValor` → `'ESTUDO'` com linha de estudo; `'PADRAO'` sem linhas.
- [ ] **Passo 2:** `npx vitest run __tests__/preferenciasResolver.test.ts` → FAIL (módulo não existe).
- [ ] **Passo 3:** implementar `catalogo.ts` (rótulos/explicações da tabela de itens da spec) e `resolver.ts`.
- [ ] **Passo 4:** rodar → PASS.
- [ ] **Passo 5:** commit `feat(preferencias): catálogo da planta elétrica e resolvedor`.

### Tarefa 3: Serviço + hook

**Arquivos:**
- Criar: `services/preferenciasService.ts`, `hooks/usePreferenciasEletricas.ts`
- Modificar: `lib/queryKeys.ts` (acrescentar `preferenciasKeys`)
- Teste: `__tests__/preferenciasService.test.ts`, `__tests__/components/usePreferenciasEletricas.test.tsx`

**Interfaces:**
- Consome: tarefa 2.
- Produz:
```ts
export const preferenciasService: {
  listarDoUsuario(): Promise<LinhaDePreferencia[]>;
  listarDaPrancha(organizationId: string, studyId?: string | null): Promise<LinhaDePreferencia[]>; // ORGANIZACAO dessa org + ESTUDO desse estudo
  gravar(escopo: EscopoDaPreferencia, dono: { organizationId?: string; studyId?: string }, chave: string, valor: boolean | null): Promise<void>; // null = apaga
  apagarDoEstudo(studyId: string, prefixo: string): Promise<void>;
};
export const preferenciasKeys = {
  all: ['preferencias'] as const,
  usuario: () => ['preferencias', 'usuario'] as const,
  prancha: (organizationId: string | null, studyId?: string | null) => ['preferencias', 'prancha', organizationId ?? 'nenhuma', studyId ?? 'sem-estudo'] as const,
};
export function usePreferenciasEletricas(args: { organizationId: string | null; studyId?: string | null }): {
  tela: ExibicaoEletrica; prancha: ExibicaoEletrica;
  linhasDaTela: LinhaDePreferencia[]; linhasDaPrancha: LinhaDePreferencia[];
  carregando: boolean; erro: string | null;
  alterar(alvo: AlvoDaPreferencia, item: ItemEletrico, valor: boolean | null, escopo: EscopoDaPreferencia): Promise<void>;
};
```
`gravar`: upsert pelo índice do escopo (`onConflict` = coluna do dono + `chave`), `delete` quando `valor === null`;
em `USUARIO` não manda `user_id` (o DEFAULT do banco preenche). Hook: a leitura da tela roda sempre (REGRA #5 — nunca
bloquear leitura); a da prancha só com `organizationId`. `alterar` é otimista (`setQueryData`); na falha restaura o
cache e publica `Não foi possível salvar a preferência: <mensagem>`. Leitura com erro → padrão + `erro` preenchido.

- [ ] **Passo 1:** testes do serviço com o cliente Supabase simulado (molde dos `__tests__/*Service.test.ts`):
      `listarDaPrancha` filtra os dois escopos com `organization_id`/`study_id`; `gravar(…, null)` chama `delete` e não
      `upsert`; `gravar('USUARIO', {}, k, true)` não manda `user_id`.
- [ ] **Passo 2:** testes do hook: `alterar` muda `tela` na hora; serviço rejeitando → volta ao valor anterior e avisa;
      leitura rejeitada → `tela` = padrão e `erro` ≠ null (foco 3); trocar `organizationId` refaz a leitura da prancha.
- [ ] **Passo 3:** rodar → FAIL. **Passo 4:** implementar.
- [ ] **Passo 5:** rodar → PASS; `npx vitest run __tests__/orgContextGuard.test.ts` → PASS.
- [ ] **Passo 6:** commit `feat(preferencias): serviço e hook das preferências da planta elétrica`.

### Tarefa 4: Canvas e prancha obedecem `ExibicaoEletrica`

**Arquivos:**
- Modificar: `components/blueprint/BlueprintCanvas.tsx` (prop `exibicaoEletrica?: ExibicaoEletrica`, padrão
  `EXIBICAO_ELETRICA_PADRAO`); `utils/blueprintPranchaEletrica.ts` (`opcoes.exibicao?: ExibicaoEletrica`);
  `utils/blueprintExport.ts` (`OpcoesExportacao.exibicaoEletrica?` e o repasse em `desenharPlanta`, ≈ linha 774);
  `utils/blueprintDxf.ts` (repasse ≈ linha 1168); `components/blueprint/BlueprintEditor.tsx` (passa `tela` do hook ao
  canvas, `organizationId` = organização do estudo); `components/blueprint/PainelVersoes.tsx` (`opcoes()` leva
  `exibicaoEletrica: prancha`, `organizationId = study.organization_id`, `studyId = study.id`).
- Teste: `__tests__/components/BlueprintCanvasAnotacoesEletricas.test.tsx`, `__tests__/blueprintPranchaEletrica.test.ts`

**Mapa item → o que some** (ids do `anotar` do PR #110):
`fios` → traços dos grupos + círculo do trecho cheio (+ os dependentes); `circuitoNosFios` → `circuito:<trecho>:<g>`;
`bitola` → `secao:*`; `diametro` → `diametro:*`; `circuitoNoPonto` → `ponto:*` e a linha `-n-` do bloco da tomada,
EXCETO pendência ("?" / sem tipo); `potencia` → linha "N VA" da tomada, `potencia:*` (LD) e o número dentro da
luminária; `comando` → `comando:*` e as letras das seções do interruptor; `instrucaoSugerida` → linha da instrução;
`condutoresDoTrecho` → `condutores:*`. Bloco da tomada sem nenhuma linha → não se anota.

- [ ] **Passo 1:** testes que falham — canvas (cena do arquivo, zoom 0,2 pela navegação): para cada item, renderizar
      com `{ ...EXIBICAO_ELETRICA_PADRAO, [item]: false }` e afirmar que só os textos dele somem (tabela de textos
      esperados por item); `circuitoNoPonto=false` com um ponto SEM circuito → o "?" continua; tudo padrão → mesma lista
      de `fillText` que sem a prop. Prancha: o mesmo para os 7 itens que ela escreve.
- [ ] **Passo 2:** rodar → FAIL. **Passo 3:** implementar os cortes.
- [ ] **Passo 4:** rodar → PASS; também os testes de prancha/recorte/DXF/exportação e `plantaApi.test.ts` → PASS.
- [ ] **Passo 5:** commit `feat(planta): canvas e prancha obedecem às preferências da elétrica`.

### Tarefa 5: Seção "Planta › Elétrica" na gaveta Preferências

**Arquivos:**
- Criar: `components/preferencias/ListaDePreferenciasEletricas.tsx` (a lista; reusada na tarefa 6),
  `components/preferencias/SecaoPlantaEletrica.tsx`, `utils/preferencias/podeGerirPrancha.ts`
- Modificar: `components/PreferencesSheet.tsx` (renderiza a seção abaixo do tema)
- Teste: `__tests__/components/SecaoPlantaEletrica.test.tsx`, `__tests__/preferenciasPodeGerir.test.ts`

**Interfaces:**
- Consome: tarefas 2 e 3; `useOrgContext()` (`orgId`, `isAllOrgs`); `useStore` (`organizations[].members`, `session.user.email`).
- Produz: `podeGerirPrancha(args: { isAllOrgs: boolean; membro: { role?: string | null } | null; membrosCarregados: boolean }): { pode: true } | { pode: false; motivo: string }`
  — `isAllOrgs` → `MOTIVO_PRANCHA_TODAS`; não carregado / não membro / `role` fora de `owner|admin` → `MOTIVO_PRANCHA_SO_GESTOR`.
- `ListaDePreferenciasEletricas` props: `{ colunas: AlvoDaPreferencia[]; tela: ExibicaoEletrica; prancha: ExibicaoEletrica; travaDaPrancha: string | null; aoAlterar(alvo, item, valor: boolean | null): void; aoVoltarAoPadrao(alvo): void }`.

Uma linha por item (nome, explicação, chave Tela, chave Prancha). Dependentes de `fios` travados com `MOTIVO_SEM_FIOS`
quando `fios` está desligado naquela coluna; célula Prancha de `naPrancha: false` com `MOTIVO_SO_NA_TELA`; "Voltar ao
padrão do sistema" por coluna. Todo controle travado mostra o motivo visível.

- [ ] **Passo 1:** ler `docs/ui_ux_guia_unificado.md` inteiro e `UI_PATTERNS.md`.
- [ ] **Passo 2:** testes que falham — `podeGerirPrancha` (os casos acima); componente: "Potência · Tela" chama
      `alterar('tela','potencia',false,'USUARIO')`; gestor em "Bitola · Prancha" → `alterar('prancha','bitola',false,'ORGANIZACAO')`;
      não gestor → coluna travada com `MOTIVO_PRANCHA_SO_GESTOR`; "Todas" → `MOTIVO_PRANCHA_TODAS`; `fios` desligado →
      "Bitola" travada com `MOTIVO_SEM_FIOS`; trocar `orgId` re-renderiza com a prancha da outra org (foco 1); membros não
      carregados → travada (foco 5).
- [ ] **Passo 3:** rodar → FAIL. **Passo 4:** implementar.
- [ ] **Passo 5:** rodar → PASS; `bash scripts/check-ui-standard.sh` nos 3 `.tsx` → 0 violações.
- [ ] **Passo 6:** commit `feat(preferencias): seção Planta › Elétrica na gaveta de Preferências`.

### Tarefa 6: Prancha personalizada por estudo

**Arquivos:**
- Modificar: `components/blueprint/PainelVersoes.tsx` ("Padrão da prancha: da empresa | personalizado para esta
  planta"; personalizado mostra `ListaDePreferenciasEletricas` só com a coluna Prancha, gravando em `ESTUDO`)
- Teste: `__tests__/components/PainelVersoes.test.tsx` (já existe; acrescentar casos)

- [ ] **Passo 1:** testes que falham — com `ESTUDO bitola=false` e `ORGANIZACAO bitola=true`,
      `opcoes().exibicaoEletrica.bitola === false`; escolher "da empresa" chama
      `apagarDoEstudo(study.id, 'planta.eletrica.prancha.')` e volta a valer a empresa.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS + `check-ui-standard.sh`.
- [ ] **Passo 5:** commit `feat(planta): padrão da prancha personalizado por estudo`.

### Tarefa 7: Fecho — tipos, suíte, prova no app, PR

- [ ] **Passo 1:** `npm run typecheck` (repetir se o Node cair sem `error TS`) → 0 erros.
- [ ] **Passo 2:** suíte com relatório JSON (`--maxWorkers=4`), conta fechando (`passed + failed + pending = total`), 0 falhas.
- [ ] **Passo 3:** prova no app real (dev server da frente; senha do usuário de leitura pedida na hora; planta
      `ZZ TESTE … (descartável)` com a escrita autorizada): critério 1 em dois contextos de navegador; critério 2 com o
      PDF gerado; prints; conferir no banco que só ficaram as linhas desejadas e arquivar o estudo de teste.
- [ ] **Passo 4:** marcar as fases e o "Estado" deste plano; levar junto as pendências de outros planos que a memória
      manda marcar no próximo PR; PR, CI, publicação (com autorização do usuário) e `conferir-producao.sh`.
