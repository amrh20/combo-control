import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { DecimalPipe, NgClass } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { Zone } from '../../../core/models/zone.model';
import { AuthService } from '../../../core/services/auth.service';
import { HubService } from '../../../core/services/hub.service';
import { SubZoneService } from '../../../core/services/sub-zone.service';
import { ZoneService } from '../../../core/services/zone.service';
import { MapComponent } from '../../../shared/components/map/map.component';

@Component({
  selector: 'ctrl-zone-details',
  standalone: true,
  imports: [NgClass, DecimalPipe, PermissionDirective, RouterLink, MapComponent],
  templateUrl: './zone-details.component.html',
  styleUrl: './zone-details.component.scss',
})
export class ZoneDetailsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly zoneService = inject(ZoneService);
  private readonly subZoneService = inject(SubZoneService);
  private readonly hubService = inject(HubService);
  private readonly destroyRef = inject(DestroyRef);

  readonly zone = signal<Zone | null>(null);
  readonly loading = signal(true);

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
    if (!id) {
      this.loading.set(false);
      return;
    }

    forkJoin({
      zone: this.zoneService.getZoneById(id),
      subZones: this.zoneService.getSubZones(id),
      hubs: this.hubService.getHubs(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ zone }) => {
          this.zone.set(zone);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  goBack(): void {
    this.router.navigate(['/zones']);
  }
}
