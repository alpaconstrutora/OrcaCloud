# Recibo financeiro — novo layout (referência "invoice")


## Pedido original

> financeiro > contas a receber: atualizar o recebi com este desgin (ver print). A imagem se encontra em C:\D\ORÇACLOUD\6c4ed98f2dd8cfc1a85790d197e1692b.jpg

> Sessão: 48412c0e-996f-42fd-beeb-c9b59673ed07 · 2026-10-04 (madrugada)

### Decisões tomadas com o usuário (2026-10-04)

| Pergunta | Resposta |
|---|---|
| Cor de destaque | **Coral dos portais** `#E1553C` (rgb 225,85,60) — não o laranja do print |
| Escopo | **Nos dois** tipos: RECEBIMENTO (Contas a Receber) e PAGAMENTO (Contas a Pagar) — o gerador é um só |
| Recibos já emitidos | **Regerar os ativos** (4 arquivos no bucket) |

## Context

O recibo numerado (`financial_receipts`, entregue 26–28/09/2026) é montado por **um
único gerador puro em jsPDF**: `utils/reciboRecebimento.ts` → `montarReciboPdf(r, logoDataUrl?)`.
O visual atual foi herdado do `generateReceiptPDF` antigo (faixa verde, caixa "VALOR",
texto corrido). O usuário enviou o print de uma *invoice* moderna e quer o recibo
com esse desenho: logo + título à direita, metadados, total em destaque + contato,
tabela com cabeçalho colorido, barra "Total", assinatura, rodapé com contato e logo.

Fatos levantados (em `origin/main` `db25979e`; o checkout `c:\D\ORÇACLOUD\orçacloud-saas`
está **272 commits atrás** e nem tem o recibo — não ler dele):

- **Único chamador do gerador:** `services/financialReceiptService.ts:166` (`baixarPdf`),
  usado por `ContasReceberManager.tsx:948,992`, `ContasPagarParcelas.tsx:710,737`
  (passam `{ logoUrl }`) e `ClientArea.tsx:1433` (sem logo → serviço lê `organizations.logo_url`).
- **Edge Functions dos portais** (`client-/partner-/supplier-portal-recibo-download`)
  **não montam PDF** — só assinam o `file_path` guardado. Não há cópia Deno do layout.
- **Snapshot** (`types/financial.ts:774-807`): número, valor, data/forma, descrição,
  pagador, emitente (nome/CNPJ/endereço), nº do contrato, `kind`, credor (`payee_*`).
  **Sem telefone/e-mail/site do emitente.**
- `organizations` tem `phone`, `email`, `website`, `logo_url` (`types/users.ts:499-516`).
  Alpa: logo = data URL PNG de 80 KB; phone `35999055003` (sem máscara); e-mail e site ok.
- A logo **já não é congelada** (lida na hora). Depois que o PDF vai ao Storage,
  reimprimir devolve sempre o mesmo arquivo → layout novo só em recibos novos ou regerados.
- Sem helper de PDF compartilhado no repo; `jspdf-autotable` instalado mas não usado
  no recibo; só `helvetica`.
- Testes: `__tests__/reciboRecebimento.test.ts` (14 casos), `__tests__/financialReceiptService.test.ts`.
- **Ativos no banco (medido 04/10):** RECEBIMENTO nº 4, 5, 6 e PAGAMENTO nº 1, todos
  da Alpa (`926cf626-…`), todos com `file_path`. Nº 1–3 de RECEBIMENTO cancelados (não regerar).
  Bucket lista 7 objetos (4 ativos + 3 cancelados).

## Decisões de desenho

| Questão | Decisão |
|---|---|
| Contato do emitente | **Fora do snapshot, sem migration** — mesmo tratamento da logo. O que garante reimpressão idêntica é o PDF guardado. Evita reescrever 2 RPCs `SECURITY DEFINER` já reescritas 3×. |
| 2º parâmetro de `montarReciboPdf` | Vira objeto `ReciboExtras = { logoDataUrl?, contato? }` (1 chamador de produção, 1 em teste). |
| `jspdf-autotable` | **Não usar**: tabela de 1 linha = ~20 linhas de `rect`/`text`; autotable atrapalha o canto arredondado só no topo e pesa no script Node. |
| Slogan (não existe) | 2ª linha do cabeçalho = `CNPJ <issuer_document>`. |
| Ícones do contato | Bullets `doc.circle` coral; sem fonte de ícone. |
| `detalhesRecibo` | Deixa de existir (vira a linha da tabela); só o util e 3 testes a usam. |
| Determinismo | `doc.setCreationDate(new Date(r.issued_at))` — o hash do PDF não muda a cada geração. |

