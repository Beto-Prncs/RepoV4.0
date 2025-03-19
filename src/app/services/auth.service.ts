import { Injectable, inject } from '@angular/core';
import { Auth, User } from '@angular/fire/auth';
import { Firestore, doc, getDoc, collection, query, where, getDocs } from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

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
      await this.auth.signOut();
      this.currentUserSubject.next(null);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      throw error;
    }
  }
}