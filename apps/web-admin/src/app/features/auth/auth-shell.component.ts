import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IconComponent } from '../../shared/components/icon.component';

/** Split-screen auth layout: navy brand panel + right-hand form via router-outlet. */
@Component({
  selector: 'os-auth-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, IconComponent],
  template: `
    <main class="min-h-screen flex flex-col md:flex-row bg-panel">
      <!-- Brand panel -->
      <section
        class="hidden md:flex md:w-1/2 lg:w-3/5 relative overflow-hidden flex-col justify-between p-10 lg:p-14"
        style="background: radial-gradient(120% 120% at 100% 0%, #1e293b 0%, #091426 55%, #060b15 100%);"
      >
        <div class="absolute top-0 right-0 -translate-y-1/3 translate-x-1/4 w-[560px] h-[560px] rounded-full bg-white/5 blur-3xl"></div>

        <div class="relative z-10">
          <div class="flex items-center gap-3 mb-14">
            <div class="w-10 h-10 bg-accent rounded-xl flex items-center justify-center">
              <os-icon name="domain" [size]="22" [fill]="true" />
            </div>
            <span class="text-xl font-bold text-white tracking-tight">NestPG</span>
          </div>

          <div class="max-w-xl">
            <h1 class="text-[34px] leading-tight font-semibold text-white mb-4 tracking-tight">
              Operate every property from one command center
            </h1>
            <p class="text-base text-white/60 mb-12 leading-relaxed">
              The operating system for institutional PG, hostel &amp; co-living portfolios — real-time
              visibility, automated workflows, and executive-level reporting.
            </p>

            <div class="space-y-6">
              @for (f of features; track f.title) {
                <div class="flex items-start gap-4">
                  <div class="mt-0.5 w-10 h-10 shrink-0 bg-white/5 rounded-xl flex items-center justify-center text-accent">
                    <os-icon [name]="f.icon" [size]="20" />
                  </div>
                  <div>
                    <h3 class="text-[15px] font-semibold text-white">{{ f.title }}</h3>
                    <p class="text-[13px] text-white/50">{{ f.desc }}</p>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>

        <div class="relative z-10 mt-12 border-t border-white/10 pt-6">
          <p class="text-[11px] uppercase tracking-[0.18em] text-white/40">Trusted by modern operators</p>
        </div>
      </section>

      <!-- Form panel -->
      <section class="flex-1 flex flex-col justify-center items-center p-6 sm:p-10 bg-canvas">
        <div class="w-full max-w-[420px]">
          <div class="md:hidden flex items-center gap-2 mb-8">
            <div class="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <os-icon name="domain" [size]="18" [fill]="true" />
            </div>
            <span class="text-lg font-bold text-content tracking-tight">NestPG</span>
          </div>
          <router-outlet />
        </div>
      </section>
    </main>
  `,
})
export class AuthShellComponent {
  protected readonly features = [
    { icon: 'speed', title: 'Unified Dashboard', desc: 'Aggregated data across your entire portfolio in one view.' },
    { icon: 'auto_awesome', title: 'Smart Automation', desc: 'Eliminate manual tasks with event-driven operational logic.' },
    { icon: 'shield', title: 'Enterprise Security', desc: 'Role-based access controls and audited infrastructure.' },
  ];
}
