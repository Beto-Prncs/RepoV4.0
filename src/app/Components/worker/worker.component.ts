import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
 selector: 'app-worker',
 standalone: true,
 imports: [CommonModule],
 templateUrl: './worker.component.html',
 styleUrl: './worker.component.css'
})
export class WorkerComponent {
 constructor(private router: Router) {}

 selectedView: string = 'pending';
 currentView: 'pending' | 'completed' | 'reports' | 'config' = 'pending';

 showPendingTasks() {
   this.router.navigate(['/worker-pendingtask']);
 }

 showCompletedTasks() {
   this.router.navigate(['/worker-completetask']);
 }

 showConfig() {
   this.router.navigate(['/worker-config']);
 }

 logout() {
   this.router.navigate(['/']);
 }

 getHeaderTitle(): string {
   const titles = {
     pending: 'Trabajos Pendientes',
     completed: 'Trabajos Realizados',
     reports: 'Generar Reportes',
     config: 'Configuración'
   };
   return titles[this.currentView];
 }
}