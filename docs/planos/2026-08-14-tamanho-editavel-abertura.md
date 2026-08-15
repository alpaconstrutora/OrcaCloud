# Tamanho editável da abertura depois de inserida

## Pedido original

Sessão de 2026-08-14, logo depois de girar/espelhar porta:

> opcao de edicao do tamaho da porta apos inserir uma porta

**Decisão de portão, confirmada com o usuário:** "tamanho" abrange **largura e
altura** (e peitoril na janela), não só a largura.

A razão não é só de desenho. O quantitativo desconta `largura × altura` da face
da parede (`quantities.ts:224`), e até aqui a **altura era um valor fixo que
ninguém escolheu** — 2100 mm em porta, 1200 em janela, cravados em
`adicionarAbertura`. Nem a inserção oferecia escolher. Ou seja: o número que
saía no orçamento vinha de uma suposição, calado. Editar só a largura deixaria
essa metade intocável para sempre, sem apagar e refazer.

## O que mudou

| Arquivo | Mudança | Como sei que terminou |
|---|---|---|
| `utils/blueprintKernel/model.ts` | invariante nova: abertura tem que caber na **altura** da parede (`sillMm + heightMm ≤ wall.heightMm`), altura positiva, peitoril não negativo | 3 casos de recusa no kernel |
| `utils/blueprintKernel/commands.ts` | comando `SetOpeningSize` (`widthMm?`, `heightMm?`, `sillMm?` — omitido não muda), com recusa que traz a **medida máxima** no texto | 11 casos novos em `blueprintKernel.test.ts` |
| `components/blueprint/PainelParedeSelecionada.tsx` | campo `CampoMedida` **extraído**; Largura e Altura para toda abertura, Peitoril só em janela | 8 casos novos de componente |
| `components/blueprint/BlueprintEditor.tsx` | `redimensionarAbertura` despacha o comando | passeio de integração |
| `docs/spikes/porta-flip/` | passeio ganhou a etapa de tamanho, com as duas recusas | roda e confere sozinho |

### A trava que precisou nascer junto

Com a altura editável, uma porta de 3000 mm numa parede de 2800 passaria a ser
alcançável — e `areaAberturas > areaBruta` produziria **área líquida e volume
negativos** no quantitativo, saindo calado dentro do orçamento. A invariante
vive em `assertModelInvariants`, e não só no comando novo, para valer em todo
caminho (inclusive `AddOpening` e `MergeWalls`). Ela não quebrou nenhum dado
existente: portas eram 2100 e janelas 1200+900, todas dentro de 2800.

### `CampoMedida` extraído, não copiado

O campo de comprimento de parede e os três de abertura compartilham uma
sutileza que já custou uma correção: no `Escape`, `.blur()` dispara `onBlur`
**sincronamente**, antes de o React aplicar qualquer `setState` pedido no mesmo
handler — por isso o cancelamento vive numa `ref`. Uma segunda cópia dessa
lógica seria uma segunda chance de perdê-la. Diferem só em unidade e casas
decimais, que viraram props.

### Unidade: milímetro, e não metro

Vão de esquadria se especifica e se compra em mm ("porta 80×210"), e é a mesma
unidade do seletor "Largura" da barra ao inserir. O comprimento de parede
continua em metros, que é como a cota vem na planta.

De quebra: o texto "a 1.50 m do início da parede" mostrava decimal com **ponto**
enquanto o campo logo acima usa vírgula. Corrigido para vírgula — duas grafias
na mesma caixa fazem parecer que uma delas é de outro sistema.

## Verificação (feita, não presumida)

- `npx tsc --noEmit` → limpo.
- `npx vitest run` nos 10 arquivos de blueprint → **269 passando** (20 pulados,
  os de banco que já eram).
- `bash scripts/check-ui-standard.sh` nos 2 `.tsx` → sem violação.
- **Kernel** (11 casos): largura e altura mudam isoladamente; campo omitido não
  muda nada; **a altura chega ao quantitativo** (área descontada acompanha, área
  líquida cai); largura que estoura a parede é recusada citando `3000 mm`;
  **altura maior que a parede é recusada** citando `2800 mm`; peitoril + altura
  também têm que caber; valores inválidos recusados; alargar por cima da
  abertura vizinha é recusado; abertura inexistente recusada; round-trip
  preserva o tamanho novo.
- **Componente** (8 casos): mostra largura/altura em mm; Enter aplica só o campo
  editado; Escape descarta e devolve o valor; inválido não emite; **porta não
  mostra peitoril**, janela mostra e ele aplica sozinho; recusa do kernel
  ressincroniza o campo.
- **Chrome real** (`docs/spikes/porta-flip/passeio.mjs`): clique real na porta,
  largura 900 → 800 (o vão e o arco encolheram no desenho — `saida-largura-800.png`),
  altura 2100 → 2400 sem tocar a largura, e as **duas recusas** confirmadas com
  a medida máxima na mensagem (`1950 mm` e `2800 mm`), com o modelo intacto. As
  outras 3 portas do harness ficaram com tamanho e orientação originais.

## Fora do escopo

- Escolher **altura** ao inserir (a barra só oferece largura) — o padrão fixo
  continua, mas agora é corrigível depois sem apagar.
- Mover a abertura ao longo da parede pelo painel (o `offsetMm` segue só de
  leitura).
- Catálogo de esquadrias / vãos padronizados.
