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

const calculateBillEvents = (
    year: number,
    leaseStartStr: string,
    leaseEndStr: string,
    firstPaymentDateStr: string,
    paymentCycleMonths: number,
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

    // 1. Fill "Active" Status based on physical occupancy (coverage period)
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

    // 2. Billing Logic
    const standardMonthlyRent = (baseDailyRent * 365) / 12;

    let currentBillDate = firstPaymentDateStr ? new Date(firstPaymentDateStr) : new Date(leaseStart);
    if (!firstPaymentDateStr) {
        currentBillDate = new Date(leaseStart);
        currentBillDate.setMonth(currentBillDate.getMonth() - 1);
    }

    let coverageStart = new Date(leaseStart);
    let isFirstCycle = true;
    
    const regularCycleMonths = paymentCycleMonths || 3;
    const firstCycleMonths = firstPaymentMonths > 0 ? firstPaymentMonths : regularCycleMonths;

    let safety = 0;
    while (coverageStart <= leaseEnd && safety < 200) {
        safety++;
        
        const durationMonths = isFirstCycle ? firstCycleMonths : regularCycleMonths;
        const coverageEnd = new Date(coverageStart);
        coverageEnd.setMonth(coverageEnd.getMonth() + durationMonths);
        coverageEnd.setDate(coverageEnd.getDate() - 1);
        
        const effectiveCoverageEnd = coverageEnd > leaseEnd ? leaseEnd : coverageEnd;
        
        // Calculate Rent Free Days
        let freeDays = 0;
        rentFreePeriods.forEach(rf => {
            const rfStart = new Date(rf.start);
            const rfEnd = new Date(rf.end);
            freeDays += getOverlapDays(coverageStart, effectiveCoverageEnd, rfStart, rfEnd);
        });

        // Determine effective monthly rent
        let currentMonthlyRent = standardMonthlyRent;
        if (priceAdjustment && new Date(priceAdjustment.startDate) <= effectiveCoverageEnd) {
             currentMonthlyRent = (priceAdjustment.newDailyRent * 365) / 12;
        }

        // Pro-rate if last cycle is cut short
        const fullCycleDays = getDaysDiff(coverageStart, coverageEnd);
        const actualDays = getDaysDiff(coverageStart, effectiveCoverageEnd);
        
        let grossAmount = 0;
        if (actualDays >= fullCycleDays - 5) {
             grossAmount = currentMonthlyRent * durationMonths;
        } else {
             grossAmount = (currentMonthlyRent * 12 / 365) * actualDays;
        }

        // Deduct Rent Free
        const deduction = (currentMonthlyRent / 30) * freeDays;
        const netAmount = Math.max(0, grossAmount - deduction);

        if (currentBillDate.getFullYear() === year) {
            const monthIdx = currentBillDate.getMonth();
            if (monthIdx >= 0 && monthIdx <= 11) {
                monthlyData[monthIdx].amount += netAmount;
            }
        }

        coverageStart = new Date(effectiveCoverageEnd);
        coverageStart.setDate(coverageStart.getDate() + 1);
        
        // Next bill date logic
        currentBillDate = new Date(coverageStart);
        currentBillDate.setMonth(currentBillDate.getMonth() - 1);
        
        isFirstCycle = false;
    }

    return monthlyData;
};

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
            start.toISOString().split('T')[0], // First payment date default
            3, // Quarterly default
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

  const [activeTab, setActiveTab] = useState<'Vacancy' | 'Renewal' | 'Risk'>('Vacancy');
  const [viewMode, setViewMode] = useState<'Settings' | 'Monthly' | 'Execution'>('Settings');
  const [detailYear, setDetailYear] = useState<number>(currentYear);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
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
          
          if (existingAssumption?.priceAdjustment) {
              priceAdjustment = {
                  startDate: existingAssumption.priceAdjustment.startDate,
                  endDate: existingAssumption.priceAdjustment.endDate,
                  newDailyRent: existingAssumption.priceAdjustment.newUnitPrice * t.totalArea
              };
          }

          const existingBills = calculateBillEvents(
              year, t.leaseStart, effectiveLeaseEnd, t.firstPaymentDate || t.leaseStart, 
              t.paymentCycleMonths || (t.paymentCycle === 'Monthly' ? 1 : 3), // USE MONTHS
              t.firstPaymentMonths || 3, 
              baseDailyRent, t.rentFreePeriods || [],
              priceAdjustment 
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
                     3, 3, newDailyRent, newRentFree
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
             monthlyValues = calculateBillEvents(year, assumption.projectedSignDate, projEnd.toISOString().split('T')[0], assumption.projectedSignDate, 3, 3, dailyRent, rentFree);
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

  // Handle Gemini Analysis
  const runAnalysis = async (type: 'Occupancy' | 'Revenue' | 'Execution') => {
      if (type === 'Execution') setIsAnalyzingExecution(true);
      if (type === 'Occupancy') setIsAnalyzingOccupancy(true);
      if (type === 'Revenue') setIsAnalyzingRevenue(true);

      const summary = type === 'Execution' ? {
          year: detailYear,
          rows: monthlyRows.map(r => ({
              tenant: r.name,
              budget: r.monthlyValues.reduce((a:number,b:any)=>a+b.amount,0),
              actual: actualsMap[r.id] ? actualsMap[r.id].reduce((a,b)=>a+b,0) : 0
          })).slice(0, 15) // Top 15 for brevity
      } : {
          totalRevenue: monthlyRows.reduce((acc, row) => acc + row.monthlyValues.reduce((s:number, v:any) => s + v.amount, 0), 0),
          breakdown: monthlyRows.map(r => ({ name: r.name, category: r.category, amount: r.monthlyValues.reduce((s:number, v:any) => s + v.amount, 0) })).slice(0, 10)
      };

      const result = await analyzeBudget(summary, type);
      
      const updatedAnalysis = { ...budgetAnalysis };
      if (type === 'Occupancy') updatedAnalysis.occupancy = result;
      if (type === 'Revenue') updatedAnalysis.revenue = result;
      if (type === 'Execution') updatedAnalysis.execution = result;
      
      onUpdateAnalysis(updatedAnalysis);
      
      if (type === 'Execution') setIsAnalyzingExecution(false);
      if (type === 'Occupancy') setIsAnalyzingOccupancy(false);
      if (type === 'Revenue') setIsAnalyzingRevenue(false);
  };

  const openAdjustmentModal = (row: any, monthIdx: number) => {
      setAdjData({ tenantId: row.id, tenantName: row.name, originalMonth: monthIdx, amount: row.monthlyValues[monthIdx].amount });
      setAdjForm({ targetYear: detailYear, targetMonth: (monthIdx + 1) % 12, reason: 'Deferred Payment / Adjustment' });
      setShowAdjModal(true);
  };

  const saveAdjustment = () => {
      if (!adjData) return;
      const newAdj: BudgetAdjustment = {
          id: `adj_${Date.now()}`,
          tenantId: adjData.tenantId,
          tenantName: adjData.tenantName,
          originalYear: detailYear,
          originalMonth: adjData.originalMonth,
          adjustedYear: adjForm.targetYear,
          adjustedMonth: adjForm.targetMonth,
          amount: adjData.amount,
          reason: adjForm.reason
      };
      handleUpdateAdjustments([...budgetAdjustments, newAdj]);
      setShowAdjModal(false);
  };

  const renderDetailTable = () => {
    const months = Array.from({length: 12}, (_, i) => `${i + 1}月`);
    
    // Calculate totals for footer
    const totals = Array(12).fill(0);
    const actualsTotals = Array(12).fill(0);
    
    monthlyRows.forEach(row => {
        row.monthlyValues.forEach((v: any, i: number) => totals[i] += v.amount);
        if (viewMode === 'Execution' && actualsMap[row.id]) {
            actualsMap[row.id].forEach((val, i) => actualsTotals[i] += val);
        }
    });

    const grandTotalBudget = totals.reduce((a, b) => a + b, 0);
    const grandTotalActual = actualsTotals.reduce((a, b) => a + b, 0);

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full animate-in fade-in zoom-in-50 duration-300">
             {/* Toolbar */}
             <div className="p-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4 bg-slate-50">
                 <div className="flex items-center gap-4">
                     <h3 className="font-bold text-slate-800 flex items-center gap-2">
                         {viewMode === 'Execution' ? <Activity size={18}/> : <Table size={18}/>}
                         {viewMode === 'Execution' ? '预算执行跟踪 (Budget vs Actual)' : '月度预算明细 (Budget Detail)'}
                     </h3>
                     <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 shadow-sm">
                        <button onClick={() => setDetailYear(detailYear - 1)} className="p-1 hover:bg-slate-100 rounded text-slate-600"><ChevronDown className="rotate-90" size={16}/></button>
                        <span className="px-3 text-sm font-bold text-slate-700">{detailYear}年</span>
                        <button onClick={() => setDetailYear(detailYear + 1)} className="p-1 hover:bg-slate-100 rounded text-slate-600"><ChevronDown className="-rotate-90" size={16}/></button>
                     </div>
                 </div>
                 <div className="flex items-center gap-2">
                     <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg" title={isFullScreen ? "退出全屏" : "全屏模式"}>
                         {isFullScreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}
                     </button>
                 </div>
             </div>
             
             {viewMode === 'Execution' && (
                 <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
                      <div className="flex gap-8">
                          <div>
                              <div className="text-xs text-emerald-600 uppercase font-bold">全年预算收入</div>
                              <div className="text-lg font-bold text-emerald-800">¥{(grandTotalBudget/10000).toFixed(1)}万</div>
                          </div>
                          <div>
                              <div className="text-xs text-blue-600 uppercase font-bold">全年实际回款</div>
                              <div className="text-lg font-bold text-blue-800">¥{(grandTotalActual/10000).toFixed(1)}万</div>
                          </div>
                          <div>
                              <div className="text-xs text-slate-500 uppercase font-bold">达成率</div>
                              <div className={`text-lg font-bold ${grandTotalActual >= grandTotalBudget ? 'text-green-600' : 'text-amber-600'}`}>
                                  {grandTotalBudget > 0 ? ((grandTotalActual / grandTotalBudget) * 100).toFixed(1) : '0.0'}%
                              </div>
                          </div>
                      </div>
                      <button 
                        onClick={() => runAnalysis('Execution')}
                        disabled={isAnalyzingExecution}
                        className="flex items-center gap-1 bg-white border border-emerald-200 text-emerald-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-100 disabled:opacity-50"
                      >
                         {isAnalyzingExecution ? <Sparkles size={14} className="animate-spin"/> : <Sparkles size={14}/>} AI 差异分析
                      </button>
                 </div>
             )}
             
             {/* Table Content */}
             <div className="flex-1 overflow-auto">
                 <table className="w-full text-xs text-left border-collapse">
                     <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 z-20 shadow-sm">
                         <tr>
                             <th className="p-3 border-r border-slate-200 min-w-[120px] sticky left-0 bg-slate-100 z-30">客户/单元</th>
                             <th className="p-3 border-r border-slate-200 min-w-[80px]">分类</th>
                             <th className="p-3 border-r border-slate-200 min-w-[80px]">面积(㎡)</th>
                             <th className="p-3 border-r border-slate-200 min-w-[80px]">单价</th>
                             {months.map(m => (
                                 <th key={m} className="p-3 text-right min-w-[90px] border-r border-slate-200">{m}</th>
                             ))}
                             <th className="p-3 text-right min-w-[100px] bg-slate-200">合计</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                         {monthlyRows.map(row => {
                             const rowTotal = row.monthlyValues.reduce((a:number, b:any) => a + b.amount, 0);
                             const actualRow = actualsMap[row.id];
                             const actualTotal = actualRow ? actualRow.reduce((a,b)=>a+b,0) : 0;

                             return (
                                 <React.Fragment key={row.id}>
                                     <tr className="hover:bg-slate-50 group">
                                         <td className="p-3 border-r border-slate-200 font-medium text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-b border-slate-100">
                                             <div className="truncate w-32" title={row.name}>{row.name}</div>
                                             <div className="text-[10px] text-slate-400 truncate w-32" title={row.location}>{row.location}</div>
                                         </td>
                                         <td className="p-3 border-r border-slate-200 border-b border-slate-100 text-slate-500">{row.category.split(' ')[0]}</td>
                                         <td className="p-3 border-r border-slate-200 border-b border-slate-100 text-slate-600">{row.area}</td>
                                         <td className="p-3 border-r border-slate-200 border-b border-slate-100 text-slate-600">¥{row.unitPrice}</td>
                                         {row.monthlyValues.map((v: any, i: number) => {
                                             const actual = actualRow ? actualRow[i] : 0;
                                             const isDiff = viewMode === 'Execution' && Math.abs(actual - v.amount) > 100;
                                             
                                             return (
                                                 <td key={i} className={`p-2 text-right border-r border-slate-200 border-b border-slate-100 relative ${v.amount > 0 ? 'bg-blue-50/30' : ''}`}>
                                                     <div className="font-medium text-slate-700">
                                                        {v.amount > 0 ? `¥${Math.round(v.amount).toLocaleString()}` : '-'}
                                                     </div>
                                                     {viewMode === 'Execution' && (
                                                         <div className={`text-[10px] mt-0.5 ${actual >= v.amount ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                             act: {actual > 0 ? `¥${Math.round(actual).toLocaleString()}` : '-'}
                                                         </div>
                                                     )}
                                                     {/* Interactive Adjustment Trigger */}
                                                     {v.amount > 0 && viewMode !== 'Execution' && (
                                                         <button 
                                                             onClick={() => openAdjustmentModal(row, i)}
                                                             className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 bg-white border rounded text-slate-400 hover:text-blue-600"
                                                             title="调整/缓缴"
                                                         >
                                                             <ArrowRight size={10} />
                                                         </button>
                                                     )}
                                                 </td>
                                             );
                                         })}
                                         <td className="p-3 text-right font-bold bg-slate-50 border-b border-slate-200 text-slate-800">
                                             <div>¥{Math.round(rowTotal).toLocaleString()}</div>
                                             {viewMode === 'Execution' && (
                                                 <div className={`text-[10px] mt-0.5 ${actualTotal >= rowTotal ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                     {actualTotal > 0 ? `¥${Math.round(actualTotal).toLocaleString()}` : '-'}
                                                 </div>
                                             )}
                                         </td>
                                     </tr>
                                 </React.Fragment>
                             );
                         })}
                     </tbody>
                     <tfoot className="bg-slate-100 font-bold text-slate-700 sticky bottom-0 z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                         <tr>
                             <td colSpan={4} className="p-3 text-right border-r border-slate-200 sticky left-0 bg-slate-100 z-30">
                                 {viewMode === 'Execution' ? '预算总计 / 实际总计' : '月度预算合计'}
                             </td>
                             {totals.map((t, i) => (
                                 <td key={i} className="p-3 text-right border-r border-slate-200">
                                     <div>¥{Math.round(t).toLocaleString()}</div>
                                     {viewMode === 'Execution' && (
                                         <div className="text-[10px] text-slate-500">
                                             ¥{Math.round(actualsTotals[i]).toLocaleString()}
                                         </div>
                                     )}
                                 </td>
                             ))}
                             <td className="p-3 text-right bg-slate-200">
                                 <div>¥{Math.round(grandTotalBudget).toLocaleString()}</div>
                                 {viewMode === 'Execution' && (
                                     <div className="text-[10px] text-slate-600">
                                         ¥{Math.round(grandTotalActual).toLocaleString()}
                                     </div>
                                 )}
                             </td>
                         </tr>
                     </tfoot>
                 </table>
             </div>
        </div>
    );
  };

  const renderSettingsView = () => (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full animate-in fade-in zoom-in-50 duration-300">
         <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
             <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Calculator size={20} className="text-blue-600" />
                    预算假设参数设定 (Assumptions)
                </h3>
                <p className="text-sm text-slate-500 mt-1">针对空置、到期及风险客户设定处置策略</p>
             </div>
             <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                 {(['Vacancy', 'Renewal', 'Risk'] as const).map(tab => (
                     <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
                     >
                        {tab === 'Vacancy' ? '空置去化' : tab === 'Renewal' ? '到期续约' : '风险预警'}
                     </button>
                 ))}
             </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
             <BudgetImpactSummary 
                budgetAssumptions={budgetAssumptions} 
                detailYear={detailYear} 
                tenants={tenants} 
                vacantUnits={vacantUnits}
             />

             {activeTab === 'Vacancy' && (
                 <div className="space-y-4">
                     {vacantUnits.map(unit => {
                         const assumption = getAssumption(unit.unitId, 'Vacancy', `${unit.buildingName} ${unit.unitName}`);
                         return (
                             <div key={unit.unitId} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center">
                                 <div className="w-48">
                                     <div className="font-bold text-slate-700">{unit.buildingName} {unit.unitName}</div>
                                     <div className="text-xs text-slate-500">{unit.area} ㎡ | 空置</div>
                                 </div>
                                 <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                                     <label className="text-xs text-slate-500">预计签约</label>
                                     <input type="date" className="border rounded px-2 py-1 text-sm w-32" value={assumption.projectedSignDate} onChange={e => updateAssumption({...assumption, projectedSignDate: e.target.value})} />
                                 </div>
                                 <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                                     <label className="text-xs text-slate-500">预估单价</label>
                                     <input type="number" step="0.1" className="border rounded px-2 py-1 text-sm w-20" value={assumption.projectedUnitPrice} onChange={e => updateAssumption({...assumption, projectedUnitPrice: Number(e.target.value)})} />
                                 </div>
                                 <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                                     <label className="text-xs text-slate-500">免租(月)</label>
                                     <input type="number" className="border rounded px-2 py-1 text-sm w-16" value={assumption.projectedRentFreeMonths} onChange={e => updateAssumption({...assumption, projectedRentFreeMonths: Number(e.target.value)})} />
                                 </div>
                             </div>
                         );
                     })}
                     {vacantUnits.length === 0 && <div className="text-center p-8 text-slate-400">暂无空置单元</div>}
                 </div>
             )}

             {activeTab === 'Renewal' && (
                 <div className="space-y-4">
                     {expiringTenants.map(tenant => {
                         const assumption = getAssumption(tenant.id, 'Renewal', tenant.name);
                         const isRenew = assumption.strategy === 'Renewal';
                         return (
                             <div key={tenant.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center relative overflow-hidden">
                                 <div className={`absolute left-0 top-0 bottom-0 w-1 ${isRenew ? 'bg-blue-500' : 'bg-orange-500'}`}></div>
                                 <div className="w-48">
                                     <div className="font-bold text-slate-700 truncate" title={tenant.name}>{tenant.name}</div>
                                     <div className="text-xs text-slate-500">到期: {tenant.leaseEnd} | {tenant.totalArea}㎡</div>
                                 </div>
                                 <div className="flex flex-col gap-1">
                                     <label className="text-xs text-slate-500">策略</label>
                                     <select className="border rounded px-2 py-1 text-sm bg-white" value={assumption.strategy} onChange={e => updateAssumption({...assumption, strategy: e.target.value as any})}>
                                         <option value="Renewal">续签 (Renewal)</option>
                                         <option value="ReLease">到期退租招商 (Re-lease)</option>
                                     </select>
                                 </div>
                                 {isRenew ? (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-500">续签单价</label>
                                            <input type="number" step="0.1" className="border rounded px-2 py-1 text-sm w-20" value={assumption.projectedUnitPrice} onChange={e => updateAssumption({...assumption, projectedUnitPrice: Number(e.target.value)})} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-500">免租(月)</label>
                                            <input type="number" className="border rounded px-2 py-1 text-sm w-16" value={assumption.projectedRentFreeMonths} onChange={e => updateAssumption({...assumption, projectedRentFreeMonths: Number(e.target.value)})} />
                                        </div>
                                    </>
                                 ) : (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-500">空置期(月)</label>
                                            <input type="number" className="border rounded px-2 py-1 text-sm w-16" value={assumption.vacancyGapMonths} onChange={e => updateAssumption({...assumption, vacancyGapMonths: Number(e.target.value)})} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-500">新签单价</label>
                                            <input type="number" step="0.1" className="border rounded px-2 py-1 text-sm w-20" value={assumption.projectedUnitPrice} onChange={e => updateAssumption({...assumption, projectedUnitPrice: Number(e.target.value)})} />
                                        </div>
                                    </>
                                 )}
                             </div>
                         );
                     })}
                     {expiringTenants.length === 0 && <div className="text-center p-8 text-slate-400">明年暂无到期客户</div>}
                 </div>
             )}

             {activeTab === 'Risk' && (
                 <div className="space-y-4">
                     {riskTenants.map(tenant => {
                         const assumption = getAssumption(tenant.id, 'RiskTermination', tenant.name);
                         return (
                             <div key={tenant.id} className="bg-white p-4 rounded-lg border border-red-200 shadow-sm flex flex-wrap gap-4 items-center relative">
                                 <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                                 <div className="w-48">
                                     <div className="font-bold text-slate-700 truncate" title={tenant.name}>{tenant.name}</div>
                                     <div className="text-xs text-red-500 font-medium">⚠️ 高风险预警</div>
                                 </div>
                                 <div className="flex flex-col gap-1">
                                     <label className="text-xs text-slate-500">预计退租日期</label>
                                     <input type="date" className="border rounded px-2 py-1 text-sm" value={assumption.projectedTerminationDate || ''} onChange={e => updateAssumption({...assumption, projectedTerminationDate: e.target.value})} />
                                 </div>
                                 <div className="flex flex-col gap-1">
                                     <label className="text-xs text-slate-500">空置期(月)</label>
                                     <input type="number" className="border rounded px-2 py-1 text-sm w-16" value={assumption.vacancyGapMonths} onChange={e => updateAssumption({...assumption, vacancyGapMonths: Number(e.target.value)})} />
                                 </div>
                                 <div className="flex flex-col gap-1">
                                     <label className="text-xs text-slate-500">新签单价</label>
                                     <input type="number" step="0.1" className="border rounded px-2 py-1 text-sm w-20" value={assumption.projectedUnitPrice} onChange={e => updateAssumption({...assumption, projectedUnitPrice: Number(e.target.value)})} />
                                 </div>
                             </div>
                         );
                     })}
                     {riskTenants.length === 0 && <div className="text-center p-8 text-slate-400">暂无高风险客户</div>}
                 </div>
             )}
         </div>
      </div>
  );

  return (
    <div className={`space-y-6 ${isFullScreen ? 'fixed inset-0 z-50 bg-white p-6 flex flex-col h-screen overflow-auto' : ''}`}>
       {/* Scenario Toolbar */}
       <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-200 p-3 rounded-lg flex-shrink-0">
           <div className="flex items-center gap-3 flex-1 min-w-[200px]">
               <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                   <LayoutList size={16} /> 预算方案:
               </div>
               
               <div className="flex items-center gap-2">
                   <select 
                       value={activeScenarioId} 
                       onChange={e => setActiveScenarioId(e.target.value)} 
                       className="bg-white border border-slate-300 rounded px-3 py-1.5 text-sm min-w-[200px] outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer shadow-sm"
                   >
                       <option value="current">🟡 当前实时生效方案 (Live)</option>
                       {scenarios.map(s => (
                           <option key={s.id} value={s.id}>
                               {s.name} {s.isActive ? '(✅生效中)' : ''}
                           </option>
                       ))}
                   </select>
                   
                   {activeScenarioId !== 'current' && (
                       <div className="flex items-center gap-1">
                           {isRenaming ? (
                               <div className="flex items-center bg-white border border-blue-300 rounded overflow-hidden">
                                   <input 
                                     type="text" 
                                     value={tempScenarioName}
                                     onChange={e => setTempScenarioName(e.target.value)}
                                     className="px-2 py-1 text-xs outline-none w-32"
                                     autoFocus
                                   />
                                   <button onClick={saveRenaming} className="p-1 text-green-600 hover:bg-green-50"><Check size={12}/></button>
                                   <button onClick={() => setIsRenaming(false)} className="p-1 text-red-500 hover:bg-red-50"><X size={12}/></button>
                               </div>
                           ) : (
                               <button onClick={startRenaming} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-200" title="重命名">
                                   <Edit3 size={14} />
                               </button>
                           )}
                           <button onClick={() => handleDeleteScenario(activeScenarioId)} className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-slate-200" title="删除方案">
                               <Trash2 size={14} />
                           </button>
                       </div>
                   )}
                   
                   <button onClick={() => setShowScenarioModal(true)} className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="新建方案">
                       <Plus size={16} />
                   </button>
               </div>
           </div>

           <div className="flex items-center gap-3">
               {/* View Toggles */}
               <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                   {(['Settings', 'Monthly', 'Execution'] as const).map(mode => (
                       <button
                           key={mode}
                           onClick={() => setViewMode(mode)}
                           className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-1 ${viewMode === mode ? 'bg-slate-800 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}
                       >
                           {mode === 'Settings' && <Calculator size={14} />}
                           {mode === 'Monthly' && <Table size={14} />}
                           {mode === 'Execution' && <Activity size={14} />}
                           {mode === 'Settings' ? '假设设定' : mode === 'Monthly' ? '预算表' : '执行跟踪'}
                       </button>
                   ))}
               </div>

               <div className="h-6 w-px bg-slate-300 mx-1"></div>

               {/* Action Buttons */}
               <button 
                  onClick={confirmCloudSave} // Using confirm directly for now as simple trigger, proper modal below
                  disabled={activeScenarioId === 'current' && !scenarios.find(s=>s.isActive)} // Always enable save
                  onClick={() => setShowCloudModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 shadow-sm"
               >
                  <CloudUpload size={14} /> 云端保存
               </button>

               {activeScenarioId !== 'current' && !scenarios.find(s => s.id === activeScenarioId)?.isActive && (
                   <button 
                      onClick={handleActivateCurrentScenario}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-sm animate-pulse"
                   >
                      <Play size={14} /> 应用此方案
                   </button>
               )}
           </div>
       </div>

       {/* Main Content Area */}
       <div className="flex-1 min-h-0">
           {viewMode === 'Settings' && renderSettingsView()}
           {(viewMode === 'Monthly' || viewMode === 'Execution') && renderDetailTable()}
       </div>

       {/* Modals */}
       {showAdjModal && (
           <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-50 duration-200">
                   <h3 className="text-lg font-bold text-slate-800 mb-4">调整/缓缴预算</h3>
                   <div className="space-y-4">
                       <div className="bg-slate-50 p-3 rounded text-sm text-slate-600">
                           <p><strong>客户:</strong> {adjData?.tenantName}</p>
                           <p><strong>原计划月份:</strong> {detailYear}年{adjData ? adjData.originalMonth + 1 : ''}月</p>
                           <p><strong>金额:</strong> ¥{adjData?.amount.toLocaleString()}</p>
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">调整至 (年份)</label>
                           <input type="number" className="w-full border rounded p-2" value={adjForm.targetYear} onChange={e => setAdjForm({...adjForm, targetYear: Number(e.target.value)})} />
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">调整至 (月份)</label>
                           <select className="w-full border rounded p-2" value={adjForm.targetMonth} onChange={e => setAdjForm({...adjForm, targetMonth: Number(e.target.value)})}>
                               {Array.from({length: 12}, (_, i) => <option key={i} value={i+1}>{i+1}月</option>)}
                           </select>
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">调整原因</label>
                           <input type="text" className="w-full border rounded p-2" value={adjForm.reason} onChange={e => setAdjForm({...adjForm, reason: e.target.value})} placeholder="例如: 客户申请缓缴" />
                       </div>
                       <div className="flex justify-end gap-2 pt-2">
                           <button onClick={() => setShowAdjModal(false)} className="px-4 py-2 border rounded text-slate-600 hover:bg-slate-50">取消</button>
                           <button onClick={saveAdjustment} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">确认调整</button>
                       </div>
                   </div>
               </div>
           </div>
       )}

       {showScenarioModal && (
           <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-50 duration-200">
                   <h3 className="text-lg font-bold text-slate-800 mb-4">新建预算方案</h3>
                   <div className="space-y-4">
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">方案名称</label>
                           <input type="text" className="w-full border rounded p-2" value={newScenarioName} onChange={e => setNewScenarioName(e.target.value)} placeholder="例如: 2024激进版预算" autoFocus />
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">描述 (可选)</label>
                           <textarea className="w-full border rounded p-2 text-sm" rows={3} value={newScenarioDesc} onChange={e => setNewScenarioDesc(e.target.value)} placeholder="备注此方案的关键假设..." />
                       </div>
                       <div className="flex items-center gap-2">
                           <input type="checkbox" id="snapshot" checked={useSnapshot} onChange={e => setUseSnapshot(e.target.checked)} className="rounded text-blue-600" />
                           <label htmlFor="snapshot" className="text-sm text-slate-600">保存当前租户与楼宇数据快照 (推荐)</label>
                       </div>
                       <p className="text-xs text-slate-400">勾选快照将锁定当前的租赁状态，使方案不受后续实际运营数据变化的影响，适合做静态测算。</p>
                       <div className="flex justify-end gap-2 pt-2">
                           <button onClick={() => setShowScenarioModal(false)} className="px-4 py-2 border rounded text-slate-600 hover:bg-slate-50">取消</button>
                           <button onClick={handleCreateScenario} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">创建</button>
                       </div>
                   </div>
               </div>
           </div>
       )}

       {showCloudModal && (
           <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-50 duration-200">
                   <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><CloudUpload size={20}/> 备份至云端</h3>
                   <div className="space-y-4">
                       <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">
                           即将保存: <strong>{activeScenarioId === 'current' ? '当前生效方案 (Live)' : scenarios.find(s=>s.id===activeScenarioId)?.name}</strong>
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">操作人员姓名 <span className="text-red-500">*</span></label>
                           <input type="text" className="w-full border rounded p-2" value={operatorName} onChange={e => setOperatorName(e.target.value)} placeholder="请输入您的姓名" />
                       </div>
                       <div className="flex justify-end gap-2 pt-2">
                           <button onClick={() => setShowCloudModal(false)} className="px-4 py-2 border rounded text-slate-600 hover:bg-slate-50">取消</button>
                           <button onClick={confirmCloudSave} disabled={!operatorName.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">确认上传</button>
                       </div>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};
