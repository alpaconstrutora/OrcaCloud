/**
 * Harness: Engenharia › Planejamento › Recursos — Funções, Trabalhadores e Alocação
 * em StandardTable (pedido de 10/10/2026).
 *
 * `ResourceManagement` de produção, sem mock, dentro do mesmo card que o
 * `FinancialSchedule.tsx` monta para a vista Recursos. Só os dados são fabricados:
 * funções SINAPI (duas com o mesmo nome), trabalhadores, uma equipe, e tarefas com
 * composição de mão de obra para a aba Alocação ter as três situações.
 *
 * `window.__gravado` guarda o último `onUpdateResources` (o passeio confere o
 * Confirmar da Alocação por ele).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { ResourceManagement } from '../../../components/ResourceManagement';
import { ConfirmProvider } from '../../../components/ui/confirm';

const roles = [
    { id: 'r1', name: 'PEDREIRO', costPerHour: 30.12, costPerDay: 241, description: 'SINAPI · Código: 88309', source: 'SINAPI' },
    { id: 'r2', name: 'PEDREIRO', costPerHour: 32.4, costPerDay: 259, overtimeCostPerHour: 50, description: 'SINAPI · Código: 88310', source: 'SINAPI' },
    { id: 'r3', name: 'SERVENTE', costPerHour: 20.5, costPerDay: 164, description: 'SINAPI · Código: 88316', source: 'SINAPI', workDays: [1, 2, 3, 4, 5] },
    { id: 'r4', name: 'CARPINTEIRO DE FORMAS', costPerHour: 31.9, costPerDay: 255, description: 'SINAPI · Código: 88262', source: 'SINAPI', costPerUse: 45 },
    { id: 'r5', name: 'ELETRICISTA', costPerHour: 34.1, costPerDay: 273 },
];
const workers = [
    { id: 'w1', name: 'João Pereira da Silva', roleId: 'r1', email: 'joao.silva@alpa.com.br', phone: '(31) 99999-0001' },
    { id: 'w2', name: 'Maria Aparecida Souza', roleId: 'r3' },
    { id: 'w3', name: 'Carlos Henrique Lima', roleId: 'r4', workDays: [1, 3, 5] },
];
const teams = [{ id: 't1', name: 'Equipe Estrutura', memberIds: ['w3', 'w2'] }];

const comp = (desc: string) => ({ code: '1', description: desc, unit: 'H', quantity: 1, price: 25, type: 'LABOR', nature: 'Mão de obra' });
const budget = [
    { id: 'a', quantity: 1, sinapiItem: { code: 'A', description: 'Alvenaria de vedação de blocos cerâmicos furados na horizontal', price: 100, unit: 'm2', composition: [comp('PEDREIRO COM ENCARGOS COMPLEMENTARES'), comp('SERVENTE COM ENCARGOS COMPLEMENTARES')] } },
    { id: 'b', quantity: 1, sinapiItem: { code: 'B', description: 'Montagem e desmontagem de fôrma de pilares retangulares', price: 100, unit: 'm2', composition: [comp('CARPINTEIRO DE FORMAS COM ENCARGOS')] } },
    { id: 'c', quantity: 1, sinapiItem: { code: 'C', description: 'Chapisco aplicado em alvenaria', price: 100, unit: 'm2', composition: [comp('PEDREIRO COM ENCARGOS COMPLEMENTARES')] } },
    { id: 'd', quantity: 1, sinapiItem: { code: 'D', description: 'Pintura látex acrílica', price: 100, unit: 'm2', composition: [] } },
] as any[];
const itemSchedules = [
    { id: 'a', startDate: '2026-10-05', endDate: '2026-10-20', duration: 12, allocations: [{ id: 'al1', resourceId: 'w1', resourceType: 'WORKER', quantity: 1, hoursPerDay: 8 }] },
    { id: 'b', startDate: '2026-10-08', endDate: '2026-10-18', duration: 8, allocations: [] },
    { id: 'c', startDate: '2026-10-10', endDate: '2026-10-25', duration: 10, allocations: [{ id: 'al2', resourceId: 'w1', resourceType: 'WORKER', quantity: 1, hoursPerDay: 8 }] },
    { id: 'd', startDate: '2026-11-03', endDate: '2026-11-10', duration: 5, allocations: [] },
] as any[];

function Harness() {
    const [resources, setResources] = React.useState<any>({ roles, workers, teams, materials: [] });
    const [schedules, setSchedules] = React.useState<any[]>(itemSchedules);
    return (
        <div className="space-y-6">
            {/* Mesmo card da vista Recursos em FinancialSchedule.tsx */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[600px]">
                <ResourceManagement
                    resources={resources}
                    itemSchedules={schedules}
                    budget={budget}
                    localLabel="Planejamento"
                    onUpdateResources={(r, s) => {
                        (window as any).__gravado = { resources: r, itemSchedules: s };
                        setResources(r);
                        if (s) setSchedules(s);
                    }}
                />
            </div>
        </div>
    );
}

createRoot(document.getElementById('raiz')!).render(<ConfirmProvider><Harness /></ConfirmProvider>);
