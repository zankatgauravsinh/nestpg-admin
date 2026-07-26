import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'nestpg-page-header',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule],
  template: `
    <div class="flex items-start justify-between gap-4 mb-6">
      <div class="flex items-center gap-3 min-w-0">
        @if (backRoute()) {
          <a
            [routerLink]="backRoute()"
            mat-icon-button
            class="shrink-0 -ml-2"
            aria-label="Go back"
          >
            <mat-icon>arrow_back</mat-icon>
          </a>
        }
        <div class="min-w-0">
          <h1 class="text-xl font-semibold text-[var(--color-text-primary)] leading-tight truncate">
            {{ title() }}
          </h1>
          @if (subtitle()) {
            <p class="mt-0.5 text-sm text-[var(--color-text-secondary)]">{{ subtitle() }}</p>
          }
        </div>
      </div>

      @if (actionLabel()) {
        <div class="shrink-0">
          <button
            mat-flat-button
            color="primary"
            (click)="actionClick.emit()"
            class="!h-9"
          >
            @if (actionIcon()) {
              <mat-icon>{{ actionIcon() }}</mat-icon>
            }
            {{ actionLabel() }}
          </button>
        </div>
      }
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title      = input.required<string>();
  readonly subtitle   = input<string | null>(null);
  readonly backRoute  = input<string | null>(null);
  readonly actionLabel = input<string | null>(null);
  readonly actionIcon  = input<string | null>(null);

  readonly actionClick = output<void>();
}
