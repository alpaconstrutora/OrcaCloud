/**
 * Harness: monta o `ProjectDiaryManager` de produção com registros fabricados em
 * `settings.diaryEntries` (o diário vive em `projects.settings`, não em tabela).
 * As leituras do PostgREST são respondidas pelo Playwright (C:/tmp/pwtest/diario_tabela.js)
 * e toda escrita é abortada — nada é gravado. Prova: registros em StandardTable
 * (busca acoplada, engrenagem, autofit, ordenação) e abas do editor em TabsBar §19.1.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import ProjectDiaryManager from '../../../components/ProjectDiaryManager';
import { ConfirmProvider } from '../../../components/ui/confirm';
import type { ProjectSettings, DiaryEntry } from '../../../types';

const entradas: DiaryEntry[] = [
    {
        id: 'e1', date: '2026-09-18', weather: 'Ensolarado', status: 'Aprovado',
        description: 'Concretagem da laje do 2º pavimento concluída; cura iniciada às 15h.',
        activities: [
            { description: 'Concretagem laje L2', status: 'Finalizada', evolution: 100 },
            { description: 'Armação pilares P10–P14', status: 'Em Andamento', evolution: 60 },
        ] as DiaryEntry['activities'],
        labor: [{ category: 'Pedreiro', quantity: 6 }, { category: 'Servente', quantity: 4 }],
        images: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='], videos: [], documents: [{ name: 'Ensaio slump.pdf', url: '#' }],
        impediments: '',
    },
    {
        id: 'e2', date: '2026-09-19', weather: 'Chuvoso', status: 'Em Análise',
        description: 'Chuva forte no período da tarde; serviços externos suspensos.',
        activities: [{ description: 'Alvenaria fachada norte', status: 'Em Andamento', evolution: 30 }] as DiaryEntry['activities'],
        labor: [{ category: 'Pedreiro', quantity: 3 }],
        images: [], videos: [],
        impediments: 'Chuva impraticável das 13h às 17h',
    },
    {
        id: 'e3', date: '2026-09-21', weather: 'Nublado', status: 'Rascunho',
        description: '',
        activities: [], labor: [], images: [],
    },
];

const settings = {
    name: 'Diário — Igreja Divino Espírito Santo',
    classification: 'DIARIO',
    diaryEntries: entradas,
    schedule: { startDate: '2026-08-01', endDate: '2026-12-20' },
} as unknown as ProjectSettings;

// ConfirmProvider: o Sheet (Adicionar do RH) usa useConfirm(); no app ele vem do App.tsx.
createRoot(document.getElementById('raiz')!).render(
    <ConfirmProvider>
    <ProjectDiaryManager
        settings={settings}
        projects={[{ id: 'p1', name: 'Igreja Divino Espírito Santo', settings: { classification: 'OBRA' } }]}
        onLoadProject={() => undefined}
        onUpdateSettings={() => undefined}
        onBackToList={() => undefined}
        onGenerateReport={() => undefined}
    />
    </ConfirmProvider>
);
