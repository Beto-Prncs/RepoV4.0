import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';
import { DepartmentService } from '../../services/department.service';
import { CompanyService } from '../../services/company.service';
import { AuthService } from '../../services/auth.service';
import { Departamento, Empresa } from '../../models/interfaces';

@Component({
  selector: 'app-manage-config',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './manage-config.component.html',
  styleUrl: './manage-config.component.css'
})
export class ManageConfigComponent implements OnInit {
  private departmentService: DepartmentService = inject(DepartmentService);
  private companyService: CompanyService = inject(CompanyService);
  private authService: AuthService = inject(AuthService);
  private fb: FormBuilder = inject(FormBuilder);
  private router: Router = inject(Router);
  private destroyRef: DestroyRef = inject(DestroyRef);

  // Variables para la interfaz
  departments$ = new BehaviorSubject<Departamento[]>([]);
  companies$ = new BehaviorSubject<Empresa[]>([]);
  isAdmin2OrHigher = false;
  isAdmin3 = false;
  isLoading = false;
  activeTab: 'departments' | 'companies' = 'departments';
  showDepartmentForm = false;
  showCompanyForm = false;
  errorMessage = '';
  successMessage = '';

  // Formularios
  departmentForm: FormGroup;
  companyForm: FormGroup;

  constructor() {
    this.departmentForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]]
    });

    this.companyForm = this.fb.group({
      Nombre: ['', [Validators.required, Validators.minLength(3)]],
      Correo: ['', [Validators.required, Validators.email]],
      Direccion: ['', [Validators.required]],
      Sector: ['', [Validators.required]]
    });
  }

  async ngOnInit() {
    await this.checkAdminPermissions();
    this.loadData();
  }

  private async checkAdminPermissions(): Promise<void> {
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        this.router.navigate(['/login']);
        return;
      }

      const userData = await this.authService.getUserData(currentUser.uid);
      if (!userData || userData.Rol !== 'admin') {
        this.router.navigate(['/admin1']);
        return;
      }

      // Verificar nivel de admin
      this.isAdmin3 = userData.NivelAdmin === '3';
      this.isAdmin2OrHigher = userData.NivelAdmin === '2' || userData.NivelAdmin === '3';

      if (!this.isAdmin2OrHigher) {
        this.router.navigate(['/admin1']);
      }
    } catch (error) {
      console.error('Error verificando permisos:', error);
      this.showError('Error al verificar permisos de administrador');
      this.router.navigate(['/admin1']);
    }
  }

  private loadData(): void {
    this.isLoading = true;

    // Cargar departamentos
    this.departmentService.getDepartments().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (departments) => {
        this.departments$.next(departments);
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error cargando departamentos:', error);
        this.showError('Error al cargar departamentos');
        this.isLoading = false;
      }
    });

    // Cargar empresas
    this.companyService.getCompanies().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (companies) => {
        this.companies$.next(companies);
      },
      error: (error) => {
        console.error('Error cargando empresas:', error);
        this.showError('Error al cargar empresas');
      }
    });
  }

  setActiveTab(tab: 'departments' | 'companies'): void {
    this.activeTab = tab;
  }

  toggleDepartmentForm(): void {
    this.showDepartmentForm = !this.showDepartmentForm;
    if (this.showDepartmentForm) {
      this.departmentForm.reset();
    }
  }

  toggleCompanyForm(): void {
    this.showCompanyForm = !this.showCompanyForm;
    if (this.showCompanyForm) {
      this.companyForm.reset();
    }
  }

  async addDepartment() {
    if (this.departmentForm.invalid) return;
    
    this.isLoading = true;
    try {
      const departmentName = this.departmentForm.get('name')?.value;
      await this.departmentService.addDepartment(departmentName);
      this.showSuccess(`Departamento "${departmentName}" añadido correctamente`);
      this.toggleDepartmentForm();
      // Recargar los departamentos
      this.loadData();
    } catch (error: any) {
      this.showError(error.message || 'Error al añadir departamento');
    } finally {
      this.isLoading = false;
    }
  }

  async deleteDepartment(departmentId: string, departmentName: string) {
    if (!confirm(`¿Está seguro de eliminar el departamento "${departmentName}"?`)) {
      return;
    }
    
    this.isLoading = true;
    try {
      await this.departmentService.deleteDepartment(departmentId);
      this.showSuccess(`Departamento "${departmentName}" eliminado correctamente`);
      // Recargar los departamentos
      this.loadData();
    } catch (error: any) {
      this.showError(error.message || 'Error al eliminar departamento');
    } finally {
      this.isLoading = false;
    }
  }

  async addCompany() {
    if (this.companyForm.invalid) return;
    
    this.isLoading = true;
    try {
      const companyData = this.companyForm.value;
      await this.companyService.addCompany(companyData);
      this.showSuccess(`Empresa "${companyData.Nombre}" añadida correctamente`);
      this.toggleCompanyForm();
      // Recargar las empresas
      this.loadData();
    } catch (error: any) {
      this.showError(error.message || 'Error al añadir empresa');
    } finally {
      this.isLoading = false;
    }
  }

  async deleteCompany(companyId: string, companyName: string) {
    if (!confirm(`¿Está seguro de eliminar la empresa "${companyName}"?`)) {
      return;
    }
    
    this.isLoading = true;
    try {
      await this.companyService.deleteCompany(companyId);
      this.showSuccess(`Empresa "${companyName}" eliminada correctamente`);
      // Recargar las empresas
      this.loadData();
    } catch (error: any) {
      this.showError(error.message || 'Error al eliminar empresa');
    } finally {
      this.isLoading = false;
    }
  }

  goBack() {
    this.router.navigate(['/admin1']);
  }

  private showError(message: string): void {
    this.errorMessage = message;
    this.successMessage = '';
    setTimeout(() => this.errorMessage = '', 5000);
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    this.errorMessage = '';
    setTimeout(() => this.successMessage = '', 3000);
  }
}
