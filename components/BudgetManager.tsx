






import React, { useState, useMemo, useEffect } from 'react';
import { Building, Tenant, BudgetAssumption, ContractStatus, UnitStatus, BudgetAdjustment, BudgetAnalysisData, PaymentRecord, BudgetScenario } from '../types';
import { Calculator, Calendar, DollarSign, TrendingUp, Save, Table, LayoutList, ChevronRight, ChevronDown, Download, ShieldAlert, ArrowRight, Maximize2, Minimize2, LineChart as LineChartIcon, Lightbulb, Edit3, X, Sparkles, PieChart, Activity, RotateCcw, TrendingDown, ArrowUpRight, ArrowDownRight, ArrowLeftRight, History, FileText, Info, FileWarning, Layers, Building as BuildingIcon, CheckCircle2, Copy, CloudUpload, Play, Trash2, Plus, Check } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { analyzeBudget } from '../services/geminiService';

interface BudgetManagerProps {
  buildings: Building[];
  tenants: Tenant[];
  budgetAssumptions: BudgetAssumption[];
  budgetAdjustments: BudgetAdjustment[];
  budgetAnalysis: BudgetAnalysisData;
  onUpdateAssumptions: (assumptions: BudgetAssumption[]) => void;
  onUpdateAdjustments: (adjustments: BudgetAdjustment[]) => void;
  onUpdateAnalysis: (analysis: BudgetAnalysisData) => void;
  payments: PaymentRecord[];
  
  // Scenario Props
  scenarios: BudgetScenario[];
  onUpdateScenarios: (scenarios: BudgetScenario[]) => void;
  onActivateScenario: (scenario: BudgetScenario) => void;
  onSaveBudgetToCloud: (name: string, operator: string) => void;
  onRenameScenario: (id: string, newName: string) => void;
}

const getOverlapDays = (start1: Date, end1: Date, start2: Date, end2: Date): number => {
    const overlapStart = start1 > start2 ? start1 : start2;
    const overlapEnd = end1 < end2 ? end1 : end2;
    if (overlapStart <= overlapEnd) {
        return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 3600 * 24)) + 1;
    }
    return 0;
};

