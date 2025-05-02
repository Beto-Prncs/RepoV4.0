import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  // Usar el método getCurrentUser que ya has implementado
  const user = await authService.getCurrentUser();
  
  if (user) {
    // Verificar que el usuario es admin
    const isAdmin = await authService.isAdmin(user.uid);
    
    if (isAdmin) {
      return true; // Usuario es admin, permite acceso
    } else {
      // No es admin, verificar si es trabajador
      const isWorker = await authService.isWorker(user.uid);
      
      if (isWorker) {
        router.navigate(['/worker']);
      } else {
        router.navigate(['/login']);
      }
      
      return false;
    }
  } else {
    // No hay usuario autenticado
    router.navigate(['/login']);
    return false;
  }
};