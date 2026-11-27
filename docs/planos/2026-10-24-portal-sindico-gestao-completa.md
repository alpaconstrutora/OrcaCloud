# Portal do Síndico — gestão completa do condomínio pelo portal

## Pedido original

Sessão de 24/10/2026 (tarde), transcrito literalmente, depois do PR #138 (um condomínio por vez):

```
olha o portal do sindico? ele continua de maos atadas, não consegue verencial nada. é so visualizacao.
voce entendeu quando te disse que o sindico é o gerenciador / executor do condominio e ele precisa de total acesso para edicao?
```

```
ele nao vai entrar no app
ele vai gerenciar a partir do portal
preste atencao: o sindico nao faz parte da construtora, e nao vai entrar no app.
ele vai ter acesso ao que ele precisa para gerenciar o condominio apartir do portal do sindico. Me responda se voce entendeu isso
```

Confirmado pelo usuário ("sim"): migrar o 007 para organização própria e montar este plano.

## Decisões

| Pergunta | Resposta |
|---|---|
| Onde o síndico opera | **Só no Portal do Síndico.** Ele não é da construtora, não entra no app, não vira membro de organização. A F2 de `2026-10-21-sindico-operador-org-condominio.md` está descartada. |
| 007 só leitura | Migrado para organização própria em 24/10 (F3 daquele plano). O síndico não é membro dela; ela só separa os dados para o portal gravar. |

## Regras que toda fase segue (herdadas do Financeiro, PR #129)

