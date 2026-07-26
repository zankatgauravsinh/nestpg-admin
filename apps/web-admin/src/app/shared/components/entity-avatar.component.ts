import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const PALETTE = [
  'bg-[#1e293b] text-white',
  'bg-[#c2410c] text-white',
  'bg-[#0e7490] text-white',
  'bg-[#4338ca] text-white',
  'bg-[#15803d] text-white',
  'bg-[#9333ea] text-white',
  'bg-[#b45309] text-white',
];

/** Deterministic initials avatar. */
@Component({
  selector: 'os-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src()) {
      <img [src]="src()" alt="" class="rounded-full object-cover shrink-0 border border-border"
        [style.width.px]="size()" [style.height.px]="size()" />
    } @else {
      <span
        class="inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none"
        [class]="color()"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [style.fontSize.px]="size() * 0.38"
      >
        {{ initials() }}
      </span>
    }
  `,
})
export class EntityAvatarComponent {
  readonly name = input<string>('');
  readonly initialsInput = input<string | null>(null, { alias: 'initials' });
  readonly size = input<number>(36);
  /** Optional image URL; when set, renders the photo instead of initials. */
  readonly src = input<string | null>(null);

  protected readonly initials = computed(() => {
    if (this.initialsInput()) return this.initialsInput()!;
    const parts = (this.name() ?? '').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  });

  protected readonly color = computed(() => {
    const key = (this.name() ?? '') || this.initials();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return PALETTE[hash % PALETTE.length];
  });
}
