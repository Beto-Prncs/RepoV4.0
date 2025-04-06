import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TranslateStore } from '@ngx-translate/core'; // Añadido para resolver el error
import { Preferences } from '@capacitor/preferences';

// Interfaces para los modelos de datos
interface Usuario {
  IdUsuario: string;
  Username: string;
  Nombre: string;
  Correo: string;
  Departamento: string;
  Rol: string;
  Telefono: string;
  Foto_Perfil?: string;
}

// Interfaz para la configuración de la aplicación
interface AppConfig {
  name: string;
  language: string;
  timezone: string;
  theme: 'light' | 'dark';
  textSize: number;
  autoSave: boolean;
  currency: string;
  dateFormat: string;
  autoLogout: boolean;
  autoLogoutTime: string;
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
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './configuration.component.html',
  styleUrl: './configuration.component.css',
  providers: [TranslateStore]
})
export class ConfigurationComponent implements OnInit {
  activeSection: string = 'general';
  userRole: string = '';
  isDarkMode: boolean = false;
  inactivityTimer: any;
  currentUser: Usuario | null = null;
  config: AppConfig = {
    name: '',
    language: 'es',
    timezone: 'America/Mexico_City',
    theme: 'light',
    textSize: 2,
    autoSave: false,
    currency: 'MXN',
    dateFormat: 'DD/MM/YYYY',
    autoLogout: false,
    autoLogoutTime: '15',
    debugMode: false
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

  private router: Router = inject(Router);
  private translate: TranslateService = inject(TranslateService);

  ngOnInit() {
    // Cargar información del usuario desde Preferences
    this.loadUserInfo();
    // Cargar configuración desde Preferences
    this.loadConfiguration();
    // Configurar monitoreo de inactividad
    this.setupInactivityMonitor();
    // Inicializar idioma
    this.changeLanguage();
    // Aplicar tema
    this.applyTheme();
    // Aplicar tamaño de texto
    this.applyTextSize();
  }

  async loadUserInfo() {
    try {
      // Obtener información del usuario desde Preferences
      const userRole = await this.getPreference('userRole', 'worker');
      const userEmail = await this.getPreference('userEmail', 'demo@ejemplo.com');
      this.userRole = userRole;
      // Crear usuario demo para la UI
      this.currentUser = {
        IdUsuario: '1',
        Username: userEmail.split('@')[0],
        Nombre: 'Usuario de Demostración',
        Correo: userEmail,
        Departamento: 'Sistemas',
        Rol: userRole,
        Telefono: '555-1234',
        Foto_Perfil: undefined
      };
    } catch (error) {
      console.error('Error loading user info:', error);
      this.showToast('Error al cargar información de usuario', 'danger');
    }
  }

  async loadConfiguration() {
    try {
      // Intentar cargar configuración desde Preferences
      const savedConfigStr = await this.getPreference('appConfig', '');
      if (savedConfigStr) {
        const savedConfig = JSON.parse(savedConfigStr);
        this.config = { ...this.config, ...savedConfig };
      }

      // Aplicar configuración cargada
      this.isDarkMode = this.config.theme === 'dark';
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
      // Guardar en Preferences
      await this.setPreference('appConfig', JSON.stringify(this.config));
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
          autoSave: false,
          currency: 'MXN',
          dateFormat: 'DD/MM/YYYY',
          autoLogout: false,
          autoLogoutTime: '15',
          debugMode: false
        };
        // Eliminar de Preferences
        await Preferences.remove({ key: 'appConfig' });
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

  // Cambio de contraseña
  changePassword() {
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
    // Simular cambio de contraseña sin acceder a la base de datos
    this.showToast('Contraseña actualizada correctamente (simulado)', 'success');
  }

  // Limpiar caché
  async clearCache() {
    if (confirm('¿Estás seguro de que deseas limpiar la caché? Esto eliminará datos temporales.')) {
      try {
        // Limpiar datos temporales de la aplicación
        // Esto usaría la API FileSystem de Capacitor en una aplicación real
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
    // En lugar de cerrar sesión, solo mostramos un mensaje
    this.showToast('Tu sesión ha expirado por inactividad. En una aplicación real, se cerraría la sesión.', 'warning');
    // Reiniciar el temporizador
    this.setupAutoLogout();
  }

  goBack(): void {
    if (this.userRole === 'admin') {
      this.router.navigate(['/admin']);
    } else if (this.userRole === 'worker') {
      this.router.navigate(['/worker']);
    } else {
      this.router.navigate(['/']);
    }
  }

  // Métodos auxiliares para Capacitor Preferences
  private async getPreference(key: string, defaultValue: string): Promise<string> {
    const { value } = await Preferences.get({ key });
    return value || defaultValue;
  }

  private async setPreference(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }
}