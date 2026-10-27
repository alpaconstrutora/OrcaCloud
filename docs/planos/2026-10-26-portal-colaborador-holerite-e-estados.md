# Portal do Colaborador — holerite pelo link e estados de tela

## Pedido original

Sessão `78d08b39`, 26/10/2026, à tarde.

1. Pedido: `/impeccable critique : portais > portal do colaborador > previa do portal` (com print da aba Início do portal do colaborador Claudinei da Costa Vieira).
2. Respostas às perguntas da crítica:
   - "Por onde começamos?" → **Holerite + estados (Recomendado)**
   - "O visual do portal deve mudar de cara?" → **Marca da Alpa**
   - "Quanto pegar agora?" → **Tudo (5 itens)**
3. Sobre a ordem de execução: "Posso rodar um de cada vez"

Crítica arquivada em `.impeccable/critique/2026-10-26T20-30-01Z__components-laborportal-tsx.md`
(checkout de integração). Nota: 18/40.

## Sequência combinada (um comando por vez)

| # | Comando | Escopo | Estado |
|---|---|---|---|
| 1 | `/impeccable harden` | P0 holerite pelo link + P1 estados de tela | no ar (#186) |
| 2 | `/impeccable clarify` | P1 prévia honesta (caminho único com token, faixa "vendo como") | no ar (#189) |
| 3 | `/impeccable clarify` | P2 datas, status, termos | no ar (#191) |
| 4 | `/impeccable init` + `shape` | marca da Alpa, Início = último holerite, navegação no rodapé | no ar (#193) |
| 5 | `/impeccable typeset` | pesos e tamanhos | **item 5 abaixo** |
| 6 | `/impeccable audit` | contraste, alvos de toque, ARIA | auditoria feita; **P1 abaixo** |
| 7 | `/impeccable polish` | passada final | **item 7 abaixo** |

## Item 1 — harden

### 1.1 Holerite abre pelo link (P0)

**Problema (conferido em 26/10):** `PaystubModal` lê `payroll_runs`, `payroll_results`,
`payroll_items`, `rubrics`, `payroll_events` e `organizations` direto. A policy de
`payroll_runs` é `is_org_member(org_id)`; o link roda como `anon` → 0 linhas →
`getRun().single()` falha → o colaborador vê "getRun: …". As duas prévias do RH
rodam com a sessão do admin e escondem o defeito.

**O que muda:**
- migration `aplicar_20271026950000_portal_colaborador_holerite_por_token.sql (nasceu 20271026900000; renomeada pela colisão com a SPE)`:
  `fn_colab_portal_paystub(p_token text, p_run_id uuid) RETURNS json`, SECURITY
  DEFINER, resolve o token por `fn_colab_portal_employee` e só devolve a folha se
  existir `payroll_results` daquele colaborador nela (mesmo critério de
  `portal_get_payroll_runs`). Devolve só os campos que o recibo usa (sem `employees.*`,
  sem `organizations.settings` inteiro). REVOKE de PUBLIC **e** anon antes do GRANT.
- `PaystubModal` recebe `portalToken?`; com token, carrega pela RPC; sem token, segue
  pelo `payrollService` (admin no app).
- `PortalView` passa o token ao modal.

**Pronto quando:**
- [x] com token válido devolve o holerite completo (result do próprio colaborador, run, itens, organização) —
      provado dentro do banco (bloco DO), sem tirar o token real do banco; a sonda que levava o token
      para um curl foi barrada pelo modo automático, com razão (o token é a credencial);
- [x] com a chave anon e token inválido devolve `PORTAL_TOKEN_INVALIDO` (HTTP 400, curl em 26/10);
      com run de outro colaborador devolve `PORTAL_HOLERITE_INDISPONIVEL` (bloco DO);
- [x] `has_function_privilege('anon', …)` = true só para a nova (`fn_colab_portal_employee` = false; curl anon
      nela = 401 `permission denied`); `segurancaMigrations` verde;
- [ ] abrindo `/portal?token=` numa janela anônima, o holerite abre — **não feito**: exige um link real de
      colaborador; fica para o usuário conferir depois do deploy.

Migration aplicada no banco remoto em 26/10 (`db query --linked -f`), ANTES do deploy do frontend.

### 1.2 Carregando / falhou / vazio em todas as abas (P1)

**Problema:** Ponto, Férias, Docs, Folha e Treinamentos (registro) leem só `data`;
carregando e erro aparecem como "Nenhum …". Resumo que falha vira zeros + alerta âmbar.

**O que muda:** um componente de estado por aba (carregando / falhou com "Tentar de
novo" / vazio com orientação), o mesmo trio que a Academia já tinha. Resumo que falha
mostra tela de erro (token inválido tem mensagem própria). Download de documento:
erro na tela em vez de `alert()`.

**Pronto quando:**
- [x] teste de componente cobre carregando, erro e vazio de pelo menos uma aba e o erro do resumo
      (`__tests__/components/LaborPortalEstados.test.tsx`, 6 casos; `__tests__/portalColaboradorErro.test.ts`, 6 casos);
- [x] `grep -n "alert(" components/LaborPortal.tsx` não acha nada;
- [x] `check-ui-standard.sh` nos arquivos tocados sem não-conformidade nova (LaborPortal e PaystubModal: 0).

**Também entrou (achado durante o item):** download abre a janela antes do `await`
(iPhone bloqueava) e trava o botão enquanto gera o link; a Academia deixou de mostrar
o texto técnico do erro; botão de sair ganhou nome acessível.

**Fica para depois (fora do escopo deste item):** `PaystubModal` ainda usa `alert()` no
erro de PDF (o modal é compartilhado com o app); `portal_get_payroll_runs` lista folhas
em RASCUNHO para o colaborador — decisão de produto, não alterada aqui.

## Item 2 — clarify: prévia honesta

Pedido: "seguir para o item 2" (mesma sessão, 26/10).

**Problema:** duas prévias. A aba "Prévia do Portal" abria o `PortalView` SEM token
(leitura por `portal_get_*(p_employee_id)` com a sessão do admin — Academia sumia,
holerite lia tabelas direto) e trocava a página inteira, com o ícone de sair como
única saída. O ícone de celular da tabela abria outro modal, com token, e o X
ficava em cima do sair. Nenhuma dizia que era prévia; o seletor deixava escolher
colaborador sem link (portal que ninguém vê).

**O que muda:**
- `PortalView.portalToken` passou a ser obrigatório; saiu o caminho por
  `employee_id` (`portal_get_*`, corpo do download por `employeeId`). As funções
  `portal_get_*` e `portal_employee_summary` ficam sem chamador no front — removê-las
  do banco é outra frente.
- Uma prévia só, no `MobilePreviewFrame` (o mesmo dos outros portais): o ícone da
  tabela e o seletor da aba chamam o mesmo `setPrevia`. A aba não troca mais a página.
- Faixa fixa "Prévia · vendo como {nome}" em todos os estados (carregando, erro,
  portal); sem botão de sair dentro da prévia (quem fecha é o "Fechar prévia" da
  moldura — um "Sair da prévia" na faixa repetiria o botão logo abaixo).
- Cursos da Academia travados na prévia, com o motivo: abrir registra tentativa e
  progresso pelo token, em nome do colaborador. Conferido no banco: nenhuma leitura
  `fn_colab_portal_*` grava `last_used_at` (só `portal_validate_token` e
  `fn_colab_portal_touch`, que a prévia não chama) — o "Último acesso" não é afetado.
- Seletor "Ver o portal como": grupo "Com link ativo" e grupo desabilitado "Sem link
  ativo — gere em Gestão de Acessos", cada um com "sem link" / "link expirado";
  ninguém com link → aviso + botão "Ir para Gestão de Acessos".

**Pronto quando:**
- [x] teste: faixa com o nome, sem "Sair do portal", faixa já no carregando, curso
      travado com motivo (`__tests__/components/LaborPortalPrevia.test.tsx`);
- [x] teste: seletor só habilita quem tem link; escolher abre a moldura com
      `getPortalSummary(emp, token)`; aba continua no lugar; ícone da tabela abre a MESMA prévia;
- [x] visto no navegador (harness `docs/spikes/portal-colaborador-previa/`, rede
      fictícia): faixa abaixo do notch (o notch cobria a faixa na 1ª versão — corrigido
      com `pt-8`), curso "Não abre na prévia";
- [x] `check-ui-standard.sh` sem violação; `tsc` limpo.

## Retorno do usuário sobre o item 2 + item 3

Pedido (literal): "1. Implementar sair da prévia 2. Lista de holerites somente fechadas
3. Seguir com o item 3".

### 2a — "Sair da prévia" na faixa
- [x] botão "Sair da prévia" na própria faixa (fecha a moldura); o nome não é mais
      cortado — quebra linha (`LaborPortalPrevia.test.tsx`: clique fecha a moldura).

### 2b — holerite só de folha FECHADA
Migration `aplicar_20271026980000_portal_colaborador_holerite_so_fechada.sql`:
- `portal_get_payroll_runs` (a lista) filtra `status = 'FECHADO'` — mesmo critério do app;
- `fn_colab_portal_paystub` (o recibo) recusa folha não fechada (tirar da lista não basta);
- **vazamento fechado de quebra:** a família `portal_get_*(p_employee_id)` +
  `portal_employee_summary` era executável por `authenticated` — qualquer conta logada,
  de qualquer org, lia ponto/férias/documentos/líquidos de qualquer colaborador pelo
  UUID. Último chamador no front saiu no #189; os wrappers `fn_colab_portal_*` são
  SECURITY DEFINER (dono postgres) e não dependem do grant. Revogado.
- [x] aplicada no banco pelo usuário em 26/10 (o modo automático barrou a aplicação por mim);
- [x] conferido: `portal_get_*` e `portal_employee_summary` sem EXECUTE para anon/authenticated
      (curl anon → 401); pelo link, lista só FECHADO, resumo e demais leituras respondem, recibo de
      folha aberta → `PORTAL_HOLERITE_INDISPONIVEL` (bloco DO).

### 3 — linguagem: datas, status, termos, "hoje" local
`utils/portalColaboradorTextos.ts` (puro, testado) + `LaborPortal.tsx`:
- datas dd/mm/aaaa (admissão, ponto, períodos, validades, prazo) — reaproveita `dataBR`/`hojeLocal`;
- status: Em análise / Aprovado / Recusado / Solicitado / Cancelado (cancelado caía no
  amarelo de pendente); tipos de ausência por extenso (o `replace('_',' ')` trocava só o 1º);
- "30d" → "30 dias", "+2HE" → "+ 2h extras", "Out/2026" → "Outubro de 2026", "v1" removido;
- abas por extenso (Holerites, Documentos, Treinamentos) em grade 3×2 — por extenso não
  cabem numa linha; rolagem horizontal esconde aba;
- "hoje" das validades pelo fuso do aparelho (`toISOString()` era UTC: depois das 21h já
  era amanhã e um documento que vence hoje aparecia vencido).
- [x] `__tests__/portalColaboradorTextos.test.ts` (8), testes de componente atualizados;
- [x] visto no harness (`passeio-textos.mjs`): 1ª versão cortava "Document…/Treiname…" e o
      nome na faixa — corrigido (ícone sobre o rótulo; faixa quebra linha).

## Item 4 — init + shape + build: marca da empresa, holerite como início, rodapé

Pedido (literal): "1. manter Academia ÒPURA 2. logo e cores anexos" (manual da Alpa: #FF884C,
#EDEDE8, #808EA1, #4B4B4D, #FFFFFF). Respostas: marca = logo da EMPRESA do colaborador com a
paleta Alpa; valor do último holerite escondido por padrão; rodapé Holerites · Ponto · Férias ·
Documentos · Treinamentos (Holerites é o início). Brief confirmado: "confirmado".

- `PRODUCT.md` criado (init). Contrato de direção em `.impeccable/surfaces/components-laborportal-tsx.md`.
- Migration `aplicar_20271026990000_portal_colaborador_resumo_com_empresa.sql`:
  `fn_colab_portal_summary` devolve `organization { name, logo_url }` (só isso — nada de CNPJ num link anônimo).
  - [x] aplicada no banco em 26/10 (a pedido do usuário); conferido: resumo pelo link traz nome e logo
        da empresa do colaborador, sem CNPJ/endereço/settings; primitivas seguem fechadas;
- `components/portalColaborador/PortalMarca.tsx`: cabeçalho com o logo (altura fixa, largura livre;
  sem logo ou logo quebrado → nome), cartão do último holerite, valor escondido que NÃO vai ao DOM,
  olho lembrado no aparelho (localStorage com try/catch), rodapé de 5 com aviso.
- Paleta medida: laranja #FF884C só preenche (2,4:1 no branco); texto laranja #A84A1C (5,7:1);
  secundário #566375 (6,1:1) no lugar do slate-400 (~2,6:1).
- [x] `__tests__/components/LaborPortalMarca.test.tsx` (8); testes do portal atualizados (62 no total);
- [x] visto no harness (`passeio-marca.mjs`) em 390, 360 e 1440: 1ª olhada mostrou símbolo pequeno,
      NR em vermelho antigo, nome da empresa cortado sem logo, rótulo "Treinamentos" cortado em 360
      e borda cinza no computador — corrigidos;
- [x] revisão final (impeccable-finish-reviewer, agente novo sem o histórico): 1ª rodada `fix` com 8
      correções (título-kicker no cartão, rodapé a 360, métrica-herói em Férias, tons de status fora da
      paleta, seed do contrato, borda laranja/NR repetido na Academia, títulos de seção em caixa alta,
      ponto de aviso mordendo a pílula) — aplicadas; 2ª rodada: 7 resolvidas + status ainda
      indistintos + ano órfão no título; 3ª rodada: `ship` (escopo: as correções, não a tela inteira);
- [x] `DESIGN.md` + `.impeccable/design.json` (impeccable-documenter), escopo só o Portal do Colaborador.

**Fica para os itens 5 e 6** (apontado pelo documentador, fora da paleta mas fora deste escopo):
cinzas do Tailwind no estado vazio da Academia e no percentual do curso; indicador de carregamento em
#FF884C (laranja só-preenchimento como ícone); `Button`/`ActionIconButton` do app dentro do portal;
botão de fechar o aviso de download sem anel de foco; `font-black` em números de ponto/férias e no código de NR.

## Item 5 — typeset: tipografia do portal

Pedido: "seguir para o item 5".

Avaliação: Inter (a do app) mantida — tela de tarefa, já carregada; DM Sans (usada no Portal do
Cliente) não teria papel próprio. Cinco pesos em uso (400/500/600/700/900); título de linha diferente
por aba (16/600 em Holerites, 14/700 em Ponto/Férias); legendas em 12px e rodapé em 11px; nome do
cabeçalho do mesmo tamanho do título do cartão. Detector `--scope type`: sem achados (antes e depois).

Sistema: uma família, quatro pesos (400 lê · 500 só rodapé · 600 nomeia · 700 só cartão/nome/valor),
papéis em `DESIGN.md` (hero-value, card-title, identity, row-title, row-value, notice, row-meta,
section-title, label, nav-label, button-label); algarismos tabulares em todo número comparável.

- [x] sem `font-black`, sem 11px, sem `slate-500` no portal; legendas 14px; rodapé 12px;
- [x] visto no harness em 390/360/1440: a 1ª versão quebrou "· Setembro" no início da linha (quebra
      equilibrada) e "8h + 2h extras" em duas linhas a 360 — corrigidos (espaço inquebrável no "·";
      valor de linha sem quebra);
- [x] `DESIGN.md` e `.impeccable/design.json`: tipografia deixa de ser "provisória".

Fica para o item 6 (audit): `Button`/`ActionIconButton` do app dentro do portal; botão de fechar o
aviso de download sem anel de foco; indicador de carregamento em #FF884C.

## Item 6 — audit (13/20) e P1 (adapt)

Pedido: "seguir para o item 6"; depois "p1".

Auditoria (medida no harness renderizado, 5 abas, 390px e 360px com texto a 200%): contraste 100%
dentro do mínimo; foco visível em tudo; nota 13/20 — Acessibilidade 3, Performance 3, Tokens 2,
Responsivo 2, Integridade 3.

P1 corrigidos:
- **Texto a 200% vazava** 81–134px na horizontal (WCAG 1.4.4/1.4.10): rodapé com consulta de contêiner
  em `em` — abaixo de ~19,5em fica só-ícone (rótulo vira nome acessível), grade de 5 colunas iguais;
  linhas de ponto/férias/holerite/treinamento com `flex-wrap` (valor e status descem); título do cartão
  prende só "de AAAA" (travar a competência inteira vazava 37px).
- **Baixar documento 24×24px** → botão da marca de 44px (era o `ActionIconButton` do app).
- de quebra: `h1` (só para leitor de tela) com o nome da aba.
- [x] medido de novo: vazamento 0 nas 5 abas a 390 e a 360/200%; nenhum alvo < 44px; contraste e foco ok.

P2/P3 da auditoria, ainda abertos: barra de progresso da Academia sem `role="progressbar"`; títulos de
seção como parágrafo; cores escritas à mão (69 ocorrências); `Button` do app no "Tentar de novo";
logo em data URI (~100 KB) a cada resumo; `PortalView` no pacote principal (import estático no App);
spinner sem "reduzir movimento".

## Item 7 — polish (P2/P3 da auditoria)

Pedido: "de acordo" (publicar os PRs, rodar o polish, nova auditoria; desempenho depois).

- cores do portal viram tokens `portal-*` no `@theme` (69 hex e 13 sombras à mão → 0); `MARCA` usa os tokens;
- "Tentar de novo" na marca (era o `Button` do app, borda/foco azuis) — o portal não usa mais nenhum componente do app;
- títulos de seção são `h2` (com o `h1` por aba do P1, a página tem estrutura de títulos);
- barra de progresso da Academia com `role="progressbar"` e valor;
- anel de foco da marca no cartão do curso e no fechar do aviso; spinners param com "reduzir movimento";
- selo de treinamento volta para a direita quando cabe (o `flex-wrap` do P1 o empurrava para baixo).
- [x] medido no harness: vazamento 0, alvos ≥ 44px, contraste e foco ok nas 5 abas a 390 e a 360/200%.

Fica para `/impeccable optimize`: logo em data URI no resumo; `PortalView` no pacote principal.

## Item 8 — optimize (desempenho)

Pedido: "Sim" ao `/impeccable optimize` oferecido depois da nova auditoria (19/20, desempenho 3/4).

Medido antes de mexer (27/10/2026):
- `organizations.logo_url` é a imagem EMBUTIDA (data URI): as 2 organizações com colaborador têm
  80 KB e 134 KB. Ia dentro de `fn_colab_portal_summary`, pedido ao abrir, a cada volta para a aba
  (staleTime 30 s) e depois de cada ação.
- `PortalView` era import estático no `App.tsx`: o portal ia no pacote principal (2.168 KB, 598 KB
  gzip), que todo usuário do app baixa; os outros portais já eram `React.lazy`.

Feito:
- migration `20271027200000`: o resumo traz `organization { name, logo_versao }` (md5); o logo vem por
  `fn_colab_portal_logo(p_token)` (mesma autorização pelo token, REGRA #7). O front guarda o logo no
  aparelho pela versão (`utils/portalColaboradorLogo.ts`, uma entrada só) e só baixa quando a empresa
  troca o logo; enquanto chega, a altura do logo fica reservada (o nome não pisca no lugar). O front
  ainda aceita `logo_url` no resumo — **ordem: front no ar ANTES da migration**.
- `PortalView` sob demanda (`React.lazy`), com o download disparado junto da validação do token (sem
  cascata); carregando e link inválido na marca do portal (eram índigo, caixa-alta e um emoji 🔒).
