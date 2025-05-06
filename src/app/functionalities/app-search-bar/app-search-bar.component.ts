import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-app-search-bar',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app-search-bar.component.html',
  styleUrl: './app-search-bar.component.css'
})
export class SearchBarComponent implements OnInit {
  @Input() placeholder: string = 'Buscar...';
  @Input() showAdvancedFilters: boolean = false;
  @Input() filterLabel1: string = 'Filtro 1';
  @Input() filterLabel2: string = 'Filtro 2';
  @Input() filterOptions1: {label: string, value: string}[] = [];
  @Input() filterOptions2: {label: string, value: string}[] = [];
  
  @Output() searched = new EventEmitter<any>();
  @Output() filtersChanged = new EventEmitter<any>();
  @Output() cleared = new EventEmitter<void>();
  
  searchForm: FormGroup;
  
  constructor(private fb: FormBuilder) {
    this.searchForm = this.fb.group({
      term: [''],
      filter1: [''],
      filter2: ['']
    });
  }
  
  ngOnInit(): void {
    // Detección de cambios en los inputs con debounce
    this.searchForm.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged()
      )
      .subscribe(values => {
        this.filtersChanged.emit(values);
      });
  }
  
  search(): void {
    const searchValues = this.searchForm.value;
    this.searched.emit(searchValues);
  }
  
  clearSearch(): void {
    this.searchForm.get('term')?.setValue('');
    this.cleared.emit();
  }
  
  resetFilters(): void {
    this.searchForm.patchValue({
      filter1: '',
      filter2: ''
    });
    this.filtersChanged.emit(this.searchForm.value);
  }
  
  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }
}