## Itens

### 1. `utils/reciboRecebimento.ts` — novo `montarReciboPdf`

**O que muda:** layout inteiro (seção "Layout" abaixo); assinatura
`montarReciboPdf(r: FinancialReceipt, extras: ReciboExtras = {})`. Atualizar o
comentário de cabeçalho do arquivo (a frase "visual herdado… faixa verde" cai).

Mantidas: `rotuloFormaPagamento`, `numeroRecibo`, `verboDoCredor`, `textoRecibo`,
`nomeArquivoRecibo`, `caberNaCaixa`. Removida: `detalhesRecibo`. `dataBR` passa a exportada.

Novas (puras, exportadas, todas com teste):

```ts
export interface ContatoEmitente { phone?: string | null; email?: string | null; website?: string | null }
export interface ReciboExtras { logoDataUrl?: string | null; contato?: ContatoEmitente | null }
export function formatarTelefoneBR(raw?: string | null): string | null
//  '35999055003' → '(35) 99905-5003'; '3532123456' → '(35) 3212-3456'; '+55 35 99905-5003'/'5535999055003' → '(35) 99905-5003';
//  vazio/null → null; comprimento irregular → trim do original
export function semProtocolo(url?: string | null): string | null       // 'https://x.com.br/' → 'x.com.br'
export function linhasContatoEmitente(c?: ContatoEmitente | null): string[]  // [telefone, e-mail, site] sem vazios
export function rotulosRecibo(kind?): { destinatario: 'Recebemos de:' | 'Pago a:'; valor: 'VALOR RECEBIDO' | 'VALOR PAGO'; papelAssinante: 'Emitente' | 'Credor' }
export function destinatarioDoRecibo(r): { nome: string; documento: string | null }   // pagador (RECEBIMENTO) ou credor (PAGAMENTO); doc já rotulado 'CPF …'; sem nome → '—'
export function assinanteDoRecibo(r): { nome: string; documento: string | null; papel: 'Emitente' | 'Credor' }
export function linhaTabelaRecibo(r): { descricao: string; contrato: string | null; data: string; forma: string; valor: string }  // vazios → '—'; contrato → 'Contrato: X'
export function limitarLinhas(linhas: string[], max: number): string[]   // excedente vira '…' na última
export function tamanhoQueCabe(medir: (pt: number) => number, maxW: number, pt: number, min: number): number  // desce 0,5 pt até caber
export function arranjoDeclaracao(nLinhas: number): 'lado' | 'abaixo'    // > 9 linhas → 'abaixo'
export function rodapeRecibo(r): [string, string]  // ['Recibo Nº 000004 · emitido em 26/09/2026', 'Gerado eletronicamente via Opura Suite']
```

**Como sei que terminou:** `npx vitest run __tests__/reciboRecebimento.test.ts` verde
com os casos do item 4, e PDF real conferido contra o print (item 6).

### 2. `services/financialReceiptService.ts`

**O que muda:**
- `logoDaOrganizacao` → `dadosDaOrganizacao(orgId)`: `select('logo_url,phone,email,website')`
  `.eq('id', orgId).maybeSingle()`, com cache por sessão (`Map<orgId, Promise>` como o `logoCache`).
- `baixarPdf(tx, { logoUrl?, kind? })` **mantém a assinatura**; nas linhas 163–166:
  ```ts
  const org = await dadosDaOrganizacao(recibo.organization_id);   // org DONA do recibo, não a do topo (REGRA #5)
  const logoUrl = opts.logoUrl !== undefined ? opts.logoUrl : (org?.logo_url ?? null);
  const pdf = montarReciboPdf(recibo, {
      logoDataUrl: await logoComoDataUrl(logoUrl),
      contato: org ? { phone: org.phone, email: org.email, website: org.website } : null,
  }).output('blob');
  ```
  Falha na consulta da org → recibo sem contato, nunca sem recibo.

