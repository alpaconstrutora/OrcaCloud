# WhatsApp da empresa pelo OpenWA — piloto: envio de pedido de compra

> Documento de design (fase 1 do plano vivo — REGRA #6). O plano de implementação
> item a item entra neste MESMO arquivo, na seção "Plano", depois da aprovação.

## Pedido original

Sessão `dcde2108-afdc-429f-bec8-cd58bb046336` · 23/11/2026. Mensagens do usuário,
literais, na ordem:

> analise este md
>
> *(anexo: `PRD_OPURA_CENTRAL_COMUNICACAO_OPENWA.md` — PRD v1.0 de 23/11/2026,
> "Central de Comunicação do ÒPURA com OpenWA", gateway `rmyndharis/OpenWA`
> com motor Baileys. O anexo não está salvo em disco.)*

> Decisões que precisam entrar no PRD antes da Etapa 1
> 1. A Cloud API coexiste ou sai? coexiste
> 2. O que acontece com whatsapp_queue e whatsapp_config, que estão vazias e sem consumidor? Manter
> 3. Tenant é igual a organização ou a grupo? organizacao
> 4. Quem hospeda e opera a VPS do OpenWA? qual a sugestão?
> 5. Qual é o primeiro caso real do piloto: número, equipe e interlocutores? qual numero voce precisa?

> qual o custo da vps da open wa?

> para uso interno da equipe com pouquissimo numero de mensagem. existe alternativa  sem custo?

> tem como termos as duas opções oracle e a maquina do trabalho?
> Terceira opção servidor ugreen https://ugreendobrasil.com.br/produto/servidor-nas-ugreen-nasync-2-baias-4gb-ram-hdmi-4k-gigabit/?srsltid=AYCX9vKxspYWkbdZJ7H77OppzID0dXMkffzercuC94K5kR7wsZC7Ny-b

> Um custo que vale pesar: são duas instalações para manter atualizadas. Para uso interno com pouco volume, eu começaria só com a máquina do trabalho e montaria a reserva na Oracle se a máquina se mostrar instável.
> de acordo. Vamos iniciar com a sua sugestão. Apenas maquina de trabalho.
> Tenho um chip que não tem numero de celular, vamos usar ele. se o whatsapp banir o numero é menor prejuizo

> Da máquina do trabalho: esta máquina.
> No Windows, o caminho é Docker Desktop. nesta máquina o doker desktop esta instalado. verifique
> Se for Windows, provavelmente sugiro WSL2 com Docker dentro, ou um Linux pequeno. Verifique
> Fica ligada 24h? E religa sozinha depois de queda de energia (configuração da BIOS)? verifique
> Quem tem acesso a ela para a instalação. Desenvolvedor
> Do piloto:
> Organização dona do número: Alpa construtora e incorporador
> Equipe: quais usuários vão atender pela Central. implementar Painel de gestão de usuários em minha organização > usuários
> Interlocutores: com quem eles vão falar (fornecedores, clientes, inquilinos). fornecedores, clientes
> Uma conversa real de hoje que deveria passar a acontecer pela Central. Cobrança, mensagem das minhas tarefas, comunicacados, avisos, pedidos, enfim é um escopo grande que deve ser detalhado

> Minha proposta: rodar o OpenWA num Ubuntu próprio dentro do WSL2. de acordo.
> Vou de dar um exemplo que será nosso piloto. Envio de pedido via whatsapp (suprimentos > pedidos)

> quando voce fala Cloud API se refere ao api ofical do whatsapp?
> continue

> B

> 1. Que chip é esse? Escrevi errado, queria dizer que é um chip que ainda nao tem whatsapp
> 2. Sim, esse numero deve servir a todo app nao somente a alpa. Todas as organizações.
> 3. explique para eu entender

> Nao vou transferir o dominio para o Cloudflare. Traga outra solução

> Voce trouxe um solução pior da primeira vez, Sera que essa também não é o mesmo caso?
> Pesquise profundamente na internet se existe outro solução melhor. Se não existir então vamos com sem túnel.

> design aprovado

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 23/11 | A API oficial (Cloud API da Meta), já no app, coexiste ou sai? | **Coexiste.** Nada dela é removido. |
| 23/11 | `whatsapp_queue` / `whatsapp_config` (Comunicação do RH, vazias, sem consumidor) | **Manter** como estão. Este piloto não as toca. |
| 23/11 | "Tenant" = organização ou grupo? | **Organização** (`organization_id`). |
| 23/11 | Onde roda o gateway | **Só a máquina do trabalho** (ALTAIR-PC). Oracle Always Free fica como reserva futura, só se a máquina se mostrar instável. NAS UGREEN DH2300 descartado (sem Docker). |
| 23/11 | Como roda na máquina | **Ubuntu próprio dentro do WSL2**, com Docker Engine próprio, separado do Docker Desktop. |
| 23/11 | Número | **Chip avulso, que não é de ninguém.** Se for restringido, o prejuízo é pequeno. |
| 23/11 | Organização dona do número | **Alpa Construtora e Incorporadora.** |
| 23/11 | Quem pode usar | Escolhido em **Minha organização › Usuários** (permissão nova). |
| 23/11 | Primeiro caso real | **Envio de pedido de compra** (Suprimentos › Pedidos) ao fornecedor. Cobrança, tarefas, comunicados e avisos ficam para depois. |
| 23/11 | Como construir | **Caminho B**: fila no banco, tentativa imediata e job de minuto em minuto. Tabelas genéricas (servem a outros casos depois). |
| 23/11 | O chip | Chip de linha comum, **ainda sem WhatsApp** ("Escrevi errado, queria dizer que é um chip que ainda nao tem whatsapp"). |
| 23/11 | Os pedidos da SPE do Garden saem pelo número da Alpa? | **"Sim, esse numero deve servir a todo app nao somente a alpa. Todas as organizações."** → **um número da plataforma**, compartilhado por todas as organizações. Os **dados** (mensagens, vínculos) continuam separados por organização. Revê a leitura anterior de "tenant = organização" para o **número**; vale para os dados. Hoje são 8 organizações, todas do grupo do usuário. |
| 23/11 | Como o OrçaCloud alcança a máquina | "Nao vou transferir o dominio para o Cloudflare. Traga outra solução" → pesquisa → **sem túnel**: a máquina é quem liga para fora. Um programa pequeno na máquina ("worker") recebe um "toque" do Supabase Realtime quando entra mensagem na fila, busca, envia pelo OpenWA local e informa o resultado. O OpenWA não fica acessível pela internet. |

## Intenção — por quê

Hoje o botão de WhatsApp do pedido cai sempre no plano B: nenhuma organização
cadastrou a API oficial, então ele abre `api.whatsapp.com/send?text=…` no
**WhatsApp pessoal de quem clicou**. A mensagem sai do número de uma pessoa, o
app não sabe se foi enviada, e a resposta do fornecedor fica no celular dela. O
envio automático ao marcar "Enviado" só existe com a API oficial, ou seja, não
acontece.

O piloto troca isso por: **o pedido sai do número da empresa, fica registrado no
pedido, e a resposta do fornecedor volta para dentro do pedido.** Ele também
valida o OpenWA (instalação, pareamento, estabilidade, risco de restrição) num
caso pequeno e real antes de estender a cobrança, tarefas e comunicados.

## Estado atual (conferido em `origin/main` a770f7583 e no banco, 23/11)

- **Pedido** — `purchase_orders`. `status` com CHECK (`Rascunho`, `Enviado`, …
  `Cancelado`). `share_token uuid` e link público `/pedido/<uuid>`
  (`PublicOrderView`, RPC `get_order_by_share_token`, anon).
- **Envio automático** — `services/orderService.ts:475-489`: ao virar `Enviado`,
  se `whatsappService.apiAtivaNaOrg(org)` → `whatsappService.enviarPedido(id)`.
  Falha é engolida (`console.error`): o envio nunca derruba o pedido.
- **Botão** — `SupplyChainOrderDetails.tsx` `handleWhatsAppShare` (~944): API
  oficial se ativa; senão `api.whatsapp.com/send?text=…`.
- **API oficial** — Edge Function `whatsapp-cloud` (ação `enviar_pedido`): lê o
  pedido, exige membro da org do pedido, telefone em `suppliers.phone`
  normalizado por `normalizarTelefoneWhatsapp`, gera `share_token` novo, envia o
  template, grava `notification_log`. `whatsapp_cloud_config`: 0 linhas.
- **Fornecedor** — telefone só em `suppliers.phone` (sem coluna WhatsApp).
  Banco: 135 de 341 fornecedores têm telefone; dos 18 pedidos da Alpa
  Construtora, 8 são de fornecedor com telefone. **"Sem telefone" é o caso
  comum, não a exceção.**
- **Histórico do pedido** — `notification_log` (`order_id`, `channel` CHECK
  `email|webhook|whatsapp`, `status` CHECK `sent|failed|pending`, `metadata`).
  Mostrado na aba Comunicação ("Histórico de Notificações"). O fornecedor vê
  pelo portal, sem `body`/`error`/`metadata`.
- **Chat do pedido** — `order_chats` (`order_id`, `sender_email`, `sender_name`,
  `sender_role` `buyer|supplier|system`, `message`, `is_system`), com Realtime
  (`order-chat-<orderId>`), visível ao comprador e ao fornecedor do portal.
- **Sino** — `notifications` (`recipient_email`, `title`, `message`, `link`,
  `type` slug livre, `organization_id`). Slug novo → entrada em
  `components/notifications/notificationTypes.ts`.
- **Permissões** — `organization_members.permissions` (JSONB). Declarar em
  `types/users.ts`, `getDefaultPermissions` e `DETAILED_PERMISSIONS`
  (`OrganizationUsers.tsx`), helper em `utils/`. Não há função SQL genérica:
  o banco confere `permissions->>'flag'`.
- **Edge Functions** — `_shared/auth.ts`: `exigirMembro`, `exigirGestor`,
  `chamadaDeCron`, `respostaDeErro`. Cron = `cron.schedule` + `net.http_post` com
  `fn_cron_secret()`; job novo entra no `CATALOGO` de `utils/rotinasAutomaticas.ts`.
  Não existe receptor de webhook com HMAC; o modelo de HMAC (de saída) está em
  `planta-webhooks/politica.ts`.
- **Configurações › WhatsApp & Integrações** — `Settings.tsx` aba `whatsapp`,
  componente `WhatsappCloudSettings.tsx` (API oficial).
- **Máquina** (ALTAIR-PC, conferida 23/11) — Windows 11 Pro, i9-14900K, 64 GB,
  sem bateria, 77 GB livres em C:. Docker Desktop 29.9 em WSL2. Nunca suspende
  na tomada. **Mas:** Docker Desktop sem início automático, sem login automático,
  ~12 reinícios manuais e 6 desligamentos forçados em 30 dias. BIOS "Restore AC
  Power Loss" não conferida (não se lê de dentro do Windows).
- **OpenWA** (conferido no commit `5eaadd39`): `openapi.json` com SHA-256
  `AE5AF66D…A498`; rotas `/api/sessions/{id}/start|stop|logout|qr|webhooks`,
  `messages/send-text|send-document|…`, `messages/{chatId}/{messageId}/media`,
  `/api/health/ready`. Versão 0.31.0, Baileys 7.0.0-rc14. Imagem Docker
  amd64+arm64. Modo SQLite num container só. Baileys ~30–80 MB por sessão.

## Objetivos

1. Pedido sai **do número da Alpa** pelo botão do pedido e, automaticamente, ao
   marcar **Enviado**.
2. O pedido mostra se a mensagem foi **enviada, entregue, lida ou falhou** —
   sem dizer "entregue" sem evidência.
3. A **resposta do fornecedor aparece no chat do pedido** e avisa no sino quem
   enviou. O comprador **responde dali**, e a resposta sai pelo WhatsApp.
4. Só quem tem a permissão nova usa o número da empresa.
5. Se a máquina estiver fora, nada se perde: o envio espera na fila e sai
   quando ela voltar.

## Não-objetivos (agora)

- Caixa de entrada completa (atendimentos, filas, transferência, notas,
  indicadores) — a "Central" do PRD.
- Cobrança, tarefas, comunicados, avisos, clientes — próximos casos, que reusam
  as tabelas genéricas deste piloto.
- Mexer na API oficial, em `whatsapp_queue` ou em `whatsapp_config`.
- Enviar PDF do pedido (o link público já mostra o pedido inteiro).
- Grupos de WhatsApp, envio em massa, reserva na Oracle, alta disponibilidade.

## Antiobjetivos (fracasso mesmo funcionando)

- Mensagem sai **duas vezes** para o fornecedor (reenvio cego, clique duplo,
  evento repetido).
- Pedido de **uma organização** sai pelo número de **outra**, ou resposta cai em
  pedido de outra organização.
- Chave do OpenWA, segredo do webhook ou QR Code chegando ao navegador, a log ou
  ao repositório.
- O app afirma "entregue/lido" sem evidência, ou esconde uma falha.
- Marcar o pedido como Enviado **falha ou trava** porque o WhatsApp está fora.
- Envio "silencioso" que ninguém percebe que não saiu.

## Restrições

- Regras do projeto: #5 (organização do topo é a autoridade; aqui a org vem do
  **pedido**, nunca do corpo da requisição), #7 (3 perguntas em toda policy,
  função e Edge Function), #8 (frente própria; deploy é push), #6 (este arquivo).
