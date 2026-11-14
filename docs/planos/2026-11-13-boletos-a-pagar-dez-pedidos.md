# Boletos a Pagar — dez pedidos de 13/11/2026

## Pedido original

Sessão de 13/11/2026 (Claude Code, VS Code), literal:

> financeiro > Boletos a pagar:
> 1. Buscas por período: automático
> 2. Poder alterar organização ao editar em lote.
> 3. Não cadastra multa de transito em lote
> 4. Na captura os botoes aparecem embaixo Mover Botão salvar
> 5. Na captura não aparece credor
> 6. Tenho que salvar para renomear
> 7. Assas boletos com data futura entra como agendado nao consigo escolher data para pagamento.
> 8. Assas boleto cancelados tem que entrar na conta enviar sms
> 9. Criar coluna organização
> 10. Ao excluir um boleto o app esta cancelando. São duas coisas diferentes. Uma é cancelar boleto e deve permanecer no sistema como histórico. Outra coisa e excluir, e deve ser removido do app. Exemplo boletos que não faz parte de alguma obra ou pdf errado etc.

Itens 7 e 8 já estão na PR #400 (`docs/planos/2026-11-13-asaas-boleto-data-e-cancelamento.md`,
branch `feat/asaas-boleto-data-cancelamento`) — não se repetem aqui.

### Pedido de 14/11/2026 (depois da publicação da #406), literal

> 1. Não vi o campo para ajustar hora
> 6. Renomear: o botão agora salva e renomeia de uma vez. OK, porem o campo com o código foi ocultado. Manter exibição
> 8. Coluna Organização: nova coluna na tabela, ordenável e com filtro avançado. Incluir organizacao no filtro Grupo

Item 6 esclarecido pelo usuário (pergunta com opções): o campo é o **nome do documento (código da
Nomenclatura)**. Medido: o #1502, capturado às 04:04 com fornecedor, ficou "1.pdf" — a org não tem
máscara de Boletos SALVA (o automático só renomeia com ela) e a CAPTURA nunca mostrou o nome nem o
Renomear.

## O que foi medido (13/11/2026)

- **10 — excluir vira "cancelado"**: o banco apaga de verdade (`boletoService.excluir` faz
  `DELETE`; nenhum gatilho/regra em `boletos`, `internal_transactions` ou `invoices` converte
  exclusão em cancelamento). O defeito é da TELA: o Excluir do formulário avisava a lista com
  `onSaved({ ...boleto, status: 'cancelado' })` ("sinal de atualização") — a lista local trocava a
  linha por uma "Cancelado" que já não existia no banco. Recarregar a página fazia sumir.
  (O cancelado de hoje, 22:35, #8.300,00 de 2016, veio da Edição em Lote › Mudar status — caminho
  legítimo de cancelar.)
- **3 — multa de trânsito em lote**: as 4 multas de hoje (`ordemPagamentoInfracao_*.pdf`, linha de
  arrecadação de 48 dígitos) entraram UMA A UMA, com 3 a 7 min de intervalo — a extração delas
  funciona (é a mesma função da captura individual). O lote tem dois defeitos de fluxo:
  (a) o seletor de organização do lote não tem opção vazia: com o topo em "Todas", ele MOSTRA a
  1ª organização mas o estado é `''`, e a fila só anda com organização (`if (!organizationId)
  return`) — os PDFs ficam "Aguardando na fila…" para sempre, sem aviso (REGRA #5: mostrava uma
  organização que não era a usada); (b) o lote descarta imagem calado (só aceita PDF), enquanto a
  captura individual aceita PDF e imagem.
- **4/5 — captura**: no modo captura (arquivo escolhido, boleto ainda não salvo) o cabeçalho não
  tem botão nenhum; "Trocar arquivo / Salvar rascunho / Salvar e fechar" ficam no fim da coluna
  direita. E a captura não tem o campo Fornecedor (credor): só mostra o Beneficiário lido do PDF,
  só-leitura — o fornecedor só aparecia depois de salvar.
- **6 — renomear**: o Renomear usa o fornecedor/obra SALVOS; com fornecedor trocado na tela, o
  usuário precisava Salvar antes (o próprio diálogo dizia "salve o boleto antes").
- **2 — organização na Edição em Lote**: só existe no formulário de 1 boleto
  (`moverParaOrganizacao`, só rascunho/revisão — decisão de 24/09/2026: aprovado já tem título na
  org dele).
- **9 — coluna Organização**: não existe; com o topo em "Todas" não dá para saber de qual
  organização é cada boleto.
