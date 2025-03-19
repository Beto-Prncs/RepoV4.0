import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const firestore = inject(Firestore);

  const user = auth.currentUser;

  if (user) {
    try {
      // Verificar que el usuario existe en Firestore
      const userDoc = await getDoc(doc(firestore, 'Usuario', user.uid));
      console.log('Usuario encontrado en Firestore:', userDoc.exists()); 
      if (userDoc.exists()) {
        return true; // Usuario autenticado y existe en Firestore
      } else {
        // Usuario no encontrado en Firestore
        await auth.signOut();
        router.navigate(['/login']);
        return false;
      }
    } catch (error) {
      console.error('Error verificando usuario:', error);
      await auth.signOut();
      router.navigate(['/login']);
      return false;
    }
  } else {
    // No hay usuario autenticado
    router.navigate(['/login']);
    return false;
  }
};