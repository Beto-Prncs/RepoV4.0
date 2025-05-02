import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-recuperar-contrasena',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recuperar-contrasena.component.html',
  styleUrl: './recuperar-contrasena.component.scss'
})
export class RecuperarContrasenaComponent {
  // Estados generales
  step = 1; // 1: Solicitud de correo, 2: Confirmación envío, 3: Establecer nueva contraseña, 4: Éxito
  isLoading = false;
  message = '';
  messageType: 'error' | 'success' = 'error';
  
  // Datos del formulario
  email = '';
  newPassword = '';
  confirmPassword = '';
  showPassword = false;
  
  // Código de verificación (de la URL)
  actionCode = '';
  
  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}
  
  ngOnInit() {
    // Verificar si hay un código de acción en la URL (para reseteo de contraseña)
    this.route.queryParams.subscribe(params => {
      const oobCode = params['oobCode'];
      const mode = params['mode'];
      
      if (mode === 'resetPassword' && oobCode) {
        this.actionCode = oobCode;
        this.step = 3; // Pasar al formulario de nueva contraseña
        
        // Verificar que el código sea válido
        this.verifyActionCode(oobCode);
      }
    });
  }
  
  /**
   * Verifica que el código de acción sea válido
   */
  async verifyActionCode(code: string) {
    this.isLoading = true;
    this.message = '';
    
    try {
      // Verificar el código (esto también devuelve el email asociado)
      await this.authService.verifyPasswordResetCode(code);
      
      // Si llega aquí, el código es válido
      this.isLoading = false;
    } catch (error) {
      console.error('Error verificando código:', error);
      this.message = 'El enlace ha expirado o no es válido. Por favor, solicita un nuevo correo de recuperación.';
      this.messageType = 'error';
      this.isLoading = false;
      
      // Redirigir al paso 1 después de 3 segundos
      setTimeout(() => {
        this.step = 1;
      }, 3000);
    }
  }
  
  /**
   * Envía el correo de recuperación
   */
  async sendRecoveryEmail() {
    if (!this.email) {
      this.message = 'Por favor, ingresa tu correo electrónico';
      this.messageType = 'error';
      return;
    }
    
    this.isLoading = true;
    this.message = '';
    
    try {
      await this.authService.sendPasswordResetEmail(this.email);
      
      // Mostrar mensaje de éxito
      this.step = 2;
    } catch (error: any) {
      this.message = error.message || 'Error al enviar el correo. Verifica que el correo electrónico sea correcto.';
      this.messageType = 'error';
    } finally {
      this.isLoading = false;
    }
  }
  
  /**
   * Establece la nueva contraseña
   */
  async resetPassword() {
    if (!this.newPassword || !this.confirmPassword) {
      this.message = 'Por favor, completa todos los campos';
      this.messageType = 'error';
      return;
    }
    
    if (this.newPassword !== this.confirmPassword) {
      this.message = 'Las contraseñas no coinciden';
      this.messageType = 'error';
      return;
    }
    
    if (this.newPassword.length < 6) {
      this.message = 'La contraseña debe tener al menos 6 caracteres';
      this.messageType = 'error';
      return;
    }
    
    this.isLoading = true;
    this.message = '';
    
    try {
      // Confirmar el cambio de contraseña
      await this.authService.confirmPasswordReset(this.actionCode, this.newPassword);
      
      // Mostrar mensaje de éxito
      this.step = 4;
    } catch (error: any) {
      this.message = error.message || 'Error al cambiar la contraseña. Por favor, intenta nuevamente.';
      this.messageType = 'error';
    } finally {
      this.isLoading = false;
    }
  }
  
  /**
   * Navega a la página de login
   */
  goToLogin() {
    this.router.navigate(['/login']);
  }
  
  /**
   * Muestra/oculta la contraseña
   */
  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}
