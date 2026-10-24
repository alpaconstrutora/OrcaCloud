# RH › Recibo de pagamento — empregador da organização da folha

## Pedido original (24/10/2026, sessão 8b3a48d5)

> correcao na olha: deve trazer os dados da organizacao Nome e cnpj inves de ( Opura Pro, CNPJ: 00.000.000/0001-00, Endereço: Unidade Operacional - Obra Garden)

(com print do Recibo de Pagamento de junho/2026 do Rogério da Silva Santos.)

## Diagnóstico

`components/PaystubModal.tsx` tinha o cabeçalho do empregador **fixo no código**: "Opura Pro",
"CNPJ: 00.000.000/0001-00", "Endereço: Unidade Operacional - Obra Garden" — em todo recibo, de toda organização.
O PDF é um print desse mesmo HTML (`html2canvas`), então saía igual.

- Fonte dos dados: `organizations.name/cnpj/address` — em org PJ, `cnpj`/`address` são espelho da empresa matriz por
  gatilho (memória `project_organizacao_matriz_fonte_unica`), e é o que os outros documentos do app já leem. Org PF
  (`settings.tipo_pessoa = 'PF'`) guarda o CPF em `organizations.cnpj`.
- Qual organização: a **da folha** (`run.org_id`), não a do topo (que pode ser "Todas"). Regra do usuário do mesmo dia:
  a folha é gerada só na organização em que o colaborador é registrado.
- Acesso: ver a folha exige ser membro da org (`payroll_runs_v2_access = is_org_member(org_id)`), a mesma regra de
  leitura de `organizations` (`is_org_member(id)`) — vale também no Portal do Colaborador, que usa o mesmo modal.

## Itens

1. [x] `utils/empregadorDoHolerite.ts` (novo) — nome, rótulo CNPJ/CPF, documento e endereço em uma linha (converte
   as chaves de `organizations.address` para o `formatarEnderecoEmpresa` que já existe).
   `__tests__/empregadorDoHolerite.test.ts`: PJ com endereço, sem endereço (Garden), PF → CPF, sem documento — 4 verdes.
2. [x] `services/payrollService.ts` — `getOrganizacaoDoHolerite(orgId)`.
3. [x] `components/PaystubModal.tsx` — lê a org da folha junto com o resto; cabeçalho com nome, "CNPJ: …" (ou "CPF:")
   e "Endereço: …" só quando cadastrado; sem documento mostra "—".
   `__tests__/components/PaystubModalEmpregador.test.tsx`: Garden → nome + CNPJ 60.897.254/0001-86, consulta com o
   `org_id` da folha (o topo era "all"), sem "Opura Pro" nem CNPJ zerado, sem linha de endereço.
4. [x] `tsc --noEmit` rc=0; `check-ui-standard.sh components/PaystubModal.tsx` 0 violações.
5. [ ] PR + CI + publicação + conferir o recibo na tela em produção.

## Observações

- A Garden não tem endereço cadastrado na organização (só CNPJ): o recibo dela sai sem a linha de endereço até ele
  ser preenchido na matriz (Minha Organização › Organização).
- ALPA Empreendimentos e Construções não tem CNPJ cadastrado: o recibo dela sairia com "CNPJ: —".
