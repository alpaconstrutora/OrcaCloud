# Segurança — caminhos assinados pela service_role (F54, F53 travessia, cache de navegação)

## Pedido original

> Pedido delegado pela sessão que coordena a aplicação da varredura de segurança de
> 15/11/2026 (frente `seguranca-caminhos-assinados`, 18/11/2026). Trecho do escopo,
> transcrito literalmente:
>
> "## Escopo (PR B — caminhos assinados por service role)
> 1. F54 (leia patches/F54.md inteiro): o síndico grava documento_path com `%2e%2e` e obtém URL assinada por service role de qualquer bucket. Implemente o desenho da 2ª tentativa descrita na nota (guarda na escrita, nas RPCs do síndico, E a mesma checagem antes dos DOIS assinadores por service role, para pegar linhas já gravadas), com a correção que faltou: o trim final no helper TS tem de ser LINEAR (andar do fim enquanto charCodeAt <= 0x20 e fatiar; nada de regex /[\x00-\x20]+$/, que é quadrática), mesma ordem de passos, e teste com ~100k espaços terminando rápido. Se couber, estenda _shared/caminhoSemTravessia.ts em vez de criar outro helper, e confira que o helper TS e o SQL concordam (teste com casos de borda: `%2e%2e`, `%2E.`, `..%2f`, tab/LF/CR, `?`/`#` no nome do arquivo legítimo).
> 2. F53, SÓ a parte de travessia (leia patches/F53.md): a mesma guarda em supplier-portal-download (invoices.file_path, purchase_order_documents.file_path, purchase_receipts.photo_path), nas functions *-portal-recibo-download (financial_receipts.file_path, cuja RPC só confere o prefixo {org}/) e nos demais assinadores por service role que a nota cita. NÃO implemente o vínculo do caminho com a organização do registro: isso quebra anexos dos condomínios 007/010 que mudaram de org sem mover o arquivo e fica para outro PR.
> 3. Achado novo: o navigation-cache guarda URLs de portal com `?token=` (token de acesso de portal). Ache onde (grep por navigation-cache / service worker / vite.config.ts / workbox) e pare de guardar URL com token (não cachear ou guardar sem a query, o que fizer sentido para o portal continuar abrindo offline se hoje abre); limpe as entradas antigas com token, se possível.
> Fora do escopo: RLS de tabelas, corretor, sanitizeHtml, bucket documents."

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 18/11 | Helper novo ou o de F57? | O de F57 (`_shared/caminhoSemTravessia.ts`) já tinha o corte do fim LINEAR — reusado; só o comentário e os testes cresceram. No banco, a mesma expressão de `partner_portal_create_request` virou `fn_caminho_sem_travessia(text)`. |
| 18/11 | Quais assinadores além dos citados? | Todos os `createSignedUrl`/`download` da service_role sobre caminho gravado por terceiro ou vindo do corpo: entraram também `academy-portal-media` e `fiscal-nfe-processor` (mesmo padrão; `download` também monta URL). `createSignedUrls` (plural) e `remove` não: o caminho vai no corpo JSON. `pedido-fast` não: caminho montado no servidor. |
| 18/11 | Portal abre offline hoje? | Não: os bundles JS não são precacheados e o Vercel os serve com `max-age=0, must-revalidate`. O cache de navegação só serve de reserva quando a rede passa de 4 s — guardar SEM a query mantém essa reserva (agora vale para qualquer token da mesma rota). |

## Plano

1. **`supabase/migrations/aplicar_20271118912000_caminho_sem_travessia_sindico.sql`** —
   `fn_caminho_sem_travessia` + as duas RPCs do síndico (definição de produção + a guarda).
   *Pronto quando:* aplica duas vezes sem erro num PostgreSQL local; `segurancaMigrations`
   passa; SQL e TS concordam em 200 mil entradas.
2. **Edge Functions (17 arquivos)** — `caminhoSemTravessia(x)` antes de cada
   `createSignedUrl(x)`/`download(x)`. *Pronto quando:* `__tests__/assinadoresSemTravessia.test.ts`
   passa e acusa a remoção de qualquer guarda (conferido removendo duas).
3. **`lib/cacheDeNavegacao.ts` + `vite.config.ts` + `index.tsx`** — cache novo sem query/UUID
   na chave, resposta sem `url`, cache antigo apagado no boot. *Pronto quando:* no Chromium,
   com o build servido, nenhum cache tem token e o portal com outro token ainda recebe o HTML
   guardado offline.
4. **`supabase/config.toml`** — `fiscal-nfe-processor` com `verify_jwt = false` (já era assim
   publicado; sem a entrada, o deploy religaria o gateway e o cron tomaria 401).

## Estado

- [x] 1 — migration escrita; aplicada 2× em PostgreSQL 9.6 local; fuzz 200.038 entradas, 0 divergência
- [x] 2 — 17 functions com a guarda; trava estática no Vitest
- [x] 3 — build conferido no navegador (chaves `/`, `/portal-cliente`, `/pedido/:id`; `response.url` vazio; `navigation-cache` antigo apagado)
- [x] 4 — config.toml
- [ ] aplicar a migration em produção (usuário)
- [ ] publicar as 16 Edge Functions (usuário, depois do merge)

## Verificação

- Leitura em produção (18/11): dos 1.912 caminhos gravados nas tabelas que os assinadores
  leem, **0** são recusados pela regra.
- Depois de aplicar: ver "COMO CONFERIR" no cabeçalho da migration.
- Depois de publicar: `POST /functions/v1/sindico-portal-financeiro` com
  `{acao:'abrir', tituloId}` de um título com `documento_path` com `%2e%2e` responde 500
  "Erro ao gerar o link do documento" (antes: URL assinada de outro bucket).
