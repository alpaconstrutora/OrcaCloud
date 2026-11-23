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
  - **Timeout ou `503` em envio:** a documentação do OpenWA diz que um `503`
    em escrita pode ter sido aplicado, e que repetir só é seguro **com o mesmo
    `Idempotency-Key`** (que o gateway guarda por 24 h). Como todo envio leva
    `comando_id` como chave, repetimos dentro de 23 h; passou disso →
    `incerta`, sem reenvio automático. A tela mostra "confirmação pendente" e
    um botão "reenviar" consciente. *(Refinado no plano, 23/11.)*
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
- **Mídia recebida acima de 5 MB não chega ao app** (sem túnel, o app não
  consegue buscar o arquivo no OpenWA): o chat avisa "abrir no celular do
  número". Se isso incomodar, o worker pode passar a subir esses arquivos.

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

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com `- [ ]`.

**Objetivo:** o pedido de compra sai pelo número do ÒPURA (OpenWA), fica
registrado no pedido, e a resposta do fornecedor volta para o chat do pedido.

**Arquitetura:** fila `wa_mensagens` no Supabase; um worker na máquina
(WSL2 + Docker, ao lado do OpenWA em `127.0.0.1`) é acordado por uma
"campainha" do Realtime, busca, envia e informa por uma Edge Function própria;
o OpenWA manda os eventos (respostas, confirmações) para uma Edge Function
de webhook assinada por HMAC. Regras puras num módulo único testado no Vitest.

**Stack:** React/TS (Vite), Supabase (Postgres, RLS, Realtime, Edge Functions
Deno), OpenWA 0.31.0 (Baileys) em Docker, worker Node (`.mjs`, sem build).

**Spec:** este arquivo, seções "Design" e "Decisões".

### Restrições globais

- Frente `C:\D\frentes\whatsapp-openwa-pedido` (branch `feat/whatsapp-openwa-pedido`). Nunca o checkout de integração.
- Banco: nunca `db push`. Migration e prova SQL **o usuário aplica** (`db query -f` de escrita é barrado pelo auto mode). Ensaio: `bash scripts/montar-ensaio.sh` + `npx supabase db query --linked -f`.
- Edge Function: **o usuário publica** (`npx supabase functions deploy <nome>` pela PowerShell, a partir da frente). Prova obrigatória depois: chamada sem header → 401.
- REGRA #7 em toda policy/função/function (policy por conjunto `IN (SELECT minhas_orgs_membro())`, REVOKE PUBLIC/anon, `SET search_path`), com as respostas no cabeçalho da migration.
- Testes só em `__tests__/**/*.test.ts(x)` (projeto `leves`); nada novo em `TESTES_PESADOS`.
- Rótulos sem caixa alta; campos `h-9`; botão desligado sempre diz o motivo (`title`); `bash scripts/check-ui-standard.sh <arquivo.tsx>` em todo `.tsx` tocado.
- Nada de segredo (`WA_WORKER_SECRET`, `OPENWA_WEBHOOK_SECRET`, chave do OpenWA) no front, em log, em commit. `infra/openwa/.env` no `.gitignore`.
- Imagem do OpenWA fixada por **digest** (nunca `latest`).

### Foco da revisão (o que nenhuma tarefa cobre sozinha e mais pode morder)

1. **Remetente `@lid`** (sem telefone no `from`): sem `RESOLVE_LID_TO_PHONE=true`, a resposta não acha o pedido. → teste em T1 (`telefoneDoRemetente`) e env em T9.
2. **Pedido marcado Enviado duas vezes** (volta para Rascunho e reenvia): cada transição é um `comando_id` novo — é reenvio intencional, não duplicata. → teste em T1 (`comandoIdEnvioAutomatico`).
3. **Fornecedor sem telefone** (o caso comum: 8 de 18): `enviar_pedido` devolve `sem_telefone` sem gravar fila; o botão diz isso. → teste em T7 (`escolherCanalDoPedido`) e prova em T3.
4. **Toque perdido do Realtime / Realtime público desligado no projeto**: a checagem de 60 s cobre; o envio atrasa no máximo 1 min. → prova em T11 (passo 3).
5. **Evento atrasado regride status** (ack `delivered` depois de `read`): `avancarStatus` nunca volta. → teste em T1.

---

### Task 1 — Regras puras do WhatsApp/OpenWA

**Arquivos:** criar `utils/whatsappOpenwa.ts` (sem `Deno.*`, só `globalThis.crypto`; imports internos com extensão `.ts`, como `utils/pedidoItemValor.ts`, porque as Edge Functions o importam por `../../../utils/whatsappOpenwa.ts`, igual ao `whatsapp-cloud` com `whatsappPedido.ts`); teste `__tests__/openwaPolitica.test.ts`.

