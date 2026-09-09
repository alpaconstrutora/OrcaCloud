# Portal do Fornecedor › "Meus dados" com o cadastro inteiro

## Pedido original

> Sessão de 2026-09-09:
>
> Área do Fornecedor (visao fornecedor) no contato superior esquerdo, criar Meus dados e traga todos os dados cadastrais (minha organizacao < meus fornecedores)

### Decisões do usuário (perguntadas nesta sessão, antes de construir)

1. **Onde:** *"Só no menu da conta (topo à direita)"* — substitui o item
   "Minha conta" que já existe ali. **Não** entra na barra lateral esquerda.
2. **Dados bancários:** *"Sim, incluir"* — com a conta e a chave PIX **por
   inteiro**, cientes de que o link do portal é público (quem tem a URL entra).

## Diagnóstico

O item "Minha conta" do menu abre hoje um modal de 4 campos
(`SupplierDashboard.tsx`, estado `showMyAccount`): Nome, E-mail, Telefone e
CNPJ/CPF. O cadastro real em **Minha Organização › Meus Fornecedores**
(`SupplierForm.tsx`) tem três abas — *Dados gerais* (identificação, organização,
portais, dados oficiais do CNPJ), *Endereços e contatos* e *Dados bancários*.

O que já existe e o que falta:

| Dado | De onde vem | Chega ao portal hoje? |
|---|---|---|
| Linha inteira de `suppliers` (38 colunas) | RPC `supplier_portal_get_data` → `row_to_json(s.*)` | **Sim** — a RPC já devolve tudo; só a tela mostrava 4 campos |
| `supplier_bank_accounts` | tabela própria, com RLS por organização | **Não** — não existe RPC de portal para ela |

Ou seja: o grosso do dado já trafega. O que falta é **tela** e, para o
bancário, **uma RPC nova**.

## Itens

### 1. `supabase/migrations/aplicar_20270921000001_supplier_portal_dados_bancarios.sql`

**O que muda:** cria `supplier_portal_get_bank_accounts(p_token TEXT)`,
`SECURITY DEFINER`, no mesmo molde das outras 20 RPCs do portal: resolve o
fornecedor por `supplier_portal_supplier_from_token(p_token)`, devolve
`{"valid":false}` se o token não valer, e só então lê as contas **daquele**
fornecedor. Filtra `status = 'ativo'`.

REGRA #7, as três perguntas:
- *esta perna do OR sozinha basta?* — não há OR; o único filtro é
  `supplier_id = v_sup`, e `v_sup` vem do token, não do parâmetro.
- *quem mais executa?* — `REVOKE EXECUTE ... FROM PUBLIC` **literal** na mesma
  migration, depois `GRANT ... TO anon, authenticated` (o portal não tem login,
  então `anon` é intencional — é o mesmo desenho das RPCs irmãs).
- *é Edge Function?* — não.

**Como sei que terminou:** `npx vitest run __tests__/segurancaMigrations.test.ts`
e `__tests__/migrationsPrefixo.test.ts` passando; a RPC responde
`{"valid":false}` para token inválido e lista as contas para o token real,
medido com `db query`.

### 2. `services/supplierPortalTokenService.ts`

**O que muda:** método `getBankAccounts(token)` → `SupplierBankAccount[]`.

**Como sei que terminou:** `tsc --noEmit` limpo e a tela lista as contas.

### 3. `components/supplier/portal/PortalMyData.tsx` (novo)

**O que muda:** conteúdo somente-leitura do "Meus dados", no vocabulário do
PortalKit (§24 — o arquivo mora em `components/supplier/portal/*`), com os
mesmos três grupos do cadastro:

1. **Identificação** — código, nome, apelido, tipo (PF/PJ), CNPJ/CPF, categoria,
   portal, organização, data de cadastro.
2. **Endereço e contato** — contato, e-mail, telefone, logradouro, número,
   bairro, cidade/UF, CEP.
