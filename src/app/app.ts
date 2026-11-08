import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'ctrl-root',
  standalone: true,
  imports: [RouterOutlet, ToastModule],
  template: `
    <p-toast position="top-center" [baseZIndex]="1400" />
    <router-outlet />
  `,
})
export class App {}
