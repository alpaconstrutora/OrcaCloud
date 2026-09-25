# Boleto: campo Organização + malha/tipografia do formulário

## Pedido original

Sessão de 24/09/2026. Primeira mensagem (com print do drawer "Selecionar Centro
de Custo" aberto sobre a tela do boleto):

> financeiro < boletos a pagar: por que para o boleto 0020 nao aparece todos os
> centros de custo, sendo que o seletor de selecionado todas as orgnizacoes

Diagnóstico respondido: não é defeito de filtro. `BoletoManager.tsx:764` passa
`editing?.organization_id` ao `BoletoFormModal`, então a lista de centros de
custo é a da organização **do boleto** (ALPA, 6 CCs), não a do seletor do topo
(45 CCs em todas as orgs). Boleto nº 20 é da ALPA; os 4 itens do print são os
4 nós de topo dela, e o `>` do 001 abre os outros 2. Cruzar orgs ali seria
vazamento de tenant.

Segunda mensagem do usuário, com print do drawer "Agendar Ordem de Manutenção"
(Gestão de Ativos › Manutenções):

> 1. implemente campo para alterar a organizacao.
> 2. implemente alteracao visual no estilo do Gestão de Ativos < manutenções <
> drawer Agendar Ordem de Manutenção (veja print). estilos de campos e texto

### Decisões tomadas com o usuário (mesma sessão, antes de codar)

1. **Estilo** — o print usa a escala antiga (`rounded-xl`, `py-2.5`), que a §16
   do guia marca como deprecada. Perguntado, o usuário escolheu
   **"texto do print + radius do guia"**: rótulo e preenchimento cinza iguais ao
   drawer de Manutenção, campo na escala compacta (`h-9`, `rounded-[6px]`) da
   §16/§30.
2. **Quando o campo Organização é editável** — o usuário escolheu
   **"só rascunho"**: depois de aprovado existe título em `internal_transactions`
   na org antiga, e mover o boleto sozinho quebraria o casamento. Em
   aprovado/pago/cancelado o campo aparece desabilitado **dizendo o motivo**.

---

## Itens

### 1. `services/boletoService.ts` — mover o boleto de organização

- `podeMudarOrganizacao(status)` → só `rascunho` e `revisao`.
- `motivoNaoPodeMudarOrganizacao(status)` → frase única para a tela mostrar
  (mesmo par que já existe em `podeExcluir`/`motivoNaoPodeExcluir`).
- `moverParaOrganizacao(boletoId, orgAtual, novaOrgId, userEmail)` — recusa fora
  do status permitido; grava `organization_id` e **zera** `supplier_id`,
  `cost_center_id`, `plano_de_contas_id`, `category_id`, `project_id`,
  `chart_of_accounts_id`, `sugestao_supplier_id`, `sugestao_cc_id` (todos são
  FK para catálogo da org antiga); registra auditoria `mudanca_organizacao`.

**Pronto quando:** existir teste que (a) recusa o move em `aprovado`/`pago` e
(b) prova que o payload do update zera as seis dimensões.

### 2. `components/BoletoFormModal.tsx` — campo Organização na edição

- Lista de orgs vem de `useWritableOrganizations()` (hooks/useOrgContext), não
  da prop `organizations` crua — o store lista org sem permissão e gravar nela
  dá 42501.
- Campo "Organização" no bloco de dimensões, acima de Obra/CC/Plano.
  Editável só em rascunho/revisão; caso contrário `disabled` + linha de motivo.
- Troca passa por `useConfirm()` avisando que as dimensões serão limpas, chama
  o service, atualiza estado local e `onSaved(updated)`.

**Pronto quando:** abrir um boleto rascunho, trocar a org e ver a lista do
drawer de CC mudar para a da nova org, com fornecedor/obra/CC/plano vazios.

### 3. `components/BoletoFormModal.tsx` — malha e tipografia (§21/§30)

- `FormField`/`ReadOnlyField`: rótulo `text-xs font-semibold text-slate-500`
  (sai `uppercase tracking-widest font-bold`), par rótulo→campo `space-y-1.5`.
- Campo único: `w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px]
  focus:bg-white focus:border-blue-600 text-sm`; textarea igual sem `h-9`.
- Grades `gap-x-6 gap-y-4`, colunas `space-y-4`.
- `CostCenterSelect`/`PlanoContasSelect`/`HierarchicalSelect`/`SupplierSelect`
  passam a `size="sm"` (gatilho `h-9 rounded-[6px]`, já existe no componente).
- Cabeçalhos de bloco e botões saem de `uppercase tracking-widest font-bold`.

**Pronto quando:** `bash scripts/check-ui-standard.sh components/BoletoFormModal.tsx`
sai 0 e não sobra `uppercase tracking-widest` nem `rounded-xl` no arquivo.

---

## Estado — 24/09/2026, os 3 itens fechados

| Item | Evidência |
|---|---|
| 1. service | `__tests__/boletoMudarOrganizacao.test.ts` — 9 casos, todos passando: recusa em aprovado/pago/cancelado sem tocar no registro, zera as 8 FK da org antiga, preserva valor/vencimento/número, audita de-onde→para-onde, mesma org é no-op, destino vazio recusado antes da escrita |
| 2. campo Organização | medido na tela pelo passeio: editável em rascunho, desabilitado **com motivo** nos outros 3 status |
| 3. malha/tipografia | medido na tela: campo 36px / radius 6px / fundo cinza, rótulo `text-transform: none`, peso 600, 12px, slate-500; **0** rótulos em uppercase no formulário |

Harness visual: `docs/spikes/boleto-form-malha/` (`index.html` + `main.tsx` +
`passeio.mjs`). Ele monta o `BoletoFormModal` de produção e **mede**, não só
fotografa. Rodar:

```bash
npx vite --port 3121 --strictPort
PLAYWRIGHT_CORE=<.../node_modules/playwright-core> \
  node docs/spikes/boleto-form-malha/passeio.mjs http://127.0.0.1:3121 <saída>
```

⚠️ O harness não prova GRAVAÇÃO (sem sessão, as listas voltam vazias e o
update não chega ao banco) — quem prova a escrita é o teste do item 1.

### Defeito achado pelo próprio teste

A primeira versão de `moverParaOrganizacao` lia `atual.organization_id` para a
auditoria **depois** do update. Contra o Supabase real passaria despercebido
(objetos distintos); o teste pegou. Agora a org antiga é copiada para
`orgAntiga` antes da escrita.

### Divergência registrada (decisão do usuário)

O print de referência (drawer "Agendar Ordem de Manutenção",
`OpuraAssetsModule.tsx`) usa `rounded-xl` + `px-4 py-2.5` — a escala que a §16
marca como deprecada. O usuário escolheu manter o **texto** do print e o
**radius do guia**. Consequência: `OpuraAssetsModule.tsx` continua na escala
antiga e agora está visivelmente diferente do formulário de boleto. Migrar
aquele drawer para a §16 é trabalho separado, não feito aqui.

### Suíte

`npx tsc --noEmit` limpo; suíte cheia `465 passed | 5 skipped (470)`,
`5321 passed | 33 skipped`; `check-ui-standard.sh` e `check-org-selector-guard.sh`
com exit 0.
