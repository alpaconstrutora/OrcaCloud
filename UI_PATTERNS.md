# Padrões de UI — ORÇACLOUD / ÒPURA

> Documento de referência para **onde** uma interação acontece (modal central, painel
> lateral ou página) e **como** implementá-la com as primitivas compartilhadas.
> Vale para todos os módulos novos. Telas legadas migram de forma incremental.

---

## 1. Princípio

> **Painel lateral (drawer) para 70–80% das interações. Modal central só para
> interrupções críticas. Página dedicada para fluxos longos.**

O fator decisivo num ERP é **preservar o contexto**: o usuário quase sempre está
editando *um item dentro de uma lista* (um pedido, um colaborador, uma obra). Tirá-lo
da lista quebra o ritmo de trabalho.

---

## 2. Decisão em 2 eixos

Em vez de decorar tabela, responda duas perguntas:

1. **O usuário precisa ver a tela de trás enquanto age?**
   - Sim → **painel lateral** (editar item da lista, ver detalhes, filtros)
   - Não → modal ou página

2. **Quanto conteúdo / quantas etapas a tarefa tem?**
   - Pouco + decisão pontual → **modal central** (excluir, aprovar 1, alerta)
   - Médio, mantendo contexto → **painel lateral**
   - Muito / multi-etapa / multi-aba → **página dedicada**

---

## 3. Tabela de referência

| Ação                          | Interface             | Primitiva            |
| ----------------------------- | --------------------- | -------------------- |
| Visualizar registro           | Lateral               | `Sheet`              |
| Editar registro               | Lateral               | `Sheet`              |
| Criar registro simples        | Lateral               | `Sheet`              |
| Gerenciar lista de config     | Lateral               | `Sheet`              |
| Criar registro complexo       | Página completa       | rota/view dedicada   |
| Orçamento / contrato / DRE    | Página completa       | rota/view dedicada   |
| Aprovar **1** item            | Modal central         | `Modal` / `useConfirm` |
| Revisar **fila** de aprovações| Lista + lateral       | lista + `Sheet`      |
| Exclusões                     | Modal central         | `useConfirm`         |
| Alertas / confirmações        | Modal central         | `useConfirm`         |
| Configurações avançadas       | Página completa       | rota/view dedicada   |

> **Aprovações têm nuance:** aprovar 1 item = modal. Revisar uma fila (POs, contratos)
> = lista + lateral, senão vira "clica-confirma-repete" cansativo.

---

## 4. Regras obrigatórias

1. **Autosave em edição lateral.** Drawer fecha fácil (clique fora / Esc) → risco de
   perda de dados. Ou salva automaticamente, ou usa a guarda `dirty` do `Sheet`
   (pede confirmação antes de fechar com alterações pendentes).
2. **Largura mínima do drawer: 420px** no desktop. Já é o default do `Sheet`.
3. **Mobile vira bottom sheet.** O `Sheet` já faz isso automaticamente (< `sm`):
   sobe de baixo, cantos arredondados no topo, com handle. Nunca espremer 420px num
   celular.
4. **Proibido drawer aninhado.** Não abrir um `Sheet` de detalhe *dentro* de outro
   `Sheet`. Precisa de 2º nível → navegue para página.
5. **`window.confirm` é proibido em código novo.** Use `useConfirm()`.
6. **Modal central não fecha no backdrop quando exige decisão.** Use
   `dismissable={false}` em ações destrutivas/críticas.

---

## 5. Primitivas

Todas em `components/ui/`.

### 5.1 `Sheet` — painel lateral / bottom sheet

```tsx
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';

<Sheet open={open} onClose={close} size="xl" /* dirty={hasUnsavedChanges} */>
  <SheetHeader onClose={close}>
    <SheetTitle>Editar pedido</SheetTitle>
    <SheetDescription>PO #1042</SheetDescription>
  </SheetHeader>
  <SheetPanel>{/* corpo scrollável */}</SheetPanel>
  <SheetFooter>{/* ações */}</SheetFooter>
</Sheet>
```

- `size`: `sm | md | lg | xl | 2xl | full` (aplica só no desktop; mobile = bottom sheet).
- `side`: `right | left` (default `right`).
- `dirty`: quando `true`, pede confirmação antes de fechar (proteção contra perda).
- `variant`: `floating` (default) | `flush`. **No desktop o painel flutua**: 16px
  de respiro nos 4 lados e cantos `rounded-[10px]` — não precisa passar nada, é o
  default desde 2026-09-04 (ver §26 do `docs/ui_ux_guia_unificado.md`). `flush` é
  o desenho antigo, colado na borda; só com motivo escrito no código.

