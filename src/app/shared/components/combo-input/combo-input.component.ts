import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'combo-input',
  standalone: true,
  imports: [FormsModule, InputTextModule],
  templateUrl: './combo-input.component.html',
  styleUrl: './combo-input.component.scss',
})
export class ComboInputComponent {
  value = model<string>('');

  placeholder = input('');
  type = input<'text' | 'search'>('text');
  icon = input('');
  disabled = input(false);
  inputId = input('');
}
