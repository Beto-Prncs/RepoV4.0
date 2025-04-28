
import { Firestore, doc, getDoc, collection, query, where, getDocs } from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';
import { Injectable, inject } from '@angular/core';
import { 
  Auth,
  User, 
  browserSessionPersistence, 
  setPersistence, 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider 
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export interface Usuario {
  IdUsuario: string;
  Nombre: string;
  Correo: string;
  Departamento: string;
  Rol: string;
  Username: string;
  Telefono?: string;
  Foto_Perfil?: string;
  NivelAdmin?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private router: Router = inject(Router);
  private currentUserSubject = new BehaviorSubject<Usuario | null>(null);

  currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    this.initAuthListener();
  }

  private initAuthListener(): void {
    this.auth.onAuthStateChanged(async (user) => {
        if (user) {
            const userData = await this.getUserData(user.uid);
            this.currentUserSubject.next(userData);
        } else {
            this.currentUserSubject.next(null);
        }
    });
  }

  async getUserData(uid: string): Promise<Usuario | null> {
    try {
      const userDoc = await getDoc(doc(this.firestore, 'Usuario', uid));
      if (userDoc.exists()) {
        return {
          ...userDoc.data() as Usuario,
          IdUsuario: uid
        };
      }
      return null;
    } catch (error) {
      console.error('Error obteniendo datos del usuario:', error);
      return null;
    }
  }

  async isAdmin(uid: string): Promise<boolean> {
    const userData = await this.getUserData(uid);
    return userData?.Rol === 'admin';
  }

  async isWorker(uid: string): Promise<boolean> {
    const userData = await this.getUserData(uid);
    return userData?.Rol === 'worker';
  }

  async getCurrentUser(): Promise<User | null> {
    return new Promise((resolve) => {
      const unsubscribe = this.auth.onAuthStateChanged(user => {
        unsubscribe();
        resolve(user);
      });
    });
  }


  async getUserToken(): Promise<string | null> {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        return null;
      }
      return await user.getIdToken();
    } catch (error) {
      console.error('Error obteniendo token:', error);
      return null;
    }
  }


  async signOut(): Promise<void> {
    try {
      // Capturar la URL actual para preservar la ruta base
      const baseUrl = window.location.origin;
      
      // 1. Limpieza de estados locales
      this.currentUserSubject.next(null);
      localStorage.clear();
      sessionStorage.clear();
      
      // 2. Limpieza específica de Firebase
      await this.auth.signOut();
      
      // 3. Limpiar IndexedDB de manera más efectiva
      const databases = ['firebaseLocalStorageDb', 'firebaseAuth', 'firebase-installations-database'];
      databases.forEach(dbName => {
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        deleteRequest.onsuccess = () => console.log(`${dbName} eliminada correctamente`);
        deleteRequest.onerror = () => console.warn(`Error al eliminar ${dbName}`);
      });
      
      // 4. Redirección con parámetros para forzar recarga y evitar caché
      setTimeout(() => {
        window.location.href = `${baseUrl}/login?forceRefresh=true&t=${Date.now()}`;
      }, 300); // Pequeño retraso para asegurar que todo se limpie
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      // Redirección en caso de error
      window.location.href = '/login?error=true&t=' + Date.now();
    }
  }
  private clearFirebaseTokens(): void {
    // Eliminar tokens específicos de Firebase Auth
    const keysToRemove = [];
    
    // Buscar en localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
          key.startsWith('firebase:') || 
          key.includes('firebaseLocalStorageDb') || 
          key.includes('firebaseAuth')
      )) {
        keysToRemove.push(key);
      }
    }
    
    // Eliminar las claves identificadas
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  private clearAuthCookies(): void {
    if (typeof document === 'undefined') return;
    
    // Lista ampliada de cookies a limpiar
    const cookiePrefixes = ['firebase', 'firebaseAuth', 'G_AUTH', 'G_AUTHUSER', 'goog', 'google'];
    
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      
      // Verificar si la cookie está relacionada con la autenticación
      const shouldClear = cookiePrefixes.some(prefix => 
        name.toLowerCase().includes(prefix.toLowerCase()));
      
      if (shouldClear) {
        // Eliminar la cookie estableciendo una fecha de expiración pasada
        // Intentar con diferentes paths y dominios para ser exhaustivos
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`;
      }
    }
  }

  private async cleanGoogleAuth(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    const google = (window as any).google;
    if (!google?.accounts?.id) return;
    
    try {
      // Revocar todos los tokens de Google
      google.accounts.id.disableAutoSelect();
      
      // Intentar revocar el token actual
      const currentUser = this.auth.currentUser;
      if (currentUser?.email) {
        return new Promise<void>((resolve) => {
          google.accounts.id.revoke(currentUser.email, () => {
            console.log('Google token revocado exitosamente');
            resolve();
          });
        });
      }
    } catch (error) {
      console.warn('Google auth cleanup failed (non-critical):', error);
    }
  }
  private async clearIndexedDB(): Promise<void> {
    try {
      // Lista de nombres de bases de datos relacionadas con Firebase
      const dbNames = ['firebaseLocalStorageDb', 'firebase-auth-container', 'firebase-installations-database'];
      
      for (const dbName of dbNames) {
        try {
          // Intentar eliminar la base de datos
          await window.indexedDB.deleteDatabase(dbName);
        } catch (e) {
          console.warn(`No se pudo eliminar la base de datos ${dbName}:`, e);
        }
      }
    } catch (error) {
      console.warn('Error al limpiar IndexedDB:', error);
    }
  }

  private async cleanCapacitorAuth(): Promise<void> {
    try {
      // Cerrar cualquier ventana del navegador abierta (para flujo OAuth)
      if (Capacitor.isPluginAvailable('Browser')) {
        await Browser.close();
      }
    } catch (e) {
      console.log('No se pudo cerrar el navegador en Capacitor:', e);
    }
  }
  // En auth.service.ts
  isAuthenticated(): boolean {
    return this.auth.currentUser !== null;
  }




  // Método para establecer la persistencia
async setPersistenceSession(): Promise<void> {
  return setPersistence(this.auth, browserSessionPersistence);
}

// Método para iniciar sesión con correo/contraseña
async signInWithEmailPassword(email: string, password: string) {
  return signInWithEmailAndPassword(this.auth, email, password);
}

// Método para iniciar sesión con Google
async loginWithGoogle() {
  await this.setPersistenceSession();
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  return signInWithPopup(this.auth, provider);
}

}