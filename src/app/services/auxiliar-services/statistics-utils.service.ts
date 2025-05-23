
import { Injectable } from '@angular/core';
import { Reporte, Usuario } from '../../models/interfaces';

export interface WorkerStats {
  id: string;
  name: string;
  totalReports: number;
  completedReports: number;
  pendingReports: number;
  avgTime: string;
  efficiency: number;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label?: string;
    data: number[];
    backgroundColor: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class StatisticsUtilsService {
  constructor() { }

  /**
   * Calcular estadísticas básicas a partir de reportes
   */
  calculateBasicStats(reports: Reporte[]) {
    if (!reports || reports.length === 0) {
      return {
        totalReports: 0,
        completedReports: 0,
        pendingReports: 0,
        completionRate: '0',
        pendingRate: '0',
        avgCompletionTime: 'N/A'
      };
    }
    
    // Contar estados en una sola pasada
    const completedReports = reports.filter(r => r.estado === 'Completado').length;
    const totalReports = reports.length;
    const pendingReports = totalReports - completedReports;
    
    // Calcular tasas
    const completionRate = (totalReports > 0)
      ? (completedReports / totalReports * 100).toFixed(1)
      : '0';
    const pendingRate = (totalReports > 0)
      ? (pendingReports / totalReports * 100).toFixed(1)
      : '0';
    
    // Calcular tiempo promedio de completado
    const avgCompletionTime = this.calculateAverageCompletionTime(reports);
    
    return {
      totalReports,
      completedReports,
      pendingReports,
      completionRate,
      pendingRate,
      avgCompletionTime
    };
  }

  /**
   * Calcular tiempo promedio para completar reportes
   */
  calculateAverageCompletionTime(reports: Reporte[]): string {
    // Filtrar reportes completados con fechas válidas
    const completedReports = reports.filter(r =>
      r.estado === 'Completado' && r.fecha && r.fechaCompletado
    );
    
    if (completedReports.length === 0) {
      return 'N/A';
    }
    
    let totalHours = 0;
    let validReports = 0;
    
    // Calcular tiempo total
    completedReports.forEach(report => {
      try {
        const startDate = report.fecha instanceof Date ? report.fecha : new Date(report.fecha);
        const endDate = report.fechaCompletado instanceof Date ? 
          report.fechaCompletado : new Date(report.fechaCompletado);
        
        // Calcular diferencia en horas con validación
        if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && 
            startDate.getTime() <= endDate.getTime()) {
          const diffMs = endDate.getTime() - startDate.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          totalHours += diffHours;
          validReports++;
        }
      } catch (error) {
        console.error('Error al calcular tiempo de reporte:', error);
        // Continuar con el siguiente reporte
      }
    });
    
    if (validReports === 0) return 'N/A';
    
    const avgHours = totalHours / validReports;
    
    // Formatear el resultado con mejor legibilidad
    if (avgHours < 24) {
      return `${avgHours.toFixed(1)}h`;
    } else {
      const days = Math.floor(avgHours / 24);
      const hours = avgHours % 24;
      return `${days}d ${hours.toFixed(1)}h`;
    }
  }

