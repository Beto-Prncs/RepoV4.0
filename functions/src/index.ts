// functions/src/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';

// Inicializar la aplicación Firebase Admin
admin.initializeApp();

// Configuración de correo electrónico
// Para producción, usa variables de entorno: functions.config().email
const gmailEmail = 'tu-correo@gmail.com'; // Reemplaza con tu correo
const gmailPassword = 'tu-contraseña-de-app'; // Reemplaza con contraseña de app de Google
const mailTransport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailEmail,
    pass: gmailPassword,
  },
});

const APP_NAME = 'Repo System';
const BASE_URL = 'https://tu-url-de-app.com'; // Reemplaza con la URL de tu aplicación

/**
 * Función para crear un nuevo usuario sin afectar la sesión actual
 */
export const createNewUser = functions.https.onCall((rawData, rawContext) => {
  return (async () => {
    try {
      // Verificar autenticación - sin acceder directamente a propiedades que podrían no existir
      let authId = null;
      // Corregido: Verificamos que rawContext sea un objeto antes de usar 'in'
      if (rawContext && typeof rawContext === 'object' && 
          'auth' in rawContext && rawContext.auth && 
          typeof rawContext.auth === 'object' && 'uid' in rawContext.auth) {
        authId = String(rawContext.auth.uid); // Corregido: Convertimos a string para evitar problemas de tipo
      }

      if (!authId) {
        throw new functions.https.HttpsError(
          'unauthenticated', 
          'El usuario debe estar autenticado para realizar esta acción'
        );
      }

      // Acceder a los datos de forma segura
      if (!rawData || typeof rawData !== 'object') {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Datos de entrada inválidos'
        );
      }

      const data = rawData as Record<string, any>;

      // Verificar permisos de administrador
      const adminRef = admin.firestore().collection('Usuario').doc(authId);
      const adminDoc = await adminRef.get();
      
      if (!adminDoc.exists) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'No se encontró información del usuario administrador'
        );
      }
      
      const adminData = adminDoc.data();
      if (!adminData || adminData.Rol !== 'admin') {
        throw new functions.https.HttpsError(
          'permission-denied',
          'El usuario no tiene permisos de administrador'
        );
      }

      // Validar datos requeridos
      if (!data.email || !data.password || !data.username || !data.firstName || !data.lastName) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Faltan datos requeridos para crear el usuario'
        );
      }

      // Verificar que el nombre de usuario no exista
      const usernameQuery = await admin.firestore()
        .collection('Usuario')
        .where('Username', '==', data.username)
        .get();

      if (!usernameQuery.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'El nombre de usuario ya está en uso'
        );
      }

      // Crear usuario en Authentication
      const userRecord = await admin.auth().createUser({
        email: data.email,
        password: data.password,
        displayName: `${data.firstName} ${data.lastName}`,
        emailVerified: false
      });

      // Crear documento en Firestore
      const userData = {
        IdUsuario: userRecord.uid,
        Nombre: `${data.firstName} ${data.lastName}`,
        Correo: data.email,
        Username: data.username,
        Password: data.password, // Mantiene la contraseña en texto plano como en el diseño original
        Foto_Perfil: "",
        Rol: data.selectedType,
        Telefono: data.phone || "",
        Departamento: data.departamento || "",
        NivelAdmin: data.selectedType === 'admin' ? data.nivelAdmin : "",
        createdBy: authId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await admin.firestore().collection('Usuario').doc(userRecord.uid).set(userData);

      // Enviar correo de verificación
      const verificationLink = await admin.auth().generateEmailVerificationLink(data.email);

      // Enviar correo de bienvenida
      await _sendWelcomeEmail({
        email: data.email,
        name: `${data.firstName} ${data.lastName}`,
        username: data.username,
        password: data.password,
        role: data.selectedType
      });

      return {
        success: true,
        uid: userRecord.uid,
        verificationLink: verificationLink
      };
    } catch (err) {
      // Tipo explícito para error
      const error = err as { code?: string; message?: string };
      console.error('Error al crear usuario:', error);
      
      // Manejar diferentes tipos de errores de Firebase Auth
      if (error.code === 'auth/email-already-exists') {
        throw new functions.https.HttpsError(
          'already-exists',
          'El correo electrónico ya está registrado'
        );
      } else if (error.code === 'auth/invalid-email') {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'El formato del correo electrónico es inválido'
        );
      } else if (error.code === 'auth/weak-password') {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'La contraseña es demasiado débil'
        );
      }
      
      // Error genérico para otros casos
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Error al crear usuario'
      );
    }
  })();
});

