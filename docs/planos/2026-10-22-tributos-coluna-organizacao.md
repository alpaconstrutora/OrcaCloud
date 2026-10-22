# Tributos a Pagar — coluna Organização

## Pedido original (22/10/2026, literal)

> financeiro < tributos a pagar: crie uma coluna Organizacao

## Por quê

Folha (PR #87) e pró-labore (PR #91) geram tributos para a Alpa e para a Garden. Com o seletor do topo em "Todas as
organizações", a lista não dizia de qual organização era cada linha. O que existia era `organization_id` na view, sem
nome na tela, e o painel do DARF só dizia a organização depois de selecionar.

## Decisões

1. **Coluna "Organização" sempre disponível**, logo depois de "Tributo", com o nome da organização do tributo. O pedido foi
   literal e uma org selecionada não é motivo para escondê-la: quem não quiser, oculta pelo seletor de colunas
   (ícone de engrenagem), como as outras.
2. **O nome vem de `organizations`**, a lista que a tela já recebe do `AppRouter` (a mesma que o painel do DARF usa).
   Nenhuma consulta nova, nenhuma mudança de banco ou de service. Organização que a lista não conhece mostra "—",
   nunca o id cru.
3. **A coluna acompanha o resto da tela**:
   - ordenação pelo **nome** (não pelo id);
   - filtro avançado (§5.5): campo "Organização" com lista com busca, a partir dos nomes das linhas carregadas;
   - Agrupar (§6.12): opção nova "Organização" (grupo "Sem organização" quando o nome não é conhecido).
4. **Fora do escopo:** a busca por texto continua no service e não casa pelo nome da organização. Para recortar por
   organização, use o filtro avançado ou o seletor do topo.

## Verificação

- `__tests__/components/TributosColunaOrganizacao.test.tsx` (2): nome por linha e travessão para org desconhecida;
  Agrupar por organização.
- `tsc --noEmit`, `check-ui-standard` e conferência na tela real (conta de leitura, só leitura).
