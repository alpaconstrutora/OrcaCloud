import React, { useState } from 'react';
import { DataTable } from './ui/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { Search, Filter, Plus, ArrowLeft } from 'lucide-react';
import Button from './ui/Button';

// 1. Tipagem e Dados Falsos
type BudgetPrototypeItem = {
  id: string;
  code: string;
  description: string;
  type: 'INS' | 'COMP' | 'SERV';
  unit: string;
  quantity: number;
  price: number;
};

const MOCK_DATA: BudgetPrototypeItem[] = [
  { id: '1', code: '93565', description: 'CONCRETO USINADO BOMBEAVEL, CLASSE DE RESISTENCIA C30, COM BRITA 0 E 1', type: 'INS', unit: 'm³', quantity: 25.5, price: 420.50 },
  { id: '2', code: '87286', description: 'ARGAMASSA TRAÇO 1:2:8 PARA EMBOÇO/MASSA ÚNICA/ASSENTAMENTO', type: 'COMP', unit: 'm³', quantity: 12.0, price: 380.00 },
  { id: '3', code: '74209', description: 'PINTURA LATEX ACRILICA EM PAREDES INTERNAS', type: 'SERV', unit: 'm²', quantity: 450.0, price: 15.30 },
  { id: '4', code: '94964', description: 'CONJUNTO DE INTERRUPTOR SIMPLES (1 MÓDULO)', type: 'COMP', unit: 'un', quantity: 45.0, price: 18.90 },
];

export default function DataTablePrototype({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<BudgetPrototypeItem[]>(MOCK_DATA);

  // 2. Definição Limpa das Colunas
  const columns: ColumnDef<BudgetPrototypeItem>[] = [
    {
      header: 'Item',
      accessorFn: (_, idx) => `01.${(idx + 1).toString().padStart(2, '0')}`,
      size: 80,
    },
    {
      header: 'Código',
      accessorKey: 'code',
      size: 100,
      cell: ({ row }) => (
        <span className="font-mono text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100">
          {row.original.code}
        </span>
      ),
    },
    {
      header: 'Descrição',
      accessorKey: 'description',
      size: 400,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            row.original.type === 'COMP' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
            row.original.type === 'SERV' ? 'bg-purple-50 text-purple-700 border-purple-200' : 
            'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {row.original.type}
          </span>
          <span className="font-medium text-gray-700 truncate max-w-[300px]" title={row.original.description}>
            {row.original.description}
          </span>
        </div>
      ),
    },
    {
      header: 'Unidade',
      accessorKey: 'unit',
      size: 80,
      cell: ({ row }) => <span className="text-gray-400">{row.original.unit}</span>,
    },
    {
      header: 'Quantidade',
      accessorKey: 'quantity',
      size: 120,
      cell: ({ row, table }) => (
        <input
          type="number"
          value={row.original.quantity}
          onChange={(e) => {
            // Apenas para demonstração: atualiza o estado local
            const val = Number(e.target.value);
            const newData = [...data];
            newData[row.index].quantity = val;
            setData(newData);
          }}
          className="w-full text-center text-sm border border-gray-200 rounded py-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
        />
      ),
    },
    {
      header: 'Preço (R$)',
      accessorKey: 'price',
      size: 120,
      cell: ({ row }) => (
        <div className="text-right text-gray-600 pr-4">
          {row.original.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
      )
    },
    {
      header: 'Subtotal (R$)',
      id: 'subtotal',
      size: 150,
      cell: ({ row }) => {
        const subtotal = row.original.quantity * row.original.price;
        return (
          <div className="text-right font-black text-blue-600 pr-4">
            {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        );
      }
    }
  ];

  const totalBudget = data.reduce((acc, row) => acc + (row.quantity * row.price), 0);

  return (
    <div className="w-full h-full flex flex-col p-6 animate-fade-in space-y-6">
      
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={onBack} className="text-gray-700 hover:text-gray-900 mb-2 flex items-center gap-1 text-sm font-medium transition-colors">
             <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            Protótipo <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded-lg text-lg">Opção A</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">Demonstração da estrutura `@tanstack/react-table` rodando de forma pura e nativa.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100 shadow-sm">
           <div className="text-right">
             <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total do Orçamento</div>
             <div className="text-2xl font-black text-gray-900">R$ {totalBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
           </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative max-w-sm w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar insumos..." 
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
          <button className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 bg-white transition-colors shadow-sm">
            <Filter className="w-4 h-4" />
          </button>
        </div>
        <Button variant="primary" className="shadow-lg shadow-blue-500/20">
          <Plus className="w-4 h-4" /> Adicionar Item
        </Button>
      </div>

      {/* Tabela Componentizada */}
      <DataTable columns={columns} data={data} />

    </div>
  );
}
