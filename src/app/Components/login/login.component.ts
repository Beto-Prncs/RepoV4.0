import { Component, inject, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  Auth,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  User
} from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs
} from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';

interface Usuario {
  Correo: string;
  Rol: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})

export class LoginComponent {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private router: Router = inject(Router);
  private ngZone: NgZone = inject(NgZone);
  private authService: AuthService = inject(AuthService);

  usuario = {
    email: '',
    password: ''
  };

  showError = false;
  errorMessage = 'Usuario o contraseña incorrectos';

  onInputChange(): void {
    this.showError = false;
  }

  async Ingresa(): Promise<void> {
    try {
      const userCredential = await signInWithEmailAndPassword(
        this.auth,
        this.usuario.email,
        this.usuario.password
      );

      await this.processUserLogin(userCredential.user);
    } catch (error: any) {
      this.handleAuthError(error);
    }
  }

  async signInWithGoogle(): Promise<void> {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      
      const result = await signInWithPopup(this.auth, provider);
      
      if (result.user) {
        await this.processUserLogin(result.user).then((user) => {
          console.log(user);
        });
;
      } else {
        this.showAuthError('No se pudo obtener la información del usuario');
      }
    } catch (error: any) {
      this.handleGoogleAuthError(error);
    }
  }

  private async processUserLogin(user: User): Promise<void> {
    try {
      if (!user.email) {
        this.showAuthError('Correo electrónico no disponible');
        return;
      }

      // Primero, verificar si el usuario existe en la base de datos
      const usuariosRef = collection(this.firestore, 'Usuario');
      const q = query(usuariosRef, where('Correo', '==', user.email));
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data() as Usuario;
        
        // Almacenar información de usuario
        localStorage.setItem('userRole', userData.Rol);
        localStorage.setItem('userEmail', userData.Correo);

        // Redirección usando ngZone para manejar el contexto de Angular
        this.ngZone.run(() => {
          switch(userData.Rol) {
            case 'admin':
              this.router.navigate(['/admin1']);
              break;
            case 'worker':
              this.router.navigate(['/worker']);
              break;
            default:
              this.showAuthError('Usuario sin rol asignado');
              this.auth.signOut();
          }
        });
      } else {
        await this.auth.signOut();
        this.showAuthError('Usuario no registrado en el sistema');
      }
    } catch (error) {
      console.error('Error al procesar inicio de sesión:', error);
      await this.auth.signOut();
      this.showAuthError('Error al verificar permisos');
    }
  }

  private handleAuthError(error: any): void {
    this.showError = true;
    
    switch (error.code) {
      case 'auth/user-not-found':
        this.errorMessage = 'Usuario no encontrado';
        break;
      case 'auth/wrong-password':
        this.errorMessage = 'Contraseña incorrecta';
        break;
      case 'auth/invalid-email':
        this.errorMessage = 'Correo electrónico inválido';
        break;
      default:
        this.errorMessage = 'Error al iniciar sesión';
    }
    this.usuario.password = '';
  }

  private handleGoogleAuthError(error: any): void {
    this.showError = true;
    
    switch (error.code) {
      case 'auth/popup-blocked':
        this.errorMessage = 'El popup fue bloqueado. Por favor, permite ventanas emergentes.';
        break;
      case 'auth/popup-closed-by-user':
        this.errorMessage = 'Inicio de sesión cancelado';
        break;
      case 'auth/unauthorized-domain':
        this.errorMessage = 'Dominio no autorizado. Contacte al administrador.';
        break;
      default:
        this.errorMessage = 'Error al iniciar sesión con Google';
    }
  }

  private showAuthError(message: string): void {
    this.showError = true;
    this.errorMessage = message;
  }
}