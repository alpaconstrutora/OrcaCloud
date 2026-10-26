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
| 1 | `/impeccable harden` | P0 holerite pelo link + P1 estados de tela | **este arquivo** |
| 2 | `/impeccable clarify` | P1 prévia honesta (caminho único com token, faixa "vendo como") | pendente |
| 3 | `/impeccable clarify` | P2 datas, status, termos | pendente |
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
- migration `aplicar_20271026900000_portal_colaborador_holerite_por_token.sql`:
  `fn_colab_portal_paystub(p_token text, p_run_id uuid) RETURNS json`, SECURITY
  DEFINER, resolve o token por `fn_colab_portal_employee` e só devolve a folha se
  existir `payroll_results` daquele colaborador nela (mesmo critério de
  `portal_get_payroll_runs`). Devolve só os campos que o recibo usa (sem `employees.*`,
  sem `organizations.settings` inteiro). REVOKE de PUBLIC **e** anon antes do GRANT.
- `PaystubModal` recebe `portalToken?`; com token, carrega pela RPC; sem token, segue
  pelo `payrollService` (admin no app).
- `PortalView` passa o token ao modal.

**Pronto quando:**
- [ ] a RPC chamada com a chave anon e um token válido devolve o JSON do holerite (curl);
- [ ] com token inválido devolve `PORTAL_TOKEN_INVALIDO`; com run de outro colaborador devolve erro;
- [ ] `has_function_privilege('anon', …)` = true só para a nova; teste `segurancaMigrations` verde;
- [ ] abrindo `/portal?token=` numa janela anônima, o holerite abre.

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
