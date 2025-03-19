import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  where
} from '@angular/fire/firestore';
import { Usuario } from '../../models/interfaces';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './create-accounts.component.html',
  styleUrl: './create-accounts.component.css'
})
export class CreateAccountsComponent implements OnInit {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private router: Router = inject(Router);

  selectedType: 'worker' | 'admin' | null = null;
  showPassword: boolean = false;
  isLoading: boolean = false;
  formSubmitted: boolean = false;
  showCustomDepartment: boolean = false;
  showCustomAdminLevel: boolean = false;
  existingUsernames: string[] = [];
  notifications: Notification[] = [];
  private notificationId = 0;
  
  departments: string[] = [
    'sistemas',
    'diseño',
    'marketing',
    'ventas',
    'otro'
  ];
  
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

  ngOnInit() {
    this.loadInitialData();
  }

  private async loadInitialData() {
    try {
      await this.loadExistingUsernames();
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
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

  async onSubmit(form: NgForm): Promise<void> {
    if (form.invalid || !this.selectedType) return;

    this.formSubmitted = true;
    this.isLoading = true;

    try {
      // Verificar disponibilidad del nombre de usuario
      if (!(await this.isUsernameAvailable(this.accountData.username))) {
        this.showNotification(
          'error',
          'Error de registro',
          'Este nombre de usuario ya está en uso'
        );
        return;
      }

      // Crear usuario en Authentication
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        this.accountData.email,
        this.accountData.password
      );

      // Crear documento de usuario en Firestore
      const userData: Usuario = {
        IdUsuario: userCredential.user.uid,
        Nombre: `${this.accountData.firstName} ${this.accountData.lastName}`,
        Correo: this.accountData.email,
        Username: this.accountData.username,
        Foto_Perfil: "",
        Rol: this.selectedType,
        Telefono: this.accountData.phone || "",
        Departamento: this.selectedType === 'worker' ? 
          (this.accountData.department === 'otro' ? 
            this.accountData.customDepartment || "" : 
            this.accountData.department) : 
          "",
        NivelAdmin: this.selectedType === 'admin' ? 
          (this.accountData.adminLevel === 'otro' ? 
            this.accountData.customAdminLevel || "" : 
            this.accountData.adminLevel) : 
          ""
      };

      await setDoc(doc(this.firestore, 'Usuario', userCredential.user.uid), userData);

      this.showNotification(
        'success',
        'Cuenta creada',
        `La cuenta de ${this.selectedType} ha sido creada exitosamente`
      );

      form.resetForm();
      this.resetForm();
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

    this.showNotification('error', title, message);
  }

  // ... resto de métodos de la clase permanecen igual

  private async isUsernameAvailable(username: string): Promise<boolean> {
    try {
      const userQuery = query(
        collection(this.firestore, 'Usuario'),
        where('Username', '==', username)
      );
      const querySnapshot = await getDocs(userQuery);
      return querySnapshot.empty;
    } catch (error) {
      console.error('Error checking username:', error);
      return false;
    }
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
    this.showCustomAdminLevel = event.target.value === 'otro';
  }

  goBack(): void {
    this.router.navigate(['/admin1']);
  }
}