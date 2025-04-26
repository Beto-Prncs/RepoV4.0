import { Component, OnInit, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  Auth,
  User,
} from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc
} from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';

interface Usuario {
  Correo: string;
  Rol: string;
  IdUsuario?: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})

export class LoginComponent implements OnInit{
  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
    private ngZone: NgZone,
    private authService: AuthService
  ) {}

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
      // Usar el servicio AuthService en lugar de llamar directamente
      const userCredential = await this.authService.signInWithEmailPassword(
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
      // Usar el método del AuthService en lugar de llamar directamente
      const result = await this.authService.loginWithGoogle();
      
      if (result.user) {
        await this.processUserLogin(result.user);
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
      
      // Verificar si el usuario existe en la base de datos usando el campo Correo
      const usuariosRef = collection(this.firestore, 'Usuario');
      const q = query(usuariosRef, where('Correo', '==', user.email));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const docSnapshot = querySnapshot.docs[0];
        const userData = docSnapshot.data() as Usuario;
        
        // Crear o actualizar documento utilizando el UID de autenticación como ID del documento
        const userDocRef = doc(this.firestore, 'Usuario', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (!userDocSnap.exists()) {
          // Si no existe documento con el UID como ID, crear uno nuevo
          await setDoc(userDocRef, {
            ...userData,
            Correo: user.email,
            IdUsuario: user.uid
          });
          console.log('Documento de usuario creado con UID como ID:', user.uid);
        }
        
        // Almacenar información de usuario
        localStorage.setItem('userRole', userData.Rol);
        localStorage.setItem('userEmail', userData.Correo);
        localStorage.setItem('userUid', user.uid);
        
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
              this.authService.signOut(); // Usar el método del servicio
          }
        });
      } else {
        await this.authService.signOut(); // Usar el método del servicio
        this.showAuthError('Usuario no registrado en el sistema');
      }
    } catch (error) {
      console.error('Error al procesar inicio de sesión:', error);
      await this.authService.signOut(); // Usar el método del servicio
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

  ngOnInit() {
    // Verificar si viene de un cierre de sesión forzado
    const urlParams = new URLSearchParams(window.location.search);
    const forceRefresh = urlParams.get('forceRefresh');
    
    if (forceRefresh === 'true') {
      // Asegurarse de que se complete el cierre de sesión
      this.auth.signOut().then(() => {
        // Limpiar todo el estado
        localStorage.clear();
        sessionStorage.clear();
        
        // Eliminar caché local de firebase
        indexedDB.deleteDatabase('firebaseLocalStorageDb');
        
        // Eliminar el parámetro para evitar bucles
        const url = new URL(window.location.href);
        url.searchParams.delete('forceRefresh');
        url.searchParams.delete('nocache');
        window.history.replaceState({}, document.title, url.pathname);
        
        // Configurar la persistencia
        this.authService.setPersistenceSession();
      }).catch(error => {
        console.error('Error en cierre de sesión:', error);
      });
    } else {
      // Configurar la persistencia cada vez que se carga el componente
      this.authService.setPersistenceSession()
        .catch(e => console.warn('Error configurando persistencia:', e));
    }
  }
}