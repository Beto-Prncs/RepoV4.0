import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, createUserWithEmailAndPassword, sendEmailVerification } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  getDoc
} from '@angular/fire/firestore';
// Importar funciones para envío de correo
import { getFunctions, httpsCallable } from '@angular/fire/functions';
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
  styleUrls: [
    './create-accounts.component.scss',
    './create-accounts-animations.css'
  ]
})
export class CreateAccountsComponent implements OnInit {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private router: Router = inject(Router);
  private functions = getFunctions();

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

  async ngOnInit() {
    await this.loadInitialData();
    await this.checkAdminRestrictions();
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
          'No hay una sesión activa'
        );
        this.isLoading = false;
        this.formSubmitted = false;
        return;
      }
      
      // Determinar el nivel de admin según el usuario que lo crea
      let nivelAdmin = this.accountData.adminLevel;
      if (this.selectedType === 'admin' && this.isAdminLevelRestricted) {
        // Si está restringido, forzar nivel 2
        nivelAdmin = '2';
      }
      
      // IMPORTANTE: Guardar la contraseña antes de crear el usuario en Authentication
      const plainPassword = this.accountData.password;
      
      // Crear usuario en Authentication
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        this.accountData.email,
        plainPassword // Usar la contraseña sin modificar
      );
      
      // Enviar correo de verificación
      await sendEmailVerification(userCredential.user);
      
      // Crear documento de usuario en Firestore con el createdBy y la contraseña en texto plano
      const userData: Usuario = {
        IdUsuario: userCredential.user.uid,
        Nombre: `${this.accountData.firstName} ${this.accountData.lastName}`,
        Correo: this.accountData.email,
        Username: this.accountData.username,
        // IMPORTANTE: Almacenar la contraseña en texto plano para permitir login con username
        Password: plainPassword, // Guardar la misma contraseña que se usó en Firebase Auth
        Foto_Perfil: "",
        Rol: this.selectedType,
        Telefono: this.accountData.phone || "",
        Departamento: this.selectedType === 'worker' ?
          (this.accountData.department === 'otro' ?
            this.accountData.customDepartment || "" :
            this.accountData.department) :
          "",
        NivelAdmin: this.selectedType === 'admin' ? nivelAdmin : "",
        createdBy: currentUser.uid // Añadir el ID del creador
      };
      
      await setDoc(doc(this.firestore, 'Usuario', userCredential.user.uid), userData);
      
      // Enviar correo de bienvenida con credenciales
      await this.sendWelcomeEmail(userData);
      
      this.showNotification(
        'success',
        'Cuenta creada',
        `La cuenta de ${this.selectedType} ha sido creada exitosamente. Se ha enviado un correo con las credenciales.`
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

  // Método para enviar correo de bienvenida
  private async sendWelcomeEmail(user: Usuario): Promise<void> {
    try {
      // Opción 1: Usando Cloud Functions (recomendado)
      const sendWelcomeEmail = httpsCallable(this.functions, 'sendWelcomeEmail');
      await sendWelcomeEmail({
        email: user.Correo,
        name: user.Nombre,
        username: user.Username,
        password: user.Password, // La contraseña se enviará en texto claro solo en el correo
        role: user.Rol
      });

      console.log('Correo de bienvenida enviado exitosamente');
    } catch (error) {
      console.error('Error enviando correo de bienvenida:', error);
      // No interrumpir el flujo si el correo falla
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