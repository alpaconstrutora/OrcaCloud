# Condomínio › Ocupações › Importar do Comercial

## Pedido original (literal)

> bug:
> 1. condominio < ocupacoes < botao importar do comercial: o condominio 007
>    esta importando corretamente as unidades do comercial, porem esta
>    importando também estacionamento., sendo que estacionamento existe no
>    empreendimento porem nao no comercial. verifique.
> 2. drawer Importar do Comercial:
> 2.1. implemente checkbox para cada unidades para que o usuário decida o que
>      importar.
> 2.2. mais uma vez encontramos texto em cor cinza que dificuta a
>      visualizacao. corrigir
> 2.3. Não use texto empilhado

---

## 1. "Está importando o Estacionamento" — não está

Medido no banco, não deduzido:

| verificação | resultado |
|---|---|
| `commercial_deals` com `property_id` do Estacionamento | **0** |
| `commercial_deal_units` com esse `property_id` | **0** |
| `unit_occupancies` na unidade Estacionamento | **0 linhas** |

A unidade tem `commercial_property_id` preenchido (`4460b77f…`), mas **nenhuma
negociação aponta para ele**. `previewImport` produz `pessoas = []`,
`responsavelFinanceiro = null`, e `applyImport` nunca a alcança.

**O que realmente acontecia:** o Estacionamento *aparecia na lista* do drawer,
com o motivo escrito em cinza pequeno no meio de um bloco de texto empilhado.
Num painel cuja promessa é "isto vira ocupação", uma linha que não vai virar
nada precisa dizer isso onde o olho bate primeiro.

**Ele continua aparecendo, de propósito.** O cabeçalho do serviço registra por
quê: unidade que some da lista vira defeito invisível — foi assim que a
importação de vendas pareceu quebrada em 14/08/2026, quando as 12 unidades do
Galeria Altavista estavam publicadas só no eixo de locação. A lacuna é
informação: diz onde falta cadastro. O que mudou é que agora ela tem coluna
**Situação = "Não está no Comercial"** e **não tem checkbox**.

## 2.1 Checkbox por linha

O checkbox existia, mas era **por unidade** e ficava desabilitado quando a
unidade não tinha nada a criar — que era o estado de todas no condomínio 007
(já importadas). Somado ao `opacity-60` da linha, virava invisível.

Agora a escolha é por **ocupação**, que é a unidade real de decisão: uma
unidade gera até três (proprietário, inquilino e responsável financeiro). O
responsável financeiro em especial era **derivado e criado em silêncio**,
anunciado por uma linha verde de rodapé, sem como recusá-lo. Hoje é uma linha
com checkbox próprio.

- `previewImport` passa a devolver `candidatas: ImportOccupancy[]` — o que
  SERÁ criado, achatado. O responsável financeiro herda data, contrato e
  origem de quem o originou.
- `applyImport` recebe `ImportOccupancy[]` em vez da linha da unidade: cada
  item já traz tudo, sem reencontrar nada.
- `ImportUnitRow.selected` era escrito e nunca lido — removido.

## 2.2 Texto cinza

| era | virou |
|---|---|
| `text-gray-400` no sufixo "· origem · desde data" | colunas próprias, `text-gray-600` (§7) |
| `text-gray-500` no resumo e nas pessoas | `text-gray-700` / `text-gray-600` (§7) |
| `opacity-60` na linha inteira sem nada a criar | sem opacidade; o estado é dito na coluna Situação |

Papel e Situação usam §8 — texto colorido sem pílula.

## 2.3 Texto empilhado

Era `<div>` sobre `<div>` dentro de um cartão por unidade. Virou
`StandardTable` (§6.10) com `dense` (§6.9): **Unidade · Pessoa · Papel ·
Situação**, mais **Motivo · Origem · Desde** nascendo ocultas (`defaultHidden`)
— justificam a linha sem competir por largura.

⚠️ A primeira tentativa recriou o empilhamento por outro caminho: a frase
inteira do motivo ("Já importada. Unidade já tem responsável financeiro — o
papel não é tocado.") numa coluna de 165px quebrava em **cinco linhas**.
Coluna de status é **rótulo**, não parágrafo: `situacaoDaLinha()` devolve
"Já importada" / "Não está no Comercial" / "Negociação em andamento" /
"Será criada", e a frase foi para a coluna Motivo.

Soma das colunas visíveis = 615px, dentro dos 624 úteis de um `Sheet` 2xl com
`p-6`. Nome de pessoa usa `break-words` (nome truncado é lido como coluna
cortada); "Torre Única · 11" é identificador curto e não quebra.

## Prova

Playwright no servidor da frente, condomínio 007 (Bella Vista):

```
colunas: ☐ | Unidade | Pessoa | Papel | Situação
Estacionamento → Situação "Não está no Comercial", SEM checkbox

Com ocupações a criar (leitura de unit_occupancies devolvida vazia
no roteiro — nada gravado):
  16 linhas, todas marcadas       → "Importar 16 ocupações"
  desmarcar 1                     → "Importar 15 ocupações"
  marcar tudo pelo cabeçalho      → "Importar 16 ocupações"
  desmarcar tudo                  → "Importar 0 ocupações", botão travado
```

Testes novos: `__tests__/occupancyImportCandidatas.test.ts` (8) — o serviço não
tinha nenhum. Travam que o Estacionamento **aparece** e **não vira candidata**,
que o responsável financeiro herda contrato e data, que reserva não é posse, e
que as chaves de candidata não colidem.