  /**
   * Calcular estadísticas para cada trabajador
   */
  calculateWorkerStats(reports: Reporte[], workers: Usuario[]): WorkerStats[] {
    if (!reports || reports.length === 0 || !workers || workers.length === 0) {
      return [];
    }
    
    // Crear un Map para mejor rendimiento
    const reportsByWorker = new Map<string, Reporte[]>();
    const workerMap = new Map<string, Usuario>();
    
    // Mapear usuarios por ID para acceso rápido
    workers.forEach(worker => {
      workerMap.set(worker.IdUsuario, worker);
    });
    
    // Agrupar reportes por trabajador
    reports.forEach(report => {
      if (!report.IdUsuario) return; // Ignorar reportes sin ID de usuario válido
      
      if (!reportsByWorker.has(report.IdUsuario)) {
        reportsByWorker.set(report.IdUsuario, []);
      }
      reportsByWorker.get(report.IdUsuario)?.push(report);
    });
    
    // Calcular estadísticas para cada trabajador
    const stats: WorkerStats[] = [];
    
    // Usar solo los trabajadores que tienen reportes
    reportsByWorker.forEach((workerReports, workerId) => {
      const worker = workerMap.get(workerId);
      if (!worker) return; // Omitir si no encontramos datos del trabajador
      
      const completedReports = workerReports.filter(r => r.estado === 'Completado');
      const pendingReports = workerReports.filter(r => r.estado !== 'Completado');
      
      // Calcular tiempo promedio
      let avgTime = 'N/A';
      if (completedReports.length > 0) {
        avgTime = this.calculateAverageCompletionTime(completedReports);
      }
      
      // Calcular eficiencia (porcentaje de reportes completados)
      const efficiency = workerReports.length > 0
        ? Math.round(completedReports.length / workerReports.length * 100)
        : 0;
      
      stats.push({
        id: worker.IdUsuario,
        name: worker.Nombre || worker.Username || 'Desconocido',
        totalReports: workerReports.length,
        completedReports: completedReports.length,
        pendingReports: pendingReports.length,
        avgTime,
        efficiency
      });
    });
    
    // Ordenar por eficiencia (descendente)
    return stats.sort((a, b) => b.efficiency - a.efficiency);
  }

  /**
   * Preparar datos para gráfico de estado
   */
  prepareStatusChartData(reports: Reporte[], colorsPalette: any): ChartData {
    const completedCount = reports.filter(r => r.estado === 'Completado').length;
    const pendingCount = reports.filter(r => r.estado === 'Pendiente').length;
    
    return {
      labels: ['Completados', 'Pendientes'],
      datasets: [{
        data: [completedCount, pendingCount],
        backgroundColor: [colorsPalette.success, colorsPalette.warning],
        borderColor: [
          'rgba(16, 185, 129, 1)',
          'rgba(245, 158, 11, 1)'
        ],
        borderWidth: 1
      }]
    };
  }