- Banco: nunca `db push`; migration aplicada com `db query --linked -f`.
- Policy nova já nasce por conjunto: `organization_id IN (SELECT minhas_orgs_membro())`.
- Function nova: REVOKE de PUBLIC/anon; SECURITY DEFINER só onde precisar.
- Permissão nova sensível: `false` explícito para owner/admin **depois** do
  `reduce` de `getDefaultPermissions`, e grupo próprio em `DETAILED_PERMISSIONS`.
- Chamada da tela à Edge Function deve responder em menos de ~15 s.

## Abordagens consideradas

| | Como | Troca |
|---|---|---|
| A | Botão chama o OpenWA na hora, sem fila. | Mais simples. Mas com a máquina reiniciando, o envio falha e o envio automático ao marcar "Enviado" se perde. |
| **B (escolhida)** | Fila no banco: grava a mensagem, tenta na hora, job de minuto em minuto reenvia o que ficou. Respostas por webhook assinado. Tabelas genéricas por organização, ligadas a "um registro do app". | Mais peças, mas nada se perde com a máquina fora, e o próximo caso não pede tabela nova. *(Depois, sem túnel: o "job de minuto em minuto" virou o worker na máquina — ver decisões.)* |
| C | A Central completa do PRD. | Grande demais para validar um caso. |

