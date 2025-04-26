import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  updateDoc,
  doc,
  collectionData
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { 
  Usuario, 
  Empresa, 
  Reporte, 
  Department, 
  FormStep 
} from '../../models/interfaces';
import { TaskService } from '../../services/task.service';
import { 
  debounceTime, 
  distinctUntilChanged, 
  map, 
  switchMap, 
  tap,
  catchError,
  filter
} from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { first } from 'rxjs/operators';

@Component({
  selector: 'app-create-reports',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-reports.component.html',
  styleUrls: ['./create-reports.component.css']
})
export class CreateReportsComponent implements OnInit {
  private readonly firestore: Firestore = inject(Firestore);
  private readonly fb: FormBuilder = inject(FormBuilder);
  private readonly router: Router = inject(Router);
  private readonly taskService: TaskService = inject(TaskService);
  private readonly authService: AuthService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  reportForm!: FormGroup;
  companyForm!: FormGroup;
  selectedStep = 1;
  errorMessage = '';
  successMessage = '';
  isLoading = false;
  isSubmitting = false;

  steps: FormStep[] = [
    { title: 'Asignación', isValid: false },
    { title: 'Descripción', isValid: false }
  ];

  priorityOptions = ['Alta', 'Media', 'Baja'];
  workers$ = new BehaviorSubject<Usuario[]>([]);
  companies$ = new BehaviorSubject<Empresa[]>([]);
  departments$ = new BehaviorSubject<Department[]>([
    { id: 'sistemas', name: 'Sistemas' },
    { id: 'limpieza', name: 'Limpieza' },
    { id: 'mantenimiento', name: 'Mantenimiento' },
    { id: 'redes', name: 'Redes' },
    { id: 'diseño', name: 'Diseño' }
  ]);

  showNewCompany = false;

  constructor() {
    this.initForms();
  }

  async ngOnInit(): Promise<void> {
    //const hasPermission = await this.checkAdminPermissions();
    //if (!hasPermission) {
      //return;
      //}
    
    this.setupSubscriptions();
    this.loadInitialData();
  }
  /*
  private async checkAdminPermissions(): Promise<boolean> {
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        this.router.navigate(['/login']);
        return false;
      }
  
      const isAdmin = await this.authService.isAdmin(currentUser.uid);
      if (!isAdmin) {
        this.router.navigate(['/admin1']);
        return false;
      }
  
      return true;
    } catch (error) {
      console.error('Error verificando permisos:', error);
      this.showError('Error al verificar permisos de administrador');
      return false;
    }
  }
*/
  private initForms(): void {
    this.reportForm = this.fb.group({
      priority: ['', [Validators.required]],
      workerId: ['', [Validators.required]],
      department: ['', [Validators.required]],
     companyId: ['', [Validators.required]],
     jobTitle: ['', [Validators.required, Validators.minLength(3)]],
      jobDescription: ['', [Validators.required, Validators.minLength(10)]],
     location: ['', [Validators.required]]
    });

    this.companyForm = this.fb.group({
      Nombre: ['', [Validators.required, Validators.minLength(2)]],
     Correo: ['', [Validators.required, Validators.email]],
      Direccion: ['', [Validators.required]],
      Sector: ['', [Validators.required]]
   });
 }

 private setupSubscriptions(): void {
   this.reportForm.get('department')?.valueChanges.pipe(
     debounceTime(300),
     distinctUntilChanged(),
     takeUntilDestroyed(this.destroyRef),
     filter(value => !!value),
     switchMap(value => this.loadWorkersByDepartment(value))
   ).subscribe({
     next: (workers) => {
       console.log('Trabajadores cargados:', workers);
       this.workers$.next(workers as Usuario[]);
     },
     error: (error) => {
       console.error('Error en la suscripción de departamento:', error);
       this.showError('Error al cargar trabajadores del departamento');
     }
   });

   this.reportForm.get('companyId')?.valueChanges.pipe(
     debounceTime(300),
     distinctUntilChanged(),
     takeUntilDestroyed(this.destroyRef)
   ).subscribe(value => {
     this.showNewCompany = value === 'other';
     if (this.showNewCompany) {
       this.companyForm.reset();
     }
   });

   this.setupStepValidation(0, ['priority', 'workerId', 'department']);

   this.setupStepValidation(1, ['companyId', 'jobTitle', 'jobDescription', 'location']);
 }

 private setupStepValidation(stepIndex: number, fields: string[]): void {
   fields.forEach(field => {
     this.reportForm.get(field)?.valueChanges.pipe(
       takeUntilDestroyed(this.destroyRef)
     ).subscribe(() => {
       const isValid = fields.every(f => {
         const control = this.reportForm.get(f);
         return control && control.valid && control.value;
       });
       this.steps[stepIndex].isValid = isValid;
       console.log(`Step ${stepIndex + 1} validation updated:`, isValid);
     });
   });
 }

