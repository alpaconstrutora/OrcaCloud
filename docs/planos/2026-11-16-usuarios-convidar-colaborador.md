# Usuários › Convidar membro a partir de um colaborador

## Pedido original

> minha organização > usuários: Por que nao consigo adicionar colaboradores como usuários?

Sessão `e4ec4d30-67ce-4ea2-bbe9-a1c646f259d8` · 16/11/2026, manhã.

Diagnóstico dado na sessão: dois motivos possíveis — (1) com o topo em "Todas as
organizações" a aba vira "Todos os usuários", sem o botão Convidar; (2) não existe
caminho colaborador → usuário: o convite pede nome e e-mail digitados e não lista os
colaboradores do RH. O usuário escolheu:

> motivo 2

Proposta: busca de colaborador no convite, que preenche nome e e-mail e vincula o
colaborador ao usuário. Pergunta: o que fazer com colaborador sem e-mail (13 dos 15)?
(A) digitar o e-mail no convite e gravar na ficha; (B) mostrar desligado com aviso.

> A

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 16/11 | Qual dos dois motivos? | Motivo 2 — escolher um colaborador já cadastrado ao convidar |
| 16/11 | Colaborador sem e-mail | (A) digita o e-mail no convite e ele é gravado na ficha do colaborador |
| 16/11 | Caminho de construção | A tela faz tudo (opção 1) — sem migration, sem republicar Edge Function. Escolha minha; o usuário falou do resultado, não do como |

## Como é hoje (origin/main 52e45be79)

- `components/OrganizationUsers.tsx` › modal "Convidar Novo Membro": Nome e E-mail
  digitados; `handleInvite` chama a Edge `invite-member` e depois
  `onUpdateMembers([...members, newMember])` (caminho pesado de
  `organizationService.updateOrganization`).
- `employees` já tem `user_id` (vínculo com o login). Ele só é preenchido à mão em
  RH › Colaboradores › ficha › "Usuário do sistema" (`LaborEmployeeForm.tsx`), que
  lista quem **já é** membro. Hoje: 1 de 15 colaboradores vinculado; 2 de 15 com e-mail.
- `laborService.listEmployees(orgId)` já devolve os colaboradores da org **e** os
  disponibilizados para ela (`employee_org_shares`).
- RLS de `employees` (`employees_org_access`, ALL): membro da org do colaborador, ou
  colaborador compartilhado com o usuário — a tela consegue gravar `email` e `user_id`.
- `invite-member`: convite novo cria o login (`auth.users`) e a linha de membro; se o
  e-mail **já tem login**, devolve `alreadyRegistered` e não cria a linha de membro (quem
  cria é o `onUpdateMembers` da tela). O gatilho `fn_org_member_fill_user_id` preenche
  `organization_members.user_id` a partir do e-mail.

## Desenho

**Intenção.** Quem convida não deve redigitar o que o RH já tem, e o colaborador
convidado deve sair do convite já vinculado ao seu login — sem o segundo passo na ficha.

**Metas**
1. No convite, um campo "Colaborador" (opcional) com busca, listando os colaboradores
   **ativos** da organização ativa e os disponibilizados para ela.
2. Escolher um colaborador preenche Nome e E-mail (continuam editáveis).
3. Colaborador sem e-mail: o campo E-mail fica vazio e obrigatório, com a dica
   "será gravado na ficha do colaborador". Ao enviar, o e-mail vai para a ficha.
4. Ao concluir o convite, a ficha do colaborador recebe `user_id` do login.
5. Quem já é usuário **desta organização** (o `user_id` da ficha é o `userId` de um
   membro dela, ou o e-mail da ficha é o de um membro dela) aparece na lista
   **desligado, com o motivo** ("Já é usuário desta organização"). Ficha vinculada a
   um login que só é membro de OUTRA org continua convidável (o convite a acrescenta
   aqui; o vínculo existente não é tocado).

**Fora do escopo**
- Botão de convite em "Todos os usuários" (motivo 1) — não foi o escolhido.
- Mudar a Edge `invite-member`, migration, gatilho no banco.
- Trocar o caminho pesado do `onUpdateMembers` no convite.
- Convidar vários colaboradores de uma vez.

**Não pode acontecer**
- Vincular o colaborador errado sem ninguém escolher (nada de casar por e-mail sozinho).
- Sobrescrever um e-mail que a ficha já tinha: se a ficha tem e-mail e a pessoa digitar
  outro no convite, o login usa o digitado e a ficha **mantém** o seu.
