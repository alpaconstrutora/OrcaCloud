# Portal do Investidor › Comunicados — CRUD do gestor

## Pedido original

Sessão `5fa427cc-4815-4b9f-a225-07166ea8b809`, 16/11/2026:

> portais > portal do investidor > aba comunicados : implementar CRUD

Depois do levantamento (a aba só criava rascunho, publicava e listava; não editava nem
excluía), o usuário respondeu:

> comece

## O que existia (origin/main `baed0dd60`)

- `components/investor/CommunicationCenter.tsx` servia o gestor e o leitor do app:
  formulário solto na página com `alert()`, "Salvar rascunho" e "Publicar". Sem editar, sem excluir.
- `services/announcementsService.ts` já tinha `save` (insert/update) e `remove`, sem uso de `remove`.
- Banco: `investor_announcements` (policy de escrita = dono/admin da organização);
  `investor_acknowledgments` com `ON DELETE CASCADE` — excluir um comunicado apaga aceites e votos.
- A lista do gestor seguia a organização do INVESTIDOR selecionado, não o topo (o mesmo defeito
  que o #497 corrigiu em Oportunidades e Relatórios).
- Dados em 16/11: 4 comunicados (um "f" de teste, dois "Relatório Mensal — 05/2026" iguais),
  nenhum com aceite.

## Decisões (minhas, anunciadas ao usuário antes de começar)

1. Rascunho: editar e excluir livres (excluir com `useConfirm`).
2. Publicado sem aceite/voto: editar e excluir, com confirmação.
3. Publicado com aceite/voto: travado — o investidor confirmou AQUELE texto, e excluir apagaria
   o registro em cascata. Botão desligado diz o motivo. A trava é conferida de novo no serviço
   na hora de gravar (um aceite pode chegar com o painel aberto).
4. Lista segue o seletor do topo (REGRA #5): org → `.eq`, "Todas" → sem filtro (RLS recorta).
5. Criar com o topo em "Todas" → `useOrgWriteTarget('single')`: comunicado é de UMA organização
   (vai para os investidores dela pelo link).
6. Formulário no `Sheet` (UI_PATTERNS §3); lista em `StandardTable` (§6.10).

## Itens

- [x] **1. Serviço** — `listAll(org | null)` traz a contagem de respostas; `create`, `update`,
  `publish` e `remove` acusam quando a RLS não deixou gravar (0 linhas) e recusam editar/excluir
  com resposta. `listResponses` traz o nome do investidor.
  *Pronto quando:* testes do serviço passam (`__tests__/services/announcementsService.test.ts`).
  ✅ 13 testes passando.
- [x] **2. Tela do gestor** — `components/investor/AnnouncementsManager.tsx`: tabela (título, tipo,
  situação, publicado em, respostas, organização em "Todas"), clique na linha abre o painel,
  "Publicar" e excluir na coluna de ações, painel com criar/editar/publicar/excluir e lista de respostas.
  *Pronto quando:* teste de componente cobre listar pelo topo, criar, editar, publicar, excluir e a trava.
  ✅ 12 testes em `__tests__/components/AnnouncementsManager.test.tsx` (inclui "Todas" → modal da organização).
- [x] **3. Ligação** — `InvestorDashboard` usa o gerenciador para o gestor (org do topo) e o
  `CommunicationCenter` só para o leitor do app (perde o formulário de gestão).
  *Pronto quando:* `tsc` limpo e `check-ui-standard.sh` sem achado novo nos arquivos tocados.
  ✅ `tsc` exit 0; `check-ui-standard.sh` limpo nos 3 arquivos (o `CommunicationCenter` tinha 4 pílulas §8,
  corrigidas); travas `orgContextGuard`, rótulo, altura de campo, valor sem cinza, animação, dark: verdes.
- [ ] **4. Conferência na tela** — abrir Portais › Portal do Investidor › Comunicados no app local,
  criar/editar/publicar/excluir um comunicado de teste e ver o resultado no portal pelo link.
  ⏳ **Parcial (16/11):** os perfis do Playwright estavam sem sessão, então a conferência foi pela página
  temporária da frente (`InvestorDashboard` real na aba Comunicados, como gestor, Supabase respondido pelo
  script): topo "Todas" e topo numa organização, 1440 px e 390 px, criar (com o modal de organização),
  editar, publicar, alterar publicado, excluir, trava com respostas, sistema em modo escuro — 0 erro de
  console, 390 px sem rolagem lateral. Achado e corrigido nela: no celular a barra inferior do
  `InvestorDashboard` (`fixed z-50`) cobria o rodapé da gaveta → gaveta com `zIndex={60}`.
  Falta: a mesma volta no app logado e o reflexo no portal pelo link.

## Fora do escopo (anotado)

- O portal pelo link não tem botões de voto (só "Confirmar"): comunicado do tipo Votação recebe
  só confirmação de quem acessa pelo link.
- A trava de "publicado com resposta" é do app; o banco aceitaria o UPDATE de um admin direto.
- Comunicado é da ORGANIZAÇÃO, não do investidor: o gestor chega pela ficha de um investidor, mas o que
  publica vai para todos os investidores com link daquela organização (`fn_investor_portal_get_announcements`
  filtra por `v_tok.org_id`).