**Produz (assinaturas exatas):**
```ts
export type StatusSaida = 'pendente'|'enviando'|'aceita'|'entregue'|'lida'|'falhou'|'incerta'|'cancelada';
export interface DadosTextoPedido { empresa: string; fornecedor: string; numero: string; obra: string;
  quantidadeDeItens: number; total: number; dataDeEntrega: string | null; link: string }
export function montarTextoDoPedido(d: DadosTextoPedido): string;
export function chatIdDoTelefone(telefone: string | null | undefined): string;      // '' = sem telefone
export function comandoIdEnvioAutomatico(orderId: string, atualizadoEm: string): string;
export function statusDoAck(status: string): StatusSaida | null;
export function avancarStatus(atual: StatusSaida, novo: StatusSaida): StatusSaida;
export type Desfecho = 'aceita' | 'repetir' | 'falhou' | 'incerta';
export function classificarEnvio(r: { httpStatus: number | null; erro: 'recusada' | 'timeout' | null },
  idadeDoComandoMs: number): Desfecho;
export const ESPERAS_MS: readonly number[];                 // [30e3, 60e3, 120e3, 300e3, 600e3, 1800e3]
export function esperaAposFalha(tentativas: number): number | null;  // null = desistir
export function assinaturaConfere(corpo: Uint8Array, cabecalho: string | null, segredo: string): Promise<boolean>;
export function telefoneDoRemetente(data: { from?: string; senderPhone?: string | null }): string;
export function idsDeMensagemIguais(a: string, b: string): boolean;
export interface Candidato { organizationId: string; orderId: string; providerMessageId: string | null; enviadoEm: string }
export type Vinculo = { tipo: 'citacao' | 'unico'; organizationId: string; orderId: string } | { tipo: 'sem_vinculo' };
export function escolherVinculo(candidatos: Candidato[], citadoId: string | null): Vinculo;
export const JANELA_VINCULO_DIAS = 60;
```

- [ ] **Passo 1 — testes que falham** (`__tests__/openwaPolitica.test.ts`):
  - `montarTextoDoPedido` → primeira linha `*Alpa Construtora e Incorporadora* — Pedido de compra nº 42`; contém `Fornecedor: X`, `Obra: Y`, `Itens: 3 · Total: R$ 1.234,50` (usa `formatarValorBRL`), `Entrega: 20/11/2026` (e `Entrega: A definir` com `null`, via `formatarDataDeEntrega`), e termina com `Ver o pedido completo: <link>`.
  - `chatIdDoTelefone('(11) 99999-0000') === '5511999990000@c.us'`; `''`, `null`, `'sem número'` → `''` (reusa `normalizarTelefoneWhatsapp`).
  - `comandoIdEnvioAutomatico('o1','2026-11-23T10:00:00Z') === 'pedido:o1:enviado:2026-11-23T10:00:00Z'`; outro `atualizadoEm` → outro id.
  - `statusDoAck`: `sent→aceita`, `delivered→entregue`, `read→lida`, `played→lida`, `failed→falhou`, `pending→null`, `qualquer→null`.
  - `avancarStatus('lida','entregue') === 'lida'`; `('aceita','entregue') === 'entregue'`; `('incerta','aceita') === 'aceita'`; `('falhou','entregue') === 'entregue'`; `('cancelada','aceita') === 'cancelada'`.
  - `classificarEnvio`: `201→aceita`; `400/401/403/404/413/422/501→falhou`; `429`, `503`, `409`, `erro:'recusada'`, `erro:'timeout'` → `repetir` com idade 1 h e `incerta` com idade 23 h + 1 ms; `{httpStatus:null,erro:null}` → `incerta`.
  - `esperaAposFalha(0) === 30000`, `(5) === 1800000`, `(6) === null`.
  - `assinaturaConfere`: confere com `'sha256=' + createHmac('sha256',s).update(corpo).digest('hex')` (node:crypto); falso com segredo errado, cabeçalho `null`, sem prefixo `sha256=`, hex truncado, e corpo com um espaço a mais.
  - `telefoneDoRemetente({from:'5511999990000@c.us'}) === '5511999990000'`; `({from:'123@lid', senderPhone:'5511999990000'}) === '5511999990000'`; `({from:'123@lid'}) === ''`; `({from:'1203@g.us'}) === ''`.
  - `idsDeMensagemIguais('true_5511@c.us_3EB0AB','3EB0AB') === true`; ids diferentes → `false`.
  - `escolherVinculo`: citado casa com `providerMessageId` de um candidato → `citacao` daquele pedido, mesmo havendo candidatos de outra org; sem citação e todos da mesma org → `unico` com o `enviadoEm` mais recente; duas orgs sem citação → `sem_vinculo`; lista vazia → `sem_vinculo`.
