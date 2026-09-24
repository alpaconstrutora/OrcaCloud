# Condomínios: centro de custo na lista e na Ficha, e os dois cabeçalhos

## Pedido original

Sessão de 23/09/2026, transcrito literalmente:

> 1. comercial < condomínio :
> 1.1. criar coluna centro de custo
> 1.2. Mover  botão para a linha do título alinhado a esquerda
> 2. comercial < condomínio < Ficha do condomínio:
> 2.1. botao voltar nao pode ficar acima do título da tela
> 2.2. Incluir na aba ficha campo de centro de custo e plano de contas

### Definições do usuário (mesma sessão, perguntado antes de editar)

| Ponto | Resposta |
|---|---|
| 1.2 — onde o botão fica | **Na linha do título, à direita** (o padrão §5.3/§17, que `OpuraAssetsModule` já segue) |
| 2.1 — para onde vai o "Voltar" | **Migalha de pão acima do título** |
| 2.2 — centro de custo | *"Sim existe mais como editar?"* → o CC existe, e hoje **só a aba Financeiro edita**. A Ficha passa a editar também |
| 2.2 — plano de contas | *"Nao acrescentar em nhum lugar. desconsidere"* → **fora do escopo** |

## O que a investigação achou antes de editar

- **`empreendimentos` não tem coluna de centro de custo nem de plano de contas.**
  O vínculo é o inverso: `cost_centers_v2.empreendimento_id` aponta para o
  condomínio, e desde 19/09/2026 são **N centros de custo por condomínio** (a
  despesa do rateio é a soma deles). Então "coluna centro de custo" na lista é
  uma consulta reversa, e a célula pode ter mais de um valor.
- Hoje **só a aba Financeiro** vincula/desvincula CC, e só depois de entrar no
  condomínio e trocar de aba. Era essa a pergunta *"mais como editar?"*.
- `CostCenterSelect` (drawer padrão, §7.1.1) já é usado na aba Financeiro — a
  Ficha reusa o mesmo componente, não um `<select>`.

## Plano

### 1. `components/condominio/CondominiosModule.tsx` (editado)

- **Coluna `centroCusto`** em `COLUMNS`, depois de Cidade. Carga em **LOTE**
  (uma consulta para todos os condomínios da lista, não uma por linha) e
  costurada por `empreendimento_id`. Célula: `code — name`; com mais de um,
  os códigos separados por vírgula e o texto inteiro no `title` (§6.1.2 —
  `truncate` precisa de `block` + `title`). Sem CC, `—` em cinza.
  `sortable: true` (§6.3).
- **Botão "Importar empreendimento" sobe para a linha do título**, à direita
  (§5.3/§17, escala compacta). Sai da toolbar acoplada.

**Como sei que terminou:** a coluna aparece com o CC certo por condomínio
(conferir contra `cost_centers_v2` no banco), e o botão está na linha do `h1`.

### 2. `components/condominio/CondominioDetail.tsx` (editado)

- **`Breadcrumb` no lugar do botão "Voltar"**, acima do `<h1>`, dentro do mesmo
  bloco de título (§23): `Condomínios › <identidade>`, com o primeiro nível
  navegando de volta para a lista.
  ⚠️ **Divergência consciente do §23:** a seção pede 3 crumbs (2 saltos) e diz
  que 1 salto se resolve com "Voltar". Aqui há 1 salto só, e a migalha foi
  **escolhida pelo usuário** depois de ver as três opções. Registrada no guia.
- **Campo Centro de custo na aba Ficha**, editável: lista os CCs vinculados com
  ação de desvincular, e um `CostCenterSelect` (drawer padrão) para vincular
  mais um entre os livres da organização. Mesmo service da aba Financeiro
  (`condominioRateioService`), então as duas telas leem e escrevem o mesmo dado.
- **Plano de contas: não entra** (decisão do usuário).

**Como sei que terminou:** vincular pela Ficha aparece na aba Financeiro sem
recarregar a página, e desvincular pela Ficha some da lista da Financeiro.

### 3. `docs/ui_ux_guia_unificado.md` (editado)

Registrar em §23 a exceção decidida pelo usuário — o guia manda documentar
divergência intencional, não abrir precedente silencioso.

## Estado — 23/09/2026: concluído

| Item | Feito | Prova na tela (dado real, escritas bloqueadas, zero erro de console) |
|---|---|---|
| 1.1 | Coluna **Centro de custo**, carga em lote | `007 - Bella Vista` → `011 — 007 - Bella Vista · 027 — Bella Vista`; `010` → `010 — 010 - Galeria Altavista`; `015` → `—`. Bate com `cost_centers_v2` |
| 1.2 | Botão na linha do título, à direita | `h1` em y=84 x=284, botão em y=84 x=1469 — mesma linha, à direita; **não sobrou** na toolbar |
| 2.1 | Migalha no lugar do "Voltar" | `Condomínios › 010 - Galeria Altavista` acima do `h1` (gap 6px); botão "Voltar" **não existe mais** |
| 2.2 | Centro de custo editável na Ficha | Seção com o CC vinculado + ícone de desvincular, campo "Vincular um centro de custo" com o **drawer padrão** (§7.1.1) abrindo, botão travado sem escolha |
| 2.2 | Plano de contas | **Não implementado** — decisão do usuário: *"Nao acrescentar em nhum lugar. desconsidere"* |

🔎 **Ajuste vindo do print.** Na primeira versão o item vinculado esticava a
linha inteira enquanto o campo "Vincular" ocupava 2/3 da grade — duas caixas
com bordas desalinhadas uma sobre a outra. Os dois passaram a dividir a mesma
coluna da grade.

⚠️ **Armadilha de edição, registrada porque quase entrou errado:** o `in` do
Python casa por SUBSTRING, então um trecho de JSX com 36 espaços de indentação
"existe" dentro de uma linha com 44. Uma substituição de cabeçalho quase foi
parar dentro do `<tbody>`. As trocas passaram a exigir `count() == 1` antes de
aplicar.

### Mecânica

- `npx tsc --noEmit` limpo · `npm run build` limpo
- **5.158 testes passando**, 33 pulados
- `check-ui-standard.sh` em `CondominiosModule.tsx` e `CondominioDetail.tsx` — 0 violações
- `check-system-projects`, `check-project-classification`, `check-org-selector-guard`, `check-xss-sinks` — OK
- Divergência do §23 registrada no próprio guia (seção "Exceção autorizada — 1 salto")
