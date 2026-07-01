import { Component, OnInit } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonModule } from 'primeng/button';
import { ZONES_DATA, Zone } from '../zones-management.component';

interface ZoneForm {
  name: string;
  coverage: string;
  isActive: boolean;
}

@Component({
  selector: 'ctrl-zone-form',
  standalone: true,
  imports: [NgClass, FormsModule, InputTextModule, TextareaModule, ToggleSwitchModule, ButtonModule],
  templateUrl: './zone-form.component.html',
  styleUrl: './zone-form.component.scss',
})
export class ZoneFormComponent implements OnInit {
  isEditMode = false;
  zoneId: string | null = null;

  form: ZoneForm = {
    name: '',
    coverage: '',
    isActive: true,
  };

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.zoneId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.zoneId;

    if (this.isEditMode) {
      const existing = ZONES_DATA.find(z => z.id === this.zoneId);
      if (existing) {
        this.form = {
          name:     existing.name,
          coverage: existing.coverage,
          isActive: existing.status === 'active',
        };
      }
    }
  }

  save(): void {
    // In a real app, dispatch to a service/store here.
    this.router.navigate(['/zones']);
  }

  cancel(): void {
    this.router.navigate(['/zones']);
  }
}
