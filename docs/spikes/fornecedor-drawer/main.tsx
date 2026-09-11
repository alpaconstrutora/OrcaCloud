/**
 * Harness: monta o `SupplierSelect` de produção (sem mock) com uma lista que
 * reproduz o que apareceu em Suprimentos › Contratos em 2026-09-11 — nomes
 * longos, CNPJ/CPF mascarados e categorias do catálogo ("Materiais de
 * Construção", "Engenharia e Arquitetura"), que o drawer de 672px cortava.
 *
 * O `passeio.mjs` abre o drawer e mede, célula a célula, se CNPJ e Categoria
 * cabem inteiros (scrollWidth ≤ clientWidth). Só o Nome pode truncar.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import SupplierSelect from '../../../components/SupplierSelect';
import { ConfirmProvider } from '../../../components/ui/confirm';

const suppliers = [
  { id: '1', name: '2 Tabelionato de Notas e Tabelionato de Protesto de Títulos de Pouso Alegre', document: '05.443.920/0001-06', category: 'Orgão Público' },
  { id: '2', name: 'ABR Telhas', document: '', category: 'Distribuidora de Aço' },
  { id: '3', name: 'AC MADEIRAS', document: '151.643.224-34', category: 'Materiais de Construção' },
  { id: '4', name: 'Alan Martins Matos', document: '', category: 'Prestador de Serviços' },
  { id: '5', name: 'ALINE FACILITE FERRAGENS E FERRAMENTAS LTDA', document: '38.383.647/0001-12', category: 'Materiais de Construção' },
  { id: '6', name: 'ALPA CONSTRUTORA E INCORPORADORA LTDA', document: '09.264.396/0001-59', category: 'Prestador de Serviços' },
  { id: '7', name: 'Altair Pereira da Rosa', document: '03853394612', category: 'Sócio' },
  { id: '8', name: 'ALUMINOVO', document: '', category: '' },
  { id: '9', name: 'Álvaro Esteves', document: '', category: 'Engenharia e Arquitetura' },
  { id: '10', name: 'ARCELORMITTAL BRASIL S.A.', document: '17.469.701/0001-77', category: 'Fabricante de Insumo' },
  { id: '11', name: 'Atex Euroinjet Industria e Comercio de Plásticos Ltda', document: '06.912.701/0001-83', category: 'Fabricante de Insumo' },
  { id: '12', name: 'AUTO PECAS DUAUTO LTDA', document: '22.655.807/0001-03', category: 'Materiais de Construção' },
];

function Harness() {
  const [value, setValue] = React.useState('');
  return (
    <ConfirmProvider>
      <div className="space-y-4 bg-white p-6 rounded-2xl border border-gray-100">
        <label className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-widest text-gray-500 mb-1">
          Fornecedor
        </label>
        <SupplierSelect suppliers={suppliers} value={value} onChange={setValue} />
      </div>
    </ConfirmProvider>
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