**Como sei que terminou:** casos novos em `financialReceiptService.test.ts` (item 4) verdes.

### 3. Chamadores — sem mudança

`ContasReceberManager.tsx`, `ContasPagarParcelas.tsx`, `ClientArea.tsx` seguem iguais
(`{ logoUrl }` continua válido e prevalece). Só `npm run typecheck`.

### 4. Testes

`__tests__/reciboRecebimento.test.ts`:
- Remover `describe('detalhesRecibo …')` (3 casos). Linha 104 passa a `{ logoDataUrl: '…' }`.
- Novos: `formatarTelefoneBR` (5 casos), `semProtocolo`, `linhasContatoEmitente` (ordem,
  omite vazios), `rotulosRecibo` (os 2 tipos + `undefined`), `destinatarioDoRecibo`,
  `assinanteDoRecibo`, `linhaTabelaRecibo` (contrato null/presente, forma null → '—'),
  `limitarLinhas`, `tamanhoQueCabe` (medidor fake), `arranjoDeclaracao`, `rodapeRecibo`.
- `montarReciboPdf`: 1 página e `CANCELADO` só no cancelado (mantidos); `output()` do
  RECEBIMENTO contém `VALOR RECEBIDO`, `TOTAL`, `Opura Suite` e não `Local e data`;
  PAGAMENTO contém `VALOR PAGO` e `Local e data`; com `contato` contém `99905-5003` e o
  e-mail; 1 página com descrição de 600 e 1500 caracteres e endereço longo; `output()`
  sem `undefined`/`null`; com PNG 1×1 válida tem mais bytes que sem logo.
  ⚠️ Só asserir substrings ASCII (parênteses saem `\(`, acentos em WinAnsi).

`__tests__/financialReceiptService.test.ts`:
- Mock ganha `maybeSingle`, `supabase.storage.from().download/upload`, e
  `vi.mock('../utils/reciboRecebimento')` com `montarReciboPdf` espião; `rpc` devolve
  `{ id, organization_id: 'org-1', file_path: null, receipt_number: 4 }`.
- Casos: `baixarPdf` consulta `organizations` com as 4 colunas e `eq('id','org-1')` e
  passa `{ logoDataUrl, contato }` ao gerador; `logoUrl` do chamador prevalece mas o
  contato vem da org; 2ª chamada da mesma org não repete a consulta.

### 5. Regeração dos 4 recibos ativos — `scripts/regerar-recibos.ts` + CLI do Supabase

Sem tocar no banco (mesmo `file_path`; nada de `UPDATE financial_receipts`). CLI local
2.107.0 tem `storage ls/cp/rm` (`cp` faz upload local → `ss:///…` com `--content-type`);
o `rm` passou pela falta de policy no precedente de 27/09 porque o CLI linkado usa a
chave de serviço. Como não sei se `cp` faz upsert: **rm antes de cp**.

**Ordem obrigatória:** publicar o commit primeiro (item 7) e regerar **a partir do mesmo
commit**, para o arquivo guardado ser idêntico ao que o app geraria. Avisar o usuário
no momento (grava em produção).

1. **Levantar** (leitura; `db query` só devolve o ÚLTIMO resultado — uma consulta por chamada):
   `npx supabase db query --linked -o json "select r.*, o.logo_url, o.phone, o.email, o.website from financial_receipts r join organizations o on o.id = r.organization_id where r.cancelled_at is null and r.file_path is not null order by r.kind, r.receipt_number"`
   → `<scratch>/recibos.json`. Esperado: 4 linhas, `file_path = <org>/<id>.pdf` (script aborta se não bater).
2. **Backup:** `npx supabase storage cp ss:///financial-receipts/<path> <scratch>/backup/<id>.pdf --linked --experimental` ×4; anotar sha256 e bytes no plano (nº 4 hoje: `e630eca9…`).
3. **Gerar:** `npx tsx scripts/regerar-recibos.ts <scratch>/recibos.json <scratch>/novos`
   (nem `tsx` nem `vite-node` estão instalados; `npx` baixa sob demanda — precedente
   `scripts/prova-e101-segundo-cliente.ts`). O script só lê o JSON: para cada linha
   `montarReciboPdf(linha, { logoDataUrl: logo_url (já é data:), contato })`,
   `writeFileSync(<saida>/<path>, Buffer.from(doc.output('arraybuffer')))`, e um
   `manifest.json` (id, kind, nº, path, bytes, sha256). A cadeia de imports já roda em
   Node nos testes. Fallback se o ESM do jsPDF falhar no tsx: rodar a geração num
   arquivo `*.spec.ts` sob `vitest run` lendo o JSON por env var.
   Abrir os 4 PDFs e conferir número, nome, valor, logo, `(35) 99905-5003`.