**Escolhida pelo usuário: B** (23/11).

## Design

### 1. Infraestrutura na máquina

- Distro WSL2 dedicada (`openwa`, Ubuntu LTS) com systemd e Docker Engine
  próprio. O Docker Desktop continua como está, para o trabalho de
  desenvolvimento.
- Uma tarefa agendada do Windows, **"ao iniciar o sistema", sem exigir login**,
  sobe a distro e o Docker dela.
- OpenWA em Docker Compose, **imagem fixada por digest**, `ENGINE_TYPE=baileys`,
  **modo SQLite**, volume persistente para o banco e as credenciais da sessão.
  `SEND_PACING_ENABLED=true` (aquecimento do número).
- Exposição: **nenhuma**. Sem túnel, sem porta aberta: a API e o painel do
  OpenWA só respondem dentro da máquina (`127.0.0.1`). Tudo que sai da máquina
  é ela que inicia (WebSocket do Realtime, HTTPS para Edge Functions, webhook
  do OpenWA para o Supabase).
- **Worker** (container ao lado do OpenWA, Node, ~150–250 linhas):
  1. assina um canal do Supabase Realtime que só diz "tem mensagem na fila"
     (sem conteúdo — ver §2, gatilho `wa_tocar_campainha`);
  2. ao tocar, e também a cada 60 s como garantia (o Realtime pode perder um
     toque ao reconectar), chama `whatsapp-openwa-worker` › `pegar`;
  3. envia cada mensagem pelo OpenWA local com `Idempotency-Key = comando_id`;
  4. informa o resultado em `reportar`;
  5. a cada 60 s manda um "estou vivo" com o estado da sessão (`/api/health/ready`
     e `GET /api/sessions/{id}`).
