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

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 12/11/2026 | Onde aparece "Proprietário"? | Só no select de quem JÁ é proprietário. Corrige o rótulo errado sem abrir um caminho novo de promoção a dono por um clique numa linha de tabela. |
| 12/11/2026 | Oferecer "Proprietário" a quem não é? | Não, nesta entrega: promover a proprietário é decisão de produto (permissões, quem pode, último proprietário) e hoje a RLS não a restringe. Ofertar exigiria também corrigir `getDefaultPermissions('owner')`. Fica como pendência para decisão do usuário. |
| 12/11/2026 | `getDefaultPermissions('owner')` | Não tocado: é usado como fallback de exibição em Permissões detalhadas; mudar altera o que a tela mostra para proprietários. |

## Plano
| Item | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/OrganizationUsers.tsx` | `<option value="owner">Proprietário</option>` só quando `member.role === 'owner'` | `__tests__/components/OrganizationUsersFuncaoProprietario.test.tsx` (falha sem a linha, verificado) + tela real |

## Estado
- [x] implementação + testes (2) + `tsc` exit 0 + `check-ui-standard.sh`
- [x] tela real (login de leitura, só leitura, `c:/tmp/pwtest/usuarios-proprietario.js`): Dev aparece como Proprietário; ninguém mais recebe a opção; 0 escritas, 0 erros de página
- [ ] PR + CI
- [ ] publicação