const getDaysDiff = (start: Date, end: Date): number => {
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// Helper to calculate exact rent for a period, handling Rent Free and Dynamic Price Changes
const calculateRentForPeriod = (
    start: Date,
    end: Date,
    baseDailyRent: number,
    rentFreePeriods: { start: string, end: string }[],
    priceAdjustment?: { startDate: string, endDate?: string, newDailyRent: number }
): number => {
    // Optimization: If no complex rules, use simple math
    if ((!rentFreePeriods || rentFreePeriods.length === 0) && !priceAdjustment) {
        return getDaysDiff(start, end) * baseDailyRent;
    }

    let totalRent = 0;
    const cursor = new Date(start);
    // Ensure we don't loop forever or process invalid ranges
    if (cursor > end) return 0;

    const adjStart = priceAdjustment ? new Date(priceAdjustment.startDate).getTime() : 0;
    const adjEnd = priceAdjustment?.endDate ? new Date(priceAdjustment.endDate).getTime() : 32503680000000; // Far future

    // Iterate day by day for accuracy with mixed rules
    // Since billing cycles are usually max 1 year (365 iterations), this is performant enough
    while (cursor <= end) {
        const cTime = cursor.getTime();
        
        // Is Rent Free?
        const isFree = rentFreePeriods.some(rf => {
            const rfS = new Date(rf.start).getTime();
            const rfE = new Date(rf.end).getTime();
            return cTime >= rfS && cTime <= rfE;
        });

        if (!isFree) {
            let daily = baseDailyRent;
            if (priceAdjustment && cTime >= adjStart && cTime <= adjEnd) {
                daily = priceAdjustment.newDailyRent;
            }
            totalRent += daily;
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    
    return totalRent;
};

const calculateBillEvents = (
    year: number,
    leaseStartStr: string,
    leaseEndStr: string,
    firstPaymentDateStr: string,
    paymentCycle: 'Monthly' | 'Quarterly' | 'SemiAnnual' | 'Annual',
    firstPaymentMonths: number,
    baseDailyRent: number,
    rentFreePeriods: { start: string, end: string }[],
    priceAdjustment?: { startDate: string, endDate?: string, newDailyRent: number }
): { amount: number, status: string }[] => {
    
    const monthlyData = Array(12).fill(null).map(() => ({ amount: 0, status: 'Vacant' })); // Initialize
    
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const leaseStart = new Date(leaseStartStr);
    const leaseEnd = new Date(leaseEndStr);

    if (leaseStart > yearEnd || leaseEnd < yearStart) return monthlyData;

    // Fill "Active" or "Vacant" status purely based on lease duration first for visual timeline
    for (let m = 0; m < 12; m++) {
        const mStart = new Date(year, m, 1);
        const mEnd = new Date(year, m + 1, 0);
        if (mStart <= leaseEnd && mEnd >= leaseStart) {
            monthlyData[m].status = 'Active';
            
            const isRentFree = rentFreePeriods.some(rf => {
                const rfS = new Date(rf.start);
                const rfE = new Date(rf.end);
                return getOverlapDays(mStart, mEnd, rfS, rfE) > 15; 
            });
            if (isRentFree) monthlyData[m].status = 'RentFree';
        }
    }

    // --- Billing Logic (Cash Flow / Full Cycle) ---
    let currentBillDate = new Date(firstPaymentDateStr);
    let coverageStart = new Date(leaseStart);
    let isFirstCycle = true;
    
    const regularCycleMonths = paymentCycle === 'Quarterly' ? 3 : paymentCycle === 'SemiAnnual' ? 6 : paymentCycle === 'Annual' ? 12 : 1;
    const firstCycleMonths = firstPaymentMonths > 0 ? firstPaymentMonths : regularCycleMonths;

    let safety = 0;
    while (coverageStart <= leaseEnd && safety < 200) {
        safety++;
        
        const durationMonths = isFirstCycle ? firstCycleMonths : regularCycleMonths;
        const coverageEnd = new Date(coverageStart);
        coverageEnd.setMonth(coverageEnd.getMonth() + durationMonths);
        coverageEnd.setDate(coverageEnd.getDate() - 1);
        
        const effectiveCoverageEnd = coverageEnd > leaseEnd ? leaseEnd : coverageEnd;
        
        const billAmount = calculateRentForPeriod(
            coverageStart, 
            effectiveCoverageEnd, 
            baseDailyRent, 
            rentFreePeriods, 
            priceAdjustment
        );

        if (currentBillDate.getFullYear() === year) {
            const monthIdx = currentBillDate.getMonth();
            if (monthIdx >= 0 && monthIdx <= 11) {
                monthlyData[monthIdx].amount += billAmount;
            }
        }

        coverageStart = new Date(effectiveCoverageEnd);
        coverageStart.setDate(coverageStart.getDate() + 1);
        currentBillDate = new Date(coverageStart); 
        isFirstCycle = false;
    }

    return monthlyData;
};

// ... (BudgetImpactSummary Component kept same) ...
const BudgetImpactSummary: React.FC<{ 
    budgetAssumptions: BudgetAssumption[], 
    detailYear: number,
    tenants: Tenant[],
    vacantUnits: any[]
}> = ({ budgetAssumptions, detailYear, tenants, vacantUnits }) => {
    // Helper to calculate simple revenue for an assumption in a given year
    const calculateAssumptionRevenue = (asm: BudgetAssumption, year: number, area: number): number => {
        if (!asm.projectedSignDate) return 0;
        let start = new Date(asm.projectedSignDate);
        const end = new Date(start);
        end.setFullYear(end.getFullYear() + 1);
        const dailyRent = asm.projectedUnitPrice * area;
        const bills = calculateBillEvents(
            year,
            start.toISOString().split('T')[0],
            end.toISOString().split('T')[0],
            start.toISOString().split('T')[0],
            'Quarterly',
            3,
            dailyRent,
            []
        );
        return bills.reduce((sum, b) => sum + b.amount, 0);
    };

    const calculateVacancyRevenue = (year: number) => {
        let revenue = 0;
        vacantUnits.forEach(u => {
            const asm = budgetAssumptions.find(a => a.targetId === u.unitId && a.targetType === 'Vacancy');
            if (asm) revenue += calculateAssumptionRevenue(asm, year, u.area);
        });
        return revenue;
    };
    const vacancyImpactCurrent = calculateVacancyRevenue(detailYear);
    const vacancyImpactNext = calculateVacancyRevenue(detailYear + 1);

    const calculateRenewalRevenue = (year: number) => {
        let revenue = 0;
        tenants.forEach(t => {
            const asm = budgetAssumptions.find(a => a.targetId === t.id && a.targetType === 'Renewal');
            if (asm) revenue += calculateAssumptionRevenue(asm, year, t.totalArea);
        });
        return revenue;
    };
    const renewalImpactCurrent = calculateRenewalRevenue(detailYear);
    const renewalImpactNext = calculateRenewalRevenue(detailYear + 1);

    const calculateRiskImpact = (year: number) => {
        let net = 0;
        tenants.filter(t => t.isRisk).forEach(t => {
            const asm = budgetAssumptions.find(a => a.targetId === t.id && a.targetType === 'RiskTermination');
            if (asm) net += calculateAssumptionRevenue(asm, year, t.totalArea);
        });
        return net;
    };
    const riskImpactCurrent = calculateRiskImpact(detailYear);
    const riskImpactNext = calculateRiskImpact(detailYear + 1);

    const formatMoney = (val: number) => {
        const w = val / 10000;
        const prefix = w > 0 ? '+' : '';
        return `${prefix}${w.toFixed(1)}万`;
    };

    return (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6 text-sm text-indigo-900">
            <div className="flex items-center gap-2 font-bold mb-3 border-b border-indigo-200 pb-2">
                <Info size={18} className="text-indigo-600"/> 预算调整综述 ({detailYear}年 vs {detailYear+1}年)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-2">
                <div className="flex justify-between items-center">
                    <span>1. 空置去化 (新增去化收入):</span>
                    <span className="font-medium bg-white px-2 py-0.5 rounded border border-indigo-100 text-emerald-600">
                        {detailYear}: {formatMoney(vacancyImpactCurrent)} / {detailYear+1}: {formatMoney(vacancyImpactNext)}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span>2. 到期续签/招商 (新签合同收入):</span>
                    <span className="font-medium bg-white px-2 py-0.5 rounded border border-indigo-100 text-blue-600">
                        {detailYear}: {formatMoney(renewalImpactCurrent)} / {detailYear+1}: {formatMoney(renewalImpactNext)}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span>3. 风险客户调整 (换租后新收入):</span>
                    <span className="font-medium bg-white px-2 py-0.5 rounded border border-indigo-100 text-amber-600">
                        {detailYear}: {formatMoney(riskImpactCurrent)} / {detailYear+1}: {formatMoney(riskImpactNext)}
                    </span>
                </div>
            </div>
        </div>
    );
};

export const BudgetManager: React.FC<BudgetManagerProps> = ({ 
    buildings: propBuildings, 
    tenants: propTenants, 
    budgetAssumptions: propAssumptions, 
    onUpdateAssumptions, 
    budgetAdjustments: propAdjustments, 
    onUpdateAdjustments, 
    budgetAnalysis, 
    onUpdateAnalysis, 
    payments,
    scenarios,
    onUpdateScenarios,
    onActivateScenario,
    onSaveBudgetToCloud,
    onRenameScenario
}) => {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  
  // Scenario State
  const [activeScenarioId, setActiveScenarioId] = useState<string>('current'); // 'current' means live data
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioDesc, setNewScenarioDesc] = useState('');
  const [useSnapshot, setUseSnapshot] = useState(true); // Default to snapshotting current data
  
  // Renaming State
  const [isRenaming, setIsRenaming] = useState(false);
  const [tempScenarioName, setTempScenarioName] = useState('');

  // Cloud Save State
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [operatorName, setOperatorName] = useState('');

  // Auto-select the active scenario when component mounts or scenarios change
  useEffect(() => {
      const active = scenarios.find(s => s.isActive);
      if (active) {
          setActiveScenarioId(active.id);
      }
  }, [scenarios]);

  // Determine Effective Data based on active scenario
  const effectiveData = useMemo(() => {
      if (activeScenarioId === 'current') {
          return {
              buildings: propBuildings,
              tenants: propTenants,
              assumptions: propAssumptions,
              adjustments: propAdjustments
          };
      }
      
      const scenario = scenarios.find(s => s.id === activeScenarioId);
      if (!scenario) return {
          buildings: propBuildings,
          tenants: propTenants,
          assumptions: propAssumptions,
          adjustments: propAdjustments
      };

      return {
          buildings: scenario.baseDataSnapshot?.buildings || propBuildings,
          tenants: scenario.baseDataSnapshot?.tenants || propTenants,
          assumptions: scenario.assumptions,
          adjustments: scenario.adjustments
      };
  }, [activeScenarioId, scenarios, propBuildings, propTenants, propAssumptions, propAdjustments]);

  const { buildings, tenants, assumptions: budgetAssumptions, adjustments: budgetAdjustments } = effectiveData;

  // Removed 'Existing' from activeTab default and types
  const [activeTab, setActiveTab] = useState<'Vacancy' | 'Renewal' | 'Risk'>('Vacancy');
  const [viewMode, setViewMode] = useState<'Settings' | 'Monthly' | 'Execution'>('Settings');
  const [detailYear, setDetailYear] = useState<number>(currentYear);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [groupBy, setGroupBy] = useState<'Category' | 'Building'>('Category');
  
  const [isAnalyzingOccupancy, setIsAnalyzingOccupancy] = useState(false);
  const [isAnalyzingRevenue, setIsAnalyzingRevenue] = useState(false);
  const [isAnalyzingExecution, setIsAnalyzingExecution] = useState(false);

  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjData, setAdjData] = useState<{ tenantId: string, tenantName: string, originalMonth: number, amount: number } | null>(null);
  const [adjForm, setAdjForm] = useState({ targetYear: detailYear, targetMonth: 0, reason: 'Pre-payment' });

  // Update Wrapper Functions (To handle if we are editing a scenario or live data)
  const handleUpdateAssumptions = (newAssumptions: BudgetAssumption[]) => {
      if (activeScenarioId === 'current') {
          onUpdateAssumptions(newAssumptions);
      } else {
          // Update scenario in state
          const updatedScenarios = scenarios.map(s => 
              s.id === activeScenarioId ? { ...s, assumptions: newAssumptions } : s
          );
          onUpdateScenarios(updatedScenarios);
      }
  };

  const handleUpdateAdjustments = (newAdjustments: BudgetAdjustment[]) => {
      if (activeScenarioId === 'current') {
          onUpdateAdjustments(newAdjustments);
      } else {
          const updatedScenarios = scenarios.map(s => 
              s.id === activeScenarioId ? { ...s, adjustments: newAdjustments } : s
          );
          onUpdateScenarios(updatedScenarios);
      }
  };

  // --- Scenario Handlers ---
  const handleCreateScenario = () => {
      if (!newScenarioName.trim()) { alert("请输入方案名称"); return; }
      
      const newScenario: BudgetScenario = {
          id: `scenario_${Date.now()}`,
          name: newScenarioName,
          description: newScenarioDesc,
          createdAt: new Date().toISOString(),
          isActive: false,
          assumptions: [...propAssumptions], // Clone current assumptions
          adjustments: [...propAdjustments], // Clone current adjustments
          baseDataSnapshot: useSnapshot ? {
              tenants: JSON.parse(JSON.stringify(propTenants)),
              buildings: JSON.parse(JSON.stringify(propBuildings))
          } : undefined
      };

      onUpdateScenarios([...scenarios, newScenario]);
      setActiveScenarioId(newScenario.id);
      setShowScenarioModal(false);
      setNewScenarioName('');
      setNewScenarioDesc('');
  };

  const handleDeleteScenario = (id: string) => {
      if(window.confirm("确定删除此预算方案吗？")) {
          const newScenarios = scenarios.filter(s => s.id !== id);
          onUpdateScenarios(newScenarios);
          if (activeScenarioId === id) setActiveScenarioId('current');
      }
  };

  const startRenaming = () => {
      const scenario = scenarios.find(s => s.id === activeScenarioId);
      if (scenario) {
          setTempScenarioName(scenario.name);
          setIsRenaming(true);
      }
  };

  const saveRenaming = () => {
      if (tempScenarioName.trim()) {
          onRenameScenario(activeScenarioId, tempScenarioName);
      }
      setIsRenaming(false);
  };

  const handleActivateCurrentScenario = () => {
      const scenario = scenarios.find(s => s.id === activeScenarioId);
      if (scenario) {
          onActivateScenario(scenario);
      }
  };

  const confirmCloudSave = () => {
      if (!operatorName) return;
      const scenarioName = activeScenarioId === 'current' ? '当前生效方案' : scenarios.find(s => s.id === activeScenarioId)?.name || '未命名方案';
      onSaveBudgetToCloud(scenarioName, operatorName);
      setShowCloudModal(false);
  };

  // --- Logic Blocks ---
  const expiringTenants = useMemo(() => {
    return tenants.filter(t => {
      const endYear = new Date(t.leaseEnd).getFullYear();
      return endYear === nextYear && t.status !== ContractStatus.Terminated;
    });
  }, [tenants, nextYear]);

  const vacantUnits = useMemo(() => {
    const list: { unitId: string; unitName: string; buildingName: string; area: number }[] = [];
    buildings.forEach(b => {
      b.units.forEach(u => {
        // Use tenants from effectiveData to determine occupancy in this scenario
        const isOccupied = tenants.some(t => t.unitIds.includes(u.id) && t.status === ContractStatus.Active);
        if (!isOccupied && u.status !== UnitStatus.Occupied && !u.isSelfUse) {
          list.push({
            unitId: u.id,
            unitName: u.name,
            buildingName: b.name,
            area: u.area
          });
        }
      });
    });
    return list;
  }, [buildings, tenants]);

  const riskTenants = useMemo(() => {
    return tenants.filter(t => t.isRisk && t.status === ContractStatus.Active);
  }, [tenants]);

  const activeTenants = useMemo(() => {
      return tenants.filter(t => t.status === ContractStatus.Active);
  }, [tenants]);

  const yearOptions = useMemo(() => {
      return Array.from({length: 11}, (_, i) => currentYear - 5 + i);
  }, [currentYear]);

  const getAssumption = (targetId: string, type: 'Vacancy' | 'Renewal' | 'RiskTermination' | 'Existing', targetName: string) => {
    const existing = budgetAssumptions.find(a => a.targetId === targetId && a.targetType === type);
    if (existing) return existing;
    return {
      id: `budget_${targetId}_${type}`,
      targetType: type,
      targetId: targetId,
      targetName: targetName,
      strategy: 'Renewal',
      projectedSignDate: `${nextYear}-01-01`,
      projectedUnitPrice: 2.5,
      projectedRentFreeMonths: 1,
      vacancyGapMonths: 2,
    } as BudgetAssumption;
  };

  const updateAssumption = (updated: BudgetAssumption) => {
    const others = budgetAssumptions.filter(a => a.targetId !== updated.targetId || a.targetType !== updated.targetType);
    handleUpdateAssumptions([...others, updated]);
  };

  // --- Monthly Detail View Data Generator ---
  const generateMonthlyDetail = (year: number): any[] => {
      const rows: any[] = [];
      tenants.forEach(t => {
          if (t.status === ContractStatus.Terminated) return;
          const isRisk = t.isRisk;
          const leaseEndYear = new Date(t.leaseEnd).getFullYear();
          const isExpiringThisYear = leaseEndYear === year;
          let assumptionType: 'Renewal' | 'RiskTermination' | 'Existing' | null = null;
          if (isRisk) assumptionType = 'RiskTermination';
          else if (isExpiringThisYear) assumptionType = 'Renewal';
          else assumptionType = 'Existing';

          const assumption = budgetAssumptions.find(a => a.targetId === t.id && a.targetType === assumptionType);
          const existingAssumption = budgetAssumptions.find(a => a.targetId === t.id && a.targetType === 'Existing'); 

          let category = '存量客户 (Existing)';
          let effectiveLeaseEnd = t.leaseEnd;
          
          if (isRisk && assumption?.projectedTerminationDate) {
              category = '高风险退租 (Risk Term.)';
              if (new Date(assumption.projectedTerminationDate) < new Date(t.leaseEnd)) {
                  effectiveLeaseEnd = assumption.projectedTerminationDate;
              }
          } else if (isExpiringThisYear) {
              category = assumption?.strategy === 'ReLease' ? '到期退租招商 (Re-lease)' : '续签客户 (Renewals)';
          }

          const building = buildings.find(b => b.id === t.buildingId);
          const unitNames = t.unitIds.map(uid => {
              const unit = building?.units.find(u => u.id === uid);
              return unit ? unit.name : uid;
          }).join(', ');
          const locationStr = `${building?.name || ''} ${unitNames}`;

          // New Logic: Prepare adjustment parameters for calculateBillEvents
          const baseDailyRent = t.unitPrice ? (t.unitPrice * t.totalArea) : (t.monthlyRent * 12 / 365);
          let priceAdjustment = undefined;
          
          // Existing assumption price adjustment logic is removed from UI but kept here just in case legacy data exists
          if (existingAssumption?.priceAdjustment) {
              priceAdjustment = {
                  startDate: existingAssumption.priceAdjustment.startDate,
                  endDate: existingAssumption.priceAdjustment.endDate,
                  newDailyRent: existingAssumption.priceAdjustment.newUnitPrice * t.totalArea
              };
          }

          const existingBills = calculateBillEvents(
              year, t.leaseStart, effectiveLeaseEnd, t.firstPaymentDate || t.leaseStart, t.paymentCycle,
              t.firstPaymentMonths || (t.paymentCycle === 'Quarterly' ? 3 : 1), baseDailyRent, t.rentFreePeriods || [],
              priceAdjustment // NEW PARAM
          );
          let finalMonthlyValues = [...existingBills];
          
          if (existingAssumption?.paymentShift?.isActive) {
              const ps = existingAssumption.paymentShift;
              if (year === ps.fromYear) {
                   if (ps.fromMonth >= 0 && ps.fromMonth < 12) {
                       finalMonthlyValues[ps.fromMonth].amount -= ps.amount;
                       if (finalMonthlyValues[ps.fromMonth].amount < 0) finalMonthlyValues[ps.fromMonth].amount = 0;
                   }
              }
              if (year === ps.toYear) {
                  if (ps.toMonth >= 0 && ps.toMonth < 12) finalMonthlyValues[ps.toMonth].amount += ps.amount;
              }
          }

          if (assumption && assumptionType !== 'Existing') {
             let newStreamStart: Date | null = null;
             if (assumption.targetType === 'Renewal' && assumption.strategy !== 'ReLease') {
                 newStreamStart = new Date(assumption.projectedSignDate);
             } else if (assumption.strategy === 'ReLease' || assumption.targetType === 'RiskTermination') {
                 const baseDate = assumption.targetType === 'RiskTermination' && assumption.projectedTerminationDate 
                    ? new Date(assumption.projectedTerminationDate) : new Date(t.leaseEnd);
                 const gap = assumption.vacancyGapMonths || 0;
                 newStreamStart = new Date(baseDate);
                 newStreamStart.setMonth(newStreamStart.getMonth() + gap);
                 newStreamStart.setDate(newStreamStart.getDate() + 1);
             }

             if (newStreamStart) {
                 const newStreamStartStr = newStreamStart.toISOString().split('T')[0];
                 const newStreamEnd = new Date(newStreamStart);
                 newStreamEnd.setFullYear(newStreamEnd.getFullYear() + 1); 
                 
                 const newRentFree = [];
                 if (assumption.projectedRentFreeMonths > 0) {
                      const rfEnd = new Date(newStreamStart);
                      rfEnd.setMonth(rfEnd.getMonth() + assumption.projectedRentFreeMonths);
                      rfEnd.setDate(rfEnd.getDate() - 1);
                      newRentFree.push({ start: newStreamStartStr, end: rfEnd.toISOString().split('T')[0] });
                 }
                 const newDailyRent = assumption.projectedUnitPrice * t.totalArea;
                 const newBills = calculateBillEvents(
                     year, newStreamStartStr, newStreamEnd.toISOString().split('T')[0], newStreamStartStr,
                     'Quarterly', 3, newDailyRent, newRentFree
                 );
                 finalMonthlyValues = finalMonthlyValues.map((v, i) => {
                      const r = newBills[i];
                      let st = v.status;
                      if (r.status !== 'Vacant') st = r.status;
                      const mStart = new Date(year, i, 1);
                      if (mStart > new Date(effectiveLeaseEnd) && mStart < newStreamStart!) st = 'Vacant';
                      return { amount: v.amount + r.amount, status: st };
                  });
             }
          }

          budgetAdjustments.forEach(adj => {
              if (adj.tenantId === t.id && adj.originalYear === year) {
                  const m = adj.originalMonth;
                  if (m >= 0 && m < 12) {
                       finalMonthlyValues[m].amount -= adj.amount;
                       if (finalMonthlyValues[m].amount < 0) finalMonthlyValues[m].amount = 0; 
                  }
              }
              if (adj.tenantId === t.id && adj.adjustedYear === year) {
                   const m = adj.adjustedMonth;
                   if (m >= 0 && m < 12) finalMonthlyValues[m].amount += adj.amount;
              }
          });

          if (finalMonthlyValues.some(v => v.amount > 0 || v.status !== 'Vacant')) {
            rows.push({
                id: t.id,
                name: t.name,
                building: building?.name || '未知楼宇',
                unitNames: unitNames,
                location: locationStr,
                area: t.totalArea,
                unitPrice: t.unitPrice ? t.unitPrice.toFixed(2) : (t.monthlyRent / t.totalArea * 12 / 365).toFixed(2), // Prepare Price for table
                category,
                monthlyValues: finalMonthlyValues
            });
          }
      });

      vacantUnits.forEach(u => {
          const assumption = budgetAssumptions.find(a => a.targetId === u.unitId && a.targetType === 'Vacancy');
          let monthlyValues = Array(12).fill(null).map(() => ({ amount: 0, status: 'Vacant' }));
          let projectedPrice = 0;
          if (assumption) {
             const projStart = new Date(assumption.projectedSignDate);
             const projEnd = new Date(projStart);
             projEnd.setFullYear(projEnd.getFullYear() + 1);
             const rentFree = [];
             if (assumption.projectedRentFreeMonths > 0) {
                 const rfEnd = new Date(projStart);
                 rfEnd.setMonth(rfEnd.getMonth() + assumption.projectedRentFreeMonths);
                 rfEnd.setDate(rfEnd.getDate() - 1);
                 rentFree.push({ start: assumption.projectedSignDate, end: rfEnd.toISOString().split('T')[0] });
             }
             const dailyRent = assumption.projectedUnitPrice * u.area;
             projectedPrice = assumption.projectedUnitPrice;
             monthlyValues = calculateBillEvents(year, assumption.projectedSignDate, projEnd.toISOString().split('T')[0], assumption.projectedSignDate, 'Quarterly', 3, dailyRent, rentFree);
          }
          rows.push({ 
              id: u.unitId, 
              name: '待租单元', 
              building: u.buildingName, 
              unitNames: u.unitName, 
              location: `${u.buildingName} ${u.unitName}`, 
              area: u.area,
              unitPrice: projectedPrice > 0 ? projectedPrice.toFixed(2) : '-',
              category: '空置去化 (Vacancy Fill)', 
              monthlyValues 
          });
      });

      return rows.sort((a,b) => b.area - a.area);
  };

  const monthlyRows: any[] = useMemo(() => generateMonthlyDetail(detailYear), [detailYear, tenants, vacantUnits, budgetAssumptions, riskTenants, budgetAdjustments]);

  // ... (handleExportScenario, actualsMap, groupedRows, etc. kept same) ...
  const handleExportScenario = () => {
      const scenarioName = activeScenarioId === 'current' ? '当前生效方案' : scenarios.find(s => s.id === activeScenarioId)?.name || '未命名';
      
      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
      </head>
      <body>`;

      html += `<h2>预算方案: ${scenarioName}</h2>`;
      html += `<p>导出时间: ${new Date().toLocaleString()}</p>`;
      
      // Table 1: Assumptions
      html += `<h3>1. 预算假设设定 (Budget Assumptions)</h3>`;
      html += `<table border="1">
        <thead>
            <tr style="background-color: #f0f9ff;">
                <th>类型 (Type)</th>
                <th>目标对象 (Target)</th>
                <th>策略 (Strategy)</th>
                <th>预计日期 (Date)</th>
                <th>预计单价 (Price)</th>
                <th>免租期(月)</th>
                <th>空置期(月)</th>
                <th>调价设定 (Existing)</th>
                <th>账期调整 (Payment Shift)</th>
            </tr>
        </thead>
        <tbody>`;
      
      budgetAssumptions.forEach(asm => {
          let priceAdjStr = '-';
          if (asm.priceAdjustment) {
              priceAdjStr = `新价:${asm.priceAdjustment.newUnitPrice} (${asm.priceAdjustment.startDate}起)`;
          }
          let shiftStr = '-';
          if (asm.paymentShift && asm.paymentShift.isActive) {
              shiftStr = `${asm.paymentShift.fromYear}-${asm.paymentShift.fromMonth+1}月 -> ${asm.paymentShift.toYear}-${asm.paymentShift.toMonth+1}月 (¥${asm.paymentShift.amount})`;
          }

          html += `<tr>
            <td>${asm.targetType}</td>
            <td>${asm.targetName}</td>
            <td>${asm.strategy || '-'}</td>
            <td>${asm.projectedSignDate || asm.projectedTerminationDate || '-'}</td>
            <td>${asm.projectedUnitPrice || '-'}</td>
            <td>${asm.projectedRentFreeMonths || 0}</td>
            <td>${asm.vacancyGapMonths || '-'}</td>
            <td>${priceAdjStr}</td>
            <td>${shiftStr}</td>
          </tr>`;
      });
      html += `</tbody></table>`;

      // Table 2: Adjustments
      html += `<h3>2. 手动调整明细 (Manual Adjustments)</h3>`;
      html += `<table border="1">
        <thead>
            <tr style="background-color: #f0fdf4;">
                <th>客户 (Tenant)</th>
                <th>原账期 (Original)</th>
                <th>调整后账期 (Adjusted)</th>
                <th>金额 (Amount)</th>
                <th>原因 (Reason)</th>
            </tr>
        </thead>
        <tbody>`;
      
      budgetAdjustments.forEach(adj => {
          html += `<tr>
            <td>${adj.tenantName}</td>
            <td>${adj.originalYear}年${adj.originalMonth+1}月</td>
            <td>${adj.adjustedYear}年${adj.adjustedMonth+1}月</td>
            <td>${adj.amount}</td>
            <td>${adj.reason}</td>
          </tr>`;
      });
      html += `</tbody></table>`;

      if (monthlyRows && monthlyRows.length > 0) {
          html += `<h3>3. ${detailYear}年度 月度预算明细预览</h3>`;
          html += `<table border="1">
            <thead>
                <tr style="background-color: #f8fafc;">
                    <th>客户/单元</th>
                    <th>分类</th>
                    <th>1月</th><th>2月</th><th>3月</th><th>4月</th><th>5月</th><th>6月</th>
                    <th>7月</th><th>8月</th><th>9月</th><th>10月</th><th>11月</th><th>12月</th>
                    <th>合计</th>
                </tr>
            </thead>
            <tbody>`;
          
          monthlyRows.forEach((row: any) => {
              const total = row.monthlyValues.reduce((s:number, v:any) => s + v.amount, 0);
              html += `<tr>
                <td>${row.name}</td>
                <td>${row.category}</td>
                ${row.monthlyValues.map((v:any) => `<td>${v.amount > 0 ? v.amount : ''}</td>`).join('')}
                <td>${total}</td>
              </tr>`;
          });
          html += `</tbody></table>`;
      }

      html += `</body></html>`;

      const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Budget_Scenario_${activeScenarioId}_${new Date().toISOString().split('T')[0]}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  const actualsMap = useMemo(() => {
      const map: Record<string, number[]> = {};
      payments.forEach(p => {
          if (p.date && p.date.startsWith(String(detailYear))) {
              const parts = p.date.split('-');
              if (parts.length >= 2) {
                  const m = parseInt(parts[1], 10) - 1; 
                  if (!map[p.tenantId]) map[p.tenantId] = Array(12).fill(0);
                  if (p.type === 'Rent' || p.type === 'DepositToRent' || p.type === 'ParkingFee') {
                      map[p.tenantId][m] += p.amount;
                  }
              }
          }
      });
      return map;
  }, [payments, detailYear]);

  const groupedRows = useMemo(() => {
      const groups: Record<string, any[]> = {};
      monthlyRows.forEach((row: any) => {
          const key = groupBy === 'Category' ? row.category : (row.building || '其他');
          if (!groups[key]) groups[key] = [];
          groups[key].push(row);
      });
      return groups;
  }, [monthlyRows, groupBy]);

  const sortedGroupKeys = useMemo(() => Object.keys(groupedRows).sort(), [groupedRows]);

  const calculateYearMetrics = (year: number) => {
      const rows: any[] = generateMonthlyDetail(year);
      let totalRevenue = 0;
      let totalLeasableArea = 0;
      let totalOccupiedAreaMonths = 0; 
      buildings.forEach(b => b.units.forEach(u => !u.isSelfUse && (totalLeasableArea += u.area)));
      rows.forEach((row: any) => {
          if (row.monthlyValues && Array.isArray(row.monthlyValues)) {
               row.monthlyValues.forEach((val: any) => totalRevenue += val.amount);
               row.monthlyValues.forEach((val: any) => {
                  if (val.status === 'Active' || val.status === 'RentFree') totalOccupiedAreaMonths += row.area;
               });
          }
      });
      const avgOccupancy = totalLeasableArea > 0 ? (totalOccupiedAreaMonths / (totalLeasableArea * 12)) * 100 : 0;
      const avgPrice = totalOccupiedAreaMonths > 0 ? (totalRevenue / (totalOccupiedAreaMonths * 30)) : 0;
      return { totalRevenue, avgOccupancy, avgPrice };
  };

  const comparativeTrend = useMemo(() => {
      const years = [detailYear - 2, detailYear - 1, detailYear, detailYear + 1, detailYear + 2];
      return years.map(y => {
          const m = calculateYearMetrics(y);
          return { year: y, ...m };
      });
  }, [detailYear, tenants, budgetAssumptions, budgetAdjustments]);

  const budgetColumnTotals = useMemo(() => {
      const totals = Array(12).fill(0);
      monthlyRows.forEach(row => {
          row.monthlyValues.forEach((val: any, idx: number) => {
              totals[idx] += val.amount;
          });
      });
      return totals;
  }, [monthlyRows]);

  const actualColumnTotals = useMemo(() => {
      const totals = Array(12).fill(0);
      Object.values(actualsMap).forEach((months: any) => {
          (months as number[]).forEach((val, idx) => {
              if (idx < 12) totals[idx] += val;
          });
      });
      return totals;
  }, [actualsMap]);

  const grandTotal = budgetColumnTotals.reduce((sum, val) => sum + val, 0);

  const occupancyData = useMemo(() => {
     let totalLeasable = 0;
     buildings.forEach(b => b.units.forEach(u => !u.isSelfUse && (totalLeasable += u.area)));
     return Array.from({length: 12}, (_, i) => {
         let occupiedArea = 0;
         monthlyRows.forEach((row: any) => {
             const status = row.monthlyValues[i].status;
             if (status === 'Active' || status === 'RentFree') occupiedArea += row.area;
         });
         const rate = totalLeasable > 0 ? (occupiedArea / totalLeasable * 100) : 0;
         return { month: `${i+1}月`, rate: Number(rate.toFixed(1)) };
     });
  }, [monthlyRows, detailYear, buildings]);

  const handleAIAnalyze = async (type: 'Occupancy' | 'Revenue' | 'Execution') => {
      if (type === 'Occupancy') setIsAnalyzingOccupancy(true);
      else if (type === 'Revenue') setIsAnalyzingRevenue(true);
      else setIsAnalyzingExecution(true);

      let dataSummary: any = {};
      
      if (type === 'Execution') {
          dataSummary = {
              year: detailYear,
              budget: budgetColumnTotals.map(v => Math.round(v)),
              actual: actualColumnTotals.map(v => Math.round(v)),
              budgetTotal: grandTotal,
              actualTotal: actualColumnTotals.reduce((a, b) => a + b, 0),
              completionRate: grandTotal > 0 ? Math.round((actualColumnTotals.reduce((a, b) => a + b, 0) / grandTotal) * 100) + '%' : '0%'
          };
      } else {
          dataSummary = {
            year: detailYear,
            totals: budgetColumnTotals,
            grandTotal: grandTotal,
            occupancyTrend: occupancyData.map(d => d.rate),
            adjustmentCount: budgetAdjustments.length
          };
      }

      const result = await analyzeBudget(dataSummary, type);
      
      onUpdateAnalysis({
          ...budgetAnalysis,
          [type === 'Occupancy' ? 'occupancy' : type === 'Revenue' ? 'revenue' : 'execution']: result
      });

      if (type === 'Occupancy') setIsAnalyzingOccupancy(false);
      else if (type === 'Revenue') setIsAnalyzingRevenue(false);
      else setIsAnalyzingExecution(false);
  };

  const openAdjModal = (row: any, monthIdx: number, amount: number) => {
      if (amount <= 0 || row.category.includes('空置')) return;
      setAdjData({ tenantId: row.id, tenantName: row.name, originalMonth: monthIdx, amount: amount });
      setAdjForm({ targetYear: detailYear, targetMonth: monthIdx, reason: '提前预缴' });
      setShowAdjModal(true);
  };

  const handleSaveAdjustment = () => {
      if (!adjData || !handleUpdateAdjustments) return;
      const newAdj: BudgetAdjustment = {
          id: `adj_${Date.now()}`, tenantId: adjData.tenantId, tenantName: adjData.tenantName,
          originalYear: detailYear, originalMonth: adjData.originalMonth,
          adjustedYear: adjForm.targetYear, adjustedMonth: adjForm.targetMonth,
          amount: adjData.amount, reason: adjForm.reason
      };
      handleUpdateAdjustments([...budgetAdjustments, newAdj]);
      setShowAdjModal(false);
  };

  const handleUndoAdjustment = () => {
      if (budgetAdjustments.length === 0) return;
      if (window.confirm("确定撤销上一次的调整操作吗？")) {
          const newAdj = [...budgetAdjustments];
          newAdj.pop();
          handleUpdateAdjustments(newAdj);
      }
  };

  const renderDetailTable = () => (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${isFullScreen ? 'flex flex-col h-full' : ''}`}>
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 flex-shrink-0">
            <div className="flex items-center gap-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    {viewMode === 'Execution' ? <CheckCircle2 size={18} /> : <Calendar size={18} />}
                    {detailYear}年度 {viewMode === 'Execution' ? '预算执行实况 (Budget vs Actual)' : '现金流预算明细表'}
                </h3>
                <div className="flex bg-white border border-slate-200 rounded-lg p-0.5">
                    <button onClick={() => setDetailYear(detailYear - 1)} className="p-1 hover:bg-slate-100 rounded"><ChevronDown className="rotate-90" size={16}/></button>
                    <span className="px-3 py-1 text-sm font-bold text-slate-700">{detailYear}</span>
                    <button onClick={() => setDetailYear(detailYear + 1)} className="p-1 hover:bg-slate-100 rounded"><ChevronRight size={16}/></button>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-lg p-1">
                    <span className="text-slate-400 text-xs px-2">分类显示:</span>
                    <button onClick={() => setGroupBy('Category')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${groupBy === 'Category' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-700'}`}><Layers size={12} /> 类型</button>
                    <button onClick={() => setGroupBy('Building')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${groupBy === 'Building' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-700'}`}><BuildingIcon size={12} /> 楼栋</button>
                </div>
                <div className="h-4 w-px bg-slate-300"></div>
                <div className="flex gap-2">
                    {viewMode === 'Monthly' && <button onClick={handleUndoAdjustment} disabled={budgetAdjustments.length === 0} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-50 disabled:opacity-50"><RotateCcw size={14} /> 撤销调整</button>}
                    {isFullScreen && <button onClick={() => setIsFullScreen(false)} className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs hover:bg-slate-700"><Minimize2 size={14} /> 退出全屏</button>}
                </div>
            </div>
        </div>
        
        {viewMode === 'Execution' && (
            <div className="p-4 border-b border-slate-200 bg-emerald-50/30">
                <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm flex flex-col">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-emerald-800 flex items-center gap-2 text-sm">
                            <Activity size={16} /> 预算 vs 实际 差异分析
                        </h4>
                        <button onClick={() => handleAIAnalyze('Execution')} disabled={isAnalyzingExecution} className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-emerald-200 transition-colors">
                            <Sparkles size={12}/> {isAnalyzingExecution ? 'AI 分析中...' : '生成差异分析报告'}
                        </button>
                    </div>
                    <textarea 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-emerald-100 outline-none resize-none h-20"
                        placeholder="点击上方按钮，AI 将根据本年度预算与实际回款数据生成对比分析..."
                        value={budgetAnalysis.execution || ''}
                        onChange={e => onUpdateAnalysis({...budgetAnalysis, execution: e.target.value})}
                    />
                </div>
            </div>
        )}

        <div className={`overflow-x-auto ${isFullScreen ? 'flex-1 overflow-y-auto' : 'max-h-[600px]'}`}>
            <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-500 font-medium sticky top-0 z-10 shadow-sm">
                    <tr>
                        <th className="px-3 py-3 border-r border-slate-200 min-w-[150px] sticky left-0 bg-slate-100 z-20">客户名称</th>
                        <th className="px-2 py-3 border-r border-slate-200 min-w-[80px]">房号</th>
                        <th className="px-2 py-3 border-r border-slate-200 min-w-[60px] text-right">面积(㎡)</th>
                        <th className="px-2 py-3 border-r border-slate-200 min-w-[80px] text-right">单价</th>
                        <th className="px-2 py-3 border-r border-slate-200 w-20 text-center">{groupBy === 'Category' ? '楼栋' : '类型'}</th>
                        {Array.from({length: 12}).map((_, i) => <th key={i} className="px-2 py-3 border-r border-slate-200 min-w-[80px] text-right font-normal">{i+1}月</th>)}
                        <th className="px-3 py-3 min-w-[100px] text-right bg-blue-50/50">合计</th>
                    </tr>
                    {viewMode === 'Execution' && (
                        <>
                            <tr className="bg-blue-50/50 text-blue-800 border-b border-blue-100">
                                <td colSpan={5} className="px-3 py-2 text-right font-bold sticky left-0 bg-blue-50/50 z-20">年度预算目标 (Budget)</td>
                                {budgetColumnTotals.map((val, i) => <td key={i} className="px-2 py-2 text-right font-medium border-r border-blue-100">{val > 0 ? (val/10000).toFixed(1) + 'w' : '-'}</td>)}
                                <td className="px-2 py-2 text-right font-bold">{(budgetColumnTotals.reduce((a,b)=>a+b,0)/10000).toFixed(1)}w</td>
                            </tr>
                            <tr className="bg-emerald-50/50 text-emerald-800 border-b border-emerald-100">
                                <td colSpan={5} className="px-3 py-2 text-right font-bold sticky left-0 bg-emerald-50/50 z-20">实际回款达成 (Actual)</td>
                                {actualColumnTotals.map((val, i) => <td key={i} className="px-2 py-2 text-right font-medium border-r border-emerald-100">{val > 0 ? (val/10000).toFixed(1) + 'w' : '-'}</td>)}
                                <td className="px-2 py-2 text-right font-bold">{(actualColumnTotals.reduce((a,b)=>a+b,0)/10000).toFixed(1)}w</td>
                            </tr>
                            <tr className="bg-white text-slate-600 border-b border-slate-200 font-medium">
                                <td colSpan={5} className="px-3 py-2 text-right sticky left-0 bg-white z-20">月度完成率 (%)</td>
                                {budgetColumnTotals.map((budget, i) => {
                                    const actual = actualColumnTotals[i];
                                    const rate = budget > 0 ? Math.round((actual / budget) * 100) : 0;
                                    let colorClass = 'text-slate-400';
                                    if (budget > 0) {
                                        if (rate >= 100) colorClass = 'text-emerald-600 font-bold';
                                        else if (rate >= 80) colorClass = 'text-amber-600';
                                        else colorClass = 'text-rose-600';
                                    } else if (actual > 0) colorClass = 'text-emerald-600 font-bold'; 
                                    return <td key={i} className={`px-2 py-2 text-right border-r border-slate-100 ${colorClass}`}>{budget > 0 ? `${rate}%` : actual > 0 ? 'N/A' : '-'}</td>;
                                })}
                                <td className="px-2 py-2 text-right text-slate-800 bg-slate-50 font-bold">{grandTotal > 0 ? Math.round((actualColumnTotals.reduce((a,b)=>a+b,0) / grandTotal) * 100) : 0}%</td>
                            </tr>
                        </>
                    )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {sortedGroupKeys.map(groupKey => {
                        const rows = groupedRows[groupKey] as any[];
                        const groupTotals = Array(12).fill(0);
                        let groupSum = 0;
                        rows.forEach((r: any) => { r.monthlyValues.forEach((v: any, i: number) => { groupTotals[i] += v.amount; }); });
                        groupSum = groupTotals.reduce((a, b) => a + b, 0);

                        return (
                            <React.Fragment key={groupKey}>
                                <tr className="bg-slate-200/50 font-bold text-slate-700">
                                    <td colSpan={18} className="px-3 py-2 border-y border-slate-200 sticky left-0 z-10 bg-slate-200/50 backdrop-blur-sm"><div className="flex items-center gap-2">{groupBy === 'Category' ? <Layers size={14} /> : <BuildingIcon size={14} />}{groupKey} ({rows.length})</div></td>
                                </tr>
                                {rows.map((row, idx) => {
                                    const rowTotalBudget = row.monthlyValues.reduce((sum: number, v: any) => sum + v.amount, 0);
                                    const actualsForRow = actualsMap[row.id] || Array(12).fill(0);
                                    const rowTotalActual = actualsForRow.reduce((a: number, b: number) => a + b, 0);

                                    return (
                                        <tr key={`${row.id}_${idx}`} className="hover:bg-blue-50/30 group transition-colors">
                                            <td className="px-3 py-2 border-r border-slate-100 sticky left-0 bg-white group-hover:bg-blue-50/30 z-10 font-bold text-slate-700 truncate max-w-[180px]" title={row.name}>
                                                {row.name}
                                            </td>
                                            <td className="px-2 py-2 border-r border-slate-100 text-slate-600 truncate max-w-[100px]" title={row.unitNames}>
                                                {row.unitNames}
                                            </td>
                                            <td className="px-2 py-2 border-r border-slate-100 text-right text-slate-600">
                                                {row.area}
                                            </td>
                                            <td className="px-2 py-2 border-r border-slate-100 text-right text-slate-500 text-[10px]">
                                                {row.unitPrice}
                                            </td>
                                            <td className="px-2 py-2 border-r border-slate-100 text-center text-slate-500">{groupBy === 'Category' ? row.building : row.category.split(' ')[0]}</td>
                                            {row.monthlyValues.map((val: any, mIdx: number) => {
                                                const isAdjusted = budgetAdjustments.some(a => a.tenantId === row.id && ((a.originalYear === detailYear && a.originalMonth === mIdx) || (a.adjustedYear === detailYear && a.adjustedMonth === mIdx)));
                                                const isShifted = budgetAssumptions.some(a => a.targetId === row.id && a.paymentShift?.isActive && ((a.paymentShift.fromYear === detailYear && a.paymentShift.fromMonth === mIdx) || (a.paymentShift.toYear === detailYear && a.paymentShift.toMonth === mIdx)));

                                                if (viewMode === 'Execution') {
                                                    const actualVal = actualsForRow[mIdx] || 0;
                                                    const budgetVal = val.amount;
                                                    let cellClass = 'text-slate-300';
                                                    if (actualVal > 0) {
                                                        if (actualVal >= budgetVal) cellClass = 'text-emerald-600 font-medium';
                                                        else cellClass = 'text-amber-600';
                                                    } else if (budgetVal > 0) {
                                                        const isPast = new Date() > new Date(detailYear, mIdx + 1, 0);
                                                        if (isPast) cellClass = 'text-rose-400'; 
                                                    }
                                                    return <td key={mIdx} className={`px-2 py-2 border-r border-slate-100 text-right ${cellClass}`} title={`预算: ${budgetVal.toLocaleString()}`}>{actualVal > 0 ? actualVal.toLocaleString() : '-'}</td>;
                                                } 
                                                
                                                return (
                                                    <td key={mIdx} className={`px-2 py-2 border-r border-slate-100 text-right relative group/cell ${val.amount > 0 ? 'text-slate-700 font-medium' : 'text-slate-300'} ${val.status === 'Vacant' ? 'bg-slate-50/50' : ''} ${isAdjusted || isShifted ? 'bg-yellow-50/50' : ''}`}>
                                                        {val.amount > 0 ? val.amount.toLocaleString() : '-'}
                                                        {val.status === 'RentFree' && <div className="absolute top-0 right-0 w-2 h-2 bg-emerald-400 rounded-bl-full" title="免租期"></div>}
                                                        {val.status === 'Vacant' && <div className="absolute top-0 left-0 w-full h-full bg-slate-100/30 pointer-events-none"></div>}
                                                        {val.amount > 0 && <button onClick={() => openAdjModal(row, mIdx, val.amount)} className="absolute inset-0 flex items-center justify-center bg-white/90 opacity-0 group-hover/cell:opacity-100 transition-opacity z-20" title="调整此笔账单"><ArrowRight size={14} className="text-blue-600" /></button>}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-3 py-2 font-bold text-slate-800 text-right bg-blue-50/30">{viewMode === 'Execution' ? rowTotalActual.toLocaleString() : rowTotalBudget.toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                                {viewMode !== 'Execution' && (
                                    <tr className="bg-slate-100/80 font-semibold text-slate-600 text-[10px]">
                                        <td className="px-3 py-2 border-r border-slate-200 sticky left-0 bg-slate-100/80 z-10 text-right" colSpan={5}>{groupKey} 小计 (预算)</td>
                                        {groupTotals.map((t, i) => <td key={i} className="px-2 py-2 border-r border-slate-200 text-right">{t > 0 ? t.toLocaleString() : '-'}</td>)}
                                        <td className="px-3 py-2 text-right bg-blue-100/30">{groupSum.toLocaleString()}</td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                    <tr className="bg-slate-800 font-bold text-white sticky bottom-0 z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]">
                        <td className="px-3 py-3 border-r border-slate-600 sticky left-0 bg-slate-800 z-30" colSpan={5}>{viewMode === 'Execution' ? '实际回款总计' : '预算总合计'}</td>
                        {viewMode === 'Execution' 
                            ? actualColumnTotals.map((total, i) => <td key={i} className="px-2 py-3 border-r border-slate-600 text-right text-emerald-300">{total.toLocaleString()}</td>)
                            : budgetColumnTotals.map((total, i) => <td key={i} className="px-2 py-3 border-r border-slate-600 text-right">{total.toLocaleString()}</td>)
                        }
                        <td className="px-3 py-3 text-right bg-blue-600">{viewMode === 'Execution' ? actualColumnTotals.reduce((a,b)=>a+b,0).toLocaleString() : grandTotal.toLocaleString()}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div className="p-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between px-4 flex-shrink-0">
             <div className="flex gap-4">
                 {viewMode === 'Execution' ? (
                     <>
                        <span className="flex items-center gap-1 text-emerald-600 font-medium"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div> 达成预算</span>
                        <span className="flex items-center gap-1 text-amber-600"><div className="w-2 h-2 bg-amber-500 rounded-full"></div> 未达标</span>
                        <span className="flex items-center gap-1 text-rose-400"><div className="w-2 h-2 bg-rose-400 rounded-full"></div> 逾期/缺失</span>
                     </>
                 ) : (
                     <>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-400 rounded-full"></div> 免租期</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-slate-200 rounded"></div> 空置期</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-100 rounded border border-yellow-200"></div> 已调整/挪动</span>
                     </>
                 )}
             </div>
             <div>仅显示当前筛选年度 ({detailYear}) 数据</div>
        </div>
    </div>
  );

  return (
    <div className={`space-y-6 ${isFullScreen ? 'fixed inset-0 z-50 bg-white p-6 flex flex-col h-screen' : ''}`}>
       {/* New Scenario Toolbar */}
       <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-200 p-3 rounded-lg flex-shrink-0">
           <div className="flex items-center gap-3 flex-1 min-w-[200px]">
               <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                   <LayoutList size={16} /> 预算方案:
               </div>
               
               {isRenaming && activeScenarioId !== 'current' ? (
                   <div className="flex items-center gap-1 animate-in zoom-in-50 duration-200">
                       <input 
                           type="text" 
                           className="bg-white border border-blue-400 rounded px-2 py-1.5 text-sm min-w-[200px] outline-none shadow-sm"
                           value={tempScenarioName}
                           onChange={e => setTempScenarioName(e.target.value)}
                           autoFocus
                           onBlur={saveRenaming}
                           onKeyDown={(e) => e.key === 'Enter' && saveRenaming()}
                       />
                       <button onClick={saveRenaming} className="p-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"><Check size={14}/></button>
                   </div>
               ) : (
                   <div className="flex items-center gap-2">
                       <select 
                           value={activeScenarioId} 
                           onChange={e => setActiveScenarioId(e.target.value)} 
                           className="bg-white border border-slate-300 rounded px-3 py-1.5 text-sm min-w-[200px] outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
                       >
                           <option value="current">🟡 当前实时生效方案 (Live)</option>
                           {scenarios.map(s => (
                               <option key={s.id} value={s.id}>
                                   {s.name} {s.isActive ? '(✅生效中)' : ''}
                               </option>
                           ))}
                       </select>
                       
                       {activeScenarioId !== 'current' && (
                           <button onClick={startRenaming} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors" title="重命名方案">
                               <Edit3 size={14} />
                           </button>
                       )}
                   </div>
               )}

               <button onClick={() => setShowScenarioModal(true)} className="p-1.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors" title="新建方案"><Plus size={16}/></button>
               {activeScenarioId !== 'current' && (
                   <button onClick={() => handleDeleteScenario(activeScenarioId)} className="p-1.5 text-rose-600 bg-rose-50 rounded hover:bg-rose-100 transition-colors" title="删除方案"><Trash2 size={16}/></button>
               )}
           </div>
           
           <div className="flex gap-2 items-center">
               {activeScenarioId !== 'current' ? (
                   <div className="flex items-center mr-4">
                       <label className="flex items-center gap-2 cursor-pointer bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-emerald-300 hover:bg-emerald-50 transition-all select-none shadow-sm group">
                           <div className="relative flex items-center">
                               <input 
                                   type="checkbox" 
                                   className="peer sr-only"
                                   checked={scenarios.find(s => s.id === activeScenarioId)?.isActive || false}
                                   onChange={() => handleActivateCurrentScenario()}
                               />
                               <div className="w-4 h-4 border-2 border-slate-300 rounded peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-colors"></div>
                               <Check size={12} className="absolute left-[2px] top-[2px] text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                           </div>
                           <span className="text-sm font-medium text-slate-600 group-hover:text-emerald-700">
                               设为生效方案 (计入系统运算)
                           </span>
                       </label>
                   </div>
               ) : (
                   <span className="text-xs text-slate-400 flex items-center px-2">正在编辑主数据 (系统实时运算)</span>
               )}
               
               <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>
               
               <button onClick={handleExportScenario} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-sm hover:bg-slate-50">
                   <Download size={14} /> 导出方案
               </button>
               <button onClick={() => setShowCloudModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-sky-50 text-sky-600 border border-sky-200 rounded text-sm hover:bg-sky-100">
                   <CloudUpload size={14} /> 云端保存 (预算专版)
               </button>
           </div>
       </div>

       {activeScenarioId !== 'current' && (
           <div className="bg-amber-50 border border-amber-100 text-amber-800 px-4 py-2 rounded-md text-sm flex items-center gap-2">
               <Info size={16} />
               {scenarios.find(s => s.id === activeScenarioId)?.isActive 
                   ? <span>当前方案<b>已生效</b>。您对此方案的修改将实时反映在系统各项报表中。</span>
                   : <span>您正在预览/编辑<b>草稿方案</b>。此方案数据暂未计入系统运算，勾选上方"设为生效方案"后即可应用。</span>
               }
               {scenarios.find(s => s.id === activeScenarioId)?.baseDataSnapshot && <span className="font-bold ml-2 text-amber-900 bg-amber-100 px-2 rounded text-xs">[已加载历史快照数据]</span>}
           </div>
       )}

       <div className="flex items-center justify-between flex-shrink-0 mb-6">
           <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
               <Calculator /> 预算管理 (Budgeting)
           </h2>
           <div className="flex items-center gap-2">
                {!isFullScreen && (
                    <div className="flex bg-slate-100 rounded-lg p-1 mr-4">
                        <button onClick={() => setViewMode('Settings')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'Settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            <LayoutList size={16}/> 预算假设设定
                        </button>
                        <button onClick={() => setViewMode('Monthly')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'Monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Table size={16}/> 月度应收明细
                        </button>
                        <button onClick={() => setViewMode('Execution')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'Execution' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            <CheckCircle2 size={16}/> 预算实际执行情况
                        </button>
                    </div>
                )}
                {(viewMode === 'Monthly' || viewMode === 'Execution') && !isFullScreen && (
                    <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors" title={isFullScreen ? "退出全屏" : "全屏显示"}>
                        {isFullScreen ? <Maximize2 size={20} /> : <Minimize2 size={20} />}
                    </button>
                )}
           </div>
       </div>
       
       {!isFullScreen && viewMode !== 'Execution' && <BudgetImpactSummary budgetAssumptions={budgetAssumptions} detailYear={detailYear} tenants={tenants} vacantUnits={vacantUnits} />}

       {/* ... (Overview Cards & Charts kept but using EFFECTIVE data) ... */}
       {!isFullScreen && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                   <div className="relative z-10">
                       <p className="text-blue-100 text-sm font-medium mb-1">{detailYear}年 预计总营收 (Cash Basis)</p>
                       <h3 className="text-3xl font-bold">¥{(grandTotal).toLocaleString()}</h3>
                       <p className="text-xs text-blue-200 mt-2 flex items-center gap-1"><Activity size={12}/> 含存量、续签及去化假设</p>
                   </div>
                   <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                   <div>
                       <p className="text-slate-500 text-sm font-medium">预计平均出租率</p>
                       <div className="flex items-end gap-2 mt-2">
                           <h3 className="text-3xl font-bold text-slate-800">{(occupancyData.reduce((s,d)=>s+d.rate,0)/12).toFixed(1)}%</h3>
                           <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium mb-1">目标: 90%</span>
                       </div>
                   </div>
                   <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                       <div className="bg-blue-500 h-full rounded-full" style={{width: `${(occupancyData.reduce((s,d)=>s+d.rate,0)/12)}%`}}></div>
                   </div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                   <div>
                       <p className="text-slate-500 text-sm font-medium">到期续签率假设</p>
                       <h3 className="text-3xl font-bold text-slate-800 mt-2">
                           {expiringTenants.length > 0 ? Math.round((budgetAssumptions.filter(a => a.targetType === 'Renewal' && a.strategy !== 'ReLease').length / expiringTenants.length) * 100) : 100}%
                       </h3>
                       <p className="text-xs text-slate-400 mt-1">基于当前设定策略</p>
                   </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><ArrowLeftRight size={20} className="text-blue-500" /> 年度预算对比分析 (5年趋势)</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium">
                            <tr><th className="px-6 py-3">关键指标</th>{comparativeTrend.map(d => <th key={d.year} className={`px-6 py-3 text-center ${d.year === detailYear ? 'bg-blue-50 text-blue-700 font-bold border-b-2 border-blue-500' : ''}`}>{d.year}年{d.year === detailYear && <span className="block text-[10px] font-normal">(当前预算)</span>}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            <tr><td className="px-6 py-4 font-medium text-slate-700">预算收款总额 (万元)</td>{comparativeTrend.map(d => <td key={d.year} className="px-6 py-4 text-center font-semibold">¥{(d.totalRevenue / 10000).toFixed(1)}</td>)}</tr>
                            <tr><td className="px-6 py-4 font-medium text-slate-700">平均出租率</td>{comparativeTrend.map(d => <td key={d.year} className="px-6 py-4 text-center">{d.avgOccupancy.toFixed(1)}%</td>)}</tr>
                            <tr><td className="px-6 py-4 font-medium text-slate-700">平均出租单价 (元/㎡/天)</td>{comparativeTrend.map(d => <td key={d.year} className="px-6 py-4 text-center text-slate-500">¥{d.avgPrice.toFixed(2)}</td>)}</tr>
                        </tbody>
                    </table>
                </div>
            </div>
          </div>
       )}

       {viewMode === 'Monthly' && !isFullScreen && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                   <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 flex items-center gap-2"><LineChartIcon size={18} className="text-blue-500" /> 出租率趋势分析</h3><button onClick={() => handleAIAnalyze('Occupancy')} disabled={isAnalyzingOccupancy} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-blue-100 transition-colors"><Sparkles size={12}/> {isAnalyzingOccupancy ? '生成中...' : 'AI 智能分析'}</button></div>
                   <div className="h-[200px] w-full mb-4"><ResponsiveContainer width="100%" height="100%"><LineChart data={occupancyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="month" tick={{fill: '#64748b', fontSize: 10}} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{fill: '#64748b', fontSize: 10}} axisLine={false} tickLine={false} unit="%" /><Tooltip /><Line type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
                   <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none resize-none h-24" placeholder="在此输入或生成关于出租率变化的分析..." value={budgetAnalysis.occupancy} onChange={e => onUpdateAnalysis({...budgetAnalysis, occupancy: e.target.value})}/>
               </div>
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                   <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 flex items-center gap-2"><DollarSign size={18} className="text-emerald-500" /> 营收与回款分析</h3><button onClick={() => handleAIAnalyze('Revenue')} disabled={isAnalyzingRevenue} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-emerald-100 transition-colors"><Sparkles size={12}/> {isAnalyzingRevenue ? '生成中...' : 'AI 智能分析'}</button></div>
                   <div className="flex-1 bg-slate-50 rounded-lg p-4 mb-4 flex flex-col items-center justify-center border border-slate-200 border-dashed relative overflow-hidden"><div className="text-center z-10"><p className="text-xs text-slate-400">年度总营收 (万元)</p><p className="text-2xl font-bold text-slate-700">¥{(grandTotal/10000).toFixed(1)}</p></div></div>
                   <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-emerald-100 outline-none resize-none h-24" placeholder="在此输入或生成关于营收回款的分析..." value={budgetAnalysis.revenue} onChange={e => onUpdateAnalysis({...budgetAnalysis, revenue: e.target.value})}/>
               </div>
           </div>
       )}

       {viewMode === 'Settings' && !isFullScreen && (
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="flex border-b border-slate-200 overflow-x-auto">
                   <button onClick={() => setActiveTab('Vacancy')} className={`whitespace-nowrap px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'Vacancy' ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}>空置去化 ({vacantUnits.length})</button>
                   <button onClick={() => setActiveTab('Renewal')} className={`whitespace-nowrap px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'Renewal' ? 'border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'text-slate-500 hover:bg-slate-50'}`}>到期续签 ({expiringTenants.length})</button>
                   <button onClick={() => setActiveTab('Risk')} className={`whitespace-nowrap px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'Risk' ? 'border-b-2 border-rose-600 text-rose-600 bg-rose-50/50' : 'text-slate-500 hover:bg-slate-50'}`}>风险预警 ({riskTenants.length})</button>
               </div>
               
               <div className="p-6 overflow-x-auto">
                   <table className="w-full text-sm text-left">
                       <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                           <tr>
                               <th className="px-4 py-3 min-w-[150px]">客户/房源</th><th className="px-4 py-3">面积 (㎡)</th>
                               {activeTab !== 'Vacancy' && activeTab !== 'Risk' && <th className="px-4 py-3">预算策略</th>}<th className="px-4 py-3 min-w-[160px]">{activeTab === 'Risk' ? '预计退租日期' : activeTab === 'Renewal' ? '新合同起租日' : '预计去化日期'}</th>{(activeTab === 'Risk' || (activeTab === 'Renewal' && expiringTenants.some(t => { const a = budgetAssumptions.find(x => x.targetId === t.id && x.targetType === 'Renewal'); return a?.strategy === 'ReLease'; }))) && (<th className="px-4 py-3 min-w-[100px]">空置期(月)</th>)}<th className="px-4 py-3 min-w-[140px]">预计单价 (元/天)</th><th className="px-4 py-3 min-w-[100px]">免租(月)</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                           {activeTab === 'Vacancy' && vacantUnits.map(unit => { const assumption = getAssumption(unit.unitId, 'Vacancy', `${unit.buildingName} ${unit.unitName}`); return (<tr key={unit.unitId} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-medium text-slate-800">{unit.buildingName} {unit.unitName}</div><div className="text-xs text-slate-400">当前空置</div></td><td className="px-4 py-3">{unit.area}</td><td className="px-4 py-3"><input type="date" className="border rounded px-2 py-1 w-full text-xs" value={assumption.projectedSignDate} onChange={e => updateAssumption({...assumption, projectedSignDate: e.target.value})} /></td><td className="px-4 py-3"><div className="flex items-center gap-1"><span>¥</span><input type="number" className="border rounded px-2 py-1 w-16 text-xs font-semibold text-blue-600" value={assumption.projectedUnitPrice !== undefined ? assumption.projectedUnitPrice : ''} step={0.1} onChange={e => updateAssumption({...assumption, projectedUnitPrice: Number(e.target.value)})} /></div></td><td className="px-4 py-3"><input type="number" className="border rounded px-2 py-1 w-12 text-xs" value={assumption.projectedRentFreeMonths !== undefined ? assumption.projectedRentFreeMonths : ''} onChange={e => updateAssumption({...assumption, projectedRentFreeMonths: Number(e.target.value)})} /></td></tr>); })}
                           {activeTab === 'Renewal' && expiringTenants.map(tenant => { const assumption = getAssumption(tenant.id, 'Renewal', tenant.name); const isReLease = assumption.strategy === 'ReLease'; return (<tr key={tenant.id} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-medium text-slate-800">{tenant.name}</div><div className="text-xs text-amber-600">到期: {tenant.leaseEnd}</div></td><td className="px-4 py-3">{tenant.totalArea}</td><td className="px-4 py-3"><select className={`border rounded px-2 py-1 text-xs font-medium ${isReLease ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`} value={assumption.strategy || 'Renewal'} onChange={e => updateAssumption({...assumption, strategy: e.target.value as any})}><option value="Renewal">续签</option><option value="ReLease">退租招商</option></select></td><td className="px-4 py-3"><div className="flex flex-col gap-1"><input type="date" className="border rounded px-2 py-1 w-full text-xs" value={assumption.projectedSignDate} onChange={e => updateAssumption({...assumption, projectedSignDate: e.target.value})} />{isReLease && <div className="text-[10px] text-slate-400">(建议: 到期日 + 空置期)</div>}</div></td>{(activeTab === 'Risk' || expiringTenants.some(t => { const a = budgetAssumptions.find(x => x.targetId === t.id && x.targetType === 'Renewal'); return a?.strategy === 'ReLease'; })) && (<td className="px-4 py-3">{isReLease ? <input type="number" className="border rounded px-2 py-1 w-12 text-xs bg-indigo-50" value={assumption.vacancyGapMonths !== undefined ? assumption.vacancyGapMonths : ''} onChange={e => updateAssumption({...assumption, vacancyGapMonths: Number(e.target.value)})} placeholder="2" /> : <span className="text-slate-300">-</span>}</td>)}<td className="px-4 py-3"><div className="flex items-center gap-1"><span>¥</span><input type="number" className="border rounded px-2 py-1 w-16 text-xs font-semibold text-blue-600" value={assumption.projectedUnitPrice !== undefined ? assumption.projectedUnitPrice : ''} step={0.1} onChange={e => updateAssumption({...assumption, projectedUnitPrice: Number(e.target.value)})} /></div></td><td className="px-4 py-3"><input type="number" className="border rounded px-2 py-1 w-12 text-xs" value={assumption.projectedRentFreeMonths !== undefined ? assumption.projectedRentFreeMonths : ''} onChange={e => updateAssumption({...assumption, projectedRentFreeMonths: Number(e.target.value)})} /></td></tr>); })}
                           {activeTab === 'Risk' && riskTenants.map(tenant => { const assumption = getAssumption(tenant.id, 'RiskTermination', tenant.name); return (<tr key={tenant.id} className="hover:bg-slate-50 border-l-4 border-rose-500"><td className="px-4 py-3"><div className="font-medium text-slate-800 flex items-center gap-1"><ShieldAlert size={14} className="text-rose-500"/> {tenant.name}</div><div className="text-xs text-slate-400">到期: {tenant.leaseEnd}</div></td><td className="px-4 py-3">{tenant.totalArea}</td><td className="px-4 py-3"><input type="date" className="border rounded px-2 py-1 w-full text-xs" value={assumption.projectedTerminationDate} onChange={e => updateAssumption({...assumption, projectedTerminationDate: e.target.value})} /></td><td className="px-4 py-3"><input type="number" className="border rounded px-2 py-1 w-12 text-xs bg-indigo-50" value={assumption.vacancyGapMonths !== undefined ? assumption.vacancyGapMonths : ''} onChange={e => updateAssumption({...assumption, vacancyGapMonths: Number(e.target.value)})} placeholder="3" /></td><td className="px-4 py-3"><div className="flex items-center gap-1"><span>¥</span><input type="number" className="border rounded px-2 py-1 w-16 text-xs font-semibold text-blue-600" value={assumption.projectedUnitPrice !== undefined ? assumption.projectedUnitPrice : ''} step={0.1} onChange={e => updateAssumption({...assumption, projectedUnitPrice: Number(e.target.value)})} /></div></td><td className="px-4 py-3"><input type="number" className="border rounded px-2 py-1 w-12 text-xs" value={assumption.projectedRentFreeMonths !== undefined ? assumption.projectedRentFreeMonths : ''} onChange={e => updateAssumption({...assumption, projectedRentFreeMonths: Number(e.target.value)})} /></td></tr>); })}
                       </tbody>
                   </table>
               </div>
           </div>
       )}

       {(viewMode === 'Monthly' || viewMode === 'Execution') && renderDetailTable()}

       {showAdjModal && adjData && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
               <div className="bg-white rounded-xl shadow-xl w-96 p-6">
                   <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                       <ArrowLeftRight size={20}/> 调整账期/金额
                   </h3>
                   <div className="space-y-4">
                       <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm">
                           <p><span className="text-slate-500">客户:</span> {adjData.tenantName}</p>
                           <p><span className="text-slate-500">原账期:</span> {detailYear}年{adjData.originalMonth+1}月</p>
                           <p><span className="text-slate-500">金额:</span> <span className="font-bold text-blue-600">¥{adjData.amount.toLocaleString()}</span></p>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-4">
                           <div>
                               <label className="block text-xs font-medium text-slate-600 mb-1">调整至年份</label>
                               <select className="w-full border rounded p-2 text-sm" value={adjForm.targetYear} onChange={e => setAdjForm({...adjForm, targetYear: Number(e.target.value)})}>
                                   {yearOptions.map(y => <option key={y} value={y}>{y}年</option>)}
                               </select>
                           </div>
                           <div>
                               <label className="block text-xs font-medium text-slate-600 mb-1">调整至月份</label>
                               <select className="w-full border rounded p-2 text-sm" value={adjForm.targetMonth} onChange={e => setAdjForm({...adjForm, targetMonth: Number(e.target.value)})}>
                                   {Array.from({length:12}).map((_, i) => <option key={i} value={i}>{i+1}月</option>)}
                               </select>
                           </div>
                       </div>
                       <div>
                           <label className="block text-xs font-medium text-slate-600 mb-1">调整原因</label>
                           <input type="text" className="w-full border rounded p-2 text-sm" value={adjForm.reason} onChange={e => setAdjForm({...adjForm, reason: e.target.value})} />
                       </div>
                       <div className="flex justify-end gap-2 pt-2">
                           <button onClick={() => setShowAdjModal(false)} className="px-4 py-2 border rounded text-slate-600">取消</button>
                           <button onClick={handleSaveAdjustment} className="px-4 py-2 bg-blue-600 text-white rounded">确认调整</button>
                       </div>
                   </div>
               </div>
           </div>
       )}

       {showScenarioModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-50 duration-200">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-lg font-bold text-slate-800">新建预算方案</h3>
                       <button onClick={() => setShowScenarioModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                   </div>
                   <div className="space-y-4">
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">方案名称 <span className="text-red-500">*</span></label>
                           <input type="text" className="w-full border rounded-lg p-2 text-sm" placeholder="例如: 2025乐观版" value={newScenarioName} onChange={e => setNewScenarioName(e.target.value)} autoFocus />
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">备注说明</label>
                           <input type="text" className="w-full border rounded-lg p-2 text-sm" placeholder="方案描述..." value={newScenarioDesc} onChange={e => setNewScenarioDesc(e.target.value)} />
                       </div>
                       
                       <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                           <label className="flex items-start gap-2 cursor-pointer">
                               <input type="checkbox" className="mt-1 w-4 h-4 text-blue-600 rounded" checked={useSnapshot} onChange={e => setUseSnapshot(e.target.checked)} />
                               <div>
                                   <span className="block text-sm font-medium text-blue-800">保存当前业务数据快照 (推荐)</span>
                                   <span className="block text-xs text-blue-600 mt-1">勾选后，该预算方案将永久基于此刻的"租户与楼宇"状态进行测算，不再随系统实时数据变化。</span>
                               </div>
                           </label>
                       </div>

                       <div className="flex justify-end gap-2 pt-2">
                           <button onClick={() => setShowScenarioModal(false)} className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">取消</button>
                           <button onClick={handleCreateScenario} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">创建方案</button>
                       </div>
                   </div>
               </div>
           </div>
       )}

       {showCloudModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-50 duration-200">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CloudUpload size={20} className="text-sky-600"/> 预算云端保存</h3>
                       <button onClick={() => setShowCloudModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                   </div>
                   <div className="space-y-4">
                       <div className="bg-sky-50 p-3 rounded-lg text-xs text-sky-800">
                           此操作将专门保存当前的预算配置。在云端备份历史中，该记录将自动标记为 <b>[预算方案]</b> 类型。
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">操作人员 (必填)</label>
                           <input type="text" className="w-full border rounded-lg p-2 text-sm" placeholder="请输入您的姓名" value={operatorName} onChange={e => setOperatorName(e.target.value)} />
                       </div>
                       <div className="flex justify-end gap-2 pt-2">
                           <button onClick={() => setShowCloudModal(false)} className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">取消</button>
                           <button onClick={confirmCloudSave} disabled={!operatorName.trim()} className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50">确认上传</button>
                       </div>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};