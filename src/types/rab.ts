export type ProjectStatus = 'DRAFT' | 'REVIEW' | 'FINAL RAB' | 'DIKERJAKAN' | 'SELESAI' | 'DIBATALKAN';
export type ProjectCategory = 'REGULER' | 'PORTOFOLIO';

export type CalcMode = 'standard' | 'wall_area' | 'frame_length' | 'glass_area' | 'opening_count' | 'trapezoid' | 'rebar' | 'rebar_structure' | 'custom_builder' | 'custom_formula';

export interface VolumeDetail {
  id: string;
  rabItemId: string;
  description: string;
  drawingRef?: string;
  multiplier: number;
  calcMode: CalcMode;
  parameters: {
    n?: number;
    p?: number;
    l?: number;
    t?: number;
    topW?: number;
    bottomW?: number;
    height?: number;
    diameter?: number;
    length?: number;
    expression?: string;
    [key: string]: unknown;
  };
  subtotal: number;
}

export interface RabItem {
  id: string;
  divisionId: string;
  code: string;
  name: string;
  unit: string;
  volume: number;
  isVolumeFromBackup: boolean;
  unitPrice: number;
  totalPrice: number;
  backupDetails: VolumeDetail[];
}

export interface RabDivision {
  id: string;
  projectId: string;
  code: string;
  name: string;
  items: RabItem[];
}

export interface Project {
  id: string;
  title: string;
  client: string;
  location: string;
  updatedAt: string;
  status: ProjectStatus;
  project_category: ProjectCategory;
  totalValue: number;
  taxRate: number;
  profitMargin: number;
  divisions: RabDivision[];
}
