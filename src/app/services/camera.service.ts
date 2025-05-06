import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { CloudinaryImageService } from './cloudinary-image.service';

// Photo item interface - updated with cloudinaryUrl
export interface PhotoItem {
  url: string;
  timestamp: Date;
  cloudinaryUrl?: string; // Added for Cloudinary integration
  name?: string; // Optional name for the photo
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
  // Inject CloudinaryImageService
  private cloudinaryService = inject(CloudinaryImageService);
  
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
  
  // Camera methods with Cloudinary integration
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
        timestamp: new Date(),
        name: `photo_${Date.now()}.jpeg`
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
  
  // Add a photo with enhanced parameters
  addPhoto(photo: { url: string; date: Date; name: string; cloudinaryUrl?: string }): void {
    const newPhoto: PhotoItem = {
      url: photo.url,
      timestamp: photo.date,
      name: photo.name,
      cloudinaryUrl: photo.cloudinaryUrl
    };
    
    const currentPhotos = this._photos.value;
    const updatedPhotos = [newPhoto, ...currentPhotos];
    this._photos.next(updatedPhotos);
    
    // Save to local storage
    this.savePhotosToStorage();
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
  
  // Upload a photo to Cloudinary and update its cloudinaryUrl
  async uploadPhotoToCloudinary(index: number, userId: string, reportId: string = 'default'): Promise<string | null> {
    const currentPhotos = this._photos.value;
    if (index < 0 || index >= currentPhotos.length) {
      console.error('Invalid photo index');
      return null;
    }
    
    const photo = currentPhotos[index];
    
    // If already uploaded, return the existing URL
    if (photo.cloudinaryUrl) {
      return photo.cloudinaryUrl;
    }
    
    try {
      // Convert data URL to File object
      const file = await this.dataURLtoFile(
        photo.url, 
        photo.name || `photo_${Date.now()}.jpeg`
      );
      
      // Optimize the image
      const optimizedFile = await this.cloudinaryService.optimizeImage(file);
      
      // Upload to Cloudinary and get the URL (convert promise to async/await)
      const cloudinaryUrl = await this.cloudinaryService.uploadProfileImage(
        optimizedFile, 
        reportId, 
        'Reportes'
      ).toPromise();
      
      // Update the photo with the Cloudinary URL
      if (cloudinaryUrl) {
        const updatedPhotos = [...currentPhotos];
        updatedPhotos[index] = {
          ...photo,
          cloudinaryUrl: cloudinaryUrl
        };
        
        this._photos.next(updatedPhotos);
        this.savePhotosToStorage();
        return cloudinaryUrl;
      }
      
      return null;
    } catch (error) {
      console.error('Error uploading to Cloudinary:', error);
      return null;
    }
  }
  
  // Helper method to convert DataURL to File
  private async dataURLtoFile(dataUrl: string, filename: string): Promise<File> {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new File([u8arr], filename, { type: mime });
  }
  
  // Update a photo with Cloudinary URL
  updatePhotoWithCloudinaryUrl(index: number, cloudinaryUrl: string): boolean {
    const currentPhotos = this._photos.value;
    if (index >= 0 && index < currentPhotos.length) {
      const updatedPhotos = [...currentPhotos];
      updatedPhotos[index] = {
        ...updatedPhotos[index],
        cloudinaryUrl: cloudinaryUrl
      };
      
      this._photos.next(updatedPhotos);
      this.savePhotosToStorage();
      return true;
    }
    return false;
  }
  
  // Find a photo by URL and update its Cloudinary URL
  updatePhotoCloudUrlByLocalUrl(localUrl: string, cloudinaryUrl: string): boolean {
    const currentPhotos = this._photos.value;
    const index = currentPhotos.findIndex(photo => photo.url === localUrl);
    
    if (index >= 0) {
      return this.updatePhotoWithCloudinaryUrl(index, cloudinaryUrl);
    }
    return false;
  }
  
  // Get Cloudinary URL by local URL
  getCloudinaryUrl(localUrl: string): string | undefined {
    const photo = this._photos.value.find(p => p.url === localUrl);
    return photo?.cloudinaryUrl;
  }
  
  // Get photo index by URL
  getPhotoIndexByUrl(url: string): number {
    return this._photos.value.findIndex(photo => photo.url === url);
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