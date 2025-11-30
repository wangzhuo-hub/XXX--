

import React, { useState, useMemo } from 'react';
import { PaymentRecord, Tenant, ContractStatus, DepositStatus, BillingDetail } from '../types';
import { BadgeCheck, Plus, ArrowRightLeft, Check, X, AlertCircle, Banknote, Wallet, TrendingUp, ArrowDownRight, CreditCard, Trash2, Edit2, Download, Upload, FileSpreadsheet, Calendar, CheckSquare, Square, ListChecks, Clock, Receipt, RefreshCcw, RotateCcw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

interface FinanceManagerProps {
  payments: PaymentRecord[];
  tenants: Tenant[];
  onUpdatePayments: (payments: PaymentRecord[]) => void;
  onUpdateTenants: (tenants: Tenant[]) => void;
  onBatchUpdate?: (updates: { tenants?: Tenant[], payments?: PaymentRecord[] }) => void;
  getBillingDetails: (year: number, month: number) => BillingDetail[];
  onDeferPayment: (tenantId: string, year?: number, month?: number) => void;
}

export const FinanceManager: React.FC<FinanceManagerProps> = ({ payments, tenants, onUpdatePayments, onUpdateTenants, onBatchUpdate, getBillingDetails, onDeferPayment }) => {
  const [showForm, setShowForm] = useState(false);
  const [showDepositTransfer, setShowDepositTransfer] = useState(false);
  const [activeView, setActiveView] = useState<'Payments' | 'Receivables'>('Payments');
  
  // Refund Details Collapsed State
  const [isRefundDetailsOpen, setIsRefundDetailsOpen] = useState(false);
  
  // Year Filter State
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Receivable View State
  const [receivableMonth, setReceivableMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM

  // Payment State (New or Editing)
  const [currentPayment, setCurrentPayment] = useState<Partial<PaymentRecord>>({ date: new Date().toISOString().split('T')[0] });
  const [isEditing, setIsEditing] = useState(false);

  // Deposit Transfer State
  const [transferData, setTransferData] = useState({ tenantId: '', amount: 0, date: new Date().toISOString().split('T')[0] });

  const pendingRefundTenants = tenants.filter(t => 
      t.status === ContractStatus.Terminated && 
      t.depositStatus !== DepositStatus.Refunded && 
      t.depositStatus !== DepositStatus.Deducted &&
      t.depositAmount > 0
  );

  const totalPendingRefundAmount = pendingRefundTenants.reduce((sum, t) => sum + t.depositAmount, 0);

  const totalRentIncome = payments
    .filter(p => p.type === 'Rent' || p.type === 'DepositToRent')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalDepositReceived = payments
    .filter(p => p.type === 'Deposit')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalDepositRefunded = payments
    .filter(p => p.type === 'DepositRefund')
    .reduce((sum, p) => sum + Math.abs(p.amount), 0); 

  const totalDepositDeducted = payments
    .filter(p => p.type === 'DepositToRent')
    .reduce((sum, p) => sum + p.amount, 0);
    
  const currentDepositPool = totalDepositReceived - totalDepositRefunded - totalDepositDeducted;

  const depositReceivable = tenants
    .filter(t => t.depositStatus === DepositStatus.Unpaid && t.depositAmount > 0)
    .reduce((sum, t) => sum + t.depositAmount, 0);

  // Get available years for filter
  const availableYears = useMemo(() => {
      const years = new Set<number>();
      years.add(currentYear);
      payments.forEach(p => {
          // Use substring instead of Date parsing to avoid timezone shift
          // Format: YYYY-MM-DD
          if (p.date && p.date.length >= 4) {
              const year = parseInt(p.date.substring(0, 4), 10);
              if (!isNaN(year)) years.add(year);
          }
      });
      return Array.from(years).sort((a,b) => b - a);
  }, [payments, currentYear]);

  // Group payments by Month
  const groupedPayments = useMemo(() => {
      // Filter by selected year using string matching
      const filtered = payments.filter(p => p.date && p.date.startsWith(selectedYear.toString()));
      const groups: Record<string, PaymentRecord[]> = {};
      
      filtered.forEach(p => {
          // Key: YYYY-MM
          const monthKey = p.date.substring(0, 7);
          if (!groups[monthKey]) groups[monthKey] = [];
          groups[monthKey].push(p);
      });
      return groups;
  }, [payments, selectedYear]);

  // Sort months descending
  const sortedMonths = Object.keys(groupedPayments).sort((a,b) => b.localeCompare(a));


  // --- New Logic for Receivables View ---
  const currentReceivables = useMemo(() => {
      if (!receivableMonth) return [];
      // Fix Timezone Issue: Split string instead of using Date constructor
      // Date('2025-09-01') can be Aug 31st in some timezones, causing month mismatch
      const parts = receivableMonth.split('-');
      if (parts.length !== 2) return [];
      
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-based index for getBillingDetails
      
      return getBillingDetails(year, month);
  }, [receivableMonth, payments, tenants]); 

  // --- Helpers for Month Navigation ---
  const handlePrevMonth = () => {
      const parts = receivableMonth.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      
      let newYear = year;
      let newMonth = month - 1;
      if (newMonth < 1) {
          newMonth = 12;
          newYear -= 1;
      }
      setReceivableMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
      const parts = receivableMonth.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      
      let newYear = year;
      let newMonth = month + 1;
      if (newMonth > 12) {
          newMonth = 1;
          newYear += 1;
      }
      setReceivableMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  // --- Row Level Action Handlers ---

  const handleProcessRefund = (e: React.MouseEvent, tenantId: string, actionType: 'Refund' | 'Deduct') => {
      e.stopPropagation();
      e.preventDefault();

      const tenant = tenants.find(t => t.id === tenantId);
      if (!tenant || tenant.depositAmount <= 0) return;

      if (!window.confirm(actionType === 'Refund' 
          ? `确认退还押金 ¥${tenant.depositAmount.toLocaleString()} 给 ${tenant.name} 吗？`
          : `确认将押金 ¥${tenant.depositAmount.toLocaleString()} 转抵 ${tenant.name} 的租金吗？`)) return;

      const today = new Date().toISOString().split('T')[0];
      const newPayment: PaymentRecord = {
          id: `p${Date.now()}_ref_${tenantId}`,
          tenantId: tenant.id,
          tenantName: tenant.name,
          amount: actionType === 'Refund' ? -tenant.depositAmount : tenant.depositAmount,
          type: actionType === 'Refund' ? 'DepositRefund' : 'DepositToRent',
          date: today,
          status: 'Received',
          remarks: actionType === 'Refund' ? '押金退还 (Refund)' : '押金抵扣租金 (Deduct)'
      };

      const newTenant = {
          ...tenant,
          depositStatus: actionType === 'Refund' ? DepositStatus.Refunded : DepositStatus.Deducted
      };

      // Atomic update
      if (onBatchUpdate) {
          onBatchUpdate({
              payments: [...payments, newPayment],
              tenants: tenants.map(t => t.id === tenantId ? newTenant : t)
          });
      } else {
          onUpdatePayments([...payments, newPayment]);
          setTimeout(() => onUpdateTenants(tenants.map(t => t.id === tenantId ? newTenant : t)), 50);
      }
  };

  const handleConfirmCollection = (detail: BillingDetail) => {
      const amountToPay = detail.amountDue - detail.amountPaid;
      if (amountToPay <= 0) return;

      // STRICT DATE LOGIC: Payment date must match the receivable month to be counted in that period.
      // Use the 'receivableMonth' string directly (YYYY-MM) + '-15' to avoid any timezone shifts.
      const paymentDate = `${receivableMonth}-15`; 

      const newPayment: PaymentRecord = {
          id: `p${Date.now()}_col_${detail.tenantId}`,
          tenantId: detail.tenantId,
          tenantName: detail.tenantName,
          amount: amountToPay,
          type: 'Rent',
          date: paymentDate,
          status: 'Received',
          remarks: `[${receivableMonth}] 月度账单确认收款`
      };

      if (onBatchUpdate) {
          onBatchUpdate({ payments: [...payments, newPayment] });
      } else {
          onUpdatePayments([...payments, newPayment]);
      }
  };

  const handleDeferCollection = (detail: BillingDetail) => {
      if (confirm(`确定要为 ${detail.tenantName} 申请缓缴吗？\n该笔账单将推迟至下个月。`)) {
          const parts = receivableMonth.split('-');
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          onDeferPayment(detail.tenantId, year, month);
      }
  };

  // Revoke Collection (Edit Paid Status)
  const handleRevokeCollection = (detail: BillingDetail) => {
      // Find payments that contributed to this bill
      // Heuristic: Matches tenantId, Rent type, and starts with the receivable month string
      const relevantPayments = payments.filter(p => 
          p.tenantId === detail.tenantId && 
          (p.type === 'Rent' || p.type === 'DepositToRent') &&
          p.date.startsWith(receivableMonth)
      );

      if (relevantPayments.length === 0) {
          alert("未找到该月份关联的自动收款记录，无法自动撤销。请尝试在'财务收款明细'中手动查找并删除。");
          return;
      }

      const totalFound = relevantPayments.reduce((sum, p) => sum + p.amount, 0);

      if (confirm(`确定要撤销 ${detail.tenantName} 在 ${receivableMonth} 的收款状态吗？\n\n系统检测到 ${relevantPayments.length} 笔关联流水，共计 ¥${totalFound.toLocaleString()}。\n\n撤销后，这些流水将被删除，账单状态将恢复为“待缴纳”。`)) {
          const idsToRemove = new Set(relevantPayments.map(p => p.id));
          const newPayments = payments.filter(p => !idsToRemove.has(p.id));
          
          if (onBatchUpdate) {
              onBatchUpdate({ payments: newPayments });
          } else {
              onUpdatePayments(newPayments);
          }
      }
  };


  const handleSavePayment = () => {
    if (!currentPayment.tenantId || !currentPayment.amount || !currentPayment.type) {
      alert("请填写完整信息");
      return;
    }
    const tenant = tenants.find(t => t.id === currentPayment.tenantId);
    
    // Auto-adjust negative sign for refunds if user forgot
    let amount = Number(currentPayment.amount);
    if (currentPayment.type === 'DepositRefund' && amount > 0) {
        amount = -amount;
    }

    const record: PaymentRecord = {
      id: currentPayment.id || `p${Date.now()}`,
      tenantId: currentPayment.tenantId,
      tenantName: tenant?.name || currentPayment.tenantName || 'Unknown',
      amount: amount,
      type: currentPayment.type as any,
      date: currentPayment.date!,
      status: 'Received',
      remarks: currentPayment.remarks
    };

    // Logic to sync Tenant Deposit Status if manual refund/deduction entry
    let updatedTenants = undefined;
    if (tenant && !isEditing) {
        let newStatus = tenant.depositStatus;
        if (record.type === 'DepositRefund') newStatus = DepositStatus.Refunded;
        else if (record.type === 'DepositToRent') newStatus = DepositStatus.Deducted;
        // else if (record.type === 'Deposit') newStatus = DepositStatus.Paid; // Optional: mark as paid if deposit collected

        if (newStatus !== tenant.depositStatus) {
            updatedTenants = tenants.map(t => t.id === tenant.id ? { ...t, depositStatus: newStatus } : t);
        }
    }

    if (onBatchUpdate) {
        const newPayments = isEditing 
            ? payments.map(p => p.id === record.id ? record : p)
            : [record, ...payments];
        
        // FIX: Construct updates object carefully to avoid passing undefined
        const updates: any = { payments: newPayments };
        if (updatedTenants) {
            updates.tenants = updatedTenants;
        }

        onBatchUpdate(updates);
    } else {
        // Fallback for no batch update support
        if (isEditing) {
            onUpdatePayments(payments.map(p => p.id === record.id ? record : p));
        } else {
            onUpdatePayments([record, ...payments]);
        }
        if (updatedTenants) {
            onUpdateTenants(updatedTenants);
        }
    }

    setShowForm(false);
    setIsEditing(false);
    setCurrentPayment({ date: new Date().toISOString().split('T')[0] });
  };


  // ... (Keep existing helpers like edit, delete, export, import) ...
  const handleEditPayment = (payment: PaymentRecord) => {
      setCurrentPayment({
          ...payment,
          amount: payment.type === 'DepositRefund' ? Math.abs(payment.amount) : payment.amount
      });
      setIsEditing(true);
      setShowForm(true);
      setShowDepositTransfer(false);
  };

  const handleDeletePayment = (id: string) => {
      if(window.confirm("确定要删除这条收款记录吗？")) {
          onUpdatePayments(payments.filter(p => p.id !== id));
      }
  };

  const handleDepositTransfer = () => {
      if(!transferData.tenantId || !transferData.amount) return;
      const tenant = tenants.find(t => t.id === transferData.tenantId);
      if (!tenant) return;

      const rentRecord: PaymentRecord = {
          id: `p${Date.now()}_rent`,
          tenantId: transferData.tenantId,
          tenantName: tenant.name || 'Unknown',
          amount: Number(transferData.amount),
          type: 'DepositToRent',
          date: transferData.date,
          status: 'Received',
          remarks: '押金转租金'
      };

      const newTenant = { ...tenant, depositStatus: DepositStatus.Deducted };

      if (onBatchUpdate) {
          onBatchUpdate({
              payments: [rentRecord, ...payments],
              tenants: tenants.map(t => t.id === tenant.id ? newTenant : t)
          });
      } else {
          onUpdatePayments([rentRecord, ...payments]);
          onUpdateTenants(tenants.map(t => t.id === tenant.id ? newTenant : t));
      }

      setShowDepositTransfer(false);
      setTransferData({ tenantId: '', amount: 0, date: new Date().toISOString().split('T')[0] });
      alert("已录入：押金转抵租金收入，并更新客户押金状态为已抵扣。");
  };

  const handleExportCSV = () => {
      const headers = ['流水号(ID)', '付款方ID', '付款方名称', '款项类型', '金额(元)', '收款日期', '备注'];
      const rows = payments.map(p => [p.id, p.tenantId, p.tenantName, p.type, p.amount, p.date, p.remarks || '']);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Payments_Export_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          if (!text) return;
          const lines = text.split('\n');
          const newPayments: PaymentRecord[] = [];
          for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              const cols = line.split(',');
              if (cols.length < 5) continue;
              const rawId = cols[0]?.trim();
              if (payments.find(p => p.id === rawId)) continue; 
              newPayments.push({
                  id: rawId || `p${Date.now()}_imp_${i}`,
                  tenantId: cols[1]?.trim() || '',
                  tenantName: cols[2]?.trim() || 'Unknown',
                  type: cols[3]?.trim() as any || 'Other',
                  amount: Number(cols[4]),
                  date: cols[5]?.trim() || new Date().toISOString().split('T')[0],
                  status: 'Received',
                  remarks: cols[6]?.trim() || 'Imported'
              });
          }
          if (newPayments.length > 0) {
              onUpdatePayments([...payments, ...newPayments]);
              alert(`导入完成！成功: ${newPayments.length}条`);
          } else {
              alert("未找到有效的记录或文件格式不正确。");
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  return (
    <div className="space-y-6">
      
      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                  <TrendingUp size={16} className="text-blue-500" />
                  <span>累计租金收入</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">¥{totalRentIncome.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-1">不含押金</div>
          </div>
          
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                  <Wallet size={16} className="text-emerald-500" />
                  <span>在管押金池 (净额)</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">¥{currentDepositPool.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-1">已收 - 已退 - 已抵扣</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                  <CreditCard size={16} className="text-amber-500" />
                  <span>待收押金 (应收)</span>
              </div>
              <div className="text-2xl font-bold text-amber-600">¥{depositReceivable.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-1">签约未缴部分</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                  <ArrowDownRight size={16} className="text-rose-500" />
                  <span>累计退还押金</span>
              </div>
              <div className="text-2xl font-bold text-rose-600">¥{totalDepositRefunded.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-1">总支出</div>
          </div>
      </div>

      {/* Pending Refund Alert - Read Only & Collapsible */}
      {pendingRefundTenants.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden shadow-sm">
              <div 
                  className="p-4 flex justify-between items-center cursor-pointer hover:bg-amber-100/50 transition-colors"
                  onClick={() => setIsRefundDetailsOpen(!isRefundDetailsOpen)}
              >
                  <div className="flex items-center gap-3">
                      <div className="bg-amber-200/50 p-2 rounded-lg text-amber-700">
                           <AlertCircle size={20} />
                      </div>
                      <div>
                          <h3 className="text-amber-900 font-bold text-sm">待退押金提醒 (请在应收核销界面处理或录入退款流水)</h3>
                          <div className="flex items-center gap-4 text-xs text-amber-700 mt-0.5">
                              <span>共 <span className="font-bold">{pendingRefundTenants.length}</span> 家待处理</span>
                              <span>合计金额: <span className="font-bold">¥{totalPendingRefundAmount.toLocaleString()}</span></span>
                          </div>
                      </div>
                  </div>
                  <div className="text-amber-600">
                      {isRefundDetailsOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
              </div>
              
              {isRefundDetailsOpen && (
                  <div className="border-t border-amber-100 overflow-x-auto">
                      <table className="w-full text-sm text-left min-w-[600px]">
                          <thead className="bg-amber-100/30 text-amber-900 font-medium">
                              <tr>
                                  <th className="px-6 py-2">客户名称</th>
                                  <th className="px-6 py-2">退租类型</th>
                                  <th className="px-6 py-2">退租日期</th>
                                  <th className="px-6 py-2">状态</th>
                                  <th className="px-6 py-2 text-right">待退金额</th>
                                  <th className="px-6 py-2 text-right">办理</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100/50 bg-white">
                              {pendingRefundTenants.map(t => (
                                  <tr key={t.id} className="hover:bg-amber-50 transition-colors">
                                      <td className="px-6 py-3 font-medium text-slate-700">{t.name}</td>
                                      <td className="px-6 py-3 text-slate-500 text-xs">{t.terminationType === 'Early' ? '提前退租' : '正常退租'}</td>
                                      <td className="px-6 py-3 text-slate-500 font-mono text-xs">{t.terminationDate}</td>
                                      <td className="px-6 py-3 text-amber-600 text-xs font-medium">待处理</td>
                                      <td className="px-6 py-3 text-right font-bold text-amber-600">¥{t.depositAmount.toLocaleString()}</td>
                                      <td className="px-6 py-3 text-right">
                                          <div className="flex justify-end gap-2">
                                              <button 
                                                  type="button"
                                                  onClick={(e) => handleProcessRefund(e, t.id, 'Refund')}
                                                  className="px-2 py-1 bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 rounded text-xs shadow-sm"
                                              >
                                                  退款
                                              </button>
                                              <button 
                                                  type="button"
                                                  onClick={(e) => handleProcessRefund(e, t.id, 'Deduct')}
                                                  className="px-2 py-1 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded text-xs shadow-sm"
                                              >
                                                  抵扣
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      )}

      {/* Main View Toggle */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-2 gap-4">
        <div className="flex gap-4">
             <button 
                onClick={() => setActiveView('Payments')}
                className={`pb-2 px-2 text-sm font-bold flex items-center gap-2 transition-colors ${activeView === 'Payments' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
             >
                 <BadgeCheck size={18} /> 财务收款明细
             </button>
             <button 
                onClick={() => setActiveView('Receivables')}
                className={`pb-2 px-2 text-sm font-bold flex items-center gap-2 transition-colors ${activeView === 'Receivables' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
             >
                 <ListChecks size={18} /> 应收核销 (生成流水)
             </button>
        </div>

        {/* Action Toolbar */}
        {activeView === 'Payments' ? (
             <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
                 <select 
                     value={selectedYear}
                     onChange={e => setSelectedYear(Number(e.target.value))}
                     className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg px-2 py-1.5 focus:outline-none flex-1 md:flex-none"
                 >
                     {availableYears.map(y => <option key={y} value={y}>{y}年</option>)}
                 </select>
                 <label className="p-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 cursor-pointer" title="导入">
                     <Upload size={16} />
                     <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
                 </label>
                 <button onClick={handleExportCSV} className="p-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50" title="导出">
                     <Download size={16} />
                 </button>
                 <button onClick={() => { setShowDepositTransfer(true); setShowForm(false); setIsEditing(false); }} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm flex items-center gap-1 flex-1 md:flex-none justify-center">
                     <ArrowRightLeft size={14} /> 押金转租金
                 </button>
                 <button onClick={() => { setShowForm(true); setShowDepositTransfer(false); setIsEditing(false); setCurrentPayment({ date: new Date().toISOString().split('T')[0] }); }} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm flex items-center gap-1 shadow-sm flex-1 md:flex-none justify-center">
                     <Plus size={14} /> 录入流水
                 </button>
             </div>
        ) : (
             <div className="flex gap-2 items-center w-full md:w-auto justify-end">
                 <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                     <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 rounded text-slate-500">
                         <ChevronLeft size={16}/>
                     </button>
                     <div className="flex items-center gap-2 px-2 text-sm font-medium text-slate-700 w-24 justify-center">
                         <Calendar size={14} className="text-slate-400"/>
                         <span className="text-center">{receivableMonth}</span>
                     </div>
                     <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 rounded text-slate-500">
                         <ChevronRight size={16}/>
                     </button>
                 </div>
             </div>
        )}
      </div>

      {/* Forms Overlay */}
      {showForm && (
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl mb-6 flex flex-col items-start gap-4 animate-in fade-in slide-in-from-top-2">
           <div className="w-full grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label className="block text-xs font-medium text-emerald-700 mb-1">付款客户</label>
                    <select 
                    className="w-full p-2 rounded border border-emerald-200 text-sm"
                    value={currentPayment.tenantId}
                    onChange={e => setCurrentPayment({...currentPayment, tenantId: e.target.value})}
                    >
                    <option value="">选择客户...</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-emerald-700 mb-1">款项类型</label>
                    <select 
                    className="w-full p-2 rounded border border-emerald-200 text-sm"
                    value={currentPayment.type}
                    onChange={e => setCurrentPayment({...currentPayment, type: e.target.value as any})}
                    >
                    <option value="">类型...</option>
                    <option value="Rent">租金收入</option>
                    <option value="ParkingFee">月卡车位费</option>
                    <option value="Deposit">押金收取</option>
                    <option value="DepositRefund">押金退还 (支出)</option>
                    <option value="ManagementFee">物业费</option>
                    <option value="Other">其他</option>
                    <option value="DepositToRent">押金转租金</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-emerald-700 mb-1">金额 (元)</label>
                    <input 
                    type="number" 
                    className="w-full p-2 rounded border border-emerald-200 text-sm"
                    placeholder="0.00"
                    value={currentPayment.amount || ''}
                    onChange={e => setCurrentPayment({...currentPayment, amount: Number(e.target.value)})}
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-emerald-700 mb-1">入账日期</label>
                    <input 
                    type="date" 
                    className="w-full p-2 rounded border border-emerald-200 text-sm"
                    value={currentPayment.date}
                    onChange={e => setCurrentPayment({...currentPayment, date: e.target.value})}
                    />
                </div>
           </div>
           
           <div className="flex gap-2 w-full md:w-auto">
              <button onClick={handleSavePayment} className="flex-1 md:flex-none px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 flex items-center justify-center gap-1" title="确认"><Check size={18}/> 确认</button>
              <button onClick={() => { setShowForm(false); setIsEditing(false); }} className="flex-1 md:flex-none px-4 py-2 bg-white text-slate-500 border border-emerald-200 rounded hover:bg-slate-50 flex items-center justify-center gap-1" title="取消"><X size={18}/> 取消</button>
           </div>
        </div>
      )}

      {showDepositTransfer && (
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mb-6 flex flex-col items-start gap-4 animate-in fade-in slide-in-from-top-2">
           <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4">
               <div>
                    <label className="block text-xs font-medium text-indigo-700 mb-1">选择客户 (押金转租金)</label>
                    <select 
                    className="w-full p-2 rounded border border-indigo-200 text-sm"
                    onChange={e => setTransferData({...transferData, tenantId: e.target.value})}
                    >
                    <option value="">选择客户...</option>
                    {tenants.filter(t => t.depositStatus !== 'Refunded').map(t => <option key={t.id} value={t.id}>{t.name} (押金: ¥{t.depositAmount})</option>)}
                    </select>
               </div>
               <div>
                    <label className="block text-xs font-medium text-indigo-700 mb-1">抵扣金额 (元)</label>
                    <input 
                    type="number" 
                    className="w-full p-2 rounded border border-indigo-200 text-sm"
                    placeholder="0.00"
                    onChange={e => setTransferData({...transferData, amount: Number(e.target.value)})}
                    />
               </div>
               <div>
                    <label className="block text-xs font-medium text-indigo-700 mb-1">日期</label>
                    <input 
                    type="date" 
                    className="w-full p-2 rounded border border-indigo-200 text-sm"
                    value={transferData.date}
                    onChange={e => setTransferData({...transferData, date: e.target.value})}
                    />
               </div>
           </div>
           <div className="flex gap-2 w-full md:w-auto">
              <button onClick={handleDepositTransfer} className="flex-1 md:flex-none px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center justify-center gap-1" title="确认抵扣"><Check size={18}/> 确认</button>
              <button onClick={() => setShowDepositTransfer(false)} className="flex-1 md:flex-none px-4 py-2 bg-white text-slate-500 border border-indigo-200 rounded hover:bg-slate-50 flex items-center justify-center gap-1" title="取消"><X size={18}/> 取消</button>
           </div>
        </div>
      )}

      {/* Main Table Views */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {activeView === 'Payments' ? (
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[800px]">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                    <th className="px-6 py-4">流水号</th>
                    <th className="px-6 py-4">付款方</th>
                    <th className="px-6 py-4">款项类型</th>
                    <th className="px-6 py-4">金额</th>
                    <th className="px-6 py-4">收款日期</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4 text-right">操作</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {sortedMonths.length > 0 ? (
                        sortedMonths.map(monthKey => {
                            const monthPayments = groupedPayments[monthKey];
                            const monthTotal = monthPayments.reduce((sum, p) => sum + p.amount, 0);

                            return (
                                <React.Fragment key={monthKey}>
                                    {/* Month Header */}
                                    <tr className="bg-slate-50/80 border-y border-slate-100">
                                        <td colSpan={7} className="px-6 py-2">
                                            <div className="flex items-center justify-between">
                                                <div className="font-bold text-slate-700 flex items-center gap-2 text-xs">
                                                    <Calendar size={14} />
                                                    {monthKey} ({monthPayments.length}笔)
                                                </div>
                                                <div className="font-bold text-slate-700 text-xs">
                                                    月度合计: <span className={monthTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}>¥{monthTotal.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    {monthPayments.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50 group">
                                            <td className="px-6 py-4 font-mono text-xs text-slate-400">#{p.id.split('_')[0]}</td>
                                            <td className="px-6 py-4 font-medium text-slate-800">{p.tenantName}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded text-xs 
                                                    ${p.type === 'DepositToRent' ? 'bg-indigo-100 text-indigo-700' 
                                                    : p.type === 'DepositRefund' ? 'bg-rose-100 text-rose-700' 
                                                    : p.type === 'ParkingFee' ? 'bg-orange-100 text-orange-700'
                                                    : 'bg-slate-100 text-slate-600'}`}>
                                                    {p.type === 'Rent' ? '租金' 
                                                    : p.type === 'Deposit' ? '押金收取' 
                                                    : p.type === 'DepositRefund' ? '押金退还' 
                                                    : p.type === 'DepositToRent' ? '押金转租金' 
                                                    : p.type === 'ManagementFee' ? '物业费' 
                                                    : p.type === 'ParkingFee' ? '月卡车位费'
                                                    : '其他'}
                                                </span>
                                            </td>
                                            <td className={`px-6 py-4 font-medium ${p.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                {p.amount > 0 ? '+' : ''}¥{p.amount.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">{p.date}</td>
                                            <td className="px-6 py-4 text-green-600 flex items-center gap-1">
                                                <BadgeCheck size={14} /> 已入账
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEditPayment(p)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="修改">
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button onClick={() => handleDeletePayment(p.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="删除">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            );
                        })
                    ) : (
                        <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400">该年度无收款记录</td>
                        </tr>
                    )}
                </tbody>
                </table>
            </div>
        ) : (
            <div className="bg-white overflow-x-auto">
                <div className="bg-blue-50/50 p-3 border-b border-blue-100 flex items-center gap-2 text-sm text-blue-700">
                    <AlertCircle size={16} />
                    此界面根据招商预算管理数据自动生成应收账单。点击"收款"生成流水，点击"缓缴"调整账期。
                </div>
                <table className="w-full text-sm text-left min-w-[800px]">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-3">客户名称</th>
                            <th className="px-4 py-3">应收租金 (预算)</th>
                            <th className="px-4 py-3">已收金额</th>
                            <th className="px-4 py-3">待收余额</th>
                            <th className="px-4 py-3">状态</th>
                            <th className="px-4 py-3 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {currentReceivables.length > 0 ? (
                            currentReceivables.map(item => {
                                const remaining = item.amountDue - item.amountPaid;
                                const isPaid = item.status === 'Paid';
                                
                                return (
                                    <tr 
                                        key={item.tenantId} 
                                        className={`hover:bg-slate-50 transition-colors ${isPaid ? 'opacity-50' : ''}`}
                                    >
                                        <td className="px-4 py-3 font-medium text-slate-700">{item.tenantName}</td>
                                        <td className="px-4 py-3">¥{item.amountDue.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-slate-500">¥{item.amountPaid.toLocaleString()}</td>
                                        <td className="px-4 py-3 font-bold text-blue-600">
                                            {remaining > 0 ? `¥${remaining.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-xs ${isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {isPaid ? '已结清' : item.status === 'Partial' ? '部分缴纳' : '待缴纳'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {!isPaid ? (
                                                <div className="flex justify-end gap-2">
                                                    <button 
                                                        onClick={() => handleConfirmCollection(item)}
                                                        className="px-2 py-1 bg-white border border-blue-200 text-blue-600 rounded hover:bg-blue-50 text-xs flex items-center gap-1 shadow-sm"
                                                    >
                                                        <Receipt size={14} /> 收款
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeferCollection(item)}
                                                        className="px-2 py-1 bg-white border border-slate-200 text-slate-600 rounded hover:bg-slate-50 text-xs flex items-center gap-1 shadow-sm"
                                                    >
                                                        <Clock size={14} /> 缓缴
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end gap-2">
                                                    <button 
                                                        onClick={() => handleRevokeCollection(item)}
                                                        className="px-2 py-1 bg-white border border-rose-200 text-rose-600 rounded hover:bg-rose-50 text-xs flex items-center gap-1 shadow-sm"
                                                        title="撤销收款流水，重置为未缴"
                                                    >
                                                        <RotateCcw size={14} /> 撤销
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400">该月份暂无应收账单</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  );
};