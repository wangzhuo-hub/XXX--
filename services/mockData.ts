
import { DashboardData, ContractStatus, UnitStatus, DepositStatus, Building, Tenant, PaymentRecord, MonthlyTrend, Unit } from '../types';

// Helper to generate units with specific configuration
const generateCustomUnits = (buildingPrefix: string, floorsConfig: { floor: number, type: 'whole' | 'multi', count?: number }[]): Unit[] => {
  const units: Unit[] = [];
  
  floorsConfig.forEach(config => {
    if (config.type === 'whole') {
        // Whole floor rental - Single large unit
        // Simply named "1F", "2F" etc.
        units.push({
            id: `${buildingPrefix}-${config.floor}01`,
            name: `${config.floor}F`, 
            area: 1200, // Large area for whole floor
            status: UnitStatus.Vacant,
            floor: config.floor,
        });
    } else {
        // Multi-tenant floor
        const count = config.count || 6;
        for (let u = 1; u <= count; u++) {
            const unitNum = `${config.floor}${u.toString().padStart(2, '0')}`;
            // Random area variation
            const baseArea = 80;
            const randomFactor = Math.random();
            let area = baseArea;
            
            if (randomFactor > 0.8) area = 350; // Large
            else if (randomFactor > 0.5) area = 180; // Medium
            else area = 90 + Math.floor(Math.random() * 40); // Small

            units.push({
                id: `${buildingPrefix}-${unitNum}`,
                name: unitNum,
                area: area, 
                status: UnitStatus.Vacant,
                floor: config.floor,
            });
        }
    }
  });

  return units;
};

export const generateInitialData = (): DashboardData => {
  // 1. Setup Buildings
  
  // Building 1: 4 Floors. Floor 1 & 2 are Whole, 3-4 are Multi.
  const b1Units = generateCustomUnits('b1', [
      { floor: 1, type: 'whole' },
      { floor: 2, type: 'whole' },
      { floor: 3, type: 'multi', count: 8 },
      { floor: 4, type: 'multi', count: 8 },
  ]);

  // Building 2: 4 Floors. Floor 1 & 3 are Whole, 2 & 4 are Multi.
  const b2Units = generateCustomUnits('b2', [
      { floor: 1, type: 'whole' },
      { floor: 2, type: 'multi', count: 6 },
      { floor: 3, type: 'whole' },
      { floor: 4, type: 'multi', count: 6 },
  ]);

  // Building 3: 2 Floors. Both are Whole.
  const b3Units = generateCustomUnits('b3', [
      { floor: 1, type: 'whole' },
      { floor: 2, type: 'whole' },
  ]);

  const buildings: Building[] = [
    { id: 'b1', name: '1号楼', units: b1Units },
    { id: 'b2', name: '2号楼', units: b2Units },
    { id: 'b3', name: '3号楼', units: b3Units },
  ];

  // 2. Mock Tenants with Basic Info
  // Generate some tenants for demo purposes if empty
  const tenants: Tenant[] = [];

  // 3. Clear Payments
  const payments: PaymentRecord[] = [];

  const currentYear = new Date().getFullYear();

  return {
    buildings,
    tenants,
    payments,
    totalArea: 0, 
    leasedArea: 0, 
    occupancyRate: 0,
    annualRevenueTarget: 10000000,
    annualRevenueCollected: 0,
    annualOccupancyTarget: 90,
    monthlyRevenueTarget: 0,
    monthlyRevenueCollected: 0,
    collectionRate: 0,
    newContractsCount: 0,
    expiringSoonCount: 0,
    recentSignings: [],
    expiringSoon: [],
    monthlyTrends: [],
    currentMonthBilling: [],
    parkingStats: {
        totalContractSpaces: 0,
        totalActualSpaces: 0,
        totalMonthlyRevenue: 0,
        details: []
    },
    budgetAssumptions: [],
    budgetAdjustments: [],
    budgetAnalysis: {
        occupancy: '',
        revenue: ''
    },
    budgetScenarios: [],
    yearlyTargets: {
        [currentYear]: { revenue: 12000000, occupancy: 92 },
        [currentYear - 1]: { revenue: 10000000, occupancy: 88 },
        [currentYear + 1]: { revenue: 15000000, occupancy: 95 }
    }
  };
};