- Dizer "convite enviado" quando o vínculo ou a gravação do e-mail falhou — o aviso diz
  o que ficou feito e o que ficou pendente (e onde resolver: RH › Colaboradores).

**Ordem ao enviar** (colaborador escolhido)
1. Ficha sem e-mail → grava o e-mail digitado na ficha.
2. Convite como hoje (`invite-member` + `onUpdateMembers`).
3. Lê o `user_id` da linha de membro (org + e-mail) e grava na ficha, se a ficha ainda
   não tiver vínculo. Sem `user_id` (convite falhou antes de criar o login) → aviso de
   vínculo pendente.

**Deixado para o plano/construção**
- Qual componente de busca reusar (seguir o que o app já usa para escolher pessoa).
- Garantir que o passo 3 leia o `user_id` só depois de a linha de membro existir, nos dois
  casos: convite novo (a Edge cria a linha) e e-mail que já tinha login (quem cria é o
  `onUpdateMembers`).
- Protocolo da REGRA #1 (guia de UI + `check-ui-standard.sh`) no modal tocado.

---

# Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado)
> ou superpowers:executing-plans, tarefa a tarefa. Passos em checkbox (`- [ ]`).

**Meta:** o convite de Usuários escolhe um colaborador do RH, preenche nome/e-mail, grava o
e-mail na ficha sem e-mail e vincula a ficha ao login.

**Arquitetura:** tudo no cliente. Uma função pura decide quem aparece e quem vem desligado;
o `CreatableCombobox` ganha opção desligada com motivo; o `handleInvite` grava o e-mail antes
do convite, **aguarda** o `onUpdateMembers` e só então lê o `user_id` do membro e grava na ficha.

**Stack:** React 19 + TypeScript, Supabase JS, Vitest + Testing Library (jsdom).

**Desenho:** as seções acima deste plano, neste mesmo arquivo.

## Restrições globais

