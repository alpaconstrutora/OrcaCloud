import React from 'react'
import { Building2 } from 'lucide-react'
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet'
import Button from '../ui/Button'
import LinkDoCelularBloco from './LinkDoCelularBloco'
import { useOrgContext, useOrgWriteTarget } from '../../hooks/useOrgContext'
import { useStore } from '../../store/useStore'

/**
 * "Meu link do celular" — painel lateral aberto pelo menu da conta (Layout).
 * Gerencia o link da PRÓPRIA pessoa logada para Minhas Tarefas e o Diário de Obras no celular.
 *
 * Organização (REGRA #5): o seletor do topo manda (`useOrgContext().orgId`). Só em "Todas"
 * pergunta, e como o link é por organização o modo é `'single'` (sem a opção "Todas").
 */

interface Props {
  open: boolean
  onClose: () => void
  /** Id da conta logada (`session.user.id`). */
  userId: string
  /** Nome mostrado nos avisos ("O link atual de Maria deixa de funcionar…"). */
  nomePessoa: string
}

const MeuLinkCelularSheet: React.FC<Props> = ({ open, onClose, userId, nomePessoa }) => {
  const { orgId } = useOrgContext()
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget()
  const organizations = useStore(s => s.organizations)
  /** Organização escolhida no modal quando o topo está em "Todas". */
  const [orgEscolhida, setOrgEscolhida] = React.useState<string | null>(null)
  const [perguntando, setPerguntando] = React.useState(false)

  const orgDoLink = orgId ?? orgEscolhida
  const nomeDaOrg = organizations.find(o => o.id === orgDoLink)?.name

  // Fechar zera a escolha: da próxima vez o topo (ou a pergunta) decide de novo.
  React.useEffect(() => {
    if (!open) setOrgEscolhida(null)
  }, [open])

  const escolherOrganizacao = React.useCallback(async () => {
    setPerguntando(true)
    try {
      const alvo = await resolveWriteOrg('single')
      if (alvo?.kind === 'org') setOrgEscolhida(alvo.orgId)
    } finally {
      setPerguntando(false)
    }
  }, [resolveWriteOrg])

  // Aberto em "Todas": pergunta já na abertura (com uma única organização resolve sozinho).
  React.useEffect(() => {
    if (open && !orgId && !orgEscolhida) void escolherOrganizacao()
    // `escolherOrganizacao` muda com a lista de organizações; a pergunta é só na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgId])

  return (
    <>
      {/* Enquanto a pergunta de organização está aberta o painel não fecha (Esc/clique fora):
          fechar deixaria o modal solto e a escolha gravada depois de o painel ter saído. */}
      <Sheet open={open} onClose={() => { if (!perguntando) onClose() }} size="md">
        <SheetHeader onClose={onClose}>
          <SheetTitle>Meu link do celular</SheetTitle>
          <SheetDescription>
            {nomeDaOrg ? `Acesse Minhas Tarefas e o Diário de Obras no celular — ${nomeDaOrg}.` : 'Acesse Minhas Tarefas e o Diário de Obras no celular sem digitar senha.'}
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="px-6 py-6">
          {open && orgDoLink ? (
            <LinkDoCelularBloco userId={userId} orgId={orgDoLink} nomePessoa={nomePessoa} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-900">O link do celular é por organização. Escolha de qual organização você quer o link.</p>
              <Button
                type="button"
                onClick={escolherOrganizacao}
                disabled={perguntando}
                title={perguntando ? 'Aguarde a escolha da organização.' : undefined}
              >
                <Building2 className="h-4 w-4" />
                Escolher organização
              </Button>
            </div>
          )}
        </SheetPanel>
        <SheetFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
        </SheetFooter>
      </Sheet>
      {orgTargetModal}
    </>
  )
}

export default MeuLinkCelularSheet
