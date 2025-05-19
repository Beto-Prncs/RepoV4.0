// reports-filter.service.ts
import { Injectable } from '@angular/core';
import { Reporte } from '../../models/interfaces';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ReportsFilterService {
  private filteredReportsSubject = new BehaviorSubject<Reporte[]>([]);
  public filteredReports$ = this.filteredReportsSubject.asObservable();

  constructor() {}

  applyFilters(
    reportes: Reporte[],
    searchTerm: string = '',
    selectedCompany: string = '',
    selectedWorker: string = '',
    selectedPriority: string = '',
    selectedDateFilter: string = '',
    selectedDepartment: string = '',
    currentView: 'pending' | 'completed' = 'pending'
  ): Reporte[] {
    // Empezar con la lista completa
    let filteredReports = [...reportes];

    // Filtrar por estado (pendiente o completado)
    filteredReports = filteredReports.filter(report => 
      currentView === 'pending' 
        ? report.estado === 'Pendiente' 
        : report.estado === 'Completado'
    );

    // Aplicar filtro de empresa
    if (selectedCompany) {
      filteredReports = filteredReports.filter(report => 
        report.IdEmpresa === selectedCompany
      );
    }

    // Aplicar filtro de trabajador
    if (selectedWorker) {
      filteredReports = filteredReports.filter(report => 
        report.IdUsuario === selectedWorker
      );
    }

    // Aplicar filtro de prioridad
    if (selectedPriority) {
      filteredReports = filteredReports.filter(report => 
        report.priority === selectedPriority
      );
    }

    // Aplicar filtro de departamento
    if (selectedDepartment) {
      filteredReports = filteredReports.filter(report => 
        report.departamento === selectedDepartment
      );
    }

    // Aplicar filtro de fecha
    if (selectedDateFilter) {
      filteredReports = this.applyDateFilter(filteredReports, selectedDateFilter, currentView);
    }

    // Aplicar filtro de búsqueda
    if (searchTerm?.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filteredReports = filteredReports.filter(report => 
        (report.Tipo_Trabajo?.toLowerCase().includes(searchLower)) ||
        (report.jobDescription?.toLowerCase().includes(searchLower))
      );
    }

    // Actualizar el observable
    this.filteredReportsSubject.next(filteredReports);
    
    return filteredReports;
  }

  private applyDateFilter(reports: Reporte[], dateFilter: string, currentView: 'pending' | 'completed'): Reporte[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    return reports.filter(report => {
      // Determinar qué fecha usar
      const reportDate = this.normalizeDate(
        currentView === 'completed' && report.fechaCompletado
          ? report.fechaCompletado
          : report.fecha
      );

      // Normalizar fecha para comparación
      reportDate.setHours(0, 0, 0, 0);
      
      switch (dateFilter) {
        case 'today':
          return this.isSameDay(reportDate, today);
        case 'yesterday':
          return this.isSameDay(reportDate, yesterday);
        case 'week':
          return reportDate >= lastWeek;
        case 'month':
          return reportDate >= lastMonth;
        default:
          return true;
      }
    });
  }

  private normalizeDate(date: any): Date {
    if (!date) return new Date();
    
    if (date instanceof Date) {
      return date;
    }
    
    // Si es un timestamp de Firestore
    if (date && typeof date === 'object' && 'seconds' in date) {
      return new Date(date.seconds * 1000);
    }
    
    // Si es un string ISO o una fecha en formato string
    try {
      return new Date(date);
    } catch (error) {
      console.error('Error al convertir fecha:', error);
      return new Date();
    }
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  }

  // Método auxiliar para formatear fechas para la UI
  formatDate(date: any): string {
    if (!date) return 'Fecha no disponible';
    
    try {
      const dateObj = this.normalizeDate(date);
      return dateObj.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error al formatear fecha:', error);
      return 'Fecha inválida';
    }
  }
}