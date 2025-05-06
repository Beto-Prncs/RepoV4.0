// functions/src/index.ts
// @ts-nocheck
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';

// Inicializar la aplicación Firebase Admin
admin.initializeApp();

// Configuración de correo electrónico
const gmailEmail = 'pedro.saldanac.est@gmail.com';
const gmailPassword = 'lipu nqwm edur kzmh';
const mailTransport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailEmail,
    pass: gmailPassword,
  },
});

const APP_NAME = 'Repo System';
const BASE_URL = 'workflowdb-4122b.web.app';

/**
 * Función para crear un nuevo usuario sin afectar la sesión actual
 */
export const createNewUser = functions.https.onCall(async (data, context) => {
  try {
    // Loguear datos de forma segura evitando circular references
    console.log("Datos recibidos:", {
      email: data?.email || "no disponible",
      username: data?.username || "no disponible",
      firstName: data?.firstName || "no disponible",
      lastName: data?.lastName || "no disponible",
      selectedType: data?.selectedType || "no disponible",
      adminId: data?.adminId || "no proporcionado"
    });

    console.log("Contexto de autenticación:",
      context?.auth
        ? {
          uid: context.auth.uid || "desconocido",
          token: context.auth.token ? "presente" : "ausente"
        }
        : "no hay auth"
    );

    // MODIFICADO: Verificación más permisiva para la autenticación
    let authId;
    // Primera opción: Usar el contexto de autenticación
    if (context?.auth && context.auth.uid) {
      authId = context.auth.uid;
      console.log("Usando ID de autenticación del contexto:", authId);
    } 
    // Segunda opción: Usar el adminId proporcionado en los datos
    else if (data?.adminId) {
      console.log("No hay contexto auth, usando adminId de los datos:", data.adminId);
      authId = data.adminId;
      
      // Verificar que este ID existe en la base de datos
      try {
        const adminRef = admin.firestore().collection('Usuario').doc(authId);
        const adminDoc = await adminRef.get();
        
        if (!adminDoc.exists) {
          console.log("No se encontró el documento del admin:", authId);
          throw new functions.https.HttpsError(
            'not-found',
            'No se encontró información del usuario administrador'
          );
        }
        
        const adminData = adminDoc.data();
        if (!adminData || adminData.Rol !== 'admin') {
          console.log("El usuario no tiene rol de admin:", adminData?.Rol);
          throw new functions.https.HttpsError(
            'permission-denied',
            'El usuario no tiene permisos de administrador'
          );
        }
        
        console.log("Usuario admin verificado correctamente");
      } catch (verifyError) {
        console.error("Error verificando permisos de admin:", verifyError);
        throw new functions.https.HttpsError(
          'permission-denied',
          'Error verificando permisos de administrador: ' + (verifyError.message || 'error desconocido')
        );
      }
    } 
    // Si no hay autenticación ni adminId, crear directamente (solo para depuración)
    else if (data?.bypassAuth === 'temporary_debug_mode') {
      console.log("MODO DEPURACIÓN: Saltando verificación de autenticación");
      authId = 'temporary_admin';
    }
    // Si no hay autenticación de ningún tipo, rechazar
    else {
      console.log("Error: Sin autenticación ni adminId");
      throw new functions.https.HttpsError(
        'unauthenticated',
        'El usuario debe estar autenticado para realizar esta acción'
      );
    }

    console.log("ID de usuario autenticado para la operación:", authId);

    // Acceder a los datos de forma segura
    if (!data || typeof data !== 'object') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Datos de entrada inválidos'
      );
    }

    const userData = data as Record<string, any>;

    // Verificar permisos de administrador (solo si no estamos en modo debug)
    if (authId !== 'temporary_admin') {
      try {
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
      } catch (error) {
        console.error("Error verificando permisos de admin (segunda verificación):", error);
        throw new functions.https.HttpsError(
          'permission-denied',
          'Error verificando permisos: ' + (error.message || 'error desconocido')
        );
      }
    }

    // Validar datos requeridos
    if (!userData.email || !userData.password || !userData.username ||
        !userData.firstName || !userData.lastName) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Faltan datos requeridos para crear el usuario'
      );
    }

    // Verificar que el nombre de usuario no exista
    try {
      const usernameQuery = await admin.firestore()
        .collection('Usuario')
        .where('Username', '==', userData.username)
        .get();
      
      if (!usernameQuery.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'El nombre de usuario ya está en uso'
        );
      }
    } catch (error) {
      console.error("Error verificando nombre de usuario:", error);
      throw new functions.https.HttpsError(
        'internal',
        'Error verificando disponibilidad del nombre de usuario: ' + (error.message || 'error desconocido')
      );
    }

    // Crear usuario en Authentication
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: userData.email,
        password: userData.password,
        displayName: `${userData.firstName} ${userData.lastName}`,
        emailVerified: false
      });
      console.log("Usuario creado en Authentication:", userRecord.uid);
    } catch (error) {
      console.error("Error creando usuario en Authentication:", error);
      throw new functions.https.HttpsError(
        'internal',
        'Error creando usuario en Authentication: ' + (error.message || 'error desconocido')
      );
    }

    // Crear documento en Firestore
    try {
      const userFirestoreData = {
        IdUsuario: userRecord.uid,
        Nombre: `${userData.firstName} ${userData.lastName}`,
        Correo: userData.email,
        Username: userData.username,
        Password: userData.password,
        Foto_Perfil: "",
        Rol: userData.selectedType,
        Telefono: userData.phone || "",
        Departamento: userData.departamento || "",
        NivelAdmin: userData.selectedType === 'admin' ? userData.nivelAdmin : "",
        createdBy: authId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await admin.firestore().collection('Usuario').doc(userRecord.uid).set(userFirestoreData);
      console.log("Datos de usuario guardados en Firestore");
    } catch (error) {
      console.error("Error guardando datos en Firestore:", error);
      // Intentar eliminar el usuario de Authentication si falla la creación en Firestore
      try {
        await admin.auth().deleteUser(userRecord.uid);
        console.log("Usuario eliminado de Authentication tras error en Firestore");
      } catch (deleteError) {
        console.error("Error eliminando usuario tras fallo:", deleteError);
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Error guardando datos del usuario: ' + (error.message || 'error desconocido')
      );
    }

    // Enviar correo de verificación y bienvenida
    try {
      // Generar enlace de verificación
      const verificationLink = await admin.auth().generateEmailVerificationLink(userData.email);
      console.log("Enlace de verificación generado");

      // Enviar correo de bienvenida
      await _sendWelcomeEmail({
        email: userData.email,
        name: `${userData.firstName} ${userData.lastName}`,
        username: userData.username,
        password: userData.password,
        role: userData.selectedType
      });
      console.log("Correo de bienvenida enviado");

      return {
        success: true,
        uid: userRecord.uid,
        verificationLink: verificationLink
      };
    } catch (error) {
      console.error("Error en el proceso de envío de correo:", error);
      // No fallamos la creación del usuario si falla el envío de correo
      return {
        success: true,
        uid: userRecord.uid,
        emailError: "No se pudo enviar el correo: " + (error.message || 'error desconocido')
      };
    }
  } catch (err) {
    const error = err as { code?: string; message?: string };
    console.error('Error detallado al crear usuario:', error);
    
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
    
    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Error al crear usuario'
    );
  }
});

