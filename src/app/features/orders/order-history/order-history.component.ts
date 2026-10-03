import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'ctrl-order-history',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './order-history.component.html',
})
export class OrderHistoryComponent {}
