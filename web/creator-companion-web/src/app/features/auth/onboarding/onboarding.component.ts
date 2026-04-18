import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';

interface Step {
  title: string;
  body: string;
  icon: string;
}

const STEPS: Step[] = [
  {
    icon: '✦',
    title: 'One entry. Every day.',
    body: 'Creator Companion is built around a single habit: showing up for your creative work each day. You don\'t need to write a lot — just something. Ten words is enough to keep the streak alive.'
  },
  {
    icon: '🔥',
    title: 'Your streak is your story.',
    body: 'Every day you write, your streak grows. Missing a day breaks it. That gentle pressure is the whole point — it turns intention into action, and action into identity.'
  },
  {
    icon: '🔒',
    title: 'Completely private.',
    body: 'Everything you write is yours. Your entries are private by default and securely backed up. This is your space — no audience, no pressure, no performance.'
  },
  {
    icon: '✏️',
    title: 'Ready to write?',
    body: 'Your first entry is waiting. It can be a sentence, a thought, a question — anything. The only rule is that you start. Your streak begins the moment you write today.'
  }
];

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="onboarding-page">
      <div class="onboarding-card card fade-in">

        <div class="step-content">
          <div class="step-icon">{{ currentStep().icon }}</div>
          <h2>{{ currentStep().title }}</h2>
          <p class="text-muted" style="margin-top:.75rem; line-height:1.7">
            {{ currentStep().body }}
          </p>
        </div>

        <div class="step-dots">
          <span
            *ngFor="let s of steps; let i = index"
            class="dot"
            [class.dot--active]="i === stepIndex()"
          ></span>
        </div>

        <div class="step-actions">
          <button
            *ngIf="stepIndex() < steps.length - 1"
            class="btn btn--primary btn--full btn--lg"
            (click)="next()"
          >
            Continue
          </button>

          <button
            *ngIf="stepIndex() === steps.length - 1"
            class="btn btn--primary btn--full btn--lg"
            [disabled]="loading()"
            (click)="finish()"
          >
            {{ loading() ? 'Just a moment…' : 'Write my first entry' }}
          </button>

          <button
            *ngIf="stepIndex() < steps.length - 1"
            class="btn btn--ghost btn--full btn--sm"
            (click)="finish()"
          >
            Skip
          </button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .onboarding-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: var(--color-bg);
    }
    .onboarding-card {
      width: 100%;
      max-width: 460px;
    }
    .step-content { text-align: center; padding: 1rem 0 2rem; }
    .step-icon { font-size: 2.5rem; margin-bottom: 1.25rem; }
    .step-dots {
      display: flex;
      justify-content: center;
      gap: .5rem;
      margin-bottom: 2rem;
    }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--color-border);
      transition: background .2s, transform .2s;
    }
    .dot--active {
      background: var(--color-accent);
      transform: scale(1.25);
    }
    .step-actions { display: flex; flex-direction: column; gap: .75rem; }
  `]
})
export class OnboardingComponent {
  private auth   = inject(AuthService);
  private api    = inject(ApiService);
  private router = inject(Router);

  steps     = STEPS;
  stepIndex = signal(0);
  loading   = signal(false);

  currentStep() { return STEPS[this.stepIndex()]; }

  next(): void {
    if (this.stepIndex() < STEPS.length - 1)
      this.stepIndex.update(i => i + 1);
  }

  finish(): void {
    this.loading.set(true);
    this.api.completeOnboarding().subscribe({
      next: () => this.router.navigate(['/entry/new']),
      error: () => this.router.navigate(['/entry/new'])
    });
  }
}