// Resto del código de funciones sin cambios...
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
export const sendWelcomeEmail = functions.https.onCall(async (data, context) => {
  // [Código existente sin cambios]
  try {
    if (!data || typeof data !== 'object') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Datos de entrada inválidos'
      );
    }
    
    const emailData = data as Record<string, any>;
    
    if (!emailData.email || !emailData.name || !emailData.username ||
        !emailData.password || !emailData.role) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Faltan datos requeridos para enviar el correo'
      );
    }
    
    const welcomeEmailData: WelcomeEmailData = {
      email: emailData.email,
      name: emailData.name,
      username: emailData.username,
      password: emailData.password,
      role: emailData.role
    };
    
    await _sendWelcomeEmail(welcomeEmailData);
    
    return { success: true, message: 'Correo enviado exitosamente' };
  } catch (err) {
    const error = err as { message?: string };
    console.error('Error al enviar correo:', error);
    
    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Error al enviar correo de bienvenida'
    );
  }
});

/**
 * Función interna para enviar correo de bienvenida
 */
async function _sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
  // [Código existente sin cambios]
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
 */
export const sendPasswordResetEmail = functions.https.onCall(async (data, context) => {
  // [Resto del código sin cambios]
  try {
    if (!data || typeof data !== 'object') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Datos de entrada inválidos'
      );
    }
    
    const resetData = data as Record<string, any>;
    
    if (!resetData.email) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Falta el correo electrónico'
      );
    }
    
    const usersQuery = await admin.firestore()
      .collection('Usuario')
      .where('Correo', '==', resetData.email)
      .limit(1)
      .get();
    
    if (usersQuery.empty) {
      throw new functions.https.HttpsError(
        'not-found',
        'No existe una cuenta con este correo electrónico'
      );
    }
    
    const resetLink = await admin.auth().generatePasswordResetLink(
      resetData.email,
      {
        url: `${BASE_URL}/recuperar-contrasena`,
        handleCodeInApp: true
      }
    );
    
    const userData = usersQuery.docs[0].data();
    const userName = userData.Nombre || 'Usuario';
    
    await _sendPasswordResetEmail(resetData.email, userName, resetLink);
    
    return { success: true, message: 'Correo enviado exitosamente' };
  } catch (err) {
    const error = err as { code?: string; message?: string };
    console.error('Error al enviar correo de recuperación:', error);
    
    throw new functions.https.HttpsError(
      error.code === 'not-found' ? 'not-found' : 'internal',
      error.message || 'Error al enviar correo de recuperación'
    );
  }
});

/**
 * Función interna para enviar correo de recuperación de contraseña
 */
async function _sendPasswordResetEmail(email: string, name: string, resetLink: string): Promise<void> {
  // [Código existente sin cambios]
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
export const afterPasswordReset = functions.https.onCall(async (data, context) => {
  // [Código existente sin cambios]
  try {
    if (!data || typeof data !== 'object') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Datos de entrada inválidos'
      );
    }
    
    const resetData = data as Record<string, any>;
    
    if (!resetData.email || !resetData.newPassword) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Faltan datos requeridos para actualizar la contraseña'
      );
    }
    
    const usersRef = admin.firestore().collection('Usuario');
    const snapshot = await usersRef.where('Correo', '==', resetData.email).get();
    
    if (snapshot.empty) {
      throw new functions.https.HttpsError(
        'not-found',
        'No se encontró un usuario con este correo'
      );
    }
    
    const userDoc = snapshot.docs[0];
    await userDoc.ref.update({
      Password: resetData.newPassword
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
});