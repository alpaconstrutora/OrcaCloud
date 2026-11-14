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

**Estado (14/11/2026): publicado** — PR #423, `1e4bd0b` no `main`;
`conferir-producao.sh "Você vai receber na chave"` ✅ (domínio serve `1e4bd0b`).
A CI falhou 2× em `DiaryMobileAppFonte.test.tsx` (intermitente, fora do Pro);
passou depois de trazer o `main` com o #420, que corrige essas intermitências.
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

### 2. Fechamento do serviço (`/impeccable shape`) — frente `pro-fechamento-recebimento`

Pedido (mesma sessão): "passo 2 autorizado". Decisões do usuário no shape:
recebimento = **data + forma, marcado à mão** (colunas próprias, não status);
"Finalizar" com pendência **avisa e deixa concluir**; topo com **três números:
Recebido · A receber · Em execução**. Desenho confirmado: "confirmado".

**O que muda**
- Migration `aplicar_20271114600000_pro_servicos_recebimento.sql`: `concluido_em`,
  `pago_em`, `forma_pagamento` (CHECK PIX/DINHEIRO/CARTAO/TRANSFERENCIA) e CHECK
  "data e forma juntas"; status segue com 4 valores. Sem policy nova.
- `utils/proPainelResumo.ts`: números do topo, lista "Aguardando pagamento",
  dias desde a conclusão, mensagem de cobrança (valor + Pix Copia e Cola) e link
  do WhatsApp.
- Tela do serviço: "Finalizar" abre resumo (etapas x/y, assinatura, valor) com
  "Concluir mesmo assim"; concluir NÃO sai da tela; estado Concluído com "Cobrar
  no WhatsApp", "Recebi" (forma + data) e "Comprovante"; Recebido mostra data e
  forma, esconde o PIX e oferece "Desfazer recebimento" (com confirmação);
  `alert` → toast; gravar não esconde a tela; mensagem do comprovante só diz
  "assinado" se houve assinatura. Elementos novos no padrão do app (§17, lucide).
- Painel: Recebido no mês · A receber · Em execução; lista "Aguardando pagamento"
  sem corte, do mais antigo, com "Cobrar" e "Recebi" (abre o serviço já no
  formulário de recebimento).

**Como sei que terminou**
- `__tests__/proPainelResumo.test.ts` verde (também com `TZ=America/Cuiaba`).
- Migration aplicada e conferida no banco (colunas + 2 CHECKs).
- Navegador com o fluxo inteiro (dados fictícios, gravações `pro_*` só na memória
  da aba): Cobrar → Recebi (Dinheiro) → Desfazer → Finalizar com pendência.
- PR com CI verde, merge, `conferir-producao.sh` ✅.

**Estado (14/11/2026): publicado** — PR #429, `17bf992` no `main` (CI verde de primeira);
`conferir-producao.sh "Aguardando pagamento"` ✅ (domínio serve `17bf992`). Frente fechada.
- Migration aplicada (os 2 serviços existentes eram PENDENTE: backfill não tocou
  nenhuma linha). Conferido: 3 colunas, `pro_servicos_forma_pagamento_check`,
  `pro_servicos_recebimento_completo_check`; `status_check` intacto.
- 10 testes do resumo verdes; `tsc` exit 0; travas de UI verdes.
- Navegador: números 200 / 480 / 350 batem com os dados; "Cobrar" abre
  `wa.me/5565999990000` com valor e Pix Copia e Cola; "Recebi" do painel abre o
  serviço rolado até o formulário; recebimento grava só `pago_em` (12h local) +
  `forma_pagamento`; desfazer grava `null` nas duas; "Finalizar" mostra "1 de 3
  (faltam etapas)" / "não colhida" / valor, conclui sem sair da tela e grava
  `concluido_em`; painel lista o novo concluído como "Concluído hoje".
- `check-ui-standard.sh`: sobra §8 nas pílulas de status do painel — preexistente,
  passo 4. O botão "Finalizar" (deste fluxo) já foi para o §17.

### 3. Casca (`/impeccable adapt`) — frente `pro-casca-adapt`

