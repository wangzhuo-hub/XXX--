
import React, { useState } from 'react';
import { Building, Unit, UnitStatus, Tenant } from '../types';
import { Plus, Trash2, Edit2, Home, Info, X, Users, Scissors, Coffee, Car } from 'lucide-react';

interface BuildingManagerProps {
  buildings: Building[];
  tenants: Tenant[];
  onUpdateBuildings: (buildings: Building[]) => void;
}

export const BuildingManager: React.FC<BuildingManagerProps> = ({ buildings, tenants, onUpdateBuildings }) => {
  const [activeBuildingId, setActiveBuildingId] = useState<string>(buildings[0]?.id || '');
  
  // Modals state
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [isBuildingModalOpen, setIsBuildingModalOpen] = useState(false);
  
  // Current editing state
  const [editingUnit, setEditingUnit] = useState<Partial<Unit> & { isNew?: boolean }>({});
  const [editingBuilding, setEditingBuilding] = useState<Partial<Building> & { isNew?: boolean }>({});

  // Split Unit State
  const [showSplitForm, setShowSplitForm] = useState(false);
  const [splitData, setSplitData] = useState({ currentArea: 0, newUnitName: '' });

  const activeBuilding = buildings.find(b => b.id === activeBuildingId);

  // Calculate stats for active building
  const buildingStats = activeBuilding ? (() => {
      const totalUnits = activeBuilding.units.length;
      // Calculate Total Leasable Area (Total - SelfUse)
      const totalArea = activeBuilding.units.reduce((s, u) => s + u.area, 0);
      const selfUseArea = activeBuilding.units.filter(u => u.isSelfUse).reduce((s, u) => s + u.area, 0);
      const leasableArea = totalArea - selfUseArea;

      // Occupied Area (excluding self use from occupied, although conceptually self-use is occupied, but for stats it's removed from both)
      const occupiedUnits = activeBuilding.units.filter(u => u.status === UnitStatus.Occupied && !u.isSelfUse);
      const occupiedArea = occupiedUnits.reduce((s, u) => s + u.area, 0);
      
      const rate = leasableArea > 0 ? (occupiedArea / leasableArea * 100).toFixed(1) : '0.0';
      return { totalUnits, totalArea, leasableArea, occupiedArea, rate, selfUseArea };
  })() : null;

  // Group units by floor
  const unitsByFloor = activeBuilding?.units.reduce((acc, unit) => {
    if (!acc[unit.floor]) acc[unit.floor] = [];
    acc[unit.floor].push(unit);
    return acc;
  }, {} as Record<number, Unit[]>) || {};

  const handleStatusColor = (status: UnitStatus) => {
    switch (status) {
      case UnitStatus.Occupied: return 'bg-blue-100 border-blue-300 text-blue-700';
      case UnitStatus.Reserved: return 'bg-amber-100 border-amber-300 text-amber-700';
      default: return 'bg-slate-50 border-slate-200 text-slate-500 hover:border-blue-400';
    }
  };

  // Determine size class based on area - Only Width (Col Span) changes, Height is fixed
  // Mobile: Smaller base grid means span-1 is larger relative to screen
  const getSizeClass = (area: number) => {
      if (area >= 1000) return 'col-span-full'; // Whole floor or massive unit spans entire row
      if (area >= 300) return 'col-span-2 md:col-span-3'; // Large
      if (area >= 150) return 'col-span-2'; // Medium
      return 'col-span-1'; // Small
  };

  // --- Building Handlers ---
  const openAddBuilding = () => {
    setEditingBuilding({ name: '', isNew: true });
    setIsBuildingModalOpen(true);
  };

  const openEditBuilding = () => {
    if (!activeBuilding) return;
    setEditingBuilding({ ...activeBuilding, isNew: false });
    setIsBuildingModalOpen(true);
  };

  const saveBuilding = () => {
    if (!editingBuilding.name) {
       alert("请输入楼宇名称"); 
       return;
    }

    if (editingBuilding.isNew) {
      const newBuilding: Building = {
        id: `b${Date.now()}`,
        name: editingBuilding.name,
        units: []
      };
      onUpdateBuildings([...buildings, newBuilding]);
      setActiveBuildingId(newBuilding.id);
    } else {
      const updated = buildings.map(b => b.id === editingBuilding.id ? { ...b, name: editingBuilding.name! } : b);
      onUpdateBuildings(updated);
    }
    setIsBuildingModalOpen(false);
  };

  const handleDeleteBuilding = (id: string) => {
    if (window.confirm("确定要删除整栋楼宇吗？此操作不可恢复。")) {
      const newBuildings = buildings.filter(b => b.id !== id);
      onUpdateBuildings(newBuildings);
      if (activeBuildingId === id && newBuildings.length > 0) {
        setActiveBuildingId(newBuildings[0].id);
      }
    }
  };

  // --- Unit Handlers ---
  const openAddUnit = () => {
    setEditingUnit({ 
        name: '', 
        floor: 1, 
        area: 100, 
        status: UnitStatus.Vacant, 
        isSelfUse: false,
        isNew: true 
    });
    setShowSplitForm(false);
    setIsUnitModalOpen(true);
  };

  const openEditUnit = (unit: Unit) => {
    setEditingUnit({ ...unit, isNew: false });
    setShowSplitForm(false);
    // Initial split state based on current unit
    setSplitData({ currentArea: unit.area, newUnitName: `${unit.name}-B` });
    setIsUnitModalOpen(true);
  };

  const saveUnit = () => {
    if (!activeBuilding) return;
    if (!editingUnit.name || !editingUnit.area || !editingUnit.floor) {
        alert("请填写完整的单元信息");
        return;
    }

    const newUnitData: Unit = {
        id: editingUnit.id || `${activeBuilding.id}-${editingUnit.name}`,
        name: editingUnit.name,
        floor: Number(editingUnit.floor),
        area: Number(editingUnit.area),
        status: editingUnit.status || UnitStatus.Vacant,
        isSelfUse: editingUnit.isSelfUse || false,
    };

    const updatedBuildings = buildings.map(b => {
        if (b.id === activeBuilding.id) {
            let newUnits;
            if (editingUnit.isNew) {
                // Check duplicate ID
                if (b.units.some(u => u.id === newUnitData.id)) {
                    alert("单元ID已存在，请修改房号");
                    return b;
                }
                newUnits = [...b.units, newUnitData];
            } else {
                newUnits = b.units.map(u => u.id === editingUnit.id ? newUnitData : u);
            }
            // Sort units by name
            newUnits.sort((x, y) => x.name.localeCompare(y.name));
            return { ...b, units: newUnits };
        }
        return b;
    });

    onUpdateBuildings(updatedBuildings);
    setIsUnitModalOpen(false);
  };

  const handleSplitUnit = () => {
      if (!activeBuilding || !editingUnit.id) return;
      if (splitData.currentArea >= (editingUnit.area || 0)) {
          alert("拆分后的当前单元面积必须小于原面积");
          return;
      }
      if (!splitData.newUnitName) {
          alert("请输入新单元名称");
          return;
      }
      
      const originalArea = editingUnit.area || 0;
      const remainingArea = originalArea - splitData.currentArea;

      // 1. Update current unit (keep ID to preserve contracts)
      const updatedOriginalUnit: Unit = {
          ...editingUnit as Unit,
          area: splitData.currentArea
      };

      // 2. Create new unit (Vacant)
      const newUnit: Unit = {
          id: `${activeBuilding.id}-${splitData.newUnitName}`,
          name: splitData.newUnitName,
          floor: editingUnit.floor || 1,
          area: remainingArea,
          status: UnitStatus.Vacant,
          isSelfUse: false
      };

      const updatedBuildings = buildings.map(b => {
          if (b.id === activeBuilding.id) {
              // Replace original and add new
              const newUnits = b.units.map(u => u.id === editingUnit.id ? updatedOriginalUnit : u);
              newUnits.push(newUnit);
              newUnits.sort((x, y) => x.name.localeCompare(y.name));
              return { ...b, units: newUnits };
          }
          return b;
      });

      onUpdateBuildings(updatedBuildings);
      alert(`拆分成功！\n原单元面积更新为: ${splitData.currentArea}㎡\n新增单元: ${newUnit.name} (${newUnit.area}㎡)`);
      setIsUnitModalOpen(false);
  };

  const handleDeleteUnit = () => {
    if (!activeBuilding || !editingUnit.id) return;
    if (window.confirm("确定删除该单元？")) {
       const updatedBuildings = buildings.map(b => {
          if (b.id === activeBuilding.id) {
              return { ...b, units: b.units.filter(u => u.id !== editingUnit.id) };
          }
          return b;
       });
       onUpdateBuildings(updatedBuildings);
       setIsUnitModalOpen(false);
    }
  };

  // Helper to find tenant for editing unit
  const activeTenantForUnit = tenants.find(t => 
    editingUnit.id && t.unitIds.includes(editingUnit.id) && t.status === 'Active'
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Building2Icon /> 楼宇资产销控表
        </h2>
        <button 
          onClick={openAddBuilding}
          className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm md:text-base"
        >
          <Plus size={16} /> <span className="hidden md:inline">新增楼宇</span><span className="md:hidden">新增</span>
        </button>
      </div>

      {/* Building Tabs - Scrollable on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-200 scrollbar-hide">
        {buildings.map(b => {
             const bTotal = b.units.reduce((s,u) => s+u.area, 0);
             const bSelfUse = b.units.filter(u => u.isSelfUse).reduce((s, u) => s + u.area, 0);
             const bLeasable = bTotal - bSelfUse;
             const bOcc = b.units.filter(u => u.status === UnitStatus.Occupied && !u.isSelfUse).reduce((s,u) => s+u.area, 0);
             const rate = bLeasable > 0 ? Math.round((bOcc/bLeasable)*100) : 0;
             
             return (
                <button
                    key={b.id}
                    onClick={() => setActiveBuildingId(b.id)}
                    className={`px-4 py-3 md:px-5 rounded-t-lg font-medium transition-colors flex flex-col items-start gap-1 min-w-[120px] md:min-w-[140px] flex-shrink-0 ${
                    activeBuildingId === b.id 
                        ? 'bg-white border-x border-t border-slate-200 text-blue-600 relative top-[1px]' 
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <Home size={16} />
                        <span className="truncate max-w-[80px] md:max-w-none">{b.name}</span>
                    </div>
                    <span className="text-xs bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">出租率: {rate}%</span>
                </button>
            );
        })}
      </div>

      {/* Controls & Legend */}
      {activeBuilding && buildingStats && (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-100 pb-4">
             <div>
                 <div className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-3">
                    <div className="flex items-center gap-2">
                        <h3 className="text-xl md:text-2xl font-bold text-slate-800">{activeBuilding.name}</h3>
                        <button onClick={openEditBuilding} className="text-slate-400 hover:text-blue-600 p-1"><Edit2 size={14}/></button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:gap-3 text-sm text-slate-500">
                        <span>总面积: {buildingStats.totalArea}㎡</span>
                        <span className="hidden md:inline w-px h-3 bg-slate-300"></span>
                        <span className={buildingStats.selfUseArea > 0 ? 'text-slate-800 font-medium' : ''}>
                            可租: {buildingStats.leasableArea}㎡
                        </span>
                        {buildingStats.selfUseArea > 0 && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-1 rounded border border-gray-200">
                                含自用 {buildingStats.selfUseArea}㎡
                            </span>
                        )}
                        <span className="hidden md:inline w-px h-3 bg-slate-300"></span>
                        <span>出租率: <strong className="text-blue-600">{buildingStats.rate}%</strong></span>
                    </div>
                 </div>
             </div>
             
             <div className="flex gap-2 w-full md:w-auto">
                 <button onClick={openAddUnit} className="flex-1 md:flex-none justify-center text-sm px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 font-medium flex items-center gap-1">
                    <Plus size={14} /> 新增单元
                 </button>
                 <button onClick={() => handleDeleteBuilding(activeBuilding.id)} className="flex-1 md:flex-none justify-center text-sm px-3 py-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50 flex items-center gap-1">
                    <Trash2 size={14} /> 删除楼宇
                 </button>
            </div>
          </div>

          <div className="flex gap-4 text-xs mb-6 overflow-x-auto pb-2 scrollbar-hide">
               <div className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
                 <div className="w-8 h-8 bg-slate-50 border border-slate-200 rounded"></div>
                 <span>待租</span>
               </div>
               <div className="flex items-center gap-1.5 ml-2 whitespace-nowrap flex-shrink-0">
                 <div className="w-8 h-8 bg-blue-100 border border-blue-300 rounded"></div>
                 <span>已租</span>
               </div>
               <div className="flex items-center gap-1.5 ml-2 whitespace-nowrap flex-shrink-0">
                 <div className="w-8 h-8 bg-gray-200 border border-gray-300 rounded opacity-75"></div>
                 <span>自用</span>
               </div>
               <div className="flex items-center gap-1.5 ml-2 whitespace-nowrap flex-shrink-0">
                  <div className="flex items-center text-slate-500 bg-slate-100 rounded px-1"><Car size={10} /></div>
                  <span>车位</span>
               </div>
          </div>

          <div className="space-y-6">
            {Object.keys(unitsByFloor).sort((a,b) => Number(b) - Number(a)).map(floor => (
              <div key={floor} className="flex gap-2 md:gap-4">
                <div className="w-8 md:w-12 h-[80px] flex-shrink-0 flex items-center justify-center font-bold text-slate-500 bg-slate-100 rounded-lg text-sm md:text-base">
                  {floor}F
                </div>
                {/* 
                   Grid Layout Updated for Mobile:
                   - grid-cols-3 (Mobile)
                   - sm:grid-cols-4 (Small Tablet)
                   - md:grid-cols-6 (Tablet)
                   - lg:grid-cols-12 (Desktop)
                   auto-rows-[80px] ensures consistent height
                */}
                <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 auto-rows-[80px] gap-2 md:gap-3 grid-flow-dense">
                  {unitsByFloor[Number(floor)].map(unit => {
                    const tenant = tenants.find(t => t.unitIds.includes(unit.id) && t.status === 'Active');
                    const isSelfUse = unit.isSelfUse;
                    const hasParking = tenant && ((tenant.contractParkingSpaces || 0) > 0 || (tenant.actualParkingSpaces || 0) > 0);

                    return (
                        <div 
                        key={unit.id}
                        onClick={() => openEditUnit(unit)}
                        className={`relative p-2 md:p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md group flex flex-col justify-between overflow-hidden
                            ${isSelfUse 
                                ? 'bg-gray-100 border-gray-200 text-gray-500 hover:border-gray-300' 
                                : handleStatusColor(unit.status)} 
                            ${getSizeClass(unit.area)}
                        `}
                        >
                        <div className="flex justify-between items-start">
                            <span className="font-bold text-sm md:text-lg truncate pr-1">{unit.name}</span>
                            <div className="flex gap-1">
                                {isSelfUse && <span title="自用" className="text-gray-400"><Coffee size={12}/></span>}
                                {tenant?.specialRequirements && !isSelfUse && (
                                <span title="有特殊备注">
                                    <Info size={12} className="text-blue-500" />
                                </span>
                                )}
                            </div>
                        </div>
                        
                        <div className="mt-1 flex flex-col justify-end">
                            <div className="flex justify-between items-end">
                                <div className="min-w-0">
                                    <div className="text-[10px] md:text-xs opacity-75">{unit.area} ㎡</div>
                                    <div className="text-[10px] md:text-xs font-medium truncate w-full" title={isSelfUse ? '自用' : tenant?.name}>
                                        {isSelfUse ? '自用保留' : (unit.status === UnitStatus.Vacant ? '待租' : tenant?.name || '已租')}
                                    </div>
                                </div>
                                {hasParking && !isSelfUse && (
                                    <div className="text-[10px] text-slate-500 flex items-center gap-0.5 bg-white/50 rounded px-1 mb-0.5 hidden sm:flex" title={`车位: 约定${tenant.contractParkingSpaces} / 实际${tenant.actualParkingSpaces}`}>
                                        <Car size={10} /> 
                                        <span>{tenant?.actualParkingSpaces || 0}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/50 rounded pointer-events-none">
                            <span className="p-1 rounded shadow-sm text-xs hover:bg-white">
                                <Edit2 size={10} />
                            </span>
                        </div>
                        </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {activeBuilding.units.length === 0 && (
                <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    暂无单元数据，请点击右上角新增单元
                </div>
            )}
          </div>
        </div>
      )}

      {/* Building Edit Modal */}
      {isBuildingModalOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-50 duration-200">
                 <div className="flex justify-between items-center mb-4">
                     <h3 className="text-lg font-bold">{editingBuilding.isNew ? '新增楼宇' : '编辑楼宇'}</h3>
                     <button onClick={() => setIsBuildingModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
                 </div>
                 <div className="space-y-4">
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">楼宇名称</label>
                         <input 
                            type="text" 
                            className="w-full border rounded-lg p-2" 
                            value={editingBuilding.name}
                            onChange={e => setEditingBuilding({...editingBuilding, name: e.target.value})}
                            placeholder="例如: 5号楼"
                         />
                     </div>
                     <div className="flex justify-end pt-2">
                         <button onClick={saveBuilding} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 w-full md:w-auto">保存</button>
                     </div>
                 </div>
             </div>
         </div>
      )}

      {/* Unit Edit Modal */}
      {isUnitModalOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in-50 duration-200 overflow-y-auto max-h-[90vh]">
                 <div className="flex justify-between items-center mb-4 border-b pb-2">
                     <h3 className="text-lg font-bold">{editingUnit.isNew ? '新增单元' : `编辑单元 ${editingUnit.name}`}</h3>
                     <button onClick={() => setIsUnitModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
                 </div>
                 
                 <div className="space-y-4">
                     {/* Row 1 */}
                     <div className="grid grid-cols-2 gap-4">
                         <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">房号/名称</label>
                             <input 
                                type="text" 
                                className="w-full border rounded-lg p-2" 
                                value={editingUnit.name}
                                onChange={e => setEditingUnit({...editingUnit, name: e.target.value})}
                                // removed disabled attribute to allow editing name of existing units
                             />
                         </div>
                         <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">楼层</label>
                             <input 
                                type="number" 
                                className="w-full border rounded-lg p-2" 
                                value={editingUnit.floor}
                                onChange={e => setEditingUnit({...editingUnit, floor: Number(e.target.value)})}
                             />
                         </div>
                     </div>
                     {/* Row 2 */}
                     <div className="grid grid-cols-2 gap-4">
                         <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">面积 (㎡)</label>
                             <input 
                                type="number" 
                                className="w-full border rounded-lg p-2" 
                                value={editingUnit.area}
                                onChange={e => setEditingUnit({...editingUnit, area: Number(e.target.value)})}
                             />
                         </div>
                         <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                             <select 
                                className="w-full border rounded-lg p-2"
                                value={editingUnit.status}
                                onChange={e => setEditingUnit({...editingUnit, status: e.target.value as UnitStatus})}
                                disabled={editingUnit.status === UnitStatus.Occupied} // Occupied is controlled by contracts
                             >
                                 <option value={UnitStatus.Vacant}>空置</option>
                                 <option value={UnitStatus.Occupied}>已租 (由合同控制)</option>
                                 <option value={UnitStatus.Reserved}>预留</option>
                             </select>
                         </div>
                     </div>

                     {/* Self Use Toggle */}
                     <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <div className="flex items-center h-5">
                            <input
                                id="isSelfUse"
                                type="checkbox"
                                checked={editingUnit.isSelfUse || false}
                                onChange={e => setEditingUnit({...editingUnit, isSelfUse: e.target.checked})}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                        </div>
                        <div className="text-sm">
                            <label htmlFor="isSelfUse" className="font-medium text-gray-700">设为自用单元</label>
                            <p className="text-xs text-gray-500">自用单元将从可租赁面积、出租率统计及营收目标中剔除。</p>
                        </div>
                     </div>
                     
                     {/* Split Unit Section */}
                     {!editingUnit.isNew && (
                         <div className="border-t border-dashed pt-3 mt-1">
                             <div className="flex justify-between items-center mb-2">
                                <button 
                                    onClick={() => setShowSplitForm(!showSplitForm)} 
                                    className="text-xs font-semibold text-blue-600 flex items-center gap-1 hover:underline"
                                >
                                    <Scissors size={12} /> {showSplitForm ? '取消拆分' : '拆分此单元'}
                                </button>
                             </div>
                             
                             {showSplitForm && (
                                 <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm space-y-3 animate-in slide-in-from-top-2">
                                     <p className="text-xs text-slate-500">将此单元拆分为两部分。原ID保留给"保留面积"部分。</p>
                                     <div className="grid grid-cols-2 gap-3">
                                         <div>
                                             <label className="block text-xs font-medium text-slate-600 mb-1">保留面积 (原单元)</label>
                                             <input 
                                                type="number" 
                                                className="w-full p-1.5 border rounded"
                                                value={splitData.currentArea}
                                                onChange={e => setSplitData({...splitData, currentArea: Number(e.target.value)})}
                                             />
                                         </div>
                                         <div>
                                             <label className="block text-xs font-medium text-slate-600 mb-1">拆分出的新单元名称</label>
                                             <input 
                                                type="text" 
                                                className="w-full p-1.5 border rounded"
                                                value={splitData.newUnitName}
                                                onChange={e => setSplitData({...splitData, newUnitName: e.target.value})}
                                             />
                                         </div>
                                     </div>
                                     <div className="flex justify-between items-center bg-blue-50 p-2 rounded text-blue-700 text-xs font-medium">
                                         <span>新单元面积: {(editingUnit.area || 0) - splitData.currentArea} ㎡</span>
                                         <button onClick={handleSplitUnit} className="bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">确认拆分</button>
                                     </div>
                                 </div>
                             )}
                         </div>
                     )}

                     {/* Active Tenant Info */}
                     {activeTenantForUnit && !editingUnit.isSelfUse && (
                         <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm">
                             <div className="flex items-center gap-2 mb-2 font-semibold text-blue-800">
                                 <Users size={16} /> 当前租户
                             </div>
                             <p><span className="text-blue-600">企业:</span> {activeTenantForUnit.name}</p>
                             <p><span className="text-blue-600">租期:</span> {activeTenantForUnit.leaseStart} ~ {activeTenantForUnit.leaseEnd}</p>
                             {activeTenantForUnit.specialRequirements && (
                                 <div className="mt-2 pt-2 border-t border-blue-200 text-amber-700">
                                     <p className="font-semibold flex items-center gap-1"><Info size={12}/> 特殊要求备注:</p>
                                     <p className="mt-1 bg-white/50 p-2 rounded">{activeTenantForUnit.specialRequirements}</p>
                                 </div>
                             )}
                             {(activeTenantForUnit.contractParkingSpaces || 0) > 0 || (activeTenantForUnit.actualParkingSpaces || 0) > 0 ? (
                                 <div className="mt-2 pt-2 border-t border-blue-200 text-slate-700 flex items-center gap-2">
                                     <Car size={14} className="text-orange-500"/>
                                     <span>车位: 约定 {activeTenantForUnit.contractParkingSpaces || 0} / 实际 {activeTenantForUnit.actualParkingSpaces || 0} 个</span>
                                 </div>
                             ) : null}
                         </div>
                     )}

                     <div className="flex justify-between pt-4 border-t mt-2 gap-4">
                         {!editingUnit.isNew ? (
                            <button onClick={handleDeleteUnit} className="text-red-500 hover:text-red-700 text-sm flex items-center gap-1">
                                <Trash2 size={16} /> 删除
                            </button>
                         ) : <div></div>}
                         <div className="flex gap-2">
                            <button onClick={() => setIsUnitModalOpen(false)} className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">取消</button>
                            <button onClick={saveUnit} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">保存</button>
                         </div>
                     </div>
                 </div>
             </div>
         </div>
      )}
    </div>
  );
};

const Building2Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
);
