import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SafeUrl, DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';

interface Report {
 id: number;
 employeeName: string; 
 title: string;
 date: Date;
 status: string;
 pdfUrl: string;
}

interface Task {
 id: string;
 title: string;
 description: string;
 assignedTo: string;
 status: 'pending' | 'completed';
 createdAt: Date;
}

interface Worker {
 id: string;
 name: string;
 email: string;
}

@Component({
 selector: 'app-reports',
 standalone: true,
 imports: [
   CommonModule,
   FormsModule,
 ],
 templateUrl: './reports.component.html',
 styleUrl: './reports.component.css'
})
export class ReportsComponent implements OnInit {
 currentView: 'reports' | 'pending' | 'completed' = 'reports';
 reports: Report[] = [
   {
     id: 1,
     employeeName: 'Juan Pérez',
     title: 'Informe mensual de ventas',
     date: new Date('2024-01-15'),
     status: 'Completado',
     pdfUrl: 'assets/reports/report1.pdf'
   },
   {
     id: 2,
     employeeName: 'María González',
     title: 'Reporte de inventario',
     date: new Date('2024-01-18'),
     status: 'Pendiente',
     pdfUrl: 'assets/reports/report2.pdf'
   }
 ];

 pendingTasks: Task[] = [];
 completedTasks: Task[] = [];
 workers: Worker[] = [
   { id: '1', name: 'Juan Pérez', email: 'juan@example.com' },
   { id: '2', name: 'Ana López', email: 'ana@example.com' }
 ];

 selectedReport: Report | null = null;
 searchTerm: string = '';
 safePdfUrl: SafeUrl | null = null;
 
 newTask = {
   title: '',
   description: '',
   assignedTo: ''
 };

 constructor(private sanitizer: DomSanitizer, private router: Router) {}

 ngOnInit(): void {
   this.loadPendingTasks();
   this.loadCompletedTasks();
 }

 setView(view: 'reports' | 'pending' | 'completed') {
   this.currentView = view;
 }

 loadPendingTasks() {
   this.pendingTasks = [
     {
       id: '1',
       title: 'Revisión de equipos',
       description: 'Realizar revisión mensual de equipos',
       assignedTo: '1',
       status: 'pending',
       createdAt: new Date()
     }
   ];
 }

 loadCompletedTasks() {
   this.completedTasks = [
     {
       id: '2',
       title: 'Mantenimiento preventivo',
       description: 'Mantenimiento completado',
       assignedTo: '2',
       status: 'completed',
       createdAt: new Date()
     }
   ];
 }

 assignTask() {
   const task: Task = {
     id: Date.now().toString(),
     title: this.newTask.title,
     description: this.newTask.description,
     assignedTo: this.newTask.assignedTo,
     status: 'pending',
     createdAt: new Date()
   };

   this.pendingTasks.unshift(task);
   this.resetTaskForm();
 }

 completeTask(taskId: string) {
   const task = this.pendingTasks.find(t => t.id === taskId);
   if (task) {
     task.status = 'completed';
     this.completedTasks.unshift({...task});
     this.pendingTasks = this.pendingTasks.filter(t => t.id !== taskId);
   }
 }

 deleteTask(taskId: string) {
   this.pendingTasks = this.pendingTasks.filter(t => t.id !== taskId);
 }

 resetTaskForm() {
   this.newTask = {
     title: '',
     description: '',
     assignedTo: ''
   };
 }

 openPdfPreview(report: Report): void {
   this.selectedReport = report;
   this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(report.pdfUrl);
 }

 closePreview(): void {
   this.selectedReport = null;
   this.safePdfUrl = null;
 }

 formatDate(date: Date): string {
   return new Date(date).toLocaleDateString('es-ES', {
     year: 'numeric',
     month: 'long',
     day: 'numeric'
   });
 }

 filterReports(): Report[] {
   return this.reports.filter(report =>
     report.employeeName.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
     report.title.toLowerCase().includes(this.searchTerm.toLowerCase())
   );
 }

 goBack(): void {
   this.router.navigate(['/admin1']);
 }
}