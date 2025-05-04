// src/app/services/department.service.ts
import { Injectable, inject } from '@angular/core';
import { 
  Firestore, 
  collection, 
  collectionData, 
  doc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  query, 
  where, 
  getDocs 
} from '@angular/fire/firestore';
import { Observable, map, from, of } from 'rxjs';
import { Departamento } from '../models/interfaces';

@Injectable({
  providedIn: 'root'
})
export class DepartmentService {
  private firestore: Firestore = inject(Firestore);

  // Obtener todos los departamentos
  getDepartments(): Observable<Departamento[]> {
    const deptoRef = collection(this.firestore, 'Departamento');
    return collectionData(deptoRef, { idField: 'IdDepartamento' })
      .pipe(
        map(departments => departments.map(dept => ({
          IdDepartamento: dept['IdDepartamento'],
          Nombre: dept['Nombre'],
          id: dept['IdDepartamento'],
          name: dept['Nombre']
        })) as Departamento[])
      );
  }

  // Añadir un nuevo departamento
  async addDepartment(departmentName: string): Promise<string> {
    try {
      // Verificar si ya existe
      const deptoRef = collection(this.firestore, 'Departamento');
      const q = query(deptoRef, where('Nombre', '==', departmentName));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        throw new Error('Ya existe un departamento con este nombre');
      }
      
      // Crear nuevo departamento con ID personalizado (nombre normalizado)
      const id = departmentName.toLowerCase().trim().replace(/\s+/g, '_');
      const newDepartment = {
        IdDepartamento: id,
        Nombre: departmentName
      };
      
      await addDoc(collection(this.firestore, 'Departamento'), newDepartment);
      return id;
    } catch (error) {
      console.error('Error al añadir departamento:', error);
      throw error;
    }
  }

  // Eliminar un departamento
  async deleteDepartment(departmentId: string): Promise<void> {
    try {
      // Verificar si hay usuarios asignados a este departamento
      const usersRef = collection(this.firestore, 'Usuario');
      const q = query(usersRef, where('Departamento', '==', departmentId));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        throw new Error('No se puede eliminar el departamento porque hay usuarios asignados a él');
      }
      
      // Obtener la referencia del documento por ID
      const deptoQuery = query(
        collection(this.firestore, 'Departamento'),
        where('IdDepartamento', '==', departmentId)
      );
      const deptoSnapshot = await getDocs(deptoQuery);
      
      if (deptoSnapshot.empty) {
        throw new Error('Departamento no encontrado');
      }
      
      // Eliminar el documento
      await deleteDoc(doc(this.firestore, 'Departamento', deptoSnapshot.docs[0].id));
    } catch (error) {
      console.error('Error al eliminar departamento:', error);
      throw error;
    }
  }
}