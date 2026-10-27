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
| 3 | `/impeccable clarify` | P2 datas, status, termos | **item 3 abaixo** |
| 4 | `/impeccable init` + `shape` | marca da Alpa, Início = último holerite, navegação no rodapé | pendente — precisa de logo e cores da Alpa |
| 5 | `/impeccable typeset` | pesos e tamanhos | pendente |
| 6 | `/impeccable audit` | contraste, alvos de toque, ARIA | pendente |
| 7 | `/impeccable polish` | passada final | pendente |

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
- [ ] aplicada no banco — **aplicar foi barrado pelo modo automático; aguarda o usuário**;
- [ ] conferir depois: `has_function_privilege('authenticated', 'portal_get_payroll_runs(uuid)')` = false;
      lista do portal sem PROCESSANDO.

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
