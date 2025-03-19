import { Injectable } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';

export interface Worker {
  id: string;
  name: string;
  position: string;
  company: {
  name: string;
  address: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class WorkerService {
  constructor(private firestore: Firestore) {}

  async getWorkerData(workerId: string): Promise<Worker | null> {
    try {
      const workerDoc = await getDoc(doc(this.firestore, 'workers', workerId));
      if (workerDoc.exists()) {
        return { id: workerDoc.id, ...workerDoc.data() } as Worker;
      }
      return null;
    } catch (error) {
      console.error('Error getting worker data:', error);
      return null;
    }
  }
}