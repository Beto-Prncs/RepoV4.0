// Suggested code may be subject to a license. Learn more: ~LicenseLog:2380058949.
// Suggested code may be subject to a license. Learn more: ~LicenseLog:2362914228.
// Suggested code may be subject to a license. Learn more: ~LicenseLog:1159061640.
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { importProvidersFrom } from '@angular/core';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { TranslationModule } from './shared/modules/translation.module';

const firebaseConfig = {
  apiKey: "AIzaSyB02aFRJQaUZV4PH-1UilL0G1qR011UMOo",
  authDomain: "workflowdb-4122b.firebaseapp.com",
  projectId: "workflowdb-4122b",
  storageBucket: "workflowdb-4122b.firebasestorage.app",
  messagingSenderId: "1053802838055",
  appId: "1:1053802838055:web:17ffaf05c2fe045c77b602"
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    importProvidersFrom(TranslationModule),
    provideStorage(() => getStorage())
  ]
};