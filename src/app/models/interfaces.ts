
export interface Usuario {
  IdUsuario: string;
  Username: string;
  Nombre: string;
  Correo: string;
  Departamento: string;
  Rol: string;
  Telefono: string;
  Foto_Perfil?: string;
  NivelAdmin?: string;
  IdDepartamento?: string;
}
  
  export interface Empresa {
    IdEmpresa: string;
    Nombre: string;
    Correo: string;
    Direccion: string;
    Sector: string;
  }
  
  export interface Reporte {
    IdReporte?: string;
    IdEmpresa: string;
    IdUsuario: string;
    Tipo_Trabajo: string;
    estado: string;
    fecha: Date;
    jobDescription: string;
    location: string;
    priority: string;
    departamento: string;
    fechaCompletado?: Date;
    descripcionCompletado?: string;
    fechaActualizacion?: Date;
    materialesUtilizados?: string;
}
  
  export interface Department {
    id: string;
    name: string;
  }
  
  export interface FormStep {
    title: string;
    isValid?: boolean;
  }
  
  export interface ReportPDFData {
    trabajador: string;
    empresa: string;
    nombreReporte: string;
    ubicacion: string;
    fecha: string;
    problema: string;
    descripcion: string;
    solucion: string;
    departamento: string;
    prioridad: string;
    materialesUtilizados: string;
    codigoQR: string;
  }

