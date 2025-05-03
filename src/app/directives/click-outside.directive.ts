import { Directive, ElementRef, EventEmitter, HostListener, Output } from '@angular/core';

@Directive({
  standalone: true,
  selector: '[appClickOutside]'
})
export class ClickOutsideDirective {

  @Output() clickOutside = new EventEmitter<void>();
  
  constructor(private elementRef: ElementRef) { }

  @HostListener('document:click', ['$event'])
  public onClick(event: MouseEvent) {
    const targetElement = event.target as HTMLElement;
    const clickedInside = this.elementRef.nativeElement.contains(targetElement);
    
    if (!clickedInside) {
      this.clickOutside.emit();
    }
  }
  
  // Importante: agregar manejo para dispositivos táctiles
  @HostListener('document:touchstart', ['$event'])
  public onTouchStart(event: TouchEvent) {
    if (event.touches && event.touches[0]) {
      const touch = event.touches[0];
      const targetElement = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;
      
      if (targetElement && !this.elementRef.nativeElement.contains(targetElement)) {
        this.clickOutside.emit();
      }
    }
  }
}