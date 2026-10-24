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
- [ ] G1 — 3 de 4:
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
  - [ ] PR + CI + publicação.
- ⚠️ **O síndico do 010/007 (altair.rosa@gmail.com) NÃO tem login** (nenhum usuário com esse e-mail
  em 24/10): pelo link ele só lê. Tudo que grava (lançar, pagar, rateio) exige entrar com e-mail e
  senha — falta ele criar o acesso.
- [ ] G2 · [ ] G3 · [ ] G4 · [ ] G5 · [ ] G6 · [ ] G7
