import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-statistics',
  imports: [],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.css'
})
export class StatisticsComponent {
  
  constructor(private router: Router) {}
  goBack(): void {
    this.router.navigate(['/admin1']);
  }
}
