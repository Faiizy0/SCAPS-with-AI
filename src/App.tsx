import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from './firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Simulation, Layer, InterfaceDefect, LAYER_TYPES } from './types';
import { generateCellImage, predictSpacePerformance } from './services/geminiService';
import Markdown from 'react-markdown';
import { 
  Plus, 
  Trash2, 
  Save, 
  Layers, 
  Settings, 
  Zap, 
  Loader2, 
  Image as ImageIcon,
  Info,
  ChevronDown,
  ChevronUp,
  Rocket,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [activeSim, setActiveSim] = useState<Simulation | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [predictingSpace, setPredictingSpace] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'simulations'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sims = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Simulation));
      setSimulations(sims);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'simulations');
    });

    return () => unsubscribe();
  }, []);

  const syncInterfaces = (layers: Layer[]): InterfaceDefect[] => {
    // Interfaces only exist between layers that are NOT contacts
    const interfaces: InterfaceDefect[] = [];
    for (let i = 0; i < layers.length - 1; i++) {
      const current = layers[i];
      const next = layers[i + 1];
      
      // Skip if either layer is a contact
      if (current.type.includes("Contact") || next.type.includes("Contact")) {
        continue;
      }
      
      interfaces.push({
        betweenLayers: `${current.type} / ${next.type}`,
        defectType: "Neutral",
        energeticDistribution: "single",
        captureCrossSectionElectron: 1e-15,
        captureCrossSectionHole: 1e-15,
        totalDensity: 1e10,
        energyLevel: 0.5
      });
    }
    return interfaces;
  };

  const createNewSimulation = () => {
    const layers: Layer[] = [
      { type: "Front Contact", material: "Al", thickness: 0.1, bandGap: 0, electronAffinity: 4.2, dielectricPermittivity: 10, cbEffectiveDensity: 2.2e18, vbEffectiveDensity: 1.8e19, electronMobility: 100, holeMobility: 50, donorDensity: 1e19, acceptorDensity: 0, metalWorkFunction: 4.28, surfaceRecombinationVelocityElectron: 1e7, surfaceRecombinationVelocityHole: 1e7 },
      { type: "Window", material: "ZnO:(Al, Ga, Sn)", thickness: 0.2, bandGap: 3.3, electronAffinity: 4.0, dielectricPermittivity: 10, cbEffectiveDensity: 2.2e18, vbEffectiveDensity: 1.8e19, electronMobility: 100, holeMobility: 50, donorDensity: 1e19, acceptorDensity: 0 },
      { type: "Buffer", material: "Zn(O, N, S)", thickness: 0.1, bandGap: 2.8, electronAffinity: 3.8, dielectricPermittivity: 10, cbEffectiveDensity: 2.2e18, vbEffectiveDensity: 1.8e19, electronMobility: 50, holeMobility: 20, donorDensity: 1e17, acceptorDensity: 0 },
      { type: "Absorber", material: "ZnSnN2", thickness: 1.5, bandGap: 1.4, electronAffinity: 3.9, dielectricPermittivity: 10, cbEffectiveDensity: 2.2e18, vbEffectiveDensity: 1.8e19, electronMobility: 10, holeMobility: 10, donorDensity: 0, acceptorDensity: 1e16, defectDensity: 1e15, defectType: "Neutral", energeticDistribution: "single", captureCrossSectionElectron: 1e-15, captureCrossSectionHole: 1e-15, energyLevel: 0.5 },
      { type: "Back Contact", material: "Ni", thickness: 0.1, bandGap: 0, electronAffinity: 4.5, dielectricPermittivity: 10, cbEffectiveDensity: 2.2e18, vbEffectiveDensity: 1.8e19, electronMobility: 100, holeMobility: 50, donorDensity: 0, acceptorDensity: 1e19, metalWorkFunction: 5.15, surfaceRecombinationVelocityElectron: 1e7, surfaceRecombinationVelocityHole: 1e7 },
      { type: "Substrate", material: "Substrate", thickness: 0.5, bandGap: 3.5, electronAffinity: 3.5, dielectricPermittivity: 5, cbEffectiveDensity: 1e18, vbEffectiveDensity: 1e18, electronMobility: 1, holeMobility: 1, donorDensity: 0, acceptorDensity: 0 }
    ];

    const newSim: Simulation = {
      name: "New Perovskite Simulation",
      description: "",
      userId: "public",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      layers,
      interfaces: syncInterfaces(layers),
      performance: {
        voc: 0,
        jsc: 0,
        ff: 0,
        pce: 0
      }
    };
    setActiveSim(newSim);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!activeSim) return;
    setLoading(true);
    try {
      const data = {
        ...activeSim,
        userId: "public",
        updatedAt: serverTimestamp()
      };
      
      if (activeSim.id) {
        const { id, ...rest } = data;
        await updateDoc(doc(db, 'simulations', id), rest);
      } else {
        const docRef = await addDoc(collection(db, 'simulations'), data);
        setActiveSim({ ...data, id: docRef.id });
      }
      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'simulations');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'simulations', id));
      if (activeSim?.id === id) setActiveSim(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'simulations');
    }
  };

  const handleGenerateImage = async () => {
    if (!activeSim) return;
    setGeneratingImage(true);
    const url = await generateCellImage(activeSim.layers);
    if (url) {
      setActiveSim({ ...activeSim, imageUrl: url });
      if (activeSim.id) {
        await updateDoc(doc(db, 'simulations', activeSim.id), { imageUrl: url, updatedAt: serverTimestamp() });
      }
    }
    setGeneratingImage(false);
  };

  const handlePredictSpace = async () => {
    if (!activeSim) return;
    setPredictingSpace(true);
    const prediction = await predictSpacePerformance(activeSim);
    if (prediction) {
      setActiveSim({ ...activeSim, spacePrediction: prediction });
      if (activeSim.id) {
        await updateDoc(doc(db, 'simulations', activeSim.id), { spacePrediction: prediction, updatedAt: serverTimestamp() });
      }
    }
    setPredictingSpace(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-8 border-b border-slate-100">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-14 h-14 bg-blue-600 rounded-[1.25rem] flex items-center justify-center text-white shadow-2xl shadow-blue-200/50 rotate-3 group hover:rotate-6 transition-transform cursor-pointer">
              <Zap className="w-8 h-8" />
            </div>
            <div>
              <h1 className="font-black text-2xl leading-none tracking-tight text-slate-900">SCAPS Simulation Research</h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-blue-600 font-black mt-1">AI project with SCAPS simulation.</p>
            </div>
          </div>
          
          <button 
            onClick={createNewSimulation}
            className="w-full flex items-center justify-center gap-3 px-6 py-4.5 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all font-bold shadow-xl shadow-slate-200 active:scale-[0.98] group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            New Simulation
          </button>

          {activeSim && (
            <button 
              onClick={handlePredictSpace}
              disabled={predictingSpace}
              className="w-full mt-4 flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all font-bold shadow-xl shadow-blue-200 active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {predictingSpace ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Rocket className="w-5 h-5 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />
              )}
              Space Predictor
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
          <div>
            <p className="px-2 text-[10px] uppercase tracking-widest text-slate-400 font-black mb-4">Recent Simulations</p>
            <div className="space-y-2">
              {simulations.map(sim => (
                <div 
                  key={sim.id}
                  onClick={() => {
                    setActiveSim(sim);
                    setIsEditing(false);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveSim(sim);
                      setIsEditing(false);
                    }
                  }}
                  className={`w-full group flex items-center justify-between p-4 rounded-2xl transition-all duration-300 cursor-pointer ${activeSim?.id === sim.id ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all duration-500 ${activeSim?.id === sim.id ? 'bg-blue-600 scale-125 shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'bg-slate-200 group-hover:bg-slate-300'}`} />
                    <span className="font-bold text-sm truncate tracking-tight">{sim.name}</span>
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(sim.id!);
                      }}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-400">
              <Info className="w-4 h-4" />
            </div>
            <p className="text-[10px] text-slate-400 font-bold leading-tight">
              v2.4.0 <br/>
              <span className="text-slate-300">Enterprise Edition</span>
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-50/50 relative">
        {activeSim ? (
          <>
            {/* Header */}
            <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-12 py-6 flex items-center justify-between">
              <div className="flex-1 min-w-0 mr-8">
                {isEditing ? (
                  <input 
                    value={activeSim.name}
                    onChange={(e) => setActiveSim({ ...activeSim, name: e.target.value })}
                    className="text-3xl font-bold bg-transparent border-b-2 border-blue-100 focus:border-blue-600 outline-none w-full transition-all text-slate-900 tracking-tight"
                    placeholder="Simulation Name"
                  />
                ) : (
                  <div className="space-y-1">
                    <h2 className="text-3xl font-bold text-slate-900 truncate tracking-tight">{activeSim.name}</h2>
                    <p className="text-xs text-slate-400 font-medium">
                      {activeSim.id ? `Last modified: ${new Date(activeSim.updatedAt?.seconds * 1000).toLocaleString()}` : "Unsaved simulation"}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {isEditing ? (
                  <>
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSave}
                      disabled={loading}
                      className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-200 disabled:opacity-50 active:scale-95"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-8 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-bold shadow-lg shadow-slate-200 active:scale-95"
                  >
                    <Settings className="w-4 h-4" />
                    Edit Simulation
                  </button>
                )}
              </div>
            </header>

            <div className="max-w-7xl mx-auto px-12 py-12 space-y-12">
              {/* Performance & Visualization Grid */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Visualization Card */}
                <div className="lg:col-span-2 bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[450px]">
                  <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-xl flex items-center gap-3 text-slate-900">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      Device Visualization
                    </h3>
                    <button 
                      onClick={handleGenerateImage}
                      disabled={generatingImage}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                    >
                      {generatingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      Regenerate View
                    </button>
                  </div>
                  <div className="flex-1 bg-slate-50 relative flex items-center justify-center p-0">
                    <DeviceVisualization layers={activeSim.layers} />
                  </div>
                  <div className="p-6 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto no-scrollbar">
                    {activeSim.layers.map((layer, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-1 shrink-0">
                        <div className={`w-12 h-2 rounded-full ${layer.type.includes('Contact') ? 'bg-blue-600' : 'bg-blue-200'}`} />
                        <span className="text-[8px] font-bold text-slate-400 uppercase">{layer.type.split(' ')[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Performance Metrics Bento */}
                <div className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-2xl flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl -mr-32 -mt-32 group-hover:bg-blue-600/30 transition-colors duration-500" />
                  <div className="relative z-10">
                    <h3 className="font-bold text-xl flex items-center gap-3 mb-10 text-blue-400">
                      <Zap className="w-5 h-5" />
                      Performance
                    </h3>
                    <div className="space-y-10">
                      {/* Main PCE Metric */}
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-black">Power Conversion Efficiency</p>
                        <div className="flex items-baseline gap-3">
                          {isEditing ? (
                            <div className="flex items-baseline gap-2 w-full">
                              <input 
                                type="number" 
                                value={activeSim.performance?.pce || 0}
                                onChange={(e) => setActiveSim({ ...activeSim, performance: { ...activeSim.performance!, pce: Number(e.target.value) } })}
                                className="w-full bg-transparent border-b-2 border-white/10 text-7xl font-bold font-mono text-white focus:outline-none focus:border-blue-500 transition-all py-1"
                              />
                              <span className="text-2xl font-bold text-white/20">%</span>
                            </div>
                          ) : (
                            <>
                              <p className="text-8xl font-bold font-mono tracking-tighter text-white leading-none">
                                {activeSim.performance?.pce || 0}
                              </p>
                              <span className="text-2xl font-bold text-white/20">%</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Sub Metrics Grid */}
                      <div className="grid grid-cols-1 gap-4">
                        {[
                          { label: 'Voc', unit: 'V', value: activeSim.performance?.voc, key: 'voc' },
                          { label: 'Jsc', unit: 'mA/cm²', value: activeSim.performance?.jsc, key: 'jsc' },
                          { label: 'Fill Factor', unit: '%', value: activeSim.performance?.ff, key: 'ff' }
                        ].map((metric) => (
                          <div key={metric.key} className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all duration-300">
                            <div className="space-y-0.5">
                              <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">{metric.label}</p>
                              <p className="text-[10px] text-white/20 font-medium">{metric.unit}</p>
                            </div>
                            <div className="text-right">
                              {isEditing ? (
                                <input 
                                  type="number" 
                                  value={metric.value || 0}
                                  onChange={(e) => setActiveSim({ 
                                    ...activeSim, 
                                    performance: { ...activeSim.performance!, [metric.key]: Number(e.target.value) } 
                                  })}
                                  className="w-24 bg-transparent border-b border-white/20 text-2xl font-bold font-mono text-white text-right focus:outline-none focus:border-blue-500 transition-all"
                                />
                              ) : (
                                <p className="text-3xl font-bold font-mono text-white tracking-tight leading-none">{metric.value || 0}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-10 pt-6 border-t border-white/5 relative z-10">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-white/20">
                      <span>Simulation Status</span>
                      <span className="text-blue-400">Optimized</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-xl mb-6 flex items-center gap-3 text-slate-900">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                      <Info className="w-4 h-4" />
                    </div>
                    Simulation Info
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-slate-400 block mb-3 font-bold">Description</label>
                      {isEditing ? (
                        <textarea 
                          value={activeSim.description}
                          onChange={(e) => setActiveSim({ ...activeSim, description: e.target.value })}
                          className="w-full p-4 rounded-2xl border border-slate-200 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none min-h-[150px] transition-all"
                          placeholder="Add simulation details..."
                        />
                      ) : (
                        <p className="text-sm text-slate-600 leading-relaxed font-medium">
                          {activeSim.description || "No description provided."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Parameters Section */}
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xl flex items-center gap-2 text-slate-900">
                    <Layers className="w-5 h-5 text-blue-600" />
                    Layer Stack Parameters
                  </h3>
                </div>

                <div className="space-y-2">
                  {activeSim.layers.filter(l => l.type !== 'Substrate').map((layer, idx) => {
                    const originalIdx = activeSim.layers.findIndex(l => l === layer);
                    return (
                      <div key={originalIdx} className="space-y-2">
                        <LayerCard 
                          layer={layer} 
                          isEditing={isEditing} 
                          onMoveUp={originalIdx > 1 && originalIdx < activeSim.layers.length - 1 ? () => {
                            const newLayers = [...activeSim.layers];
                            [newLayers[originalIdx-1], newLayers[originalIdx]] = [newLayers[originalIdx], newLayers[originalIdx-1]];
                            setActiveSim({ ...activeSim, layers: newLayers, interfaces: syncInterfaces(newLayers) });
                          } : undefined}
                          onMoveDown={originalIdx > 0 && originalIdx < activeSim.layers.length - 2 ? () => {
                            const newLayers = [...activeSim.layers];
                            [newLayers[originalIdx], newLayers[originalIdx+1]] = [newLayers[originalIdx+1], newLayers[originalIdx]];
                            setActiveSim({ ...activeSim, layers: newLayers, interfaces: syncInterfaces(newLayers) });
                          } : undefined}
                          onRemove={originalIdx > 0 && originalIdx < activeSim.layers.length - 1 ? () => {
                            const newLayers = activeSim.layers.filter((_, i) => i !== originalIdx);
                            setActiveSim({ ...activeSim, layers: newLayers, interfaces: syncInterfaces(newLayers) });
                          } : undefined}
                          onChange={(updated) => {
                            const newLayers = [...activeSim.layers];
                            newLayers[originalIdx] = updated;
                            setActiveSim({ 
                              ...activeSim, 
                              layers: newLayers,
                              interfaces: syncInterfaces(newLayers)
                            });
                          }}
                        />
                        {isEditing && originalIdx < activeSim.layers.length - 2 && (
                          <div className="flex justify-center -my-1 relative z-10">
                            <button 
                              onClick={() => {
                                const newLayer: Layer = {
                                  type: "Buffer",
                                  material: "New Layer",
                                  thickness: 0.1,
                                  bandGap: 1.5,
                                  electronAffinity: 4.0,
                                  dielectricPermittivity: 10,
                                  cbEffectiveDensity: 2.2e18,
                                  vbEffectiveDensity: 1.8e19,
                                  electronMobility: 100,
                                  holeMobility: 50,
                                  donorDensity: 0,
                                  acceptorDensity: 0,
                                  defectDensity: 1e15,
                                  defectType: "Neutral",
                                  captureCrossSectionElectron: 1e-15,
                                  captureCrossSectionHole: 1e-15,
                                  energyLevel: 0.5
                                };
                                const newLayers = [...activeSim.layers];
                                newLayers.splice(originalIdx + 1, 0, newLayer);
                                setActiveSim({ 
                                  ...activeSim, 
                                  layers: newLayers,
                                  interfaces: syncInterfaces(newLayers)
                                });
                              }}
                              className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-sm shadow-blue-200"
                              title="Insert Layer"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xl flex items-center gap-2 text-slate-900">
                    <Zap className="w-5 h-5 text-blue-600" />
                    Interface Defects
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeSim.interfaces.map((inf, idx) => (
                    <InterfaceCard 
                      key={idx} 
                      inf={inf} 
                      isEditing={isEditing} 
                      onChange={(updated) => {
                        const newInfs = [...activeSim.interfaces];
                        newInfs[idx] = updated;
                        setActiveSim({ ...activeSim, interfaces: newInfs });
                      }}
                    />
                  ))}
                </div>
              </section>

              {/* Space Environment Predictor Section */}
              {(activeSim.spacePrediction || predictingSpace) && (
                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xl flex items-center gap-2 text-slate-900 font-black">
                      <Rocket className="w-5 h-5 text-blue-600" />
                      Space Environment Predictor
                    </h3>
                  </div>

                  <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-2xl hover:border-blue-100 transition-all duration-500">
                    {predictingSpace && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-10 flex flex-col items-center justify-center gap-6">
                        <div className="relative">
                          <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
                          <Rocket className="w-6 h-6 text-blue-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                        </div>
                        <div className="text-center">
                          <p className="font-black text-slate-900 text-lg tracking-tight">Analyzing Space Environment Performance...</p>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Simulating radiation, thermal cycling, and vacuum effects</p>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform duration-500 shadow-sm shadow-blue-100">
                          <Sparkles className="w-7 h-7" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">AI Analysis Report</p>
                          <p className="text-[10px] text-blue-600 font-black uppercase tracking-[0.3em] mt-1">Powered by Gemini 3.1 Pro</p>
                        </div>
                      </div>
                      <div className="px-4 py-2 bg-slate-50 rounded-full border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status: Ready</p>
                      </div>
                    </div>

                    <div className="prose prose-slate prose-sm max-w-none prose-headings:text-slate-900 prose-headings:font-black prose-headings:tracking-tight prose-p:text-slate-600 prose-p:leading-relaxed prose-strong:text-blue-600 prose-strong:font-black prose-ul:list-disc prose-ul:pl-6">
                      <Markdown>{activeSim.spacePrediction || ""}</Markdown>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50">
            <div className="w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-600 mb-8 shadow-sm shadow-blue-100">
              <Zap className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">Solar Cell Simulator</h2>
            <p className="text-slate-500 max-w-md mb-8 font-medium leading-relaxed">
              Select an existing simulation from the sidebar or create a new one to start modeling your photovoltaic device.
            </p>
            <button 
              onClick={createNewSimulation}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-200"
            >
              <Plus className="w-5 h-5" />
              Create New Simulation
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

interface LayerCardProps {
  key?: any;
  layer: Layer;
  isEditing: boolean;
  onChange: (l: Layer) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
}

function DeviceVisualization({ layers }: { layers: Layer[] }) {
  const getLayerColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('absorber')) return '#fef08a';
    if (t.includes('buffer')) return '#d946ef';
    if (t.includes('window')) return '#4d7c0f';
    if (t.includes('substrate')) return '#0284c7';
    if (t.includes('back contact')) return '#404040';
    if (t.includes('front contact')) return '#d1d5db';
    if (t.includes('etl')) return '#60a5fa';
    if (t.includes('htl')) return '#f472b6';
    return '#94a3b8';
  };

  // Isometric projection constants
  const w = 240; // width
  const d = 120; // depth
  const startX = 100;
  
  // Calculate heights
  const layerHeights = layers.map(l => {
    if (l.type.toLowerCase().includes('contact')) return 15; // Fixed height for contacts
    return Math.max(20, Math.min(60, l.thickness * 40));
  });
  const totalHeight = layerHeights.reduce((a, b) => a + b, 0);
  const startY = Math.min(450, 500 - (500 - totalHeight) / 2 + totalHeight / 2); // Center vertically roughly

  // Calculate target Y for light rays (top of the second non-contact layer)
  const frontContactHeight = layers[0]?.type.includes('Front Contact') ? layerHeights[0] : 0;
  const firstLayerHeight = layers[1]?.type.includes('Front Contact') ? 0 : (layers[1] ? layerHeights[1] : 0);
  const topOfStackY = startY - (totalHeight - frontContactHeight);
  const targetY = topOfStackY + firstLayerHeight;

  let currentY = startY;

  return (
    <div className="relative w-full h-full flex items-center justify-center p-8 bg-gradient-to-br from-slate-100 to-slate-200/50 rounded-3xl overflow-hidden">
      {/* Background Atmosphere */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-400/10 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-400/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <svg viewBox="0 0 600 600" className="w-full h-full max-h-[450px] drop-shadow-2xl">
        {/* Sun & Spectrum Label */}
        <g transform="translate(60, 60)">
          <motion.circle 
            cx="0" cy="0" r="30" 
            fill="#fbbf24" 
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="drop-shadow-[0_0_20px_rgba(251,191,36,0.4)]"
          />
          <circle cx="0" cy="0" r="45" fill="#fbbf24" fillOpacity="0.05" />
          <text x="50" y="5" className="text-[13px] font-black fill-slate-700/80 uppercase tracking-widest" textAnchor="start">AM1.5G spectrum</text>
        </g>

        {/* Light Rays (Wavy Arrows) */}
        {[0, 1, 2].map((i) => (
          <motion.path
            key={i}
            d={`M ${60 + i * 20} 80 Q ${100 + i * 20} 120, ${150 + i * 20} 180 T ${220 + i * 20} ${targetY}`}
            fill="none"
            stroke={`url(#rayGradient${i})`}
            strokeWidth="4"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 3, repeat: Infinity, delay: i * 0.8 }}
          />
        ))}
        <defs>
          {[0, 1, 2].map(i => (
            <linearGradient key={i} id={`rayGradient${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f87171" />
            </linearGradient>
          ))}
        </defs>

        {/* Stack Layers (Bottom to Top) */}
        {[...layers].reverse().map((layer, idx) => {
          const layerIdx = layers.length - 1 - idx;
          const isFrontContact = layer.type.includes('Front Contact');
          const h = isFrontContact ? 0 : layerHeights[layerIdx];
          const color = getLayerColor(layer.type);
          const y = currentY - h;
          
          const prevY = currentY;
          currentY -= h;

          return (
            <motion.g 
              key={layerIdx}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.15, type: 'spring', stiffness: 100 }}
            >
              {!isFrontContact && (
                <>
                  {/* Front Face */}
                  <path 
                    d={`M ${startX} ${y} L ${startX + w} ${y} L ${startX + w} ${prevY} L ${startX} ${prevY} Z`}
                    fill={color}
                    stroke="rgba(0,0,0,0.05)"
                  />
                  {/* Right Face */}
                  <path 
                    d={`M ${startX + w} ${y} L ${startX + w + d} ${y - d/2} L ${startX + w + d} ${prevY - d/2} L ${startX + w} ${prevY} Z`}
                    fill={color}
                    filter="brightness(0.85)"
                    stroke="rgba(0,0,0,0.05)"
                  />
                  {/* Top Face */}
                  {(layerIdx === 0 || (layerIdx === 1 && layers[0].type.includes('Front Contact'))) && (
                    <path 
                      d={`M ${startX} ${y} L ${startX + w} ${y} L ${startX + w + d} ${y - d/2} L ${startX + d} ${y - d/2} Z`}
                      fill={color}
                      filter="brightness(1.1)"
                      stroke="rgba(0,0,0,0.05)"
                    />
                  )}
                </>
              )}

              {/* Front Contact Blocks (Al) */}
              {isFrontContact && (
                <g>
                  {/* Left Al Block */}
                  {(() => {
                    const hAl = 20;
                    const wAl = w * 0.25;
                    const yAl = y - hAl;
                    return (
                      <g>
                        <path 
                          d={`M ${startX} ${yAl} L ${startX + wAl} ${yAl} L ${startX + wAl} ${y} L ${startX} ${y} Z`}
                          fill={color}
                          stroke="rgba(0,0,0,0.1)"
                        />
                        <path 
                          d={`M ${startX + wAl} ${yAl} L ${startX + wAl + d} ${yAl - d/2} L ${startX + wAl + d} ${y - d/2} L ${startX + wAl} ${y} Z`}
                          fill={color}
                          filter="brightness(0.85)"
                          stroke="rgba(0,0,0,0.1)"
                        />
                        <path 
                          d={`M ${startX} ${yAl} L ${startX + wAl} ${yAl} L ${startX + wAl + d} ${yAl - d/2} L ${startX + d} ${yAl - d/2} Z`}
                          fill={color}
                          filter="brightness(1.1)"
                          stroke="rgba(0,0,0,0.1)"
                        />
                        <text x={startX + wAl/2} y={yAl + hAl/2 + 4} className="text-[10px] font-bold fill-slate-900/80" textAnchor="middle">Al</text>
                      </g>
                    );
                  })()}

                  {/* Right Al Block */}
                  {(() => {
                    const hAl = 20;
                    const wAl = w * 0.25;
                    const xStartRight = startX + w - wAl;
                    const yAl = y - hAl;
                    return (
                      <g>
                        <path 
                          d={`M ${xStartRight} ${yAl} L ${startX + w} ${yAl} L ${startX + w} ${y} L ${xStartRight} ${y} Z`}
                          fill={color}
                          stroke="rgba(0,0,0,0.1)"
                        />
                        <path 
                          d={`M ${startX + w} ${yAl} L ${startX + w + d} ${yAl - d/2} L ${startX + w + d} ${y - d/2} L ${startX + w} ${y} Z`}
                          fill={color}
                          filter="brightness(0.85)"
                          stroke="rgba(0,0,0,0.1)"
                        />
                        <path 
                          d={`M ${xStartRight} ${yAl} L ${startX + w} ${yAl} L ${startX + w + d} ${yAl - d/2} L ${xStartRight + d} ${yAl - d/2} Z`}
                          fill={color}
                          filter="brightness(1.1)"
                          stroke="rgba(0,0,0,0.1)"
                        />
                        <text x={xStartRight + wAl/2} y={yAl + hAl/2 + 4} className="text-[10px] font-bold fill-slate-900/80" textAnchor="middle">Al</text>
                        <text x={startX + w + d + 10} y={yAl + hAl/2} className="text-[11px] font-bold fill-slate-500 italic" textAnchor="start">Front contact</text>
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* Material labels on front face */}
              {!isFrontContact && (
                <text 
                  x={startX + w / 2} 
                  y={y + h / 2 + 5} 
                  className="text-[13px] font-black fill-slate-900/90 text-center pointer-events-none drop-shadow-sm"
                  textAnchor="middle"
                >
                  {layer.material === 'Glass/Polymer' ? 'Substrate' : layer.material}
                </text>
              )}
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}

function LayerCard({ layer, isEditing, onChange, onMoveUp, onMoveDown, onRemove }: LayerCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`bg-white rounded-3xl border transition-all duration-300 ${isOpen ? 'border-blue-200 shadow-xl shadow-blue-50 ring-1 ring-blue-100' : 'border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md'}`}>
      <div className="flex items-center">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors rounded-l-[1.5rem]"
        >
          <div className="flex items-center gap-5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm shadow-sm transition-transform duration-300 ${isOpen ? 'scale-110' : ''} ${layer.type.includes('Contact') ? 'bg-slate-900 text-white' : 'bg-blue-50 text-blue-600'}`}>
              {layer.type.charAt(0)}
            </div>
            <div className="text-left">
              <p className="text-base font-bold text-slate-900 tracking-tight">{layer.type}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{layer.material}</span>
                {!layer.type.includes('Contact') && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-200" />
                    <span className="text-[10px] text-slate-400 font-bold">{layer.thickness} µm</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isOpen ? 'bg-blue-50 text-blue-600' : 'text-slate-300'}`}>
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </button>
        
        {isEditing && (
          <div className="flex items-center pr-6 gap-1 border-l border-slate-100 ml-2 pl-4">
            <button 
              onClick={onMoveUp}
              disabled={!onMoveUp}
              className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-20 transition-all"
              title="Move Up"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <button 
              onClick={onMoveDown}
              disabled={!onMoveDown}
              className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-20 transition-all"
              title="Move Down"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <button 
              onClick={onRemove}
              disabled={!onRemove}
              className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-20 transition-all"
              title="Remove Layer"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-100 overflow-hidden"
          >
            <div className="p-10 bg-slate-50/30">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-8">
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-400 block font-bold uppercase tracking-widest">Layer Type</label>
                  {isEditing ? (
                    <select 
                      value={layer.type}
                      onChange={(e) => onChange({ ...layer, type: e.target.value })}
                      disabled={layer.type.includes("Contact")}
                      className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all disabled:opacity-50 font-bold shadow-sm"
                    >
                      {!LAYER_TYPES.includes(layer.type) && <option value={layer.type}>{layer.type}</option>}
                      {LAYER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : (
                    <p className="text-sm font-bold text-slate-700">{layer.type}</p>
                  )}
                </div>

                {layer.type.includes("Contact") ? (
                  <>
                    <ParamInput label="Metal Work Function (eV)" value={layer.metalWorkFunction || 0} type="number" isEditing={isEditing} onChange={v => onChange({ ...layer, metalWorkFunction: Number(v) })} />
                    <ParamInput label="S.R.V. Electron (m/s)" value={layer.surfaceRecombinationVelocityElectron || 0} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, surfaceRecombinationVelocityElectron: Number(v) })} />
                    <ParamInput label="S.R.V. Hole (m/s)" value={layer.surfaceRecombinationVelocityHole || 0} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, surfaceRecombinationVelocityHole: Number(v) })} />
                  </>
                ) : (
                  <>
                    <ParamInput label="Material" value={layer.material} isEditing={isEditing} onChange={v => onChange({ ...layer, material: v })} />
                    <ParamInput label="Thickness (um)" value={layer.thickness} type="number" isEditing={isEditing} onChange={v => onChange({ ...layer, thickness: Number(v) })} />
                    <ParamInput label="Bandgap (eV)" value={layer.bandGap} type="number" isEditing={isEditing} onChange={v => onChange({ ...layer, bandGap: Number(v) })} />
                    <ParamInput label="Electron Affinity (eV)" value={layer.electronAffinity} type="number" isEditing={isEditing} onChange={v => onChange({ ...layer, electronAffinity: Number(v) })} />
                    <ParamInput label="Dielectric Perm." value={layer.dielectricPermittivity} type="number" isEditing={isEditing} onChange={v => onChange({ ...layer, dielectricPermittivity: Number(v) })} />
                    <ParamInput label="CB DOS (cm^-3)" value={layer.cbEffectiveDensity} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, cbEffectiveDensity: Number(v) })} />
                    <ParamInput label="VB DOS (cm^-3)" value={layer.vbEffectiveDensity} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, vbEffectiveDensity: Number(v) })} />
                    <ParamInput label="e- Mobility (cm^2/Vs)" value={layer.electronMobility} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, electronMobility: Number(v) })} />
                    <ParamInput label="h+ Mobility (cm^2/Vs)" value={layer.holeMobility} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, holeMobility: Number(v) })} />
                    <ParamInput label="Donor Density (cm^-3)" value={layer.donorDensity} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, donorDensity: Number(v) })} />
                    <ParamInput label="Acceptor Density (cm^-3)" value={layer.acceptorDensity} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, acceptorDensity: Number(v) })} />
                    
                    <div className="col-span-full pt-4 border-t border-slate-100 mt-4">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4">Defect</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] text-slate-400 block font-bold uppercase tracking-widest">Defect Type</label>
                          {isEditing ? (
                            <select 
                              value={layer.defectType || "Neutral"} 
                              onChange={(e) => onChange({ ...layer, defectType: e.target.value as any })}
                              className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-bold shadow-sm"
                            >
                              <option>Neutral</option>
                              <option>Donor</option>
                              <option>Acceptor</option>
                            </select>
                          ) : (
                            <p className="text-sm font-bold text-slate-700">{layer.defectType || "Neutral"}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-slate-400 block font-bold uppercase tracking-widest">Energetic Distribution</label>
                          {isEditing ? (
                            <select 
                              value={layer.energeticDistribution || "single"} 
                              onChange={(e) => onChange({ ...layer, energeticDistribution: e.target.value as any })}
                              className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-bold shadow-sm"
                            >
                              <option value="single">single</option>
                              <option value="uniform">uniform</option>
                              <option value="Gau">Gau</option>
                              <option value="CB tail">CB tail</option>
                              <option value="VB tail">VB tail</option>
                            </select>
                          ) : (
                            <p className="text-sm font-bold text-slate-700">{layer.energeticDistribution || "single"}</p>
                          )}
                        </div>
                        <ParamInput label="Density (cm^-3)" value={layer.defectDensity || 0} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, defectDensity: Number(v) })} />
                        <ParamInput label="Capture e- (cm^2)" value={layer.captureCrossSectionElectron || 1e-15} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, captureCrossSectionElectron: Number(v) })} />
                        <ParamInput label="Capture h+ (cm^2)" value={layer.captureCrossSectionHole || 1e-15} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...layer, captureCrossSectionHole: Number(v) })} />
                        <ParamInput label="Energy Level (eV)" value={layer.energyLevel || 0.5} type="number" isEditing={isEditing} onChange={v => onChange({ ...layer, energyLevel: Number(v) })} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface InterfaceCardProps {
  key?: any;
  inf: InterfaceDefect;
  isEditing: boolean;
  onChange: (i: InterfaceDefect) => void;
}

function InterfaceCard({ inf, isEditing, onChange }: InterfaceCardProps) {
  return (
    <div className="bg-white p-10 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all duration-300 group">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
          <Zap className="w-4 h-4" />
        </div>
        <p className="text-xs font-bold text-slate-900 uppercase tracking-widest">
          {inf.betweenLayers}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
        <div className="space-y-2">
          <label className="text-[10px] text-slate-400 block font-bold uppercase tracking-widest">Defect Type</label>
          {isEditing ? (
            <select 
              value={inf.defectType} 
              onChange={(e) => onChange({ ...inf, defectType: e.target.value as any })}
              className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-bold shadow-sm"
            >
              <option>Neutral</option>
              <option>Donor</option>
              <option>Acceptor</option>
            </select>
          ) : (
            <p className="text-sm font-bold text-slate-700">{inf.defectType}</p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-[10px] text-slate-400 block font-bold uppercase tracking-widest">Energetic Distribution</label>
          {isEditing ? (
            <select 
              value={inf.energeticDistribution || "single"} 
              onChange={(e) => onChange({ ...inf, energeticDistribution: e.target.value as any })}
              className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-bold shadow-sm"
            >
              <option value="single">single</option>
              <option value="uniform">uniform</option>
              <option value="Gau">Gau</option>
              <option value="CB tail">CB tail</option>
              <option value="VB tail">VB tail</option>
            </select>
          ) : (
            <p className="text-sm font-bold text-slate-700">{inf.energeticDistribution || "single"}</p>
          )}
        </div>
        <ParamInput label="Density (cm^-2)" value={inf.totalDensity} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...inf, totalDensity: Number(v) })} />
        <ParamInput label="Capture e- (cm^2)" value={inf.captureCrossSectionElectron} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...inf, captureCrossSectionElectron: Number(v) })} />
        <ParamInput label="Capture h+ (cm^2)" value={inf.captureCrossSectionHole} type="number" isEditing={isEditing} scientific onChange={v => onChange({ ...inf, captureCrossSectionHole: Number(v) })} />
        <ParamInput label="Energy Level (eV)" value={inf.energyLevel} type="number" isEditing={isEditing} onChange={v => onChange({ ...inf, energyLevel: Number(v) })} />
      </div>
    </div>
  );
}

function ParamInput({ label, value, type = "text", isEditing, onChange, scientific = false }: { label: string, value: any, type?: string, isEditing: boolean, onChange: (v: string) => void, scientific?: boolean }) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const formatValue = (val: any) => {
    if (typeof val !== 'number') return val;
    return val.toExponential(1).toUpperCase();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    
    // Only propagate if it's a valid number or empty or scientific notation
    if (newVal === "" || !isNaN(Number(newVal)) || (scientific && /^[+-]?\d*\.?\d*[eE]?[+-]?\d*$/.test(newVal))) {
      onChange(newVal);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] text-slate-400 block font-bold uppercase tracking-widest">{label}</label>
      {isEditing ? (
        <input 
          type={scientific ? "text" : type} 
          value={scientific && typeof localValue === 'number' ? formatValue(localValue) : localValue} 
          onChange={handleInputChange}
          className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-bold shadow-sm"
          placeholder={scientific ? "e.g. 1.000E+18" : ""}
        />
      ) : (
        <p className="text-sm font-mono font-bold text-slate-700 tracking-tight">{formatValue(value)}</p>
      )}
    </div>
  );
}
