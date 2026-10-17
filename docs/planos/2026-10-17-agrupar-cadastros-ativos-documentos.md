# "Agrupar" em Fornecedores, Clientes, Ativos, Documentos e Ofícios

## Pedido original
> implementar agrupamento também em:
> 1. Minha Organização > Meus Fornecedores
> 2. Minha Organização > Meus Clientes
> 3. Gestão de Ativos >
> 4. Gestão de Documentos
> 5. Ofícios
>
> Sessão: 6480dfb9-9abe-4ab4-adce-d776e13c7443 · 17/10/2026. Continuação de
> `docs/planos/2026-10-15-financeiro-agrupar-propagacao.md` (peças compartilhadas,
> guia de UI §6.12).

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 17/10/2026 | "Gestão de Ativos >" veio sem a sub-aba. Quais tabelas? | As três que são lista de registros: **Bens**, **Reservas** e **Manutenções**. Fica de fora **Custos & Rateio** (relatório de rateio por centro de custo — já é agregação), mesma regra do Fechamento por CC em Contas a Pagar. |
| 17/10/2026 | Telas com grade/lista (Fornecedores, Clientes, Bens) | Agrupar só no modo lista, como em Boletos: a grade não tem linha de grupo. |
| 17/10/2026 | Gestão de Documentos | A lista principal do GED é o `DocumentsTable`, compartilhado com o Portal do Parceiro, o lote de upload e a edição em lote. Ganha props OPCIONAIS de grupo; sem elas nada muda nos outros usos. |
| 17/10/2026 | Ofícios | As três abas (Ofícios, Recebidos, Modelos) usam `StandardTable` → só a prop `agrupamento`. Blocos não é tabela. |
| 17/10/2026 | Total do grupo | Telas sem valor monetário (Fornecedores, Clientes, Documentos, Ofícios, Reservas) mostram só a contagem — `LinhaDeGrupo` ganha o modo sem total. Bens soma o valor de aquisição; Manutenções, o custo. |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `components/ui/Agrupamento.tsx` + `utils/agruparLinhas.ts` | `LinhaDeGrupo` aceita grupo sem total (`semTotal`) | teste |
| `components/ui/StandardTable.tsx` | `agrupamento.valor` ausente → cabeçalho sem total | teste do StandardTable |
| `components/SupplierList.tsx` | Agrupar (modo lista) | teste de tela |
| `components/ClientList.tsx` | Agrupar (modo lista) | teste de tela |
| `components/OpuraAssetsModule.tsx` | Agrupar em Bens, Reservas, Manutenções | teste de tela |
| `components/documents/DocumentsTable.tsx` + `components/OpuraDocsModule.tsx` | props opcionais de grupo + controle na toolbar do GED | teste de tela; testes existentes do DocumentsTable verdes |
| `components/oficios/OficiosList.tsx`, `RecebidosList.tsx`, `ModelosList.tsx` | prop `agrupamento` | teste |
| `docs/ui_ux_guia_unificado.md` §6.12 | lista de telas e o modo sem total | seção atualizada |

## Estado
- [x] peças: `LinhaDeGrupo` com `semTotal`; `StandardTable` sem `valor` → só contagem
- [x] Meus Fornecedores (Tipo, Categoria, Organização, Portais) — `CadastrosAgrupar.test.tsx`
- [x] Meus Clientes (Tipo, Status, Organização, Portal do Cliente; "Empreendimento Vinculado" fora — vários por cliente) — idem
- [x] Gestão de Ativos — Ativos Patrimoniais (Categoria, Status, Alocação, Almoxarifado, Marca; total = valor de aquisição), Retirada (Ativo, Obra, Responsável, Solicitante, Status), Manutenções (Ativo, Tipo, Centro de custo, Mês, Status; total = custo) — idem
- [x] Gestão de Documentos (Tipo, Disciplina, Obra, Autor, Extensão, Status, Emissão; aba Normas + Órgão e Situação) via props opcionais do `DocumentsTable`; testes do Portal do Parceiro verdes; Shift+clique provado nas duas direções
- [x] Ofícios — Ofícios (Destinatário, Modelo, Situação, Resposta até), Recebidos (Remetente, Situação, Recebido em, Responder até), Modelos (Categoria, Departamento, Status) — testes
- [x] guia §6.12
- [x] conferência visual — preview local, login de leitura, dados reais: 8 tabelas; colSpan = células da linha em todas; botão "recolher todos" desligado sem agrupar; recolher/expandir todos ok; 0 escritas, 0 erros. Ofícios sem registros para o usuário de leitura → coberto só por teste. Script `c:/tmp/pwtest/cadastros-agrupar.js`
- [ ] publicado e conferido

## Observado nos dados (fora do escopo)
- Ativos Patrimoniais: "Valor aquisição" está R$ 0,00 em todos os bens visíveis ao usuário de leitura — os totais do grupo saem R$ 0,00 por isso.
- A célula Status de Ativos mostra o código cru ("disponivel") ao lado de "Em Obra"; o grupo repete o que a célula mostra.

## Verificação
1. Testes de tela de cada item + `agruparLinhas.test.ts`.
2. `bash scripts/check-ui-standard.sh` em cada arquivo tocado.
3. Playwright com o usuário de leitura: cada tela, cada aba, Agrupar › opções, recolher, recolher/expandir todos.
