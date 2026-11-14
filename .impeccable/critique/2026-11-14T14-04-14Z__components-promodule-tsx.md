---
target: ÒPURA Pro
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:C:\\D\\frentes\\critique-opura-pro\\components\\ProModule.tsx"
target_fingerprint: "sha256:0369eef4be0fc1f87dacec3a99e6fb2929bb6b7bf422ae95a78ae1996c14feda"
target_path: "C:\\D\\frentes\\critique-opura-pro\\components\\ProModule.tsx"
timestamp: 2026-11-14T14-04-14Z
slug: components-promodule-tsx
---
Method: dual-agent (A: revisão de design · B: detector + navegador)

## Saúde do design — 17/40 (Ruim)

| # | Heurística | Nota | Problema-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 2 | Sucesso por `alert()` (ProServicoView:300); salvar troca o formulário inteiro por "Processando..." (ProOrcamentoForm:417); PDF baixa sem aviso |
| 2 | Linguagem do mundo real | 3 | Textos de WhatsApp naturais; mas status cru "APROVADO" (ProDashboard:332), "Faturamento" = concluído, não recebido; "QR Code Dinâmico" é estático (ProConfigForm:260) |
| 3 | Controle e liberdade | 1 | "Finalizar" e "Bloqueado" num toque, sem confirmar nem desfazer (ProServicoView:781,794); "Rascunho" rebaixa orçamento ENVIADO (ProOrcamentoForm:677); voltar descarta sem aviso |
| 4 | Consistência e padrões | 1 | Teal em degradê + emoji + `alert`/`window.confirm` contra o azul compacto, lucide e toast do app (§14/§16/§17); classes inexistentes `slate-450/650/750/505`, `border-slate-250`, `teal-150` |
| 5 | Prevenção de erros | 1 | Chave PIX montada por palpite (ProServicoView:37); assinatura gravada branca sobre transparente; telefone sem validação; excluir cliente em cascata com `confirm` |
| 6 | Reconhecer em vez de lembrar | 2 | Painel mostra só 3 orçamentos e 3 serviços sem "ver todos"; serviço concluído não aparece em lista nenhuma |
| 7 | Flexibilidade e eficiência | 2 | Modelos, voz e WhatsApp aceleram; sem busca de cliente, atalhos ou lote |
| 8 | Estética e minimalismo | 2 | Cartões limpos, mas tudo `font-black`, emoji em cada botão, degradê em 5 telas, calculadora opcional sempre aberta |
| 9 | Recuperação de erros | 1 | Erro de busca só no console (ProDashboard:73): falha de rede vira "R$ 0,00 / Nenhum serviço"; "Serviço não encontrado" sem saída |
| 10 | Ajuda e documentação | 2 | Bons placeholders, mas ajuda em 8px ilegível (ProConfigForm:207,222,260); vazios sem ação |
| **Total** | | **17/40** | **Ruim** |

## Veredito de especificidade

