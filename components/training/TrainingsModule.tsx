import React from 'react';
import LaborTrainings from '../LaborTrainings';
import { useOrgContext } from '../../hooks/useOrgContext';
import { useEmployees, useOrganizations } from '../../hooks/useLaborQueries';

/**
 * Treinamentos — a GESTÃO da Academia (catálogo, atribuições, registros,
 * painéis e acessos ao Portal de Treinamentos), num item próprio do menu.
 *
 * Pedido de 16/10/2026: o catálogo "atenderá o público externo também, talvez
 * não seria interessante estar dentro de recursos humanos" — e quem gerencia
 * treinamento "não é (só) o RH". Saiu do módulo de RH (`labor-trainings`) com
 * permissão própria (`canViewTrainings`/`canEditTrainings`, herdando do RH
 * enquanto nada for gravado). Plano:
 * docs/planos/2026-10-16-treinamentos-fora-do-rh-e-meus-treinamentos.md
 *
 * O conteúdo é o mesmo `LaborTrainings` (as abas não mudaram); este arquivo só
 * entrega a ele o que o módulo de RH entregava — organização do topo (REGRA #5,
 * `useOrgContext`), colaboradores, organizações e obras.
 */

interface Props {
    /** Obras (só OBRA, sem projeto de sistema) para atribuir por obra. */
    projects?: Array<{ id: string; name: string; orgId?: string | null }>;
    podeEditar: boolean;
}

const TrainingsModule: React.FC<Props> = ({ projects = [], podeEditar }) => {
    const { orgId } = useOrgContext();
    const employees = useEmployees(orgId ?? undefined);
    const organizations = useOrganizations();

    return (
        <div className="pb-20">
            <LaborTrainings
                orgId={orgId}
                employees={employees.data ?? []}
                onRefresh={() => { employees.refetch(); }}
                organizations={(organizations.data ?? []) as Array<{ id: string; name: string }>}
                projects={projects}
                podeEditar={podeEditar}
            />
        </div>
    );
};

export default TrainingsModule;
