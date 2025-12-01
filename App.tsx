










import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Building2, Users, PieChart, Settings, Bell, Search, Menu, Sparkles, UserCircle, Download, Upload, X, Check, Filter, Save, RotateCcw, Trash2, Calculator, Database, Lightbulb, Cloud, CloudCog, RefreshCw, AlertCircle, ExternalLink, Link, Info, Loader2, CheckCircle2, XCircle, History, FileClock, ChevronRight, ChevronDown, CloudUpload, LogOut, User, Calendar, ChevronLeft } from 'lucide-react';
import { generateInitialData } from './services/mockData';
import { DashboardData, Building, Tenant, PaymentRecord, UnitStatus, MonthlyTrend, PaymentCycle, RentFreePeriod, BillingDetail, ParkingStatDetail, BudgetAssumption, BudgetAdjustment, BudgetAnalysisData, CloudConfig, CloudBackupMetadata, BudgetScenario } from './types';
import { StatsCards } from './components/StatsCards';
import { OccupancyTrendChart, RevenueChart, UnitPriceTrendChart } from './components/Charts';
import { RecentActivityTable, ExpiringSoonTable, BudgetExecutionSummaryTable, AnnualMetricComparisonTable, AnnualComparisonData } from './components/Tables';
import { BillingTable } from './components/BillingTable';
import { ParkingOverview } from './components/ParkingOverview';
import { AssistantPanel } from './components/AssistantPanel';
import { BuildingManager } from './components/BuildingManager';
import { ContractManager } from './components/ContractManager';
import { FinanceManager } from './components/FinanceManager';
import { BudgetManager } from './components/BudgetManager';
import { TenantInsights } from './components/TenantInsights';
import { DashboardAlerts } from './components/DashboardAlerts';
import { checkConnection, saveToCloud, getCloudHistory, fetchCloudBackup } from './services/cloudService';

const STORAGE_KEY = 'kingdee_park_data_v1';
const CLOUD_CONFIG_KEY = 'kingdee_park_cloud_config';

// Embedded Supabase Credentials
const SUPABASE_URL = 'https://drbugbbsvnnheuasgvwg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyYnVnYmJzdm5uaGV1YXNndndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MjI1ODIsImV4cCI6MjA3OTk5ODU4Mn0.fZF27k7dtbzoMK5ZKh_UARPLpy5OxmF9fvVkJMTOIO4';

const getDaysDiff = (start: Date, end: Date): number => {
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

const getOverlapDays = (start1: Date, end1: Date, start2: Date, end2: Date): number => {
    const overlapStart = start1 > start2 ? start1 : start2;
    const overlapEnd = end1 < end2 ? end1 : end2;

    if (overlapStart <= overlapEnd) {
        return getDaysDiff(overlapStart, overlapEnd);
    }
    return 0;
};

const generateBudgetedBills = (
    tenant: Tenant,
    assumptions: BudgetAssumption[],
    adjustments: BudgetAdjustment[],
    startDateConstraint: Date,
    endDateConstraint: Date
): {date: Date; amount: number; originalDate?: Date}[] => {
    const bills: {date: Date; amount: number; originalDate?: Date}[] = [];

    const leaseStart = new Date(tenant.leaseStart);
    const leaseEnd = tenant.leaseEnd ? new Date(tenant.leaseEnd) : new Date('2099-12-31');
    const terminationDate = tenant.terminationDate ? new Date(tenant.terminationDate) : null;
    const effectiveLeaseEnd = terminationDate && terminationDate < leaseEnd ? terminationDate : leaseEnd;

    // Use monthlyRent as base unit
    let monthlyRent = tenant.monthlyRent || 0;
    if (monthlyRent === 0 && tenant.unitPrice && tenant.totalArea) {
        monthlyRent = (tenant.unitPrice * tenant.totalArea * 365) / 12;
    }

    if (monthlyRent === 0) return [];

    const existingAssumption = assumptions.find(a => a.targetId === tenant.id && a.targetType === 'Existing');

    // Use paymentCycleMonths, default to 3 if missing
    const regularCycleMonths = tenant.paymentCycleMonths || (tenant.paymentCycle === 'Monthly' ? 1 : 3);
    const firstCycleMonths = tenant.firstPaymentMonths && tenant.firstPaymentMonths > 0 ? tenant.firstPaymentMonths : regularCycleMonths;

    // Logic: Billing Date is 1 month prior to coverage start
    let currentBillDate = tenant.firstPaymentDate ? new Date(tenant.firstPaymentDate) : new Date(leaseStart);
    if (!tenant.firstPaymentDate) {
        // Default: 1 month before lease start
        currentBillDate = new Date(leaseStart);
        currentBillDate.setMonth(currentBillDate.getMonth() - 1);
    }

    let coverageStart = new Date(leaseStart);
    let isFirstCycle = true;
    let safetyCounter = 0;

    const loopLimitDate = new Date(endDateConstraint);
    loopLimitDate.setFullYear(loopLimitDate.getFullYear() + 2); 

    while (coverageStart <= effectiveLeaseEnd && safetyCounter < 200) {
        safetyCounter++;

        const durationMonths = isFirstCycle ? firstCycleMonths : regularCycleMonths;
        const coverageEnd = new Date(coverageStart);
        coverageEnd.setMonth(coverageEnd.getMonth() + durationMonths);
        coverageEnd.setDate(coverageEnd.getDate() - 1);
        
        const effectiveCoverageEnd = coverageEnd > effectiveLeaseEnd ? effectiveLeaseEnd : coverageEnd;

        // Calculate Rent Free Deduction
        // Formula: (MonthlyRent / 30) * FreeDays
        let freeDays = 0;
        if (tenant.rentFreePeriods) {
            tenant.rentFreePeriods.forEach(rf => {
                const rfStart = new Date(rf.start);
                const rfEnd = new Date(rf.end);
                freeDays += getOverlapDays(coverageStart, effectiveCoverageEnd, rfStart, rfEnd);
            });
        }
        
        // Handle Price Adjustment mid-cycle
        let currentMonthlyRent = monthlyRent;
        if (existingAssumption?.priceAdjustment) {
            const pa = existingAssumption.priceAdjustment;
            if (new Date(pa.startDate) <= effectiveCoverageEnd) {
                // If adjustment applies, calculate new monthly rent
                currentMonthlyRent = (pa.newUnitPrice * tenant.totalArea * 365) / 12;
            }
        }

        // Calculate Gross Amount
        // Full cycle: MonthlyRent * Months
        // Partial: Pro-rate by day
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
        let finalAmount = Math.max(0, grossAmount - deduction);

        let finalBillDate = new Date(currentBillDate);

        // Adjustments (Shift & Manual)
        if (existingAssumption?.paymentShift?.isActive) {
             const ps = existingAssumption.paymentShift;
             const billYear = finalBillDate.getFullYear();
             const billMonth = finalBillDate.getMonth();
             
             if (billYear === ps.fromYear && billMonth === ps.fromMonth) {
                 finalAmount -= ps.amount;
                 if (finalAmount < 0) finalAmount = 0;

                 const shiftedDate = new Date(finalBillDate);
                 shiftedDate.setFullYear(ps.toYear);
                 shiftedDate.setMonth(ps.toMonth);
                 shiftedDate.setDate(1);
                 
                 bills.push({
                     date: shiftedDate,
                     amount: Math.round(ps.amount),
                     originalDate: new Date(currentBillDate)
                 });
             }
        }

        const adjOut = adjustments.find(a => 
            a.tenantId === tenant.id && 
            a.originalYear === finalBillDate.getFullYear() && 
            a.originalMonth === finalBillDate.getMonth()
        );

        if (adjOut) {
            finalAmount -= adjOut.amount;
            if (finalAmount < 0) finalAmount = 0;
            
            const targetDate = new Date(adjOut.adjustedYear, adjOut.adjustedMonth, 1);
            bills.push({
                date: targetDate,
                amount: Math.round(adjOut.amount),
                originalDate: new Date(currentBillDate)
            });
        }
        
        if (finalAmount > 0) {
            bills.push({
                date: finalBillDate,
                amount: Math.round(finalAmount)
            });
        }

        coverageStart = new Date(effectiveCoverageEnd);
        coverageStart.setDate(coverageStart.getDate() + 1);
        
        // Next bill: 1 month prior to next coverage start
        currentBillDate = new Date(coverageStart);
        currentBillDate.setMonth(currentBillDate.getMonth() - 1);
        
        isFirstCycle = false;
        
        if (coverageStart > loopLimitDate) break;
    }

    return bills;
};

// ... (calculateBudgetedReceivableInPeriod, SidebarItemProps kept same) ...
const calculateBudgetedReceivableInPeriod = (
    tenants: Tenant[],
    periodStart: Date,
    periodEnd: Date,
    selfUseUnitIds: Set<string>,
    assumptions: BudgetAssumption[],
    adjustments: BudgetAdjustment[]
): number => {
    let total = 0;
    const genStart = new Date(periodStart);
    genStart.setFullYear(genStart.getFullYear() - 1);
    
    tenants.forEach(t => {
        const isSelfUse = t.unitIds.some(uid => selfUseUnitIds.has(uid));
        if (isSelfUse) return;

        const bills = generateBudgetedBills(t, assumptions, adjustments, genStart, periodEnd);
        
        bills.forEach(b => {
            if (b.date >= periodStart && b.date <= periodEnd) {
                total += b.amount;
            }
        });
    });

    return Math.round(total);
};

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  isOpen: boolean;
  active: boolean;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, isOpen, active, onClick }) => (
  <button
    onClick={onClick}
    className={`
      relative w-full flex items-center gap-3 px-4 py-3.5 transition-all duration-300 group overflow-hidden
      ${active 
        ? 'bg-sky-50 text-sky-600 border-r-4 border-sky-600' 
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }
    `}
    title={!isOpen ? label : ''}
  >
    <div className={`
      relative z-10 transition-transform duration-300 flex-shrink-0
      ${active ? 'scale-110' : 'group-hover:scale-110'}
    `}>
      {icon}
    </div>
    
    <span className={`
      relative z-10 font-medium whitespace-nowrap transition-all duration-300 origin-left
      ${isOpen ? 'opacity-100 translate-x-0 w-auto' : 'opacity-0 -translate-x-4 w-0 overflow-hidden absolute'}
    `}>
      {label}
    </span>
  </button>
);

