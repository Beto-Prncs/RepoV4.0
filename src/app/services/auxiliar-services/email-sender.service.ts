import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Interfaz para proveedores de servicio de correo
 */
interface EmailProvider {
  sendMail(mailOptions: MailOptions): Observable<any>;
}

/**
 * Opciones para envío de correo
 */
export interface MailOptions {
  from?: string;
  to: string;
  subject: string;
  html: string;
}

/**
 * Proveedor EmailJS
 */
class EmailJSProvider implements EmailProvider {
  private apiUrl = 'https://api.emailjs.com/api/v1.0/email/send';
  private serviceId: string;
  private templateId: string;
  private userId: string;

  constructor(
    private http: HttpClient,
    serviceId: string,
    templateId: string,
    userId: string
  ) {
    this.serviceId = serviceId;
    this.templateId = templateId;
    this.userId = userId;
  }

  sendMail(mailOptions: MailOptions): Observable<any> {
    const data = {
      service_id: this.serviceId,
      template_id: this.templateId,
      user_id: this.userId,
      template_params: {
        to_email: mailOptions.to,
        subject: mailOptions.subject,
        message_html: mailOptions.html,
        from_name: 'Repo System'
      }
    };

    return this.http.post(this.apiUrl, data).pipe(
      catchError(err => {
        console.error('Error enviando correo con EmailJS:', err);
        return of({ error: true, message: err.message });
      })
    );
  }
}

/**
 * Proveedor SMTP.js
 */
class SMTPJSProvider implements EmailProvider {
  private apiUrl = 'https://api.smtp.js.com/v3/smtp.send';
  private secureToken: string;

  constructor(private http: HttpClient, secureToken: string) {
    this.secureToken = secureToken;
  }

  sendMail(mailOptions: MailOptions): Observable<any> {
    const data = {
      SecureToken: this.secureToken,
      To: mailOptions.to,
      From: mailOptions.from || 'noreply@reposystem.com',
      Subject: mailOptions.subject,
      Body: mailOptions.html
    };

    return this.http.post(this.apiUrl, data).pipe(
      catchError(err => {
        console.error('Error enviando correo con SMTP.js:', err);
        return of({ error: true, message: err.message });
      })
    );
  }
}

/**
 * Servicio de envío de correos con múltiples proveedores
 */
@Injectable({
  providedIn: 'root'
})
export class EmailSenderService {
  private provider: EmailProvider;

  constructor(private http: HttpClient) {
    // Configuración para EmailJS (por defecto)
    this.provider = new EmailJSProvider(
      http,
      'tu_service_id',  // Reemplaza con tu ID de servicio de EmailJS
      'tu_template_id', // Reemplaza con tu ID de plantilla de EmailJS
      'tu_user_id'      // Reemplaza con tu ID de usuario de EmailJS
    );

    // Alternativamente, puedes usar SMTP.js descomentando esto:
    // this.provider = new SMTPJSProvider(
    //   http,
    //   'tu_secure_token' // Reemplaza con tu token seguro de SMTP.js
    // );
  }

  /**
   * Envía un correo electrónico
   * @param mailOptions Opciones del correo
   */
  sendEmail(mailOptions: MailOptions): Observable<any> {
    return this.provider.sendMail(mailOptions);
  }
  
  /**
   * Genera el HTML para un correo de bienvenida
   */
  generateWelcomeEmail(userData: {
    name: string;
    username: string;
    password: string;
    email: string;
    role: string;
  }): string {
    const baseUrl = window.location.origin;
    const appName = 'Repo System';
    const currentYear = new Date().getFullYear();
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f9f9f9;
        }
        .header {
          background-color: #2563eb;
          color: white;
          padding: 20px;
          text-align: center;
          border-radius: 5px 5px 0 0;
        }
        .content {
          background-color: white;
          padding: 20px;
          border-radius: 0 0 5px 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .credentials {
          background-color: #f5f5f5;
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
        }
        .button {
          display: inline-block;
          background-color: #2563eb;
          color: white;
          text-decoration: none;
          padding: 10px 20px;
          border-radius: 5px;
          margin-top: 15px;
        }
        .footer {
          margin-top: 20px;
          text-align: center;
          font-size: 12px;
          color: #777;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>¡Bienvenido a ${appName}!</h1>
        </div>
        <div class="content">
          <p>Hola <strong>${userData.name}</strong>,</p>
          <p>Tu cuenta ha sido creada exitosamente. A continuación, encontrarás tus credenciales de acceso:</p>
          <div class="credentials">
            <p><strong>Rol:</strong> ${userData.role === 'admin' ? 'Administrador' : 'Trabajador'}</p>
            <p><strong>Nombre de usuario:</strong> ${userData.username}</p>
            <p><strong>Contraseña:</strong> ${userData.password}</p>
            <p><strong>Correo electrónico:</strong> ${userData.email}</p>
          </div>
          <p>Por seguridad, te recomendamos cambiar tu contraseña después del primer inicio de sesión.</p>
          <a href="${baseUrl}/login" class="button">Iniciar sesión</a>
          <p>Si tienes alguna pregunta o problema, no dudes en contactar al administrador del sistema.</p>
          <p>¡Gracias por ser parte de nuestro equipo!</p>
        </div>
        <div class="footer">
          <p>&copy; ${currentYear} ${appName}. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }
  
  /**
   * Alternativa de implementación para entornos donde no se pueden usar servicios externos
   * Simula el envío de correo y registra en la consola (para desarrollo)
   */
  simulateEmailSend(mailOptions: MailOptions): Observable<any> {
    console.log('===== SIMULACIÓN DE CORREO =====');
    console.log('Para:', mailOptions.to);
    console.log('Asunto:', mailOptions.subject);
    console.log('Contenido HTML:', mailOptions.html);
    console.log('===============================');
    
    // Simular una respuesta exitosa
    return of({ 
      success: true, 
      message: 'Correo simulado enviado correctamente' 
    });
  }
}