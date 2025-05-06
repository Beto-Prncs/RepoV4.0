/**
 * Servicio para manejar el estado de la configuración
 * Ayuda a separar la lógica de gestión de estado del componente principal
 */
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Departamento, Empresa } from '../../models/interfaces';

@Injectable()
export class ConfigStateService {
  // Estados compartidos
  private loadingState = new BehaviorSubject<boolean>(false);
  private errorState = new BehaviorSubject<string>('');
  private successState = new BehaviorSubject<string>('');

  // Observables públicos
  public loading$ = this.loadingState.asObservable();
  public error$ = this.errorState.asObservable();
  public success$ = this.successState.asObservable();

  // Métodos de acceso al estado
  setLoading(isLoading: boolean): void {
    this.loadingState.next(isLoading);
  }

  setError(message: string): void {
    this.errorState.next(message);
    
    // Auto-desaparecer después de 5 segundos
    if (message) {
      setTimeout(() => {
        if (this.errorState.getValue() === message) {
          this.clearError();
        }
      }, 5000);
    }
  }

  setSuccess(message: string): void {
    this.successState.next(message);
    
    // Auto-desaparecer después de 3 segundos
    if (message) {
      setTimeout(() => {
        if (this.successState.getValue() === message) {
          this.clearSuccess();
        }
      }, 3000);
    }
  }

  clearError(): void {
    this.errorState.next('');
  }

  clearSuccess(): void {
    this.successState.next('');
  }

  clearMessages(): void {
    this.clearError();
    this.clearSuccess();
  }

  /**
   * Procesa una lista de departamentos para actualizar contadores
   * @param departments Lista de departamentos
   * @returns Número de departamentos
   */
  processDepartmentList(departments: Departamento[]): number {
    return departments ? departments.length : 0;
  }

  /**
   * Procesa una lista de empresas para actualizar contadores
   * @param companies Lista de empresas
   * @returns Número de empresas
   */
  processCompanyList(companies: Empresa[]): number {
    return companies ? companies.length : 0;
  }

  /**
   * Filtra una lista de departamentos basado en un término de búsqueda
   * @param departments Lista de departamentos
   * @param searchTerm Término de búsqueda
   * @returns Lista filtrada de departamentos
   */
  filterDepartments(departments: Departamento[], searchTerm: string): Departamento[] {
    if (!searchTerm || !departments?.length) return departments || [];
    
    const term = searchTerm.toLowerCase().trim();
    
    return departments.filter(dept => 
      dept.Nombre?.toLowerCase().includes(term) || 
      dept.IdDepartamento?.toLowerCase().includes(term)
    );
  }

  /**
   * Filtra una lista de empresas basado en un término de búsqueda
   * @param companies Lista de empresas
   * @param searchTerm Término de búsqueda
   * @returns Lista filtrada de empresas
   */
  filterCompanies(companies: Empresa[], searchTerm: string): Empresa[] {
    if (!searchTerm || !companies?.length) return companies || [];
    
    const term = searchTerm.toLowerCase().trim();
    
    return companies.filter(company => 
      company.Nombre?.toLowerCase().includes(term) || 
      company.Correo?.toLowerCase().includes(term) || 
      company.Sector?.toLowerCase().includes(term) || 
      company.IdEmpresa?.toLowerCase().includes(term)
    );
  }
}