### 5.2 `Modal` — modal central

```tsx
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';

<Modal open={open} onClose={close} size="lg" dismissable>
  <ModalHeader title="Salvar alterações" description="Escolha onde aplicar." onClose={close} />
  <ModalBody>{/* ... */}</ModalBody>
  <ModalFooter>{/* ... */}</ModalFooter>
</Modal>
```

- `size`: `sm | md | lg | xl | 2xl`.
- `dismissable={false}` → backdrop e Esc não fecham (decisões obrigatórias).

### 5.3 `useConfirm` — confirmação / exclusão

Substitui `window.confirm`. Promise-based. O `ConfirmProvider` já está montado no root.

```tsx
import { useConfirm } from './ui/confirm';

const confirm = useConfirm();

const ok = await confirm({
  title: 'Excluir obra?',
  message: 'Esta ação não pode ser desfeita.',
  variant: 'danger',          // 'danger' | 'warning' | 'default'
  confirmLabel: 'Excluir',
});
if (!ok) return;
```

---

## 6. Conteúdo da janela

O §1–5 dizem **onde** a interação acontece. Esta seção diz **como preenchê-la**.
Vale para modal, drawer e página.

### 6.1 Botão = verbo + objeto

O botão primário nomeia a ação e o objeto, nunca o genérico. O impacto tem que estar
legível **antes** do clique.

- ❌ `OK` · `Sim` · `Confirmar` · `Enviar`
- ✅ `Salvar fornecedor` · `Aprovar pagamento` · `Emitir boleto` · `Excluir obra`

Posição: primário no canto inferior direito; secundário (`Cancelar` / `Voltar`) à
esquerda dele. Vermelho **só** para ação destrutiva/crítica — não para todo primário.

### 6.2 Ação crítica financeira/fiscal exige bloco de contexto

Antes de aprovar/pagar/cancelar valor, a janela mostra os dados que sustentam a
decisão. `Deseja aprovar?` é insuficiente num ERP.

```
Aprovar pagamento

Fornecedor: ABC Materiais       Obra: Residencial Aurora
Valor: R$ 18.420,00             Vencimento: 10/07/2026
Conta: Banco Itaú              Documento: NF-e 000128

[Voltar]  [Aprovar pagamento]
```

Para valores altos, considerar segunda confirmação ou permissão especial.

### 6.3 Não excluir registro de negócio — inativar/estornar

Em ERP, DELETE físico destrói auditoria. Preferir **arquivar / inativar / cancelar /
estornar / marcar como substituído** e manter histórico. A janela deve explicar a
consequência real ("mantém histórico, remove da fila de pagamento"), não só "tem
certeza?". Coerente com o que já fazemos (status `superseded`, soft-delete).

### 6.4 Validação inline + estados explícitos

- **Validação por campo**, perto do campo, mantendo o que já foi preenchido e levando
  o foco para o primeiro erro. Nada de alerta genérico no topo.
- **Loading**: skeleton/spinner discreto, nunca janela congelada.
- **Erro**: diz o que fazer ("CNPJ já cadastrado em outro fornecedor"), não "Erro ao
  salvar".
- **Sucesso**: ação simples → fecha + toast; ação complexa → resumo (nº do pedido,
  canal, status). **Exceção — edição longa/multi-aba:** salvar **não fecha**;
  grava, mostra toast/indicador de "Salvo" e mantém a tela aberta na mesma aba.
  Só a **criação** fecha (ali a tarefa terminou). Ver §25 de
  `docs/ui_ux_guia_unificado.md` e `hooks/useUnsavedChanges.ts`.
- Cabeçalho fixo · corpo scrollável · rodapé fixo (ações sempre visíveis).

---

## 7. Migração do legado

Não é big-bang. Ao **tocar** numa tela:

- Trocar `window.confirm(...)` por `await useConfirm(...)`.
- Trocar markup de modal escrito à mão pelo `Modal`.
- Reavaliar: essa interação deveria ser **lateral**? Se for editar/ver item de lista, migrar para `Sheet`.

Métrica de adoção (atualizar quando consultar):
- `window.confirm`: ~105 ocorrências no início.
- Modais hand-rolled (`items-center justify-center`): ~276 arquivos no início.
