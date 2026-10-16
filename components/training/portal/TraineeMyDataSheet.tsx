import React from 'react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../../ui/sheet';
import { DetailField } from '../../portal/PortalKit';
import type { AcademyPortalIdentity } from '../../../types/academy';

/**
 * Meus dados — o que a empresa cadastrou sobre o treinando. Só leitura: os
 * dados (e o e-mail de acesso) são mantidos pelo RH, como nos outros portais.
 */

interface Props {
    open: boolean;
    onClose: () => void;
    userEmail: string;
    identidades: AcademyPortalIdentity[];
}

const TIPO_LABEL = { COLABORADOR: 'Colaborador', TERCEIRO: 'Terceirizado / prestador' } as const;

const TraineeMyDataSheet: React.FC<Props> = ({ open, onClose, userEmail, identidades }) => (
    <Sheet open={open} onClose={onClose} size="md">
        <SheetHeader onClose={onClose}>
            <SheetTitle>Meus dados</SheetTitle>
            <SheetDescription>Cadastro mantido pela empresa. Para alterar, fale com o RH.</SheetDescription>
        </SheetHeader>
        <SheetPanel className="p-6 space-y-6">
            <div className="rounded-xl border border-[#ECECEF] p-4">
                <DetailField label="E-mail de acesso">{userEmail || identidades[0]?.email || '—'}</DetailField>
                <DetailField label="Nome">{identidades[0]?.name || '—'}</DetailField>
                {identidades[0]?.cpf && <DetailField label="CPF">{identidades[0].cpf}</DetailField>}
                {identidades[0]?.phone && <DetailField label="Telefone">{identidades[0].phone}</DetailField>}
            </div>

            <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">
                    {identidades.length > 1 ? 'Organizações que liberaram seu acesso' : 'Organização'}
                </p>
                <div className="space-y-3">
                    {identidades.map(i => (
                        <div key={i.portal_user_id} className="rounded-xl border border-[#ECECEF] p-4" data-tour="conta-organizacao">
                            <p className="text-sm font-semibold text-[#1F2430] mb-1">{i.org_nome}</p>
                            <DetailField label="Vínculo">{TIPO_LABEL[i.tipo]}</DetailField>
                            {i.empresa_terceira && <DetailField label="Empresa">{i.empresa_terceira}</DetailField>}
                            {i.funcao && <DetailField label="Função">{i.funcao}</DetailField>}
                            {i.matricula && <DetailField label="Matrícula">{i.matricula}</DetailField>}
                        </div>
                    ))}
                    {identidades.length === 0 && (
                        <p className="text-sm text-gray-400">Nenhuma organização ativa para este e-mail.</p>
                    )}
                </div>
            </div>
        </SheetPanel>
    </Sheet>
);

export default TraineeMyDataSheet;
