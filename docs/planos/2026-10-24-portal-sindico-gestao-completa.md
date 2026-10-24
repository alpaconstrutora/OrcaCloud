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

## Estado

- [x] 007 com organização própria (24/10) — ver plano de 21/10, F3.
- [x] PR #138: Financeiro um condomínio por vez.
- [ ] Usuário decidir o que entra e a ordem das fases G1–G7.
- [ ] G1 · [ ] G2 · [ ] G3 · [ ] G4 · [ ] G5 · [ ] G6 · [ ] G7
