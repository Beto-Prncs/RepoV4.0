import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
export const logoutGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  
  // Si hay un usuario autenticado, no permitir acceso a la página de login
  if (auth.currentUser) {
    // Determinar a dónde redirigir basado en la información guardada en localStorage
    const userRole = localStorage.getItem('userRole');
    
    if (userRole === 'admin') {
      router.navigate(['/admin1']);
    } else if (userRole === 'worker') {
      router.navigate(['/worker']);
    } else {
      // Si no hay rol definido, mejor ir a la página de inicio
      router.navigate(['/']);
    }
    return false;
  }
  
  return true;
};
