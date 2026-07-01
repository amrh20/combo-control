import { Component } from '@angular/core';
import { OpsBoardComponent } from './ops-board/ops-board.component';

@Component({
  selector: 'ctrl-orders-management',
  standalone: true,
  imports: [OpsBoardComponent],
  templateUrl: './orders-management.component.html',
  styleUrl: './orders-management.component.scss',
})
export class OrdersManagementComponent {}