- **1 — Buscas por período "automático"**: as buscas funcionam (todas concluídas). O padrão no
  banco: o usuário cria à mão "últimos 30 dias" de tempos em tempos (26/10, 29/10, 12/11).
  **Decisão do usuário (13/11/2026, pergunta com 4 opções): "Os dois"** — remetente novo dispara a
  busca dele, e uma varredura diária agendada.

## Decisões de desenho

1. **Excluir ≠ Cancelar** (10): o formulário ganha `onExcluido(id)`; a lista REMOVE a linha (§22).
   Cancelar segue o caminho próprio (motivo, histórico). A distinção já existia no serviço.
2. **Renomear salva antes** (6): o botão grava os campos da tela e então renomeia. Se o salvamento
   já renomeou sozinho (1ª vez, máscara salva), não renomeia de novo — gastaria outro número.
3. **Captura com ações no título** (4): mesma variante da §25 do guia ("ações na linha do título",
   SupplierForm 28/10): "Trocar arquivo · Salvar rascunho · Salvar e fechar" sobem para a linha do
   título, à direita, e saem do rodapé.
4. **Fornecedor na captura** (5): seção "Quem recebe" com o MESMO campo da edição (drawer + "Novo"
   com cadastro rápido), já sugerido pelo CNPJ lido (mesma RPC `find_supplier_in_org_by_document`,
   recortada pela organização). Grava no `associar` que a captura já faz.
5. **Organização em lote** (2): ação própria na Edição em Lote (como "Mudar status"), porque limpa
   fornecedor/obra/CC/plano/conta (são cadastro da org antiga). Mesma regra do boleto individual:
   só rascunho/revisão mudam; cada um dos outros diz por que fica.
6. **Lote de importação** (3): seletor com "— Selecione a organização —" (organizações graváveis),
   a fila diz "Escolha a organização para começar" em vez de "Aguardando", e aceita PDF e imagem.
8. **Buscas automáticas** (1): (a) remetente NOVO e ativo → `buscarDoRemetenteNovo` (últimos 30
   dias, só ele), sem esperar — a janela fecha e a tela diz que está buscando; se a caixa já tem
   busca, avisa que a varredura diária traz. (b) varredura diária: função SQL
   `fn_email_capture_busca_diaria` (só o agendador executa) cria às 03:00 de Brasília uma busca
   `pendente` de 30 dias em cada caixa ativa sem busca rodando; quem processa é o ciclo de 15 min
   que já existe — nenhuma Edge Function nova nem deploy de função.
7. **Coluna Organização** (9): nome da organização dona do boleto; ordenável; com campo no filtro
   avançado (o teste do filtro exige um campo por coluna).

## Itens

| # | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| 10 | `BoletoFormModal` → `onExcluido`; `BoletoManager` remove a linha | teste de fonte (Excluir não manda `status: 'cancelado'`); tsc | ✅ teste + tsc 0 |
| 6 | Renomear grava os campos e depois renomeia | tsc; check-ui | ✅ tsc 0; ui exit 0 |
| 4 | Captura: botões na linha do título | check-ui; tela | ✅ ui exit 0; ⚠️ tela não conferida (Chrome não alcança o servidor local) |
| 5 | Captura: Fornecedor (sugerido pelo CNPJ) + "Novo" | tsc; tela | ✅ tsc 0; ⚠️ tela não conferida |
| 2 | Edição em Lote › Mudar organização (`utils/boletoOrganizacaoLote.ts` puro + teste) | teste verde; tsc | ✅ 2 testes; tsc 0 |
| 3 | Lote de importação: org vazia explícita, aviso, PDF+imagem | tsc; check-ui | ✅ teste + ui exit 0 |
| 9 | Coluna Organização + filtro avançado | teste do filtro verde; tsc | ✅ 7/7; tsc 0 |
| 1 | Remetente novo busca sozinho + varredura diária (`aplicar_20271113100000_email_capture_busca_diaria.sql`) | testes verdes; migration aplicada; job no `cron.job` | ✅ testes 4+6, tsc 0; ⏳ migration aplicada no merge |
| — | PR, CI, merge, conferir-producao | CI verde; SHA no domínio | ✅ #406 → 333efbe no ar (14/11) |
| 1b | Hora da varredura por caixa (`busca_diaria_hora`, padrão 03:00, "Desligada"); cron de hora em hora; painel "Varredura diária" na aba Buscas por período | teste da migration; tsc; ui | ✅ testes, tsc 0, ui 0; ⏳ migration no merge |
| 6b | Captura: seção Documento (nome atual + Renomear que salva e renomeia) | tsc; ui | ✅ tsc 0, ui 0 |
| 9b | Agrupar por Organização | teste de `agruparBoletos` | ✅ |
