import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

export const workerGuard: CanActivateFn = async (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const firestore = inject(Firestore);

  const user = auth.currentUser;

  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  try {
    // Verificar rol de trabajador
    const userDoc = await getDoc(doc(firestore, 'Usuario', user.uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      
      if (userData['Rol'] === 'worker') {
        return true; // Es trabajador, permite acceso
      }
    }

    // No es trabajador o documento no encontrado
    router.navigate(['/login']);
    return false;
  } catch (error) {
    console.error('Error verificando rol de trabajador:', error);
    router.navigate(['/login']);
    return false;
  }
};