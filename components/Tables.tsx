
import React from 'react';
import { DashboardData, ContractStatus } from '../types';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';

const StatusBadge: React.FC<{ status: ContractStatus }> = ({ status }) => {
  const styles = {
    [ContractStatus.Active]: 'bg-green-100 text-green-700',
    [ContractStatus.Expiring]: 'bg-amber-100 text-amber-700',
    [ContractStatus.Terminated]: 'bg-red-100 text-red-700',
    [ContractStatus.Pending]: 'bg-blue-100 text-blue-700',
  };

  const labels = {
    [ContractStatus.Active]: '履约中',
    [ContractStatus.Expiring]: '即将到期',
    [ContractStatus.Terminated]: '已退租',
    [ContractStatus.Pending]: '签约中',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};

export const RecentActivityTable: React.FC<{ data: DashboardData }> = ({ data }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden h-full">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-800">最新签约动态</h3>
        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">查看全部</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-medium">
            <tr>
              <th className="px-6 py-3">企业名称</th>
              <th className="px-6 py-3">位置</th>
              <th className="px-6 py-3 text-right">签约面积</th>
              <th className="px-6 py-3">租赁周期</th>
              <th className="px-6 py-3">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.recentSignings.map((tenant) => {
              const building = data.buildings.find(b => b.id === tenant.buildingId);
              const unitNames = tenant.unitIds.map(uid => {
                  const unit = building?.units.find(u => u.id === uid);
                  return unit ? unit.name : uid;
              }).join(', ');
              
              return (
              <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-800">{tenant.name}</td>
                <td className="px-6 py-4 text-slate-600">
                  {building?.name} <span className="text-slate-500 text-xs ml-1">{unitNames}</span>
                </td>
                <td className="px-6 py-4 text-slate-800 font-semibold text-right">{tenant.totalArea} ㎡</td>
                <td className="px-6 py-4 text-slate-500">{tenant.leaseStart} 至 {tenant.leaseEnd}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={tenant.status} />
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const ExpiringSoonTable: React.FC<{ data: DashboardData }> = ({ data }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden h-full">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50/50">
        <h3 className="text-lg font-semibold text-amber-900">到期预警 (90天内)</h3>
        <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded">需优先处理</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-medium">
            <tr>
              <th className="px-4 py-3">企业</th>
              <th className="px-4 py-3">到期日</th>
              <th className="px-4 py-3">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.expiringSoon.map((tenant) => {
              const daysLeft = Math.ceil((new Date(tenant.leaseEnd).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
              return (
                <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4 font-medium text-slate-800">
                      <div className="truncate max-w-[120px]" title={tenant.name}>{tenant.name}</div>
                  </td>
                  <td className="px-4 py-4">
                      <div className="text-rose-600 font-medium text-xs">{tenant.leaseEnd}</div>
                      <div className="text-slate-400 text-xs">{daysLeft > 0 ? `剩 ${daysLeft} 天` : '已过期'}</div>
                  </td>
                  <td className="px-4 py-4">
                     <button className="px-2 py-1 bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 rounded text-xs transition-colors shadow-sm">
                       跟进
                     </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface BudgetExecutionProps {
    data: DashboardData;
    selectedYear?: number;
    onYearChange?: (year: number) => void;
}

export const BudgetExecutionSummaryTable: React.FC<BudgetExecutionProps> = ({ data, selectedYear, onYearChange }) => {
  let cumulativeBudget = 0;
  let cumulativeActual = 0;
  
  const displayYear = selectedYear || new Date().getFullYear();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth(); 

  const visibleTrends = data.monthlyTrends.filter((_, index) => {
      if (displayYear > currentYear) return false;
      if (displayYear === currentYear) {
          return index <= currentMonthIdx;
      }
      return true;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden h-full">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50/30">
        <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-emerald-900">预算执行情况汇总 (Budget Execution)</h3>
            <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-1 rounded">实时监控</span>
        </div>
        
        {onYearChange && (
            <div className="flex items-center bg-white border border-emerald-200 rounded-lg p-0.5 shadow-sm">
                <button 
                    onClick={() => onYearChange(displayYear - 1)} 
                    className="p-1 hover:bg-emerald-50 rounded text-emerald-600"
                >
                    <ChevronDown className="rotate-90" size={16}/>
                </button>
                <span className="px-3 py-1 text-sm font-bold text-emerald-800">{displayYear}年</span>
                <button 
                    onClick={() => onYearChange(displayYear + 1)} 
                    className="p-1 hover:bg-emerald-50 rounded text-emerald-600"
                >
                    <ChevronRight size={16}/>
                </button>
            </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-medium">
            <tr>
              <th className="px-4 py-3 text-center sticky left-0 bg-slate-50 z-10">月份</th>
              <th className="px-4 py-3 text-right bg-blue-50/30 text-blue-700">预算收入 (Budget)</th>
              <th className="px-4 py-3 text-right bg-emerald-50/30 text-emerald-700">实际收入 (Actual)</th>
              <th className="px-4 py-3 text-right">去年同期实收</th>
              <th className="px-4 py-3 text-right">同比 (YoY)</th>
              <th className="px-4 py-3 text-right">当月完成率</th>
              <th className="px-4 py-3 text-right border-l border-slate-100">累计达成率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleTrends.length > 0 ? (
                visibleTrends.map((monthData, index) => {
                cumulativeBudget += monthData.revenueTarget;
                cumulativeActual += monthData.revenueCollected;
                
                const monthlyRate = monthData.revenueTarget > 0 
                    ? (monthData.revenueCollected / monthData.revenueTarget) * 100 
                    : 0;
                    
                const cumulativeRate = cumulativeBudget > 0 
                    ? (cumulativeActual / cumulativeBudget) * 100 
                    : 0;

                const prevYearData = data.prevYearMonthlyTrends?.[index];
                const prevActual = prevYearData?.revenueCollected || 0;
                let yoy = 0;
                if (prevActual > 0) {
                    yoy = ((monthData.revenueCollected - prevActual) / prevActual) * 100;
                }

                return (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700 text-center sticky left-0 bg-white z-10">{monthData.month}</td>
                    <td className="px-4 py-3 text-right text-slate-600 bg-blue-50/10">¥{monthData.revenueTarget.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800 bg-emerald-50/10">¥{monthData.revenueCollected.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-400 text-xs">
                        ¥{prevActual.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                        {prevActual > 0 ? (
                            <span className={`text-xs font-medium ${yoy >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {yoy > 0 ? '+' : ''}{yoy.toFixed(1)}%
                            </span>
                        ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${monthlyRate >= 100 ? 'text-emerald-600' : monthlyRate >= 80 ? 'text-blue-600' : 'text-amber-600'}`}>
                        {monthlyRate.toFixed(1)}%
                        </span>
                    </td>
                    <td className="px-4 py-3 text-right border-l border-slate-100">
                        <span className={`text-xs px-2 py-0.5 rounded ${cumulativeRate >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {cumulativeRate.toFixed(1)}%
                        </span>
                    </td>
                    </tr>
                );
                })
            ) : (
                <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400 text-sm">
                        {displayYear > currentYear ? "未来年份暂无执行数据" : "暂无数据"}
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export interface AnnualComparisonData {
    year: number;
    revenueTarget: number;
    revenueActual: number;
    revenueCompletionRate: number;
    revenueYoY: number | null; // %
    occupancyRate: number; // Snapshot at year end
    occupancyYoY: number | null; // % difference (points)
}

interface AnnualMetricComparisonTableProps {
    data: AnnualComparisonData[];
}

export const AnnualMetricComparisonTable: React.FC<AnnualMetricComparisonTableProps> = ({ data }) => {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden mb-6">
            <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <TrendingUp size={20} className="text-blue-600"/> 年度经营指标对比分析
                </h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                        <tr>
                            <th className="px-6 py-3">年度</th>
                            <th className="px-6 py-3 text-right">年度营收目标</th>
                            <th className="px-6 py-3 text-right">实际营收达成</th>
                            <th className="px-6 py-3 text-right">指标完成率</th>
                            <th className="px-6 py-3 text-right">营收同比 (YoY)</th>
                            <th className="px-6 py-3 text-right">年末出租率</th>
                            <th className="px-6 py-3 text-right">出租率同比</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {data.map((row) => (
                            <tr key={row.year} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-bold text-slate-700 bg-slate-50/50">{row.year}年</td>
                                <td className="px-6 py-4 text-right text-slate-500">
                                    <div className="flex items-center justify-end gap-1">
                                        <Target size={12} className="text-slate-300"/>
                                        ¥{(row.revenueTarget / 10000).toFixed(1)}万
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right font-medium text-slate-800">
                                    ¥{(row.revenueActual / 10000).toFixed(1)}万
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${row.revenueCompletionRate >= 100 ? 'bg-emerald-100 text-emerald-700' : row.revenueCompletionRate >= 90 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {row.revenueCompletionRate.toFixed(1)}%
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {row.revenueYoY !== null ? (
                                        <div className={`flex items-center justify-end gap-1 font-medium ${row.revenueYoY >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                            {row.revenueYoY > 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                                            {row.revenueYoY > 0 ? '+' : ''}{row.revenueYoY.toFixed(1)}%
                                        </div>
                                    ) : <span className="text-slate-300">-</span>}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-1 font-medium text-blue-700">
                                        <Activity size={14} className="text-blue-400"/>
                                        {row.occupancyRate}%
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {row.occupancyYoY !== null ? (
                                        <span className={`font-medium ${row.occupancyYoY >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                            {row.occupancyYoY > 0 ? '+' : ''}{row.occupancyYoY.toFixed(1)}%
                                        </span>
                                    ) : <span className="text-slate-300">-</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