LLM: o Pro não fala a língua da ÒPURA nem da Alpa — é um template genérico de "app de serviço de campo" enxertado (os comentários dizem "Stripe Light Style", ProDashboard:172). Degradê teal→ciano, emoji como ícone, rótulos 8–9px em `font-black uppercase tracking-widest`. Contraria o guia (§16 cantos, §17 botão azul compacto, #348 sem caixa alta) e o DESIGN.md, que rejeita degradê. No computador é um celular desenhado (moldura `md:max-w-md md:rounded-[32px]`) no meio de 1920px, sob um seletor de organização que o Pro ignora (grava por user_id). Três idiomas no mesmo módulo: teal na tela, azul do app no "+ Novo cliente", slate/laranja no PDF. O que é específico é o conteúdo (WhatsApp, recorrência, modelos por profissão), não o design.

Detector: 38 achados, todos `design-system-font-size` (advisory, exit 0): 28 em 9px, 9 em 8px, 1 em 13px. Todos verdadeiros no conteúdo, inclusive botões de ação e o código PIX em 9px; a régua usada é o DESIGN.md do Portal do Colaborador, porque o Pro não tem DESIGN.md/brief próprio. O detector não pega o resto (degradê, emoji, classes inexistentes, P0s funcionais) — a revisão pegou.

Overlay: não rodou. O Chrome bloqueia acesso de orcacloud.vercel.app ao localhost (permissão `loopback-network` = denied). Nenhum overlay visível.

## Problemas prioritários

1. [P0] Assinatura de aceite invisível — traço `#FFFFFF` (ProServicoView:186) em canvas transparente; o fundo escuro é só CSS. Grava branco sobre transparente: some no cartão e no PDF. Coordenadas não escalam canvas 320px × exibição w-full (:216-227). Fix: fillRect branco + traço grafite; multiplicar por canvas.width/rect.width. → /impeccable harden
2. [P0] PIX que cai em chave errada — ignora `pix_key_type`; CPF com máscara vira telefone +55 (:36-37); cidade fixa "BRASILIA" (:77); recebedor = cabeçalho do PDF; QR gerado em api.qrserver.com (:546), mandando chave e valor para fora e falhando sem rede. Fix: decidir pelo tipo, validar em Config, QR local (qrcode já é dependência), mostrar "Você vai receber em: nome · chave" antes do QR. → /impeccable harden
3. [P1] O fechamento perde o pico — "Finalizar" sem confirmar nem conferir etapas/assinatura, `alert`, volta ao painel que filtra CONCLUIDO; "Enviar comprovante" só alcançável pelo cartão do orçamento entre os 3 mais recentes; não existe estado "pago". Fix: resumo de confirmação, estado Concluído na própria tela com "Cobrar PIX"/"Enviar comprovante" como ação principal, lista "aguardando pagamento", status Pago, toast. → /impeccable shape
4. [P1] Casca: barra inferior não é fixa (`absolute bottom-0` dentro de `relative min-h-full`, ProModule:42,89 — só aparece no fim da página); "+" fora do centro; emoji; rótulos 9px; sem aria-current; moldura de celular no desktop. Fix: fixed/sticky com safe-area, grade de 5 com "+" central, lucide, ≥11px; no md: cabeçalho §20 do app. → /impeccable adapt
5. [P1] Linguagem visual estrangeira — degradês (ProModule:112, ProDashboard:275, ProOrcamentoForm:670/684, ProServicoView:782/810, ProConfigForm:427), 37 textos de 8–9px, classes inexistentes, alert/confirm contra §14. Fix: decidir — ou o Pro segue o app (§16/§17), ou vira exceção registrada (como a §24) com DESIGN próprio; em ambos, texto ≥12px e 4,5:1. → /impeccable typeset + quieter

## Red flags por persona

Alex (power user): sem busca/filtro de clientes; listas param em 3; sem lista de todas as OS; cartões e etapas são div onClick fora do Tab (ProDashboard:200,306,362; ProClientesLista:214; ProServicoView:599); `alert` bloqueante a cada gravação.
Sam (leitor de tela/teclado): "+" sem aria-label (ProModule:114); "🔄" só com title; setas "←" sem nome; etapas não são checkbox; campos de cliente só com placeholder (ProClientesLista:155-181, ProOrcamentoForm:508-527); teal-600/cyan-600 em rótulos e slate-400 em vazios abaixo de 4,5:1 (estimado); assinatura sem alternativa.
Casey (celular, polegar): botões de WhatsApp ~26px; "×" de foto 24px; "Refazer Assinatura" link de 9px; campos h-9; barra inferior só no fim; 3 colunas Unidade/Qtd/Unitário a 360px; Faturamento visível ao entregar o celular ao cliente para assinar (princípio 4).

## Números que mentem (P2)

"A Receber" soma pendente/andamento/bloqueado e exclui o concluído não pago (ProDashboard:42-49); "Total Acumulado" do cliente soma orçamentos só ENVIADOS (ProClientesLista:203); BLOQUEADO aparece como "Pendente"; "Próximos" inclui atrasados sem ordenar; serviço sem agendamento cai em "Hoje" pela data de criação do orçamento (:134); erro de rede = vazio.

## Observações menores

Título "ÒPURA Pro" repete a sidebar (§18). Fotos em base64 sem compressão. Voz: regex `[a-zA-Z]` falha em "João". PDF diz "Profissional Autônomo Parceiro ÒPURA Pro" sem nome/documento/telefone e só traz endereço se o cliente for novo. Checklist fixo de 3 etapas. Profissão padrão = ar-condicionado. Chave PIX obrigatória para salvar o perfil. Toast de Config fora da moldura. window.open do WhatsApp após vários await (Safari bloqueia).

## Perguntas

1. Quem é o usuário do Pro — autônomo de fora da Alpa (outro produto, com marca própria) ou técnico interno (então por que sem organização e sem ligação com Obras/Financeiro)?
2. Se o momento que importa é receber, por que não existe "pago"?
3. Para que a moldura de celular no computador, em vez de uma visão de gestão em tabela?
