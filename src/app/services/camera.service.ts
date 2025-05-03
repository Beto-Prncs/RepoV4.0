import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';

// Photo item interface
export interface PhotoItem {
  url: string;
  timestamp: Date;
}

// Report item interface
export interface ReportItem {
  id: string;
  imageUrl: string;
  timestamp: Date;
  technician: string;
  status: string;
  description: string;
}

@Injectable({
  providedIn: 'root'
})
export class CameraService {
  addPhoto(arg0: { url: any; date: Date; name: any; }) {
    throw new Error('Method not implemented.');
  }
  // BehaviorSubjects to store and share data
  public _photos = new BehaviorSubject<PhotoItem[]>([]); // Público para acceso directo
  private _reports = new BehaviorSubject<ReportItem[]>([]);
  private _draftReport = new BehaviorSubject<ReportItem | null>(null);
  
  // Expose as observables
  public photos$ = this._photos.asObservable();
  public reports$ = this._reports.asObservable();
  public draftReport$ = this._draftReport.asObservable();
  
  // Local storage keys
  private readonly PHOTOS_STORAGE_KEY = 'camera_photos';
  private readonly REPORTS_STORAGE_KEY = 'maintenance_reports';
  private readonly DRAFT_REPORT_KEY = 'draft_report';
  
  constructor() {
    // Load data from local storage on service initialization
    this.loadPhotosFromStorage();
    this.loadReportsFromStorage();
    this.loadDraftReportFromStorage();
  }
  
  // Camera methods
  async takePicture(): Promise<string> {
    try {
      if (!Capacitor.isPluginAvailable('Camera')) {
        throw new Error('Camera is not available on this device');
      }
      
      // Request camera permissions
      await Camera.requestPermissions();
      
      // Take picture
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });
      
      if (!image.dataUrl) {
        throw new Error('Failed to capture image');
      }
      
      // Save the photo
      const newPhoto: PhotoItem = {
        url: image.dataUrl,
        timestamp: new Date()
      };
      
      // Update photos list
      const currentPhotos = this._photos.value;
      const updatedPhotos = [newPhoto, ...currentPhotos];
      this._photos.next(updatedPhotos);
      
      // Save to local storage
      this.savePhotosToStorage();
      
      return image.dataUrl;
    } catch (error) {
      console.error('Error taking picture:', error);
      throw error;
    }
  }
  
  // Delete a photo
  deletePhoto(index: number): void {
    const currentPhotos = this._photos.value;
    if (index >= 0 && index < currentPhotos.length) {
      const updatedPhotos = [...currentPhotos];
      updatedPhotos.splice(index, 1);
      this._photos.next(updatedPhotos);
      
      // Save updated list to storage
      this.savePhotosToStorage();
    }
  }
  
  // Add a report
  addReport(report: ReportItem): void {
    const currentReports = this._reports.value;
    const updatedReports = [report, ...currentReports];
    this._reports.next(updatedReports);
    
    // Save to storage
    this.saveReportsToStorage();
    
    // Clear draft after saving
    this._draftReport.next(null);
    localStorage.removeItem(this.DRAFT_REPORT_KEY);
  }
  
  // Update a report
  updateReport(index: number, updatedReport: ReportItem): void {
    const currentReports = this._reports.value;
    if (index >= 0 && index < currentReports.length) {
      const updatedReports = [...currentReports];
      updatedReports[index] = updatedReport;
      this._reports.next(updatedReports);
      
      // Save to storage
      this.saveReportsToStorage();
    }
  }
  
  // Delete a report
  deleteReport(index: number): void {
    const currentReports = this._reports.value;
    if (index >= 0 && index < currentReports.length) {
      const updatedReports = [...currentReports];
      updatedReports.splice(index, 1);
      this._reports.next(updatedReports);
      
      // Save to storage
      this.saveReportsToStorage();
    }
  }
  
  // Save draft report
  saveDraftReport(report: ReportItem): void {
    this._draftReport.next(report);
    localStorage.setItem(this.DRAFT_REPORT_KEY, JSON.stringify(report));
  }
  
  // Get technician name (mock function)
  getTechnicianName(): string {
    return 'Técnico de Mantenimiento';
  }
  
  // Local storage methods
  private savePhotosToStorage(): void {
    try {
      const photos = this._photos.value;
      localStorage.setItem(this.PHOTOS_STORAGE_KEY, JSON.stringify(photos));
    } catch (error) {
      console.error('Error saving photos to storage:', error);
    }
  }
  
  private loadPhotosFromStorage(): void {
    try {
      const photosJson = localStorage.getItem(this.PHOTOS_STORAGE_KEY);
      if (photosJson) {
        const parsedPhotos = JSON.parse(photosJson) as PhotoItem[];
        // Convert string dates back to Date objects
        const photos = parsedPhotos.map(photo => ({
          ...photo,
          timestamp: new Date(photo.timestamp)
        }));
        this._photos.next(photos);
      }
    } catch (error) {
      console.error('Error loading photos from storage:', error);
      // If error, initialize with empty array
      this._photos.next([]);
    }
  }
  
  private saveReportsToStorage(): void {
    try {
      const reports = this._reports.value;
      localStorage.setItem(this.REPORTS_STORAGE_KEY, JSON.stringify(reports));
    } catch (error) {
      console.error('Error saving reports to storage:', error);
    }
  }
  
  private loadReportsFromStorage(): void {
    try {
      const reportsJson = localStorage.getItem(this.REPORTS_STORAGE_KEY);
      if (reportsJson) {
        const parsedReports = JSON.parse(reportsJson) as ReportItem[];
        // Convert string dates back to Date objects
        const reports = parsedReports.map(report => ({
          ...report,
          timestamp: new Date(report.timestamp)
        }));
        this._reports.next(reports);
      }
    } catch (error) {
      console.error('Error loading reports from storage:', error);
      // If error, initialize with empty array
      this._reports.next([]);
    }
  }
  
  private loadDraftReportFromStorage(): void {
    try {
      const draftJson = localStorage.getItem(this.DRAFT_REPORT_KEY);
      if (draftJson) {
        const parsedDraft = JSON.parse(draftJson) as ReportItem;
        // Convert string date back to Date object
        const draft = {
          ...parsedDraft,
          timestamp: new Date(parsedDraft.timestamp)
        };
        this._draftReport.next(draft);
      }
    } catch (error) {
      console.error('Error loading draft report from storage:', error);
      // If error, initialize with null
      this._draftReport.next(null);
    }
  }
}