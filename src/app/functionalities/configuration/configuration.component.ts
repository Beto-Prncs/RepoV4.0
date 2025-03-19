import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';

// Interfaces importadas del modelo de datos
// Asumimos que estas interfaces ya están definidas en tu aplicación
interface Usuario {
  IdUsuario: string;
  Username: string;
  Nombre: string;
  Correo: string;
  Departamento: string;
  Rol: string;
  Telefono: string;
  Foto_Perfil?: string;
  NivelAdmin?: string;
  IdDepartamento?: string;
}

interface Empresa {
  IdEmpresa: string;
  Nombre: string;
  Correo: string;
  Direccion: string;
  Sector: string;
}

interface Reporte {
  IdReporte?: string;
  IdEmpresa: string;
  IdUsuario: string;
  Tipo_Trabajo: string;
  estado: string;
  fecha: Date;
  jobDescription: string;
  location: string;
  priority: string;
  departamento: string;
  fechaCompletado?: Date;
  descripcionCompletado?: string;
  fechaActualizacion?: Date;
}

interface Department {
  id: string;
  name: string;
}

// Interfaz para la configuración de la aplicación
interface AppConfig {
  name: string;
  language: string;
  timezone: string;
  theme: 'light' | 'dark';
  textSize: number;
  emailNotifications: boolean;
  notificationEmail: string;
  pushNotifications: boolean;
  taskReminders: boolean;
  reminderNewTasks: boolean;
  reminderDeadlines: boolean;
  reminderUpdates: boolean;
  autoSave: boolean;
  currency: string;
  dateFormat: string;
  autoLogout: boolean;
  autoLogoutTime: string;
  dataSync: boolean;
  syncInterval: string;
  debugMode?: boolean;
}

interface Language {
  code: string;
  name: string;
}

interface Timezone {
  value: string;
  label: string;
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

interface DateFormat {
  value: string;
  example: string;
}

@Component({
  selector: 'app-configuration',
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './configuration.component.html',
  styleUrl: './configuration.component.css'
})
export class ConfigurationComponent implements OnInit {
  activeSection: string = 'general';
  userRole: string = '';
  isDarkMode: boolean = false;
  storageUsage: number = 0.35; // Ejemplo: 35% de uso
  storageUsageText: string = '';
  inactivityTimer: any;
  currentUser: Usuario | null = null;
  currentDepartment: Department | null = null;

  config: AppConfig = {
    name: '',
    language: 'es',
    timezone: 'America/Mexico_City',
    theme: 'light',
    textSize: 2,
    emailNotifications: true,
    notificationEmail: '',
    pushNotifications: false,
    taskReminders: true,
    reminderNewTasks: true,
    reminderDeadlines: true,
    reminderUpdates: true,
    autoSave: false,
    currency: 'MXN',
    dateFormat: 'DD/MM/YYYY',
    autoLogout: false,
    autoLogoutTime: '15',
    dataSync: true,
    syncInterval: '15'
  };

  languages: Language[] = [
    { code: 'es', name: 'Español' },
    { code: 'en', name: 'English' },
    { code: 'pt', name: 'Português' },
    { code: 'fr', name: 'Français' }
  ];

