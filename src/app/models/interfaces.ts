// src/app/models/interfaces.ts

export interface Usuario {
  IdUsuario: string;
  Nombre: string;
  Email?: string;
  Password?: string;
  Rol: 'admin' | 'worker' | 'user';
  Username?: string;
  Telefono?: string;
  Direccion?: string;
  Status?: 'activo' | 'inactivo';
  NivelAdmin?: string;
  CreatedBy?: string;
  CreatedAt?: Date;
  // Added missing properties
  Foto_Perfil?: string;
  Correo?: string;
  Departamento?: string;
  createdBy?: string; // lowercase version also used in code
}

export interface Empresa {
  IdEmpresa: string;
  Nombre: string;
  Direccion?: string;
  Telefono?: string;
  Email?: string;
  Descripcion?: string;
  Logo?: string;
  IdUsuario?: string;
  Status?: 'activo' | 'inactivo';
  CreatedAt?: Date;
}

export interface Reporte {
  IdReporte: string;
  Tipo_Trabajo: string;
  IdUsuario: string;
  IdEmpresa?: string;
  estado: string;
  fecha: Date;
  fechaCompletado?: Date;
  fechaActualizacion?: Date;
  jobDescription?: string;
  descripcionCompletado?: string;
  location?: string;
  departamento?: string;
  priority?: string;
  materialesUtilizados?: string;
  firmaDigital?: string;
  evidenceImages?: string[];
  reporteGenerado?: boolean;
  // Campos para PDF
  pdfUrl?: string;
  reportePdfGenerado?: boolean;
  fechaGeneracionPdf?: Date;
}

export interface Task {
  id?: string;
  title: string;
  description: string;
  status: 'pending' | 'completed';
  dueDate?: Date;
  assignedTo?: string;
  priority?: 'low' | 'medium' | 'high';
  createdBy?: string;
  createdAt?: Date;
  completedAt?: Date;
  completionNotes?: string;
  attachments?: string[];
}

export interface Departamento {
  IdDepartamento?: string;
  Nombre: string;
  Descripcion?: string;
  IdEmpresa?: string;
  Status?: 'activo' | 'inactivo';
  CreatedAt?: Date;
}

export interface TipoTrabajo {
  IdTipo?: string;
  Nombre: string;
  Descripcion?: string;
  IdEmpresa?: string;
  Status?: 'activo' | 'inactivo';
  CreatedAt?: Date;
}

export interface PhotoItem {
  url: string;
  date: Date;
  name?: string;
}

export interface ReportItem {
  id?: string;
  title: string;
  description?: string;
  date: Date;
  location?: string;
  signature?: string;
  photos: PhotoItem[];
  status: 'draft' | 'submitted';
}

// Additional interfaces required by other components
export interface AppConfig {
  idioma: string;
  tema: string;
  notificaciones: boolean;
}

export interface FormStep {
  isValid: boolean;
  id: number;
  label: string;
  completed: boolean;
  current: boolean;
}

export type Department = string;