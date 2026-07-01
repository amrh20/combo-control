import { Component } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';

export interface Zone {
  id: string;
  name: string;       // Arabic hub/street name
  coverage: string;   // Description of coverage area
  status: 'active' | 'inactive';
  shopCount: number;
}

// Exported so ZoneFormComponent and ZoneDetailsComponent can share this data
export const ZONES_DATA: Zone[] = [
  { id: 'ZN-001', name: 'مجمع شطر ١٣',        coverage: 'شارع الملك فهد – حي النزهة',              status: 'active',   shopCount: 14 },
  { id: 'ZN-002', name: 'حي الروضة',            coverage: 'شارع الأمير سلطان – حي الروضة',            status: 'active',   shopCount: 9  },
  { id: 'ZN-003', name: 'منطقة الملك عبدالله',  coverage: 'طريق الملك عبدالله – الحي الشمالي',        status: 'inactive', shopCount: 0  },
  { id: 'ZN-004', name: 'مجمع الواحة',          coverage: 'شارع العليا – حي السليمانية',              status: 'active',   shopCount: 22 },
  { id: 'ZN-005', name: 'حي الورود',            coverage: 'شارع الأندلس – حي الورود',                status: 'active',   shopCount: 7  },
  { id: 'ZN-006', name: 'مركز الاتصالات',       coverage: 'حي العارض – شمال الرياض',                 status: 'inactive', shopCount: 3  },
  { id: 'ZN-007', name: 'مجمع شطر ٥',           coverage: 'طريق الدائري الشرقي – حي المعيزيلة',       status: 'active',   shopCount: 18 },
  { id: 'ZN-008', name: 'حي الياسمين',          coverage: 'شارع التحلية – حي الياسمين',              status: 'active',   shopCount: 11 },
];

@Component({
  selector: 'ctrl-zones-management',
  standalone: true,
  imports: [NgClass, RouterLink, TableModule, ButtonModule],
  templateUrl: './zones-management.component.html',
  styleUrl: './zones-management.component.scss',
})
export class ZonesManagementComponent {
  readonly zones = ZONES_DATA;
}
