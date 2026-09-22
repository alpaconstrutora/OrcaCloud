import React from 'react';
import { Building2, FileText, MapPin } from 'lucide-react';
import { Client } from '../../../types';
import { CardHeader, DetailField, fmtDate, PortalCard, PortalEmpty } from '../../portal/PortalKit';

/**
 * "Meus dados" do Portal do Cliente — **o mesmo painel do Portal do Fornecedor**
 * (`supplier/portal/PortalMyData.tsx`), pedido do usuário em 22/09/2026:
 * "quero igual, mesmo UI e UX do portal do fornecedor no portal do cliente para
 * o Menu de conta". Mesmos blocos (Identificação · Endereço e contato), mesmas
 * primitivas do PortalKit, mesmo acento coral, só leitura. O que muda é a
 * entidade: `Client` em vez de `Supplier` (o cliente não tem CNPJa nem conta
 * bancária, então os dois últimos blocos daquele painel não existem aqui).
 */

/** Campo vazio não vira linha "—" solta em bloco de cadastro: some. */
const temValor = (v: unknown) =>
    v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

const documento = (c: Client) => {
    const d = (c.document || '').replace(/\D/g, '');
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return c.document || '';
};

const cep = (v?: string) => {
    const d = (v || '').replace(/\D/g, '');
    return d.length === 8 ? d.replace(/^(\d{5})(\d{3})$/, '$1-$2') : (v || '');
};

const Campo: React.FC<{ label: string; valor?: React.ReactNode; bruto?: unknown }> = ({ label, valor, bruto }) => {
    const conteudo = valor ?? (bruto as React.ReactNode);
    if (!temValor(bruto !== undefined ? bruto : valor)) return null;
    return <DetailField label={label}>{conteudo}</DetailField>;
};

const Bloco: React.FC<{ title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, icon, children }) => (
    <PortalCard className="overflow-hidden">
        <CardHeader title={title} subtitle={subtitle} right={<span className="text-[#E1553C]">{icon}</span>} />
        <div className="border-t border-[#ECECEF] px-5 py-4">
            <div className="grid grid-cols-1 gap-y-1">{children}</div>
        </div>
    </PortalCard>
);

const ClientPortalMyData: React.FC<{ client: Client | null }> = ({ client }) => {
    if (!client) {
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

    const cidadeUf = [client.city, client.state].filter(Boolean).join(' / ');
    const temEndereco = [client.address, client.address_number, client.neighborhood, cidadeUf, client.zip_code].some(temValor);

    return (
        <div className="space-y-3">
            <Bloco title="Identificação" subtitle="Como a construtora tem você cadastrado" icon={<Building2 className="w-4 h-4" />}>
                <Campo label="Razão social / Nome" bruto={client.name} />
                <Campo label="Código" bruto={client.code} />
                <Campo label="Tipo" valor={client.type === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'} bruto={client.type} />
                <Campo label={client.type === 'PJ' ? 'CNPJ' : 'CPF'} valor={documento(client)} bruto={client.document} />
                <Campo label="Categoria" bruto={client.category} />
                <Campo label="Portal" bruto={client.portal} />
                <Campo label="Cadastrado em" valor={fmtDate(client.created_at)} bruto={client.created_at ?? ''} />
            </Bloco>

            {temEndereco || client.email || client.phone ? (
                <Bloco title="Endereço e contato" subtitle="Para onde a construtora manda contrato e cobrança" icon={<MapPin className="w-4 h-4" />}>
                    <Campo label="E-mail" bruto={client.email} />
                    <Campo label="Telefone" bruto={client.phone} />
                    <Campo label="Logradouro" bruto={client.address} />
                    <Campo label="Número" bruto={client.address_number} />
                    <Campo label="Bairro" bruto={client.neighborhood} />
                    <Campo label="Cidade / UF" bruto={cidadeUf} />
                    <Campo label="CEP" valor={cep(client.zip_code)} bruto={client.zip_code} />
                </Bloco>
            ) : null}
        </div>
    );
};

export default ClientPortalMyData;
