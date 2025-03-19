import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface CompanyConfig {
  name: string;
  language: string;
  timezone: string;
  theme: 'light' | 'dark';
  emailNotifications: boolean;
  autoSave: boolean;
  currency: string;
  dateFormat: string;
}
@Component({
  selector: 'app-worker-config',
  imports: [],
  templateUrl: './worker-config.component.html',
  styleUrl: './worker-config.component.css'
})
export class WorkerConfigComponent implements OnInit {
  activeSection: string = 'general';
  config: CompanyConfig = {
    name: '',
    language: 'Español',
    timezone: 'América/Ciudad de México',
    theme: 'light',
    emailNotifications: true,
    autoSave: false,
    currency: 'MXN',
    dateFormat: 'DD/MM/YYYY'
  };

  languages = ['Español', 'Inglés', 'Portugués', 'Francés'];
  timezones = [
    'América/Ciudad de México',
    'América/Buenos Aires',
    'América/Bogotá',
    'América/Santiago',
    'Europa/Madrid'
  ];
  currencies = ['MXN', 'USD', 'EUR', 'ARS', 'CLP'];
  dateFormats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

  constructor(private router: Router) {}

  ngOnInit() {
    // Cargar configuración guardada
    const savedConfig = localStorage.getItem('companyConfig');
    if (savedConfig) {
      this.config = { ...this.config, ...JSON.parse(savedConfig) };
    }
  }

  setActiveSection(section: string) {
    this.activeSection = section;
  }

  saveConfiguration() {
    try {
      localStorage.setItem('companyConfig', JSON.stringify(this.config));
      this.showNotification('Configuración guardada exitosamente');
    } catch (error) {
      this.showNotification('Error al guardar la configuración', 'error');
    }
  }

  resetConfiguration() {
    if (confirm('¿Estás seguro de que deseas restablecer la configuración?')) {
      localStorage.removeItem('companyConfig');
      this.config = {
        name: '',
        language: 'Español',
        timezone: 'América/Ciudad de México',
        theme: 'light',
        emailNotifications: true,
        autoSave: false,
        currency: 'MXN',
        dateFormat: 'DD/MM/YYYY'
      };
      this.showNotification('Configuración restablecida');
    }
  }

  private showNotification(message: string, type: 'success' | 'error' = 'success') {
    // Implementar lógica de notificación
    console.log(`${type}: ${message}`);
  }

  exportConfiguration() {
    const dataStr = JSON.stringify(this.config, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = 'company-config.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  goBack(): void {
    this.router.navigate(['/admin1']);
  }
}



