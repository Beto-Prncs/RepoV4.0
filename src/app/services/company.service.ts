// src/app/services/company.service.ts
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
import { Empresa } from '../models/interfaces';

@Injectable({
  providedIn: 'root'
})
export class CompanyService {
  private firestore: Firestore = inject(Firestore);

  // Obtener todas las empresas
  getCompanies(): Observable<Empresa[]> {
    const empresasRef = collection(this.firestore, 'Empresa');
    return collectionData(empresasRef, { idField: 'IdEmpresa' })
      .pipe(
        map(companies => companies as Empresa[])
      );
  }

  // Añadir una nueva empresa
  async addCompany(companyData: Partial<Empresa>): Promise<string> {
    try {
      // Verificar si ya existe una empresa con el mismo nombre
      const companyRef = collection(this.firestore, 'Empresa');
      const q = query(companyRef, where('Nombre', '==', companyData.Nombre));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        throw new Error('Ya existe una empresa con este nombre');
      }
      
      // Crear nueva empresa
      const docRef = await addDoc(collection(this.firestore, 'Empresa'), companyData);
      
      // Actualizar con su propio ID
      await updateDoc(docRef, { IdEmpresa: docRef.id });
      
      return docRef.id;
    } catch (error) {
      console.error('Error al añadir empresa:', error);
      throw error;
    }
  }

  // Eliminar una empresa
  async deleteCompany(companyId: string): Promise<void> {
    try {
      // Verificar si hay reportes asociados a esta empresa
      const reportesRef = collection(this.firestore, 'Reportes');
      const q = query(reportesRef, where('IdEmpresa', '==', companyId));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        throw new Error('No se puede eliminar la empresa porque hay reportes asociados a ella');
      }
      
      // Obtener la referencia del documento por ID
      const companyQuery = query(
        collection(this.firestore, 'Empresa'),
        where('IdEmpresa', '==', companyId)
      );
      const companySnapshot = await getDocs(companyQuery);
      
      if (companySnapshot.empty) {
        throw new Error('Empresa no encontrada');
      }
      
      // Eliminar el documento
      await deleteDoc(doc(this.firestore, 'Empresa', companySnapshot.docs[0].id));
    } catch (error) {
      console.error('Error al eliminar empresa:', error);
      throw error;
    }
  }
}