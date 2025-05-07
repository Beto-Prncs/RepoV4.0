import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  collection,
  getDocs,
  query,
  where,
  getDoc
} from '@angular/fire/firestore';
import { Usuario, Departamento } from '../../models/interfaces';
import { DepartmentService } from '../../services/department.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';
import { HttpClientModule } from '@angular/common/http';
import { UserService } from '../../services/auxiliar-services/user.service';
import { EmailSenderService } from '../../services/auxiliar-services/email-sender.service';
import { SessionHelperService } from '../../services/auxiliar-services/session-helper.service';

interface AccountData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  department: string;
  customDepartment?: string;
  adminLevel: string;
  customAdminLevel?: string;
}

interface Notification {
  id: number;
  type: 'success' | 'error';
  title: string;
  message: string;
}

@Component({
  selector: 'app-create-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './create-accounts.component.html',
  styleUrls: [
    './create-accounts.component.scss',
    './create-accounts-animations.css'
  ]
})
export class CreateAccountsComponent implements OnInit {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private router: Router = inject(Router);
  private departmentService: DepartmentService = inject(DepartmentService);
  private userService: UserService = inject(UserService);
  private emailSenderService: EmailSenderService = inject(EmailSenderService);
  private sessionHelper: SessionHelperService = inject(SessionHelperService);
  private destroyRef: DestroyRef = inject(DestroyRef);

  selectedType: 'worker' | 'admin' | null = null;
  showPassword: boolean = false;
  isLoading: boolean = false;
  formSubmitted: boolean = false;
  showCustomDepartment: boolean = false;
  showCustomAdminLevel: boolean = false;
  existingUsernames: string[] = [];
  notifications: Notification[] = [];
  isAdminLevelRestricted = false;
  currentAdminLevel = '';
  private notificationId = 0;

