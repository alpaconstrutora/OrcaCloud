import React from 'react';
import { useStore } from '../store/useStore';
import { companyService } from '../services/companyService';
import type { CompanyDepartment } from '../types/company';

export interface DepartamentoDaOrg extends CompanyDepartment {
    /** Nome da empresa dona — para distinguir "Engenharia" de duas empresas. */
    companyNome: string;
}

/**
 * Departamentos de TODAS as empresas de uma organização, numa lista só.
 * `company_departments` pende da empresa (não da organização); o ofício e o
 * signatário precisam escolher entre todos. Com `orgId` nulo ("Todas"), lista
 * os departamentos das empresas que o store já carregou — nunca bloqueia (REGRA #5).
 */
export function useDepartamentosDaOrg(orgId: string | null | undefined) {
    const companies = useStore(s => s.companies);
    const [departamentos, setDepartamentos] = React.useState<DepartamentoDaOrg[]>([]);
    const [carregando, setCarregando] = React.useState(false);

    const empresas = React.useMemo(
        () => companies.filter(c => !orgId || c.org_id === orgId),
        [companies, orgId],
    );
    const chave = empresas.map(c => c.id).join('|');

    React.useEffect(() => {
        let vivo = true;
        if (!empresas.length) { setDepartamentos([]); return; }
        setCarregando(true);
        Promise.all(empresas.map(async c => {
            try {
                const lista = await companyService.listDepartments(c.id);
                return lista.filter(d => d.ativo !== false).map(d => ({ ...d, companyNome: c.nome_fantasia || c.razao_social }));
            } catch {
                return [] as DepartamentoDaOrg[];
            }
        })).then(blocos => {
            if (!vivo) return;
            setDepartamentos(blocos.flat().sort((a, b) => a.nome.localeCompare(b.nome)));
            setCarregando(false);
        });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chave]);

    const nomePorId = React.useMemo(() => {
        const m: Record<string, string> = {};
        for (const d of departamentos) m[d.id] = d.nome;
        return m;
    }, [departamentos]);

    return { departamentos, nomePorId, carregando, temEmpresas: empresas.length > 0 };
}
