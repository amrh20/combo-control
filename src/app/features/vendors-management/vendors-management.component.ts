import { Component } from '@angular/core';
import { VendorsListComponent } from './vendors-list/vendors-list.component';

@Component({
  selector: 'ctrl-vendors-management',
  standalone: true,
  imports: [VendorsListComponent],
  templateUrl: './vendors-management.component.html',
  styleUrl: './vendors-management.component.scss',
})
export class VendorsManagementComponent {}
