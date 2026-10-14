# Portal do Corretor (visão do corretor): saudação e "Meus dados"

## Pedido original

> portais > portal do corretor (visão corretor):
> 1. da mesma forma que foi implementado em portais > portal do parceiro implemente saudacao (veja print)
> 2. Painel superior direito (veja print) com o mesmo estilo / design usado em portais > portal do parceiro i(veja print) para meus dados
>
> Sessão: a530604b-96d1-40ab-b124-19a71a41f077 · 2026-10-14 ~15:10

Prints anexados ao pedido (Portal do Parceiro, link público):
1. Cabeçalho: badge "PARTNER PORTAL" + nome do parceiro ("Álvaro Esteves Junior").
2. Menu da conta (canto superior direito): avatar + nome + e-mail; itens Meus dados ·
   Minha conta · Preferências · Notificações · Ajuda.
3. Painel lateral "Meus dados": cards do `PortalKit` (Identificação, Endereço e
   contato, Dados bancários), rótulo à esquerda e valor à direita.

## Decisões tomadas

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-14 | Qual visão é "visão corretor"? | A casca pública do link (`isStandalone`, `portalToken`) — é onde vive o menu da conta, igual ao parceiro. A visão interna (Portais › Portal do Corretor dentro do Layout) não tem esse cabeçalho. |
| 2026-10-14 | Reusar `PortalMyData` (fornecedor/parceiro)? | Não: a entidade é `broker_profiles` (pessoa, CRECI, imobiliária, comissão), sem endereço nem conta bancária. Mesmo DESENHO (cards do kit), componente próprio e puro: `components/broker/BrokerMyData.tsx`. |
| 2026-10-14 | Precisa de RPC nova? | Não. `broker_portal_get_data` já devolve a linha inteira do corretor (`row_to_json`), e `App.tsx` a passa como `initialBroker`. O painel lê `effectiveBroker`. |
| 2026-10-14 | Acento | Indigo, identidade da casca pública do corretor (§19.2/§24 do guia) — não o coral do kit. |

## Plano

1. `components/broker/BrokerMyData.tsx` (novo) — painel puro com três blocos
   (Identificação · Contato · Comissão) no desenho do `PortalMyData`; campo vazio some.
   **Pronto quando:** `__tests__/components/BrokerMyData.test.tsx` passa.
2. `components/BrokerPortal.tsx` — (a) saudação: o `<h1>` do cabeçalho público passa de
   "Portal do Corretor" para o nome do corretor, como no parceiro; (b) item "Meus dados"
   antes de "Minha conta" no menu da conta; (c) `Sheet` "Meus dados" (§26, `size="xl"`)
   com o `BrokerMyData`. **Pronto quando:** no link público o cabeçalho mostra o nome,
   o menu abre "Meus dados" e o painel lateral aparece com os cards (print Playwright).
3. `__tests__/components/BrokerMyData.test.tsx` (novo) — blocos, formatação de CPF e
   comissão, campo vazio some, inativo, sem cadastro. **Pronto quando:** `npx vitest run`
   nele passa.

## Estado

- [x] 1 — `BrokerMyData.tsx` criado
- [x] 2 — `BrokerPortal.tsx` editado
- [x] 3 — teste criado
- [x] typecheck + vitest (14/14 nos dois painéis) + check-ui-standard limpo nos 2 arquivos
- [x] prova visual no navegador (link público do corretor "zoio", preview do build, Playwright
      `C:/tmp/pwtest/corretor-meus-dados.js`): cabeçalho com o nome, menu com "Meus dados"
      em 1º, painel lateral solto (§26) com Identificação / Contato / Comissão, Escape fecha,
      zero erros de console
- [ ] push em `main` + `conferir-producao`

## Verificação

```bash
npx vitest run __tests__/components/BrokerMyData.test.tsx
npx tsc --noEmit -p .
bash scripts/check-ui-standard.sh components/BrokerPortal.tsx components/broker/BrokerMyData.tsx
```

No navegador: abrir `/portal-corretor?token=<token ativo>`; o cabeçalho deve mostrar
"BROKER PORTAL <nome do corretor>"; clicar no chip da conta → "Meus dados" → painel
lateral com Identificação / Contato / Comissão.