Pedido (mesma sessão): "autorizado".

**O que muda**
- `ProModule.tsx`: sai a moldura de celular (`md:max-w-md md:rounded-[32px]`).
  Celular: barra inferior `fixed` com `env(safe-area-inset-bottom)`, 4 colunas
  iguais (Agenda · Clientes · Novo · Ajustes), ícones lucide, rótulo 12px,
  `aria-current` na ativa, alvo de 64px; a casca reserva o espaço da barra.
  Computador: cabeçalho §20 (título/subtítulo mudam com a aba) + `TabsBar` §19.1
  com "Atualizar" e "Novo orçamento" (§17); casca inteira numa coluna `max-w-3xl`.
- Telas internas: sem `p-5` e sem fundo `#F3F7F9` próprios (o recuo é do Layout —
  no celular eram 16 + 20 px de cada lado); os `pb-20/24` que desviavam da barra
  antiga saíram. Agenda/Ajustes escondem o próprio cabeçalho em `md:`; Clientes
  esconde só seta + título e mantém "+ Cadastrar".
- "+" ficou como 3ª de 4 colunas iguais (rotulado "Novo"), não centralizado: com
  4 destinos não há centro; a assimetria do `justify-around` antigo é que pesava.

**Como sei que terminou**
- Computador: sem moldura; título muda com a aba; "Atualizar" recarrega.
- Celular (iframe 390px da mesma origem): barra visível sem rolar; último conteúdo
  acima da barra na Agenda e no serviço (tela mais longa).

**Estado (14/11/2026): implementado e conferido; falta publicar.**
- `tsc` exit 0; `check-ui-standard` limpo no `ProModule`; nos outros 4 arquivos
  sobra só §8 preexistente (passo 4); travas e testes do Pro verdes (50/50).
- Navegador com dados fictícios (`pro_*` simulado na aba, escritas recusadas — 0):
  computador mostra "Agenda"/"Clientes" com abas e "Novo orçamento" na coluna do
  conteúdo; celular 390px com barra fixa de 4 × 64px, "Carla" (último cartão da
  Agenda) e "Finalizar serviço"/"Pausar"/"Bloqueado" inteiros acima da barra.
- Achado e corrigido na conferência: esconder o cabeçalho de Clientes levava
  junto o "+ Cadastrar" no computador.
- Não verificado: Safari/iPhone real (área segura conferida só por código).

### 4. Linguagem visual do app (`/impeccable quieter` + `typeset`) — frente `pro-linguagem-visual`

Pedido (mesma sessão): "autorizado". Direção já decidida no passo 0: "Seguir o app (§16/§17)".

**O que muda** — as 5 telas (painel, orçamento, serviço, clientes, ajustes), por um mapa
único de tradução (cartão `rounded-[10px]` sem sombra difusa; primário §17 azul, um por
tela; secundários com borda; rótulo §21; status em texto colorido traduzido §8; emoji →
lucide; teal/ciano → azul/slate; `alert`/`window.confirm` → toast/`useConfirm`; textos de
8–10px → ≥ 12px; slate-400 em conteúdo → slate-600; classes inexistentes corrigidas;
campos `h-11` brancos com valor escuro §32; cartões e etapas acessíveis por teclado).
Feito por 3 agentes em paralelo (um por grupo de telas) com a mesma especificação; o
coordenador revisou, conferiu na tela e corrigiu o que escapou.

**Como sei que terminou**
- `check-ui-standard.sh` sem ❌ nas 6 telas do Pro; busca por degradê/8–10px/teal/ciano/
  classes inexistentes/`alert`/`window.confirm` vazia (fora do jsPDF).
- `tsc` exit 0; as 10 travas `*Guard*` + testes do Pro verdes.
- Navegador, computador e celular (390px), com dados fictícios: painel, serviço (3
  alturas), orçamento, clientes (cartão aberto) e ajustes.

