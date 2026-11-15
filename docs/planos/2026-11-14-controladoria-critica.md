# Controladoria — correções da crítica de design (6 passos)

## Pedido original

> /impeccable critique controladoria

Sessão: 475598e2-eda4-4794-941f-d458b7a27c35 · 14/11/2026, noite.

A crítica (dois avaliadores isolados + detector, produção com escrita bloqueada) deu
**16/40** e está arquivada em
`.impeccable/critique/2026-11-15T00-22-40Z__components-controladoriamodule-tsx.md`.

Pedidos seguintes, no mesmo dia:

> (perguntas da crítica) "Por qual começo?" → **Números primeiro (Recomendado)** ·
> "Como a Controladoria deve se comportar?" (período/regime) → **Um período para todas (Recomendado)** ·
> "Quanto quer resolver agora?" → **Tudo, incluindo o P2**

> um de cada vez

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/11/2026 | Por onde começar (números × acessibilidade × unificar abas) | Números primeiro |
| 14/11/2026 | Período e regime por aba ou um só | Um período para todas as abas |
| 14/11/2026 | Escopo | Tudo, incluindo o P2 (redesenho das abas) |
| 14/11/2026 | Ritmo | Um passo de cada vez |

Decisão técnica registrada (não perguntada — convenção da DRE): **toda margem % da
Controladoria é sobre a Receita Líquida** (DRE, DRE por SPE, Por Obra). Antes a DRE dividia
pela bruta e a SPE pela líquida.

## Plano

Ordem dos passos = ordem do plano de ação da crítica. Cada passo é um PR.

### Passo 1 — `/impeccable harden`: os números (este PR)

| # | O que muda | Como sei que terminou |
|---|---|---|
| 1.1 | Resposta fora de ordem é descartada nas 6 abas (`hooks/useCargaVigente.ts`, o `loadSeq` do guia §22 num hook) | `__tests__/components/DREReportCarga.test.tsx` "resposta antiga…" passa, e FALHA com a guarda removida (conferido) |
| 1.2 | Período inválido (data incompleta, ano < 1900 no meio da digitação, início > fim) não consulta e diz o motivo (`utils/periodoControladoria.ts`, `components/controladoria/EstadosDaCarga.tsx`) | teste "início depois do fim" + `__tests__/periodoControladoria.test.ts` |
| 1.3 | "Hoje" no fuso local no WIP, no Diário e no padrão de `getProjectWIP` (era UTC: 15/11 à noite de 14/11) | teste `hojeLocalISO` 23h30 |
| 1.4 | Margem única sobre receita líquida (DRE, SPE, Por Obra); "Margem: —" sem seta quando não há base; % em pt-BR (vírgula) | testes "margem" do DREReportCarga + `margemSobreReceitaLiquida` |
| 1.5 | **Por Obra fecha com o Resumo:** `fn_dre_projects_summary` ganha `p_regime`, a linha "Sem obra" e as mesmas regras da DRE (receita = Receita Bruta, resultado = Resultado Líquido); coluna `receita_liquida` para a margem. Migration `aplicar_20271114900000_dre_por_obra_regime_e_sem_obra.sql` | SELECT só de leitura com o mesmo SQL em produção (2026, Caixa, todas as orgs): soma por obra = R$ 4.000,00 / −R$ 5.021,18 = total direto = o que a DRE mostra. Depois de aplicada: `db query` chamando a função e o Total da tela = Resultado Líquido |
| 1.6 | DRE por SPE explica o "tudo zero" (Caixa só conta conciliado; a DRE geral soma obras sem SPE e lançamentos sem obra) | aviso aparece com SPE com movimento e valores 0 |
| 1.7 | Diário traz o período inteiro paginando (era `.limit(200)` com KPIs de total) | `__tests__/diarioServicePaginacao.test.ts` (2.350 → 3 páginas) |
| 1.8 | Falha de carga = mensagem com "Tentar de novo" no lugar dos números (era só toast + tela em branco ou número velho); KPIs do Diário somem durante falha/período inválido | teste "falha" do DREReportCarga |

⚠️ **Ordem de publicação do passo 1:** a migration vai ao banco ANTES do merge. O front
novo chama a função com `p_regime`; sem a migration, o "Por Obra" falha (PGRST202). O front
publicado hoje continua funcionando com a função nova (3 argumentos nomeados → regime padrão).

Movido para o passo 2: remover o botão "Atualizar" — a barra de filtros de cada aba é
substituída pela barra única do módulo no passo 2, e o botão sai junto.

### Passo 2 — `/impeccable layout`: o período único
De/Até, regime e obra sobem para o `ControladoriaModule`, numa barra só; a obra aberta no
topo vira o valor inicial; título/subtítulo por aba no módulo; abas no `TabsBar` (§19.1).
Critérios: a definir ao começar o passo (este arquivo será atualizado).

### Passo 3 — `/impeccable clarify`: números que levam à ação
### Passo 4 — `/impeccable distill`: uma linguagem para as seis abas
### Passo 5 — `/impeccable audit`: acessibilidade AA
### Passo 6 — `/impeccable polish`

(Escopo de cada um no relatório da crítica; os critérios entram aqui quando o passo começar.)

## Estado

- [ ] Passo 1 — código e testes prontos na frente `controladoria-numeros`; falta aplicar a migration (autorização do usuário) e publicar
- [ ] Passo 2
- [ ] Passo 3
- [ ] Passo 4
- [ ] Passo 5
- [ ] Passo 6

## Verificação

- Passo 1: `npx vitest run __tests__/periodoControladoria.test.ts __tests__/diarioServicePaginacao.test.ts __tests__/components/DREReportCarga.test.tsx`;
  na tela (produção, depois do deploy): digitar 2010 nas duas datas da DRE e do Balancete → a
  tela fica em zero/vazio, nunca nos números de 2026; DRE › Por Obra › Total = Resultado
  Líquido do Resumo, em Caixa e em Competência.