  timezones: Timezone[] = [
    { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
    { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
    { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
    { value: 'America/Santiago', label: 'Santiago (GMT-4)' },
    { value: 'Europe/Madrid', label: 'Madrid (GMT+1)' }
  ];

  currencies: Currency[] = [
    { code: 'MXN', name: 'Peso Mexicano', symbol: '$' },
    { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'ARS', name: 'Peso Argentino', symbol: '$' },
    { code: 'CLP', name: 'Peso Chileno', symbol: '$' }
  ];

  dateFormats: DateFormat[] = [
    { value: 'DD/MM/YYYY', example: '31/12/2023' },
    { value: 'MM/DD/YYYY', example: '12/31/2023' },
    { value: 'YYYY-MM-DD', example: '2023-12-31' }
  ];

  private firestore: AngularFirestore = inject(AngularFirestore);
  private afAuth: AngularFireAuth = inject(AngularFireAuth);
  
  constructor(
    private router: Router,
    private translate: TranslateService
  ) {}

  async ngOnInit() {
    await this.loadUserInfo();
    await this.loadConfiguration();
    this.setupInactivityMonitor();
    this.calculateStorageUsage();
    
    // Iniciar servicios según la configuración
    if (this.config.autoLogout) {
      this.setupAutoLogout();
    }

    // Inicializar idioma
    this.changeLanguage();
  }

  async loadUserInfo() {
    try {
      const user = await this.afAuth.currentUser;
      if (user) {
        const userDoc = await this.firestore
          .collection<Usuario>('Usuario')
          .doc(user.uid)
          .get()
          .toPromise();
        
        if (userDoc?.exists) {
          this.currentUser = userDoc.data() as Usuario;
          this.userRole = this.currentUser.Rol;
          this.config.notificationEmail = this.currentUser.Correo;
          
          // Cargar departamento si tiene IdDepartamento
          if (this.currentUser.IdDepartamento) {
            const deptDoc = await this.firestore
              .collection<Department>('Departamento')
              .doc(this.currentUser.IdDepartamento)
              .get()
              .toPromise();
              
            if (deptDoc?.exists) {
              this.currentDepartment = deptDoc.data() as Department;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading user info:', error);
      this.showToast('Error al cargar información de usuario', 'danger');
    }
  }

  async loadConfiguration() {
    try {
      // Primero intentar cargar desde Firestore
      const user = await this.afAuth.currentUser;
      if (user) {
        const configDoc = await this.firestore
          .collection('userConfigurations')
          .doc(user.uid)
          .get()
          .toPromise();
        
        if (configDoc?.exists) {
          const savedConfig = configDoc.data() as AppConfig;
          this.config = { ...this.config, ...savedConfig };
        } else {
          // Si no existe en Firestore, intentar cargar desde almacenamiento local
          const savedConfigStr = localStorage.getItem('appConfig');
          if (savedConfigStr) {
            this.config = { ...this.config, ...JSON.parse(savedConfigStr) };
          }
        }
      }
      
      // Aplicar configuración cargada
      this.isDarkMode = this.config.theme === 'dark';
      this.applyTheme();
      this.applyTextSize();
      
    } catch (error) {
      console.error('Error loading configuration:', error);
      this.showToast('Error al cargar la configuración', 'danger');
    }
  }

  setActiveSection(section: string) {
    this.activeSection = section;
  }

  async saveConfiguration() {
    try {
      const user = await this.afAuth.currentUser;
      
      // Guardar en Firestore si el usuario está autenticado
      if (user) {
        await this.firestore
          .collection('userConfigurations')
          .doc(user.uid)
          .set(this.config, { merge: true });
      }
      
      // Guardar también localmente para acceso sin conexión
      localStorage.setItem('appConfig', JSON.stringify(this.config));
      
      this.showToast('Configuración guardada exitosamente', 'success');
      
      // Aplicar cambios
      this.applyTheme();
      this.applyTextSize();
      
    } catch (error) {
      console.error('Error saving configuration:', error);
      this.showToast('Error al guardar la configuración', 'danger');
    }
  }

  async resetConfiguration() {
    if (confirm('¿Estás seguro de que deseas restablecer la configuración?')) {
      try {
        // Restablecer a valores predeterminados
        this.config = {
          name: '',
          language: 'es',
          timezone: 'America/Mexico_City',
          theme: 'light',
          textSize: 2,
          emailNotifications: true,
          notificationEmail: this.currentUser?.Correo || '',
          pushNotifications: false,
          taskReminders: true,
          reminderNewTasks: true,
          reminderDeadlines: true,
          reminderUpdates: true,
          autoSave: false,
          currency: 'MXN',
          dateFormat: 'DD/MM/YYYY',
          autoLogout: false,
          autoLogoutTime: '15',
          dataSync: true,
          syncInterval: '15'
        };
        
        // Eliminar de Firestore
        const user = await this.afAuth.currentUser;
        if (user) {
          await this.firestore
            .collection('userConfigurations')
            .doc(user.uid)
            .delete();
        }
        
        // Eliminar de almacenamiento local
        localStorage.removeItem('appConfig');
        
        // Aplicar configuración predeterminada
        this.isDarkMode = false;
        this.applyTheme();
        this.applyTextSize();
        this.changeLanguage();
        
        this.showToast('Configuración restablecida correctamente', 'success');
      } catch (error) {
        console.error('Error resetting configuration:', error);
        this.showToast('Error al restablecer la configuración', 'danger');
      }
    }
  }

  showToast(message: string, color: string = 'primary') {
    // Implementación simple de alerta
    alert(message);
  }

  // Funcionalidad de cambio de idioma
  changeLanguage() {
    this.translate.use(this.config.language);
  }

  // Funcionalidad de tema oscuro/claro
  toggleDarkMode() {
    this.config.theme = this.isDarkMode ? 'dark' : 'light';
    this.applyTheme();
  }

  applyTheme() {
    document.body.classList.toggle('dark', this.config.theme === 'dark');
  }

  // Tamaño de texto
  applyTextSize() {
    const sizeClass = `text-size-${this.config.textSize}`;
    document.body.classList.remove('text-size-1', 'text-size-2', 'text-size-3');
    document.body.classList.add(sizeClass);
  }

  // Funcionalidad de notificaciones push
  async updatePushNotifications() {
    if (this.config.pushNotifications) {
      this.showToast('Las notificaciones push se han habilitado', 'success');
    }
  }

  // Cambio de contraseña
  async changePassword() {
    const currentPassword = prompt('Ingrese su contraseña actual:');
    if (!currentPassword) return;
    
    const newPassword = prompt('Ingrese su nueva contraseña:');
    if (!newPassword) return;
    
    const confirmPassword = prompt('Confirme su nueva contraseña:');
    if (!confirmPassword) return;
    
    if (newPassword !== confirmPassword) {
      this.showToast('Las contraseñas no coinciden', 'danger');
      return;
    }
    
    if (newPassword.length < 6) {
      this.showToast('La contraseña debe tener al menos 6 caracteres', 'danger');
      return;
    }
    
    try {
      const user = await this.afAuth.currentUser;
      if (user && user.email) {
        // Reautenticar para cambiar contraseña
        const credentials = await this.afAuth.signInWithEmailAndPassword(
          user.email, 
          currentPassword
        );
        
        await user.updatePassword(newPassword);
        this.showToast('Contraseña actualizada correctamente', 'success');
      }
    } catch (error: any) {
      console.error('Error changing password:', error);
      if (error.code === 'auth/wrong-password') {
        this.showToast('Contraseña actual incorrecta', 'danger');
      } else {
        this.showToast('Error al cambiar la contraseña', 'danger');
      }
    }
  }

  // Cierre de sesión
  async logout() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      try {
        // Actualizar último estado antes de salir
        if (this.config.autoSave) {
          await this.saveConfiguration();
        }
        
        // Limpiar sesión de Firebase
        await this.afAuth.signOut();
        
        // Limpiar datos de sesión local
        localStorage.removeItem('userRole');
        localStorage.removeItem('userEmail');
        
        // Redireccionar al login
        this.router.navigate(['/login']);
      } catch (error) {
        console.error('Error during logout:', error);
        this.showToast('Error al cerrar sesión', 'danger');
      }
    }
  }

  // Cálculo de uso de almacenamiento
  calculateStorageUsage() {
    // Simulación del cálculo de almacenamiento
    this.storageUsageText = `${(this.storageUsage * 100).toFixed(1)}% de espacio utilizado`;
  }

  // Limpiar caché
  clearCache() {
    if (confirm('¿Estás seguro de que deseas limpiar la caché? Esto eliminará datos temporales.')) {
      try {
        // Aquí se implementaría la lógica para limpiar el caché
        // Por ejemplo, borrar datos temporales en localStorage
        this.storageUsage = 0.05; // Reducir después de limpiar
        this.calculateStorageUsage();
        
        this.showToast('Caché limpiada correctamente', 'success');
      } catch (error) {
        console.error('Error clearing cache:', error);
        this.showToast('Error al limpiar caché', 'danger');
      }
    }
  }

  // Exportar configuración
  exportConfiguration() {
    const dataStr = JSON.stringify(this.config, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = 'app-config.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  // Monitoreo de inactividad para auto-logout
  setupInactivityMonitor() {
    if (this.config.autoLogout) {
      this.setupAutoLogout();
    }
  }

  setupAutoLogout() {
    // Limpiar cualquier temporizador existente
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    
    // Eventos para reiniciar el temporizador de inactividad
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    // Tiempo de inactividad en minutos convertido a milisegundos
    const timeoutInMinutes = parseInt(this.config.autoLogoutTime);
    const timeoutInMs = timeoutInMinutes * 60 * 1000;
    
    const resetInactivityTimer = () => {
      if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer);
      }
      this.inactivityTimer = setTimeout(() => this.autoLogoutDueToInactivity(), timeoutInMs);
    };
    
    // Registrar eventos para reiniciar el temporizador
    events.forEach(event => {
      window.addEventListener(event, resetInactivityTimer, false);
    });
    
    // Iniciar el temporizador
    resetInactivityTimer();
  }

  autoLogoutDueToInactivity() {
    if (confirm('Tu sesión ha expirado por inactividad. ¿Deseas cerrar sesión o continuar?')) {
      this.logout();
    } else {
      // Reiniciar el temporizador
      this.setupAutoLogout();
    }
  }

  goBack(): void {
    if (this.userRole === 'admin') {
      this.router.navigate(['/admin1']);
    } else if (this.userRole === 'worker') {
      this.router.navigate(['/worker']);
    } else {
      this.router.navigate(['/']);
    }
  }
}