- Escrita só por RPC `sindico_portal_*` SECURITY DEFINER, começando por `fn_sindico_resolver(…, 'escrever')`
  (exige LOGIN: e-mail do JWT = `clients.email`; link encaminhado não grava) e pelo mandato
  (`fn_sindico_predios`). REVOKE de PUBLIC/anon, GRANT só `authenticated` (REGRA #7).
- Grava na `fn_org_do_condominio(emp)`; recusa condomínio sem `condominio_org_id`.
- Autoria registrada (`…_por_sindico_client_id`) e evento em log; trava de mês fechado chamada À MÃO
  (`fn_period_is_closed` — o gatilho não vale dentro de SECURITY DEFINER).
- Arquivo em bucket privado: Edge Function autoriza; caminho nunca vai no payload.
- Botão desligado sempre diz o motivo; prévia do admin e acesso por link = só leitura.
- Tela em `components/sindico/*`, vocabulário do portal (guia §24).

## O que o portal já faz (24/10)

| Área | Portal hoje |
|---|---|
| Contas a pagar | lançar (parcelas, anexo), pagar (baixa), editar, cancelar, cadastrar fornecedor |
| Avisos | publicar, encerrar os próprios |
| Chamados | responder, mudar situação |
| Rateio | aprovar / devolver |
| Unidades, Documentos, Manutenção, Equipamentos, Contas a receber, Prestação | **só leitura** |

## O que falta — por fase (ordem proposta; o usuário decide)

Cada fase: migration com RPCs (+ prova em bloco desfeito), service, tela, testes, Playwright logado
(harness temporário), PR + CI + publicação. Referência do que o admin já faz entre parênteses.

### G1 — Ciclo mensal: rateio e cobrança das cotas
(`FinanceiroTab`: `condominioRateioService.salvar/vincular/desvincular/previa/fechar/cancelar`,
`condominioCobrancaService.previa/gerarRecebiveis/emitir`)
- Montar o rateio da competência: escolher despesas, critério, prévia por unidade.
- Fechar o rateio e gerar as cotas (recebíveis por unidade).
- Emitir cobrança (boleto/PIX) — **depende de G2** (conta do condomínio + Asaas próprio).
- Pronto quando: síndico logado fecha um rateio do 010 e as cotas aparecem em Contas a receber.

### G2 — Conta bancária, recebimentos e conciliação
- Hoje as orgs do 010 e do 007 têm **0 contas** (`payment_accounts`) e **0 plano de contas**.
- Cadastrar a conta do condomínio (CNPJ dele); Asaas próprio com chave **fornecida pelo usuário**
  (F4 do plano de 21/10).
- Contas a receber: baixar cota recebida, lançar receita avulsa, estornar.
- Conciliação do extrato da conta do condomínio.
- Pronto quando: cota baixada pelo síndico some da inadimplência; extrato importado concilia.

### G3 — Fornecedores e contratos recorrentes
- Editar fornecedor (dados, conta/PIX), contrato recorrente (elevador, limpeza, energia) gerando
  as parcelas como o admin faz.
- Pronto quando: contrato criado pelo síndico gera as parcelas em Contas a pagar.

### G4 — Manutenção e equipamentos
(`ManutencaoTab`: planos, itens, ordens, concluir; `AtivosTab`: criar, editar, lote, remover)
- Pronto quando: síndico abre e conclui OS, cadastra equipamento com marca/modelo.

### G5 — Documentos
(`DocumentosTab`: enviar, visibilidade no portal do morador, remover)
- Pronto quando: documento enviado pelo síndico aparece para o morador se marcado visível.

### G6 — Moradores (ocupações) e acesso ao Portal do Condômino
(`OcupacoesTab`: cadastrar, encerrar, importar planilha, conceder acesso)
- Pronto quando: síndico cadastra um morador e envia o acesso ao Portal do Condômino.

### G7 — Ficha do condomínio
(`condominio_salvar_ficha`: CNPJ, razão social, multa/juros)
- Pronto quando: multa/juros alterados pelo síndico entram na próxima cobrança.

## G1 — desenho (24/10)

Decisão do usuário: começar pela G1. A lógica do admin roda no NAVEGADOR
(`condominioRateioService.previa/salvar/fechar`, `condominioCobrancaService.previa/gerarRecebiveis`,
gravando direto com a RLS de membro). O síndico não é membro → tudo vira função no banco, com o
servidor RECALCULANDO (nunca grava valor vindo do navegador).

Migration `aplicar_20271024910000_portal_sindico_rateio.sql`:
1. `fn_rateio_calcular(emp, competencia, criterio, pagador, grupo, valor_fixo)` — porta fiel de
   `previa`: despesas DEBIT dos CCs do condomínio por `transaction_date` na competência, fora as já
   em rateio vivo; unidades na ordem do admin (torre `sort_order, created_at`; unidade `floor,
   sort_order`); peso por critério; "maior resto" em centavos; avisos iguais aos do admin.
   Interna (sem EXECUTE para ninguém). **Pronto quando:** recalculada para os rateios já salvos do
   007 (07/2026) e do 010 (08/2026), dá os mesmos valores por unidade.
2. `sindico_portal_rateio_previa` (ler) · `…_salvar` (rascunho; recalcula; descrição podada que o
   portal mostra, só para ids da própria prévia) · `…_fechar` (congela descrições, numera pela
   `fn_generate_document_number` com EMPREENDIMENTO/CENTRO_CUSTO/ORGANIZACAO como o admin; quem
   fecha é o síndico, então a aprovação exigida é dele mesmo — grava APROVADO + assinatura +
   `condominio_rateio_decisoes` antes de mudar o status) · `…_cancelar` (rascunho, ou fechado SEM
   cota gerada; motivo obrigatório) · `…_gerar_cotas` (porta de `gerarRecebiveis`: mesmos bloqueios,
   `reference_id` `{item}-p{venc}`, trava de mês fechado à mão). Escrita: `fn_sindico_operar` +
   mandato + `fn_sindico_motivo_nao_opera`. REVOKE PUBLIC/anon; GRANT authenticated (prévia também anon,
   como a leitura do portal).
3. `condominio_rateios.criado_por_sindico_client_id`; `sindico_financeiro_eventos.rateio_id` e as
   ações RATEIO_* no CHECK.
   **Pronto quando:** prova em bloco desfeito com o síndico do 010 (JWT simulado): salvar → fechar →
   gerar cotas → contagens/valores conferidos → nada fica.

Portal (`components/sindico/`): Prestação de contas ganha "Novo rateio" (painel lateral: competência,
tipo, critério, de quem cobrar, grupo/valor fixo, prévia de despesas e cotas) e, em cada rateio,
Fechar · Cancelar · Gerar cotas (vencimento), com motivo no botão desligado. Regras puras em
`utils/rateioDoSindico.ts` com teste. **Pronto quando:** Playwright logado (harness temporário,
escrita interceptada) faz o ciclo no 010; celular sem rolagem lateral; tsc 0; UI limpa.

Fora da G1: emitir boleto/PIX (Asaas do condomínio) → G2.

## Estado

- [x] 007 com organização própria (24/10) — ver plano de 21/10, F3.
- [x] PR #138: Financeiro um condomínio por vez.
- [x] Ordem: começar pela G1 (usuário, 24/10).
- [x] G1 — 4 de 4:
  - [x] Cálculo no banco (`fn_rateio_calcular`). Paridade com os 7 rateios gravados: 5 batem
    centavo a centavo; os 2 do 010 cancelados diferem SÓ porque 9 despesas deles foram apagadas
    depois (R$ 488,84 = a diferença exata); a distribuição por área privativa do banco é idêntica
    à `distribuir` do admin com os mesmos pesos e total (teste temporário, apagado).
  - [x] RPCs + migration `aplicar_20271024910000` APLICADA (24/10). Achado na prova:
    `fn_next_document_seq` exige MEMBRO da org → o síndico não numera; criada
    `fn_sindico_numero_documento` (mesma conta, sem a checagem; interna). Prova em bloco desfeito
    com o login do síndico simulado (010, 09/2026): pelo link prévia ok e salvar recusado; logado
    salva (12 cotas = R$ 987,96, org do condomínio, autoria), recusa duplicado/cancelar sem
    motivo/fechar 2×, fecha com a aprovação dele e número CTC-010-0002 (série do admin), gera 10
    recebíveis (R$ 823,30; 2 bloqueados com o motivo), não duplica, recusa cancelar com cota
    gerada; FIXO por proprietário e cancelar rascunho ok; nada ficou. ACL: internas sem EXECUTE;
    escrita só `authenticated`; prévia/cotas também `anon` (como a leitura do portal).
  - [x] Tela: `PainelRateiosDoSindico` (substitui `PainelAprovacaoDoSindico`, apagado — "Aprovar"
    virou "Fechar", que grava a aprovação; "Devolver" fica quando o condomínio exige aprovação),
    `NovoRateioSheet`, regras em `utils/rateioDoSindico.ts` (7 testes), `SindicoPortal.test` 10/10.
    Playwright logado (harness temporário, apagado; leituras reais do 010, escritas interceptadas):
    desktop e celular 390px, prévia 12 cotas = R$ 987,96, salvar e fechar chegam às RPCs certas,
    0 erro, sem rolagem lateral. **Os prints acharam 2 defeitos, corrigidos:** coluna "Cota"
    cortada no painel (tabela → lista); no celular a barra inferior do portal (z-50) cobria o
    rodapé de TODO painel lateral — "Salvar" sumia (barra → z-40). tsc 0; UI limpa.
  - [x] PR + CI + publicação — PR #148, `ci` verde; squash `8574c4e` (24/10/2026); `conferir-producao.sh "Rateios do condomínio"` ✅.
    ⚠️ A CI de `main` em `8574c4e` ficou vermelha por colisão de prefixo com #147 (outra sessão) — corrigida no #151.
- ⚠️ **O síndico do 010/007 (altair.rosa@gmail.com) NÃO tem login** (nenhum usuário com esse e-mail
  em 24/10): pelo link ele só lê. Tudo que grava (lançar, pagar, rateio) exige entrar com e-mail e
  senha — falta ele criar o acesso.
- [ ] G2 — dividida em três (24/10, ao começar): **G2a** conta + recebimentos · **G2b** conciliação do extrato ·
  **G2c** boleto/PIX pelo Asaas (precisa da chave da conta no CNPJ do condomínio, a fornecer pelo usuário).
  - [x] G2a — 4 de 4:
    - [x] Migration `aplicar_20271024920000_portal_sindico_contas_recebimentos` APLICADA (24/10):
      `sindico_portal_contas` (ler) · `…_salvar_conta` (banco/caixa; gateway recusado; nunca apaga, desativa) ·
      `…_receber_titulo` · `…_desfazer_baixa` (pagar ou receber; motivo obrigatório; recusa a casada com o extrato
      em `reconciliation_matches` e a do Asaas; mês fechado à mão) · `…_lancar_receber` (receita avulsa; pagador =
      ocupante do condomínio ou nome livre) · `sindico_portal_financeiro` + `conciliadoExtrato` por título.
      **Defeito do #129 achado na prova e corrigido:** `fn_orgs_atendidas_pela_conta` devolve VAZIO para quem não é
      membro (o síndico nunca é) → a lista de contas do formulário vinha vazia e toda baixa COM conta era recusada.
      Novo `fn_sindico_conta_atende` (interno) em `sindico_portal_financeiro`, `fn_sindico_validar_linha`,
      `sindico_portal_baixar_titulo` e o receber (corpos copiados do banco, uma troca cada).
      Prova em bloco desfeito com o login do síndico simulado (010): pelo link lê e não grava; conta criada na org do
      condomínio (cód 001, matriz), editada, a da Alpa recusada; receita p/ não ocupante e sem pagador recusadas;
      receita lançada; receber COM a conta nova ok, 2× recusado, título a pagar recusado; **pagar com a conta nova ok**
      e ela aparece na lista do formulário; desfazer sem motivo/em aberto recusados, desfazer ok, conciliado com
      extrato recusado com o motivo; 34 títulos com o campo novo; nada ficou. ACL: escrita só `authenticated`;
      leitura de contas também `anon`; internas sem EXECUTE.
    - [x] Tela: sub-aba **Contas bancárias** (`PainelContasDoSindico`: nova, editar, desativar/reativar; a do Asaas
      diz por que não edita) · Contas a receber com **Receber** / **Desfazer** e **Lançar receita**
      (`LancarReceitaSheet`, conta financeira só de RECEITA) · Contas a pagar com **Desfazer** no lugar de "Pagar"
      quando já pago · `BaixaDoTituloSheet` pelo sentido do título + `DesfazerBaixaSheet`. Regras em
      `utils/financeiroDoSindico.ts` (`motivoNaoRecebe`, `motivoNaoDesfazBaixa`, `motivoNaoSalvaConta`, 14 testes);
      `SindicoPortal.test` 12/12 (8b receber/desfazer, 8c contas). tsc 0; UI limpa nos 5 arquivos.
    - [x] Playwright logado (harness temporário, apagado; leituras reais do 010, escritas interceptadas), desktop e
      390px: conta cadastrada chega à RPC com os campos; "Quem paga" lista os 8 ocupantes com as unidades; botão
      desligado diz o que falta; 0 erro; sem rolagem lateral. O print achou "Quem paga" cortado (meia largura) →
      largura toda.
    - [x] PR + CI + publicação — PR #153, `ci` verde; squash `c6a211a`; CI de `main` no squash verde;
      `conferir-producao.sh "Contas bancárias"` ✅ (domínio em `baaadb1`, que contém `c6a211a`).
  - [ ] G2b — conciliação do extrato pelo portal (usuário: "sim", 25/10). Desenho:
    - O admin lê o arquivo, tira duplicados e casa NO NAVEGADOR, com a RLS de membro. As funções de casar /
      desfazer / ignorar (`fn_reconcile_match/_unmatch/_ignore/_unignore`) são SECURITY INVOKER sem checagem
      própria → o portal as chama POR DENTRO de RPCs `sindico_portal_extrato_*` que autorizam o síndico (login +
      mandato + org própria) e conferem que extrato e título são da org do condomínio. Mesma lógica do admin
      (título conciliado com a conta real, boleto pago, auditoria), sem duplicar.
    - Importar: o arquivo é lido no navegador do síndico (`parseStatementFile`, o mesmo do admin, puro); o banco
      RECALCULA sentido, valor, ordinal e `fingerprint` (sha256 do mesmo texto canônico) e a duplicidade entre
      formatos (`separarGemeasDeOutroFormato`, um arquivo por vez); trava de mês fechado À MÃO (o gatilho
      `trg_block_period_bank_tx` não vale em SECURITY DEFINER); exige saldo inicial na 1ª importação (regra do
      admin); registra em `bank_statement_imports`.
    - Sugestões: candidatos do condomínio no mesmo sentido, sem vínculo, por diferença de valor e de data — não o
      motor inteiro do admin (o condomínio tem pouco volume e nenhuma regra).
    - Valor diferente (juros/multa): só com a categoria do ajuste (o `p_adjustment_category` do admin cria o título
      da diferença já conciliado). Linha sem título (tarifa): "Lançar e conciliar".
    **Pronto quando:** prova em bloco desfeito com o login simulado importa, recusa a reimportação, casa, desfaz,
    ignora/restaura e lança-e-concilia na conta do 010; Playwright logado faz o ciclo; tsc 0; UI limpa.
    - [x] Migration `aplicar_20271025100000_portal_sindico_extrato` APLICADA (25/10): `sindico_portal_extrato` (ler) ·
      `_importar` · `_candidatos` (ler) · `_conciliar` · `_desfazer` · `_ignorar` (e restaurar) · `_lancar`; internas
      `fn_sindico_condominio_da_conta`, `fn_sindico_titulo_conciliavel`, `fn_sindico_movimento` sem EXECUTE.
      Prova em bloco desfeito (login simulado, conta criada no 010): importar sem saldo inicial e pelo link recusados;
      3 inseridas; reimportar = 0 (3 já existiam); a mesma tarifa em outro formato = 0 (1 "outro formato");
      fingerprint de 64 hex, status NORMALIZED, org do condomínio; candidatos: o título certo em 1º, exato;
      conciliar com sentido diferente / valor diferente sem ajuste / 2× recusados; conciliar ok (título CONCILIATED com
      a data e a conta do banco; movimento MATCHED); desfazer ok; ignorar sem motivo recusado, ignorar/restaurar ok;
      lançar a tarifa = título PAGO já conciliado com valor/data DO EXTRATO (o `amount` mandado foi ignorado);
      auditoria do admin MATCH/UNMATCH/IGNORE/UNIGNORE/MATCH; nada ficou. Achado: a tabela temporária da importação
      sobrevivia a duas chamadas na mesma transação → `DROP TABLE IF EXISTS` antes.
    - [x] Tela: sub-aba **Extrato e conciliação** (`PainelExtratoDoSindico`): conta, importar (arquivo lido no
      navegador pelo `parseStatementFile` do admin; recusa OFX de outra conta), faixa entradas/saídas/conciliados/a
      conciliar, tabela com Conciliar / Desfazer / Ignorar / Restaurar; painel Conciliar (candidatos com o exato
      pré-marcado, busca, ajuste da diferença pela conta financeira) e "Lançar e conciliar". Regras em
      `utils/extratoDoSindico.ts` (6 testes; o teste pegou o resumo tirando o ignorado da soma de saídas — a soma tem
      de bater com o banco); `SindicoPortal.test` 13/13 (8d). tsc 0; UI limpa.
    - [x] Playwright logado (harness temporário, apagado; conta/extrato/candidatos de EXEMPLO pela interceptação, porque o
      condomínio ainda não tem conta; escritas capturadas), desktop e 390px: OFX lido no navegador chega à RPC com
      conta/saldo/período/linhas; exato pré-marcado; conciliar chega com os ids; 0 erro; sem rolagem lateral.
      **O print achou:** com 6 sub-abas, "Resumo" e "Contas a pagar" sumiam no desktop → abas e seletores empilhados até 2xl.
    - [x] PR + CI + publicação — PR #156, `ci` verde; squash `a4ca532`; CI de `main` no squash verde;
      `conferir-producao.sh "Extrato e conciliação"` ✅.
  - [ ] G2c
- [x] **Administradora opera pelo portal** (fora da ordem, pedido de 25/10/2026, transcrito literalmente):
  ```
  nao faz o menor sentido bloquear o portal do condominio na visão do app. Deve ter a mesma funcionalidade da visão do sindico.
  ```
  Antes, Portais › Portal do Condomínio › "Ver como o síndico" era prévia SÓ DE LEITURA (o resolver aceitava membro só
  no modo 'ler'). Desenho:
  - Banco: modo novo `'operar'` em `fn_sindico_resolver` (o de `fn_sindico_operar`): síndico logado OU, sem token,
    membro da org de um dos prédios dele; `'escrever'` (avisos/chamados) idem; `'sessao'` (aprovar/devolver rateio)
    continua só do síndico. Recorte POR CONDOMÍNIO em `fn_sindico_motivo_nao_opera` (toda RPC de escrita já chama) via
    `fn_sindico_recusa_operador`. Autoria: `como` + `nome` = "Fulano (administradora)" no histórico, coluna
    `sindico_financeiro_eventos.operado_por_user_id`, e as marcas "lançado pelo síndico" só quando é ele (gatilho).
    "Fechar" pela administradora NÃO carimba a aprovação do síndico; onde o condomínio exige, só fecha o já aprovado.
  - Tela: `SindicoPortal comoAdministradora` (faixa dizendo que ela opera e que aprovar/devolver é do síndico); avisos e
    chamados sem modo só-leitura; Devolver e Fechar dizem o motivo; a entrada virou "Abrir o portal do síndico".
  **Pronto quando:** prova em bloco desfeito com os 4 perfis; Playwright no modo administradora; tsc 0.
  - [x] Migration `aplicar_20271025300000_portal_sindico_administradora_opera` APLICADA (25/10). Prova em bloco desfeito:
    administradora (desenvolvedor@) lança receita (histórico "Dev (administradora)" + `operado_por_user_id`; sem a marca
    "lançado pelo síndico"), publica e encerra aviso ("Administradora — Dev"); decidir rateio e fechar o rascunho do
    007 (exige aprovação) recusados com o motivo; logado de fora recusado; membro SÓ da org do 010 recusado no 007
    ("Você não faz parte da administradora deste condomínio") e aceito no 010; síndico logado pelo token lança com a
    marca dele; link sem login segue sem gravar financeiro. Funções novas sem EXECUTE para PUBLIC/anon/authenticated.
  - [x] Tela + testes: `SindicoPortal.test` 1–2, 5, 9, 9b reescritos (opera; devolver/fechar com motivo);
    `financeiroDoSindico.test` sem a prévia. tsc 0. Playwright (harness temporário, apagado; leituras reais, escritas
    bloqueadas), desktop e 390px: faixa, Publicar aviso, Lançar conta e Novo rateio ligados; no 007 Devolver e Fechar
    desligados com o motivo; 0 escrita, 0 erro, sem rolagem lateral. **O print achou:** embutida no app, no celular
    não havia barra de abas (só a Visão geral) → a barra vai no pé do quadro.
  - [x] PR + CI + publicação — PR #161, squash `7408df3` (25/10/2026); CI de `main` verde;
    `conferir-producao.sh "Abrir o portal do síndico"` ✅.
- [x] **G3 — Fornecedores e contratos recorrentes** (usuário: "resolva as Pendências que continuam", 26/11/2026).
  Desenho: duas sub-abas novas do Financeiro (os cadastros do contrato — centros, contas financeiras, fornecedores — já
  vêm na leitura do Financeiro, por condomínio).
  - Fornecedores: listar o que a org do condomínio enxerga (dela ou disponibilizado por outra empresa — este só se
    consulta, botão diz por quê); editar o cadastro DA org; trocar o nome acompanha os títulos em aberto com a regra
    do app (`utils/clientPropagacao.ts`: BOLETO só o `party_name`; conta a pagar em RASCUNHO e mês fechado ficam);
    conta bancária / PIX: nova, editar, principal, desativar (nunca apaga).
  - Contratos: o app gera a série no NAVEGADOR (`syncRecurringToFinance`); aqui a regra de vencimentos foi para o
    banco (`fn_contrato_vencimentos`) e provada por paridade com `buildRecurringDueDates` (400 casos aleatórios,
    4.472 vencimentos, 0 divergência). Dia de vencimento 1–28: de 29 a 31 o `setMonth` do JavaScript transborda
    (31/01 + 1 mês = 03/03) e a série DO APP pula fevereiro — defeito do app, registrado, não copiado. Sem fim = até
    o 1º vencimento futuro + 11 ciclos (a janela do app). Número da sequência SUPPLY_CONTRACT da org. Título de org
    de condomínio não passa pela alçada. Encerrar: fim + `Encerrado`, parcela em aberto depois do fim cancelada.
  **Pronto quando:** contrato criado pelo portal gera as parcelas em Contas a pagar.
  - [x] Migrations `aplicar_20271126950000_portal_sindico_fornecedores` e `…950100_portal_sindico_contratos` APLICADAS
    (26/11). Provas em bloco desfeito com a administradora: fornecedor criado, título lançado, editar o nome atualizou
    1 título; nome vazio recusado; PIX nasce principal, conta nova principal tira a marca, desativar; PIX sem tipo
    recusado; fornecedor de outra org recusado ("só quem o cadastrou altera") e `editavel=false` na lista; de fora
    recusado. Contrato: dia 31 / valor 0 / fim antes do início / fornecedor de fora recusados; sem fim = 12 parcelas
    "Fatura Contrato CTS-010-001-0001 (1) - dezembro de 2026", centro e fornecedor certos, sem marca do síndico
    (gatilho #161); encerrar sem motivo recusado; encerrar em 31/03/27 cancelou 8 e manteve 4; de novo recusado.
  - [x] Tela: sub-abas **Contratos** e **Fornecedores** (`PainelContratosDoSindico`, `PainelFornecedoresDoSindico`);
    regras em `utils/fornecedoresDoSindico.ts` (6 testes); `sindicoFornecedoresContratos.test` (4). tsc 0.
  - [x] Playwright (harness temporário, apagado; leituras reais do 010, escritas bloqueadas), desktop e 390px: os 5
    fornecedores do 010 são da construtora → Editar desligado com o motivo; prévia "15 parcelas … 3 já nascem
    vencidas"; 0 escrita, 0 erro, sem rolagem lateral. **O print achou:** as 3 leituras novas estavam STABLE e o
    resolvedor grava `last_used_at` do link → "cannot execute UPDATE in a read-only transaction" pelo link (a prova
    SQL, sem token, não passava por ali) → voláteis; e o contato repetia o telefone → uma vez só.
  - [x] PR + CI + publicação — PR #782, todos os jobs verdes; squash `d445c3a`; CI de `main` no squash verde; domínio serve `d445c3a` (`conferir-producao.sh`).
- [x] **G4 — Manutenção e equipamentos** (mesmo pedido de 26/11/2026).
  Desenho: o app grava direto nas tabelas e a regra mora no banco (concluir a OS → `trg_maintenance_order_completed`
  recalcula o próximo vencimento do item; código patrimonial em `fn_opura_assets_codigo`; texto de marca/modelo em
  `fn_catalogo_espelho`). O portal grava nas MESMAS tabelas por RPC, e os gatilhos valem igual. Abas Manutenção (sub-abas
  Ordens de serviço / Plano de manutenção — nada abaixo de tabela) e Equipamentos com painéis próprios do síndico (antes,
  a vitrine só-leitura do Portal do Cliente). OS não se apaga pelo portal: concluída é o registro técnico do prédio; a que
  não vai acontecer é cancelada com motivo. Marca/modelo pelo NOME: acha ou cria no catálogo da org (regra de
  `brandModelService.resolverMarcaModelo`). Equipamento com OS no histórico não se remove.
  **Pronto quando:** síndico abre e conclui OS, cadastra equipamento com marca/modelo.
  - [x] Migration `aplicar_20271126950200_portal_sindico_manutencao` APLICADA (26/11). Prova em bloco desfeito com a
    administradora no 010: item do plano (6 meses, próximo 15/12); OS do plano ABERTA → com data AGENDADA; concluir no
    futuro recusado; concluir em 20/11 → item com última 20/11 e próximo 20/05/27 (o gatilho); editar concluída recusado;
    equipamento "Schneider Motobombas" / "BC-92" com código OPR-PRE-0001, marca e modelo no catálogo (espaços
    normalizados; a mesma marca em outra caixa reaproveitada); modelo sem marca recusado; remover com OS recusado;
    cancelar sem motivo recusado, com motivo → CANCELADA com o motivo nos achados; tirar do plano → inativo; de fora
    recusado. Achado da prova: ler o resultado no MESMO comando SQL da gravação vê o retrato de antes — separar.
  - [x] Tela: `PainelManutencaoDoSindico` (+ `useManutencaoDoPredio`, condomínio escolhido lembrado entre as duas abas) e
    `PainelEquipamentosDoSindico`; regras em `utils/manutencaoDoSindico.ts` (4 testes); `sindicoManutencao.test` (4). tsc 0.
  - [x] Playwright (harness temporário, apagado; leituras reais, escritas bloqueadas), desktop e 390px: ordens, plano com
    item VENCIDO, "Abrir OS" do item, equipamentos do 007, "Informe a marca do modelo."; 0 escrita, 0 erro, sem rolagem
    lateral. **O print achou:** cada aba começava no 1º condomínio (Equipamentos no 007 depois de escolher o 010 em
    Manutenção) → escolha compartilhada.
  - [x] PR + CI + publicação — PR #783, todos os jobs verdes; squash `1ed77f3`; CI de `main` no squash verde; domínio serve `1ed77f3`.
- [x] **G5 — Documentos** (mesmo pedido de 26/11/2026).
  Desenho: no app o gestor sobe direto ao bucket (RLS de membro). O síndico não é membro: o arquivo sobe pela Edge
  `sindico-portal-documentos` (a da ata/procuração da assembleia, fase B) com `finalidade=documento` — as 7 categorias do
  condomínio, visibilidade escolhida — e a autorização `sindico_portal_documento_autorizar` (síndico logado OU a
  administradora pelo app, recorte por condomínio; devolve o autor para a descrição). Remover: o banco apaga a linha e
  devolve o caminho (`sindico_portal_documento_remover`), e a Edge tira o arquivo — o Storage não deixa apagar objeto por
  SQL (`protect_objects_delete`). Ata vinculada a assembleia e procuração de unidade não saem (a FK da ata é SET NULL: a
  assembleia perderia a ata calada; a da procuração não tem ação: erro cru). Sem `finalidade`, a Edge segue a assembleia.
  **Pronto quando:** documento enviado pelo síndico aparece para o morador se marcado visível.
  - [x] Migration `aplicar_20271126950300_portal_sindico_documentos` APLICADA (26/11). Prova em bloco desfeito com a
    administradora no 010: ler (id, categoria, visível, motivo de preso); autorizar devolve a org, "Dev (administradora)"
    e `como`; visibilidade liga; remover por outro condomínio recusado; remover apaga a linha e devolve o caminho;
    eventos DOCUMENTO_*; de fora recusado; link sem login recusado.
  - [x] Edge: `regras.ts` (finalidade, 7 categorias, `validarRemocao`, autor administradora) e `index.ts` (ramo do
    documento; `removerDocumento` depois de `exigirUsuario`, RPC antes da service_role). Testes das regras 26/26 (as
    travas estruturais da fase B seguem valendo e ganharam as da G5).
  - [x] Tela: `PainelDocumentosDoSindico` (enviar, mostrar/esconder, abrir, remover; condomínio lembrado); regras em
    `utils/documentosDoSindico.ts`; `sindicoDocumentos.test` (3). tsc 0. Playwright (harness temporário, apagado; leituras
    reais, escritas e Edge bloqueadas), desktop e 390px: lista vazia do 007, título sugerido pelo nome do arquivo
    ("laudo spda 2026"); 0 escrita, 0 erro, sem rolagem lateral.
  - [x] Publicar a Edge `sindico-portal-documentos` — publicada pelo usuário em 27/11 a partir de `1280163` (v1→v2,
    `verify_jwt` ligado; POST sem login = 401).
  - [x] PR + CI + publicação — PR #784, todos os jobs verdes; squash `5f61c63`; CI de `main` no squash: falhou 1 teste de OUTRO módulo (documentos para assinar, "PDF que não desenha… PDF_EXTERNO") e passou inteira no merge seguinte (`9f1dd96`) — instável, não da G5; domínio serviu `5f61c63`.
- [x] **G6 — Moradores (ocupações) e acesso ao portal** (mesmo pedido de 26/11/2026).
  Desenho: aba Unidades com sub-abas "Unidades e cotas" (a de antes) e "Moradores" — cadastrar morador numa unidade
  (cadastro do prédio ou NOVO na org do condomínio; o mesmo CPF/e-mail reaproveitado), contato (e-mail/telefone de quem
  mora), encerrar (saída; o histórico fica) e CONVIDAR ao portal. O "Portal do Condômino" é o Portal do Cliente (aba
  Condomínio) desde 23/09. **Achado de privacidade:** o app concede o acesso com o LINK do Portal do Cliente, que é um por
  pessoa e abre TUDO o que ela tem com a organização (contratos, cobranças) — os moradores do 007/010 são cadastros da
  construtora, e o síndico é externo. Por isso o portal só CONVIDA por e-mail (`portal-invite-user`, o mesmo do app): o
  link de criar senha vai para o e-mail do morador e nunca volta para quem convidou. A Edge ganhou a porta do síndico
  (`{ portal: 'cliente', id, sindico: { token?, clientId?, empreendimentoId } }` →
  `sindico_portal_morador_autorizar_convite` com a credencial de quem chamou, no lugar de `exigirMembro`).
  **Pronto quando:** síndico cadastra um morador e envia o acesso ao portal.
  - [x] Migration `aplicar_20271126950400_portal_sindico_moradores` APLICADA (26/11). Prova em bloco desfeito com a
    administradora no 007: convite sem e-mail recusado; e-mail inválido recusado; contato salvo e o convite autorizado
    (org do token = a do cadastro); convite de quem não mora recusado; morador novo nasce na org do Bella Vista; o mesmo
    CPF reaproveita; papel repetido, 2º responsável financeiro, cadastro de fora, saída antes da entrada e de fora recusados.
  - [x] Edge `portal-invite-user`: porta do síndico; trava de fonte `portalInviteSindicoMorador.test` (3): o banco autoriza
    antes do token e do link; só portal cliente; o link nunca volta na resposta.
  - [x] Tela: `AbaUnidadesDoSindico` + `PainelMoradoresDoSindico`; regras em `utils/moradoresDoSindico.ts` (4 testes);
    `sindicoMoradores.test` (4). tsc 0. Playwright (harness temporário, apagado), desktop e 390px, Bella Vista: faixa
    "8 moradores estão sem e-mail", Convidar desligado com o motivo; 0 escrita, 0 erro. **O print achou:** a faixa dizia
    16 (contava OCUPAÇÕES; cada dono é também o responsável financeiro) → pessoas distintas.
  - [x] Publicar a Edge `portal-invite-user` — publicada pelo usuário em 27/11 a partir de `1280163` (v8→v9, `verify_jwt`
    ligado; POST sem login = 401).
  - [x] PR + CI + publicação — PR #785, todos os jobs verdes; squash `9f1dd96`; CI de `main` no squash verde; domínio serve `9f1dd96`.
- [x] **G7 — Ficha do condomínio** (mesmo pedido de 26/11/2026).
  Desenho: "Editar ficha" no cartão do condomínio (Visão geral). O app grava por `condominio_salvar_ficha` (membro); o
  portal grava por `sindico_portal_ficha_salvar` SÓ os dados do condomínio — razão social, CNPJ, instalação, multa e juros.
  Síndico, mandato e a exigência de aprovação do rateio ficam com a administradora (o síndico não estende o próprio
  mandato nem desliga a aprovação) e aparecem só para leitura. Multa até 2% (CC art. 1.336, § 1º); juros de 0 a 10% a.m.
  A cobrança lê multa e juros do empreendimento (`condominioCobrancaService`): o novo valor vale na próxima cobrança.
  **Pronto quando:** multa/juros alterados pelo síndico entram na próxima cobrança.
  - [x] Migration `aplicar_20271126950500_portal_sindico_ficha` APLICADA (26/11). Prova em bloco desfeito (administradora,
    010): multa 3% / juros 12% / CNPJ curto / mandato / aprovação recusados com o motivo; salvar gravou razão social, CNPJ,
    multa 1,50 e juros 0,80 com o autor; de fora recusado.
  - [x] Tela: `FichaDoCondominioSheet`; regras em `utils/fichaDoSindico.ts` (2 testes); `sindicoFicha.test` (2). tsc 0.
    Playwright (harness temporário, apagado), desktop e 390px: multa 3% → botão com a frase do Código Civil; mandato e
    aprovação só leitura; 0 escrita, 0 erro, sem rolagem lateral.
  - [x] PR + CI + publicação — PR #786, todos os jobs verdes; squash `1280163`; CI de `main` no squash verde; domínio serve `1280163`.