 private loadWorkersByDepartment(departmentId: string): Observable<Usuario[]> {
   console.log('Cargando trabajadores para departamento:', departmentId);
   const workersRef = collection(this.firestore, 'Usuario');
   const workersQuery = query(
     workersRef,
     where('Departamento', '==', departmentId),
     where('Rol', '==', 'worker')
   );

   return collectionData(workersQuery, { idField: 'IdUsuario' }).pipe(
     map(workers => workers as Usuario[]),
     tap(workers => {
       if (workers.length === 0) {
         this.showError(`No hay trabajadores en el departamento ${departmentId}`);
       }
     }),
     catchError(error => {
       console.error('Error cargando trabajadores:', error);
       this.showError('Error al cargar trabajadores');
       return of([]);
     })
   );
 }

 private loadInitialData(): void {
  this.isLoading = true;

  const empresasRef = collection(this.firestore, 'Empresa');
  
  collectionData(empresasRef, { idField: 'IdEmpresa' })
    .pipe(
      map(companies => {
        const typedCompanies = companies as Empresa[];
        return [
          ...typedCompanies,
          { 
            IdEmpresa: 'other', 
            Nombre: 'Otra empresa', 
            Correo: '', 
            Direccion: '', 
            Sector: '' 
          }
        ];
      }),
      catchError(error => {
        console.error('Error cargando empresas:', error);
        this.showError('Error al cargar empresas.');
        return of([] as Empresa[]);
      }),
      first()
    )
    .subscribe({
      next: (companies) => {
        if (companies && companies.length > 0) {
          this.companies$.next(companies);
        } else {
          this.showError('No se encontraron empresas');
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error en la carga de datos:', error);
        this.showError('Error al cargar los datos.');
        this.isLoading = false;
      }
    });
}

 async onSubmit(): Promise<void> {
   if (!this.isFormValid || this.isSubmitting || this.isLoading) {
     console.log('Formulario no válido o en proceso de envío');
     return;
   }

   this.isSubmitting = true;
   this.isLoading = true;

   try {
     const currentUser = await this.authService.getCurrentUser();
     if (!currentUser) {
       throw new Error('No hay usuario autenticado');
     }

     let companyId = this.reportForm.get('companyId')?.value;
     
     if (companyId === 'other') {
       if (!this.companyForm.valid) {
         throw new Error('Los datos de la nueva empresa son inválidos');
       }

        const newCompanyData = {
          ...this.companyForm.value,
         IdEmpresa: ''
        };
       
        const newCompanyDoc = await addDoc(collection(this.firestore, 'Empresa'), newCompanyData);
        companyId = newCompanyDoc.id;
       
        await updateDoc(doc(this.firestore, 'Empresa', newCompanyDoc.id), {
          IdEmpresa: newCompanyDoc.id
        });
      }

     const reportData: Omit<Reporte, 'IdReporte'> = {
       IdEmpresa: companyId,
       IdUsuario: this.reportForm.get('workerId')?.value,
       Tipo_Trabajo: this.reportForm.get('jobTitle')?.value,
       estado: 'Pendiente',
       fecha: new Date(),
       jobDescription: this.reportForm.get('jobDescription')?.value,
       location: this.reportForm.get('location')?.value,
       priority: this.reportForm.get('priority')?.value,
       departamento: this.reportForm.get('department')?.value
     };

     console.log('Enviando datos del reporte:', reportData);
     
     const reporteId = await this.taskService.assignReporte(reportData);
     console.log('Reporte creado con ID:', reporteId);
     
     this.showSuccess('Reporte generado correctamente');
     this.resetForms();
     this.router.navigate(['/reportsInterface']);
   } catch (error: any) {
     console.error('Error al procesar el formulario:', error);
     this.showError(error.message || 'Error al generar el reporte');
   } finally {
     this.isSubmitting = false;
     this.isLoading = false;
   }
 }

  get isFormValid(): boolean {
    if (this.selectedStep === 1) {
      return this.steps[0].isValid ?? false;
    }
    return this.steps[1].isValid ?? false;
  }

  private showError(message: string): void {
    this.errorMessage = message;
    setTimeout(() => this.errorMessage = '', 5000);
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    setTimeout(() => this.successMessage = '', 3000);
  }

  private resetForms(): void {
    this.reportForm.reset();
    this.companyForm.reset();
    this.selectedStep = 1;
    this.steps.forEach(step => step.isValid = false);
    this.showNewCompany = false;
  }

  nextStep(): void {
    if (this.selectedStep < this.steps.length && this.isFormValid) {
      this.selectedStep++;
    }
  }

  previousStep(): void {
    if (this.selectedStep > 1) {
      this.selectedStep--;
    }
  }

  goToStep(step: number): void {
    if (this.steps[step - 1].isValid || step <= this.selectedStep) {
      this.selectedStep = step;
    }
  }

  goBack(): void {
    
    this.router.navigate(['/reportsInterface']);
 }
}