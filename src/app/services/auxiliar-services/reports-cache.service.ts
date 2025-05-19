// reports-cache.service.ts
import { Injectable } from '@angular/core';
import { Reporte, Empresa, Usuario } from '../../models/interfaces';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ReportsCacheService {
  // Cache para reportes
  private reportesCache: Map<string, Reporte[]> = new Map();
  private empresasCache: Map<string, Empresa> = new Map();
  private usuariosCache: Map<string, Usuario> = new Map();
  private departamentosCache: Set<string> = new Set();

  // Observables para notificar cambios
  private reportesSubject = new BehaviorSubject<Reporte[]>([]);
  public reportes$ = this.reportesSubject.asObservable();

  constructor() {}

  // Métodos para gestionar el caché de reportes
  setCachedReportes(key: string, reportes: Reporte[]): void {
    this.reportesCache.set(key, [...reportes]);
    this.reportesSubject.next(this.getAllCachedReportes());
    
    // Extraer departamentos únicos
    reportes.forEach(reporte => {
      if (reporte.departamento) {
        this.departamentosCache.add(reporte.departamento);
      }
    });
  }

  getCachedReportes(key: string): Reporte[] | undefined {
    return this.reportesCache.get(key);
  }

  getAllCachedReportes(): Reporte[] {
    let allReportes: Reporte[] = [];
    this.reportesCache.forEach(reportes => {
      allReportes = [...allReportes, ...reportes];
    });
    return allReportes;
  }

  clearCache(): void {
    this.reportesCache.clear();
    this.empresasCache.clear();
    this.usuariosCache.clear();
    this.reportesSubject.next([]);
  }

  // Métodos para gestionar el caché de empresas
  setCachedEmpresa(empresa: Empresa): void {
    this.empresasCache.set(empresa.IdEmpresa, empresa);
  }

  setCachedEmpresas(empresas: Empresa[]): void {
    empresas.forEach(empresa => {
      this.empresasCache.set(empresa.IdEmpresa, empresa);
    });
  }

  getCachedEmpresa(id: string): Empresa | undefined {
    return this.empresasCache.get(id);
  }

  getAllCachedEmpresas(): Empresa[] {
    return Array.from(this.empresasCache.values());
  }

  // Métodos para gestionar el caché de usuarios
  setCachedUsuario(usuario: Usuario): void {
    this.usuariosCache.set(usuario.IdUsuario, usuario);
  }

  setCachedUsuarios(usuarios: Usuario[]): void {
    usuarios.forEach(usuario => {
      this.usuariosCache.set(usuario.IdUsuario, usuario);
      if (usuario.Departamento) {
        this.departamentosCache.add(usuario.Departamento);
      }
    });
  }

  getCachedUsuario(id: string): Usuario | undefined {
    return this.usuariosCache.get(id);
  }

  getAllCachedUsuarios(): Usuario[] {
    return Array.from(this.usuariosCache.values());
  }

  // Métodos para gestionar el caché de departamentos
  getCachedDepartamentos(): string[] {
    return Array.from(this.departamentosCache);
  }

  // Verificar si el caché está inicializado
  isCacheInitialized(): boolean {
    return this.reportesCache.size > 0 && this.empresasCache.size > 0 && this.usuariosCache.size > 0;
  }
}