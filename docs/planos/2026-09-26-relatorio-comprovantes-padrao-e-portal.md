# Relatório de rateio — comprovantes marcados por padrão, e também no portal

**Data:** 26/09/2026
**Pedido original (literal):**

> 1. ao clicar em incluir comprovantes selecionado por padrao e refletir no portal do cliente também

Continuação de `2026-09-26-relatorio-anexar-comprovantes.md`, que criou a caixa
"Incluir os comprovantes" no relatório do síndico, desmarcada, e deixou o
portal de fora pelo motivo de permissão descrito abaixo.

## O que muda

1. **Síndico** (Condomínio › Financeiro › Relatório do rateio): a caixa nasce
   **marcada**.
2. **Portal do Cliente** (Condomínio › Financeiro do condomínio › Baixar PDF):
   ganha a mesma caixa, **marcada**, na linha do botão. Marcada, o PDF do
   condômino anexa os mesmos comprovantes que o síndico anexa.

## O obstáculo, e o desenho

O bucket `boletos` só abre para membro da organização (policy
`boletos_select_org`). O condômino entra por link (`client_portal_tokens`) ou
logado como cliente — nenhum dos dois é membro. Assinar no navegador dele dá
400.

Desenho escolhido — o mesmo da irmã `client-portal-condominio-download`:

- **Edge Function nova `client-portal-rateio-comprovantes`**, recebe
  `{ token | clientId, rateioId }`.
  - **Autoriza pela RPC do portal**, com a credencial do chamador
    (`client_portal_get_condominio` / `..._for_client`). Só aceita um rateio
    que veio no payload, e só as despesas dele que vieram no payload. A regra
    de quem vê o quê continua num lugar só (`fn_condominio_payload_for_client`).
  - **Depois** usa a service_role para ler a origem e assinar (15 min).
  - Devolve `{ despesaId, url, nome }[]` — URL assinada, nunca path.
- **O resolvedor de origem vira UM arquivo compartilhado**:
  `supabase/functions/_shared/origemDoLancamento.ts` (sem import nenhum, o
  desenho de `planta-webhooks/politica.ts`). `condominioRateioService` delega a
  ele com a sessão do usuário; a function chama com a service_role. Assim o PDF
  do condômino anexa exatamente o arquivo que o síndico abre na coluna
  Documento — sem uma segunda cópia da regra que divergiria.
- **Sem migration**: o payload do portal não precisou mudar (path de bucket
  privado não é dado de portal).
- `ComprovanteDaLinha` passa a ter duas formas: `{ bucket, path }` (síndico
  assina com a sessão) e `{ url }` (portal, já assinada). `url` vazia = achou
  mas não assinou → vira linha em "Comprovantes que não entraram".

## Comportamento no portal

- Caixa só aparece quando há resolvedor e o rateio tem despesas. A prévia do
  síndico (`PortalCondominoAdmin`) não passa resolvedor → sem caixa, como hoje.
- Botão conta: "Buscando comprovantes..." → "Anexando N de M...".
- Se a busca falhar, o PDF **sai mesmo assim**, sem anexo, e a linha do botão
  diz por quê. Se nenhuma despesa tem comprovante, diz isso. Falha parcial:
  diz quantos entraram e que o motivo está na última página.

## Verificação

- tsc, vitest (novo `__tests__/relatorioComprovantePortal.test.ts` + os de
  origem, relatório e descrição), check-ui-standard nos dois .tsx, scripts de
  regra, `verificar:build`.
- Playwright: síndico — caixa começa marcada, PDF com páginas de anexo;
  portal por link — caixa marcada, PDF com anexos, bucket assinado pela
  function (não pelo navegador).
- Deploy da function (`npx supabase functions deploy
  client-portal-rateio-comprovantes`) só com aprovação; depois, push.

## Resultado medido (26/09/2026)

- Síndico (Altavista 08/2026): caixa começa marcada; sem tocar nela, o PDF
  sai com o boleto — 320 KB, 3 páginas.
- Portal por link (Bella Vista 07/2026, 2 boletos): caixa começa marcada;
  PDF 638 KB, 4 páginas, rodapé "1 / 4". Rede: function 200 e os 2 downloads
  pelas URLs que ela assinou — **nenhum** POST de assinatura saindo do
  navegador do condômino.
- Antes do deploy (function 404): o PDF saiu mesmo assim (19 KB, sem anexo) e
  a linha do botão disse "PDF baixado sem os comprovantes: o serviço de
  comprovantes não respondeu." — a mensagem crua do supabase-js ("non-2xx
  status code") foi trocada por essa.
- Recusas, chamando a function direto: rateio de outro condomínio com o token
  → 403; token inventado → 403; sem identidade → 400. Sessão de usuário +
  `clientId`: rateio do cliente → 2 URLs; de outro condomínio → recusado.
- Celular (390 px): o cabeçalho do card espremia "Prévia — pode mudar" em 3
  linhas e o botão em 2; agora o grupo quebra como bloco (`flex-wrap` +
  `whitespace-nowrap`).
