# Empreendimento: objetivo "Imobilizado"

## Pedido original (25/11/2026)

> incluir mais um objetivo : Imobilizado

Continuação de `docs/planos/2026-11-21-empreendimentos-objetivo-servico-agrupar.md` (Serviço).

## Decisão

**Imobilizado não mostra nenhum espelho**, como o Serviço: é o imóvel que a empresa mantém no
ativo (nem à venda, nem para locar). Decidido por analogia com a escolha do usuário para o Serviço
("Nenhum espelho"); se o Imobilizado precisar de um espelho, basta mudar `espelhosDoObjetivo`.

## Itens

1. **Banco** — `aplicar_20271125500000_empreendimento_objetivo_imobilizado.sql`: CHECK aceita
   `IMOBILIZADO`. Idempotente, aplicada antes do push.
   *Pronto quando:* `pg_get_constraintdef` lista os 5 valores. ✅
2. **Tipo e regra** — `types/empreendimento.ts`, `utils/empreendimentoObjetivo.ts` (rótulo
   "Imobilizado", último na lista; `objetivoDe` lê de `OBJETIVOS`, sem repetir a lista).
   *Pronto quando:* `espelhosDoObjetivo('IMOBILIZADO')` = nenhum espelho (teste). ✅
3. **Textos** — Sincronização usa o rótulo do objetivo (não mais "Serviço" fixo); ajuda do campo
   cita "nenhum (Serviço e Imobilizado)". ✅
4. **Credit Room** — card/book do empreendimento Imobilizado mostra só "Renda do mês" (sem VGV,
   que cairia no padrão de Vendas). *Pronto quando:* teste do card passa. ✅

## Estado

- [x] Itens 1–4
- [ ] Publicação (PR → CI → merge → conferir-producao)