- A chave do OpenWA **nunca sai da máquina**. O worker guarda só o seu próprio
  segredo (`WA_WORKER_SECRET`), que só abre a function do worker.
- Pareamento (QR) e desconectar: pelo **painel local do OpenWA**, nesta
  máquina, pelo superadmin.
- Backup diário do volume (SQLite + credenciais) para uma pasta fora do WSL,
  com retenção curta. Restaurar = parear de novo é aceitável (o histórico vive
  no Supabase).

### 2. Banco (migration nova, só adiciona — nada é alterado ou apagado)

**`wa_conexoes`** — o número da **plataforma** (uma linha hoje; a tabela
admite mais de uma para o futuro, sem `organization_id`).
`id`, `nome`, `sessao_remota` (nome da sessão no OpenWA), `estado`
(normalizado: `maquina_fora | desconectado | aguardando_qr | conectado |
erro`), `estado_bruto`, `numero_exibicao`, `ultimo_erro`, `visto_em` (último
"estou vivo" do worker; sem sinal há 3 min → `maquina_fora`), datas.
- Segredos fora da tabela: `WA_WORKER_SECRET` e o segredo do webhook do
  OpenWA como secrets das Edge Functions (o mesmo padrão do `CRON_SECRET`).
- Quem administra o número: **superadmin**, pelo painel local do OpenWA.
- RLS: SELECT para `authenticated` só de colunas não sensíveis via RPC
  `wa_situacao()` (estado, número exibido). **Nenhuma** policy de escrita —
  grava só a Edge Function (service_role).

