import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  // Usar el método getCurrentUser que ya has implementado
  const user = await authService.getCurrentUser();
  
  if (user) {
    // Verificar que el usuario existe en Firestore
    const userData = await authService.getUserData(user.uid);
    
    if (userData) {
      return true; // Usuario autenticado y existe en Firestore
    } else {
      // Usuario no encontrado en Firestore
      await authService.signOut();
      router.navigate(['/login']);
      return false;
    }
  } else {
    // No hay usuario autenticado
    router.navigate(['/login']);
    return false;
  }
};