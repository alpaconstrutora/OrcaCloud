# Imovib — botão "Preferências" no estudo; 1ª preferência: exibir unidades não vendáveis na aba Receitas


## Pedido original (20/11/2026, sessão 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0)

> No topo direito, ao lado do botão editar. crie um botão chamado preferencias, como foi criado em empreendimento > p;lanta inteligente.
> Vamos acrescentar a primeira preferencia: na aba receitas as unidades Não vendável no empreendimento são exibidas pode poluir a tela, crie um checkbox para exibir / ocultar as unidades Não vendável no empreendimento.

Respostas (20/11): guardar **no banco, por usuário** (como a Planta); padrão **ocultas**.

## Contexto

Desde o #595, o espelho do estudo (Receitas › espelho de vendas) mostra as linhas "Não vendável no empreendimento"
(garagem, área comum…), que já ficam fora do VGV. Elas poluem a lista; o usuário quer escondê-las por preferência, num
botão "Preferências" no cabeçalho do estudo que vai receber outras preferências depois.

O que existe para reusar:
- **Botão** de cabeçalho igual ao de Suprimentos › Pedidos (`components/SupplyChainOrderList.tsx:558-566`): `SlidersHorizontal`
  + "Preferências", classes do `botaoSecundario` do `ImovibDetailView`.
- **Painel**: `Sheet` de `components/ui/sheet` (SheetHeader/Title/Description/Panel), linha boolean com `TableSwitch`
  (`components/ui/TableSwitch.tsx`) como em `components/preferencias/SecaoExibicaoDaPlanta.tsx` (`LinhaDoItem`).
- **Banco**: tabela `public.preferencias` (escopo `USUARIO`) + `services/preferenciasService.ts`
  (`listarDoUsuario()`, `gravar('USUARIO', {}, chave, valor)`, `null` apaga) — o mesmo caminho que a Diretoria usa
  (`services/diretoriaService.ts:76-87`). Query key `preferenciasKeys.usuario(userId)` (`lib/queryKeys.ts:135`).
- **Bloqueio**: CHECK `preferencias_chave_sanidade` só aceita `planta.%`, `suprimentos.%`, `diretoria.%` → precisa
  liberar `imovib.%` (migration, modelo `aplicar_20271117980000_diretoria_ceo.sql:28-30`).

## Desenho

- Cabeçalho do estudo (`components/ImovibDetailView.tsx:222-244`): **[Preferências]** à esquerda de **[Editar]** e
  **[Congelar versão]**. Sempre ligado (preferência é do usuário, não do estudo — vale também em só leitura).
- Sheet "Preferências do estudo de viabilidade" (descrição: "Valem para você, em todos os estudos."), seção
  **Receitas**, linha: "Exibir unidades não vendáveis no empreendimento" — explicação: "Garagem, área comum e
  estacionamento ficam fora do VGV; desligado, saem da lista do espelho de vendas (o aviso do topo continua
  contando)." — `TableSwitch`.
- Chave `imovib.receitas.exibir_nao_vendaveis`, boolean, escopo USUARIO. **Sem linha = oculto** (padrão).
- `ImovibSalesMapTab`: com a preferência desligada, as linhas `fora_do_vgv === 'nao_vendavel'` não aparecem na tabela;
  "Sem unidade no empreendimento" continua sempre visível (precisa de ação). O aviso do topo e os números não mudam;
  quando há ocultas, o aviso ganha "(ocultas na lista — Preferências)".
- Sem sessão / leitura falhou: vale o padrão (oculto), sem quebrar a tela; gravação otimista com volta e toast em falha.

## Arquivos

- `supabase/migrations/aplicar_<prefixo>_preferencias_imovib.sql` (novo; prefixo conferido contra TODOS os nomes):
  DROP/ADD `preferencias_chave_sanidade` acrescentando `chave LIKE 'imovib.%'`. Só CHECK; sem função/policy nova.
  **Aplicar só com OK** (prova antes em transação desfeita: inserir `imovib.x` passa, `xyz.x` falha).
- `hooks/useImovibPreferencias.ts` (novo): `useImovibPreferencias(): { exibirNaoVendaveis: boolean; setExibirNaoVendaveis(v: boolean): void; carregando: boolean }`
  — react-query com `preferenciasKeys.usuario(userId)` + `preferenciasService.listarDoUsuario()` (mesma leitura da Planta,
  sem 2ª consulta), gravação otimista via `preferenciasService.gravar`.
- `components/ImovibPreferenciasSheet.tsx` (novo): o Sheet acima.
- `components/ImovibDetailView.tsx`: botão + estado `preferenciasAberto`.
- `components/ImovibSalesMapTab.tsx`: filtra as linhas pela preferência; texto extra no aviso.
- `docs/ui_ux_guia_unificado.md`: nada novo (Sheet/TableSwitch/botão §17 já cobertos).

## Verificação

1. TDD: `__tests__/useImovibPreferencias.test.ts` (sem linha → oculto; linha `true` → exibir; setter grava a chave
   certa e volta em falha); `__tests__/components/ImovibEspelhoForaDoVgv.test.tsx` (preferência desligada → linha
   "G1" não aparece, aviso diz "ocultas"; ligada → aparece; "Sem unidade" sempre aparece);
   `__tests__/components/ImovibDetailEdicaoDeVersao.test.tsx` ou novo (botão "Preferências" abre o Sheet com a linha).
2. `npm run typecheck`; `npx vitest run imovib Imovib preferencias Preferencias Guard guard segurancaMigrations`;
   `bash scripts/check-ui-standard.sh` nos `.tsx` tocados.
3. Banco: prova da migration em transação desfeita; aplicar com OK; conferir o CHECK novo.
4. PR, CI, merge, `conferir-producao.sh "Exibir unidades não vendáveis"`. Navegador (com OK): abrir Preferências no
   Garden, ligar/desligar e ver a lista mudar (hoje o Garden tem 0 não vendáveis — desligar "Vendável" de uma garagem
   para ver, e religar; ou o usuário desliga as 4 garagens antes).

## Estado (20/11/2026)

- [x] Código: hook `useImovibPreferencias`, `ImovibPreferenciasSheet`, botão no cabeçalho, filtro no espelho do estudo —
  testes vistos falhando antes (hook, painel, botão, espelho); suíte `imovib Imovib preferencias Preferencias Espelho
  Guard guard segurancaMigrations` → 119 arquivos / 1105 testes; `tsc` limpo; `check-ui-standard.sh` limpo nos 3 `.tsx`.
- [x] Migration `aplicar_20271120910000_preferencias_imovib.sql`: prova em transação desfeita (`imovib.*` passa,
  `xyz.*` recusada) → PROVA OK; aplicada com OK do usuário (*"Sim"*); CHECK conferido no banco.
- [ ] Publicação e conferência no navegador.
