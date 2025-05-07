import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface EmailData {
  to: string;
  subject: string;
  html: string;
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private emailApiUrl = 'https://api.emailjs.com/api/v1.0/email/send';
  private serviceId = 'your_service_id'; // Reemplazar con tu ID de servicio de EmailJS
  private templateId = 'your_template_id'; // Reemplazar con tu ID de plantilla
  private userId = 'your_user_id'; // Reemplazar con tu ID de usuario EmailJS

  constructor(private http: HttpClient) {}

  /**
   * Envía un correo electrónico usando EmailJS
   * @param emailData Datos del correo a enviar
   */
  sendEmail(emailData: EmailData): Observable<any> {
    const data = {
      service_id: this.serviceId,
      template_id: this.templateId,
      user_id: this.userId,
      template_params: {
        to_email: emailData.to,
        subject: emailData.subject,
        message_html: emailData.html
      }
    };

    return this.http.post(this.emailApiUrl, data);
  }

  /**
   * Genera el HTML para un correo de bienvenida
   */
  generateWelcomeEmailHTML(userData: {
    name: string;
    username: string;
    password: string;
    email: string;
    role: string;
  }): string {
    const baseUrl = window.location.origin;
    const appName = 'Repo System';
    
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
          <p>&copy; ${new Date().getFullYear()} ${appName}. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }
}