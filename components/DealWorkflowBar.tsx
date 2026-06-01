import React, { useState } from 'react';
import { CheckCircle2, Circle, XCircle, ChevronRight } from 'lucide-react';
import { WORKFLOW_STEPS, DealWorkflowStatus, getStepIndex, canTransition, validateTransition } from '../lib/dealWorkflow';
import { PropertyDeal } from '../types';
import DealCancelModal from './DealCancelModal';

interface DealWorkflowBarProps {
    currentStatus: DealWorkflowStatus;
    deal: Partial<PropertyDeal>;
    organizationId?: string;
    onTransition: (to: DealWorkflowStatus, meta?: { reason?: string; refundAmount?: number }) => void;
    disabled?: boolean;
}

const DealWorkflowBar: React.FC<DealWorkflowBarProps> = ({ currentStatus, deal, organizationId, onTransition, disabled }) => {
    const currentIdx = getStepIndex(currentStatus);
    const isCancelled = currentStatus === 'CANCELLED';
    const [showCancelModal, setShowCancelModal] = useState(false);

    const handleAdvance = () => {
        const next = WORKFLOW_STEPS[currentIdx + 1]?.status;
        if (!next) return;
        const error = validateTransition(currentStatus, next, deal);
        if (error) { alert(error); return; }
        onTransition(next);
    };

    const handleCancel = () => {
        if (!canTransition(currentStatus, 'CANCELLED')) return;
        setShowCancelModal(true);
    };

    const handleCancelConfirm = (reason: string, refundAmount: number) => {
        setShowCancelModal(false);
        onTransition('CANCELLED', { reason, refundAmount });
    };

    const handleReopen = () => {
        if (!canTransition(currentStatus, 'IN_NEGOTIATION')) return;
        onTransition('IN_NEGOTIATION');
    };

    if (isCancelled) {
        return (
            <>
                <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <div className="flex items-center gap-3">
                        <XCircle className="w-5 h-5 text-red-500" />
                        <span className="text-sm font-bold text-red-700">Negociação Cancelada / Distrato</span>
                    </div>
                    {!disabled && (
                        <button
                            onClick={handleReopen}
                            className="px-4 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-xl hover:bg-red-100 transition-all"
                        >
                            Reabrir
                        </button>
                    )}
                </div>
                {showCancelModal && (
                    <DealCancelModal
                        isOpen={showCancelModal}
                        deal={deal}
                        organizationId={organizationId || deal.organization_id || ''}
                        onConfirm={handleCancelConfirm}
                        onClose={() => setShowCancelModal(false)}
                    />
                )}
            </>
        );
    }

    const nextStep = WORKFLOW_STEPS[currentIdx + 1];
    const canAdvance = nextStep && !disabled;

    return (
        <div className="space-y-3">
            {/* Steps */}
            <div className="flex items-center gap-1">
                {WORKFLOW_STEPS.map((step, idx) => {
                    const isPast = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    const isFuture = idx > currentIdx;
                    return (
                        <React.Fragment key={step.status}>
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all
                                ${isCurrent ? `${step.bgColor} ${step.color} border ${step.borderColor}` : ''}
                                ${isPast ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : ''}
                                ${isFuture ? 'bg-gray-50 text-gray-400 border border-gray-100' : ''}
                            `}>
                                {isPast && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                                {isCurrent && <Circle className="w-3.5 h-3.5 shrink-0 fill-current opacity-30" />}
                                <span className="hidden sm:inline">{step.label}</span>
                            </div>
                            {idx < WORKFLOW_STEPS.length - 1 && (
                                <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${idx < currentIdx ? 'text-emerald-400' : 'text-gray-300'}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Actions */}
            {!disabled && (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">
                        {WORKFLOW_STEPS[currentIdx]?.description}
                    </p>
                    <div className="flex gap-2 shrink-0">
                        {canTransition(currentStatus, 'CANCELLED') && (
                            <button
                                onClick={handleCancel}
                                className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs font-bold rounded-xl hover:bg-red-100 transition-all"
                            >
                                Cancelar
                            </button>
                        )}
                        {canAdvance && (
                            <button
                                onClick={handleAdvance}
                                className={`px-4 py-1.5 text-xs font-bold rounded-xl border transition-all
                                    ${nextStep.bgColor} ${nextStep.color} ${nextStep.borderColor}
                                    hover:brightness-95`}
                            >
                                → {nextStep.label}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {showCancelModal && (
                <DealCancelModal
                    isOpen={showCancelModal}
                    deal={deal}
                    organizationId={organizationId || deal.organization_id || ''}
                    onConfirm={handleCancelConfirm}
                    onClose={() => setShowCancelModal(false)}
                />
            )}
        </div>
    );
};

export default DealWorkflowBar;