// Interfaz para el correo de bienvenida
interface WelcomeEmailData {
  email: string;
  name: string;
  username: string;
  password: string;
  role: string;
}

/**
 * Función para enviar correo de bienvenida
 */
export const sendWelcomeEmail = functions.https.onCall((rawData, rawContext) => {
  return (async () => {
    try {
      // Acceder a los datos de forma segura
      if (!rawData || typeof rawData !== 'object') {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Datos de entrada inválidos'
        );
      }

      const data = rawData as Record<string, any>;

      // Verificar que tenemos los datos necesarios
      if (!data.email || !data.name || !data.username || !data.password || !data.role) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Faltan datos requeridos para enviar el correo'
        );
      }

      const emailData: WelcomeEmailData = {
        email: data.email,
        name: data.name,
        username: data.username,
        password: data.password,
        role: data.role
      };

      await _sendWelcomeEmail(emailData);
      return { success: true, message: 'Correo enviado exitosamente' };
    } catch (err) {
      // Tipo explícito para error
      const error = err as { message?: string };
      console.error('Error al enviar correo:', error);
      
      throw new functions.https.HttpsError(
        'internal', 
        error.message || 'Error al enviar correo de bienvenida'
      );
    }
  })();
});

/**
 * Función interna para enviar correo de bienvenida
 */
async function _sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
  const mailOptions = {
    from: `${APP_NAME} <noreply@reposystem.com>`,
    to: data.email,
    subject: `¡Bienvenido a ${APP_NAME}!`,
    html: `
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
              <h1>¡Bienvenido a ${APP_NAME}!</h1>
            </div>
            <div class="content">
              <p>Hola <strong>${data.name}</strong>,</p>
              <p>Tu cuenta ha sido creada exitosamente. A continuación, encontrarás tus credenciales de acceso:</p>
              
              <div class="credentials">
                <p><strong>Rol:</strong> ${data.role === 'admin' ? 'Administrador' : 'Trabajador'}</p>
                <p><strong>Nombre de usuario:</strong> ${data.username}</p>
                <p><strong>Contraseña:</strong> ${data.password}</p>
                <p><strong>Correo electrónico:</strong> ${data.email}</p>
              </div>
              
              <p>Por seguridad, te recomendamos cambiar tu contraseña después del primer inicio de sesión.</p>
              
              <a href="${BASE_URL}/login" class="button">Iniciar sesión</a>
              
              <p>Si tienes alguna pregunta o problema, no dudes en contactar al administrador del sistema.</p>
              
              <p>¡Gracias por ser parte de nuestro equipo!</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `
  };

  await mailTransport.sendMail(mailOptions);
  console.log('Correo de bienvenida enviado a:', data.email);
}

/**
 * Función para enviar correo de recuperación de contraseña
 * Esta es una versión mejorada del correo de restablecimiento predeterminado de Firebase
 */
