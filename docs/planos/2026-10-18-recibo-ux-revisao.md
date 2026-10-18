# Recibo — revisão de UI/UX (pagamento e recebimento)

## Pedido original

> analise o UI / UX do recibo do app
> (anexo: `Recibo_Pagamento_000001 2.pdf` — recibo de pagamento nº 000001, Débora Cristina Duarte, Faxina)

Sessão 9d2f4ac3 · 18/10/2026. A análise listou os problemas abaixo; em seguida:

> Corrigir todos e incluir
> 1. DECLARAÇÃO esta na mesma linha que o total, descolcar mais para baixo
> 2. dados da alpa embaixo dos dados do fornecedor, ficando confuso

## Decisões tomadas

| Data | Ponto | Decisão |
|---|---|---|
| 18/10 | Tipo do recibo | Subtítulo "DE PAGAMENTO"/"DE RECEBIMENTO" sob RECIBO e no rodapé. A numeração NÃO ganha prefixo: o número aparece em telas, portais e nomes de arquivo. |
| 18/10 | Barra TOTAL | Mantida: o pedido 1 posiciona a declaração em relação a ela. A declaração passa a ficar ABAIXO, em largura total. |
| 18/10 | Datas | Topo mostra "Emissão" (issued_at); a tabela mostra a data do pagamento. Some o "Data" ambíguo. |
| 18/10 | Descrição | Só o padrão do gerador de faturas recorrentes (`contractService`: "Fatura Contrato X (n) - mês de ano") é reescrito para "Parcela n — mês de ano". Qualquer outra descrição sai como está. |
| 18/10 | Local e data | Pré-preenchidos com a cidade do endereço CONGELADO do emitente e a data de emissão, nos dois tipos. Sem cidade, a linha do local fica em branco. |
| 18/10 | Quitação | Declaração termina com "dando plena quitação deste valor." |
| 18/10 | PDFs já guardados | Regerados no bucket (mesmo `file_path`), com backup antes — é o que tira o contato da Alpa de baixo do credor (pedido 2) e põe CANCELADO nos cancelados. |
| 18/10 | "Incoporadora" | Corrigido no snapshot `issuer_name` (8 linhas), com tabela de reversão. |

## Plano

1. **`utils/reciboRecebimento.ts`**
   - subtítulo do tipo no cabeçalho e no rodapé;
   - metadados "Recibo nº" + "Emissão";
   - descrição legível (`descricaoDoRecibo`) e nota "Contrato:" só quando o número não está na descrição;
   - coluna FORMA só quando há forma;
   - aviso quando a soma dos itens ≠ valor do recibo (contrato parcelado);
   - barra TOTAL logo abaixo da tabela/itens e DECLARAÇÃO embaixo dela, largura total (pedido 1);
   - quitação na declaração;
   - "Cidade/UF, dd de mês de aaaa" pré-preenchido acima da linha de assinatura; assinatura logo após a declaração (sem o piso de 220 mm);
   - nada do emitente na coluna do destinatário (pedido 2 — já valia no código; teste mantido).
   **Pronto quando:** testes novos passam e o PNG do recibo da Débora mostra cada ponto.
2. **`__tests__/reciboRecebimento.test.ts`** — cobre cada item acima. **Pronto quando:** suíte do arquivo verde.
3. **`scripts/regerar-recibos.ts`** — aceita recibo cancelado (o PDF sai com a marca). **Pronto quando:** gera os 8 PDFs.
4. **Migration `aplicar_20271018880000_recibo_issuer_name_incorporadora.sql`** — guarda o nome antigo e corrige. **Pronto quando:** consulta mostra 0 linhas com "Incoporadora".
5. **Bucket `financial-receipts`** — backup dos 8 PDFs, upload dos regerados. **Pronto quando:** o PDF baixado do bucket é igual ao gerado (sha256).

## Estado (18/10/2026) — 4 de 5

- [x] 1 · gerador revisado; extra: CPF/CNPJ gravado só com dígitos ganha máscara (a Defensoria saía "05559094000180")
- [x] 2 · 59 testes verdes, inclusive posição: o y da DECLARAÇÃO fica > 20 pt abaixo do TOTAL (no desenho antigo eram ~6 pt)
- [x] 3 · `regerar-recibos.ts` aceita cancelado; os 8 PDFs gerados em disco e conferidos em PNG
- [x] 4 · aplicada em 18/10/2026 após o usuário autorizar escrita no banco ("autorizo escrita no banco"). Conferido: 8 na tabela de reversão, 8 corrigidos, 0 com "Incoporadora", RLS ligada, anon/authenticated sem SELECT.
- [ ] 5 · **aguardando o usuário**: escrita no bucket de produção. A autorização de 18/10 cobriu o banco, não o Storage. Ordem: item 4 → exportar → `regerar-recibos.ts` → backup (`storage cp` de cada `file_path`) → `storage rm` + `storage cp` no mesmo caminho → sha256.

Enquanto 5 não roda, o bucket continua entregando os PDFs antigos (contato da Alpa sob o credor, sem CANCELADO). Recibo NOVO já sai no desenho novo.

## Verificação

`npx vitest run __tests__/reciboRecebimento.test.ts __tests__/financialReceiptService.test.ts`, render do PDF para PNG com PyMuPDF e leitura visual, e sha256 do arquivo baixado do bucket.
