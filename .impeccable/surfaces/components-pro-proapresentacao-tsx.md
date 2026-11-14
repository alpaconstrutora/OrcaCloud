---
version: 1
slug: "components-pro-proapresentacao-tsx"
primary_target: "components/pro/ProApresentacao.tsx"
related_targets: ["components/pro/ProPublico.tsx"]
---

# ÒPURA Pro — página de apresentação (`/pro` sem sessão)

**Modo:** Persuade. **Plano:** `docs/planos/2026-11-14-opura-pro-publico.md` (P4).

**Quem chega:** autônomo de fora (eletricista, pintor, técnico de ar-condicionado), no celular,
por um link no WhatsApp. **Ação:** criar conta grátis (Google ou código por e-mail).
**Crença a criar:** "mando um orçamento bonito no WhatsApp em 1 minuto, e é grátis".
**Prova:** a demonstração do próprio produto (não há clientes, números nem depoimentos — não inventar).
**Restrições do usuário:** preço = "Grátis", sem prazo, + "sem cartão"; abertura = orçamento pronto no
WhatsApp; rodapé = "feito por uma construtora" (sem citar a Alpa); visual = o do app (o mesmo que o
autônomo vê depois de entrar).

## Direction contract

THESIS: A primeira tela já é o produto: o visitante escreve serviço, cliente e valor e vê, ali mesmo,
o orçamento em PDF chegando no WhatsApp do cliente. Recusa o arranjo da categoria (título + subtítulo +
botão sobre um celular de enfeite + fileira de três cartões de recurso).

OWN-WORLD: O mundo do app: fundo slate-50, tinta slate-900, um azul de ação (#2563EB, botão compacto
§17 em 52px no celular), campos brancos de 6px de canto, cartões de 10px com borda slate-200. O único
material de fora é o próprio objeto demonstrado: a conversa do WhatsApp (papel de parede bege, balão
verde #DCF8C6, ✓✓), com o cartão do PDF dentro.

STORY: Entende em uma linha o que é; mexe nos campos e vê o orçamento dele virar mensagem; acredita
que é rápido e que fica profissional; descendo, vê o resto do dia (Pix na hora com QR, assinatura no
celular, quem me deve) e que é grátis; toca em "Mandar de verdade — conta grátis".

FIRST VIEWPORT: Barra fina com "ÒPURA Pro" e "Entrar". Título de 2–3 linhas em 30px preto ("Seu
orçamento no WhatsApp do cliente em 1 minuto."), uma linha de convite. Cartão da demonstração com
Serviço (largura toda) e Cliente + Valor lado a lado, editáveis. Logo abaixo, a conversa do WhatsApp
com o balão do PDF se atualizando a cada tecla. Ação fixa no rodapé da tela: "Mandar de verdade —
conta grátis" + "Grátis. Sem cartão, sem senha." (revisão final de 14/11/2026: o texto era
"Mandar de verdade — criar conta grátis" e quebrava em duas linhas a 360 px; virou "Mandar de verdade —
conta grátis"). Com um campo em foco, a barra de ação sai e uma prévia compacta da mensagem fica
sobreposta logo abaixo da barra do topo (o teclado do celular cobriria o balão).

FORM: Estrutura 5 de 7 da lista ordenada ("demonstração que funciona na primeira tela"), sorteada para
liderar e escolhida pelo usuário. seed:fed77fbe51f9c0e4
Interação-assinatura: o balão do WhatsApp se recompõe enquanto o visitante digita (valor formatado
em reais, nome do cliente na saudação, hora atual, ✓✓ aparecendo depois de uma pausa curta); com
`prefers-reduced-motion`, atualiza sem animação.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
