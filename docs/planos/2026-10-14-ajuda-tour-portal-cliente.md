# Ajuda + tour guiado + "Primeiros passos" no Portal do Cliente

## Pedido original

Sessão de 14/10/2026 (Claude Code, VS Code), primeira mensagem:

> da mesma mandeira que foi implementado em portais > portal do parceiro (visão do parceiro): implementacapo de ajuda e tour guiado.
> implementar também em  implementado em portais > portal do cliente (visão do cliente)

## Contexto

O Parceiro, o Fornecedor e o Corretor já têm a central de ajuda, o tour guiado e o
"Primeiros passos" (F1–F8: `2026-10-03-ajuda-portais-externos.md` e
`2026-10-04-tour-guiado-v2-portais.md`). Esses planos não mencionam o Portal do Cliente:
ele ficou de fora só porque o pedido de 03/10 citava três portais. Até aqui, o item
"Ajuda e comandos" do cliente mostrava só um aviso ("Dúvidas? Fale com a construtora…").

**Decisão:** `'cliente'` entra como 4º portal nas MESMAS peças: `PortalHelp`,
`PortalTour`, `PortalChecklist`, `portal_help_items`, `portal_tour_progress` e o editor.
Nenhuma tabela nova.

## Itens

### 1. Banco — `aplicar_20271014610000_portal_help_cliente.sql`

O que muda:
- Os dois CHECK de `portal` aceitam `'cliente'`.
- `portal_link_identidade`: ramo `client_portal_tokens`.
- `portal_help_orgs_of`: ramo `clients.email`, o mesmo critério do login.
- Nova casca `client_portal_help_get(token)`.
- `portal_help_get_mine` e `portal_tour_mark` aceitam `'cliente'`.
- `portal_tour_stats`: nome do cliente no acompanhamento.
- REGRA #7: núcleos sem grant; casca e mark com anon e authenticated; get_mine e stats só authenticated.

Pronto quando:
- [x] Ensaio em `BEGIN…ROLLBACK` passa:
  - token válido lê;
  - `portal_tour_mark` grava e o `seen` volta;
  - token falso não lê e dá 42501 ao gravar;
  - INSERT `portal='cliente'` passa no CHECK;
  - anon executa a casca e não executa os núcleos;
  - authenticated não executa `portal_help_orgs_of`.
- [x] Depois do ROLLBACK o banco ficou intacto: função inexistente e CHECK antigo.
- [x] Aplicada no banco remoto (`db query -f`) antes do push.
- [x] Conferida de fora, com a chave pública:
  - `client_portal_help_get('falso')` devolve `{"valid": false}`;
  - `portal_help_orgs_of` dá 401 para anon;
  - `portal_tour_mark` com link falso dá 42501.

### 2. Conteúdo padrão — `utils/portalHelpDefaults.ts` e `utils/clientPortalTabs.ts`

O que muda:
- `Portal` ganha `'cliente'`.
- `PORTAL_SECTIONS.cliente` são as 14 abas. Os ids vêm de `CLIENT_PORTAL_TAB_IDS`, de onde o `ClientArea` também deriva `ALL_TABS`.
- Artigos: 1 por aba, mais "O que é" e "Meus dados".
- Perguntas frequentes: próprias do cliente, porque `FAQ_ACESSO` fala de "empresa" e de convite.
- Tour do portal: menu → Obra → Documentos → Financeiro (+ resumo) → Manutenção → Mais → Ajuda → Conta.
- Mini-tours: Dashboard, Obra, Documentos, Financeiro e Manutenção.
- Checklist: obra, documentos, baixar documento, financeiro e abrir chamado.
- `utils/portalEventos.ts`: ações `baixou-documento` e `abriu-chamado`.
- `services/portalHelpService.ts`: `cliente → client_portal_help_get`.

Pronto quando:
- [x] `portalHelpSections`, `portalHelpDefaults` e `portalTourAnchors` incluem `'cliente'` e passam.

### 3. Portal — `components/ClientArea.tsx`

O que muda:
- Link, header:
  - `?` com `data-tour="ajuda"`;
  - `data-tour="conta"`;
  - "Ajuda" no menu da conta no lugar do aviso.
- Menu lateral: `data-tour="menu"` e `aba-<id>`. No Condomínio, a âncora fica no botão do grupo.
- Cliente logado (sem a casca): `?` no título (`renderPortalActions`). A barra de abas do app recebe `menu` e `aba-<id>`.
- Celular: "Mais" permanente (4 abas + Mais), com "Ajuda" no sheet, igual ao Fornecedor.
- Âncoras de conteúdo, com todas as variantes de categoria:
  - `dashboard-resumo` (padrão, Locação, Serviços, celular);
  - `obra-progresso`;
  - `documentos-lista`;
  - `financeiro-resumo` (padrão, Locação, Serviços, celular);
  - `manutencao-abrir` e `manutencao-lista`.
- Encaixe do checklist no topo da 1ª aba liberada. O gestor espiando não o vê.
- `avisarAcaoDoPortal` depois do download de documento e da abertura de chamado.
- `PortalHelp` montado com `modoPrevia={isPreview && !portalToken}`: o link real chega com `isPreview`, a mesma armadilha da F5.
- `autoTour` vale no link e para o cliente logado; nunca na prévia nem para o gestor.
- Prop nova `forcarTour`.

Pronto quando:
- [x] `__tests__/components/ClientPortalAjuda.test.tsx` passa: 7 casos.
  - Mutação `modoPrevia={isPreview}` derruba o caso do link real (conferido).
- [x] `portalTourPreviaVsLink` cobre `ClientArea` e a rota de `App.tsx`.
- [x] `check-ui-standard.sh` sem violação.
- [x] Conferido na tela, no link `/portal-cliente?token=…` (Playwright, `c:/tmp/pwtest/teste-ajuda-cliente.js`).
  - Como: `client_portal_get_data` simulado com cliente fictício e toda escrita interceptada, então nada foi gravado.
  - Desktop:
    - o tour abre sozinho, com 8 passos (o "Mais" do celular não conta) e navegação até Financeiro;
    - o checklist aparece e marca "Veja seus documentos" ao abrir a aba;
    - o mini-tour de Documentos aparece na 1ª visita;
    - `?` e menu da conta → Ajuda abrem a central, só com as seções liberadas.
  - Celular:
    - a barra mostra Dashboard, Obra, Documentos, Contratos e Mais;
    - "Mais" traz Financeiro, Manutenção e Ajuda;
    - a central abre.
  - Gravações pedidas, interceptadas: `portal_tour_mark` com `geral` concluído no passo 9, item do checklist e mini-tour de Documentos.
  - Sem erro de console.

### 4. Editor — `components/PortalHelpSettings.tsx`

O que muda:
- Portal "Cliente" no seletor.
- A pré-visualização lista os clientes da organização (`clientService.listClients`) e abre o `ClientArea` em `MobilePreviewFrame` com `forcarTour`.
- O acompanhamento já é genérico.

Pronto quando:
- [x] typecheck limpo e `PortalHelpSettings.test.tsx` passa (16).
  - Caso novo: o seletor "Portal do Cliente" → Pré-visualizar lista os clientes da org e abre `ClientArea` com `isPreview`, `forcarTour` e sem token.
- [ ] Conferido na tela pelo gestor: Configurações › Ajuda dos Portais › Cliente.
  - Pendente: o login de leitura é Membro, e o editor é de owner/admin.

## Fora do escopo

- O Portal do Investidor e o do Colaborador não foram pedidos.
