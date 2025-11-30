
import React from 'react';
import { TrendingUp, PieChart, DollarSign, Target, ArrowRight, Edit3, Activity, Calendar } from 'lucide-react';
import { DashboardData } from '../types';

interface StatsCardsProps {
  data: DashboardData;
  onEditTargets: (type: 'revenue' | 'occupancy') => void;
  selectedYear: number;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ data, onEditTargets, selectedYear }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(val);
  };

  const annualProgress = data.annualRevenueTarget > 0 ? Math.min(100, (data.annualRevenueCollected / data.annualRevenueTarget) * 100) : 0;
  
  // Occupancy Target Gap
  const occupancyGap = data.annualOccupancyTarget - data.occupancyRate;

  return (
    <div className="space-y-6">
        {/* Top Row: Annual Goal - Enhanced Visuals */}
        <div className="bg-gradient-to-br from-[#009CEB] to-[#0066cc] rounded-2xl p-6 md:p-8 text-white shadow-xl shadow-blue-200/50 relative overflow-hidden group">
            {/* Background Decorative Elements */}
            <div className="absolute right-0 top-0 w-96 h-96 bg-white/5 rounded-full mix-blend-overlay filter blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
            <div className="absolute left-0 bottom-0 w-64 h-64 bg-cyan-400/20 rounded-full mix-blend-overlay filter blur-3xl -ml-10 -mb-10 pointer-events-none"></div>
            
            <button 
                onClick={() => onEditTargets('revenue')}
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 z-20 flex items-center gap-1.5 text-xs font-medium border border-white/10"
                title="编辑年度营收目标"
            >
                <Edit3 size={14} className="text-white" /> <span className="hidden sm:inline">调整目标</span>
            </button>

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                {/* Left: Annual Main Stats */}
                <div className="lg:col-span-7 space-y-6">
                    <div>
                        <div className="flex items-center gap-2 text-blue-100 mb-3">
                            <div className="p-1.5 bg-white/10 rounded-md"><Target className="w-4 h-4" /></div>
                            <span className="font-medium tracking-wide text-sm opacity-90">{selectedYear} 年度营收总目标达成</span>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            <h2 className="text-4xl md:text-5xl font-bold tabular-nums tracking-tight text-white drop-shadow-sm">
                                {formatCurrency(data.annualRevenueCollected)}
                            </h2>
                            <span className="text-blue-100 text-sm md:text-base font-medium opacity-80">
                                / 目标 {formatCurrency(data.annualRevenueTarget)}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium text-blue-100/80">
                            <span>当前进度</span>
                            <span>{annualProgress.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-black/20 rounded-full h-2.5 backdrop-blur-sm overflow-hidden">
                            <div 
                                className="bg-gradient-to-r from-cyan-300 to-white h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(255,255,255,0.4)] relative"
                                style={{ width: `${annualProgress}%` }}
                            >
                                <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Right: Monthly / Period Stats in Glass Card */}
                <div className="lg:col-span-5">
                    <div className="bg-white/10 backdrop-blur-md rounded-xl p-5 border border-white/10 grid grid-cols-2 gap-4 relative">
                         {/* Decoration */}
                         <div className="absolute -top-1 -left-1 w-3 h-3 border-t border-l border-white/30 rounded-tl-lg"></div>
                         <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r border-white/30 rounded-br-lg"></div>

                         <div className="space-y-1">
                            <p className="text-blue-100 text-xs font-medium flex items-center gap-1.5">
                                <Calendar size={12} className="opacity-70"/> 本期应收 (预估)
                            </p>
                            <p className="text-xl md:text-2xl font-bold tabular-nums tracking-tight">{formatCurrency(data.monthlyRevenueTarget)}</p>
                         </div>
                         <div className="space-y-1">
                            <p className="text-blue-100 text-xs font-medium flex items-center gap-1.5">
                                <Activity size={12} className="opacity-70"/> 本期实收
                            </p>
                            <div className="flex items-center gap-2">
                               <p className="text-xl md:text-2xl font-bold tabular-nums tracking-tight text-white">{formatCurrency(data.monthlyRevenueCollected)}</p>
                            </div>
                         </div>
                         
                         <div className="col-span-2 pt-3 mt-1 border-t border-white/10 flex items-center justify-between">
                             <span className="text-xs text-blue-100/70">期间回款率</span>
                             <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold tabular-nums ${data.collectionRate >= 90 ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    {data.collectionRate}%
                                </span>
                                {data.collectionRate >= 90 && (
                                    <span className="bg-emerald-400/20 text-emerald-100 text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/30">
                                        优
                                    </span>
                                )}
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Bottom Row: KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Occupancy Card */}
            <div className="bg-white rounded-2xl p-0 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 flex flex-col justify-between group hover:border-blue-100 transition-all duration-300 relative overflow-hidden">
                <div className="p-6 pb-4">
                    <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                            <p className="text-slate-500 text-xs font-bold tracking-wider uppercase">出租率 Occupancy</p>
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-4xl font-bold text-slate-800 tabular-nums tracking-tight">{data.occupancyRate}</h3>
                                <span className="text-lg text-slate-400 font-medium">%</span>
                            </div>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform duration-300">
                            <PieChart className="w-6 h-6" />
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => onEditTargets('occupancy')}
                        className="absolute top-4 right-14 p-1.5 text-slate-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="编辑目标"
                    >
                        <Edit3 size={14} />
                    </button>
                </div>

                <div className="bg-slate-50/50 p-4 border-t border-slate-100 flex justify-between items-center text-xs">
                    <div className="flex flex-col">
                        <span className="text-slate-400 mb-0.5">目标: {data.annualOccupancyTarget}%</span>
                        <span className={`font-medium ${occupancyGap > 0 ? "text-amber-500" : "text-emerald-600"}`}>
                            {occupancyGap > 0 ? `距目标差 ${occupancyGap.toFixed(1)}%` : '已达标'}
                        </span>
                    </div>
                    <div className="text-right">
                        <span className="block text-slate-400 mb-0.5">已租面积</span>
                        <span className="block text-slate-700 font-medium tabular-nums">{data.leasedArea.toLocaleString()} ㎡</span>
                    </div>
                </div>
            </div>

            {/* Collection Rate Card */}
            <div className="bg-white rounded-2xl p-0 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 flex flex-col justify-between group hover:border-emerald-100 transition-all duration-300">
                 <div className="p-6 pb-4">
                    <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                            <p className="text-slate-500 text-xs font-bold tracking-wider uppercase">期间回款率 Collection</p>
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-4xl font-bold text-slate-800 tabular-nums tracking-tight">{data.collectionRate}</h3>
                                <span className="text-lg text-slate-400 font-medium">%</span>
                            </div>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform duration-300">
                            <DollarSign className="w-6 h-6" />
                        </div>
                    </div>
                </div>
                 
                 <div className="bg-slate-50/50 p-4 border-t border-slate-100 flex justify-between items-center text-xs">
                    <span className={data.collectionRate >= 90 ? "text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md font-medium" : "text-amber-700 bg-amber-50 px-2 py-1 rounded-md font-medium"}>
                        {data.collectionRate >= 90 ? "回款状况良好" : "需关注未缴款项"}
                    </span>
                    <div className="text-right text-slate-400">
                        {selectedYear}年度累计
                    </div>
                 </div>
            </div>

            {/* New Contracts Card */}
            <div className="bg-white rounded-2xl p-0 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 flex flex-col justify-between sm:col-span-2 lg:col-span-1 group hover:border-fuchsia-100 transition-all duration-300">
                 <div className="p-6 pb-4">
                    <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                            <p className="text-slate-500 text-xs font-bold tracking-wider uppercase">新签客户 New Tenants</p>
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-4xl font-bold text-slate-800 tabular-nums tracking-tight">{data.newContractsCount}</h3>
                                <span className="text-lg text-slate-400 font-medium">家</span>
                            </div>
                        </div>
                        <div className="p-3 bg-fuchsia-50 text-fuchsia-600 rounded-xl group-hover:scale-110 transition-transform duration-300">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </div>
                </div>
                 
                 <div className="bg-slate-50/50 p-4 border-t border-slate-100 flex justify-between items-center text-xs">
                    <div className="text-slate-500">
                        本统计周期内
                    </div>
                    <button className="flex items-center gap-1 text-fuchsia-600 font-bold hover:underline transition-all">
                        查看详情 <ArrowRight className="w-3 h-3" />
                    </button>
                 </div>
            </div>
        </div>
    </div>
  );
};
