import { Firestore, doc, getDoc, collection, query, where, getDocs, updateDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';
import { Injectable, inject } from '@angular/core';
import {
  Auth,
  User,
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Usuario } from '../models/interfaces';

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

  // Método para obtener un usuario por su nombre de usuario
  async getUserByUsername(username: string): Promise<Usuario | null> {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const q = query(usersRef, where('Username', '==', username));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        return {
          ...userDoc.data() as Usuario,
          IdUsuario: userDoc.id
        };
      }
      return null;
    } catch (error) {
      console.error('Error obteniendo usuario por username:', error);
      return null;
    }
  }

  // Método para obtener un usuario por su correo electrónico
  async getUserByEmail(email: string): Promise<Usuario | null> {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const q = query(usersRef, where('Correo', '==', email));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        return {
          ...userDoc.data() as Usuario,
          IdUsuario: userDoc.id
        };
      }
      return null;
    } catch (error) {
      console.error('Error obteniendo usuario por email:', error);
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
      const databases = ['firebaseLocalStorageDb', 'firebaseAuth', 'firebaseinstallations-database'];
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
      const dbNames = ['firebaseLocalStorageDb', 'firebase-auth-container',
      'firebase-installations-database'];
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

  // NUEVOS MÉTODOS PARA RECUPERACIÓN DE CONTRASEÑA
  
  /**
   * Envía un correo de recuperación de contraseña
   * @param email El correo electrónico del usuario
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    // Primero verificamos si el correo existe en la base de datos
    const user = await this.getUserByEmail(email);
    if (!user) {
      throw new Error('El correo electrónico no está registrado en el sistema');
    }
    
    // Si existe, enviamos el correo de recuperación
    return sendPasswordResetEmail(this.auth, email, {
      url: `${window.location.origin}/login`,
      handleCodeInApp: true
    });
  }

  /**
   * Verifica que el código de recuperación sea válido
   * @param code El código de recuperación de la URL
   */
  async verifyPasswordResetCode(code: string): Promise<string> {
    return verifyPasswordResetCode(this.auth, code);
  }

  /**
   * Confirma el cambio de contraseña
   * @param code El código de verificación
   * @param newPassword La nueva contraseña
   */
  async confirmPasswordReset(code: string, newPassword: string): Promise<void> {
    await confirmPasswordReset(this.auth, code, newPassword);
    
    // También actualizamos la contraseña en Firestore para mantener la coherencia
    try {
      // 1. Obtenemos el email del usuario usando el código de reset
      const email = await this.verifyPasswordResetCode(code);
      
      // 2. Buscamos el usuario por email
      const user = await this.getUserByEmail(email);
      if (user && user.IdUsuario) {
        // 3. Actualizamos la contraseña en Firestore
        const userRef = doc(this.firestore, 'Usuario', user.IdUsuario);
        await updateDoc(userRef, { Password: newPassword });
      }
    } catch (error) {
      console.error('Error actualizando contraseña en Firestore:', error);
      // No interrumpimos el flujo si este paso falla
    }
  }

  // Métodos para filtrado de usuarios según el nivel del administrador
  async getFilteredUsers(): Promise<Usuario[]> {
    try {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        throw new Error('No hay usuario autenticado');
      }
      
      const userData = await this.getUserData(currentUser.uid);
      if (!userData) {
        throw new Error('No se encontraron datos del usuario');
      }
      
      // Si es admin nivel 3, devolver solo sus usuarios creados
      if (userData.Rol === 'admin' && userData.NivelAdmin === '3') {
        return this.getUsersByCreator(currentUser.uid);
      }
      
      // Para otros casos, devolver todos los usuarios
      return this.getAllUsers();
    } catch (error) {
      console.error('Error al filtrar usuarios:', error);
      return [];
    }
  }

  async getUsersCreatedBy(adminId: string): Promise<Usuario[]> {
    try {
      const usersQuery = query(
        collection(this.firestore, 'Usuario'),
        where('createdBy', '==', adminId)
      );
      const snapshot = await getDocs(usersQuery);
      return snapshot.docs.map(doc => ({
        ...doc.data() as Usuario,
        IdUsuario: doc.id
      }));
    } catch (error) {
      console.error('Error obteniendo usuarios creados por el admin:', error);
      return [];
    }
  }

  async getWorkersCreatedBy(adminId: string): Promise<Usuario[]> {
    try {
      const workersQuery = query(
        collection(this.firestore, 'Usuario'),
        where('createdBy', '==', adminId),
        where('Rol', '==', 'worker')
      );
      const snapshot = await getDocs(workersQuery);
      return snapshot.docs.map(doc => ({
        ...doc.data() as Usuario,
        IdUsuario: doc.id
      }));
    } catch (error) {
      console.error('Error obteniendo trabajadores creados por el admin:', error);
      return [];
    }
  }

  async getUsersByCreator(creatorId: string): Promise<Usuario[]> {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const q = query(usersRef, where('createdBy', '==', creatorId));
      const querySnapshot = await getDocs(q);
      const users: Usuario[] = [];
      querySnapshot.forEach((doc) => {
        users.push({
          IdUsuario: doc.id,
          ...doc.data() as Omit<Usuario, 'IdUsuario'>
        });
      });
      return users;
    } catch (error) {
      console.error('Error obteniendo usuarios por creador:', error);
      return [];
    }
  }

  async getAllUsers(): Promise<Usuario[]> {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const querySnapshot = await getDocs(usersRef);
      const users: Usuario[] = [];
      querySnapshot.forEach((doc) => {
        users.push({
          IdUsuario: doc.id,
          ...doc.data() as Omit<Usuario, 'IdUsuario'>
        });
      });
      return users;
    } catch (error) {
      console.error('Error obteniendo todos los usuarios:', error);
      return [];
    }
  }
}
