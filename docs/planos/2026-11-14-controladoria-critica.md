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

Pedido: "Comece" (15/11/2026, após o passo 1 no ar).

| # | O que muda | Como sei que terminou |
|---|---|---|
| 2.1 | Período, regime e obra num estado só, no `ControladoriaModule` (`components/controladoria/escopo.ts`); sobrevive à troca de aba, não vai ao localStorage (período velho reaberto = número que ninguém pediu) | `ControladoriaEscopoUnico.test.tsx` "período e regime escolhidos na DRE valem no Balancete"; na frente local, março + Competência ficaram nas 6 abas |
| 2.2 | Uma barra de escopo para as 6 abas (`BarraDeEscopo.tsx`, §5.3, antes dos KPIs): rótulos associados, anel de foco sólido, h-9; o que não vale na aba fica desligado mostrando "Não se aplica" e o motivo no `title` (WIP: "De" desligado e "Até" vira "Posição em") | testes "desligado E diz por quê", "voltar devolve o regime", "WIP: Posição em", "rótulo associado" |
| 2.3 | Sem "Atualizar" (a aba recarrega ao mudar o escopo) | teste "sem botão Atualizar" |
| 2.4 | Título e subtítulo por aba no módulo (§19.1/§20); as abas no `TabsBar` (role=tab, aria-selected, setas, `flex-wrap` — no celular as 6 aparecem); ordem título → abas → escopo → conteúdo | teste "título → abas → barra"; 390 px: 6 de 6 abas visíveis, sem rolagem lateral |
| 2.5 | A obra aberta no topo é o ponto de partida do filtro de obra (só se for OBRA, pela lista do `fn_list_obras`) | testes "obra do topo" e "projeto que não é obra" |
| 2.6 | Balancete e Diário passam a respeitar a obra (os serviços já aceitavam e as telas nunca passavam) | teste do Balancete com `undefined`/obra; Diário pelo `projectId` |
| 2.7 | Organização pelo `useOrgContext` dentro do módulo; o `AppRouter` deixa de passar `activeOrganizationId \|\| ''` (REGRA #5) — baseline 27 → 25 | `orgContextGuard` verde com o baseline apertado |
| 2.8 | Gutter próprio removido (Diário `p-6`, demais `px-1`); busca do Diário acoplada à tabela (§5.2) | prints 1440 da frente local |

Ficou para o passo 4 (distill): KPIs ainda feitos à mão — no celular o valor encosta na borda e o "−" quebra sozinho.

### Passo 3 — `/impeccable clarify`: números que levam à ação

Pedido: "Pode seguir" (15/11/2026). Decisão do usuário: **"Aviso + lista em gaveta"** —
só leitura, sem migration (alternativas recusadas: só aviso + atalho; classificar ali mesmo).

Origem medida em produção (2026, Caixa): os −R$ 7.619,23 são 27 lançamentos sem plano de
contas (boletos, manuais), 33 com nome de categoria que não existe no plano da organização
("Material", "Encargos Patronais"…) e 4 de "Adiantamento", categoria sem grupo da DRE.

| # | O que muda | Como sei que terminou |
|---|---|---|
| 3.1 | "Sem Classificação" vira aviso no topo da DRE (e do Balancete), com o valor do realizado e do previsto e o botão "Ver os lançamentos" | `ControladoriaAcao.test.tsx` "aviso no topo"; na frente local com dados reais: −R$ 7.619,23 no aviso = linha da DRE |
| 3.2 | Gaveta (`Sheet` 2xl) com os lançamentos (data, descrição, origem · categoria, valor, situação), agrupados por motivo com o que fazer, e atalhos "Abrir Plano de Contas" / "Abrir Contas a Pagar". Regra em `services/semClassificacaoService.ts` = o LEFT JOIN de `fn_dre_summary`, sobre a mesma view (security_invoker) | `semClassificacao.test.ts` (7); frente local: 64 lançamentos, total realizado −R$ 7.619,23 = a DRE |
| 3.3 | WIP: o nome da obra abre a DRE da obra (aba DRE + obra no escopo) | teste "clicar no nome da obra"; frente local: Garden Cambuhy → DRE filtrada |
| 3.4 | Textos: linhas "(o)"/"(!)" viram "Amortização de principal (fora do resultado)"/"Sem classificação (fora do resultado)", sem glifo ⚠; colunas "Realizado (conciliado)"/"Previsto (pendente)" no Caixa; rodapé legível (gray-500); WIP diz o que o dado é (receita recebida, custo pago, recebido − pago — era "Reconhecida"/"Incorrido", vocabulário de POC); "Total (1 obra)"; vazio do Diário explica o que entra nele | teste "sem código interno" e "Total (1 obra)" |
### Passo 4 — `/impeccable distill`: uma linguagem para as seis abas (este PR)

Pedido: "pode seguir" (15/11/2026).

| # | O que muda | Como sei que terminou |
|---|---|---|
| 4.1 | Indicadores no `KpiCard destaque` (§4.5) na DRE, WIP, Fluxo e Diário; cor só por limiar com nome (`components/controladoria/indicadores.ts`: resultado/saldo < 0 = alerta, com o aviso que não depende de cor); DRE com 4 (a receita bruta vira legenda da líquida); margem na legenda; grade 1 coluna no celular | `ControladoriaLinguagem.test.tsx` "indicadores"; frente local: 4 indicadores nas 4 abas, 390 px sem valor cortado |
| 4.2 | DRE: "Previsto" só no Caixa (em Competência repetia o realizado) | teste "Previsto só no Caixa"; frente local: cabeçalhos em Competência = Linha · Realizado |
| 4.3 | Tabelas na largura toda (espaçador + `minWidth: '100%'`, §6.1.1) nas 6 abas; WIP com larguras-padrão somando 1.100 px (antes 1.140 rolava num card de 1.124); WIP e Balancete com `px-6 py-2.5 border-r` (célula alinhada ao cabeçalho, §6.6/§7.2); cabeçalhos brancos (§6.11) no WIP, Diário e SPE; Balancete sem glifos "▾▸" (ícone) e grupo pelo teclado | frente local: tabela 1.122 px = card; teste "grupo pelo teclado" |
| 4.4 | Gráfico do Fluxo no §28: grade sólida, eixos #64748b, linha reta (não `monotone`), colunas ≤ 24 px no "por período", legenda HTML, `role="img"` com os números; menos de 3 períodos = frase. A linha "Previsto" saiu do acumulado: era o pendente de CADA período (picos de ±R$ 400 mil) e achatava o saldo real (−R$ 12 mil) numa reta | teste "poucos períodos"; print semanal: o saldo cai até −R$ 12.640,41, legível |
| 4.5 | CSV na DRE por SPE, WIP, Balancete e Diário, no formato que DRE e Fluxo já usavam (`components/controladoria/csv.ts`) | teste "CSV um formato" |
### Passo 5 — `/impeccable audit`: acessibilidade AA
### Passo 6 — `/impeccable polish`

(Escopo de cada um no relatório da crítica; os critérios entram aqui quando o passo começar.)

## Estado

- [x] Passo 1 — #448 (cc919c67), migration `aplicar_20271114900000` aplicada antes do merge; conferido em produção 15/11/2026
- [x] Passo 2 — #451 (4df8f2c7); conferido em produção 15/11/2026
- [x] Passo 3 — #458 (fd4705ef); conferido com dados reais na frente local
- [ ] Passo 4 — frente `controladoria-linguagem`, PR a abrir
- [ ] Passo 5
- [ ] Passo 6

## Verificação

- Passo 1: `npx vitest run __tests__/periodoControladoria.test.ts __tests__/diarioServicePaginacao.test.ts __tests__/components/DREReportCarga.test.tsx`;
  na tela (produção, depois do deploy): digitar 2010 nas duas datas da DRE e do Balancete → a
  tela fica em zero/vazio, nunca nos números de 2026; DRE › Por Obra › Total = Resultado
  Líquido do Resumo, em Caixa e em Competência.
