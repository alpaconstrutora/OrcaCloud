# Minha organização › Usuários › Membros: o proprietário aparecia como "Admin"

## Pedido original
> adicionar a opção "Proprietário" ao select;
>
> (resposta a: "na aba Membros, quem tem função `owner` aparece como 'Admin' na coluna 'Função / Cargo'. O select só tem Admin, Membro e Visitante, então o proprietário cai no primeiro item. Três saídas: adicionar a opção 'Proprietário' ao select; mostrar a função como texto só-leitura; deixar como está.)
>
> Sessão: 21223933-8ef7-470f-8d04-de0e7ec13d09 · 12/11/2026

## Diagnóstico
O `<select>` da coluna tinha as opções admin/member/viewer. Com `value="owner"` sem opção correspondente o navegador mostra a primeira (Admin). Agravantes achados na leitura do código e do banco:
- `getDefaultPermissions('owner')` cai no `default` = permissões de VISITANTE; trocar a função para `owner` pelo select zeraria o cargo e as permissões da pessoa.
- A RLS de `organization_members` (`Owners and admins can manage members`, `is_org_manager`) deixa qualquer admin gravar qualquer função, inclusive `owner`.

## Pedido posterior (12/11/2026)
Perguntei quem poderia promover alguém a proprietário, que permissões o novo proprietário receberia e se o último proprietário poderia ser rebaixado. Resposta literal:
> 1. quem pode fazer isso (só proprietário, ou admin também): proprietário e admin.
> 2. que permissões o novo proprietário recebe, o que exige corrigir getDefaultPermissions('owner'); todas permissões.
> 3. se o último proprietário pode ser rebaixado, o que hoje já é possível escolhendo "Admin" no select. sim pode

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 12/11/2026 | Onde aparece "Proprietário"? | Em todas as linhas para quem pode promover; em quem JÁ é proprietário sempre (senão o select não tem o valor e mostra "Admin"). |
| 12/11/2026 | Quem pode promover? | Proprietário e admin da organização (e o desenvolvedor) — a mesma regra que a RLS (`is_org_manager`) já aplica. Para os demais a opção não é oferecida nas linhas dos outros. |
| 12/11/2026 | Permissões do novo proprietário | TODAS. `getDefaultPermissions('owner')` passou a valer como `admin` (antes caía no padrão de visitante). Efeito colateral aceito: o fallback de exibição em "Permissões detalhadas" para proprietários também passa a ser "todas". |
| 12/11/2026 | Rebaixar o único proprietário | Permitido. Como a troca substitui as permissões, promover e rebaixar proprietário pedem confirmação (`useConfirm`, `warning`); o rebaixamento do único proprietário só avisa que ele é o único — não bloqueia. Decisão minha, não pedida: as duas pontas do topo da hierarquia trocam o conjunto inteiro de permissões. |

## Plano
| Item | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/OrganizationUsers.tsx` | opção `owner` no select (regra acima); `getDefaultPermissions('owner')` = admin; `handleMemberRoleChange` confirma promover/rebaixar proprietário | `__tests__/components/OrganizationUsersFuncaoProprietario.test.tsx` (8 testes; 2 mutações verificadas: sem o caso `owner` e opção liberada a todos) |

## Estado
- [x] implementação + testes (8) + `tsc` exit 0 + `check-ui-standard.sh` + `orgContextGuard`
- [x] tela real (login de leitura = Membro, só leitura, `c:/tmp/pwtest/usuarios-proprietario.js`): Dev aparece como Proprietário; a conta (Membro) não recebe a opção nas outras linhas; 0 escritas, 0 erros de página
- [ ] promoção/rebaixamento numa conta gestora NÃO foi exercitado na tela real (grava no banco): coberto só pelos testes de componente
- [ ] PR + CI
- [ ] publicação
