import React from 'react';
import { Banknote, Building2, FileText, Landmark, MapPin } from 'lucide-react';
import { Supplier } from '../../../types';
import {
    ACCOUNT_TYPE_LABELS, PIX_KEY_TYPE_LABELS, SupplierBankAccount,
} from '../../../types/supplierBankAccount';
import {
    CardHeader, DetailField, fmtDate, PortalCard, PortalEmpty, PortalLoading, StatusPill, TagChip,
} from '../../portal/PortalKit';

interface Props {
    supplier: Supplier | null;
    bankAccounts: SupplierBankAccount[];
    /**
     * Só o bloco bancário carrega — os outros três vêm do `supplier`, que já
     * está em mãos quando o painel abre. Um spinner cobrindo a tela inteira
     * esconderia dado que não está sendo esperado.
     */
    loadingBankAccounts: boolean;
}

/**
 * "Meus dados" — o cadastro que a construtora tem do fornecedor, do jeito que
 * ele está em Minha Organização › Meus Fornecedores (`SupplierForm.tsx`), só que
 * em leitura e no vocabulário dos portais externos (§24).
 *
 * Os quatro blocos espelham as três abas daquele cadastro: Dados gerais vira
 * "Identificação" + "Dados oficiais (CNPJ)", porque no portal a parte da Receita
 * é longa o bastante para ser bloco próprio; "Endereços e contatos" e "Dados
 * bancários" vêm um para um.
 *
 * De onde vem cada coisa: os três primeiros blocos saem da própria linha de
 * `suppliers` que `supplier_portal_get_data` já devolvia inteira; o bloco
 * bancário é tabela à parte e chega pela RPC criada em
 * `aplicar_20270921000001_supplier_portal_dados_bancarios.sql`.
 */

/** Campo vazio não vira linha "—" solta em bloco de cadastro: some. */
const temValor = (v: unknown) =>
    v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

const documento = (s: Supplier) => {
    const d = (s.document || '').replace(/\D/g, '');
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return s.document || '';
};

const cep = (v?: string) => {
    const d = (v || '').replace(/\D/g, '');
    return d.length === 8 ? d.replace(/^(\d{5})(\d{3})$/, '$1-$2') : (v || '');
};

const simNao = (v?: boolean | null, desde?: string | null) => {
    if (v === null || v === undefined) return '';
    if (!v) return 'Não';
    return desde ? `Sim, desde ${fmtDate(desde)}` : 'Sim';
};

/** Só renderiza a linha quando há valor — a checagem fica num lugar só. */
const Campo: React.FC<{ label: string; valor?: React.ReactNode; bruto?: unknown }> = ({ label, valor, bruto }) => {
    const conteudo = valor ?? (bruto as React.ReactNode);
    if (!temValor(bruto !== undefined ? bruto : valor)) return null;
    return <DetailField label={label}>{conteudo}</DetailField>;
};

const Bloco: React.FC<{
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, subtitle, icon, children }) => (
    <PortalCard className="overflow-hidden">
        <CardHeader title={title} subtitle={subtitle} right={<span className="text-[#E1553C]">{icon}</span>} />
        <div className="border-t border-[#ECECEF] px-5 py-4">
            <div className="grid grid-cols-1 gap-y-1">{children}</div>
        </div>
    </PortalCard>
);

