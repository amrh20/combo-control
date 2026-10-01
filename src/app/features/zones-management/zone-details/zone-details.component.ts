import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Zone } from '../../../core/models/zone.model';
import { HubService } from '../../../core/services/hub.service';
import { SubZoneService } from '../../../core/services/sub-zone.service';
import { ZoneService } from '../../../core/services/zone.service';
import { ZoneMapComponent } from '../../geofencing/zone-map/zone-map.component';

@Component({
  selector: 'ctrl-zone-details',
  standalone: true,
  imports: [NgClass, DecimalPipe, RouterLink, ZoneMapComponent],
  templateUrl: './zone-details.component.html',
  styleUrl: './zone-details.component.scss',
})
export class ZoneDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly zoneService = inject(ZoneService);
  private readonly subZoneService = inject(SubZoneService);
  private readonly hubService = inject(HubService);

  readonly zone = signal<Zone | null>(null);

  readonly servingHubs = computed(() => {
    const id = this.zone()?.id;
    if (!id) {
      return [];
    }
    const subZoneIds = new Set(this.subZoneService.byParent(id).map((subZone) => subZone.id));
    return this.hubService.hubs().filter((hub) =>
      hub.servingSubZoneIds.some((subZoneId) => subZoneIds.has(subZoneId)),
    );
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.zone.set(id ? this.zoneService.getById(id) : null);
  }

  goBack(): void {
    this.router.navigate(['/zones']);
  }
}
