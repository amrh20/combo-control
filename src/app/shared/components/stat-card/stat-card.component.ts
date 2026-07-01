import { Component, input } from '@angular/core';
import { NgClass } from '@angular/common';

export type StatVariant = 'primary' | 'success' | 'warning' | 'error' | 'info';
export type ChangeDir   = 'up' | 'down' | 'neutral';

@Component({
  selector: 'ctrl-stat-card',
  standalone: true,
  imports: [NgClass],
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.scss',
})
export class StatCardComponent {
  label     = input.required<string>();
  value     = input.required<string | number>();
  icon      = input.required<string>();
  change    = input<string>('');
  changeDir = input<ChangeDir>('neutral');
  variant   = input<StatVariant>('primary');
}