const PortalMyData: React.FC<Props> = ({ supplier, bankAccounts, loadingBankAccounts }) => {
    if (!supplier) {
        return (
            <PortalCard className="overflow-hidden">
                <PortalEmpty
                    icon={<FileText className="w-9 h-9" />}
                    title="Cadastro indisponível"
                    subtitle="Não foi possível carregar seus dados. Recarregue a página ou fale com a construtora."
                />
            </PortalCard>
        );
    }

    const cidadeUf = [supplier.city, supplier.state].filter(Boolean).join(' / ');
    const logradouro = supplier.street || supplier.address;
    const temEndereco = [logradouro, supplier.number, supplier.neighborhood, cidadeUf, supplier.zip_code].some(temValor);

    // O bloco da Receita só existe se houve consulta CNPJa — fornecedor PF ou
    // recém-cadastrado não tem nada aqui, e um card vazio só ocupa a tela.
    const oficiais: unknown[] = [
        supplier.cnpj_status, supplier.cnpj_legal_nature, supplier.cnpj_company_size,
        supplier.cnpj_founded_at, supplier.cnpj_main_activity_text,
        supplier.cnpj_side_activities, supplier.cnpj_partners,
        supplier.cnpj_simples_optant, supplier.cnpj_simei_optant,
        supplier.cnpj_state_registrations,
    ];
    const temOficiais = oficiais.some(temValor);

    return (
        <div className="space-y-3">
            <Bloco
                title="Identificação"
                subtitle="Como a construtora tem você cadastrado"
                icon={<Building2 className="w-4 h-4" />}
            >
                <Campo label="Razão social / Nome" bruto={supplier.name} />
                <Campo label="Nome fantasia" bruto={supplier.nickname} />
                <Campo label="Código" bruto={supplier.code} />
                <Campo label="Tipo" valor={supplier.type === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'} bruto={supplier.type} />
                <Campo label={supplier.type === 'PJ' ? 'CNPJ' : 'CPF'} valor={documento(supplier)} bruto={supplier.document} />
                <Campo label="Categoria" bruto={supplier.category} />
                <Campo label="Portal" bruto={supplier.portal} />
                <Campo label="Cadastrado em" valor={fmtDate(supplier.created_at)} bruto={supplier.created_at} />
            </Bloco>

            {temEndereco || supplier.email || supplier.phone || supplier.contact_name ? (
                <Bloco
                    title="Endereço e contato"
                    subtitle="Para onde a construtora manda pedido e cobrança"
                    icon={<MapPin className="w-4 h-4" />}
                >
                    <Campo label="Pessoa de contato" bruto={supplier.contact_name} />
                    <Campo label="E-mail" bruto={supplier.email} />
                    <Campo label="Telefone" bruto={supplier.phone} />
                    <Campo label="Logradouro" bruto={logradouro} />
                    <Campo label="Número" bruto={supplier.number} />
                    <Campo label="Bairro" bruto={supplier.neighborhood} />
                    <Campo label="Cidade / UF" bruto={cidadeUf} />
                    <Campo label="CEP" valor={cep(supplier.zip_code)} bruto={supplier.zip_code} />
                </Bloco>
            ) : null}

            {temOficiais && (
                <Bloco
                    title="Dados oficiais"
                    subtitle="O que veio da consulta ao CNPJ na Receita Federal"
                    icon={<FileText className="w-4 h-4" />}
                >
                    <Campo
                        label="Situação cadastral"
                        valor={
                            <span className="inline-flex items-center gap-2">
                                <StatusPill tone={supplier.cnpj_status === 'ATIVA' ? 'good' : 'neutral'}>
                                    {supplier.cnpj_status}
                                </StatusPill>
                                {supplier.cnpj_status_date && (
                                    <span className="text-[#8A8F9A]">desde {fmtDate(supplier.cnpj_status_date)}</span>
                                )}
                            </span>
                        }
                        bruto={supplier.cnpj_status}
                    />
                    <Campo label="Abertura" valor={fmtDate(supplier.cnpj_founded_at)} bruto={supplier.cnpj_founded_at} />
                    <Campo label="Natureza jurídica" bruto={supplier.cnpj_legal_nature} />
                    <Campo label="Porte" bruto={supplier.cnpj_company_size} />
                    <Campo
                        label="Atividade principal"
                        valor={[supplier.cnpj_main_activity_code, supplier.cnpj_main_activity_text].filter(Boolean).join(' — ')}
                        bruto={supplier.cnpj_main_activity_text || supplier.cnpj_main_activity_code}
                    />
                    <Campo
                        label="Simples Nacional"
                        valor={simNao(supplier.cnpj_simples_optant, supplier.cnpj_simples_since)}
                        bruto={supplier.cnpj_simples_optant}
                    />
                    <Campo
                        label="SIMEI"
                        valor={simNao(supplier.cnpj_simei_optant, supplier.cnpj_simei_since)}
                        bruto={supplier.cnpj_simei_optant}
                    />
                    <Campo
                        label="Última consulta"
                        valor={fmtDate(supplier.cnpj_updated_at)}
                        bruto={supplier.cnpj_updated_at}
                    />

                    {temValor(supplier.cnpj_side_activities) && (
                        <div className="pt-2">
                            <p className="text-[13px] text-[#8A8F9A] mb-1.5">Atividades secundárias</p>
                            <div className="flex flex-wrap gap-1.5">
                                {supplier.cnpj_side_activities!.map((a, i) => (
                                    <TagChip key={`${a.code}-${i}`}>{a.code} — {a.text}</TagChip>
                                ))}
                            </div>
                        </div>
                    )}

                    {temValor(supplier.cnpj_state_registrations) && (
                        <div className="pt-2">
                            <p className="text-[13px] text-[#8A8F9A] mb-1.5">Inscrições estaduais</p>
                            <div className="flex flex-wrap gap-1.5">
                                {supplier.cnpj_state_registrations!.map((ie, i) => (
                                    <TagChip key={`${ie.number}-${i}`}>
                                        {ie.state} · {ie.number}{ie.enabled === false ? ' (baixada)' : ''}
                                    </TagChip>
                                ))}
                            </div>
                        </div>
                    )}

                    {temValor(supplier.cnpj_partners) && (
                        <div className="pt-2">
                            <p className="text-[13px] text-[#8A8F9A] mb-1.5">Quadro societário</p>
                            <div className="flex flex-wrap gap-1.5">
                                {supplier.cnpj_partners!.map((p, i) => (
                                    <TagChip key={`${p.name}-${i}`}>{p.name}{p.role ? ` · ${p.role}` : ''}</TagChip>
                                ))}
                            </div>
                        </div>
                    )}
                </Bloco>
            )}

            <PortalCard className="overflow-hidden">
                <CardHeader
                    title="Dados bancários"
                    subtitle={
                        loadingBankAccounts || bankAccounts.length === 0
                            ? undefined
                            : `${bankAccounts.length} conta${bankAccounts.length === 1 ? '' : 's'} que a construtora usa para te pagar`
                    }
                    right={<span className="text-[#E1553C]"><Landmark className="w-4 h-4" /></span>}
                />
                {loadingBankAccounts ? (
                    <div className="border-t border-[#ECECEF]"><PortalLoading label="Carregando dados bancários..." /></div>
                ) : bankAccounts.length === 0 ? (
                    <div className="border-t border-[#ECECEF]">
                        <PortalEmpty
                            icon={<Banknote className="w-9 h-9" />}
                            title="Nenhuma conta cadastrada"
                            subtitle="Peça à construtora para registrar sua conta ou chave PIX."
                        />
                    </div>
                ) : (
                    <div className="border-t border-[#ECECEF] divide-y divide-[#F4F4F6]">
                        {bankAccounts.map(acc => (
                            <div key={acc.id} className="px-5 py-4">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <p className="text-sm font-semibold text-[#1F2430] truncate">
                                        {[acc.bank_code, acc.bank_name].filter(Boolean).join(' — ') || 'Banco não informado'}
                                    </p>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {acc.is_primary && <StatusPill tone="accent">Principal</StatusPill>}
                                        {acc.is_pix_primary && <StatusPill tone="info">PIX principal</StatusPill>}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-y-1">
                                    <Campo
                                        label="Agência"
                                        valor={[acc.agency, acc.agency_digit].filter(Boolean).join('-')}
                                        bruto={acc.agency}
                                    />
                                    <Campo
                                        label="Conta"
                                        valor={[acc.account, acc.account_digit].filter(Boolean).join('-')}
                                        bruto={acc.account}
                                    />
                                    <Campo
                                        label="Tipo"
                                        valor={ACCOUNT_TYPE_LABELS[acc.account_type]}
                                        bruto={acc.account_type}
                                    />
                                    <Campo label="Favorecido" bruto={acc.beneficiary_name} />
                                    <Campo label="CPF/CNPJ do favorecido" bruto={acc.beneficiary_document} />
                                    <Campo
                                        label={acc.pix_key_type ? `Chave PIX (${PIX_KEY_TYPE_LABELS[acc.pix_key_type]})` : 'Chave PIX'}
                                        bruto={acc.pix_key}
                                    />
                                    <Campo label="Observações" bruto={acc.notes} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </PortalCard>

            <p className="text-[12px] text-[#A0A4AD] px-1">
                Esta tela é somente leitura. Para corrigir qualquer dado, fale com a construtora.
            </p>
        </div>
    );
};

export default PortalMyData;