**`wa_uso_por_org`** — quais organizações usam o número e como:
`organization_id` (PK), `conexao_id`, `envio_automatico_pedido` (bool, default
true), `atualizado_por`, datas. Uma linha por organização que usa o WhatsApp
da plataforma. Escrita: owner/admin da própria organização (liga/desliga o
envio automático dela). RLS por conjunto.

**`wa_mensagens`** — fila de saída **e** histórico de entrada, por organização.
`id`, `organization_id`, `direcao` (`saida|entrada`), `telefone` (normalizado),
`chat_id_remoto`, `texto`, `midia` (jsonb: tipo, nome, caminho no Storage),
`status` (`pendente | enviando | aceita | entregue | lida | falhou | incerta |
cancelada` para saída; `recebida` para entrada), `provider_message_id`,
`comando_id` (único por org — chave de idempotência), `tentativas`,
`proxima_tentativa_em`, `trava_ate` (lease), `erro`, `entidade_tipo`
(`purchase_order` por ora), `entidade_id`, `criado_por`, `criado_em`,
`atualizado_em`.
- Únicos: (`organization_id`, `comando_id`); (`organization_id`,
  `chat_id_remoto`, `provider_message_id`) quando houver ID.
- Status só **avança** (aceita → entregue → lida); evento atrasado não regride.
- RLS: SELECT por membro da org (por conjunto). Escrita só por service_role.

**`wa_eventos_recebidos`** — deduplicação do webhook: (`organization_id`,
`chave_evento`) único, `tipo`, `recebido_em`. Expurgo após 30 dias (job de
limpeza existente ou novo).

