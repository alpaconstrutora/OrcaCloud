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
- [ ] revisão desta especificação pelo usuário
- [ ] plano de implementação
- [ ] PR + CI
- [ ] publicação
