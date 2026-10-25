# Contrato: mostrar a organização e permitir mover

## Pedido original

Sessão `860b2eff`, 24–25/10/2026. Contexto: a gaveta "Selecionar Centro de Custo"
do contrato **CTS-010-036-0002** mostrava um único centro de custo.

> contrato CTS-010-036-0002, so esta disponivel 1 centro de custo. por que?

Resposta: o contrato pertence à organização Condomínio Galeria Altavista, que tem
um centro de custo só; os outros "Altavista" (008, 014, 030) são da Alpa.

> Aonde esta mostrando que o O contrato CTS-010-036-0002 pertence à organização Condomínio Galeria Altavista?

Resposta: só na linha cinza "Mostrando centros de custo de: …" sob o campo (PR
#134); o cabeçalho do contrato e o formulário não mostram a organização.

> mostrar e permitir mover

Pergunta feita: *quando o contrato pode ser movido?* — com o aviso de que o
CTS-010-036-0002 tem 73 títulos, 45 pagos e conciliados no extrato do condomínio.
Opções: só sem títulos (recomendada) · sem títulos pagos · sempre, levando tudo.

> **Sempre, levando tudo**

Depois de publicado (#164): o campo nasceu no cabeçalho do contrato (linha
"Organização: X · Mover" ao lado do número). Print da aba Resumo, card
"Identificação do Contrato", com o campo pedido ao lado de "Número do
Contrato" e "Título / Objeto":

> nao é o local adequado. [...] mover para dentro do card Identificação do
> Contrato

## Decisões

1. **Mover é uma RPC no banco, tudo ou nada** (`mover_contrato_organizacao`).
   São dezenas de linhas em ~20 tabelas; feito pelo client, uma falha no meio
   deixaria o contrato numa org e metade dos títulos na outra.
2. **Quem move:** gestor (owner/admin, `is_org_manager`) da organização de
   ORIGEM e da de DESTINO. É a mesma régua de quem gerencia a organização.
3. **O que vai junto** (`organization_id` passa a ser o destino):
   - o contrato;
   - todos os títulos (`internal_transactions.contract_id`), inclusive pagos e
     conciliados — escolha do usuário;
   - os processos de aprovação do contrato e dos títulos (`process_instances`);
   - as tabelas filhas com `organization_id`: aceites, aditivos, requisitos e
     versões de documento, avaliações, garantias, interfaces, questionários
     trabalhistas, histórico de número, penalidades, condições precedentes,
     liberações de retenção, riscos, matriz de fornecimento, responsabilidades
     técnicas, documentos gerados (`doc_gen_documentos`, `opura_documents`) e
     ordens de serviço do cliente.
   - Itens, medições e contas de consumo não têm `organization_id` — seguem o
     contrato pela FK. Os arquivos no Storage ficam em pasta por contrato, não
     por organização: não se movem.
4. **Cadastros da organização antiga não vão junto** (mesma regra do Boleto,
   `project_boleto_org_e_do_registro_campo_para_mover`): obra, empresa,
   empreendimento, orçamento e imóvel são zerados. Centro de custo e plano de
   contas **são escolhidos no próprio diálogo**, entre os do destino, e aplicados
   ao contrato e a todos os títulos — escolher o centro de custo certo é o motivo
   de mover. Categoria financeira só é zerada se for de outra organização (as
   categorias-padrão do sistema têm `organization_id` nulo e valem em todas).
5. **Fornecedor e cliente continuam.** Se não forem da organização de destino,
   são compartilhados com ela (`supplier_org_shares` / `client_org_shares`) — o
   mecanismo que já existe para cadastro que "atende também" outra org. Zerar o
   fornecedor de um contrato de suprimento apagaria o principal dado dele.
6. **Conta financeira:** os títulos já pagos ou conciliados mantêm a conta de onde
   o dinheiro saiu (é fato histórico; o vínculo com o extrato em
   `reconciliation_matches` não tem organização e continua). Os em aberto e o
   próprio contrato perdem a conta — a do destino é escolhida depois.
7. **Recibos já emitidos ficam na organização que os emitiu.** O número do
   recibo é único por organização (`financial_receipts_numero_key`); levar o
   recibo nº N para uma org que já tem o nº N falharia, e o documento foi emitido
   em nome da organização antiga.
8. **Travas que continuam valendo**, com a mensagem do banco na tela:
   - competência fechada em Contas a Pagar (`fn_payable_bloqueia_competencia_fechada`);
   - número de contrato já existente no destino (UNIQUE por organização e direção).
9. **Auditoria:** cada movimento grava uma linha em `contract_organization_moves`
   (origem, destino, quem, quando, contagens).
10. **Onde aparece:** no card "Identificação do Contrato" (aba Resumo), ao lado de
    Número do Contrato e Título/Objeto — não no cabeçalho da tela (revisto depois
    do #164: o usuário apontou que o cabeçalho não era o lugar certo). O campo
    "Organização" e o botão "Mover" moram dentro do `ContractModal` (seção
    `identificacao`, condicionados a `onMoverOrganizacao`, prop só ligada pelo
    `ContractDetailView` na instância do Resumo — os outros chamadores do
    `ContractModal`, como o drawer de criação/edição e Garantia, não ganham o
    campo). O diálogo mostra antes de confirmar o que vai junto (prévia por RPC
    `previa_mover_contrato_organizacao`), com aviso explícito quando há títulos
    conciliados.

## Itens

| # | O que muda | Como sei que terminou |
|---|---|---|
| 1 | Migration `aplicar_…_contrato_mover_organizacao.sql`: tabela de auditoria com RLS, RPCs de prévia e de mover, REVOKE/GRANT | Aplicada; `segurancaMigrations.test.ts` verde; ACL das 2 funções sem `anon`/PUBLIC |
| 2 | Teste da RPC no banco numa transação desfeita: contrato de teste com título, documento e fornecedor de outra org | Contagens antes/depois batem; fornecedor compartilhado; títulos com CC/plano novos; ROLLBACK |
| 3 | `contractService.previaMoverOrganizacao` / `moverParaOrganizacao` | Teste unitário do service (chama a RPC com os parâmetros certos, propaga a mensagem de erro) |
| 4 | Diálogo `MoverContratoOrganizacaoDialog` (destino, centro de custo e plano de contas do destino, prévia, confirmar) | Teste de componente: sem destino o botão fica desligado com o motivo; com conciliados, mostra o aviso |
| 5 | Campo "Organização" + botão "Mover" no card Identificação (`ContractModal`, ligado só pelo Resumo do `ContractDetailView`); após mover, recarrega e remonta os formulários embutidos | `tsc`/testes verdes; pendente conferência na tela de verdade (navegador) |
| 6 | `check-ui-standard.sh` nos .tsx alterados; `orgContextGuard` | Ambos verdes |

## Andamento

- 25/10/2026 — plano criado.
- Item 1 ✅ — migration aplicada no remoto (`db query -f`); `segurancaMigrations` e
  `migrationsPrefixo` verdes.
- Item 2 ✅ — teste no remoto com o próprio CTS-010-036-0002 → Alpa (CC 014), numa
  transação desfeita: contrato e 73 títulos na Alpa com o CC 014; 45 pagos mantêm a
  conta, 28 em aberto sem conta; 11 filhos movidos; 2 recibos ficaram no condomínio;
  fornecedor compartilhado com a Alpa; 1 linha de auditoria.
  **Achado:** os 38 processos de aprovação dos títulos JÁ estavam na Alpa. O contrato
  nasceu na Alpa e foi levado ao condomínio em 21/10 pela migration
  `condominio_010_executa` (organização própria do Condomínio Galeria Altavista), que
  não levou os `process_instances`.
- Item 3 ✅ — `__tests__/contratoMoverOrganizacao.test.ts` (8 casos).
- Item 4 ✅ — `__tests__/components/MoverContratoOrganizacaoModal.test.tsx` (3 casos).
- Item 5 — código pronto (cabeçalho "Organização: X · Mover"; formulários embutidos
  remontam por `key` da organização). Falta a conferência na tela de verdade.
- Item 6 ✅ — `check-ui-standard.sh` sem violação nos dois .tsx; `orgContextGuard` verde.
- 25/10/2026, depois do #164 — pedido: tirar o campo do cabeçalho e colocá-lo dentro
  do card "Identificação do Contrato". Movido: `ContractModal` ganhou a prop
  `onMoverOrganizacao?` e, com ela, um campo "Organização" (nome + Mover) na seção
  `identificacao`, ao lado de Número do Contrato; o `ContractDetailView` só liga a
  prop na instância do Resumo e não monta mais nada no cabeçalho. `tsc` e as 27
  suítes relacionadas (`ContractModalOrganizacao`, `contratoMoverOrganizacao`,
  `MoverContratoOrganizacaoModal`, `orgContextGuard`) verdes; `check-ui-standard.sh`
  sem violação nos dois arquivos. Não consegui logar no app local para conferir
  visualmente (sem credencial) — ficou pendente para o usuário confirmar depois do
  deploy.
