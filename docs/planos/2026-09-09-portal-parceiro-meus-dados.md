# Portal do Parceiro (visão do parceiro) — "Meus dados"

**Frente:** `parceiro-meus-dados`
**Data do pedido:** 09/09/2026

---

## Pedido original

Mensagem do usuário, transcrita literalmente:

> Área do Pareceiro (visao Pareceiro ) no contato superior esquerdo, criar Meus dados e traga todos os dados cadastrais (minha organizacao < meus fornecedores)

Duas decisões foram perguntadas antes de codar (as duas mudavam o trabalho):

| Pergunta | Resposta do usuário |
|---|---|
| Onde entra "Meus dados"? | **No menu de conta (direita)**, junto de "Minha conta" |
| Dados bancários / PIX entram, sendo o portal acessível por link público? | **Incluir sempre** (nos dois modos) |

O pedido dizia "canto superior esquerdo"; perguntei porque a área de conta do
portal fica à direita, e o usuário escolheu a direita.

---

## O que já existia (e por isso este plano é curto)

Outra sessão entregou hoje o mesmo recurso para o **Portal do Fornecedor**
(`aplicar_20270921000001_supplier_portal_dados_bancarios.sql` +
`components/supplier/portal/PortalMyData.tsx`), já em `main`.

`PortalMyData` é **puramente apresentacional** — props `supplier`,
`bankAccounts`, `loadingBankAccounts`, nenhum acoplamento a token ou service.
Ele já monta os quatro blocos que espelham o cadastro de Meus Fornecedores:
Identificação · Endereço e contato · Dados oficiais (CNPJ) · Dados bancários.

**Então esta frente NÃO escreve painel novo.** Escrever um segundo painel com o
mesmo conteúdo seria criar exatamente a gêmea que os dois consertos de hoje
tiveram que desfazer. O guia já responde este caso (§24, "Telas de detalhe
compartilhadas"): prop `accent` com padrão que preserva o comportamento atual,
e **não duplicar o componente**.

O que falta é só a **porta de dados do parceiro**: `PortalMyData` recebe um
`Supplier`, e no Portal do Parceiro nada carrega essa linha hoje — o
`partner_workspaces` só guarda `supplier_id`, e a RLS de `suppliers` é
`is_org_member`, que não alcança nem a sessão anon do link nem, por desenho, o
caminho do portal.

---

## Itens

### 1. `supabase/migrations/aplicar_20270921000002_partner_meus_dados.sql`

**O que muda** — núcleo + duas cascas, o padrão já estabelecido em
`20270863000000`:

- `partner_ws_supplier_profile(p_ws)` — núcleo, sem grant, devolve
  `{supplier, bank_accounts}` numa chamada só;
- `partner_get_supplier_profile(p_workspace_id)` — casca do app, autoriza por
  `partner_can_access_workspace`;
- `partner_portal_get_supplier_profile(p_token)` — casca do link, autoriza por
  `partner_portal_workspace_from_token`.
- REGRA #7: `REVOKE` literal para as três; `anon` só na casca do link.
- Conta com `status = 'inativo'` fica de fora — mesma regra que a sessão irmã
  adotou para o fornecedor, para os dois portais dizerem a mesma coisa.

**Como sei que terminou**
- [ ] As três funções existem, o núcleo sem `anon`/`authenticated` na ACL.
- [ ] `npx vitest run __tests__/segurancaMigrations.test.ts` verde.
- [ ] Chamada direta ao núcleo devolve o cadastro do fornecedor do workspace.

### 2. `services/partnerService.ts` e `services/partnerPortalTokenService.ts`

**O que muda** — um método em cada, chamando a casca correspondente, com a mesma
assinatura de retorno.

**Como sei que terminou**
- [ ] `tsc` limpo; os dois devolvem `{ supplier, bankAccounts }`.

### 3. `components/supplier/portal/PortalMyData.tsx`

**O que muda** — prop `accent?: 'portal' | 'partner'`, default `'portal'`.
Só troca a cor do ícone do cabeçalho de bloco (é o único hex fixo do arquivo);
o resto do cromo já é neutro.

**Como sei que terminou**
- [ ] Portal do Fornecedor renderiza igual ao de antes (default preservado).

### 4. `components/partner/PartnerPortal.tsx`

**O que muda**
- item "Meus dados" no menu de conta, acima de "Minha conta";
- abre um `Sheet` (painel lateral — §26 / UI_PATTERNS; **nunca tela cheia**) com
  `<PortalMyData accent="partner" />`;
- carrega sob demanda, pelo modo certo (token × app).

**Como sei que terminou**
- [ ] Abre nos dois modos com dado real e mostra os quatro blocos.

### 5. Verificação

- [x] `npx tsc --noEmit -p .` → exit 0; `check-ui-standard.sh` limpo nos dois
      arquivos de UI tocados.
- [x] `npm run test` → **228 arquivos / 3439 testes, 0 falhas** (baseline antes:
      225 / 3416).
- [x] `__tests__/segurancaMigrations.test.ts` → 2 passed.
- [x] **Na tela real, nos DOIS modos** (servidor novo em 3185, PID 220476
      provado, ligado a `127.0.0.1`, `serviceWorkers:'block'`), parceiro
      AFONSO H VILELA ENGENHARIA LTDA:

      | | link público (anon) | app (pré-visualização) |
      |---|---|---|
      | item no menu | ✅ | ✅ |
      | blocos | **4/4** | **4/4** |
      | RPC na rede | `partner_portal_get_supplier_profile` | `partner_get_supplier_profile` |
      | CNPJ na tela | 47.992.795/0001-25 | 47.992.795/0001-25 |

      Cada modo pela SUA casca, mesmo conteúdo. Zero erros de console.
- [x] **Bloco bancário provado no núcleo**, com `ROLLBACK`
      (`2026-09-09-prova-meus-dados-banco.sql`): duas contas inseridas, uma
      `ativo` e uma `inativo` → **1 devolvida**, `vazou_inativa = false`, chave
      PIX inteira.

### ⚠️ O que NÃO foi visto na tela

O bloco **Dados bancários com conta de verdade**. Nenhum fornecedor com portal
de parceiro tem conta cadastrada — a base inteira tem **uma** conta, de um
fornecedor sem portal. Na tela, hoje, o bloco aparece com o estado vazio
("Nenhuma conta cadastrada"). O caminho com dado está coberto pelo teste de
componente e pela prova de RPC acima, não por print.

---

## Fora de escopo

- Editar o cadastro pelo portal. O painel é leitura; alterar cadastro é da
  construtora (é o que a tela do fornecedor também faz).
- Migrar o Portal do Parceiro inteiro para o vocabulário do `PortalKit` (§24).
  Aqui entra só o painel de Meus dados, com o acento do parceiro.
