import { Component, OnInit, inject, DestroyRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, debounceTime, finalize, catchError, of, map } from 'rxjs';

// Servicios
import { DepartmentService } from '../../services/department.service';
import { CompanyService } from '../../services/company.service';
import { AuthService } from '../../services/auth.service';
import { SimpleModalService } from '../../services/simple-modal.service';
import { take } from 'rxjs/operators';
// Modelos
import { Departamento, Empresa } from '../../models/interfaces';

// Servicios auxiliares (se crearán en archivos separados)
import { ConfigStateService } from '../../services/auxiliar-services/config-state.service';
import { ConfigFormService } from '../../services/auxiliar-services/config-form.service';
import { ConfigAnimationService } from '../../services/auxiliar-services/config-animation.service';
@Component({
  selector: 'app-manage-config',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './manage-config.component.html',
  styleUrl: './manage-config.component.scss'
})
export class ManageConfigComponent implements OnInit {
  // Referencias a elementos del DOM
  @ViewChild('departmentFormRef') departmentFormRef?: ElementRef;
  @ViewChild('companyFormRef') companyFormRef?: ElementRef;

  // Servicios inyectados
  private departmentService: DepartmentService = inject(DepartmentService);
  private companyService: CompanyService = inject(CompanyService);
  private authService: AuthService = inject(AuthService);
  private modalService: SimpleModalService = inject(SimpleModalService);
  private fb: FormBuilder = inject(FormBuilder);
  private router: Router = inject(Router);
  private destroyRef: DestroyRef = inject(DestroyRef);
  
  // Servicios locales - se crearán estos servicios nuevos para mejor modularización
  private stateService = new ConfigStateService();
  private formService = new ConfigFormService(this.fb);
  private animationService = new ConfigAnimationService();

  // Estados principales - DataSource
  departments$ = new BehaviorSubject<Departamento[]>([]);
  companies$ = new BehaviorSubject<Empresa[]>([]);
  filteredDepartments$: Observable<Departamento[]>;
  filteredCompanies$: Observable<Empresa[]>;

  // Estados de permisos
  isAdmin2OrHigher = false;
  isAdmin3 = true;

  // Estados de UI
  isLoading = false;
  activeTab: 'departments' | 'companies' = 'departments';
  showDepartmentForm = false;
  showCompanyForm = false;
  errorMessage = '';
  successMessage = '';

  // Variables de filtrado
  departmentFilterText = '';
  companyFilterText = '';

  // Nuevas variables para mejorar la UX
  departmentCount = 0;
  companyCount = 0;
  lastUpdated = new Date();
  searchTerm = '';
  isSearching = false;
  animationState = 'idle';

  // Variables para el modal de confirmación
  showConfirmModal = false;
  confirmModalTitle = '';
  confirmModalMessage = '';
  itemToDeleteId = '';
  itemToDeleteName = '';
  itemTypeToDelete: 'department' | 'company' = 'department';

  // Formularios reactivos
  departmentForm: FormGroup;
  companyForm: FormGroup;
  searchForm: FormGroup;

  constructor() {
    // Inicializar formularios usando el servicio de formularios
    this.departmentForm = this.formService.createDepartmentForm();
    this.companyForm = this.formService.createCompanyForm();
    this.searchForm = this.formService.createSearchForm();

    // Inicializar observables filtrados
    this.filteredDepartments$ = this.createFilteredDepartmentsObservable();
    this.filteredCompanies$ = this.createFilteredCompaniesObservable();
  }

  // Método mejorado para crear el observable de departamentos filtrados
  private createFilteredDepartmentsObservable(): Observable<Departamento[]> {
    return this.departments$.pipe(
      map(departments => {
        const filterText = this.departmentFilterText.toLowerCase().trim();
        if (!filterText) return departments;
        
        return departments.filter(department =>
          department.Nombre.toLowerCase().includes(filterText) ||
          (department.IdDepartamento &&
          department.IdDepartamento.toLowerCase().includes(filterText))
        );
      })
    );
  }

