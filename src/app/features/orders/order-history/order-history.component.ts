import { Component } from '@angular/core';
import { OpsBoardComponent } from '../../orders-management/ops-board/ops-board.component';

@Component({
  selector: 'ctrl-order-history',
  standalone: true,
  imports: [OpsBoardComponent],
  templateUrl: './order-history.component.html',
})
export class OrderHistoryComponent {
  /** Closed orders from `GET /v1/orders` (delivered, cancelled, failed). */
}