4. **Substituir**, um por vez: `storage rm ss:///financial-receipts/<path> --linked --experimental --yes`
   → `storage cp <scratch>/novos/<path> ss:///financial-receipts/<path> --linked --experimental --content-type application/pdf`.
5. **Verificar:** `storage ls` lista os 7 objetos; baixar de novo cada um dos 4 → sha256
   **igual** ao local novo e **diferente** do backup;
   `select name, metadata->>'size', metadata->>'mimetype' from storage.objects where bucket_id='financial-receipts'`
   → `application/pdf`, bytes = manifesto; `select id, kind, receipt_number, file_path from financial_receipts where cancelled_at is null` **inalterado**.
6. **Ponta a ponta:** Contas a Receber › "Nº 000004" → arquivo baixado tem sha do novo;
   Portal do Cliente (link público de José Roberto Gomes, só leitura) › "Baixar recibo Nº 000004"
   → novo; Contas a Pagar › recibo PAGAMENTO nº 000001.
7. **Registrar** no plano hashes antes/depois, data, commit. Não tocar nos nº 1–3.

Rollback: `rm` + `cp` do backup para o mesmo path. Se `rm` passar e `cp` falhar, subir o
backup (o app remontaria pelo snapshot, mas `registrar_arquivo_recibo` recusaria o path
já registrado → `guardado=false`).

### 6. Verificação ponta a ponta (app real, antes de publicar)

- Dev server da frente + Playwright (skill `rodar-app`), agente de leitura. Não há
  `pdftoppm`/`magick` na máquina: renderizar o PDF com `pdfjs-dist` (já em
  `node_modules`) numa página Playwright e tirar print, comparando com o print do usuário:
  logo esquerda, "RECIBO" coral à direita com barra+chanfro, metadados, valor grande +
  contato com bullets, tabela coral de 1 linha com zebra, barra TOTAL, declaração,
  assinatura à direita, rodapé com contato + logo pequena.
- Baixar um recibo **sem arquivo guardado** não existe hoje (os 4 têm) — a conferência
  visual no app usa um PDF montado pelo teste/script; no app confere-se que o fluxo
  `baixarPdf` segue entregando o guardado (hash igual) e que nenhum erro de console/HTTP aparece.
- PAGAMENTO: PDF do script/teste com papéis trocados e "Local e data".
- Cancelado: só por teste unitário (não estornar título real).
- `npm run ci` verde — suíte só vale com a conta fechando (JSON); Node 24 cai intermitente.
- Se algum `.tsx` for tocado: `bash scripts/check-ui-standard.sh <arquivo>`.

### 7. Publicação

`git push origin HEAD:main` → `bash scripts/conferir-producao.sh "VALOR RECEBIDO"` →
item 5 (regeração) → `bash scripts/fechar-frente.sh recibo-novo-layout`.

## Layout (A4 210×297 mm, M=20, R=190, útil 170; baselines em mm; só helvetica)

```ts
const COR = { accent:[225,85,60], ink:[30,41,59], muted:[100,116,139], line:[226,232,240],
              zebra:[248,250,252], branco:[255,255,255], cinzaRodape:[150,150,150], vermelho:[220,38,38] };
```

**1. Cabeçalho (y 18–46)** — logo em caixa 34×18 em (20,18) via `caberNaCaixa`, `getImageProperties`
uma vez (try/catch englobando cabeçalho E rodapé); `xTexto = 20 + w + 6` (sem logo: 20).
Nome bold 13 ink em (xTexto, 27), `tamanhoQueCabe` até `118 - xTexto` (mín. 9). Linha 2 normal 9
muted (xTexto, 32.5): `CNPJ …`. "RECIBO" bold 30 accent right em (190, 31). Barra cinza
`rect(128, 35.5, 55, 2.2, 'F')` + chanfro coral `doc.lines([[7,0],[-2.2,2.2],[-7,0]], 183, 35.5, [1,1], 'F', true)`.
Divisória `line(20, 46, 190, 46)` cor line, 0.3.

