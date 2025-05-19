// pagination.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PaginationService {
  private itemsPerPageSubject = new BehaviorSubject<number>(10);
  public itemsPerPage$ = this.itemsPerPageSubject.asObservable();
  
  private currentPageSubject = new BehaviorSubject<number>(1);
  public currentPage$ = this.currentPageSubject.asObservable();
  
  private totalPagesSubject = new BehaviorSubject<number>(1);
  public totalPages$ = this.totalPagesSubject.asObservable();

  constructor() {}

  setItemsPerPage(count: number): void {
    this.itemsPerPageSubject.next(count);
  }

  setCurrentPage(page: number): void {
    this.currentPageSubject.next(page);
  }

  setTotalPages(total: number): void {
    this.totalPagesSubject.next(total);
  }

  getCurrentPage(): number {
    return this.currentPageSubject.getValue();
  }

  getItemsPerPage(): number {
    return this.itemsPerPageSubject.getValue();
  }

  getTotalPages(): number {
    return this.totalPagesSubject.getValue();
  }

  // Método para calcular el total de páginas basado en el número total de items
  calculateTotalPages(totalItems: number): void {
    const itemsPerPage = this.getItemsPerPage();
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    this.setTotalPages(totalPages);
  }

  // Método para paginar los datos
  paginateItems<T>(items: T[]): T[] {
    const currentPage = this.getCurrentPage();
    const itemsPerPage = this.getItemsPerPage();
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    
    return items.slice(startIndex, endIndex);
  }

  // Métodos de navegación
  nextPage(): void {
    const current = this.getCurrentPage();
    const total = this.getTotalPages();
    
    if (current < total) {
      this.setCurrentPage(current + 1);
    }
  }

  previousPage(): void {
    const current = this.getCurrentPage();
    
    if (current > 1) {
      this.setCurrentPage(current - 1);
    }
  }

  goToPage(page: number): void {
    const total = this.getTotalPages();
    
    if (page >= 1 && page <= total) {
      this.setCurrentPage(page);
    }
  }

  resetPagination(): void {
    this.setCurrentPage(1);
  }
}