- [ ] **Passo 2** — `npx vitest run __tests__/openwaPolitica.test.ts` → FALHA (módulo não existe).
- [ ] **Passo 3** — implementar `utils/whatsappOpenwa.ts`. `assinaturaConfere`: HMAC por `crypto.subtle` e comparação em tempo constante (laço com XOR sobre o mesmo tamanho; tamanho diferente → false).
- [ ] **Passo 4** — mesmo comando → PASSA.
- [ ] **Passo 5** — commit `feat(whatsapp): regras puras do envio pelo OpenWA`.

### Task 2 — Banco: fila, conexão, uso por organização, campainha

**Arquivos:** modificar `utils/rotinasAutomaticas.ts` (CATALOGO); criar `supabase/migrations/aplicar_20271123100000_whatsapp_openwa.sql` (conferir antes com `ls supabase/migrations | grep 20271123` — nenhum outro com o prefixo); prova `scripts/teste-whatsapp-openwa.sql` (modelo: `scripts/teste-tarefas-superadmin.sql`, com `-- MIGRATION`, `pg_temp.confere`, `pg_temp.como`, `ROLLBACK`, linha final `TUDO OK`).

**Produz:** tabelas `wa_conexoes`, `wa_uso_por_org`, `wa_mensagens`, `wa_eventos_recebidos` e coluna `order_chats.canal` exatamente como no Design §2; e:
```sql
public.wa_pode_usar(p_user uuid, p_org uuid) RETURNS boolean      -- DEFINER; só service_role
  -- superadmin (mesma regra de is_superadmin(), parametrizada por p_user) OU membro de p_org com
  -- permissions->>'canUseWhatsappEmpresa' = 'true'
public.wa_pegar_pendentes(p_limite int) RETURNS SETOF public.wa_mensagens  -- DEFINER; só service_role
  -- saida + pendente + proxima_tentativa_em <= now() + (trava_ate IS NULL OR trava_ate < now()),
  -- FOR UPDATE SKIP LOCKED, marca status='enviando', trava_ate=now()+interval '2 minutes'
public.wa_situacao() RETURNS TABLE(estado text, numero_exibicao text, visto_em timestamptz,
  usa_na_org boolean, envio_automatico_pedido boolean, organization_id uuid)  -- INVOKER; authenticated
public.wa_definir_uso(p_org uuid, p_usar boolean, p_envio_automatico boolean) RETURNS void
  -- DEFINER; exige owner/admin de p_org (minhas_orgs_gestor()) ou superadmin; authenticated
trigger wa_tocar_campainha AFTER INSERT ON wa_mensagens (direcao='saida' AND status='pendente')
  -- PERFORM realtime.send('{}'::jsonb, 'fila', 'wa-campainha', false)
```
- `wa_mensagens.organization_id` NULL só com `direcao='entrada'` (CHECK). Únicos: `(organization_id, comando_id)` e `(chat_id_remoto, provider_message_id) WHERE provider_message_id IS NOT NULL`.
- RLS: `wa_mensagens` e `wa_uso_por_org` SELECT por conjunto; `wa_conexoes` sem policy de leitura direta (só pela RPC). Nenhuma policy de escrita.
- `order_chats.canal text NOT NULL DEFAULT 'app' CHECK (canal IN ('app','whatsapp'))`.
- Uma linha inicial em `wa_conexoes` (`nome='ÒPURA'`, `sessao_remota='opura'`, `estado='maquina_fora'`).
- Job `pg_cron` `wa-limpar-eventos` (diário, 04:30, SQL puro: apaga `wa_eventos_recebidos` com mais de 30 dias) + entrada no `CATALOGO` de `utils/rotinasAutomaticas.ts` (grupo `tecnicas`, "Limpa o registro de eventos do WhatsApp com mais de 30 dias").

