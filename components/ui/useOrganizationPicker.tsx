import React from 'react';
import { Building2, Check } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Modal, ModalHeader, ModalBody } from './modal';

/**
 * Seletor de organização promise-based, para fluxos de CRIAÇÃO quando o seletor
 * global está em "Todas as organizações" (activeOrganizationId = null) e há mais
 * de uma organização — aí o alvo da criação é ambíguo e precisa ser escolhido.
 *
 * Auto-contido (não exige Provider no root, diferente do useConfirm):
 *
 *   const { pickOrganization, orgPickerModal } = useOrganizationPicker();
 *   ...
 *   const orgId = effectiveOrganizationId ?? await pickOrganization();
 *   if (!orgId) return;               // usuário cancelou
 *   await service.create(orgId, ...);
 *   ...
 *   return (<> ... {orgPickerModal} </>);
 *
 * Atalhos: se o usuário tem UMA só organização, `pickOrganization` resolve
 * direto com ela sem abrir modal. Se não tem nenhuma, resolve null.
 */
export function useOrganizationPicker() {
    const organizations = useStore(state => state.organizations);
    const [resolver, setResolver] = React.useState<((id: string | null) => void) | null>(null);

    const pickOrganization = React.useCallback((): Promise<string | null> => {
        // Zero orgs: nada a escolher. Uma só: escolhe automaticamente.
        if (organizations.length === 0) return Promise.resolve(null);
        if (organizations.length === 1) return Promise.resolve(organizations[0].id);
        return new Promise<string | null>((resolve) => setResolver(() => resolve));
    }, [organizations]);

    const settle = React.useCallback((id: string | null) => {
        setResolver((prev: ((id: string | null) => void) | null) => {
            prev?.(id);
            return null;
        });
    }, []);

    const orgPickerModal = (
        <Modal open={!!resolver} onClose={() => settle(null)} size="sm" zIndex={210}>
            <ModalHeader
                title="Selecionar organização"
                description="Escolha a organização onde o novo item será cadastrado."
                icon={
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <Building2 className="w-5 h-5" />
                    </div>
                }
                onClose={() => settle(null)}
            />
            <ModalBody className="space-y-2">
                {organizations.map((org) => (
                    <button
                        key={org.id}
                        onClick={() => settle(org.id)}
                        className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group active:scale-[0.99]"
                    >
                        <span className="text-sm font-semibold text-gray-800">{org.name}</span>
                        <Check className="w-4 h-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                ))}
            </ModalBody>
        </Modal>
    );

    return { pickOrganization, orgPickerModal };
}
