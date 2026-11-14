# ÒPURA Pro — correções da crítica de design (14/11/2026)

## Pedido original

Sessão de 14/11/2026, manhã (Claude Code, `/impeccable`):

> opura pro

> /impeccable critique òpura pro

Respostas às perguntas da crítica (mesma sessão):

> Por onde começamos? → "Os dois P0 primeiro (Recomendado)"
> Qual direção ele deve seguir? → "Seguir o app (§16/§17)"
> Quanto deste levantamento você quer atacar agora? → "Tudo"

> 1. autônomomain
> 2. um de cada vez

Leitura: o público do Pro é o **profissional autônomo** (fora da Alpa); os passos
vão **um de cada vez**, cada um publicado antes do próximo.

Crítica de origem: `.impeccable/critique/2026-11-14T14-04-14Z__components-promodule-tsx.md`
(17/40; 2 P0, 3 P1), gerada na worktree `critique-opura-pro` sobre `d23f33b8`.

## Passos

### 1. P0 — assinatura e PIX (`/impeccable harden`) — frente `pro-assinatura-pix`

**O que muda**
- Assinatura: canvas com fundo branco pintado e traço grafite (antes: traço
  `#FFFFFF` sobre canvas transparente, gravado invisível); coordenadas convertidas
  da largura exibida para a interna; Pointer Events com captura (um dedo só,
  `pointercancel`/`lostpointercapture` encerram o traço); "Confirmar" só com nome e
  traço, e diz o motivo quando desligado.
- PIX: payload EMV montado pelo **tipo** de chave cadastrado (antes: palpite —
  CPF com máscara virava telefone `+55`), com validação (dígitos de CPF/CNPJ,
  celular com DDD, e-mail, aleatória); QR gerado localmente com `qrcode` (antes:
  `api.qrserver.com`, que recebia chave e valor e falhava sem rede); linha
  "Você vai receber em: nome · chave" acima do QR; chave inválida mostra o motivo
  em vez de gerar código.
- Ajustes: a chave é validada pelo tipo ao salvar, com erro no campo e placeholder
  por tipo.

**Como sei que terminou**
- `__tests__/pixCopiaECola.test.ts` verde: CRC16 no vetor `123456789` = `29B1`;
  CPF com máscara sai como 11 dígitos (não `+55…`); celular sai `+55DDDNÚMERO`;
  DV de CPF/CNPJ errado é recusado; e-mail/aleatória normalizados.
- `tsc` e `check-ui-standard.sh` nos arquivos tocados sem achado novo.
- Assinatura conferida no navegador: o traço aparece preto na prévia e no PDF.

**Estado (14/11/2026): feito, conferido.**
- 24 testes de `pixCopiaECola` verdes (inclui o CRC `1D3D` do exemplo do manual do
  BR Code); `tsc` exit 0 (heap 12 GB); travas de rótulo/cor de valor verdes.
- Navegador (servidor local da frente, leituras `pro_*` simuladas na aba e escritas
  `pro_*` bloqueadas — 0 tentativas): CPF `529.982.247-25` saiu `…0111` + 11 dígitos,
  sem `+55`; QR é `data:image/png` local; "Você vai receber na chave CPF …" acima do
  QR. Assinatura: traço escuro termina sob o cursor; imagem gravada 320×160 com 0
  pixel transparente e 820 pixels de traço; "Confirmar" desligado diz o motivo.
  Ajustes: CPF com DV errado mostra "Esse CPF não confere" ao sair do campo.
- `check-ui-standard.sh` acusa §8 nos botões em degradê "Finalizar"/"Enviar
  comprovante"/"Salvar configurações" — **preexistente** (o `main` já acusa) e é o
  passo 4; não mexido aqui de propósito.

**Fica de fora (registrado):** cidade do recebedor continua `BRASILIA` no
payload (tag 60 é obrigatória e o cadastro não tem cidade — exige coluna nova;
entra no passo 5).

### 2. Fechamento do serviço (`/impeccable shape`) — pendente
Confirmação do "Finalizar" com resumo; estado Concluído na própria tela com
"Cobrar PIX" e "Enviar comprovante"; estado Pago; lista "aguardando pagamento";
toast no lugar de `alert`.

### 3. Casca (`/impeccable adapt`) — pendente
Barra inferior fixa com área segura e "+" central; ícones lucide; rótulos ≥ 11px;
no computador, sem moldura de celular.

### 4. Linguagem visual do app (`/impeccable quieter` + `typeset`) — pendente
Sem degradê/emoji/caixa alta; §16/§17; texto ≥ 12px; `useConfirm`/toast (§14);
classes de cor inexistentes corrigidas.

### 5. Números, acessibilidade e menores (`/impeccable harden`) — pendente
"A Receber", "Total Acumulado", "Hoje/Próximos", erro de rede com "tentar de novo";
teclado e nomes acessíveis; cidade do recebedor no cadastro; voz com acento;
compressão de fotos; WhatsApp antes dos `await`.

### 6. Textos (`/impeccable clarify`) — pendente
Status traduzido, "Faturamento", "QR Code Dinâmico", PDF com dados do emissor,
vazios com ação.

### 7. `/impeccable polish` — pendente