**`order_chats.canal`** — coluna nova `text NOT NULL DEFAULT 'app'`
(`app|whatsapp`), para a bolha mostrar de onde veio. Só adiciona; leitores
antigos ignoram.

**`claim` atômico** — função `wa_pegar_pendentes(p_limite)` (SECURITY DEFINER,
só service_role) com `FOR UPDATE SKIP LOCKED`, que marca `enviando` + `trava_ate`.

**Campainha** — gatilho `wa_tocar_campainha` em `wa_mensagens` (INSERT de
saída `pendente`) que faz `realtime.send` num tópico fixo com payload vazio
`{}`. Não leva id, texto nem telefone: quem ouvir só fica sabendo que "entrou
algo", e um toque falso só causa uma busca a mais. (Conferir na implementação
se o tópico pode ser público ou precisa de canal privado com policy em
`realtime.messages`.)

### 3. Edge Functions

**`whatsapp-openwa`** (`verify_jwt = true` + gate no código), ações:
- `enviar_pedido` (membro da org **do pedido** + permissão `canUseWhatsappEmpresa`,
  conferida no banco): monta o texto **no servidor** a partir do pedido gravado
  (empresa, fornecedor, número, obra, nº de itens, total, entrega, link
  público), grava em `wa_mensagens` com `comando_id` e `notification_log`
  `pending`. A campainha acorda o worker; a resposta da tela é "na fila" na
  hora. O navegador não escolhe destinatário nem texto.
- `responder_no_pedido` (membro + permissão): texto livre do comprador, para o
  telefone do fornecedor **daquele** pedido; grava em `order_chats`
  (`canal='whatsapp'`) e na fila.

**`whatsapp-openwa-worker`** (`verify_jwt = false` + gate por
`WA_WORKER_SECRET` em tempo constante, como `chamadaDeCron`), ações:
- `pegar` — devolve até N pendentes vencidas (via `wa_pegar_pendentes`) com o
  necessário para enviar: telefone, texto, `comando_id`.
- `reportar` — recebe o resultado de cada uma: `aceita` + `provider_message_id`,
  `falhou` (motivo), ou `incerta`; atualiza `wa_mensagens` e `notification_log`.
  - Retentativa só para falha **comprovadamente anterior ao envio** (sessão
    fora, recusa), com espera crescente e limite.
  - **Timeout ou `503` em envio → `incerta`, sem reenvio automático** (a
    documentação do OpenWA diz que um `503` em escrita pode ter sido aplicado).
    A tela mostra "confirmação pendente" e um botão "reenviar" consciente.
- `vivo` — "estou vivo" com o estado da sessão; atualiza `wa_conexoes`.
- Não há job de cron no Supabase: quem reenvia é o worker. Se a máquina está
  fora, nada sai — e nada se perde.

**`whatsapp-openwa-webhook`** (`verify_jwt = false` + HMAC):
- Confere `X-OpenWA-Signature: sha256=<hex>` sobre os **bytes originais**, em
  tempo constante, com o segredo da conexão. Sem assinatura → 401. A conexão é
  resolvida pela sessão do corpo, contra `wa_conexoes` — nunca por
  `organization_id` vindo de fora.
- Dedup em `wa_eventos_recebidos` por `idempotencyKey`. 2xx só depois de gravar.
- `message.ack` / `message.sent` / `message.failed` → avança o status da saída
  correspondente (por `provider_message_id`).