**2. Metadados (y 54–67)** — esquerda: rótulo normal 8.5 muted em x=20 e valor bold 10.5 ink em x=46;
y=55 `Recibo nº` → `000004`; y=61.5 `Data` → `dataBR(payment_date)`. Direita (right x=190, máx. 85 mm):
y=55 `rotulosRecibo(kind).destinatario` 8.5 muted; y=61.5 nome bold 11 ink (`tamanhoQueCabe` 85, mín. 8);
y=66.5 documento 8.5 muted (se houver).

**3. Valor + contato (y 78–98)** — esquerda: y=80 `VALOR RECEBIDO|PAGO` 8.5 muted `setCharSpace(0.5)`
(**zerar depois**); y=91 `brl(amount)` bold 24 ink. Direita (x 112–190): até 3 entradas —
`issuer_address` (`splitTextToSize(…, 74)`, máx. 2 linhas), telefone formatado, e-mail (site só
no rodapé); bullet `circle(113.2, y-1.1, 0.9, 'F')` coral na 1ª linha de cada entrada; texto 8.5
muted em (116.5, y); `y += 4.6`, começando em 80.

**4. Tabela (yT=106)** — faixa `roundedRect(20,106,170,9,2,2,'F')` + `rect(20,110,170,5,'F')` coral
(só o topo arredondado). Cabeçalho branco bold 8, baseline 111.8: `DESCRIÇÃO` x=24 · `DATA DO PAGAMENTO`
x=108 · `FORMA` x=136 · `VALOR` right 186. Linha única (yL=115) de `linhaTabelaRecibo(r)`:
`descLinhas = limitarLinhas(splitTextToSize(descricao, 80), 3)`;
`hL = max(12, 5 + 4.6*descLinhas.length + (contrato ? 4.2 : 0) + 3)`; zebra `rect(20,115,170,hL,'F')`;
descrição bold 9.5 ink em (24, 121.5 + i*4.6); `Contrato: X` normal 8 muted na linha seguinte;
data 9.5 ink (108, 121.5); forma (136, 121.5) `tamanhoQueCabe` 24 mm (mín. 7.5); valor bold 9.5 right 186.
Linha inferior cor line; `yFimTabela = 115 + hL`.

**5. Declaração + barra TOTAL (yD = yFimTabela + 14)** — barra `roundedRect(126, yD-6, 64, 11, 1.5, 1.5, 'F')`
coral; `TOTAL` branco bold 9 em (130, yD+1.2); valor branco bold 11.5 right (186, yD+1.2).
Esquerda (98 mm): `DECLARAÇÃO` 8 muted charSpace 0.5 em (20, yD-1); corpo `textoRecibo(r)` 9.5 ink,
`text(linhas, 20, yD+5, { lineHeightFactor: 1.45 })`, altura/linha = 9.5×1.45×0.3528 ≈ 4.86 mm.
`arranjoDeclaracao(n) === 'abaixo'` (>9 linhas): declaração em (20, yD+20) com 170 mm.

**6. Assinatura (ySig = max(yFimDecl + 32, 228))** — `line(112, ySig, 190, ySig)` muted 0.3; nome bold 9.5
ink centrado x=151 em ySig+5 (`tamanhoQueCabe` 78); `CNPJ … · Emitente|Credor` 8 muted centrado ySig+9.5.
PAGAMENTO: `Local e data: ______________________________` 9 ink em (20, ySig).

**7. Rodapé (fixo)** — `line(20, 266, 190, 266)` cor line. Esquerda: `CONTATO` 7.5 muted charSpace 0.5
em (20, 271.5); endereço 8 muted (`splitTextToSize(…, 100)`, máx. 2) de y=276.5 (+4/linha); depois
`telefone · e-mail · site` (`tamanhoQueCabe` 100, mín. 7). Direita: logo pequena caixa 22×9 em
(190-w, 269.5 + (9-h)/2) reaproveitando `props` (jsPDF deduplica a imagem por alias — não dobra o
tamanho); `rodapeRecibo(r)` 7 cinzaRodape right x=190 em y=284 e y=288.

