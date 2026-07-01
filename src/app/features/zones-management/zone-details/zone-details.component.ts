import { Component, OnInit } from '@angular/core';
import { NgClass, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { ZONES_DATA, Zone } from '../zones-management.component';
import {
  getEffectiveLiveStatus,
  LIVE_STATUS_CONFIG,
  syncVendorsFromState,
  VendorProfile,
} from '../../vendors-management/data/vendors.mock';

@Component({
  selector: 'ctrl-zone-details',
  standalone: true,
  imports: [NgClass, DecimalPipe, RouterLink, TableModule, ButtonModule],
  templateUrl: './zone-details.component.html',
  styleUrl: './zone-details.component.scss',
})
export class ZoneDetailsComponent implements OnInit {
  zone: Zone | undefined;
  linkedShops: VendorProfile[] = [];
  readonly liveStatusConfig = LIVE_STATUS_CONFIG;

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.zone = ZONES_DATA.find(z => z.id === id);

    if (this.zone) {
      this.linkedShops = syncVendorsFromState().filter(v => v.zoneName === this.zone!.name);
    }
  }

  getLiveStatus(shop: VendorProfile) {
    return getEffectiveLiveStatus(shop);
  }

  goBack(): void {
    this.router.navigate(['/zones']);
  }
}