- `message.received` → grava entrada e **vincula ao pedido**. Como o número é
  compartilhado por todas as organizações, a organização da resposta é
  descoberta pelo pedido, nunca adivinhada:
  1. o fornecedor **respondeu citando** uma mensagem nossa → o pedido (e a
     organização) dessa mensagem;
  2. senão, se **só uma organização** enviou pedido pelo WhatsApp para aquele
     telefone nos últimos 60 dias → o pedido mais recente dela;
  3. senão (nenhuma ou mais de uma) → fica **sem organização**, visível só ao
     superadmin em "Mensagens sem pedido", que a atribui a um pedido. Nunca é
     mostrada a uma organização "por palpite" — isso vazaria a mensagem de uma
     empresa para outra. (Hoje nenhum telefone de fornecedor aparece em pedidos
     de mais de uma organização.)

  Vinculou → insere em `order_chats` (`sender_role='supplier'`,
  `canal='whatsapp'`, nome do fornecedor) e cria aviso no sino (slug
  `whatsapp_resposta_pedido`, `organization_id` do pedido) para quem enviou o
  pedido.
- Mídia recebida → baixa pelo endpoint de mídia do OpenWA para bucket privado
  `whatsapp-midia/<org>/…`, valida tamanho e tipo; no chat entra uma linha
  "Fornecedor enviou um arquivo" com link assinado gerado na hora de abrir.
- `session.status` → atualiza `wa_conexoes.estado` e, se cair para
  desconectado, avisa os superadmins.
- `wa_mensagens.organization_id` passa a aceitar `NULL` **só** para entrada
  sem vínculo; RLS por organização continua — linha sem organização só o
  superadmin vê (pela RPC de triagem).

### 4. Tela

- **Configurações › WhatsApp & Integrações**: bloco novo **"WhatsApp do
  ÒPURA (OpenWA)"** acima do da API oficial.
  - Todos veem: situação da conexão e número.
  - Owner/admin da organização: chave "Usar o WhatsApp do ÒPURA nesta
    organização" e "Enviar o pedido automaticamente ao marcar Enviado".
  - Superadmin: a lista "Mensagens sem pedido" com "atribuir a um pedido", e
    a orientação "conectar/desconectar o número: painel do OpenWA na máquina".
  - Situações exibidas: conectado · número desconectado (ler o QR) · **máquina
    fora** (sem sinal do worker há 3 min; os envios esperam na fila).
  - Botões que a pessoa não pode usar ficam desligados com o motivo.
- **Pedido** (`SupplyChainOrderDetails`):
  - Botão de WhatsApp: **OpenWA se a org do pedido está conectada E o usuário
    tem a permissão**; senão API oficial se ativa; senão o plano B de hoje
    (abrir o WhatsApp de quem clica). Ninguém perde o que tem hoje: sem a
    permissão, o botão continua no plano B, e a dica diz que o envio pelo
    número da empresa depende da permissão. Em org não conectada, nada muda.
  - Fornecedor sem telefone → o botão diz isso e leva ao cadastro do fornecedor.
  - Aba Comunicação: a linha de WhatsApp mostra Na fila / Enviada / Entregue /
    Lida / Falhou / Confirmação pendente, com o erro legível.
  - Chat do pedido: bolhas do fornecedor vindas do WhatsApp com selo
    "WhatsApp". Ao escrever, caixa "Enviar também pelo WhatsApp", marcada
    quando a última mensagem do fornecedor veio pelo WhatsApp.
- **Marcar Enviado**: continua nunca falhando por causa do WhatsApp. Se a org
  tem `envio_automatico_pedido`, a mensagem entra na fila e o aviso diz "na
  fila" ou "enviada".
- **Minha organização › Usuários**: permissão nova **"Usar o WhatsApp da
  empresa"** (`canUseWhatsappEmpresa`), grupo próprio "WhatsApp", desligada para
  todos (owner/admin inclusive) até alguém marcar.

### 5. Regras de envio

- Destinatário sempre o `suppliers.phone` do fornecedor **do pedido**,
  normalizado pelo helper existente.
- Como o número é de todas as organizações, **a mensagem sempre diz de qual
  empresa é o pedido** (nome da organização do pedido na primeira linha).
- "Org conectada" = a organização do pedido tem linha em `wa_uso_por_org` e a
  conexão da plataforma está `conectado`.