**8. CANCELADO** — marca d'água igual à atual (vermelho bold 64, centro, 30°); o aviso
`Recibo cancelado em … (baixa estornada).` desce para y=258, 9 pt (não cai sobre o rodapé).

**PAGAMENTO**: cabeçalho igual (a organização prepara o papel); `Pago a:` + credor; `VALOR PAGO`;
declaração de `textoRecibo` ("Recebemos de Alpa … (CNPJ …)"); credor assina com papel `Credor` e
`Local e data`; nome de arquivo inalterado.

## Riscos

1. Descrição longa na tabela → `limitarLinhas(…, 3)`; o texto inteiro já vai na declaração.
2. Declaração longa (Contas a Pagar) → `arranjoDeclaracao` 'abaixo' + `ySig` derivado; teste de 1 página com 1500 caracteres.
3. `setCharSpace` persiste — zerar após cada rótulo espaçado.
4. Altura de linha com `lineHeightFactor` = pt × fator × 0.3528 mm (não os 7 mm fixos de hoje).
5. Data URL inválida lança em `getImageProperties` → try/catch único para as duas logos.
6. Telefone mascarado/+55, site com `https://` → normalizar (`formatarTelefoneBR`, `semProtocolo`).
7. Round-trip extra na org mesmo com `logoUrl` do chamador → cache por sessão.
8. `kind` undefined (registro legado) = RECEBIMENTO em todas as funções novas.
9. Frente `produto-abas` foi fechada durante o planejamento — a nova frente nasce de `origin/main` atual; reconferir que `utils/reciboRecebimento.ts` e o serviço batem com o lido (258 linhas / `baixarPdf` em :147-178) antes de editar.

## Estado

- [x] 0. Frente `recibo-novo-layout` criada de `origin/main` (`09f5e5dd`); arquivos conferidos
  idênticos ao que foi lido no planejamento (md5 do util e do serviço).
- [x] 1. `utils/reciboRecebimento.ts` — layout novo (coral `#E1553C`), `ReciboExtras`,
  12 funções puras novas, `detalhesRecibo` removida, `setCreationDate(issued_at)` +
  `setFileId(idDoArquivoPdf(id))` (PDF determinístico — teste de bytes iguais).
- [x] 2. `services/financialReceiptService.ts` — `dadosDaOrganizacao` (logo+contato,
  cache por org); `baixarPdf` mantém a assinatura.
- [x] 3. Chamadores inalterados; typecheck verde.
- [x] 4. Testes: `reciboRecebimento.test.ts` 31 casos, `financialReceiptService.test.ts`
  7 casos (3 novos de `baixarPdf`) — 41 verdes. `check-system-projects` e `check-xss-sinks` limpos.
- [x] 6 (parcial). PDFs REAIS (nº 4, 5, 6 e PAG nº 1, dados do banco) gerados por
  `scripts/regerar-recibos.ts` e renderizados em PNG (pdf.js + Playwright, pasta da
  sessão): todos em 1 página, logo proporcional, RECIBO coral com barra+chanfro,
  metadados, valor + contato com bullets, tabela de 1 linha, barra TOTAL, declaração,
  assinatura (PAG com "Local e data"), rodapé com contato e logo pequena. Ajuste após o
  1º render: colunas DATA/FORMA afastadas e assinatura sobe para y≥220.
- [ ] 6. `npm run ci` — em andamento.
- [ ] 7. Publicação.
- [ ] 5. Regeração — **backup feito em 04/10/2026 01:08** (pasta da sessão `regerar/backup`):

  | nº | id | bytes | sha256 (antigo) |
  |---|---|---|---|
  | PAG 000001 | 0b3897b5-… | 58054 | `6b184595a465…` |
  | REC 000004 | 286048b5-… | 57908 | `e630eca9d945…` |
  | REC 000005 | 104b87cf-… | 57916 | `981daabd8af4…` |
  | REC 000006 | 572bfa2c-… | 57917 | `f279f491ff95…` |

  ⚠️ `supabase storage cp` no Git Bash: `MSYS_NO_PATHCONV=1` e caminho local RELATIVO
  (um `C:/…` é lido como esquema de URL e um `/c/…` vira caminho relativo torto).
