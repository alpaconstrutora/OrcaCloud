# Diário de Obras — fotos comprimidas e envio que não perde o que já subiu

## Pedido original

Sessão de 14/10/2026.

> availe: operacional > diario de obra > versao mobile

A avaliação listou, como item 4: *"As fotos sobem no tamanho original, sem
compressão. Cada foto da câmera tem de 3 a 12 MB e vai pelo 4G da obra, uma
depois da outra. Se uma falha no meio, as que já subiram ficam perdidas no
bucket e somem do formulário. Fotos em formato HEIC são aceitas, mas não abrem
no Chrome do escritório."* Itens 1–3 feitos antes no mesmo dia. Pedido:

> 4

## Itens — 4 de 4 concluídos em 14/10/2026

### 1. ✅ `utils/comprimirFoto.ts` (novo)
Lado maior até 2048 px, JPEG 0,82, orientação EXIF respeitada
(`createImageBitmap(..., { imageOrientation: 'from-image' })`), fundo branco
(PNG transparente não vira preto). Só imagem; GIF/SVG nunca; HEIC sempre
(converter é o ganho); o resto só acima de 600 KB. Nunca impede o envio: sem
decodificador (HEIC no Chrome do computador) ou canvas falhou → original; se
não ficou menor → original.

**Pronto quando:** `__tests__/comprimirFoto.test.ts` passa e, no navegador, uma
foto de 4032×3024 sai 2048×1536 JPEG.

### 2. ✅ `uploadDiaryMedia` comprime antes de subir
Uma peça só para desktop e mobile; vídeo e documento sobem como estão. Extensão
e `contentType` passam a ser os do arquivo enviado (`.jpg`).

**Pronto quando:** `diaryMediaService.test.ts` continua passando.

### 3. ✅ Envio foto a foto (mobile e desktop)
- cada foto entra no registro assim que sobe; falha não interrompe as demais;
- mobile: "Enviando N de M…", aviso com a conta ("1 de 3 fotos não subiram — as
  outras já estão no registro") DENTRO do cartão de Fotos — no topo da folha
  ele ficava fora da vista de quem estava enviando (só o PNG mostrou);
- mobile: "Salvar registro" espera o envio ("Aguardando fotos…", com o motivo no
  `title`) — salvar no meio deixava foto órfã no bucket;
- desktop: mesmo laço por arquivo, aviso com a conta.

**Pronto quando:** harness: 3 fotos com a 2ª falhando → 3 tentativas, 2 no
registro, aviso visível no cartão.

### 4. ✅ Verificação
Ver abaixo.

## Como foi verificado (14/10/2026)

- `comprimirFoto` (novo) + `diaryMediaService` + `orgContextGuard`: 30/30.
- `tsc` 0 erros; `check-ui-standard.sh` 0 violação nos dois componentes;
  `check-xss-sinks.sh` ok; `vite build` ✓.
- Harness isolado (`__ui_harness.*`, apagado antes do commit) + Playwright a
  390px, PostgREST e Storage 100% stub (nada gravado), servidor novo: **14/14**.
  - foto 4032×3024 de ruído (pior caso, 12,4 MB) → 2048×1536 JPEG `.jpg`, 1,66 MB;
    foto "realista" (gradiente + textura) → 298 KB;
  - 3 fotos com o 2º envio respondendo 500: progresso "Enviando N de 3", Salvar
    travado dizendo o motivo, 3 tentativas, 2 fotos no registro, aviso no cartão
    de Fotos e dentro da tela, todo envio `image/jpeg` com path `.jpg`, Salvar
    volta a funcionar, sem erro de página.
  - Primeira rodada: 11/12 — a falha era do TESTE (o supabase-js envia
    multipart; o `content-type` do pedido é o do formulário, e o limite de
    1,2 MB não vale para ruído puro). Ajustado para ler o tipo da parte e medir
    a redução contra o original.
- **Não exercitado:** HEIC real e orientação EXIF real (Chromium de teste não
  gera nem decodifica HEIC; EXIF exige foto de câmera). Bucket ainda não tinha
  nenhum objeto em produção — nada a converter.