  departments$ = new BehaviorSubject<Departamento[]>([]);
  adminLevels: string[] = ['1', '2', '3', 'otro'];
  accountData: AccountData = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    username: '',
    password: '',
    department: '',
    customDepartment: '',
    adminLevel: '',
    customAdminLevel: ''
  };

  async ngOnInit() {
    await this.loadInitialData();
    await this.checkAdminRestrictions();
    this.loadDepartments();
  }

  private async loadInitialData() {
    try {
      await this.loadExistingUsernames();
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }

  private loadDepartments() {
    this.departmentService.getDepartments().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (departments) => {
        // Añadir la opción "otro" al final de los departamentos
        const departmentsWithOther = [
          ...departments,
          {
            IdDepartamento: 'otro',
            Nombre: 'Otro departamento',
            id: 'otro',
            name: 'Otro departamento'
          }
        ];
        this.departments$.next(departmentsWithOther);
      },
      error: (error) => {
        console.error('Error cargando departamentos:', error);
        this.showNotification('error', 'Error', 'No se pudieron cargar los departamentos');
      }
    });
  }

  private async loadExistingUsernames() {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const querySnapshot = await getDocs(usersRef);
      this.existingUsernames = querySnapshot.docs
        .map(doc => doc.data()['Username'])
        .filter(username => username);
    } catch (error) {
      console.error('Error loading usernames:', error);
    }
  }

  private async checkAdminRestrictions() {
    try {
      const currentUser = this.auth.currentUser;
      if (currentUser) {
        const userDoc = await getDoc(doc(this.firestore, 'Usuario', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData && userData['Rol'] === 'admin') {
            this.currentAdminLevel = userData['NivelAdmin'];
            // Si es nivel 2 o 3, restringir las opciones
            if (userData['NivelAdmin'] === '2' || userData['NivelAdmin'] === '3') {
              this.isAdminLevelRestricted = true;
              // Si el usuario selecciona tipo admin, establecer nivel 2 por defecto
              if (this.selectedType === 'admin') {
                this.accountData.adminLevel = '2';
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error verificando restricciones de admin:', error);
    }
  }

  // Método para obtener los niveles de admin disponibles según el nivel del creador
  getAvailableAdminLevels(): string[] {
    if (this.isAdminLevelRestricted) {
      return ['2']; // Solo permite crear nivel 2
    }
    return this.adminLevels; // Devuelve todos los niveles
  }

  showNotification(type: 'success' | 'error', title: string, message: string) {
    const id = ++this.notificationId;
    this.notifications.push({ id, type, title, message });
    // Auto-eliminar después de 5 segundos
    setTimeout(() => {
      this.removeNotification(id);
    }, 5000);
  }

  removeNotification(id: number) {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  // Método actualizado para crear usuario sin functions
  async onSubmit(form: NgForm): Promise<void> {
    if (form.invalid || !this.selectedType) return;
    
    this.formSubmitted = true;
    this.isLoading = true;
    
    try {
      // Verificar disponibilidad del nombre de usuario
      if (this.existingUsernames.includes(this.accountData.username)) {
        this.showNotification(
          'error',
          'Error de registro',
          'Este nombre de usuario ya está en uso'
        );
        this.isLoading = false;
        this.formSubmitted = false;
        return;
      }
      
      // Obtener el usuario actual (creador)
      const currentUser = this.auth.currentUser;
      if (!currentUser) {
        this.showNotification(
          'error',
          'Error de autenticación',
          'No hay una sesión activa. Por favor, vuelve a iniciar sesión.'
        );
        this.isLoading = false;
        this.formSubmitted = false;
        this.router.navigate(['/login']);
        return;
      }
      
      // Determinar el departamento
      let departamentoValue = '';
      if (this.selectedType === 'worker') {
        departamentoValue = this.accountData.department === 'otro'
          ? this.accountData.customDepartment || ""
          : this.accountData.department;
      }
      
      // Determinar el nivel de admin según el usuario que lo crea
      let nivelAdmin = this.accountData.adminLevel;
      if (this.selectedType === 'admin' && this.isAdminLevelRestricted) {
        // Si está restringido, forzar nivel 2
        nivelAdmin = '2';
      }
      
      // Preparar los datos para la creación de usuario
      const userData = {
        email: this.accountData.email,
        password: this.accountData.password,
        firstName: this.accountData.firstName,
        lastName: this.accountData.lastName,
        username: this.accountData.username,
        phone: this.accountData.phone || "",
        department: departamentoValue,
        adminLevel: nivelAdmin,
        role: this.selectedType
      };
      
      // Llamar a nuestro servicio para crear el usuario sin afectar la sesión actual
      const result = await this.userService.createUserWithoutSession(userData, currentUser.uid);
      
      if (result && result.success) {
        this.showNotification(
          'success',
          'Cuenta creada',
          `La cuenta de ${this.selectedType} ha sido creada exitosamente. Se ha enviado un correo con las credenciales.`
        );
        form.resetForm();
        this.resetForm();
      } else {
        throw new Error('Error al crear usuario');
      }
    } catch (error: any) {
      console.error('Error detallado:', error);
      this.handleError(error);
    } finally {
      this.isLoading = false;
      this.formSubmitted = false;
    }
  }

  private handleError(error: any): void {
    let message = 'Error al crear la cuenta';
    let title = 'Error';
    
    if (error.code) {
      if (error.code === 'auth/email-already-in-use') {
        message = 'Este correo electrónico ya está registrado';
        title = 'Error de correo';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Correo electrónico inválido';
        title = 'Error de formato';
      } else if (error.code === 'auth/operation-not-allowed') {
        message = 'Operación no permitida';
        title = 'Error de permisos';
      } else if (error.code === 'auth/weak-password') {
        message = 'La contraseña es demasiado débil';
        title = 'Error de contraseña';
      }
    } else if (error.message) {
      message = error.message;
    }
    
    this.showNotification('error', title, message);
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  selectAccountType(type: 'worker' | 'admin'): void {
    this.selectedType = type;
    this.formSubmitted = false;
    this.resetForm();
    
    if (type === 'worker') {
      this.accountData.adminLevel = '';
      this.accountData.customAdminLevel = '';
    } else {
      this.accountData.department = '';
      this.accountData.customDepartment = '';
      // Si hay restricciones de nivel de admin, aplicarlas
      if (this.isAdminLevelRestricted) {
        this.accountData.adminLevel = '2';
      }
    }
  }

  resetForm(): void {
    this.accountData = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      username: '',
      password: '',
      department: '',
      customDepartment: '',
      adminLevel: '',
      customAdminLevel: ''
    };
    this.showCustomDepartment = false;
    this.showCustomAdminLevel = false;
    this.formSubmitted = false;
  }

  onDepartmentChange(event: any): void {
    this.showCustomDepartment = event.target.value === 'otro';
  }

  onAdminLevelChange(event: any): void {
    this.showCustomAdminLevel = event.target.value === 'otro' && !this.isAdminLevelRestricted;
  }

  goBack(): void {
    this.router.navigate(['/admin1']);
  }
}