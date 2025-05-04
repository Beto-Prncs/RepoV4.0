import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { getFunctions, httpsCallable } from '@angular/fire/functions';

@Component({
  selector: 'app-recuperar-contrasena',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recuperar-contrasena.component.html',
  styleUrl: './recuperar-contrasena.component.scss'
})
export class RecuperarContrasenaComponent implements OnInit {
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
      const email = await this.authService.verifyPasswordResetCode(code);
      this.email = email; // Guardar el email para usarlo después
      this.isLoading = false;
    } catch (error: any) {
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
   * Envía el correo de recuperación usando Firebase Functions
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
      // Usar la función de Cloud Functions para enviar el correo personalizado
      const functions = getFunctions();
      const sendPasswordResetEmail = httpsCallable(functions, 'sendPasswordResetEmail');
      
      const result = await sendPasswordResetEmail({ email: this.email });
      
      // Verificar el resultado
      const responseData = result.data as any;
      
      if (responseData && responseData.success) {
        // Mostrar mensaje de éxito
        this.step = 2;
      } else {
        throw new Error('Error al enviar el correo de recuperación');
      }
    } catch (error: any) {
      console.error('Error al enviar correo:', error);
      
      // Extraer mensaje de error
      let errorMessage = 'Error al enviar el correo. Verifica que el correo electrónico sea correcto.';
      
      if (error.data && error.data.message) {
        errorMessage = error.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.details && error.details.message) {
        errorMessage = error.details.message;
      }
      
      // Si el correo no existe, manejar ese error específico
      if (error.code === 'functions/not-found' || 
          (error.details && error.details.code === 'not-found')) {
        errorMessage = 'No existe una cuenta con este correo electrónico.';
      }
      
      this.message = errorMessage;
      this.messageType = 'error';
    } finally {
      this.isLoading = false;
    }
  }
  
  /**
   * Establece la nueva contraseña y la actualiza en Firestore
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
      // Confirmar el cambio de contraseña en Firebase Authentication
      await this.authService.confirmPasswordReset(this.actionCode, this.newPassword);
      
      // También actualizar la contraseña en Firestore usando Cloud Functions
      const functions = getFunctions();
      const afterPasswordReset = httpsCallable(functions, 'afterPasswordReset');
      
      const result = await afterPasswordReset({
        email: this.email,
        newPassword: this.newPassword
      });
      
      // Verificar resultado
      const responseData = result.data as any;
      
      if (responseData && responseData.success) {
        // Mostrar mensaje de éxito
        this.step = 4;
      } else {
        throw new Error('Error al actualizar la contraseña en la base de datos');
      }
    } catch (error: any) {
      console.error('Error al cambiar la contraseña:', error);
      
      // Extraer mensaje de error
      let errorMessage = 'Error al cambiar la contraseña. Por favor, intenta nuevamente.';
      
      if (error.data && error.data.message) {
        errorMessage = error.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.details && error.details.message) {
        errorMessage = error.details.message;
      }
      
      this.message = errorMessage;
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