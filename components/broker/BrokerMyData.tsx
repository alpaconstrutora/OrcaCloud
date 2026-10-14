import React from 'react';
import { FileText, Percent, Phone, User } from 'lucide-react';
import type { BrokerProfile } from '../../types';
import {
    CardHeader, DetailField, fmtDate, PortalCard, PortalEmpty, StatusPill,
} from '../portal/PortalKit';

/**
 * "Meus dados" do Portal do Corretor — o cadastro que a incorporadora tem do
 * corretor, do jeito que está em Portais › Meus Corretores (`BrokerModal.tsx`),
 * só que em leitura e no mesmo desenho do "Meus dados" do Portal do Parceiro
 * (`supplier/portal/PortalMyData.tsx`): cards do `PortalKit`, rótulo à esquerda
 * e valor à direita, campo vazio some em vez de virar "—".
 *
 * Não reusa o `PortalMyData` porque a entidade é outra: corretor é
 * `broker_profiles` (pessoa, CRECI, imobiliária, comissão), não `suppliers`
 * (CNPJ, endereço, contas bancárias). Os três blocos espelham o formulário do
 * gestor: Identificação (nome, CPF, CRECI, imobiliária, situação), Contato
 * (e-mail, telefone) e Comissão (taxa).
 *
 * O componente é puro: recebe o `BrokerProfile` que a casca já tem em mãos —
 * pelo link público ele chega inteiro em `broker_portal_get_data`
 * (`row_to_json` da linha), então não há RPC nova nem carregamento.
 *
 * Acento: o Portal do Corretor mantém a identidade indigo da casca pública
 * (§19.2 / §24) — por isso os ícones dos cards são indigo, não o coral do kit.
 */
const ACCENT_CLASS = 'text-indigo-600';

interface Props {
    broker: BrokerProfile | null;
}

/** Campo vazio não vira linha "—" solta em bloco de cadastro: some. */
const temValor = (v: unknown) => v !== null && v !== undefined && v !== '';

export const formatarCpf = (v?: string | null) => {
    const d = (v || '').replace(/\D/g, '');
    return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : (v || '');
};

export const formatarComissao = (rate?: number | null) =>
    rate === null || rate === undefined
        ? ''
        : `${Number(rate).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

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
        <CardHeader title={title} subtitle={subtitle} right={<span className={ACCENT_CLASS}>{icon}</span>} />
        <div className="border-t border-[#ECECEF] px-5 py-4">
            <div className="grid grid-cols-1 gap-y-1">{children}</div>
        </div>
    </PortalCard>
);

const BrokerMyData: React.FC<Props> = ({ broker }) => {
    if (!broker) {
        return (
            <PortalCard className="overflow-hidden">
                <PortalEmpty
                    icon={<FileText className="w-9 h-9" />}
                    title="Cadastro indisponível"
                    subtitle="Não foi possível carregar seus dados. Recarregue a página ou fale com a incorporadora."
                />
            </PortalCard>
        );
    }

    const temContato = temValor(broker.email) || temValor(broker.phone);

    return (
        <div className="space-y-3">
            <Bloco
                title="Identificação"
                subtitle="Como a incorporadora tem você cadastrado"
                icon={<User className="w-4 h-4" />}
            >
                <Campo label="Nome" bruto={broker.name} />
                <Campo label="CPF" valor={formatarCpf(broker.cpf)} bruto={broker.cpf} />
                <Campo label="CRECI" bruto={broker.creci} />
                <Campo label="Imobiliária / Agência" bruto={broker.agency_name} />
                <Campo
                    label="Situação"
                    valor={
                        <StatusPill tone={broker.is_active ? 'good' : 'muted'}>
                            {broker.is_active ? 'Ativo' : 'Inativo'}
                        </StatusPill>
                    }
                    bruto={broker.is_active}
                />
                <Campo label="Cadastrado em" valor={fmtDate(broker.created_at)} bruto={broker.created_at} />
            </Bloco>

            {temContato && (
                <Bloco
                    title="Contato"
                    subtitle="Por onde a incorporadora fala com você"
                    icon={<Phone className="w-4 h-4" />}
                >
                    <Campo label="E-mail" bruto={broker.email} />
                    <Campo label="Telefone" bruto={broker.phone} />
                </Bloco>
            )}

            {temValor(broker.commission_rate) && (
                <Bloco
                    title="Comissão"
                    subtitle="Percentual sobre as vendas aprovadas"
                    icon={<Percent className="w-4 h-4" />}
                >
                    <Campo label="Taxa de comissão" valor={formatarComissao(broker.commission_rate)} bruto={broker.commission_rate} />
                </Bloco>
            )}

            <p className="text-[12px] text-[#A0A4AD] px-1">
                Esta tela é somente leitura. Para corrigir qualquer dado, fale com a incorporadora.
            </p>
        </div>
    );
};

export default BrokerMyData;
