// regist.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';

interface AccountData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  username: string;
  password: string;
}

@Component({
  selector: 'app-regist',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './regist.component.html',
  styleUrl: './regist.component.css'
})
export class RegistComponent {
  showPassword = false;
  isLoading = false;
  showSuccessMessage = false;
  showErrorMessage = false;

  accountData: AccountData = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    username: '',
    password: ''
  };

  constructor(
    private router: Router,
    private auth: Auth,
    private firestore: Firestore
  ) {}

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  async onSubmit(form: NgForm): Promise<void> {
    if (form.invalid) return;

    this.isLoading = true;

    try {
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        this.accountData.email,
        this.accountData.password
      );

      await setDoc(doc(this.firestore, 'Usuario', userCredential.user.uid), {
        Nombre: `${this.accountData.firstName} ${this.accountData.lastName}`,
        Correo: this.accountData.email,
        IdUsuario: userCredential.user.uid,
        Foto_Perfil: ' ',
        Rol: 'user',
        Telefono: this.accountData.phone,
        Username: this.accountData.username
      });

      this.showSuccessMessage = true;
      this.resetForm();
      form.resetForm();
      
      setTimeout(() => {
        this.showSuccessMessage = false;
        this.router.navigate(['/login']);
      }, 3000);

    } catch (error) {
      console.error('Error al crear la cuenta:', error);
      this.showErrorMessage = true;
      setTimeout(() => {
        this.showErrorMessage = false;
      }, 3000);
    } finally {
      this.isLoading = false;
    }
  }

  private resetForm(): void {
    this.accountData = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      username: '',
      password: ''
    };
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}