- Um `comando_id` por clique (gerado na tela) e por transição para Enviado
  (`pedido:<id>:enviado:<updated_at>`): clique duplo ou retentativa não duplica.
- O envio automático usa a org do pedido e não depende da permissão de quem
  marcou (é configuração da organização); o botão manual e a resposta dependem.
- Gera `share_token` novo como a API oficial faz hoje? **Não**: reusa o
  existente e só gera se vazio, para links antigos continuarem válidos.

## Decidido pelo builder (minhas escolhas, corrigíveis)

- Nomes `wa_*` (os `communication_*` do PRD colidem com tabelas do RH).
- Vínculo de resposta: pedido mais recente para o telefone em 60 dias.
- Texto da mensagem montado no servidor (formato a revisar com o usuário no
  primeiro envio real).
- Reusar `notification_log` e `order_chats` em vez de telas novas.
- Sem a permissão, o botão cai no plano B de hoje (ninguém perde o que tem);
  a trava só existe onde a org do pedido está conectada.

## Deixado ao builder

- Nomes exatos de colunas e índices, limites de retentativa, tempo do lease.
- Linguagem/estrutura do worker (Node no mesmo Compose é o esperado).
- Formato do backup e da pasta de destino.

## Pendências que dependem do usuário (da revisão de 23/11)

1. ~~O chip~~ — respondido: linha comum, ainda sem WhatsApp. Falta só dizer
   **em qual celular** o WhatsApp Business fica ativado; ele precisa ficar na
   empresa e se conectar de tempos em tempos (prazo atual não conferido).
2. ~~SPE do Garden~~ — respondido: o número serve **todas** as organizações.
3. ~~Endereço do túnel~~ — decidido: **sem túnel** (worker na máquina).

## Riscos

- **Restrição do número** pelo WhatsApp: chip avulso, aquecimento, pacing,
  volume baixo (8 pedidos com telefone em toda a história da org).
- **Máquina do desenvolvedor**: reinícios derrubam o envio por minutos; a fila
  cobre. Queda de energia sem nobreak derruba até alguém ligar, se a BIOS não
  religar sozinha.
- **WSL encerrando a distro sem sessão aberta**: precisa ser provado na
  instalação (item de verificação).
- **OpenWA é projeto de terceiro em mudança rápida**: imagem fixada por digest;
  atualização só manual e testada.

## Verificação de ponta a ponta (critério de pronto do piloto)

1. Reiniciar o Windows **sem fazer login**: em até 5 min a conexão aparece
   "conectado" na tela (o "estou vivo" do worker chegou). De fora da máquina,
   nenhuma porta do OpenWA responde.
2. Marcar um pedido real da Alpa como Enviado: o fornecedor recebe a mensagem
   do chip da Alpa; a aba Comunicação mostra Enviada e depois Entregue/Lida.
3. Com o OpenWA parado, marcar Enviado: o pedido salva; a linha fica "Na fila";
   ao religar, sai sozinha **uma** vez.
4. O fornecedor responde no WhatsApp: a mensagem aparece no chat do pedido com
   selo WhatsApp e o comprador recebe aviso no sino; a resposta do comprador
   chega ao fornecedor.
5. Webhook com assinatura errada → 401 e nada gravado; o mesmo evento 20 vezes
   → um registro só.
6. Usuário sem a permissão: botão desligado com motivo; chamada direta à
   function → 403.
7. Usuário de outra organização não vê as `wa_mensagens` nem o chat de pedido
   que não é da sua organização; nenhum segredo aparece no navegador, no bundle
   ou em log.
8. Pedido da SPE do Garden sai pelo mesmo número, com o nome da SPE na
   mensagem; a resposta do fornecedor cai no pedido da SPE, não no da Alpa.
   Resposta de um telefone com pedidos em duas organizações, sem citar
   mensagem, vai para "Mensagens sem pedido" (só superadmin).

## Plano

*(entra aqui depois da aprovação deste design)*

## Estado

- [x] Design aprovado pelo usuário — 23/11/2026 ("design aprovado")