- Frente `C:\D\frentes\usuarios-convidar-colaborador`, branch `feat/usuarios-convidar-colaborador`. Nada no checkout de integração (REGRA #8).
- Sem migration, sem mudar `supabase/functions/invite-member`.
- E-mail gravado e comparado sempre `trim().toLowerCase()`.
- Textos fixos: rótulo `Colaborador (opcional)`; motivo `Já é usuário desta organização`; dica sob o E-mail `Será gravado na ficha do colaborador.`; aviso sem vínculo `Nenhum colaborador escolhido — o convite não fica vinculado ao RH.`
- Rótulos sem caixa alta, campos `h-9` (guia §16/§21). REGRA #1: ler `docs/ui_ux_guia_unificado.md` inteiro antes de editar tela e rodar `bash scripts/check-ui-standard.sh` nos `.tsx` tocados.
- Testes: `node --max-old-space-size=8192 node_modules/vitest/vitest.mjs run <arquivo>` (o Node 24 desta máquina cai às vezes — repetir; só vale com a conta fechando).

## Foco de revisão (o que os testes não pegam sozinhos)

1. **Colaborador disponibilizado por outra org** — gravar `email`/`user_id` depende do ramo `is_employee_shared_with_user` da RLS; esperado: grava. Conferido na tela real (Tarefa 4).
2. **E-mail que já tem login** (`alreadyRegistered`: a Edge não cria a linha de membro) — o vínculo só pode ler o `user_id` depois do `onUpdateMembers` resolver. Teste "aguarda o onUpdateMembers" (Tarefa 3).
3. **Digitar no campo depois de escolher** — desvincula; Nome/E-mail ficam como estão e o convite sai sem tocar em ficha. Teste "digitar desvincula" (Tarefa 3).
4. **E-mail com maiúsculas/espaços** — vai normalizado para a ficha e para a busca do `user_id`. Asserção no teste "sem e-mail" (Tarefa 3).
5. **Falha ao gravar o e-mail na ficha** — o convite segue; o aviso diz que o e-mail não foi gravado. Teste "falha na ficha" (Tarefa 3).

## Decisões minhas (o usuário pode mudar)

| Decisão | Por quê |
|---|---|
| Fora da lista: status `DESLIGADO` e `INATIVO`; `AFASTADO` entra | afastado continua vinculado à empresa |
| Componente: `CreatableCombobox` sem `onCreate` + 2 props novas | é o combobox com busca do app; colaborador não é entidade de drawer (§7.1.1) nem catálogo criável (§7.1.2) → seção nova §7.1.3 no guia |
| `onUpdateMembers` passa a `void \| Promise<void>` e é aguardado no convite | é a única forma de o vínculo achar a linha de membro no caso "e-mail já tem login" |

---

### Task 1 (Tarefa 1): `CreatableCombobox` com opção desligada e aviso configurável

**Arquivos:**
- Modificar: `components/ui/CreatableCombobox.tsx`
- Teste: `__tests__/components/CreatableComboboxOpcaoDesligada.test.tsx` (novo)

**Interfaces — produz:**
- `getDisabledReason?: (item: T) => string | undefined` — com motivo, a opção sai com `aria-disabled="true"`, texto cinza, o motivo no lugar do hint, e **não** é escolhida por clique, Enter nem pelo auto-vínculo do blur.
- `avisoSemVinculo?: string` — substitui `'Não vinculado ao catálogo.'` quando não há `onCreate`.

- [ ] **Passo 1 — teste que falha** (`describe('CreatableCombobox — opção desligada')`):
  - `it('mostra o motivo e não escolhe no clique')`: opções `[{id:'1',name:'Ana'},{id:'2',name:'Bia'}]`, `getDisabledReason = o => o.id==='2' ? 'Já é usuário desta organização' : undefined`; foca o input; `getByRole('option',{name:/Bia/})` tem `aria-disabled="true"` e contém `Já é usuário desta organização`; clicar nela → `onSelect` não chamado.
  - `it('Enter na opção desligada não escolhe')`: ArrowDown até Bia + Enter → `onSelect` não chamado.
  - `it('blur com o nome exato da desligada não vincula')`: `value='Bia'`, `selectedId=null`, blur → `onSelect` não chamado; com `value='Ana'` → chamado com Ana.
  - `it('avisoSemVinculo troca o aviso sem onCreate')`: `value='Zé'`, sem foco → aparece `Nenhum colaborador escolhido — o convite não fica vinculado ao RH.` e não aparece `Não vinculado ao catálogo.`
- [ ] **Passo 2 — rodar e ver falhar** (`aria-disabled` ausente / `onSelect` chamado).
- [ ] **Passo 3 — implementar** as duas props em `CreatableCombobox.tsx`; `escolher`, o Enter e o `onBlur` ignoram item com motivo.
- [ ] **Passo 4 — rodar o teste novo e os que já usam o componente** (`grep -rl CreatableCombobox __tests__`) → todos passam.
- [ ] **Passo 5 — commit** `feat(combobox): opção desligada com motivo e aviso sem vínculo configurável`.

### Task 2 (Tarefa 2): quem aparece na busca — `lib/convidarColaborador.ts`

**Arquivos:**
- Criar: `lib/convidarColaborador.ts`
- Teste: `__tests__/convidarColaborador.test.ts` (novo)

**Interfaces — produz:**
```ts
export interface OpcaoColaborador { id: string; name: string; email: string; userId: string | null; motivoDesligado?: string }
export function opcoesDeColaborador(employees: Employee[], members: OrganizationMember[]): OpcaoColaborador[]
```
`email` = `trim().toLowerCase()` ou `''`; `motivoDesligado = 'Já é usuário desta organização'` quando algum membro tem `userId === employee.user_id` (com `user_id` não nulo) ou o mesmo e-mail normalizado; ordena por `name` com `localeCompare('pt-BR')`.

- [ ] **Passo 1 — teste que falha** (`describe('opcoesDeColaborador')`):
  - `it('tira DESLIGADO e INATIVO, mantém ATIVO e AFASTADO')`
  - `it('normaliza o e-mail e usa vazio quando não há')`: `' Ana@X.com '` → `'ana@x.com'`; `undefined` → `''`.
  - `it('desliga quem já é membro pelo userId')` e `it('… pelo e-mail, sem diferenciar caixa')` → `motivoDesligado === 'Já é usuário desta organização'`.
  - `it('ficha vinculada a login que não é membro desta org continua convidável')` → sem `motivoDesligado`, `userId` preservado.
  - `it('ordena por nome em pt-BR')`: `['Érica','Ana','bruno']` → `['Ana','bruno','Érica']`.
- [ ] **Passo 2 — rodar e ver falhar** (módulo inexistente).
- [ ] **Passo 3 — implementar** `opcoesDeColaborador`.
- [ ] **Passo 4 — rodar** → passa.
- [ ] **Passo 5 — commit** `feat(usuarios): regra de quem pode ser convidado a partir do RH`.

### Task 3 (Tarefa 3): o convite escolhe o colaborador, grava o e-mail e vincula

**Arquivos:**
- Modificar: `components/OrganizationUsers.tsx` (estado do convite ~l.643, `handleInvite` ~l.707, `resetInviteForm` ~l.749, modal ~l.1746, prop `onUpdateMembers` l.124)
- Modificar: `components/OrganizationList.tsx` (tipos de `onEdit`/`onSave` ~l.177 → `void | Promise<void>`)
- Modificar: `services/organizationService.ts` (função nova)
- Modificar: `docs/ui_ux_guia_unificado.md` (seção nova §7.1.3 + item no CHECKLIST DE APLICAÇÃO)
- Teste: `__tests__/components/OrganizationUsersConvidarColaborador.test.tsx` (novo; mocks no molde de `OrganizationUsersAbrirMembro.test.tsx`, mais `vi.mock('../../services/laborService')`)

**Interfaces — consome:** `opcoesDeColaborador`/`OpcaoColaborador` (Tarefa 2); `getDisabledReason`/`avisoSemVinculo` (Tarefa 1); `laborService.listEmployees(orgId)` e `laborService.updateEmployee(id, updates)` (existentes).
**Produz:** `organizationService.userIdDoMembro(organizationId: string, email: string): Promise<string | null>` — `select('user_id')` em `organization_members` por `organization_id` + e-mail normalizado, `maybeSingle()`; erro do Supabase é lançado. `onUpdateMembers: (m: OrganizationMember[]) => void | Promise<void>`.

**Comportamento** (desenho › Ordem ao enviar): lista carregada ao abrir o modal (`listEmployees(organizationId)` → `opcoesDeColaborador(…, members)`); falha no carregamento → campo desligado com `disabledReason` `Não foi possível carregar os colaboradores`. Campo acima de Nome/E-mail, `getHint = o => o.email || 'sem e-mail'`. Escolher preenche Nome e E-mail; digitar desvincula. Ao enviar com colaborador: (1) ficha sem e-mail → `updateEmployee(id, { email })`; (2) Edge como hoje; (3) `await onUpdateMembers(...)`; (4) ficha sem `userId` → `userIdDoMembro` → `updateEmployee(id, { user_id })`. Cada falha vira uma pendência; com pendência ou erro da Edge o modal fica aberto e o aviso lista o que ficou pendente, terminando em `Resolva em RH › Colaboradores.`; sem nada pendente fecha com `notify('Convite enviado e colaborador vinculado.', 'success')`.

- [ ] **Passo 1 — testes que falham** (`describe('Convidar membro a partir de um colaborador')`):
  - `it('escolher colaborador preenche nome e e-mail')`
  - `it('colaborador já usuário aparece desligado com o motivo')`
  - `it('sem e-mail: grava na ficha antes do convite e vincula depois')`: digita `' Novo@X.com '`; espera `updateEmployee('e1', { email: 'novo@x.com' })` com `invocationCallOrder` menor que o do `invoke('invite-member')`; `userIdDoMembro('org-1','novo@x.com')` → `'u-9'`; `updateEmployee('e1', { user_id: 'u-9' })`; modal fecha.
  - `it('ficha com e-mail e e-mail editado: ficha não muda, convite usa o digitado')`: nenhum `updateEmployee` com `email`; `invoke` com `body.email === 'outro@x.com'`.
  - `it('aguarda o onUpdateMembers antes de ler o login')`: `onUpdateMembers` devolve promise controlada; `userIdDoMembro` não é chamado até ela resolver.
  - `it('sem login: vínculo pendente, modal aberto')`: `userIdDoMembro` → `null`; nenhum `updateEmployee` com `user_id`; texto contém `RH › Colaboradores`.
  - `it('falha na ficha: convite segue e o aviso diz')`: 1º `updateEmployee` rejeita; `invoke` ainda é chamado; aviso contém `e-mail não foi gravado na ficha`.
  - `it('digitar desvincula: convite sem tocar em ficha')`: escolhe, depois digita no campo; envia; `updateEmployee` e `userIdDoMembro` não chamados.
  - `it('sem colaborador: convite como hoje')`: `updateEmployee`/`userIdDoMembro` não chamados.
- [ ] **Passo 2 — rodar e ver falhar.**
- [ ] **Passo 3 — implementar** `userIdDoMembro`, os tipos de `onUpdateMembers`/`onSave`/`onEdit`, o campo e o novo `handleInvite`; `resetInviteForm` limpa colaborador e texto.
- [ ] **Passo 4 — guia:** §7.1.3 "Escolher colaborador num formulário = `CreatableCombobox` sem `onCreate`" (quando usar, `getDisabledReason`, `avisoSemVinculo`, modelo = convite de Usuários) + linha no CHECKLIST DE APLICAÇÃO.
- [ ] **Passo 5 — rodar** o teste novo + os 4 `OrganizationUsers*.test.tsx` existentes + `__tests__/orgContextGuard.test.ts` → todos passam.
- [ ] **Passo 6 — REGRA #1:** `bash scripts/check-ui-standard.sh components/OrganizationUsers.tsx components/ui/CreatableCombobox.tsx` → exit 0 (ou só exceções já documentadas no guia, conferidas uma a uma).
- [ ] **Passo 7 — commit** `feat(usuarios): convidar membro a partir de um colaborador do RH`.

### Task 4 (Tarefa 4): verificação de verdade e publicação

- [ ] **Tipos:** `node --max-old-space-size=12288 node_modules/typescript/bin/tsc --noEmit` → exit 0, sem `error TS` (ler por grep).
- [ ] **Tela local** (Playwright, org com colaborador sem e-mail): o campo lista os ativos; "iago Marques" desligado com o motivo; escolher um sem e-mail, digitar um e-mail de teste combinado com o usuário, enviar → no banco, `employees.email` e `employees.user_id` preenchidos e `organization_members` com a linha. **Só com e-mail de teste combinado com o usuário** — o convite manda e-mail de verdade.
- [ ] **Foco de revisão 1:** repetir com um colaborador disponibilizado de outra org → `email`/`user_id` gravados.
- [ ] **Limpeza** do convite de teste (membro e ficha voltam ao que eram), combinada com o usuário.
- [ ] **PR** com o corpo pela skill `pr`; CI verde lido antes do merge; merge e conferência em produção (`scripts/conferir-producao.sh "Colaborador (opcional)"`).

## Revisão final do branch (16/11, revisor independente) — o que mudou no plano

Cinco achados conferidos no código e no banco e corrigidos, cada um com teste visto falhando antes:

1. **(crítico)** Convidar o e-mail de quem já é membro sobrescrevia papel e permissões dessa pessoa
   (upsert por organização+e-mail, o convite vinha por último). Agora o convite para antes de gravar
   qualquer coisa e avisa. Vale também para o convite sem colaborador.
2. **Colaborador disponibilizado por outra org:** o gatilho `trg_employees_vinculo_so_gestor` exige
   owner/admin da org **do colaborador** (não da que convida) para gravar `user_id` ou um e-mail de
   login na ficha. O Foco de revisão 1 do plano esperava "grava" — errado. Agora a opção vem
   desligada com "Disponibilizado por X — só owner ou admin de lá vincula a um login"
   (`ContextoDoConvite` em `opcoesDeColaborador`), e o 42501 vira a frase `MOTIVO_VINCULO_SO_GESTOR`.
3. **"Reenviar convite" apagava o login não confirmado e criava outro;** a ficha ficava no id antigo.
   `organizationService.reapontarFichasDoLogin(antigo, novo)` roda depois do reenvio da aba Usuários.
4. **Homônimos:** o vínculo automático ao sair do campo pegava a primeira ficha de mesmo nome. Agora
   só vincula com exatamente uma; a lista mostra cargo e origem; escolher ficha sem e-mail não apaga o
   e-mail já digitado.
5. **"Membro adicionado." podia ser falso:** a gravação do membro não avisa quando falha. A interface
   `userIdDoMembro` virou `membroPorEmail(org, email) → { userId } | null` — `null` = a linha não existe.

**Deixados para depois (menores):** texto "digite para cadastrar" na lista vazia sem `onCreate`;
pontuação/erro da Edge genérico no aviso; Enter no combobox fechado envia o formulário; reenviar o
formulário depois de uma pendência regrava o e-mail; toast "colaborador vinculado" também quando a
ficha já tinha login; opção desligada sem destaque no teclado; `listEmployees` traz colunas demais;
testes de "OrganizationList devolve a promessa" e de e-mail com espaços; cabeçalho do
`CreatableCombobox` ainda fala só de catálogo.

## Estado

- [x] Tarefa 1 — combobox (b981f8922)
- [x] Tarefa 2 — regra de quem aparece (a7b52a404)
- [x] Tarefa 3 — convite (b88cc3818) + correções da revisão
- [ ] Tarefa 4 — verificação e publicação: tipos ✅, testes da área ✅; **falta** a tela real (precisa de
  e-mail de teste e de uma conta admin que NÃO seja superadmin — o desenvolvedor pula a trava do
  vínculo), PR e merge
