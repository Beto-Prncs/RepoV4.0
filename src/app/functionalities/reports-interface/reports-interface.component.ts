import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-reports-interface',
  imports: [CommonModule],
  templateUrl: './reports-interface.component.html',
  styleUrl: './reports-interface.component.scss',
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms ease-out', style({ opacity: 1 }))
      ])
    ]),
    trigger('slideInUp', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class ReportsInterfaceComponent implements OnInit {
  // Variables para estadísticas (opcionales)
  completedReports: number = 25;
  averageTime: string = '3.5 horas';
  activeUsers: number = 12;
  
  constructor(private router: Router) {}
  
  ngOnInit(): void {
    // Inicialización del componente
    // Aquí podrías cargar datos reales desde un servicio si es necesario
  }

  navigateToCreateReport(): void {
    this.router.navigate(['/createReports']);
  }

  navigateToReportHistory(): void {
    this.router.navigate(['/reports']);
  }

  goBack(): void {
    this.router.navigate(['/admin1']);
  }
}