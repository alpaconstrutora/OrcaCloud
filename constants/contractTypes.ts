export type ContractTypeCategory = 'Serviços' | 'Suprimentos' | 'Geral';

export const DEFAULT_CONTRACT_TYPES: { name: string; category: ContractTypeCategory }[] = [
    { name: 'Prestação de Serviços', category: 'Serviços' },
    { name: 'Empreitada Global', category: 'Serviços' },
    { name: 'Empreitada Parcial', category: 'Serviços' },
    { name: 'Preço Fechado', category: 'Serviços' },
    { name: 'Preço Unitário', category: 'Serviços' },
    { name: 'Contrato por Medição', category: 'Serviços' },
    { name: 'Contrato Recorrente', category: 'Serviços' },
    { name: 'Manutenção', category: 'Serviços' },
    { name: 'Instalação', category: 'Serviços' },
    { name: 'Reforma', category: 'Serviços' },
    { name: 'Administração', category: 'Suprimentos' },
    { name: 'Subempreitada', category: 'Suprimentos' },
    { name: 'Compra e Venda', category: 'Geral' },
    { name: 'Outros', category: 'Geral' },
];
