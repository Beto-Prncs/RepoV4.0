// src/app/models/interfaces.ts

export interface Usuario {
  IdUsuario: string;
  Nombre: string;
  Rol: 'admin' | 'worker' | 'user'; // No empty string allowed
  Email?: string;
  Password?: string;
  Username?: string;
  Telefono?: string;
  Direccion?: string;
  Status?: 'activo' | 'inactivo';
  NivelAdmin?: string;
  CreatedBy?: string;
  CreatedAt?: Date;
  Foto_Perfil?: string;
  Correo?: string;
  Departamento?: string;
  createdBy?: string;
}

export interface Empresa {
  IdEmpresa: string;
  Nombre: string;
  Direccion?: string;
  Telefono?: string;
  Email?: string;
  Correo?: string;
  Descripcion?: string;
  Logo?: string;
  IdUsuario?: string;
  Status?: 'activo' | 'inactivo';
  CreatedAt?: Date;
  Sector?: string;
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
  IdDepartamento: string;
  Nombre: string;
  Descripcion?: string;
  IdEmpresa?: string;
  Status?: 'activo' | 'inactivo';
  CreatedAt?: Date;
  id?: string; // Added for compatibility with template
  name?: string; // Added for compatibility with template
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

// Added FormStep interface that was missing
export interface FormStep {
  id: number;
  label: string;
  title: string; // Added this to fix template errors
  completed: boolean;
  current: boolean;
  isValid: boolean; // Added this to fix template errors
}

// Additional interfaces required by other components
export interface AppConfig {
  name: string;
  idioma?: string;
  language: string;
  timezone: string;
  tema?: string;
  theme: string;
  textSize: number;
  autoSave: boolean;
  currency: string;
  dateFormat: string;
  autoLogout: boolean;
  autoLogoutTime: string;
  debugMode: boolean;
  notificaciones?: boolean;
}

// For backward compatibility
export type Department = Departamento;