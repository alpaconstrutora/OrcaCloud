// types/electrical.ts

export interface OpuraElectricalProject {
    id: string;
    organizationId: string;
    projectId: string;
    name: string;
    technicalLead?: string | null;
    tensionType?: string | null;
    defaultVoltage?: number | null;
    status: string;
    createdAt: string;
    updatedAt: string;
}

export interface OpuraElectricalVersion {
    id: string;
    organizationId: string;
    electricalProjectId: string;
    versionNumber: number;
    status: string;
    isLocked: boolean;
    approvedBy?: string | null;
    approvedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface OpuraElectricalPlan {
    id: string;
    organizationId: string;
    versionId: string;
    fileUrl?: string | null;
    floorName?: string | null;
    scaleFactor?: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface OpuraElectricalRoom {
    id: string;
    organizationId: string;
    planId: string;
    name: string;
    areaSqm?: number | null;
    perimeterM?: number | null;
    polygonPoints?: any | null;
    createdAt: string;
    updatedAt: string;
}

export interface OpuraElectricalWall {
    id: string;
    organizationId: string;
    planId: string;
    points: any;
    thicknessM?: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface OpuraElectricalBoard {
    id: string;
    organizationId: string;
    versionId: string;
    name: string;
    boardType?: string | null;
    voltage?: number | null;
    phases?: number | null;
    mainBreakerCapacity?: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface OpuraElectricalCircuit {
    id: string;
    organizationId: string;
    boardId: string;
    name: string;
    circuitType?: string | null;
    voltage?: number | null;
    installedPowerW?: number | null;
    demandFactor?: number | null;
    breakerCapacity?: number | null;
    wireSectionMm2?: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface OpuraElectricalPoint {
    id: string;
    organizationId: string;
    roomId: string;
    circuitId?: string | null;
    pointType: string;
    powerW?: number | null;
    voltage?: number | null;
    heightM?: number | null;
    canvasX?: number | null;
    canvasY?: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface OpuraElectricalTakeoff {
    id: string;
    organizationId: string;
    versionId: string;
    itemType?: string | null;
    description: string;
    quantity: number;
    unit?: string | null;
    unitCost?: number | null;
    wasteFactor?: number | null;
    createdAt: string;
    updatedAt: string;
}
