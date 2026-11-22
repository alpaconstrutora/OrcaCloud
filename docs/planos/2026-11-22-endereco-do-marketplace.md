# Plano — Endereço do marketplace público no cadastro da organização

## Pedido original (22/11/2026, sessão e7b82365)

Contexto: no roteiro de teste do Portal do Investidor, o passo do marketplace público ficou bloqueado — a vitrine
abre em `/m/<slug>` e a organização Garden SPE não tinha `slug`; nenhuma tela permitia cadastrá-lo. Ofereci:
A) gravar o slug pelo banco; B) criar o campo "Endereço do marketplace" no cadastro da Organização; C) pular.
Recomendei a B.

Mensagem do usuário:
> Recomendo a B: de acordo

## Fatos conferidos (22/11)
- `organizations.slug` (text, NULL) com `UNIQUE (slug)` e índice em `lower(slug)`; `get_public_marketplace` procura
  por `lower(slug) = lower(p_slug)`; `App.tsx` casa `/m/([a-z0-9-]+)`.
- Só 2 de 8 organizações têm slug (`alpa`, `alpa-empreendimentos`); a Garden SPE não tem.
- UPDATE em `organizations` = owner/admin da org (policy existente). Nenhuma tela grava `slug`.

## Itens

| # | O que muda | Pronto quando |
|---|---|---|
| 1 | `utils/enderecoDoMarketplace.ts`: normalizar (minúsculo, sem acento, `[a-z0-9-]`), gravar (vazio = `null`), URL `/m/<slug>`, reconhecer o 23505 de `organizations_slug_key`. | Teste da regra |
| 2 | `Organization.slug` no tipo; `organizationService.colunasParaSalvar` manda o slug normalizado quando o objeto o traz. | Teste: normalizado; vazio = null; ausente = não mexe |
| 3 | Minha Organização › Organização: seção "Marketplace público" com o campo "Endereço do marketplace" (prefixo `<origem>/m/`) e "Abrir a vitrine" para o endereço gravado. Endereço repetido → a mensagem do save diz que outra organização já usa. | Teste de componente; `check-ui-standard` |
| 4 | Cadastro de oportunidade: junto da chave "Também no marketplace público", o link da vitrine — ou o aviso de que a org não tem endereço e onde cadastrar. | Teste de componente |

Sem migration: a coluna, o UNIQUE e a policy já existem.

Verificação: tsc, suíte de organização/oportunidade/Guard, e no navegador: cadastrar `garden-cambuhy` na Garden SPE
e abrir `/m/garden-cambuhy` (só com OK do usuário, porque grava na organização real).

## Estado
**Itens 1–4: 4 de 4 feitos no código** (frente `org-marketplace-slug`). Provas: `__tests__/components/EnderecoDoMarketplace.test.tsx`
(9 testes: regra, save, tela da organização, aviso na oportunidade); `tsc` 0 erros; 43 arquivos / 254 testes de
organização/oportunidade/investidor/Guard verdes; `check-ui-standard` limpo nos dois `.tsx`.
Limite conhecido (anterior a este plano): `handleUpsertOrganization` engole o erro do save com um `alert`, então a
ficha marca "salvo" mesmo quando o banco recusou (ex.: endereço repetido). O alerta diz o motivo; recarregar mostra
o valor real.
Pendente: publicar; o usuário cadastra o endereço da Garden SPE e testa a vitrine.
