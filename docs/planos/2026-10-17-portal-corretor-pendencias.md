# Portal do Corretor — os 3 pendentes (permissões, status entre abas, abas de demonstração com dado real)

## Pedido original

Sessão `1d43a73e-ebe3-4903-a8ba-0d2a6314d508` · 17/10/2026, depois de publicar a versão mobile
(`docs/planos/2026-10-16-portal-corretor-mobile.md`), que terminou listando três pendentes:

> corrigir os  3 itens

Os três itens, como estavam no fim daquela entrega:

1. `fn_broker_portal_get_units` e `fn_broker_portal_get_commissions` com EXECUTE para PUBLIC (REGRA #7).
2. Em Empreendimentos, unidade com proposta APROVADA aparece "Disponível"; o Estoque a pinta vendida.
3. Leads, Chat, Ranking, Agenda e Treinamento escondidos do corretor por serem demonstração — "voltam
   quando tiverem dados reais".

## O que o levantamento mostrou (17/10/2026, banco remoto, só leitura)

- Item 1 tem um terceiro caso: `broker_portal_get_data` (a função que abre o portal) também tem PUBLIC.
- REGRA #7, pergunta 1, em `broker_portal_leads`: a política de INSERT aceita
  `… OR broker_email = (auth.jwt() ->> 'email')` — essa perna sozinha deixa qualquer conta autenticada
  do SaaS gravar lead em qualquer organização. A de SELECT/UPDATE tem a mesma perna.
- Item 3: as tabelas JÁ EXISTEM e estão VAZIAS, e nenhum código as usa —
  `broker_portal_leads` (+ `_lead_interactions`), `broker_portal_chat_channels` (+ `_chat_messages`),
  `broker_portal_events` (+ `_event_registrations`), `broker_portal_rankings`,
  `broker_portal_trainings` (+ `_training_progress`). Cada aba precisa de leitura/escrita pelo token do
  link (portal lê SEMPRE por RPC) e, quando o conteúdo é do gestor (eventos, canais), de uma tela do gestor.

## Decisões tomadas com o usuário (17/10/2026)

| # | Pergunta | Decisão |
|---|---|---|
| P1 | Treinamento | **Reusar a Academia** (Portal de Treinamentos): o corretor vira aluno externo, como o terceiro; a aba mostra os cursos atribuídos a ele e leva à sala de aula. `broker_portal_trainings` não é usada. |
| P2 | Chat | **Canal por empreendimento**: incorporadora + corretores habilitados naquele empreendimento; o gestor lê e responde numa tela nova (Comercial › Corretores), com mensagens fixadas. |
| P3 | Ranking | **Só a própria posição** para o corretor ("3º de 12", vendas, volume, e as vendas do 1º como meta, sem nomes); o gestor vê o ranking completo. |
| P4 | Leads e Agenda | **Os dois**: leads são do corretor (funil próprio; o gestor vê todos, só leitura); a Agenda mostra eventos que o gestor cria, com inscrição do corretor. |

## Plano

Cada fase sai do esconderijo (`ABAS_DE_DEMONSTRACAO`) só quando a aba lê e grava dado real, e cada
gerador `generateDemo*` correspondente é apagado na mesma fase.

### F1 — permissões e status entre abas (itens 1 e 2)

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1.1 | `supabase/migrations/aplicar_20271017000300_broker_portal_revoke_e_leads.sql` | `REVOKE … FROM PUBLIC` em `fn_broker_portal_get_units`, `fn_broker_portal_get_commissions`, `broker_portal_get_data` (EXECUTE fica só com anon + authenticated); políticas de `broker_portal_leads` sem a perna `broker_email = jwt` (corretor grava pelas RPCs do token) | `proacl` sem `=X`; `pg_policies` sem a perna; link do corretor abre no navegador |
| 1.2 | `utils/statusEfetivoDaUnidade.ts` (novo) + `PropertyUnitMap` + `BrokerDevelopments` | o "status que o espelho pinta" (negócio ativo sobrepõe o cadastro) vira função pura usada pelos dois; Empreendimentos recebe os negócios e mostra o mesmo status (aprovada = Vendido, enviada = Reservado), com as mesmas travas | teste puro; jsdom: unidade com proposta aprovada aparece "Vendido" nas duas abas e não aceita proposta |

### F2 — Ranking (P3)

| # | O que muda | Como sei que terminou |
|---|---|---|
| 2.1 | RPC `fn_broker_portal_get_ranking(token, periodo)`: posição do corretor entre os corretores da organização do token por propostas APROVADAS no período (mês/trimestre/ano), total de corretores, vendas, volume, propostas enviadas, vendas do 1º (sem nome) | consulta no banco com o token do zoio; corretor sem venda aparece "sem posição" |
| 2.2 | RPC `fn_broker_ranking_da_organizacao(org, periodo)` (authenticated, membro da org) → lista completa para o gestor | consulta como membro / recusa como não membro |
| 2.3 | `BrokerRanking` reescrito: corretor vê só o dele; na visão interna do gestor, a lista completa; `compacto` | jsdom + navegador |

### F3 — Leads (P4)

| # | O que muda | Como sei que terminou |
|---|---|---|
| 3.1 | RPCs do token: listar os meus leads (+ interações), salvar lead, mudar estágio, registrar interação — tudo preso ao e-mail do corretor do token e à organização dele | consultas com o token; lead de outro corretor não aparece nem é editável |
| 3.2 | `BrokerLeadManager` lê e grava pelo serviço; gestor vê os leads da organização só leitura; funil em lista no celular | jsdom + navegador (criar, mover, registrar interação) |

### F4 — Agenda (P4)

| # | O que muda | Como sei que terminou |
|---|---|---|
| 4.1 | Tela do gestor para criar/editar/cancelar eventos (Comercial › Corretores) | navegador |
| 4.2 | RPCs do token: listar eventos da organização com a minha inscrição e vagas; inscrever; cancelar inscrição (respeita lotação) | consultas; lotado recusa |
| 4.3 | `BrokerEvents` lê e grava pelo serviço; `compacto` | jsdom + navegador |

### F5 — Chat por empreendimento (P2)

| # | O que muda | Como sei que terminou |
|---|---|---|
| 5.1 | Canal por empreendimento (o prédio do comercial que dá habilitação ao corretor); RPCs do token: meus canais (só dos empreendimentos habilitados), mensagens, enviar | corretor sem habilitação no prédio não vê o canal |
| 5.2 | Tela do gestor: canais, mensagens, responder, fixar | navegador |
| 5.3 | `BrokerChat` lê e grava pelo serviço; atualização periódica | jsdom + navegador |

### F6 — Treinamento pela Academia (P1)

| # | O que muda | Como sei que terminou |
|---|---|---|
| 6.1 | Gestor libera o corretor como aluno externo da Academia (mesmo caminho do terceiro) | navegador |
| 6.2 | Aba Treinamento do corretor: cursos atribuídos (pela RPC do token) e o botão para a sala de aula no Portal de Treinamentos | jsdom + navegador |

## Estado

- [x] **Publicado (17/10/2026)** em dois passos, cada um com PR de rascunho (#25), CI verde no PR e de novo
  no commit da `main`, e `conferir-producao.sh` provando de fora:
  - F1–F4: `main` em `4667b119` (CI PR 18min26s); domínio serviu `071b77b` (outra sessão publicou por
    cima, `4667b119` contido nele) com "Ainda sem venda neste período" e "Nenhum lead ainda.".
  - F5–F6: `main` em `c1af2bf5` (CI PR 17min36s); domínio serve `c1af2bf` com "Você ainda não está
    habilitado em nenhum empreendimento." e "A incorporadora ainda não liberou treinamentos para você.".
  - Migrations `aplicar_20271017000300` a `…000800` aplicadas no banco antes do push, todas sem PUBLIC.

- [x] **F1 — 2 de 2** (17/10/2026). 1.1: migration `…000300` aplicada — proacl das 3 RPCs sem `=X`;
  políticas de `broker_portal_leads` sem a perna do e-mail; link do zoio abre (35 unidades).
  1.2: `utils/statusEfetivoDaUnidade.ts` + teste (8 casos); espelho e Empreendimentos usam a mesma
  regra; o cartão do empreendimento conta disponível pelo status efetivo; jsdom prova "Vendido" e
  "Fazer proposta" desligado para a unidade com proposta aprovada.
- [x] **F2 — 3 de 3** (17/10/2026). Migration `…000400` aplicada (`fn_broker_ranking_calc`,
  `_intervalo`, `fn_broker_portal_get_ranking`, `fn_broker_ranking_da_organizacao`). Prova no banco
  com propostas fictícias num bloco desfeito por RAISE (nada gravou): zoio 2º de 3, 2 vendas, R$ 1 mi,
  meta 3, anterior 1º; rejeitada não conta; não membro recebe 42501. `BrokerRanking` reescrito (corretor
  só a própria posição; gestor lista completa); jsdom 3 casos.
- [x] **F3 — 2 de 2** (17/10/2026). Migration `…000500` aplicada (listar/salvar/etapa/interação pelo
  token + SELECT das interações para o gestor). Prova no banco (desfeita): lead do zoio com 3 registros;
  Geleia (mesma organização) não vê e recebe 42501 ao alterar; origem fora do CHECK = 23514.
  `BrokerLeadManager` reescrito (cartões + ficha em painel + contato por WhatsApp/tel/e-mail); jsdom 4.
- [x] **F4 — 3 de 3** (17/10/2026). Migration `…000600` aplicada (eventos/inscrever/cancelar pelo token,
  lotação com FOR UPDATE, SELECT das inscrições para o gestor). Prova no banco (desfeita): vaga única —
  zoio inscreve, Geleia recebe "Evento lotado", zoio cancela e Geleia entra; evento passado recusa.
  `BrokerEvents` reescrito (corretor inscreve/cancela; gestor cria/edita/cancela e vê inscritos); jsdom 4.
- Provas F1–F4: tipos 0 erros; `check-ui-standard`/`check-xss-sinks` limpos; suítes vizinhas 230/230;
  navegador (`C:/tmp/pwtest/corretor-pendencias.js`, 390×844 e 1440, link real do zoio): Leads, Agenda
  e Ranking de volta com dado real (vazios, nada inventado), Chat e Treinamento ainda fora, sem erro.
- [x] **F5 — 3 de 3** (17/10/2026). Migration `…000700` aplicada: `building_id` no canal (tabela vazia;
  canal nasce na 1ª mensagem), RPCs do token (canais dos prédios habilitados / mensagens / enviar) e do
  gestor (canais da org / mensagens / responder como incorporadora / fixar), todas com a régua de
  habilitação de `fn_broker_portal_get_units`. Prova no banco (desfeita): zoio vê só Garden Cambuhy,
  Geleia só Galeria Altavista; mensagem do zoio entra como CORRETOR e aparece no resumo; Geleia ler ou
  escrever no Garden = 42501. `BrokerChat` reescrito (lista de canais, conversa com fixadas, envio;
  gestor fixa), atualização a cada 15 s; jsdom 3.
- [x] **F6 — 2 de 2** (17/10/2026). Migration `…000800` aplicada (`fn_broker_portal_treinamentos` pelo
  token, `fn_broker_treinamentos_do_corretor` para o gestor; mesma consulta das matrículas da Academia).
  Prova no banco (desfeita, com uma matrícula real e um acesso temporário): acesso ativo traz o curso
  (e-mail sem diferenciar maiúscula); sem acesso = vazio; bloqueado = vazio + `bloqueado`. Gestor libera
  o corretor como TERCEIRO (`academy_portal_users_create`) e envia o convite (Edge `academy-portal-invite`)
  em botões separados; corretor vê os cursos e o link da sala de aula; jsdom 4.
- `ABAS_DE_DEMONSTRACAO` ficou VAZIA: as cinco abas voltaram com dado real. A regra fica para a próxima
  aba que nascer sem banco.

## Verificação

Por fase: teste puro/jsdom, consultas das RPCs no banco com o token de um corretor real (zoio) e de
outro (Geleia) para provar o isolamento, navegador 390×844 e 1440, CI do PR de rascunho, push e
`conferir-producao.sh`.