  // Método mejorado para crear el observable de empresas filtradas
  private createFilteredCompaniesObservable(): Observable<Empresa[]> {
    return this.companies$.pipe(
      map(companies => {
        const filterText = this.companyFilterText.toLowerCase().trim();
        if (!filterText) return companies;
        
        return companies.filter(company =>
          company.Nombre.toLowerCase().includes(filterText) ||
          (company.Correo && company.Correo.toLowerCase().includes(filterText)) ||
          (company.Sector && company.Sector.toLowerCase().includes(filterText)) ||
          (company.IdEmpresa && company.IdEmpresa.toLowerCase().includes(filterText))
        );
      })
    );
  }

  ngOnInit() {
    // Mostrar animación de carga
    this.animationState = 'loading';
    this.isLoading = true;
    
    // Verificar permisos
    this.checkAdminPermissions().then(() => {
      // Cargar datos con un pequeño retraso
      setTimeout(() => {
        // Primero cargamos departamentos
        this.departmentService.getDepartments()
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            catchError(error => {
              console.error('Error cargando departamentos:', error);
              this.showError('Error al cargar departamentos');
              return of([]);
            })
          )
          .subscribe(departments => {
            this.departments$.next(departments);
            this.departmentCount = departments.length;
            
            // Luego cargamos empresas
            this.companyService.getCompanies()
              .pipe(
                takeUntilDestroyed(this.destroyRef),
                catchError(error => {
                  console.error('Error cargando empresas:', error);
                  this.showError('Error al cargar empresas');
                  return of([]);
                }),
                finalize(() => {
                  this.isLoading = false;
                  this.animationState = 'loaded';
                })
              )
              .subscribe(companies => {
                this.companies$.next(companies);
                this.companyCount = companies.length;
                this.lastUpdated = new Date();
              });
          });
        
        // Configurar la pestaña activa
        this.activeTab = 'departments';
        
        // Configurar búsqueda con debounce
        this.searchForm.get('term')?.valueChanges
          .pipe(
            debounceTime(300),
            takeUntilDestroyed(this.destroyRef)
          )
          .subscribe(term => {
            this.searchTerm = term;
            this.applyGlobalSearch(term);
          });
      }, 100);
    }).catch(error => {
      console.error('Error en la inicialización:', error);
      this.showError('Error al inicializar el componente');
      this.isLoading = false;
      this.animationState = 'error';
    });
  }

  /**
   * Verifica los permisos del usuario actual
   * @returns Promise<void>
   */
  private async checkAdminPermissions(): Promise<void> {
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        this.router.navigate(['/login']);
        return;
      }
      
      const userData = await this.authService.getUserData(currentUser.uid);
      if (!userData || userData.Rol !== 'admin') {
        this.showError('No tiene permisos para acceder a esta sección');
        this.router.navigate(['/admin1']);
        return;
      }
      
      // Verificar nivel de admin
      this.isAdmin3 = userData.NivelAdmin === '3';
      this.isAdmin2OrHigher = userData.NivelAdmin === '2' || userData.NivelAdmin === '3';
      
      if (!this.isAdmin2OrHigher) {
        this.showError('Se requiere nivel de administrador 2 o superior');
        this.router.navigate(['/admin1']);
      }
    } catch (error) {
      console.error('Error verificando permisos:', error);
      this.showError('Error al verificar permisos de administrador');
      this.router.navigate(['/admin1']);
    }
  }

  /**
   * Carga los datos iniciales
   */
  private loadData(): void {
    this.isLoading = true;
    
    // Cargar departamentos
    this.departmentService.getDepartments()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          console.error('Error cargando departamentos:', error);
          this.showError('Error al cargar departamentos');
          return of([]);
        }),
        finalize(() => this.isLoading = false)
      )
      .subscribe(departments => {
        this.departments$.next(departments);
        this.departmentCount = departments.length;
        this.lastUpdated = new Date();
      });
    
    // Cargar empresas
    this.companyService.getCompanies()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          console.error('Error cargando empresas:', error);
          this.showError('Error al cargar empresas');
          return of([]);
        })
      )
      .subscribe(companies => {
        this.companies$.next(companies);
        this.companyCount = companies.length;
      });
  }

  /**
   * Cambia entre pestañas con animación
   * @param tab Pestaña a activar
   */
  setActiveTab(tab: 'departments' | 'companies'): void {
    // Agregar efecto de transición
    this.animationState = 'transitioning';
    setTimeout(() => {
      this.activeTab = tab;
      this.animationState = 'loaded';
    }, 150);
  }

  /**
   * Cambia la visibilidad del formulario de departamentos
   */
  toggleDepartmentForm(): void {
    this.showDepartmentForm = !this.showDepartmentForm;
    if (this.showDepartmentForm) {
      this.departmentForm.reset();
      // Cerrar el formulario de empresas si está abierto
      if (this.showCompanyForm) {
        this.showCompanyForm = false;
      }
    }
  }

  /**
   * Cambia la visibilidad del formulario de empresas
   */
  toggleCompanyForm(): void {
    this.showCompanyForm = !this.showCompanyForm;
    if (this.showCompanyForm) {
      this.companyForm.reset();
      // Cerrar el formulario de departamentos si está abierto
      if (this.showDepartmentForm) {
        this.showDepartmentForm = false;
      }
    }
  }

  /**
   * Agrega un nuevo departamento
   */
  async addDepartment() {
    if (this.departmentForm.invalid) return;
    
    // Activar estado de carga y animación
    this.isLoading = true;
    this.animationState = 'saving';
    
    try {
      const departmentName = this.departmentForm.get('name')?.value;
      
      // Validación adicional
      if (!departmentName || departmentName.trim().length < 3) {
        throw new Error('El nombre del departamento debe tener al menos 3 caracteres');
      }
      
      // Verificar si ya existe un departamento con el mismo nombre
      const existingDepartments = this.departments$.getValue();
      const exists = existingDepartments.some(d =>
        d.Nombre.toLowerCase() === departmentName.toLowerCase()
      );
      
      if (exists) {
        throw new Error(`El departamento "${departmentName}" ya existe`);
      }
      
      // Guardar el departamento
      await this.departmentService.addDepartment(departmentName);
      
      // Mostrar mensaje de éxito con el nombre
      this.showSuccess(`Departamento "${departmentName}" añadido correctamente`);
      
      // Cerrar el formulario
      this.toggleDepartmentForm();
      
      // Recargar los datos
      this.loadData();
    } catch (error: any) {
      this.showError(error.message || 'Error al añadir departamento');
    } finally {
      this.isLoading = false;
      this.animationState = 'idle';
    }
  }

  /**
   * Método para abrir el modal de confirmación
   * @param itemId ID del elemento a eliminar
   * @param itemName Nombre del elemento a eliminar
   * @param itemType Tipo de elemento ('department' o 'company')
   */
  openDeleteConfirmation(itemId: string, itemName: string, itemType: 'department' | 'company'): void {
    this.itemToDeleteId = itemId;
    this.itemToDeleteName = itemName;
    this.itemTypeToDelete = itemType;
    
    if (itemType === 'department') {
      this.confirmModalTitle = 'Eliminar departamento';
      this.confirmModalMessage = `¿Está seguro de eliminar el departamento "${itemName}"?\n\nEsta acción no se puede deshacer.`;
    } else {
      this.confirmModalTitle = 'Eliminar empresa';
      this.confirmModalMessage = `¿Está seguro de eliminar la empresa "${itemName}"?\n\nEsta acción no se puede deshacer.`;
    }
    
    this.showConfirmModal = true;
  }

  /**
   * Método para cancelar la eliminación
   */
  cancelDelete(): void {
    this.showConfirmModal = false;
    this.itemToDeleteId = '';
    this.itemToDeleteName = '';
  }

  /**
   * Método para confirmar la eliminación
   */
  async confirmDelete(): Promise<void> {
    if (this.itemTypeToDelete === 'department') {
      await this.deleteDepartment();
    } else {
      await this.deleteCompany();
    }
    
    this.showConfirmModal = false;
    this.itemToDeleteId = '';
    this.itemToDeleteName = '';
  }

  /**
   * Elimina un departamento
   */
  async deleteDepartment(): Promise<void> {
    if (!this.itemToDeleteId) return;
    
    this.isLoading = true;
    this.animationState = 'deleting';
    
    try {
      await this.departmentService.deleteDepartment(this.itemToDeleteId);
      
      // Actualizar la lista sin necesidad de recargar
      const currentDepartments = this.departments$.getValue();
      const updatedDepartments = currentDepartments.filter(d =>
        d.IdDepartamento !== this.itemToDeleteId
      );
      
      this.departments$.next(updatedDepartments);
      this.departmentCount = updatedDepartments.length;
      
      this.showSuccess(`Departamento "${this.itemToDeleteName}" eliminado correctamente`);
    } catch (error: any) {
      console.error('Error al eliminar departamento:', error);
      this.showError(error.message || 'Error al eliminar departamento. Es posible que existan usuarios asociados a este departamento.');
    } finally {
      this.isLoading = false;
      this.animationState = 'idle';
    }
  }

  /**
   * Agrega una nueva empresa
   */
  async addCompany() {
    if (this.companyForm.invalid) return;
    
    this.isLoading = true;
    this.animationState = 'saving';
    
    try {
      const companyData = this.companyForm.value;
      
      // Validación adicional para correo electrónico
      if (!this.isValidEmail(companyData.Correo)) {
        throw new Error('El formato del correo electrónico no es válido');
      }
      
      // Verificar si ya existe una empresa con el mismo nombre
      const existingCompanies = this.companies$.getValue();
      const exists = existingCompanies.some(c =>
        c.Nombre.toLowerCase() === companyData.Nombre.toLowerCase()
      );
      
      if (exists) {
        throw new Error(`La empresa "${companyData.Nombre}" ya existe`);
      }
      
      await this.companyService.addCompany(companyData);
      
      this.showSuccess(`Empresa "${companyData.Nombre}" añadida correctamente`);
      this.toggleCompanyForm();
      
      // Recargar datos
      this.loadData();
    } catch (error: any) {
      this.showError(error.message || 'Error al añadir empresa');
    } finally {
      this.isLoading = false;
      this.animationState = 'idle';
    }
  }

  /**
   * Elimina una empresa
   */
  async deleteCompany(): Promise<void> {
    if (!this.itemToDeleteId) return;
    
    this.isLoading = true;
    this.animationState = 'deleting';
    
    try {
      await this.companyService.deleteCompany(this.itemToDeleteId);
      
      // Actualizar la lista sin necesidad de recargar
      const currentCompanies = this.companies$.getValue();
      const updatedCompanies = currentCompanies.filter(c =>
        c.IdEmpresa !== this.itemToDeleteId
      );
      
      this.companies$.next(updatedCompanies);
      this.companyCount = updatedCompanies.length;
      
      this.showSuccess(`Empresa "${this.itemToDeleteName}" eliminada correctamente`);
    } catch (error: any) {
      console.error('Error al eliminar empresa:', error);
      this.showError(error.message || 'Error al eliminar empresa. Es posible que existan reportes asociados a esta empresa.');
    } finally {
      this.isLoading = false;
      this.animationState = 'idle';
    }
  }

  /**
   * Filtra departamentos por texto
   * @param filterText Texto para filtrar
   */
  filterDepartments(filterText: string): void {
    this.departmentFilterText = filterText;
    // Actualizar la lista filtrada forzando la evaluación del pipe
    this.departments$.next(this.departments$.getValue());
  }

  /**
   * Filtra empresas por texto
   * @param filterText Texto para filtrar
   */
  filterCompanies(filterText: string): void {
    this.companyFilterText = filterText;
    // Actualizar la lista filtrada forzando la evaluación del pipe
    this.companies$.next(this.companies$.getValue());
  }

  /**
   * Busca globalmente en departamentos y empresas
   * @param term Término de búsqueda
   */
  applyGlobalSearch(term: string): void {
    if (this.activeTab === 'departments') {
      this.departmentFilterText = term;
      // Forzar la actualización del filtro
      this.departments$.next(this.departments$.getValue());
    } else {
      this.companyFilterText = term;
      // Forzar la actualización del filtro
      this.companies$.next(this.companies$.getValue());
    }
  }

  /**
   * Valida el formato de correo electrónico
   * @param email Correo a validar
   * @returns boolean
   */
  private isValidEmail(email: string): boolean {
    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return emailPattern.test(email);
  }

  /**
   * Verifica si un campo de formulario tiene error
   * @param form Formulario a verificar
   * @param fieldName Nombre del campo
   * @returns boolean
   */
  hasFieldError(form: FormGroup, fieldName: string): boolean {
    const field = form.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  /**
   * Navega a la pantalla anterior
   */
  goBack() {
    this.router.navigate(['/admin1']);
  }

  /**
   * Muestra un mensaje de error
   * @param message Mensaje a mostrar
   */
  private showError(message: string): void {
    this.errorMessage = message;
    this.successMessage = '';
    
    // Auto-desaparecer después de 5 segundos
    setTimeout(() => {
      if (this.errorMessage === message) {
        this.errorMessage = '';
      }
    }, 5000);
  }

  /**
   * Muestra un mensaje de éxito
   * @param message Mensaje a mostrar
   */
  private showSuccess(message: string): void {
    this.successMessage = message;
    this.errorMessage = '';
    
    // Auto-desaparecer después de 3 segundos
    setTimeout(() => {
      if (this.successMessage === message) {
        this.successMessage = '';
      }
    }, 3000);
  }

  /**
   * Actualiza los datos
   */
  refreshData(): void 
  {
  this.animationState = 'refreshing';
  this.isLoading = true;
  
  // Usamos un timeout para asegurar que el estado se resetea incluso si hay un error
  const timeoutId = setTimeout(() => {
    this.animationState = 'idle';
    this.isLoading = false;
  }, 5000); // 5 segundos máximo
  
  // Cargar los datos
  Promise.all([
    // Convertir observables a promesas para manejarlos de forma síncrona
    new Promise<void>((resolve) => {
      this.departmentService.getDepartments()
        .pipe(take(1))
        .subscribe({
          next: (departments) => {
            this.departments$.next(departments);
            this.departmentCount = departments.length;
            resolve();
          },
          error: (error) => {
            console.error('Error al cargar departamentos:', error);
            this.showError('Error al cargar los departamentos');
            resolve(); // Resolvemos de todas formas para continuar
          }
        });
    }),
    new Promise<void>((resolve) => {
      this.companyService.getCompanies()
        .pipe(take(1))
        .subscribe({
          next: (companies) => {
            this.companies$.next(companies);
            this.companyCount = companies.length;
            resolve();
          },
          error: (error) => {
            console.error('Error al cargar empresas:', error);
            this.showError('Error al cargar las empresas');
            resolve(); // Resolvemos de todas formas para continuar
          }
        });
    })
  ])
  .then(() => {
    this.lastUpdated = new Date();
    this.showSuccess('Datos actualizados correctamente');
    clearTimeout(timeoutId); // Limpiamos el timeout ya que terminó con éxito
    this.animationState = 'idle';
    this.isLoading = false;
  })
  .catch((error) => {
    console.error('Error al actualizar datos:', error);
    this.showError('Error al actualizar los datos');
    clearTimeout(timeoutId); // Limpiamos el timeout
    this.animationState = 'idle';
    this.isLoading = false;
  });
}


  /**
   * Limpia todos los filtros aplicados
   */
  clearFilters(): void {
    this.departmentFilterText = '';
    this.companyFilterText = '';
    this.searchTerm = '';
    this.searchForm.reset();
    this.isSearching = false;
    
    // Forzar la actualización de ambas listas
    this.departments$.next(this.departments$.getValue());
    this.companies$.next(this.companies$.getValue());
  }
}