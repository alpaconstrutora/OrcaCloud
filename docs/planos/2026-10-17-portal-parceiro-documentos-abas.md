# Portal do Parceiro › Documentos — Recebidos × Enviados em abas

## Pedido original

Sessão `8f26dd16-2ad2-4892-9409-e4a2162ddf7c`, 17/10/2026 (com print da tela):

> portal do parceiro (visao do parceiro) > Documentos Compartilhados:
> o que é melhor do ponto de vista UX. melhor
> 1. Aumentar o tamnho do título de Enviados por você e colocar título ma tabela abaixo de Recebidos por voce. Porem teremos um problema aqui que é quando a tabela de documento enviados por voce aumentar a tabela de recebido por voce ficara cada vez mais para abaixo e nao havera uma divisao óbvia e ele tera que rolar a a barra de rolagem cada vez mais para baixo para encontrar a outra tabela.
> 2. ou a opcao depois que seria criar duas abas (documentos enviados e documentos recebidos)

Recomendação dada: abas (opção 2), abrindo em Recebidos, com contador, selo de
novidade em Enviados e "Enviar Documento" levando à aba Enviados. Resposta:

> Quer que eu implemente as abas nessa tela, seguindo o padrão de abas do guia de UI do projeto? sim

## Decisões

- **Mesmas colunas nas duas abas** — mantido o pedido de 03/10/2026 ("a tabela de
  documentos enviados … deve ter as mesmas colunas"). A sugestão de tirar "Autor"
  em Enviados NÃO foi aplicada por contrariar esse pedido.
- **Aba não persiste entre recargas** (`useState`): toda entrada abre em Recebidos,
  que é onde o tour guiado procura `documentos-busca`/`documentos-tabela`. Trocar
  de seção no menu e voltar mantém a aba. O tour que navega para Documentos força
  Recebidos (`onNavigate`).
- **`TabsBar` ganhou `accent="orange"` e `badgeTom: 'novo'`** — o portal é laranja
  inteiro; registrado no guia §19.1.
- **Selo "N atualizado(s)"**: último status VISTO de cada envio fica no
  `localStorage` (`partnerPortal:sentDocsStatusVisto`). Envio desconhecido entra
  com o status atual (não é novidade); abrir Enviados sincroniza tudo.

## Itens

1. ✅ `components/partner/PartnerPortal.tsx` — duas tabelas empilhadas viram
   `TabsBar` Recebidos/Enviados; título e subtítulo mudam com a aba; Enviados
   aparece mesmo vazio, com estado vazio próprio; enviar leva à aba Enviados.
   *Pronto quando:* `__tests__/components/PartnerPortalEnviadosPorVoce.test.tsx` (7 testes) passa.
2. ✅ `components/ui/TabsBar.tsx` — props `accent` e `badgeTom: 'novo'`, padrão inalterado.
   *Pronto quando:* testes das telas que usam abas (23 arquivos) seguem verdes.
3. ✅ `utils/portalHelpDefaults.ts` — tour e artigo deixam de citar "Enviados por você".
   *Pronto quando:* `portalHelpDefaults.test.ts` e `PortalHelp*` verdes.
4. ✅ `docs/ui_ux_guia_unificado.md` §19.1 — `accent` e `badgeTom: 'novo'` documentados.
5. ✅ Verificação visual no navegador (portal por link público). *Pronto quando:*
   print da tela com as duas abas. Feito no dev server da frente com o link do
   workspace do Álvaro Esteves Junior: Recebidos 4 / Enviados 1, título troca,
   1 tabela por aba, sem erro de console, 390px sem rolagem lateral.

## Publicação

- tsc local caiu (crash do V8 da máquina, 0xC0000005) — prova de tipos pelo PR
  de rascunho #32: `ci` pass (15 min), build do Vercel pass.
- `a149f991` empurrado para main; `conferir-producao.sh "Documentos Enviados"`:
  o domínio serve exatamente origin/main (a149f99), texto novo no bundle.
