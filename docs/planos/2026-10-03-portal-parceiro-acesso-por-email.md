# Portal do Parceiro — acesso por e-mail e senha, com convite por e-mail

## Pedido original

Sessão de 03/10/2026 (Claude Code, frente `portal-parceiro-acesso-email`):

> portal do parceiro : alem do acesso via token implementar acesso via e-mail

Perguntas feitas ao usuário antes do plano, e as respostas:

- *"Como o parceiro deve entrar por e-mail?"* → **E-mail e senha, com convite**
  (não código de 6 dígitos nem link mágico).
- *"Ao clicar em 'Convidar Integrante' na visão do app, o parceiro deve receber
  um e-mail?"* → **Sim, enviar convite**.
- *"Onde fica a entrada por e-mail?"* → **Tela própria do portal** em
  `/portal-parceiro` (sem token).

## O que já existia

- Login por senha do parceiro pela tela genérica: cartão "Portal do Parceiro B2B"
  do `LoginGateway` → `Auth` (tema laranja) → `validateAccess` (linha ativa em
  `partner_users` pelo e-mail) → `AppRouter` monta o `PartnerPortal` logado. As
  leituras passam por `partner_can_access_workspace` (e-mail do JWT).
- **Faltava:** "Convidar Integrante" só fazia INSERT em `partner_users` — sem
  e-mail, sem conta; o parceiro tinha de descobrir o "Cadastre-se". E
  `/portal-parceiro` sem token caía no seletor genérico.

## Decisões

- O link de criar senha é gerado no servidor com `auth.admin.generateLink`, que
  NÃO manda e-mail; o e-mail sai pelo Resend (mesma infraestrutura das outras
  notificações). Motivo: o envio do Supabase Auth tem limite baixo e template
  genérico. E-mail novo → link de convite; e-mail que já tem conta → link de
  redefinir senha (o e-mail diz isso).
- O link cai em `/portal-parceiro#type=invite|recovery`, que o app já tratava
  (tela "criar senha" do `ResetPassword`); ao concluir, o grupo já é o do
  parceiro e ele entra no portal.
- E-mail do integrante sempre minúsculo (service + gatilho no banco): a
  autorização compara letra a letra com o e-mail do JWT, e um convite com
  maiúscula entraria no login sem ver dado nenhum.
- Falha no envio do e-mail não desfaz o cadastro do integrante; dá para reenviar
  pela linha.

## Itens

1. **Edge Function** `supabase/functions/partner-invite-user` — exige usuário
   logado (antes de olhar o banco) e membro da organização dona do workspace;
   gera o link, envia pelo Resend, grava `invited_at`.
   *Pronto quando:* publicada e, de fora, sem header → 401 e com a chave pública →
   401. ✅ 03/10/2026: as duas sondas deram 401.
2. **Migration** `aplicar_20271003000040_partner_users_convite_email.sql` —
   coluna `invited_at`, gatilho de e-mail minúsculo, backfill.
   *Pronto quando:* consulta de colisões limpa, ensaio com ROLLBACK correto e
   aplicada. ✅ 1 integrante na base, já minúsculo, sem colisão e sem e-mail em
   dois workspaces; ensaio gravou `teste.maiuscula@exemplo.com` a partir de
   `  Teste.Maiuscula@Exemplo.COM ` e não deixou rastro; aplicada.
3. **Visão do app** — convidar grava e envia; coluna "Convite" (data ou "Não
   enviado"); ação "Reenviar convite" (nova ação `mail` no `ActionIconButton`),
   desabilitada para inativo com o motivo no título; texto do modal.
   *Pronto quando:* `__tests__/components/PartnerWorkspaceConvite.test.tsx` e
   `__tests__/partnerServiceConvite.test.ts` passam. ✅ 4 + 4 casos.
4. **Entrada própria** `/portal-parceiro` sem token → login do parceiro.
   *Pronto quando:* no navegador (build da frente): sem token abre a tela do
   parceiro com campo de senha; "Voltar" leva ao seletor; "/" continua no
   seletor; com token continua o portal por link. ✅ medido em 03/10/2026.
   Primeira versão falhou nessa medição: o listener de auth zerava o grupo logo
   depois do ajuste; a regra passou a se reafirmar.
5. **Publicação** — push em main, `conferir-producao.sh`, check-run `ci`.

## Fora do escopo

- Mesmo e-mail em dois workspaces (`maybeSingle` quebra o login) — hoje a base
  não tem nenhum caso.
- Preencher `partner_users.user_id` no primeiro acesso.
- "Esqueceu a senha" da tela continua no envio do próprio Supabase Auth; o
  caminho garantido é "Reenviar convite" pela construtora.

## Prova que depende do usuário

O recebimento do e-mail e o clique no link precisam de uma caixa de entrada real:
convidar um integrante de teste com um e-mail seu, abrir o e-mail, criar a senha
e entrar em `/portal-parceiro`.
