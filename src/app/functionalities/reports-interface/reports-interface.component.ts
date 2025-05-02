import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
@Component({
  selector: 'app-reports-interface',
  imports: [CommonModule],
  templateUrl: './reports-interface.component.html',
  styleUrl: './reports-interface.component.scss'
})
export class ReportsInterfaceComponent {

  constructor(private router: Router) {}

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
