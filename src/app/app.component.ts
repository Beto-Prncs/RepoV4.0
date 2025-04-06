import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})

export class AppComponent implements OnInit {
  constructor(private translate: TranslateService) {}

  ngOnInit() {
    // Define los idiomas disponibles
    this.translate.addLangs(['es', 'en', 'pt', 'fr']);
    
    // Establece el idioma predeterminado
    this.translate.setDefaultLang('es');
    
    // Usa el idioma del navegador si está disponible
    const browserLang = this.translate.getBrowserLang();
    const useLang = browserLang && ['es', 'es', 'pt', 'fr'].includes(browserLang) ? browserLang : 'es';
    this.translate.use(useLang);
  }
}