- [ ] **Passo 1 — prova que falha** (`scripts/teste-whatsapp-openwa.sql`), asserções:
  - membro da org A não vê `wa_mensagens` da org B; vê as da A.
  - linha de entrada com `organization_id NULL` invisível para membro comum.
  - `authenticated` não consegue `INSERT/UPDATE/DELETE` em nenhuma das 4 tabelas.
  - `wa_pode_usar`: membro sem a flag → false; com a flag → true; de outra org → false; `EXECUTE` negado a `authenticated`.
  - duas chamadas a `wa_pegar_pendentes(10)` seguidas: a segunda não devolve as já travadas; status vira `enviando`.
  - inserir dois `comando_id` iguais na mesma org → erro de unicidade.
  - inserir saída pendente gera 1 linha em `realtime.messages` com `topic='wa-campainha'` e `payload` sem `telefone`/`texto`.
  - `wa_definir_uso` por membro comum → erro; por owner → grava.
- [ ] **Passo 2** — montar ensaio sem a migration (`bash scripts/montar-ensaio.sh -o "$TEMP/ensaio.sql" scripts/teste-whatsapp-openwa.sql`) e **pedir ao usuário** para rodar → FALHA.
- [ ] **Passo 3** — escrever a migration (cabeçalho com as 3 perguntas da REGRA #7 respondidas; `BEGIN; … COMMIT;` com `SET LOCAL lock_timeout`).
- [ ] **Passo 4** — ensaio com a migration (`… scripts/teste-whatsapp-openwa.sql supabase/migrations/aplicar_20271123100000_whatsapp_openwa.sql`) → usuário roda → `TUDO OK`. Se `realtime.send` não existir/negar, registrar aqui e trocar a campainha por canal privado com policy em `realtime.messages` (modelo `aplicar_20271116905800_blueprint_canal_ramo_privado.sql`).
- [ ] **Passo 5** — `bash scripts/check-rls-postura.sh` sem achado novo; commit `feat(whatsapp): fila e conexão do OpenWA no banco`.
- [ ] **Passo 6** — usuário aplica a migration (`npx supabase db query --linked -f supabase/migrations/aplicar_20271123100000_whatsapp_openwa.sql`); conferir com `SELECT policyname FROM pg_policies WHERE tablename LIKE 'wa_%'`.

### Task 3 — Edge Function `whatsapp-openwa` (tela → fila)

**Arquivos:** criar `supabase/functions/whatsapp-openwa/index.ts`; `supabase/config.toml` (`[functions.whatsapp-openwa] verify_jwt = true`, com comentário); criar `services/whatsappOpenwaService.ts`; teste `__tests__/whatsappOpenwaService.test.ts`.

**Consome:** T1 (`utils/whatsappOpenwa.ts`: `montarTextoDoPedido`, `chatIdDoTelefone`, `comandoIdEnvioAutomatico`), T2 (`wa_pode_usar`, tabelas), `_shared/auth.ts` (`exigirMembro`, `exigirSuperadmin`, `respostaDeErro`).

**Produz (ações, corpo `{ acao, ... }`):**
- `enviar_pedido { order_id, comando_id?, automatico? }` → `200 { status: 'na_fila', mensagem_id }` · `422 { codigo: 'sem_telefone' }` · `409 { codigo: 'nao_usa' }` (org sem `wa_uso_por_org`) · `403 { codigo: 'sem_permissao' }` (manual sem `wa_pode_usar`). Org = a do pedido (com o fallback `companies.org_id` igual ao `whatsapp-cloud`). `automatico=true` usa `comandoIdEnvioAutomatico(order.id, order.updated_at)`, exige `wa_uso_por_org.envio_automatico_pedido` e **não** exige a permissão do usuário (é da organização). Reusa `share_token` (gera só se nulo). Grava `wa_mensagens` (`entidade_tipo='purchase_order'`) e `notification_log` (`channel='whatsapp'`, `status='pending'`, `metadata.wa_mensagem_id`). Conflito de `comando_id` → devolve a linha existente (idempotente).
- `responder_no_pedido { order_id, texto, comando_id }` → exige `wa_pode_usar`; texto 1–4096; grava `order_chats` (`sender_role='buyer'`, `canal='whatsapp'`) e `wa_mensagens`.
- `atribuir { mensagem_id, order_id }` → só superadmin; entrada sem organização passa a ter a org do pedido e vira linha em `order_chats`.
- Front: `whatsappOpenwaService.{ situacao(): Promise<SituacaoOpenwa[]>, enviarPedido(orderId, opcoes?: { automatico?: boolean }): Promise<{ status: 'na_fila' }>, responderNoPedido(orderId, texto): Promise<void>, definirUso(orgId, usar, envioAutomatico): Promise<void>, listarSemPedido(): Promise<…>, atribuir(mensagemId, orderId): Promise<void> }` — `comando_id` gerado com `crypto.randomUUID()` no clique; erro da function vira `Error(mensagem)` como em `whatsappService.invocar`.

- [ ] **Passo 1** — teste do service (mock de `supabase.functions.invoke`): `enviarPedido` manda `{acao:'enviar_pedido', order_id, comando_id: <uuid>}`; dois cliques → dois `comando_id` diferentes; corpo `{error:'Fornecedor sem telefone…'}` vira `Error` com essa mensagem.
- [ ] **Passo 2** — roda → FALHA. **Passo 3** — implementar service e function. **Passo 4** — roda → PASSA; `npx tsc --noEmit -p .` (ler exit por grep).
- [ ] **Passo 5** — commit; usuário publica a function; provas: sem header → 401; usuário sem permissão (manual) → 403; pedido de fornecedor sem telefone → 422 e **nenhuma** linha nova em `wa_mensagens`.

### Task 4 — Edge Function `whatsapp-openwa-worker` (máquina ↔ fila)

**Arquivos:** criar `supabase/functions/whatsapp-openwa-worker/index.ts`; `config.toml` (`verify_jwt = false` + comentário "gate = WA_WORKER_SECRET"); secret `WA_WORKER_SECRET` (≥ 32 caracteres, o usuário grava com `supabase secrets set`).

**Consome:** T1 (`classificarEnvio`, `esperaAposFalha`, `statusDoAck`, `avancarStatus`), T2 (`wa_pegar_pendentes`).

**Produz:** `Authorization: Bearer <WA_WORKER_SECRET>` (comparação em tempo constante, segredo < 32 → 503 fail-closed). Ações:
- `pegar { limite }` → `{ itens: [{ id, chat_id, texto, comando_id }] }`.
- `reportar { resultados: [{ id, httpStatus: number|null, erro: 'recusada'|'timeout'|null, messageId: string|null }] }` → aplica `classificarEnvio(r, now - criado_em)`: `aceita` grava `provider_message_id` + `notification_log.status='sent'`; `repetir` volta a `pendente` com `proxima_tentativa_em = now + esperaAposFalha(tentativas)` (ou `incerta` se `null`); `falhou` → `notification_log.status='failed'` + erro legível; `incerta` → `metadata.confirmacao='pendente'`.
- `vivo { estado_bruto, numero }` → `wa_conexoes.visto_em = now()`, `estado` normalizado (`ready→conectado`, `qr_ready|authenticating→aguardando_qr`, `disconnected|action_required→desconectado`, `failed→erro`).

- [ ] **Passo 1** — commit; usuário publica e grava o secret. Provas (curl): sem header → 401; header errado → 401; `pegar` com fila vazia → `{itens:[]}`; com 1 pendente → item volta e a linha fica `enviando`; `reportar` com `httpStatus:503` e linha de 1 h → volta `pendente` com `proxima_tentativa_em` ≈ +30 s.

### Task 5 — Edge Function `whatsapp-openwa-webhook` (OpenWA → app)

**Arquivos:** criar `supabase/functions/whatsapp-openwa-webhook/index.ts`; `config.toml` (`verify_jwt = false` + "gate = HMAC"); secret `OPENWA_WEBHOOK_SECRET`.

**Consome:** T1 (`assinaturaConfere`, `statusDoAck`, `avancarStatus`, `telefoneDoRemetente`, `escolherVinculo`, `JANELA_VINCULO_DIAS`, `idsDeMensagemIguais`), T2.

**Produz:**
- Lê `await req.arrayBuffer()` **antes** de qualquer parse; `assinaturaConfere` falsa → 401 sem gravar. Corpo > 8 MiB → 413 (mídia inline vai até 5 MiB, ~6,7 MiB em base64). `sessionId` ≠ `wa_conexoes.sessao_remota` → 403.
- Dedup: `INSERT … ON CONFLICT DO NOTHING` em `wa_eventos_recebidos(chave_evento = idempotencyKey)`; repetido → 200 sem efeito.
- `message.ack` / `message.failed`: casa `data.messageId` com `provider_message_id` (`idsDeMensagemIguais`), aplica `avancarStatus(atual, statusDoAck(data.status))`, espelha em `notification_log.metadata.entrega`.
- `message.received` (ignorar `isGroup`): grava entrada; candidatos = saídas `aceita|entregue|lida` com `entidade_tipo='purchase_order'` para o mesmo telefone nos últimos `JANELA_VINCULO_DIAS`; `escolherVinculo(candidatos, data.quotedMessage?.id ?? null)`. Com vínculo → `order_chats` (`sender_role='supplier'`, `canal='whatsapp'`, `sender_name` = nome do fornecedor, `sender_email=''`) + `notifications` (`type='whatsapp_resposta_pedido'`, `organization_id`, `link='/supplies-orders?pedido=<id>'`, destinatário = e-mail de `criado_por` da saída). Sem vínculo → fica sem organização.
- Mídia: se `data.media` inline → grava em bucket privado `whatsapp-midia/<org|sem-org>/<id>` (tipo e tamanho conferidos; link assinado só na hora de abrir); se `omitted` → o `GET …/media` **não** é possível (o OpenWA não é alcançável de fora) → linha no chat "Fornecedor enviou um arquivo (<mimetype>) maior que 5 MB; abrir no celular do número". *(Consequência do "sem túnel"; ver Riscos.)*
- `session.status` / `session.disconnected` → `wa_conexoes.estado`; virou `desconectado` → aviso no sino para superadmins.
- 2xx só depois de gravar; erro de banco → 500 (o OpenWA repete).

- [ ] **Passo 1** — commit; usuário publica e grava o secret. Provas (curl com corpo assinado por `node -e`): assinatura errada → 401 e nada gravado; o mesmo evento 20× → 1 linha em `wa_eventos_recebidos` e 1 em `order_chats`; ack `delivered` depois de `read` → continua `lida`.

### Task 6 — Permissão "Usar o WhatsApp da empresa"

**Arquivos:** `types/users.ts` (`canUseWhatsappEmpresa?: boolean`); `components/OrganizationUsers.tsx` (`baseViewer` com `false`; **depois** do `reduce` de owner/admin, `canUseWhatsappEmpresa: false` explícito; `DETAILED_PERMISSIONS` com `{ group: 'WhatsApp', title: 'Usar o WhatsApp da empresa', view: 'canUseWhatsappEmpresa' }`); criar `utils/permissaoWhatsappEmpresa.ts`; teste `__tests__/permissaoWhatsappEmpresa.test.ts`.

**Produz:** `podeUsarWhatsappEmpresa(args: { permissoes: Record<string, unknown> | null | undefined; acessoTotal: boolean }): boolean`; `MOTIVO_SEM_WHATSAPP_EMPRESA = 'O envio pelo número do ÒPURA depende da permissão "Usar o WhatsApp da empresa" (Minha organização › Usuários).'`.

- [ ] **Passo 1** — testes: `getDefaultPermissions('owner'|'admin'|'member'|'viewer').canUseWhatsappEmpresa === false`; `podeUsarWhatsappEmpresa` true só com a flag `true` ou `acessoTotal`; `DETAILED_PERMISSIONS` tem a entrada no grupo `'WhatsApp'` (não em `'Geral'`).
- [ ] **Passo 2** FALHA · **Passo 3** implementar · **Passo 4** PASSA · `check-ui-standard.sh components/OrganizationUsers.tsx` · **Passo 5** commit.

### Task 7 — Pedido: botão, envio automático, situação e chat

**Arquivos:** criar `utils/canalWhatsappDoPedido.ts` + teste `__tests__/canalWhatsappDoPedido.test.ts`; modificar `components/SupplyChainOrderDetails.tsx` (`handleWhatsAppShare` ~944, card "Histórico de Notificações" ~2318), `services/orderService.ts:475-489`, `components/OrderChat.tsx`, `services/chatService.ts` (`canal` em `mapChatRow`/`CHAT_COLUMNS`), `components/notifications/notificationTypes.ts` (`whatsapp_resposta_pedido: { category: 'suprimentos', label: 'Resposta do fornecedor pelo WhatsApp' }`).

**Produz:**
```ts
export type CanalDoPedido = { tipo: 'openwa' } | { tipo: 'api_oficial' } | { tipo: 'whatsapp_pessoal'; dica?: string }
  | { tipo: 'sem_telefone' };
export function escolherCanalDoPedido(a: { orgUsaOpenwa: boolean; conexaoConectadaOuFora: boolean;
  podeUsar: boolean; apiOficialAtiva: boolean; fornecedorTemTelefone: boolean }): CanalDoPedido;
export function rotuloDaEntrega(status: StatusSaida, confirmacaoPendente: boolean): string;
  // pendente|enviando→'Na fila', aceita→'Enviada', entregue→'Entregue', lida→'Lida',
  // falhou→'Falhou', incerta ou confirmacaoPendente→'Confirmação pendente'
```
- `escolherCanalDoPedido`: org usa OpenWA + pode usar → `openwa` (mesmo com a máquina fora: entra na fila) se tem telefone, senão `sem_telefone`; org usa OpenWA + não pode → `whatsapp_pessoal` com `dica = MOTIVO_SEM_WHATSAPP_EMPRESA`; org não usa → `api_oficial` se ativa, senão `whatsapp_pessoal` sem dica (o de hoje, intacto).
- `orderService` ao virar `Enviado`: primeiro `wa_situacao` da org; se usa OpenWA com envio automático → `whatsappOpenwaService.enviarPedido(id, { automatico: true })`; senão o caminho da API oficial de hoje. Continua em `try/catch` que nunca derruba o pedido; o aviso ao usuário diz "na fila" ou o motivo.
- `OrderChat`: bolha com `canal==='whatsapp'` ganha selo "WhatsApp"; caixa "Enviar também pelo WhatsApp" só quando o canal é `openwa`, marcada se a última mensagem do fornecedor tem `canal==='whatsapp'`; marcada → `whatsappOpenwaService.responderNoPedido` (que já grava em `order_chats`), desmarcada → `chatService.sendMessage` de hoje.

- [ ] **Passo 1** — testes de `escolherCanalDoPedido` (as 6 combinações acima) e `rotuloDaEntrega` (os 7 status + `confirmacaoPendente`).
- [ ] **Passo 2** FALHA · **Passo 3** implementar util e ligar nas telas · **Passo 4** PASSA · `tsc` · `check-ui-standard.sh` nos 2 `.tsx` · **Passo 5** commit.

### Task 8 — Configurações › WhatsApp & Integrações: bloco do ÒPURA

**Arquivos:** criar `components/settings/WhatsappOpenwaSettings.tsx`; montar em `components/Settings.tsx` (aba `whatsapp`, **acima** de `<WhatsappCloudSettings />`); teste `__tests__/components/WhatsappOpenwaSettings.test.tsx` (modelo: `__tests__/components/WhatsappCloudSettings.test.tsx`).

**Consome:** `whatsappOpenwaService` (T3), `useOrgContext` (REGRA #5), `temAcessoTotal`.

**Produz (tela):** situação (`Conectado · <número>` / `Número desconectado — ler o QR no painel do OpenWA na máquina` / `Máquina fora — os envios esperam na fila`, por `visto_em` > 3 min); para owner/admin da org ativa: "Usar o WhatsApp do ÒPURA nesta organização" e "Enviar o pedido automaticamente ao marcar Enviado" (`definirUso`); para superadmin: tabela "Mensagens sem pedido" (StandardTable) com ação "Atribuir a um pedido". Em "Todas as organizações": só a situação, com o motivo nos controles desligados.

- [ ] **Passo 1** — testes: membro comum vê situação e controles desligados com `title`; owner liga o uso → `definirUso(org, true, true)`; superadmin vê "Mensagens sem pedido"; `visto_em` de 5 min atrás → texto "Máquina fora".
- [ ] **Passo 2** FALHA · **Passo 3** implementar · **Passo 4** PASSA · `check-ui-standard.sh` · `bash scripts/check-org-selector-guard.sh` · **Passo 5** commit.

### Task 9 — Worker e Compose (`infra/openwa/`)

**Arquivos:** criar `infra/openwa/docker-compose.yml`, `infra/openwa/.env.example`, `infra/openwa/worker/{package.json,worker.mjs,nucleo.mjs,Dockerfile}`, `infra/openwa/LEIA-ME.md`; `.gitignore` (`infra/openwa/.env`, `infra/openwa/dados/`); teste `__tests__/openwaWorkerNucleo.test.ts`.

**Produz:**
- Compose: `openwa` (imagem `ghcr.io/rmyndharis/openwa@sha256:<digest>` — digest anotado no LEIA-ME), `ports: ["127.0.0.1:2785:2785"]`; env `ENGINE_TYPE=baileys`, `DATABASE_TYPE=sqlite`, `RESOLVE_LID_TO_PHONE=true`, `SEND_PACING_ENABLED=true`, `WEBHOOK_MEDIA_INLINE_MAX_BYTES=5242880`, `QUEUE_ENABLED=true` + `REDIS_ENABLED=true` (serviço `redis:7-alpine` sem porta publicada — a retentativa de webhook do OpenWA só existe com a fila); volume `./dados`. `worker` (`node:22-alpine`, depende de `openwa`). Nomes de variáveis **conferidos no `.env.example` do commit fixado** antes de usar.
- `nucleo.mjs`: `export function requisicaoDeEnvio(item, sessao, chaveApi)` → `{ url: 'http://openwa:2785/api/sessions/<sessao>/messages/send-text', headers: { 'X-API-Key', 'Idempotency-Key': item.comando_id, 'Content-Type' }, corpo: { chatId: item.chat_id, text: item.texto, linkPreview: false } }`; `export function resultadoDoEnvio({ status, corpo, erro })` → `{ httpStatus, erro: 'recusada'|'timeout'|null, messageId }` (`ECONNREFUSED`→`recusada`, abort→`timeout`, `201`→`messageId = corpo.messageId`).
- `worker.mjs`: `@supabase/supabase-js` assina `wa-campainha` evento `fila` (anon key); ao tocar e a cada 60 s → `pegar` → envia (timeout 30 s) → `reportar`; a cada 60 s → `vivo`. Log sem texto nem telefone.
- Registro do webhook no OpenWA (feito uma vez no LEIA-ME): `POST /api/sessions/opura/webhooks` com `url=https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/whatsapp-openwa-webhook`, `events=["message.received","message.ack","message.failed","session.status","session.disconnected"]`, `secret=$OPENWA_WEBHOOK_SECRET`.

- [ ] **Passo 1** — testes de `nucleo.mjs`: `Idempotency-Key` = `comando_id`; `linkPreview:false`; `ECONNREFUSED`→`recusada`; `AbortError`→`timeout`; `201 {messageId:'x'}` → `{httpStatus:201, messageId:'x', erro:null}`.
- [ ] **Passo 2** FALHA · **Passo 3** implementar · **Passo 4** PASSA · `docker compose -f infra/openwa/docker-compose.yml config` sem erro · **Passo 5** commit.

### Task 10 — Instalação na máquina (com o usuário)

- [ ] **Passo 1** — `wsl --install -d Ubuntu-24.04 --name openwa` (ou import), `systemd=true` em `/etc/wsl.conf`, Docker Engine oficial dentro da distro. Prova: `wsl -d openwa -- docker info` responde com o Docker Desktop **fechado**.
- [ ] **Passo 2** — tarefa agendada "ao iniciar o sistema", "executar estando o usuário conectado ou não": `wsl.exe -d openwa --exec /bin/sh -c "sleep infinity"` (mantém a distro viva) — prova: reiniciar **sem login** e, de outra máquina/celular, ver `visto_em` atualizando na tela de Configurações.
- [ ] **Passo 3** — copiar `infra/openwa` para a distro, criar `.env` (chave do OpenWA gerada na máquina, `WA_WORKER_SECRET`, `OPENWA_WEBHOOK_SECRET`, URL e anon key do Supabase), `docker compose up -d`; criar a sessão e gravar o **UUID** dela em `wa_conexoes.sessao_remota` (o OpenWA identifica a sessão por id, não por nome — Ruling 17; ver `infra/openwa/LEIA-ME.md` passo 8). Prova: `curl -s 127.0.0.1:2785/api/health/ready`; de fora da máquina, a porta 2785 **não** responde.
- [ ] **Passo 4** — o usuário ativa o WhatsApp Business no chip (no celular que ficará na empresa), aquece alguns dias, e lê o QR no painel local. Prova: situação "Conectado · <número>" na tela.
- [ ] **Passo 5** — usuário confere na BIOS "Restore AC Power Loss = Power On". Backup diário do `./dados` agendado (destino e retenção anotados no LEIA-ME).

### Task 11 — Verificação de ponta a ponta e publicação

- [ ] **Passo 1** — `npx vitest run --project leves` (contar falhas por grep, não por tail); `npx tsc --noEmit`; `bash scripts/check-ui-standard.sh` nos `.tsx`; `bash scripts/check-org-selector-guard.sh`; `bash scripts/verificar-views-anon.sh`.
- [ ] **Passo 2** — **PORTÃO:** antes do push/merge, conferir no banco que as migrations `aplicar_20271123100000` e `aplicar_20271123110000` estão aplicadas (`SELECT 1 FROM information_schema.columns WHERE table_name='order_chats' AND column_name='canal'` e `SELECT to_regprocedure('public.wa_situacao()')`) — o front novo lê `order_chats.canal` e quebra o chat de todas as orgs sem ela (Ruling 16). Depois: PR (rascunho) → CI verde (ler a lista do `pesados-quais`) → merge pelo fluxo do projeto (eu faço o merge) → `bash scripts/conferir-producao.sh`.
- [ ] **Passo 3** — roteiro "Verificação de ponta a ponta" (itens 1–8 acima) em produção, com 1 pedido real da Alpa e 1 da SPE do Garden, fornecedor de teste com o celular do usuário. Cada item com evidência (print ou SELECT) anotada em "Estado".

## Estado

- [x] Design aprovado pelo usuário — 23/11/2026 ("design aprovado")
