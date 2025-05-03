import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { Router, NavigationEnd, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Usuario } from '../../models/interfaces';
import { AuthService } from '../../services/auth.service';
import { Storage, getDownloadURL, ref, uploadBytesResumable } from '@angular/fire/storage';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { filter } from 'rxjs/operators';
import { ClickOutsideDirective } from '../../directives/click-outside.directive';

@Component({
  selector: 'app-worker',
  standalone: true,
  imports: [CommonModule, RouterModule, ClickOutsideDirective],
  templateUrl: './worker.component.html',
  styleUrls: ['./worker.component.scss']
})
export class WorkerComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;
  
  usuario: Usuario | null = null;
  isProfileMenuOpen: boolean = false;
  isLoading: boolean = true;
  isUploading: boolean = false;
  currentUrl: string = '';
  window: any = window;

  constructor(
    private router: Router,
    private authService: AuthService,
    private storage: Storage,
    private firestore: Firestore
  ) {
    // Listen for route changes to update active tab
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentUrl = event.urlAfterRedirects;
    });
  }

  ngOnInit(): void {
    // Get current route
    this.currentUrl = this.router.url;
    
    // Load user data
    this.loadUserData();
  }

  // Check if a route is active
  isActiveRoute(route: string): boolean {
    return this.currentUrl === route || this.currentUrl.startsWith(route);
  }

  // Toggle profile menu
  toggleProfileMenu(event: Event): void {
    event.stopPropagation();
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  // Close profile menu
  closeProfileMenu(): void {
    this.isProfileMenuOpen = false;
  }

  // Navigate to a route
  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  // Logout and redirect to login
  logout(): void {
    this.authService.logout()
      .then(() => {
        this.router.navigate(['/login']);
      })
      .catch(error => {
        console.error('Error al cerrar sesión:', error);
      });
  }

  // Open file selector for profile photo
  openPhotoSelector(): void {
    if (this.isUploading) return;
    this.fileInput.nativeElement.click();
  }

  // Handle photo selection
  onPhotoSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.includes('image/')) {
      alert('Por favor selecciona una imagen válida.');
      return;
    }

    // Start upload
    this.uploadProfilePhoto(file);
  }

  // Upload profile photo to Firebase Storage
  private uploadProfilePhoto(file: File): void {
    if (!this.usuario) return;

    this.isUploading = true;

    // Create a reference to the storage location
    const storageRef = ref(this.storage, `profile_photos/${this.usuario.IdUsuario}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    // Monitor upload progress
    uploadTask.on('state_changed',
      (snapshot) => {
        // Progress monitoring if needed
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log('Upload is ' + progress + '% done');
      },
      (error) => {
        // Handle errors
        console.error('Error during upload:', error);
        this.isUploading = false;
        alert('Error al subir la imagen. Por favor, intenta nuevamente.');
      },
      () => {
        // Upload completed successfully, get download URL
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          console.log('File available at', downloadURL);
          
          // Update user profile in Firestore
          this.updateUserProfilePhoto(downloadURL);
        });
      }
    );
  }

  // Update user profile photo in Firestore
  private updateUserProfilePhoto(imageUrl: string): void {
    if (!this.usuario) return;

    const userRef = doc(this.firestore, 'Usuario', this.usuario.IdUsuario);
    
    updateDoc(userRef, {
      Foto_Perfil: imageUrl
    })
    .then(() => {
      console.log('Foto de perfil actualizada correctamente');
      
      // Update local user object
      if (this.usuario) {
        this.usuario.Foto_Perfil = imageUrl;
      }
      
      this.isUploading = false;
    })
    .catch(error => {
      console.error('Error al actualizar foto de perfil:', error);
      this.isUploading = false;
      alert('Error al actualizar la foto de perfil. Por favor, intenta nuevamente.');
    });
  }

  // Load user data from AuthService
  private loadUserData(): void {
    this.isLoading = true;
    
    this.authService.getCurrentUser()
      .then(user => {
        if (!user) {
          throw new Error('No hay usuario autenticado');
        }
        
        return this.authService.getUserData(user.uid);
      })
      .then(userData => {
        if (!userData) {
          throw new Error('No se encontraron datos del usuario');
        }
        
        // Create a new user object with all the properties
        this.usuario = {
          IdUsuario: userData.IdUsuario,
          Nombre: userData.Nombre,
          Correo: userData.Correo || userData.Email || '',
          Departamento: userData.Departamento || '',
          Foto_Perfil: userData.Foto_Perfil || '',
          NivelAdmin: userData.NivelAdmin,
          createdBy: userData.createdBy || userData.CreatedBy,
          Rol: userData.Rol || 'worker' // Default to worker, never use empty string
        };
        
        // Preload profile image to ensure it's valid
        if (this.usuario.Foto_Perfil) {
          this.preloadImage(this.usuario.Foto_Perfil).catch(() => {
            console.warn('No se pudo cargar la imagen de perfil, usando la predeterminada');
            if (this.usuario) {
              this.usuario.Foto_Perfil = '';
            }
          });
        }
        
        this.isLoading = false;
      })
      .catch(error => {
        console.error('Error al cargar datos del usuario:', error);
        this.router.navigate(['/login']);
      });
  }

  // Preload image to verify it's valid
  private preloadImage(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = src;
    });
  }
}