3. **Dados oficiais (CNPJ)** — situação e data, natureza jurídica, porte,
   abertura, atividade principal e secundárias, Simples/SIMEI, inscrições
   estaduais. Some inteiro quando o fornecedor é PF ou nunca teve consulta.
4. **Dados bancários** — uma faixa por conta: banco, agência, conta e tipo,
   favorecido, chave PIX com o tipo, marcações de principal.

Aviso ao pé: alterações são pedidas à construtora (o portal é leitura).

**Como sei que terminou:** `bash scripts/check-ui-standard.sh` no arquivo →
0 ou só achados justificados pelo §24; nenhum campo do cadastro fora da tela
sem motivo escrito.

### 4. `components/SupplierDashboard.tsx`

**O que muda:**
- item do menu "Minha conta" → **"Meus dados"**;
- o modal de 4 campos (`max-w-md`, `rounded-[2rem]`) sai; entra `Sheet`
  (§26/REGRA #4 — painel lateral é o padrão, e o guia proíbe tela cheia);
- carrega as contas bancárias ao abrir: por token no portal público, e direto
  da tabela (RLS do usuário logado) na prévia do admin, que não tem token.

**Como sei que terminou:** abrir o menu no portal por token mostra "Meus dados",
o painel abre com os quatro grupos preenchidos, e o console fica limpo.

## Fora de escopo

- Editar o cadastro pelo portal — segue sendo leitura; o texto da tela diz isso.
- Barra lateral esquerda: o usuário escolheu explicitamente o menu da conta.

## Estado — 4 de 4 itens concluídos (2026-09-09)

| Item | Estado | Evidência |
|---|---|---|
| 1. Migration + RPC | ✅ | aplicada por `db query -f`; ACL sem PUBLIC: `{postgres=X,anon=X,authenticated=X,service_role=X}` |
| 2. `getBankAccounts` | ✅ | `services/supplierPortalTokenService.ts` |
| 3. `PortalMyData.tsx` | ✅ | `check-ui-standard.sh` exit 0; 7 testes de componente |
| 4. Menu + `Sheet` | ✅ | painel de 672px (não tela cheia), medido no navegador |

**Prova da RPC, os três caminhos** (HTTP real, chave publicável do bundle):

| Requisição | Resposta |
|---|---|
| token válido, chave anon | `{"data": [], "valid": true}` |
| token inválido, chave anon | `{"valid": false}` |
| sem chave nenhuma | `401` |

O `[]` é o dado certo: o fornecedor do token de teste (MCC) não tem conta
cadastrada. Em 09/09/2026 **um** fornecedor de 243 tinha conta bancária, e ele é
PF sem consulta de CNPJ — não existe no banco um fornecedor que exercite ao
mesmo tempo o bloco bancário e o de dados oficiais. Por isso esses dois blocos
são cobertos por `__tests__/components/PortalMyData.test.tsx` (7 casos: quatro
blocos com dado, CNPJ/CPF e CEP formatados, conta com agência+dígito e chave
PIX, estado vazio do bloco bancário, PF sem bloco de Receita, campo vazio que
não vira "—", e o aviso de leitura). Nenhum token novo foi criado em produção
para isso.

**No navegador** (portal por token, servidor da própria frente em `:3111`):
menu da conta mostra "Meus dados"; o painel abre com Identificação, Endereço e
contato e Dados bancários preenchidos a partir do cadastro real; zero
`pageerror`, zero `console.error`, zero 4xx/5xx do PostgREST.

**Três ajustes vindos do print, não do código:**
1. o grid era `md:grid-cols-2`, mas `md:` mede a JANELA e não o painel — dentro
   dos 672px do `Sheet` cada coluna ficava com ~300px e o e-mail quebrava no
   meio da palavra. Virou coluna única;
2. "Nenhuma conta cadastrada" aparecia duas vezes (subtítulo + estado vazio);
3. o spinner cobria a tela inteira enquanto só o bloco bancário carregava —
   agora é só ele que espera, e os três blocos que já têm dado aparecem na hora.

Suíte cheia: **224 arquivos, 3406 testes, 0 falha**. `tsc --noEmit` limpo.
