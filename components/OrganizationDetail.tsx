// components/OrganizationDetail.tsx
//
// Ficha da organização — Minha Organização › Organização › Detalhes.
//
// Funde o que eram duas telas (pedido de 12/10/2026, plano
// docs/planos/2026-10-12-fundir-organizacao-e-grupo.md): a ficha da organização
// (OrganizationPage) e a aba "Grupo" (CompaniesModule), que saiu do menu. As duas
// tinham o MESMO título ("Empresas do Grupo") e cadastravam CNPJ, contato e
// endereço em dois lugares — organização e empresa matriz — que já divergiam.
//
// Abas, numa barra só (§19.1):
//   • Organização — o que é da org: logo, código, nome, regime de tributos;
//   • as abas da EMPRESA MATRIZ (Identificação, Sócios, Contas, …) — só org PJ;
//     é ali que CNPJ, contato e endereço se editam, e o banco espelha na org;
//   • Empresas do grupo — as demais empresas da org (SPE ligada, holding…).
// Org PF não tem matriz (`companies` não comporta CPF): Organização + Empresas do grupo.
//
// Os três painéis ficam MONTADOS e só o ativo aparece: trocar de aba não pode
// descartar o que foi digitado (cada painel tem o próprio formulário).
//
// REGRA #5: a ficha é de UMA organização por natureza (caso 3) — quem chama
// resolve qual (managingOrgId ou a ativa no topo) e nunca a renderiza sem uma.
import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { Organization, Company } from '../types';
import { companyService } from '../services/companyService';
import { organizationService } from '../services/organizationService';
import { useStore } from '../store/useStore';
import { useConfirm } from './ui/confirm';
import Breadcrumb from './ui/Breadcrumb';
import { TabsBar, TabsBarItem } from './ui/TabsBar';
import OrganizationPage from './OrganizationPage';
import CompanyDetailPage, { CompanyDetailTab, buildCompanyDetailTabs } from './CompanyDetailPage';
import CompaniesModule from './CompaniesModule';

type Aba = 'organizacao' | 'grupo' | CompanyDetailTab;

interface Props {
    organization: Organization;
    onSave: (org: Organization) => unknown;
    onBack: () => void;
    /** Leva a Minha Organização › Contas. */
    onIrParaContas?: () => void;
}

const OrganizationDetail: React.FC<Props> = ({ organization, onSave, onBack, onIrParaContas }) => {
    const confirm = useConfirm();
    const fetchOrganizations = useStore(s => s.fetchOrganizations);
    const pessoaFisica = organizationService.ehPessoaFisica(organization);

    const [aba, setAba] = useState<Aba>('organizacao');
    const [companies, setCompanies] = useState<Company[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [orgDirty, setOrgDirty] = useState(false);

    const carregarEmpresas = useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            setCompanies(await companyService.list(organization.id));
        } catch (e: unknown) {
            setErro((e as Error).message);
        } finally {
            setCarregando(false);
        }
    }, [organization.id]);

    useEffect(() => { setAba('organizacao'); carregarEmpresas(); }, [carregarEmpresas]);

    const matriz = pessoaFisica ? null : companies.find(c => c.is_headquarters) ?? null;
    const abasDaMatriz = matriz ? buildCompanyDetailTabs(matriz) : [];
    const ehAbaDaMatriz = abasDaMatriz.some(t => t.id === aba);
    const outrasEmpresas = companies.filter(c => !c.is_headquarters).length;

    const abas: TabsBarItem<Aba>[] = [
        { id: 'organizacao', label: 'Organização' },
        ...abasDaMatriz.map(t => ({ id: t.id as Aba, label: t.label })),
        { id: 'grupo', label: 'Empresas do grupo', badge: outrasEmpresas || undefined },
    ];

    // Matriz salva: o banco já copiou CNPJ/contato/endereço para a org; a lista de
    // organizações em memória é que ficou velha (colunas CNPJ/Contato, subtítulo).
    const handleMatrizSalva = (updated: Company) => {
        setCompanies(prev => prev.map(c => (c.id === updated.id ? { ...c, ...updated } : c)));
        fetchOrganizations();
    };

    const voltar = async () => {
        if (orgDirty) {
            const ok = await confirm({
                title: 'Sair sem salvar?',
                message: 'Há alterações não salvas na aba Organização. Se sair agora, elas serão perdidas.',
                variant: 'warning',
                confirmLabel: 'Sair e descartar',
                cancelLabel: 'Continuar editando',
            });
            if (!ok) return;
        }
        onBack();
    };

    const documento = organization.cnpj
        ? `${pessoaFisica ? 'CPF' : 'CNPJ'} ${organization.cnpj}`
        : (pessoaFisica ? 'CPF não informado' : 'CNPJ não informado');

    return (
        <div className="space-y-6 pb-20">
            {/* §20 + §23 (trilha de 1 salto, como a Ficha do condomínio — decisão do usuário) */}
            <div>
                <Breadcrumb className="mb-2" items={[
                    { label: 'Organizações', onClick: voltar },
                    { label: organization.name },
                ]} />
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{organization.name}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    {pessoaFisica ? 'Pessoa física' : 'Pessoa jurídica'} · {documento}
                </p>
            </div>

            <TabsBar<Aba> tabs={abas} value={aba} onChange={setAba} />

            {erro && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-[6px] text-red-700 text-sm">
                    Não foi possível carregar as empresas da organização: {erro}
                </div>
            )}

            <div className={aba === 'organizacao' ? '' : 'hidden'}>
                <OrganizationPage
                    organization={organization}
                    onUpdate={onSave}
                    onDirtyChange={setOrgDirty}
                    onIrParaIdentificacao={matriz ? () => setAba('identificacao') : undefined}
                    onIrParaContas={onIrParaContas}
                />
            </div>

            {!pessoaFisica && (
                <div className={ehAbaDaMatriz ? '' : 'hidden'}>
                    {carregando ? (
                        <div className="text-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : matriz ? (
                        <CompanyDetailPage
                            key={matriz.id}
                            embedded
                            tab={ehAbaDaMatriz ? (aba as CompanyDetailTab) : undefined}
                            company={matriz}
                            companies={companies}
                            onBack={() => setAba('organizacao')}
                            onSaved={handleMatrizSalva}
                        />
                    ) : null}
                </div>
            )}
            {/* Org PJ sem matriz não deveria existir (o banco cria e o índice garante
                uma) — se acontecer, diz em vez de mostrar abas vazias. */}
            {!pessoaFisica && !carregando && !erro && !matriz && aba === 'organizacao' && (
                <div className="text-center py-8 bg-white rounded-[10px] border border-gray-100">
                    <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Esta organização ainda não tem empresa matriz cadastrada.</p>
                </div>
            )}

            <div className={aba === 'grupo' ? '' : 'hidden'}>
                <CompaniesModule orgId={organization.id} embedded ocultarMatriz />
            </div>
        </div>
    );
};

export default OrganizationDetail;