  /**
   * Preparar datos para gráfico de prioridad
   */
  preparePriorityChartData(reports: Reporte[]): ChartData {
    // Contar reportes por prioridad
    const priorityCounts = new Map<string, number>();
    const priorities = ['Alta', 'Media', 'Baja', 'Sin prioridad'];
    
    // Inicializar contadores
    priorities.forEach(priority => {
      priorityCounts.set(priority, 0);
    });
    
    // Contar reportes
    reports.forEach(report => {
      const priority = report.priority || 'Sin prioridad';
      priorityCounts.set(priority, (priorityCounts.get(priority) || 0) + 1);
    });
    
    // Filtrar prioridades que tengan al menos un reporte
    const labelsWithCounts = priorities.filter(priority =>
      (priorityCounts.get(priority) || 0) > 0
    );
    
    // Convertir a arrays para Chart.js
    const labels = labelsWithCounts;
    const data = labelsWithCounts.map(label => priorityCounts.get(label) || 0);
    
    // Asignar colores
    const backgroundColors = [
      'rgba(239, 68, 68, 0.8)', // Alta - Rojo
      'rgba(245, 158, 11, 0.8)', // Media - Naranja
      'rgba(16, 185, 129, 0.8)', // Baja - Verde
      'rgba(209, 213, 219, 0.8)' // Sin prioridad - Gris
    ];
    
    const borderColors = [
      'rgba(239, 68, 68, 1)',
      'rgba(245, 158, 11, 1)',
      'rgba(16, 185, 129, 1)',
      'rgba(209, 213, 219, 1)'
    ];
    
    return {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors.slice(0, labels.length),
        borderColor: borderColors.slice(0, labels.length),
        borderWidth: 1
      }]
    };
  }

  /**
   * Preparar datos para gráfico de departamentos
   */
  prepareDepartmentChartData(reports: Reporte[], workers: Usuario[], colorsPalette: any): ChartData {
    // Crear mapa de ID de trabajador a departamento
    const workerToDepartment = new Map<string, string>();
    workers.forEach(worker => {
      const department = worker.Departamento || worker.IdDepartamento || 'Desconocido';
      workerToDepartment.set(worker.IdUsuario, department);
    });
    
    // Agrupar reportes por departamento
    const departmentReports = new Map<string, Reporte[]>();
    
    reports.forEach(report => {
      // Intentar obtener departamento del reporte directamente primero
      let department = report.departamento || '';
      
      // Si no hay departamento en el reporte, intentar obtenerlo del trabajador
      if (!department && report.IdUsuario) {
        department = workerToDepartment.get(report.IdUsuario) || 'Desconocido';
      }
      
      // Si aún no hay departamento, usar 'Desconocido'
      if (!department) {
        department = 'Desconocido';
      }
      
      if (!departmentReports.has(department)) {
        departmentReports.set(department, []);
      }
      departmentReports.get(department)?.push(report);
    });
    
    // Convertir a arrays para Chart.js
    const labels: string[] = [];
    const data: number[] = [];
    const backgroundColors: string[] = [];
    const borderColors: string[] = [];
    let colorIndex = 0;
    
    departmentReports.forEach((deptReports, department) => {
      labels.push(department);
      data.push(deptReports.length);
      backgroundColors.push(colorsPalette.background[colorIndex % colorsPalette.background.length]);
      borderColors.push(colorsPalette.border[colorIndex % colorsPalette.border.length]);
      colorIndex++;
    });
    
    return {
      labels: labels,
      datasets: [{
        label: 'Reportes por Departamento',
        data: data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1
      }]
    };
  }

  /**
   * Preparar datos para gráfico de empresas
   */
  prepareCompanyChartData(reports: Reporte[], companyMap: Map<string, string>, colorsPalette: any): ChartData {
    // Agrupar reportes por empresa
    const companyReports = new Map<string, Reporte[]>();
    
    // Agrupar reportes
    reports.forEach(report => {
      const companyId = report.IdEmpresa;
      const companyName = companyMap.get(companyId) || 'Desconocida';
      
      if (!companyReports.has(companyName)) {
        companyReports.set(companyName, []);
      }
      companyReports.get(companyName)?.push(report);
    });
    
    // Convertir a arrays para Chart.js
    const labels: string[] = [];
    const data: number[] = [];
    const backgroundColors: string[] = [];
    const borderColors: string[] = [];
    let colorIndex = 0;
    
    companyReports.forEach((reports, company) => {
      labels.push(company);
      data.push(reports.length);
      backgroundColors.push(colorsPalette.background[colorIndex % colorsPalette.background.length]);
      borderColors.push(colorsPalette.border[colorIndex % colorsPalette.border.length]);
      colorIndex++;
    });
    
    return {
      labels: labels,
      datasets: [{
        label: 'Reportes por Empresa',
        data: data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1
      }]
    };
  }

  /**
   * Preparar datos para gráfico de eficiencia de trabajadores
   */
  prepareEfficiencyChartData(workerStats: WorkerStats[]): ChartData {
    // Limitar a los 5 trabajadores con más reportes
    const topWorkers = workerStats
      .filter(worker => worker.totalReports > 0)
      .sort((a, b) => b.totalReports - a.totalReports)
      .slice(0, 5);
      
    if (topWorkers.length === 0) {
      return {
        labels: ['No hay datos'],
        datasets: [{
          label: 'Eficiencia',
          data: [0],
          backgroundColor: 'rgba(209, 213, 219, 0.8)',
          borderWidth: 1
        }]
      };
    }
    
    const labels = topWorkers.map(worker => worker.name);
    const data = topWorkers.map(worker => worker.efficiency);
    
    // Determinar colores basados en valor de eficiencia
    const backgroundColors = data.map(value => {
      if (value >= 80) return 'rgba(16, 185, 129, 0.8)'; // Verde para alta eficiencia
      if (value >= 50) return 'rgba(245, 158, 11, 0.8)'; // Naranja para eficiencia media
      return 'rgba(239, 68, 68, 0.8)'; // Rojo para baja eficiencia
    });
    
    return {
      labels: labels,
      datasets: [{
        label: 'Eficiencia',
        data: data,
        backgroundColor: backgroundColors,
        borderWidth: 1
      }]
    };
  }

  /**
   * Preparar datos para gráfico de distribución de tiempos
   */
  prepareTimeChartData(reports: Reporte[]): ChartData {
    // Usar solo reportes completados
    const completedReports = reports.filter(r =>
      r.estado === 'Completado' && r.fecha && r.fechaCompletado
    );
    
    if (completedReports.length === 0) {
      return {
        labels: ['No hay datos'],
        datasets: [{
          label: 'Tiempo de Resolución',
          data: [0],
          backgroundColor: 'rgba(209, 213, 219, 0.8)',
          borderColor: 'rgba(209, 213, 219, 1)',
          borderWidth: 1
        }]
      };
    }
    
    // Categorías de tiempo (en horas)
    const timeCategories = [
      { label: '< 1 hora', max: 1, count: 0 },
      { label: '1-4 horas', max: 4, count: 0 },
      { label: '4-12 horas', max: 12, count: 0 },
      { label: '12-24 horas', max: 24, count: 0 },
      { label: '1-3 días', max: 72, count: 0 },
      { label: '> 3 días', max: Infinity, count: 0 }
    ];
    
    // Contar reportes por categoría de tiempo
    completedReports.forEach(report => {
      try {
        const startDate = report.fecha instanceof Date ? report.fecha : new Date(report.fecha);
        const endDate = report.fechaCompletado instanceof Date ? 
          report.fechaCompletado : new Date(report.fechaCompletado);
          
        if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && 
            startDate.getTime() <= endDate.getTime()) {
          const diffMs = endDate.getTime() - startDate.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          
          // Asignar a la categoría correspondiente
          for (const category of timeCategories) {
            if (diffHours <= category.max) {
              category.count++;
              break;
            }
          }
        }
      } catch (error) {
        console.error('Error al calcular tiempo de reporte:', error);
        // Continuar con el siguiente reporte
      }
    });
    
    // Preparar datos para Chart.js
    const labels = timeCategories.map(cat => cat.label);
    const data = timeCategories.map(cat => cat.count);
    
    return {
      labels: labels,
      datasets: [{
        label: 'Tiempo de Resolución',
        data: data,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1
      }]
    };
  }

  /**
   * Obtener título del gráfico según tipo de datos
   */
  getChartTitle(dataType: string): string {
    switch (dataType) {
      case 'status':
        return 'Distribución por Estado';
      case 'priority':
        return 'Distribución por Prioridad';
      case 'department':
        return 'Reportes por Departamento';
      case 'company':
        return 'Reportes por Empresa';
      case 'time':
        return 'Tiempo de Resolución';
      default:
        return 'Estadísticas de Reportes';
    }
  }

  /**
   * Formatear fecha para elemento input
   */
  formatDateForInput(date: Date): string {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      date = new Date();
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }

  /**
   * Obtener rango de fechas a partir de selección de período
   */
  getDateRangeFromPeriod(period: string, startDate?: string, endDate?: string): { start: Date, end: Date } {
    let end = new Date();
    // Asegurar que el fin del día sea incluido
    end.setHours(23, 59, 59, 999);
    
    let start = new Date();
    switch (period) {
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'quarter':
        start.setMonth(start.getMonth() - 3);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
      case 'custom':
        // Usar fechas personalizadas seleccionadas por usuario
        if (startDate) {
          const customStart = new Date(startDate);
          if (!isNaN(customStart.getTime())) {
            start = customStart;
          }
        }
        if (endDate) {
          const customEnd = new Date(endDate);
          if (!isNaN(customEnd.getTime())) {
            end = customEnd;
            // Asegurar que sea fin del día
            end.setHours(23, 59, 59, 999);
          }
        }
        break;
    }
    
    // Asegurar que sea inicio del día
    start.setHours(0, 0, 0, 0);
    
    return { start, end };
  }
}