const App: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  
  // ... (State initialization) ...
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>({ 
      supabaseUrl: SUPABASE_URL, 
      supabaseKey: SUPABASE_KEY, 
      autoSync: true, 
      projectId: 'park_data_main' 
  });
  
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [cloudConnectionMsg, setCloudConnectionMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  const [cloudHistory, setCloudHistory] = useState<CloudBackupMetadata[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  const [restoringId, setRestoringId] = useState<string | null>(null);
  
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState('');
  const [operatorName, setOperatorName] = useState('');

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isAssistantOpen, setAssistantOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [targetModalType, setTargetModalType] = useState<'revenue' | 'occupancy'>('revenue');

  const [activeTab, setActiveTab] = useState<'dashboard' | 'buildings' | 'contracts' | 'finance' | 'budget' | 'insights' | 'settings'>('dashboard');
  const [lastSaved, setLastSaved] = useState<string>('');

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<'All' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('All');
  
  const [billingSelectedMonth, setBillingSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [targetForm, setTargetForm] = useState({ revenue: 0, occupancy: 0 });

  useEffect(() => {
    if (window.innerWidth >= 768) {
        setSidebarOpen(true);
    }
  }, []);

  // Initialize Data & Auto Connect Cloud
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load local config just for project ID if it exists, but use embedded creds
        const savedConfig = localStorage.getItem(CLOUD_CONFIG_KEY);
        let configToUse = cloudConfig;
        
        if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            // Overwrite embedded keys just in case, but respect saved projectId
            configToUse = { 
                ...parsed, 
                supabaseUrl: SUPABASE_URL, 
                supabaseKey: SUPABASE_KEY 
            };
            setCloudConfig(configToUse);
        }

        // Auto Connect
        checkConnection(configToUse).then(connected => {
             setIsCloudConnected(connected);
             if (connected) {
                 fetchCloudHistory(configToUse);
             }
        });

        const savedData = localStorage.getItem(STORAGE_KEY);
        let parsedData: DashboardData | null = null;
        
        if (savedData) {
            parsedData = JSON.parse(savedData);
        }

        if (parsedData) {
          const safeData = { ...generateInitialData(), ...parsedData };
          recalculateMetrics(safeData, currentYear, 'All');
          setData(safeData);
          setLastSaved(new Date().toLocaleTimeString());
        } else {
          const initialData = generateInitialData();
          recalculateMetrics(initialData, currentYear, 'All');
          setData(initialData);
        }
      } catch (e) {
        console.error("Failed to load local data", e);
        const initialData = generateInitialData();
        recalculateMetrics(initialData, currentYear, 'All');
        setData(initialData);
      }
    };

    loadData();
  }, []);

  // Auto-Save Effect
  useEffect(() => {
    if (data) {
      const timer = setTimeout(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            setLastSaved(new Date().toLocaleTimeString());
        } catch (e) {
            console.error("Save failed", e);
        }
      }, 2000); 

      return () => clearTimeout(timer);
    }
  }, [data]);

  // FIX: Trigger recalculation when billing month changes to update the billing table
  useEffect(() => {
      if (data) {
          recalculateMetrics(data);
      }
  }, [billingSelectedMonth]);

  // ... (handleCloudConfigSave, fetchCloudHistory, etc. kept same) ...
  const handleCloudConfigSave = async () => {
      // Just save project ID, ignore URL/Key inputs as they are hidden/embedded
      setIsTestingCloud(true);
      setCloudConnectionMsg(null);
      await new Promise(r => setTimeout(r, 600));
      localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(cloudConfig));
      const connected = await checkConnection(cloudConfig);
      setIsCloudConnected(connected);
      setIsTestingCloud(false);
      
      if(connected) {
          setCloudConnectionMsg({type: 'success', text: "连接成功！"});
          fetchCloudHistory(cloudConfig);
      } else {
          setCloudConnectionMsg({type: 'error', text: "连接失败，请检查网络。"});
      }
  };

  const fetchCloudHistory = async (config = cloudConfig) => {
      setIsLoadingHistory(true);
      const res = await getCloudHistory(config);
      setIsLoadingHistory(false);
      if (res.success && res.data) {
          setCloudHistory(res.data);
      }
  };

  const openSnapshotModal = () => {
      setSnapshotNote('');
      // Keep operatorName if entered before, or leave blank
      setIsSnapshotModalOpen(true);
  };

  const confirmCloudSave = async () => {
      if (!data) return;
      if (!operatorName.trim()) {
          alert("请填写操作人员姓名");
          return;
      }

      setIsSyncing(true);
      setIsSnapshotModalOpen(false);
      
      const timestamp = new Date().toLocaleString();
      const finalNote = `${operatorName} ${timestamp} ${snapshotNote ? `(${snapshotNote})` : ''}`;

      const res = await saveToCloud(data, cloudConfig, finalNote);
      setIsSyncing(false);
      
      if (res.success) {
          alert("✅ 云端备份成功！");
          fetchCloudHistory();
      } else {
          alert("保存失败: " + res.message);
      }
  };

  const handleSaveBudgetToCloud = async (scenarioName: string, operator: string) => {
      if (!data) return;
      setIsSyncing(true);
      const timestamp = new Date().toLocaleString();
      const finalNote = `[预算方案] ${operator} ${timestamp} - ${scenarioName}`;
      const res = await saveToCloud(data, cloudConfig, finalNote);
      setIsSyncing(false);
      if (res.success) {
          alert("✅ 预算方案已保存至云端！");
      } else {
          alert("保存失败: " + res.message);
      }
  };

  const handleQuickCloudSave = async () => {
      if (!isCloudConnected) {
          if (confirm("云端同步连接未建立。是否重试连接？")) {
              setActiveTab('settings');
              handleCloudConfigSave();
          }
          return;
      }
      openSnapshotModal();
  };

  const handleDownloadCloudBackup = async (backupId: string, note?: string) => {
      setRestoringId(backupId);
      await new Promise(resolve => setTimeout(resolve, 300));

      try {
        const res = await fetchCloudBackup(cloudConfig, backupId);
        
        if (res.success && res.data) {
            const dataStr = JSON.stringify(res.data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `cloud_backup_${note ? note.replace(/\s+/g, '_') : 'snapshot'}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            alert("下载失败: " + res.message);
        }
      } catch (e) {
          alert("下载过程中发生意外错误，请查看控制台日志。");
          console.error("Handle Download Error:", e);
      } finally {
          setRestoringId(null);
      }
  };

  // Direct Restore Function
  const handleRestoreCloudBackup = async (backupId: string) => {
      if (!window.confirm("⚠️ 警告：覆盖操作\n\n确定要将此历史备份恢复到当前系统吗？\n当前本地的所有数据将被此备份完全覆盖且无法撤销。\n\n恢复后页面将自动刷新。")) {
          return;
      }

      setRestoringId(backupId);
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
          const res = await fetchCloudBackup(cloudConfig, backupId);
          if (res.success && res.data) {
              const safeData = { ...generateInitialData(), ...res.data };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(safeData));
              alert("✅ 恢复成功！系统正在刷新...");
              window.location.reload();
          } else {
              alert("恢复失败: " + res.message);
          }
      } catch (e) {
          console.error("Restore failed", e);
          alert("恢复过程中发生未知错误");
      } finally {
          setRestoringId(null);
      }
  };

  const calculateTrends = (
      tenants: Tenant[], 
      payments: PaymentRecord[], 
      totalLeasableArea: number,
      selfUseUnitIds: Set<string>,
      year: number,
      quarter: 'All' | 'Q1' | 'Q2' | 'Q3' | 'Q4',
      assumptions: BudgetAssumption[],
      adjustments: BudgetAdjustment[]
  ): MonthlyTrend[] => {
      const trends: MonthlyTrend[] = [];
      let startMonth = 0; 
      let endMonth = 11; 

      if (quarter === 'Q1') { endMonth = 2; }
      else if (quarter === 'Q2') { startMonth = 3; endMonth = 5; }
      else if (quarter === 'Q3') { startMonth = 6; endMonth = 8; }
      else if (quarter === 'Q4') { startMonth = 9; endMonth = 11; }

      for (let month = startMonth; month <= endMonth; month++) {
          const startDate = new Date(year, month, 1);
          const endDate = new Date(year, month + 1, 0); 
          const monthLabel = `${month + 1}月`;
          const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

          let leasedAreaInMonth = 0;
          let totalRentInMonth = 0;
          let activeTenantAreaForPrice = 0;

          tenants.forEach(t => {
              const isSelfUse = t.unitIds.some(uid => selfUseUnitIds.has(uid));
              if (isSelfUse) return;

              const start = new Date(t.leaseStart);
              const end = new Date(t.leaseEnd);
              const terminated = t.terminationDate ? new Date(t.terminationDate) : null;
              const effectiveEnd = terminated && terminated < end ? terminated : end;

              if (start <= endDate && effectiveEnd >= startDate) {
                   leasedAreaInMonth += t.totalArea;
                   let price = t.unitPrice;
                   if (!price && t.totalArea > 0) {
                        price = (t.monthlyRent / t.totalArea) * 12 / 365;
                   }
                   price = price || 0;
                   totalRentInMonth += (price * t.totalArea);
                   activeTenantAreaForPrice += t.totalArea;
              }
          });

          const occupancyRate = totalLeasableArea > 0 ? Number(((leasedAreaInMonth / totalLeasableArea) * 100).toFixed(1)) : 0;
          const avgUnitPrice = activeTenantAreaForPrice > 0 ? Number((totalRentInMonth / activeTenantAreaForPrice).toFixed(2)) : 0;

          const revenueCollected = payments
            .filter(p => p.date.startsWith(monthPrefix) && (p.type === 'Rent' || p.type === 'DepositToRent' || p.type === 'ParkingFee'))
            .reduce((sum, p) => sum + p.amount, 0);

          const revenueTarget = calculateBudgetedReceivableInPeriod(tenants, startDate, endDate, selfUseUnitIds, assumptions, adjustments);

          trends.push({ month: monthLabel, occupancyRate, revenueTarget, revenueCollected, avgUnitPrice });
      }
      return trends;
  };

  const getBillingDetailsForPeriod = (year: number, month: number): BillingDetail[] => {
      if (!data) return [];
      const periodStart = new Date(year, month, 1);
      const periodEnd = new Date(year, month + 1, 0);
      const periodPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      const selfUseUnitIds = new Set<string>();
      data.buildings.forEach(b => b.units.forEach(u => u.isSelfUse && selfUseUnitIds.add(u.id)));
      
      const details: BillingDetail[] = [];
      const assumptions = data.budgetAssumptions || [];
      const adjustments = data.budgetAdjustments || [];

      data.tenants.forEach(t => {
        const isSelfUse = t.unitIds.some(uid => selfUseUnitIds.has(uid));
        // Also exclude Expired status from billing generation
        if (isSelfUse || t.status === 'Terminated' || t.status === 'Expired') return;

        const amountDue = calculateBudgetedReceivableInPeriod([t], periodStart, periodEnd, selfUseUnitIds, assumptions, adjustments);
        const amountPaid = data.payments.filter(p => p.tenantId === t.id && (p.type === 'Rent' || p.type === 'DepositToRent') && p.date.startsWith(periodPrefix)).reduce((sum, p) => sum + p.amount, 0);

        if (amountDue > 0 || amountPaid > 0) {
            let status: BillingDetail['status'] = 'Unpaid';
            if (amountPaid >= amountDue && amountDue > 0) status = 'Paid';
            else if (amountPaid > 0 && amountPaid < amountDue) status = 'Partial';
            else if (amountDue === 0 && amountPaid > 0) status = 'Paid';
            details.push({ tenantId: t.id, tenantName: t.name, unitIds: t.unitIds, amountDue, amountPaid, status });
        }
      });
      return details;
  };

  const recalculateMetrics = (currentData: DashboardData, year: number = selectedYear, quarter: 'All' | 'Q1' | 'Q2' | 'Q3' | 'Q4' = selectedQuarter) => {
    // ... (same as before) ...
    const tenants = currentData.tenants || [];
    const buildings = currentData.buildings || [];
    const payments = currentData.payments || [];
    const assumptions = currentData.budgetAssumptions || [];
    const adjustments = currentData.budgetAdjustments || [];

    const yearlyTargetsMap = currentData.yearlyTargets || {};
    const yearTargets = yearlyTargetsMap[year] || { revenue: 0, occupancy: 0 };

    let periodStart = new Date(year, 0, 1);
    let periodEnd = new Date(year, 11, 31);
    if (quarter === 'Q1') { periodEnd = new Date(year, 2, 31); }
    else if (quarter === 'Q2') { periodStart = new Date(year, 3, 1); periodEnd = new Date(year, 5, 30); }
    else if (quarter === 'Q3') { periodStart = new Date(year, 6, 1); periodEnd = new Date(year, 8, 30); }
    else if (quarter === 'Q4') { periodStart = new Date(year, 9, 1); periodEnd = new Date(year, 11, 31); }

    const selfUseUnitIds = new Set<string>();
    const syncedBuildings = buildings.map(b => ({
        ...b,
        units: b.units.map(u => {
             if (u.isSelfUse) selfUseUnitIds.add(u.id);
             const activeTenant = tenants.find(t => t.buildingId === b.id && t.unitIds.includes(u.id) && (t.status === 'Active' || t.status === 'Expiring' || t.status === 'Pending'));
             let newStatus = u.status;
             if (activeTenant) { newStatus = UnitStatus.Occupied; } 
             else if (u.status === UnitStatus.Occupied && !u.isSelfUse) { newStatus = UnitStatus.Vacant; }
             return { ...u, status: newStatus };
        })
    }));

    let totalLeasableArea = 0;
    syncedBuildings.forEach(b => { b.units.forEach(u => { if (!u.isSelfUse) { totalLeasableArea += u.area; } }); });

    let leasedArea = 0;
    tenants.forEach(t => {
        const isSelfUse = t.unitIds.some(uid => selfUseUnitIds.has(uid));
        if (isSelfUse || t.status === 'Expired' || t.status === 'Terminated') return;
        const start = new Date(t.leaseStart);
        const end = new Date(t.leaseEnd);
        const terminated = t.terminationDate ? new Date(t.terminationDate) : null;
        const effectiveEnd = terminated && terminated < end ? terminated : end;
        if (start <= periodEnd && effectiveEnd >= periodEnd) { leasedArea += t.totalArea; }
    });

    const occupancyRate = totalLeasableArea > 0 ? parseFloat(((leasedArea / totalLeasableArea) * 100).toFixed(1)) : 0;
    const monthlyRevenueTarget = calculateBudgetedReceivableInPeriod(tenants, periodStart, periodEnd, selfUseUnitIds, assumptions, adjustments);
    const monthlyRevenueCollected = payments.filter(p => { const pDate = new Date(p.date); return pDate >= periodStart && pDate <= periodEnd && (p.type === 'Rent' || p.type === 'DepositToRent' || p.type === 'ParkingFee'); }).reduce((sum, p) => sum + p.amount, 0);
    const collectionRate = monthlyRevenueTarget > 0 ? Math.min(100, Math.round((monthlyRevenueCollected / monthlyRevenueTarget) * 100)) : 0;
    const annualRevenueCollected = payments.filter(p => p.date.startsWith(year.toString()) && (p.type === 'Rent' || p.type === 'DepositToRent' || p.type === 'ParkingFee')).reduce((sum, p) => sum + p.amount, 0);

    const recentSignings = tenants.filter(t => { 
        if (t.status === 'Expired') return false; 
        const start = new Date(t.leaseStart); 
        return start >= periodStart && start <= periodEnd; 
    }).slice(0, 10);
    
    const expiringSoon = tenants.filter(t => { 
        if (t.status === 'Expired' || t.status === 'Terminated') return false;
        const end = new Date(t.leaseEnd); 
        return end >= periodStart && end <= periodEnd; 
    });
    
    const newContractsCount = recentSignings.length;
    
    const monthlyTrends = calculateTrends(tenants, payments, totalLeasableArea, selfUseUnitIds, year, quarter, assumptions, adjustments);
    const prevYearMonthlyTrends = calculateTrends(tenants, payments, totalLeasableArea, selfUseUnitIds, year - 1, 'All', assumptions, adjustments);

    let billingYear = new Date().getFullYear();
    let billingMonth = new Date().getMonth();
    if (billingSelectedMonth) {
        const parts = billingSelectedMonth.split('-');
        if (parts.length === 2) { billingYear = parseInt(parts[0], 10); billingMonth = parseInt(parts[1], 10) - 1; }
    }
    const billingMonthStart = new Date(billingYear, billingMonth, 1);
    const billingMonthEnd = new Date(billingYear, billingMonth + 1, 0);
    const billingPrefix = `${billingYear}-${String(billingMonth + 1).padStart(2, '0')}`;
    const currentMonthBilling: BillingDetail[] = [];
    tenants.forEach(t => {
        const isSelfUse = t.unitIds.some(uid => selfUseUnitIds.has(uid));
        if (isSelfUse || t.status === 'Terminated' || t.status === 'Expired') return;
        const amountDue = calculateBudgetedReceivableInPeriod([t], billingMonthStart, billingMonthEnd, selfUseUnitIds, assumptions, adjustments);
        const amountPaid = payments.filter(p => p.tenantId === t.id && (p.type === 'Rent' || p.type === 'DepositToRent') && p.date.startsWith(billingPrefix)).reduce((sum, p) => sum + p.amount, 0);
        if (amountDue > 0 || amountPaid > 0) {
            let status: BillingDetail['status'] = 'Unpaid';
            if (amountPaid >= amountDue && amountDue > 0) status = 'Paid';
            else if (amountPaid > 0 && amountPaid < amountDue) status = 'Partial';
            else if (amountDue === 0 && amountPaid > 0) status = 'Paid';
            currentMonthBilling.push({ tenantId: t.id, tenantName: t.name, unitIds: t.unitIds, amountDue, amountPaid, status });
        }
    });

    const parkingRevenueInPeriod = payments.filter(p => { const pDate = new Date(p.date); return pDate >= periodStart && pDate <= periodEnd && p.type === 'ParkingFee'; }).reduce((sum, p) => sum + p.amount, 0);
    const parkingDetails: ParkingStatDetail[] = []; 
    let totalContractSpaces = 0; let totalActualSpaces = 0;
    tenants.forEach(t => {
         if (t.status === 'Expired' || t.status === 'Terminated') return;
         const contractCount = t.contractParkingSpaces !== undefined ? t.contractParkingSpaces : (t.parkingSpaces || 0);
         const actualCount = t.actualParkingSpaces !== undefined ? t.actualParkingSpaces : (t.parkingSpaces || 0);
         if (contractCount > 0 || actualCount > 0) {
            totalContractSpaces += contractCount; totalActualSpaces += actualCount;
            parkingDetails.push({ tenantId: t.id, tenantName: t.name, contractCount, actualCount });
         }
    });
    
    const parkingStats = { totalContractSpaces, totalActualSpaces, totalMonthlyRevenue: parkingRevenueInPeriod, details: parkingDetails };

    const processedData: DashboardData = {
        ...currentData, 
        buildings: syncedBuildings, 
        tenants: tenants, 
        payments: payments, 
        totalArea: totalLeasableArea, 
        leasedArea, 
        occupancyRate,
        annualRevenueTarget: yearTargets.revenue, 
        annualOccupancyTarget: yearTargets.occupancy, 
        annualRevenueCollected, 
        monthlyRevenueTarget, 
        monthlyRevenueCollected, 
        collectionRate, 
        newContractsCount, 
        recentSignings, 
        expiringSoon, 
        monthlyTrends, 
        prevYearMonthlyTrends, 
        currentMonthBilling, 
        parkingStats,
        budgetAssumptions: assumptions, 
        budgetAdjustments: adjustments, 
        budgetAnalysis: currentData.budgetAnalysis || { occupancy: '', revenue: '' }
    };

    setData(processedData); 
  };

  const updateBuildings = (newBuildings: Building[]) => {
      if (!data) return;
      const updatedTenants = data.tenants.map(t => {
          let newTotalArea = 0;
          t.unitIds.forEach(uid => { for (const b of newBuildings) { const unit = b.units.find(u => u.id === uid); if (unit) { newTotalArea += unit.area; break; } } });
          newTotalArea = parseFloat(newTotalArea.toFixed(2));
          if (Math.abs(newTotalArea - t.totalArea) < 0.01) return t;
          let price = t.unitPrice;
          if ((price === undefined || price === 0) && t.totalArea > 0) { price = (t.monthlyRent * 12) / (t.totalArea * 365); }
          price = price || 0;
          const newMonthlyRent = Math.round(price * (365 / 12) * newTotalArea);
          return { ...t, totalArea: newTotalArea, monthlyRent: newMonthlyRent, unitPrice: price };
      });
      recalculateMetrics({ ...data, buildings: newBuildings, tenants: updatedTenants });
  };

  const handleBatchUpdate = (updates: Partial<DashboardData>) => {
      if (!data) return;
      const cleanUpdates: Partial<DashboardData> = {};
      (Object.keys(updates) as Array<keyof DashboardData>).forEach(key => { if (updates[key] !== undefined) { cleanUpdates[key] = updates[key] as any; } });
      const mergedData = { ...data, ...cleanUpdates };
      recalculateMetrics(mergedData);
  };

  // ... (handleDeferPayment, budget scenario handlers, update helpers) ...
  const handleDeferPayment = (tenantId: string, year?: number, month?: number) => {
      if (!data) return;
      const tenant = data.tenants.find(t => t.id === tenantId);
      if (!tenant) return;
      let targetYear, targetMonth;
      if (year !== undefined && month !== undefined) { targetYear = year; targetMonth = month; } 
      else { const parts = billingSelectedMonth.split('-'); if (parts.length === 2) { targetYear = parseInt(parts[0], 10); targetMonth = parseInt(parts[1], 10) - 1; } else { targetYear = new Date().getFullYear(); targetMonth = new Date().getMonth(); } }
      const periodStart = new Date(targetYear, targetMonth, 1);
      const periodEnd = new Date(targetYear, targetMonth + 1, 0);
      const selfUseUnitIds = new Set<string>();
      data.buildings.forEach(b => b.units.forEach(u => u.isSelfUse && selfUseUnitIds.add(u.id)));
      const amountDue = calculateBudgetedReceivableInPeriod([tenant], periodStart, periodEnd, selfUseUnitIds, data.budgetAssumptions || [], data.budgetAdjustments || []);
      if (amountDue <= 0) { alert("该月份无应收金额，无法缓缴。"); return; }
      let nextMonth = targetMonth + 1; let nextYear = targetYear;
      if (nextMonth > 11) { nextMonth = 0; nextYear++; }
      const newAdj: BudgetAdjustment = { id: `adj_defer_${Date.now()}`, tenantId: tenant.id, tenantName: tenant.name, originalYear: targetYear, originalMonth: targetMonth, adjustedYear: nextYear, adjustedMonth: nextMonth, amount: amountDue, reason: '申请缓缴 (Defer Payment)' };
      const newAdjustments = [...(data.budgetAdjustments || []), newAdj];
      recalculateMetrics({ ...data, budgetAdjustments: newAdjustments });
      alert(`已申请缓缴！\n客户: ${tenant.name}\n金额: ¥${amountDue.toLocaleString()}\n已延期至: ${nextYear}年${nextMonth+1}月`);
  };

  const updateBudgetScenarios = (newScenarios: BudgetScenario[]) => {
      if (!data) return;
      setData({...data, budgetScenarios: newScenarios});
  };

  const handleRenameScenario = (id: string, newName: string) => {
      if (!data || !data.budgetScenarios) return;
      const updated = data.budgetScenarios.map(s => s.id === id ? {...s, name: newName} : s);
      setData({...data, budgetScenarios: updated});
  };

  const handleActivateScenario = (scenario: BudgetScenario) => {
      if (!data) return;
      const scenarioList = data.budgetScenarios || [];
      const updatedScenarios = scenarioList.map(s => ({
          ...s,
          isActive: s.id === scenario.id 
      }));
      recalculateMetrics({
          ...data,
          budgetScenarios: updatedScenarios,
          budgetAssumptions: scenario.assumptions,
          budgetAdjustments: scenario.adjustments
      });
  };

  const updateTenants = (newTenants: Tenant[]) => { if (!data) return; recalculateMetrics({ ...data, tenants: newTenants }); };
  const updatePayments = (newPayments: PaymentRecord[]) => { if (!data) return; recalculateMetrics({ ...data, payments: newPayments }); };
  const updateBudgetAssumptions = (newAssumptions: BudgetAssumption[]) => { if (!data) return; recalculateMetrics({ ...data, budgetAssumptions: newAssumptions }); };
  const updateBudgetAdjustments = (newAdjustments: BudgetAdjustment[]) => { if (!data) return; recalculateMetrics({ ...data, budgetAdjustments: newAdjustments }); };
  const updateBudgetAnalysis = (newAnalysis: BudgetAnalysisData) => { if (!data) return; recalculateMetrics({ ...data, budgetAnalysis: newAnalysis }); };

  const openTargetModal = (type: 'revenue' | 'occupancy') => { 
      if (!data) return; 
      setTargetModalType(type); 
      setTargetForm({ revenue: data.annualRevenueTarget, occupancy: data.annualOccupancyTarget }); 
      setIsTargetModalOpen(true); 
  };
  
  const saveTargets = () => { 
      if (!data) return; 
      const newTargets = { ...data.yearlyTargets };
      newTargets[selectedYear] = { revenue: Number(targetForm.revenue), occupancy: Number(targetForm.occupancy) };
      recalculateMetrics({ ...data, yearlyTargets: newTargets }); 
      setIsTargetModalOpen(false); 
  };
  
  const handleResetData = () => { if (window.confirm("危险操作！\n\n确定要清空所有本地数据并恢复出厂设置吗？所有录入的合同、财务、楼宇修改记录都将丢失。")) { localStorage.removeItem(STORAGE_KEY); const initial = generateInitialData(); recalculateMetrics(initial, currentYear, 'All'); alert("系统数据已重置。"); } };

  const handleExport = () => { if (!data) return; const exportData = { buildings: data.buildings, tenants: data.tenants, payments: data.payments, yearlyTargets: data.yearlyTargets }; const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `park_data_${new Date().toISOString().split('T')[0]}.json`; link.click(); };
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (e) => { try { const imported = JSON.parse(e.target?.result as string); if (imported.buildings && imported.tenants) { const mergedData = { ...generateInitialData(), ...imported }; setSelectedYear(new Date().getFullYear()); setSelectedQuarter('All'); recalculateMetrics(mergedData, new Date().getFullYear(), 'All'); alert("数据导入成功！"); } else { alert("文件格式不正确 (需要JSON格式)"); } } catch (err) { alert("解析文件失败"); } }; reader.readAsText(file); } };

  const handleYearChange = (year: number) => {
      setSelectedYear(year);
      if (data) {
          recalculateMetrics(data, year, selectedQuarter);
      }
  };

  const annualComparisonData: AnnualComparisonData[] = React.useMemo(() => {
      if (!data) return [];
      const years = [selectedYear - 1, selectedYear, selectedYear + 1];
      const results: AnnualComparisonData[] = [];

      years.forEach((y, idx) => {
          const targets = data.yearlyTargets?.[y] || { revenue: 0, occupancy: 0 };
          const actualRevenue = data.payments
              .filter(p => p.date.startsWith(y.toString()) && (p.type === 'Rent' || p.type === 'DepositToRent' || p.type === 'ParkingFee'))
              .reduce((sum, p) => sum + p.amount, 0);
          
          const yearEnd = new Date(y, 11, 31);
          let totalLeasable = 0;
          let leasedArea = 0;
          const selfUseIds = new Set<string>();
          data.buildings.forEach(b => b.units.forEach(u => {
              if (u.isSelfUse) selfUseIds.add(u.id);
              else totalLeasable += u.area;
          }));
          data.tenants.forEach(t => {
              if (selfUseIds.has(t.buildingId) || t.status === 'Expired' || t.status === 'Terminated') return;
              const start = new Date(t.leaseStart);
              const end = new Date(t.leaseEnd);
              if (start <= yearEnd && end >= yearEnd) leasedArea += t.totalArea;
          });
          const occupancyRate = totalLeasable > 0 ? parseFloat(((leasedArea / totalLeasable) * 100).toFixed(1)) : 0;

          let revenueYoY = null;
          let occupancyYoY = null;
          
          if (idx > 0) {
              const prev = results[idx - 1];
              if (prev && prev.revenueActual > 0) {
                  revenueYoY = ((actualRevenue - prev.revenueActual) / prev.revenueActual) * 100;
              }
              if (prev) {
                  occupancyYoY = occupancyRate - prev.occupancyRate;
              }
          }

          results.push({
              year: y,
              revenueTarget: targets.revenue,
              revenueActual: actualRevenue,
              revenueCompletionRate: targets.revenue > 0 ? (actualRevenue / targets.revenue) * 100 : 0,
              revenueYoY,
              occupancyRate,
              occupancyYoY
          });
      });

      return results;
  }, [data, selectedYear]);

  if (!data) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-slate-400">Loading Dashboard...</div></div>;

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      <div className={`fixed inset-0 bg-black/50 z-20 md:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setSidebarOpen(false)} />
      
      {/* Light Theme Sidebar for PC */}
      <aside className={`fixed inset-y-0 left-0 z-30 bg-white border-r border-slate-200 transition-all duration-300 flex flex-col h-screen sticky top-0 shadow-xl ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:w-20 md:translate-x-0'}`}>
        <div className="h-20 flex items-center justify-center border-b border-slate-100 bg-white z-10">
           {isSidebarOpen ? (
              <div className="flex items-center gap-2 animate-in fade-in duration-300">
                <div className="flex flex-col">
                  <span className="text-2xl font-bold italic text-sky-600 tracking-tight leading-none" style={{ fontFamily: 'sans-serif' }}>Kingdee</span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest scale-90 origin-left">Software Park</span>
                </div>
              </div>
           ) : (
               <div className="flex items-center justify-center w-full h-full">
                    <span className="text-xl font-bold italic text-sky-600">K</span>
               </div>
           )}
        </div>

        <nav className="flex-1 py-6 px-0 space-y-1 overflow-y-auto scrollbar-hide">
          <SidebarItem icon={<LayoutDashboard size={20} />} label="工作台" isOpen={isSidebarOpen} active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); if(window.innerWidth < 768) setSidebarOpen(false); }} />
          <SidebarItem icon={<Building2 size={20} />} label="楼宇资管" isOpen={isSidebarOpen} active={activeTab === 'buildings'} onClick={() => { setActiveTab('buildings'); if(window.innerWidth < 768) setSidebarOpen(false); }} />
          <SidebarItem icon={<Users size={20} />} label="客户管理" isOpen={isSidebarOpen} active={activeTab === 'contracts'} onClick={() => { setActiveTab('contracts'); if(window.innerWidth < 768) setSidebarOpen(false); }} />
          <SidebarItem icon={<PieChart size={20} />} label="财务报表" isOpen={isSidebarOpen} active={activeTab === 'finance'} onClick={() => { setActiveTab('finance'); if(window.innerWidth < 768) setSidebarOpen(false); }} />
          <SidebarItem icon={<Calculator size={20} />} label="预算管理" isOpen={isSidebarOpen} active={activeTab === 'budget'} onClick={() => { setActiveTab('budget'); if(window.innerWidth < 768) setSidebarOpen(false); }} />
          <SidebarItem icon={<Lightbulb size={20} />} label="客户洞察" isOpen={isSidebarOpen} active={activeTab === 'insights'} onClick={() => { setActiveTab('insights'); if(window.innerWidth < 768) setSidebarOpen(false); }} />
          
          <div className="my-4 h-px bg-slate-100 mx-4" />
          
          <SidebarItem icon={<Settings size={20} />} label="系统与备份" isOpen={isSidebarOpen} active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); if(window.innerWidth < 768) setSidebarOpen(false); }} />
        </nav>

        {/* ... User Profile ... */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className={`flex items-center gap-3 p-2 rounded-xl transition-colors cursor-pointer group ${!isSidebarOpen && 'justify-center'}`}>
            <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm text-slate-400 group-hover:text-blue-500 transition-colors">
               <UserCircle size={24} />
            </div>
            
            {isSidebarOpen && (
              <div className="overflow-hidden flex-1 animate-in fade-in duration-300">
                <p className="text-sm font-bold text-slate-700 truncate group-hover:text-blue-600 transition-colors">招商总监</p>
                <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                   <p className="text-xs text-slate-500 truncate">Kingdee Park Admin</p>
                </div>
              </div>
            )}
            
            {isSidebarOpen && (
               <button className="text-slate-400 hover:text-red-500 transition-colors" title="注销">
                   <LogOut size={16} />
               </button>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 transition-all duration-300 w-full overflow-hidden flex flex-col">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-10 px-4 md:px-6 flex items-center justify-between shadow-sm">
          {/* ... Header Content ... */}
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><Menu size={20} /></button>
            <div className="flex flex-col"><h1 className="text-lg md:text-xl font-bold text-slate-800 truncate">{activeTab === 'dashboard' && '招商管理看板'}{activeTab === 'buildings' && '楼宇资产管理'}{activeTab === 'contracts' && '客户合同中心'}{activeTab === 'finance' && '财务收款报表'}{activeTab === 'budget' && '招商预算管理'}{activeTab === 'insights' && '客户关键时刻洞察'}{activeTab === 'settings' && '系统设置与数据备份'}</h1></div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
             <div className={`hidden md:flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${isCloudConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`} title={isCloudConnected ? '已连接到金蝶云数据库' : '仅本地存储模式'}>
                 {isCloudConnected ? <CheckCircle2 size={12} className="text-emerald-500"/> : <Cloud size={12} />}
                 <span>{isCloudConnected ? '金蝶云已连接' : '本地模式'}</span>
             </div>
             
             <button 
                onClick={handleQuickCloudSave}
                disabled={isSyncing}
                className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all shadow-sm border
                    ${isCloudConnected 
                        ? 'bg-sky-600 text-white border-sky-600 hover:bg-sky-700 hover:shadow-md' 
                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                    }`}
                title="一键备份当前数据到云端 (需填写操作人)"
            >
                {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
                <span>{isSyncing ? '备份中...' : '云端保存'}</span>
            </button>

             <div className="hidden md:flex items-center gap-2 border-r border-slate-200 pr-4 mr-2"><button onClick={handleExport} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-50 rounded-lg flex items-center gap-1 text-xs" title="导出数据 (JSON)"><Download size={16} /> 导出</button><label className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-50 rounded-lg flex items-center gap-1 text-xs cursor-pointer" title="导入数据"><Upload size={16} /> 导入<input type="file" className="hidden" accept=".json" onChange={handleImport} /></label></div>
            <button onClick={() => setAssistantOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium hover:shadow-lg hover:shadow-sky-500/20 transition-all"><Sparkles size={16} /><span className="hidden md:inline">智能分析</span><span className="md:hidden">AI</span></button>
          </div>
        </header>

        {/* ... Main Content ... */}
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full overflow-x-hidden">
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
               {/* ... Dashboard Components ... */}
               <DashboardAlerts tenants={data.tenants} />
               <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                   <div className="flex items-center gap-2">
                       <Calendar className="text-blue-500" size={20}/>
                       <span className="font-bold text-slate-700">当前统计年度: {selectedYear}年</span>
                   </div>
                   <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-200">
                       <button onClick={() => handleYearChange(selectedYear - 1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-slate-600"><ChevronLeft size={16}/></button>
                       <span className="px-4 font-mono font-medium text-slate-800">{selectedYear}</span>
                       <button onClick={() => handleYearChange(selectedYear + 1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-slate-600"><ChevronRight size={16}/></button>
                   </div>
               </div>

               <StatsCards 
                  data={data} 
                  selectedYear={selectedYear}
                  onEditTargets={openTargetModal}
               />
               
               <AnnualMetricComparisonTable data={annualComparisonData} />

               {/* Charts & Tables */}
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <OccupancyTrendChart data={data} period="年度" />
                  <RevenueChart data={data} period="年度" />
                  <UnitPriceTrendChart data={data} period="年度" />
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
                      <div className="p-4 bg-slate-50 rounded-full mb-4">
                          <PieChart size={32} className="text-slate-400" />
                      </div>
                      <h3 className="text-slate-800 font-bold mb-1">业态分布分析</h3>
                      <p className="text-slate-400 text-sm">更多维度报表正在开发中...</p>
                  </div>
               </div>
               <div className="h-full">
                   <BudgetExecutionSummaryTable 
                        data={data} 
                        selectedYear={selectedYear}
                        onYearChange={handleYearChange}
                   />
               </div>
               <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <RecentActivityTable data={data} />
                  <ExpiringSoonTable data={data} />
               </div>
               <ParkingOverview data={data} />
               <BillingTable 
                  data={data} 
                  selectedMonth={billingSelectedMonth}
                  onMonthChange={setBillingSelectedMonth}
               />
            </div>
          )}

          {activeTab === 'buildings' && (
             <div className="animate-in fade-in zoom-in-50 duration-300">
                <BuildingManager 
                  buildings={data.buildings} 
                  tenants={data.tenants} 
                  onUpdateBuildings={updateBuildings} 
                />
             </div>
          )}

          {activeTab === 'contracts' && (
             <div className="animate-in fade-in zoom-in-50 duration-300">
                <ContractManager 
                  tenants={data.tenants} 
                  buildings={data.buildings} 
                  onUpdateTenants={updateTenants} 
                />
             </div>
          )}

          {activeTab === 'finance' && (
             <div className="animate-in fade-in zoom-in-50 duration-300">
                <FinanceManager 
                  payments={data.payments} 
                  tenants={data.tenants}
                  onUpdatePayments={updatePayments}
                  onUpdateTenants={updateTenants}
                  onBatchUpdate={handleBatchUpdate}
                  getBillingDetails={getBillingDetailsForPeriod}
                  onDeferPayment={handleDeferPayment}
                />
             </div>
          )}

          {activeTab === 'budget' && (
             <div className="animate-in fade-in zoom-in-50 duration-300">
                <BudgetManager 
                  buildings={data.buildings}
                  tenants={data.tenants}
                  budgetAssumptions={data.budgetAssumptions}
                  onUpdateAssumptions={updateBudgetAssumptions}
                  budgetAdjustments={data.budgetAdjustments}
                  onUpdateAdjustments={updateBudgetAdjustments}
                  budgetAnalysis={data.budgetAnalysis}
                  onUpdateAnalysis={updateBudgetAnalysis}
                  payments={data.payments}
                  
                  scenarios={data.budgetScenarios || []}
                  onUpdateScenarios={updateBudgetScenarios}
                  onRenameScenario={handleRenameScenario}
                  onActivateScenario={handleActivateScenario}
                  onSaveBudgetToCloud={handleSaveBudgetToCloud}
                />
             </div>
          )}

          {activeTab === 'insights' && (
             <div className="animate-in fade-in zoom-in-50 duration-300">
                 <TenantInsights 
                    tenants={data.tenants}
                    onUpdateTenants={updateTenants}
                 />
             </div>
          )}

          {activeTab === 'settings' && (
             <div className="animate-in fade-in zoom-in-50 duration-300 max-w-2xl mx-auto">
                 {/* ... Settings Content ... */}
                 <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                     {/* ... Header ... */}
                     <div className="p-6 border-b border-slate-200">
                         <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                             <Settings className="text-slate-400" /> 系统设置
                         </h2>
                     </div>
                     
                     {/* Cloud Status */}
                     <div className="p-6 border-b border-slate-200 bg-sky-50/30">
                         <div className="flex items-center gap-3 mb-4">
                             <div className="p-2 bg-white rounded-lg text-sky-600 shadow-sm border border-sky-100">
                                 <CloudCog size={24} />
                             </div>
                             <div>
                                 <h3 className="font-bold text-slate-700">云端数据库状态</h3>
                                 <div className="flex items-center gap-2 text-sm mt-1">
                                     {isCloudConnected ? (
                                         <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                             <CheckCircle2 size={14} /> 已连接至金蝶软件园数据库
                                         </span>
                                     ) : (
                                         <span className="flex items-center gap-1 text-rose-500 font-medium">
                                             <AlertCircle size={14} /> 未连接 (请检查网络)
                                         </span>
                                     )}
                                 </div>
                             </div>
                         </div>
                         {/* ... Project ID Input ... */}
                         <div className="bg-white p-4 rounded-lg border border-slate-200">
                             <div>
                                 <label className="block text-xs font-medium text-slate-500 mb-1">项目标识 (Project ID)</label>
                                 <div className="flex gap-2">
                                     <input 
                                        type="text" 
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm text-slate-600 outline-none focus:ring-1 focus:ring-sky-200"
                                        value={cloudConfig.projectId}
                                        onChange={e => setCloudConfig({...cloudConfig, projectId: e.target.value})}
                                     />
                                     <button onClick={handleCloudConfigSave} className="bg-slate-100 text-slate-600 px-4 py-2 rounded text-sm hover:bg-slate-200 font-medium transition-colors">更新ID</button>
                                 </div>
                                 <p className="text-[10px] text-slate-400 mt-2">* URL 与 Key 已内置，系统自动管理连接。仅需确认项目 ID 以区分不同园区数据。</p>
                             </div>
                         </div>
                     </div>

                     {/* Cloud History & Restore */}
                     {isCloudConnected && (
                         <div className="p-6 border-b border-slate-200">
                             <div className="flex justify-between items-center mb-4">
                                 <h3 className="font-bold text-slate-700 flex items-center gap-2"><History size={18} /> 云端备份历史</h3>
                                 <div className="flex gap-2">
                                     <button onClick={() => fetchCloudHistory()} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="刷新"><RefreshCw size={14}/></button>
                                     <button onClick={openSnapshotModal} className="text-xs bg-sky-50 text-sky-600 px-3 py-1.5 rounded-lg font-medium hover:bg-sky-100 transition-colors">新建备份</button>
                                 </div>
                             </div>
                             <div className="bg-slate-50 rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
                                 {isLoadingHistory ? (
                                     <div className="p-4 text-center text-slate-400 text-xs">加载中...</div>
                                 ) : cloudHistory.length === 0 ? (
                                     <div className="p-4 text-center text-slate-400 text-xs">暂无云端备份记录</div>
                                 ) : (
                                     <div className="divide-y divide-slate-100">
                                         {cloudHistory.map(backup => (
                                             <div key={backup.id} className="p-3 flex justify-between items-center hover:bg-white transition-colors">
                                                 <div>
                                                     <div className="text-sm font-medium text-slate-700">{backup.note || '无备注'}</div>
                                                     <div className="text-xs text-slate-400 flex items-center gap-1"><FileClock size={10} /> {new Date(backup.created_at).toLocaleString()}</div>
                                                 </div>
                                                 <div className="flex gap-2">
                                                     <button 
                                                        onClick={() => handleRestoreCloudBackup(backup.id)} 
                                                        disabled={restoringId === backup.id} 
                                                        className="text-xs border border-orange-200 bg-white text-orange-600 px-2 py-1 rounded hover:border-orange-300 hover:bg-orange-50 flex items-center gap-1"
                                                     >
                                                         {restoringId === backup.id ? <Loader2 size={12} className="animate-spin"/> : <RotateCcw size={12}/>} 恢复
                                                     </button>
                                                     <button 
                                                        onClick={() => handleDownloadCloudBackup(backup.id, backup.note)} 
                                                        disabled={restoringId === backup.id} 
                                                        className="text-xs border border-slate-200 bg-white text-slate-600 px-2 py-1 rounded hover:border-blue-300 hover:text-blue-600 flex items-center gap-1"
                                                     >
                                                         {restoringId === backup.id ? <Loader2 size={12} className="animate-spin"/> : <Download size={12}/>} 下载
                                                     </button>
                                                 </div>
                                             </div>
                                         ))}
                                     </div>
                                 )}
                             </div>
                         </div>
                     )}
                     
                     {/* Local Data Management */}
                     <div className="p-6 bg-slate-50/50">
                         <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Database size={18} /> 本地数据管理</h3>
                         <div className="space-y-3">
                             <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                                 <div>
                                     <div className="text-sm font-medium text-slate-700">导出数据备份 (JSON)</div>
                                     <div className="text-xs text-slate-400">将当前所有数据导出为本地文件</div>
                                 </div>
                                 <button onClick={handleExport} className="px-3 py-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium transition-colors">导出</button>
                             </div>
                             <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                                 <div>
                                     <div className="text-sm font-medium text-slate-700">导入数据恢复</div>
                                     <div className="text-xs text-slate-400">从JSON文件恢复数据 (将覆盖当前数据)</div>
                                 </div>
                                 <label className="px-3 py-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium transition-colors cursor-pointer">选择文件<input type="file" className="hidden" accept=".json" onChange={handleImport} /></label>
                             </div>
                             <div className="flex items-center justify-between p-3 bg-rose-50 border border-rose-100 rounded-lg">
                                 <div>
                                     <div className="text-sm font-medium text-rose-700">重置系统</div>
                                     <div className="text-xs text-rose-400">清除所有本地数据并恢复默认演示数据</div>
                                 </div>
                                 <button onClick={handleResetData} className="px-3 py-1.5 text-rose-600 bg-white border border-rose-200 hover:bg-rose-100 rounded text-xs font-medium transition-colors">重置</button>
                             </div>
                         </div>
                     </div>
                 </div>
                 <div className="mt-8 text-center text-xs text-slate-400"><p>Kingdee Park Management System v2.4</p><p>© 2024 Kingdee. All rights reserved.</p></div>
             </div>
          )}
        </div>
      </main>

      <AssistantPanel isOpen={isAssistantOpen} onClose={() => setAssistantOpen(false)} data={data} />
      
      {/* Target Modal */}
      {isTargetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-50 duration-200">
                  <h3 className="text-lg font-bold mb-4 text-slate-800">设定 {selectedYear}年度 {targetModalType === 'revenue' ? '营收' : '出租率'}目标</h3>
                  <div className="space-y-4">
                      {targetModalType === 'revenue' ? (
                          <div><label className="block text-sm text-slate-600 mb-1">年度营收目标 (元)</label><input type="number" className="w-full border rounded-lg p-2 text-lg font-semibold" value={targetForm.revenue} onChange={e => setTargetForm({...targetForm, revenue: Number(e.target.value)})} /></div>
                      ) : (
                          <div><label className="block text-sm text-slate-600 mb-1">年度出租率目标 (%)</label><input type="number" className="w-full border rounded-lg p-2 text-lg font-semibold" value={targetForm.occupancy} onChange={e => setTargetForm({...targetForm, occupancy: Number(e.target.value)})} /></div>
                      )}
                      <div className="flex justify-end gap-2 pt-2">
                          <button onClick={() => setIsTargetModalOpen(false)} className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">取消</button>
                          <button onClick={saveTargets} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Cloud Save Modal */}
      {isSnapshotModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-50 duration-200">
                  <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-slate-800">保存到云端</h3><button onClick={() => setIsSnapshotModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button></div>
                  <div className="space-y-4">
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">操作人员 (必填) <span className="text-red-500">*</span></label><div className="relative"><User size={14} className="absolute left-3 top-3 text-slate-400"/><input type="text" className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-sky-100 outline-none border-slate-200" placeholder="请输入您的姓名" value={operatorName} onChange={e => setOperatorName(e.target.value)}/></div></div>
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">备份备注 (选填)</label><input type="text" className="w-full border rounded-lg p-2 text-sm border-slate-200" placeholder="例如: 10月份月结后备份" value={snapshotNote} onChange={e => setSnapshotNote(e.target.value)}/></div>
                      <div className="bg-sky-50 p-3 rounded-lg text-xs text-sky-700 flex items-start gap-2"><Info size={14} className="mt-0.5 flex-shrink-0" /><p>保存后，系统将生成带时间戳的历史版本，您可以在“系统与备份”中随时查看或恢复。</p></div>
                      <div className="flex justify-end gap-2 pt-2"><button onClick={() => setIsSnapshotModalOpen(false)} className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">取消</button><button onClick={confirmCloudSave} disabled={!operatorName.trim()} className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">{isSyncing ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />} 确认保存</button></div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