**Estado (14/11/2026): implementado e conferido; falta publicar** (depende do #430).
- 6 telas sem ❌; busca vazia; `tsc` exit 0; 12 arquivos de trava/teste, 89 testes verdes.
- Achado na conferência e corrigido: dois azuis sólidos na tela do serviço ("Copiar Pix"
  virou secundário — o primário é "Finalizar serviço"); Title Case que sobrou no
  orçamento e em clientes ("Novo Orçamento Rápido", "Valor Cobrado", "Salvar e Enviar
  via WhatsApp", "Meus Clientes"…) → capitalização normal, como nas outras telas.
- Ajuste à especificação: `<label>` fica `text-slate-500` (a trava `rotuloPadraoGuard`
  só aceita esse; 4,8:1 passa o contraste); rótulos `<span>` em slate-600.
- Decisões dos agentes aceitas: "Colher assinatura" sem "Touch"; "×" das fotos com alvo
  de 44px e quadrado visível de 32px; "Adicionar modelo" secundário (primário da tela é
  "Salvar configurações"); emoji dentro de `<option>` virou `<optgroup>`; `ClientSelect`
  alinhado por `triggerClassName` (sem tocar no componente); `BLOQUEADO` passa a
  aparecer "Bloqueado" no painel (antes caía em "Pendente").
- Fica para o passo 5: `htmlFor` nos rótulos de Ajustes; texto "QR Code Dinâmico" e
  opções do select de profissão (passo 6).

### 5. Números, acessibilidade e menores (`/impeccable harden`) — frente `pro-numeros-acessibilidade`

Pedido (mesma sessão): "Autorizado". ("A receber" já tinha sido corrigido no passo 2.)

**O que muda**
- Agenda (`utils/proAgenda.ts`, testado): atrasado (agendado antes de hoje e aberto) vai
  para o topo de "Hoje" em vermelho; serviço sem data vai para o fim de "Próximos" como
  "Sem data marcada" (antes caía em "Hoje" pela criação do orçamento); "Próximos" em
  ordem de data e sem corte; orçamentos com "Ver todos os N".
- Erro de rede com saída: painel, clientes e serviço mostram aviso + "Tentar de novo"
  (antes: painel "R$ 0,00 / Nenhum serviço", clientes vazio, serviço "não encontrado");
  serviço inexistente ganha "Voltar à agenda".
- Clientes: "Total acumulado" (somava ENVIADO) vira "Total aprovado" (só APROVADO).
- Cidade do profissional: migration `aplicar_20271114800000_pro_config_cidade.sql`
  (`pro_config.cidade`, aplicada) + campo em Ajustes; vai no campo 60 do Pix (vazio =
  BRASILIA, como antes).
- Ajustes: os 11 rótulos ligados ao campo (`htmlFor`/`id`); chave Pix opcional.
- Ditado por voz (`utils/proDitado.ts`, testado): nomes com acento; "para" solto só vira
  cliente se casar com um cadastrado.
- Fotos do serviço passam pelo `utils/comprimirFoto.ts` que o Diário já usa (2048 px,
  JPEG, EXIF, HEIC) antes do base64.
- Orçamento: a aba do WhatsApp nasce no próprio toque (Safari bloqueia `window.open`
  depois de `await`) e recebe o link depois de salvar; fecha se salvar falhar. PDF leva o
  endereço do cliente já cadastrado (antes só o do cliente novo).

**Como sei que terminou**
- `proAgenda` 5 testes e `proDitado` 5 testes verdes; `tsc` exit 0; guia sem ❌; travas.
- Navegador (celular 390px, dados fictícios, 0 escritas): agenda com atrasado/sem data/
  ver todos; erro e recuperação no painel e no serviço; Pix com a cidade; foto
  comprimida; rótulos ligados; total aprovado.

**Estado (14/11/2026): implementado e conferido; PR depois do merge do #434.**
- 16 arquivos de teste, 145 testes verdes (inclui `comprimirFoto` e `diarioFonte`, que
  usam o utilitário de foto); `tsc` exit 0; 6 telas sem ❌.
- Navegador: "Atrasado · 12/11" no topo de Hoje; "Sem data marcada" no fim de Próximos;
  "Ver todos os 6 orçamentos"; queda de rede → aviso → "Tentar de novo" recupera (painel
  e serviço); Pix com `6006CUIABA`; PNG de 20 MB/3000×2000 → JPEG 2048×1365 (pior caso,
  ruído); 11/11 rótulos ligados, tocar em "Cidade" foca o campo; Ana: "Total aprovado
  R$ 350,00" (o ENVIADO de R$ 260 não entra mais).
- Achado e corrigido na conferência: o aviso de erro mostrava "(TypeError: Failed to
  fetch)" — jargão; o detalhe fica só no console.
- Deslize registrado: um `Write` sobrescreveu `utils/comprimirFoto.ts` (do Diário);
  restaurado com `git checkout` antes de qualquer commit e passou a ser reutilizado.
- Não verificado: ditado no microfone real e WhatsApp no Safari do iPhone (sem aparelho);
  a lógica do ditado está coberta por teste.
- Fica de fora: checklist fixo de 3 etapas (editar etapas é recurso novo) e profissão
  padrão "Ar-condicionado" sem cadastro.

### 6. Textos (`/impeccable clarify`) e 7. polimento final (`/impeccable polish`) — frente `pro-textos-polimento`

Pedido (mesma sessão): "passos 6 (textos) e 7 (polimento final) autorizados". Feitos juntos.

**O que muda — textos**
- Erros sem jargão: toasts de falha dizem o que falhou e "Confira a internet e tente de
  novo." (antes juntavam a mensagem crua do servidor); "Por favor…"/"com sucesso!" saem.
- PDF do orçamento: quem emite é o profissional (nome comercial + cidade), não
  "Profissional Autônomo Parceiro ÒPURA Pro"; comprovante: "Concluído em" pela data de
  conclusão real (antes: data da assinatura ou o dia em que o PDF era gerado).
- "QR Code Dinâmico" (falso — o QR é estático) → "Vai no QR Code e no Pix Copia e Cola…".
- Excluir modelo em Ajustes avisa a verdade: só vale ao "Salvar ajustes".
- Termos: a tela é "Ajustes" em todo lugar (título, subtítulo, botão "Salvar ajustes",
  aviso de Pix); "Notas" → "Observações"; "Cliente & local" → "Cliente e local"; opções
  de profissão e exemplos em capitalização normal; placeholders viram exemplos.
- Estados vazios com o próximo passo: painel ("Criar o primeiro orçamento"; quando
  aparecem os serviços de hoje), clientes, modelos.

**O que muda — polimento**
- Um primário azul por tela: "Cobrar" da lista "Aguardando pagamento" vira secundário
  com destaque azul (com vários devedores, eram vários primários + "Novo orçamento").
- "Recebido R$ 0,00" deixa de ser verde (verde só quando há valor).
- Limpeza: imports de tipo sem uso (3) e props mortas (`onSave` do serviço desde o
  passo 2; `onNavigate` do painel, nunca usado).

**Como sei que terminou**
- `tsc` exit 0; 6 telas sem ❌; travas + testes do Pro verdes.
- Detector do impeccable: 38 achados na crítica → 2 (`text-[13px]` dos botões §17 do
  computador — tamanho canônico do app; a régua do detector é o DESIGN.md do Portal do
  Colaborador).
- Navegador: celular 390px vazio (painel, clientes, ajustes) e com dados (painel, serviço
  concluído com Recebi); computador; console sem erro.

**Estado (14/11/2026): implementado e conferido; PRs em fila** (#434 → passo 5 → este).
- `tsc` exit 0; 14 arquivos de trava/teste, 99 testes verdes; 6 telas sem ❌; detector 2
  avisos intencionais; 0 erro de console; 0 escrita.
- A crítica de 14/11 (17/40) fica encerrada pelo próprio helper: o alvo mudou desde ela.
  Uma nova `/impeccable critique` mede a nota de agora.
- Fica de fora: editar etapas do checklist (recurso novo); profissão padrão sem cadastro;
  ditado e WhatsApp sem teste em aparelho real.
