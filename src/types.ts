export interface Layer {
  type: string;
  material: string;
  thickness: number;
  bandGap: number;
  electronAffinity: number;
  dielectricPermittivity: number;
  cbEffectiveDensity: number;
  vbEffectiveDensity: number;
  electronMobility: number;
  holeMobility: number;
  donorDensity: number;
  acceptorDensity: number;
  defectDensity?: number;
  defectType?: 'Neutral' | 'Donor' | 'Acceptor';
  captureCrossSectionElectron?: number;
  captureCrossSectionHole?: number;
  energyLevel?: number;
  energeticDistribution?: 'single' | 'uniform' | 'Gau' | 'CB tail' | 'VB tail';
  surfaceRecombinationVelocityElectron?: number;
  surfaceRecombinationVelocityHole?: number;
  metalWorkFunction?: number;
}

export interface InterfaceDefect {
  betweenLayers: string;
  defectType: 'Neutral' | 'Donor' | 'Acceptor';
  captureCrossSectionElectron: number;
  captureCrossSectionHole: number;
  totalDensity: number;
  energyLevel: number;
  energeticDistribution: 'single' | 'uniform' | 'Gau' | 'CB tail' | 'VB tail';
}

export interface Simulation {
  id?: string;
  name: string;
  description?: string;
  createdAt: any;
  updatedAt: any;
  userId: string;
  layers: Layer[];
  interfaces: InterfaceDefect[];
  imageUrl?: string;
  performance?: {
    voc: number;
    jsc: number;
    ff: number;
    pce: number;
  };
  spacePrediction?: string;
}

export const LAYER_TYPES = [
  "Window",
  "Buffer",
  "Absorber",
  "ETL",
  "HTL",
  "Interconnection"
];
