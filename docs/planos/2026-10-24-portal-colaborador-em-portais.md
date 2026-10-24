# Portal do Colaborador: de Recursos Humanos para Portais

## Pedido original

Sessão `6863b925-c5a1-45aa-a7fc-d3bd12b7048a` · 24/10/2026:

> mover recursos humanos > portal do colaborador para Portais

## Decisões

| Data | Pergunta | Decisão |
|---|---|---|
| 24/10/2026 | Muda a rota? | Não. A view continua `labor-portal` (AppRouter e `LaborModule` intactos, links e views salvas seguem valendo). Como o id tem prefixo `labor-`, o dropdown do RH passa a excluí-lo (`isLaborView`) — senão o RH abriria e acenderia junto com Portais. |
| 24/10/2026 | E a permissão? | Continua a do RH (`canViewLabor`, matriz `rh`), aplicada pelo AppRouter. No menu, o item aparece com `mod.rh`. |
| 24/10/2026 | Quem tem RH sem administrar a organização (Portais oculto)? | Vê "Portal do Colaborador" como item solto — mesmo tratamento do Portal de Treinamentos (16/10/2026), senão perderia o acesso. |
| 24/10/2026 | Nome | "Portal do Colaborador", no padrão dos outros portais ("Portal do Cliente", "Portal do Fornecedor"); o título da tela acompanha. |

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/Layout.tsx` | item sai do RH; entra em Portais (menu lateral e menu do celular); item solto para quem não vê Portais; Portais abre/acende com o portal ativo e o RH não; busca rápida "Portal do Colaborador" | navegador: item em Portais, ausente do RH; clicar abre a tela com Portais aberto e RH fechado |
| 2 | `components/LaborPortal.tsx` | título "Portal Colaborador" → "Portal do Colaborador" | navegador |

## Estado

- [x] 1 · 2 — `tsc --noEmit` 0 erros; `check-ui-standard` sem violação nos 2 arquivos
- [x] Verificação no navegador (24/10/2026, `c:/tmp/pwtest/portal-colab-menu.cjs`, servidor da frente, conta agente-leitura, nada salvo): na Garden (admin) `#/labor-portal` abre com título "Portal do Colaborador", Portais aberto sozinho com o item, RH fechado; aberto o RH, "Portal Colaborador" não está mais lá; Dashboard → Portais › Portal do Colaborador leva à tela. Sem erro de console nem 4xx/5xx. O item solto (quem tem RH sem ver Portais) não foi visto: a conta enxerga Portais nos dois contextos testados.
- [x] Publicação: `main` em `53ff8dcd` (24/10/2026, PR #122); domínio conferido servindo o commit; check-run `ci` do PR verde