export const sendPasswordResetEmail = functions.https.onCall((rawData, rawContext) => {
  return (async () => {
    try {
      // Acceder a los datos de forma segura
      if (!rawData || typeof rawData !== 'object') {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Datos de entrada inválidos'
        );
      }

      const data = rawData as Record<string, any>;

      // Verificar que tenemos los datos necesarios
      if (!data.email) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Falta el correo electrónico'
        );
      }

      // Verificar que el correo existe en la base de datos
      const usersQuery = await admin.firestore()
        .collection('Usuario')
        .where('Correo', '==', data.email)
        .limit(1)
        .get();

      if (usersQuery.empty) {
        throw new functions.https.HttpsError(
          'not-found',
          'No existe una cuenta con este correo electrónico'
        );
      }

      // Generar el enlace de restablecimiento
      const resetLink = await admin.auth().generatePasswordResetLink(
        data.email,
        {
          url: `${BASE_URL}/recuperar-contrasena`,
          handleCodeInApp: true
        }
      );

      // Obtener el nombre del usuario
      const userData = usersQuery.docs[0].data();
      const userName = userData.Nombre || 'Usuario';

      // Enviar correo personalizado
      await _sendPasswordResetEmail(data.email, userName, resetLink);

      return { success: true, message: 'Correo enviado exitosamente' };
    } catch (err) {
      const error = err as { code?: string; message?: string };
      console.error('Error al enviar correo de recuperación:', error);
      
      throw new functions.https.HttpsError(
        error.code === 'not-found' ? 'not-found' : 'internal',
        error.message || 'Error al enviar correo de recuperación'
      );
    }
  })();
});

/**
 * Función interna para enviar correo de recuperación de contraseña
 */
async function _sendPasswordResetEmail(email: string, name: string, resetLink: string): Promise<void> {
  const mailOptions = {
    from: `${APP_NAME} <noreply@reposystem.com>`,
    to: email,
    subject: `Recuperación de contraseña - ${APP_NAME}`,
    html: `
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
            .button {
              display: inline-block;
              background-color: #2563eb;
              color: white;
              text-decoration: none;
              padding: 10px 20px;
              border-radius: 5px;
              margin-top: 15px;
            }
            .warning {
              background-color: #fff8e1;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
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
              <h1>Recuperación de Contraseña</h1>
            </div>
            <div class="content">
              <p>Hola <strong>${name}</strong>,</p>
              <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en ${APP_NAME}.</p>
              <p>Haz clic en el botón a continuación para crear una nueva contraseña:</p>
              
              <div style="text-align: center;">
                <a href="${resetLink}" class="button">Restablecer contraseña</a>
              </div>
              
              <div class="warning">
                <p><strong>¡Importante!</strong> Este enlace expirará en 1 hora.</p>
                <p>Si no solicitaste restablecer tu contraseña, puedes ignorar este correo. Tu cuenta sigue segura.</p>
              </div>
              
              <p>Si tienes problemas con el enlace, puedes copiar y pegar la siguiente URL en tu navegador:</p>
              <p style="word-break: break-all;">${resetLink}</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. Todos los derechos reservados.</p>
              <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
            </div>
          </div>
        </body>
      </html>
    `
  };

  await mailTransport.sendMail(mailOptions);
  console.log('Correo de recuperación enviado a:', email);
}

/**
 * Función para actualizar la contraseña en Firestore después de restablecerla en Authentication
 */
export const afterPasswordReset = functions.https.onCall((rawData, rawContext) => {
  return (async () => {
    try {
      // Acceder a los datos de forma segura
      if (!rawData || typeof rawData !== 'object') {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Datos de entrada inválidos'
        );
      }

      const data = rawData as Record<string, any>;

      // Verificar que tenemos los datos necesarios
      if (!data.email || !data.newPassword) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Faltan datos requeridos para actualizar la contraseña'
        );
      }

      // Buscar el usuario por email
      const usersRef = admin.firestore().collection('Usuario');
      const snapshot = await usersRef.where('Correo', '==', data.email).get();
      
      if (snapshot.empty) {
        throw new functions.https.HttpsError(
          'not-found',
          'No se encontró un usuario con este correo'
        );
      }
      
      // Actualizar la contraseña en Firestore
      const userDoc = snapshot.docs[0];
      await userDoc.ref.update({
        Password: data.newPassword
      });
      
      return { success: true };
    } catch (err) {
      const error = err as { message?: string };
      console.error('Error actualizando contraseña en Firestore:', error);
      
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Error al actualizar la contraseña'
      );
    }
  })();
});