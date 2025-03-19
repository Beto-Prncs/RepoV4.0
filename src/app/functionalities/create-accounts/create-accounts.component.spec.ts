import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateAccountsComponent } from './create-accounts.component';

describe('CreateAccountsComponent', () => {
  let component: CreateAccountsComponent;
  let fixture: ComponentFixture<CreateAccountsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateAccountsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateAccountsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
