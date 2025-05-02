import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const logoutGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  // Usar el método getCurrentUser que ya has implementado
  const user = await authService.getCurrentUser();
  
  if (user) {
    // Si hay un usuario autenticado, verificar su rol y redirigir
    const userData = await authService.getUserData(user.uid);
    
    if (userData) {
      if (userData.Rol === 'admin') {
        router.navigate(['/admin1']);
      } else if (userData.Rol === 'worker') {
        router.navigate(['/worker']);
      } else {
        // Si no hay rol definido, mejor ir a la página de inicio
        router.navigate(['/']);
      }
    } else {
      // Si no hay datos de usuario en Firestore, cerrar sesión
      await authService.signOut();
    }
    
    return false;
  } else {
    return true; // No hay usuario autenticado, permitir acceso a login
  }
};