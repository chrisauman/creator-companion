import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ExportService } from '../../core/services/export.service';
import { PushService } from '../../core/services/push.service';
import { User, Capabilities, Tag, StreakStats, Reminder } from '../../core/models/models';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

const DEFAULT_REMINDER_MESSAGE = "Remember to log an entry to keep your streak alive.";

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SidebarComponent, MobileNavComponent],
  template: `
    <div class="page">

      <!-- Desktop sidebar -->
      <app-sidebar active="account" />

      <!-- Mobile top bar -->
      <header class="topbar">
        <a class="topbar__brand" routerLink="/dashboard">
          <img src="logo-icon.png" alt="" class="topbar__brand-icon">
          <span class="topbar__brand-name">Creator Companion</span>
        </a>
      </header>

      <!-- Mobile bottom nav -->
      <app-mobile-nav active="account" />

      <!-- Column wrapper: keeps main + sign-out in the same flex column -->
      <div class="content-col">

      <main class="container main-content stack stack--lg" *ngIf="user()">

        <!-- Plan -->
        <section class="card">
          <div class="section-head">
            <h2>Your plan</h2>
            <span class="tier-badge" [class.tier-badge--paid]="user()!.tier === 'Paid'">
              {{ user()!.tier }}
            </span>
          </div>
          <div class="caps-grid" *ngIf="caps()">
            <div class="cap-row">
              <span class="cap-label">Words per entry</span>
              <span class="cap-value">{{ caps()!.maxWordsPerEntry }}</span>
            </div>
            <div class="cap-row">
              <span class="cap-label">Images per entry</span>
              <span class="cap-value">{{ caps()!.maxImagesPerEntry }}</span>
            </div>
            <div class="cap-row">
              <span class="cap-label">Journals</span>
              <span class="cap-value">{{ caps()!.maxDiaries === -1 ? 'Unlimited' : caps()!.maxDiaries }}</span>
            </div>
            <div class="cap-row">
              <span class="cap-label">Backfill entries</span>
              <span class="cap-value">{{ caps()!.canBackfill ? 'Yes' : 'No' }}</span>
            </div>
            <div class="cap-row">
              <span class="cap-label">Recover deleted entries</span>
              <span class="cap-value">{{ caps()!.canRecoverDeleted ? 'Yes' : 'No' }}</span>
            </div>
            <div class="cap-row cap-row--full">
              <span class="cap-label">Pause streak</span>
              @if (caps()!.canUsePause && streak()) {
                <div class="pause-usage">
                  <span
                    class="pause-usage__bar"
                    [style.width.%]="(streak()!.pauseDaysUsedThisMonth / 10) * 100">
                  </span>
                  <span class="pause-usage__label">
                    {{ streak()!.pauseDaysUsedThisMonth }} of 10 days used this month
                  </span>
                </div>
              } @else {
                <span class="cap-value">{{ caps()!.canUsePause ? 'Yes' : 'No' }}</span>
              }
            </div>
          </div>
          @if (user()?.tier === 'Free') {
            <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--color-border-light)">
              <p class="text-muted text-sm" style="margin-bottom:.875rem">
                Upgrade for 5 entries/day, 2,500 words, photos, mood tracking, and all features.
              </p>
              <div style="display:flex;gap:.625rem;flex-wrap:wrap">
                <button class="btn btn--primary btn--sm" (click)="upgrade('monthly')" [disabled]="upgrading()">
                  {{ upgrading() === 'monthly' ? 'Redirecting…' : 'Upgrade — $3/month' }}
                </button>
                <button class="btn btn--secondary btn--sm" (click)="upgrade('annual')" [disabled]="upgrading()">
                  {{ upgrading() === 'annual' ? 'Redirecting…' : 'Upgrade — $30/year' }}
                </button>
              </div>
              @if (upgradeError()) {
                <p class="alert alert--error" style="margin-top:.75rem">{{ upgradeError() }}</p>
              }
            </div>
          }
          @if (user()?.tier === 'Paid') {
            <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--color-border-light)">
              <p class="text-muted text-sm" style="margin-bottom:.75rem">
                To cancel your subscription and keep your data, use the billing portal below.
                Your account will continue to exist on the free plan.
              </p>
              <button class="btn btn--secondary btn--sm" (click)="openBillingPortal()" [disabled]="portalLoading()">
                {{ portalLoading() ? 'Opening…' : 'Manage billing & subscription' }}
              </button>
              @if (portalError()) {
                <p class="alert alert--error" style="margin-top:.75rem">{{ portalError() }}</p>
              }
            </div>
          }
        </section>

        <!-- Notifications link -->
        <section class="card notif-link-card" routerLink="/notifications">
          <div class="notif-link-inner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <div>
              <p class="notif-link-title">Notifications</p>
              <p class="notif-link-sub">Manage reminders and push alerts</p>
            </div>
            <svg class="notif-link-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </section>

        <!-- Preferences (paid only) -->
        @if (user()?.tier === 'Paid') {
          <section class="card">
            <div class="section-head">
              <h2>Preferences</h2>
            </div>
            <div class="pref-row">
              <div class="pref-info">
                <p class="pref-label">Daily Spark</p>
                <p class="text-sm text-muted">Show a daily insight on creativity, resistance, mastery, and more.</p>
              </div>
              <label class="toggle-switch">
                <input type="checkbox"
                       [checked]="showMotivation()"
                       [disabled]="motivationPrefWorking()"
                       (change)="toggleMotivation()" />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>
            <div class="pref-row" style="border-top:1px solid var(--color-border-light);margin-top:.75rem;padding-top:.75rem">
              <div class="pref-info">
                <p class="pref-label">Daily Reminders</p>
                <p class="text-sm text-muted">Show your to-do/next-action list on the dashboard.</p>
              </div>
              <label class="toggle-switch">
                <input type="checkbox"
                       [checked]="showActionItems()"
                       [disabled]="actionItemsPrefWorking()"
                       (change)="toggleActionItems()" />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>
          </section>
        }

        <!-- Profile -->
        <section class="card">
          <h2 style="margin-bottom:1rem">Profile</h2>
          <div class="profile-rows">
            <div class="profile-row">
              <span class="cap-label">Username</span>
              <span>{{ user()!.username }}</span>
            </div>
            <div class="profile-row">
              <span class="cap-label">Email</span>
              <span>{{ user()!.email }}</span>
            </div>
            <div class="profile-row">
              <span class="cap-label">Timezone</span>
              <span>{{ user()!.timeZoneId }}</span>
            </div>
            <div class="profile-row">
              <span class="cap-label">Member since</span>
              <span>{{ formatDate(user()!.createdAt) }}</span>
            </div>
          </div>
        </section>

        <!-- Export -->
        <section class="card">
          <h2 style="margin-bottom:.375rem">Export your data</h2>
          <p class="text-muted text-sm" style="margin-bottom:1.25rem">
            Download all your entries. Your data always belongs to you.
          </p>
          <div class="export-actions">
            <button class="btn btn--secondary" (click)="exportJson()" [disabled]="exporting()">
              Export as JSON
            </button>
            <button class="btn btn--secondary" (click)="exportText()" [disabled]="exporting()">
              Export as Text
            </button>
          </div>
          <p *ngIf="exporting()" class="text-muted text-sm" style="margin-top:.75rem">
            Preparing export…
          </p>
        </section>

        <!-- Tags -->
        <section class="card">
          <div class="section-head">
            <h2>Your tags</h2>
            <span class="tag-count-badge" *ngIf="tags().length > 0">{{ tags().length }}</span>
          </div>

          <!-- Create new tag -->
          <form class="new-tag-form" (ngSubmit)="submitNewTag()" #newTagForm="ngForm">
            <input
              class="new-tag-input"
              type="text"
              [(ngModel)]="newTagValue"
              name="newTag"
              placeholder="New tag name…"
              maxlength="50"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <button
              class="btn btn--primary btn--sm"
              type="submit"
              [disabled]="!newTagValue.trim() || creatingTag()"
            >
              {{ creatingTag() ? 'Adding…' : '+ Add tag' }}
            </button>
          </form>

          <div *ngIf="tags().length === 0 && !tagsLoading()" class="empty-tags-note">
            Your tag library is empty. Add tags above or attach them to entries when writing.
          </div>

          <div class="tag-list" *ngIf="tags().length > 0">
            <div class="tag-row" *ngFor="let tag of tags()">
              <!-- View mode -->
              <ng-container *ngIf="editingTagId() !== tag.id">
                <div class="tag-row__info">
                  <span class="tag-row__chip">#{{ tag.name }}</span>
                  <span class="tag-row__count">{{ tag.usageCount }} {{ tag.usageCount === 1 ? 'entry' : 'entries' }}</span>
                </div>
                <div class="tag-row__actions">
                  <button class="tag-action-btn tag-action-btn--edit" (click)="startRename(tag)">Edit</button>
                  <button class="tag-action-btn tag-action-btn--delete" (click)="confirmDeleteTag(tag)">Delete</button>
                </div>
              </ng-container>

              <!-- Edit mode -->
              <ng-container *ngIf="editingTagId() === tag.id">
                <input
                  class="tag-rename-input"
                  type="text"
                  [(ngModel)]="renameValue"
                  (keydown.enter)="submitRename(tag)"
                  (keydown.escape)="cancelRename()"
                  autocomplete="off"
                  #renameInput
                />
                <div class="tag-row__actions">
                  <button class="tag-action-btn tag-action-btn--save" (click)="submitRename(tag)" [disabled]="!renameValue.trim()">Save</button>
                  <button class="tag-action-btn" (click)="cancelRename()">Cancel</button>
                </div>
              </ng-container>
            </div>
          </div>

          <p *ngIf="tagError()" class="alert alert--error" style="margin-top:.75rem">{{ tagError() }}</p>
        </section>

        <!-- Trash -->
        <section class="card">
          <h2 style="margin-bottom:.375rem">Trash</h2>
          <p class="text-muted text-sm" style="margin-bottom:1.25rem">
            Deleted entries are kept for 48 hours before being permanently removed.
          </p>
          <a routerLink="/trash" class="btn btn--secondary btn--sm">View trash</a>
        </section>

        <!-- Change password -->
        <section class="card">
          <h2 style="margin-bottom:1rem">Change password</h2>
          <div class="password-form">
            <div class="field-group">
              <label class="field-label" for="currentPw">Current password</label>
              <input id="currentPw" type="password" class="new-tag-input"
                [(ngModel)]="currentPassword"
                name="currentPw"
                autocomplete="current-password"
                placeholder="Current password" />
            </div>
            <div class="field-group">
              <label class="field-label" for="newPw">New password</label>
              <input id="newPw" type="password" class="new-tag-input"
                [(ngModel)]="newPassword"
                name="newPw"
                autocomplete="new-password"
                placeholder="At least 8 characters" />
            </div>
            <div class="field-group">
              <label class="field-label" for="confirmPw">Confirm new password</label>
              <input id="confirmPw" type="password" class="new-tag-input"
                [(ngModel)]="confirmPassword"
                name="confirmPw"
                autocomplete="new-password"
                placeholder="Repeat new password" />
            </div>
            <p class="pw-error" *ngIf="passwordError()">{{ passwordError() }}</p>
            <p class="pw-success" *ngIf="passwordSuccess()">{{ passwordSuccess() }}</p>
            <button
              class="btn btn--primary btn--sm"
              (click)="changePassword()"
              [disabled]="changingPassword() || !currentPassword || !newPassword || !confirmPassword">
              {{ changingPassword() ? 'Saving…' : 'Update password' }}
            </button>
          </div>
        </section>

        <!-- Delete account -->
        <section class="card card--danger">
          <h2 style="margin-bottom:.375rem">Delete account</h2>
          <p class="text-muted text-sm" style="margin-bottom:1.25rem">
            Permanently delete your account and all data — entries, journals, tags, images, reminders,
            and preferences. This cannot be undone.
            @if (user()?.tier === 'Paid') {
              Your active subscription will also be cancelled immediately.
            }
          </p>

          @if (!deleteStep()) {
            <button class="btn btn--danger btn--sm" (click)="startDelete()">
              Delete my account…
            </button>
          }

          @if (deleteStep() === 'confirm') {
            <div class="delete-confirm">
              <p class="text-sm" style="margin-bottom:.875rem">
                Enter your password to confirm. <strong>All your data will be permanently erased.</strong>
              </p>
              <div class="field-group" style="margin-bottom:.875rem">
                <label class="field-label" for="deletePw">Your password</label>
                <input id="deletePw" type="password" class="new-tag-input"
                  [(ngModel)]="deletePassword"
                  placeholder="Enter your password"
                  autocomplete="current-password" />
              </div>
              @if (deleteError()) {
                <p class="pw-error" style="margin-bottom:.625rem">{{ deleteError() }}</p>
              }
              <div style="display:flex;gap:.625rem;flex-wrap:wrap">
                <button class="btn btn--danger btn--sm"
                  [disabled]="!deletePassword || deleting()"
                  (click)="confirmDelete()">
                  {{ deleting() ? 'Deleting…' : 'Yes, permanently delete everything' }}
                </button>
                <button class="btn btn--ghost btn--sm" [disabled]="deleting()" (click)="cancelDelete()">
                  Cancel
                </button>
              </div>
            </div>
          }
        </section>

        <!-- Help & Support -->
        <section class="card support-card">
          <div class="support-card__inner">
            <div class="support-card__text">
              <p class="support-card__title">Help &amp; Support</p>
              <p class="support-card__sub">Browse FAQs or get in touch with our team.</p>
            </div>
            <a routerLink="/support" class="btn btn--ghost btn--sm">Get Support →</a>
          </div>
        </section>

      </main>

      <!-- Sign out — outside *ngIf so it's always visible -->
      <div class="signout-bar">
        <div class="signout-card">
          <div class="signout-card__left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>Sign out of Creator Companion</span>
          </div>
          <button class="btn btn--secondary btn--sm" (click)="logout()">Sign out</button>
        </div>
      </div>

      </div><!-- /content-col -->
    </div>
  `,
  styles: [`
    /* ── Page shell ─────────────────────────────────────────────── */
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    @media (min-width: 768px) { .page { flex-direction: row; } }

    /* ── Mobile top bar ──────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 100;
      background: #111318;
      border-bottom: 1px solid rgba(255,255,255,.07);
      height: 52px;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 1.125rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; }
    .topbar__brand-icon { height: 24px; width: auto; display: block; }
    .topbar__brand-name { font-family: 'Fraunces', Georgia, serif; font-size: .9375rem; font-weight: 700; color: #fff; }

    /* Column that holds main + sign-out as siblings, stays in page flex row */
    .content-col {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column;
    }

    .main-content {
      flex: 1; min-width: 0;
      padding-top: 1.5rem;
      padding-bottom: 1rem;
    }
    @media (min-width: 768px) {
      .main-content { padding-bottom: 2rem; }
    }

    /* ── Sign out bar (always visible, outside *ngIf) ────────────── */
    .signout-bar {
      padding: 0 1.125rem calc(88px + env(safe-area-inset-bottom, 0px));
    }
    @media (min-width: 768px) {
      .signout-bar { padding: 0 0 3rem; }
    }
    .signout-card {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.25rem;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
    }
    .signout-card__left {
      display: flex; align-items: center; gap: .625rem;
      color: var(--color-text); font-size: .9375rem; font-weight: 500;
      svg { color: var(--color-text-3); flex-shrink: 0; }
    }
    .support-card__inner {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
    }
    .support-card__title {
      font-size: .9375rem; font-weight: 600; color: var(--color-text); margin: 0 0 .2rem;
    }
    .support-card__sub {
      font-size: .8125rem; color: var(--color-text-2); margin: 0;
    }
    .section-head {
      display:flex; align-items:center; justify-content:space-between;
      margin-bottom:1rem;
    }
    .tier-badge {
      font-size:.8125rem; font-weight:600; padding:.25rem .75rem;
      border-radius:100px; background:var(--color-surface-2);
      color:var(--color-text-2); border:1px solid var(--color-border);
    }
    .tier-badge--paid {
      background:var(--color-accent-light); color:var(--color-accent);
      border-color:var(--color-accent);
    }
    .caps-grid { display:flex; flex-direction:column; gap:.625rem; }
    .cap-row, .profile-row {
      display:flex; align-items:center; justify-content:space-between;
      font-size:.9375rem; padding:.5rem 0;
      border-bottom:1px solid var(--color-border-light);
      &:last-child { border-bottom:none; }
    }
    .cap-label { color:var(--color-text); }
    .cap-row--full { flex-wrap: wrap; gap: .5rem; }

    .pause-usage {
      flex: 1; min-width: 160px;
      position: relative; height: 28px;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: 100px; overflow: hidden;
      display: flex; align-items: center;
    }
    .pause-usage__bar {
      position: absolute; left: 0; top: 0; bottom: 0;
      background: var(--color-accent-light);
      border-radius: 100px;
      transition: width .4s ease;
      min-width: 0; max-width: 100%;
    }
    .pause-usage__label {
      position: relative; z-index: 1;
      font-size: .75rem; font-weight: 500;
      color: var(--color-text-2);
      padding: 0 .875rem;
      white-space: nowrap;
    }
    .profile-rows { display:flex; flex-direction:column; }
    .export-actions { display:flex; gap:.75rem; flex-wrap:wrap; }

    .password-form { display:flex; flex-direction:column; gap:.875rem; }
    .field-group { display:flex; flex-direction:column; gap:.3rem; }
    .field-label { font-size:.8125rem; font-weight:500; color:var(--color-text); }
    .pw-error { font-size:.875rem; color:var(--color-danger, #dc2626); margin:0; }
    .pw-success { font-size:.875rem; color:#166534; margin:0; }

    /* Notifications link card */
    .notif-link-card {
      cursor: pointer;
      transition: border-color .15s, box-shadow .15s;
      &:hover { border-color: var(--color-accent); box-shadow: var(--shadow-md); }
    }
    .notif-link-inner {
      display: flex; align-items: center; gap: .875rem;
      svg:first-child { color: var(--color-accent); flex-shrink: 0; }
    }
    .notif-link-title { font-size: .9375rem; font-weight: 600; margin: 0 0 .1rem; }
    .notif-link-sub { font-size: .8125rem; color: var(--color-text); margin: 0; }
    .notif-link-chevron { margin-left: auto; color: var(--color-text-3); flex-shrink: 0; }

    /* Preferences */
    .pref-row {
      display:flex; align-items:flex-start; justify-content:space-between;
      gap:1rem;
    }
    .pref-info { flex:1; }
    .pref-label { font-size:.9375rem; font-weight:600; margin:0 0 .2rem; }

    /* Reminders */
    .push-note { margin-bottom:.75rem; }
    .push-prompt { display:flex; flex-direction:column; gap:.5rem; margin-bottom:.5rem; }
    .push-active {
      display:flex; align-items:center; gap:.625rem; margin-bottom:.5rem;
    }
    .push-dot {
      width:8px; height:8px; border-radius:50%;
      background:#22c55e; flex-shrink:0;
    }
    .reminders-divider { margin:.875rem 0; border-top:1px solid var(--color-border-light); }
    .reminder-free-row {
      display:flex; align-items:center; justify-content:space-between;
      gap:1rem; margin-bottom:.625rem;
    }
    .reminder-free-info { flex:1; }
    .reminder-time-label { font-size:.9375rem; font-weight:600; margin:0 0 .2rem; }
    .upgrade-note { margin-top:.5rem; }
    .reminders-list { display:flex; flex-direction:column; gap:.75rem; }
    .reminder-card {
      border:1px solid var(--color-border); border-radius:var(--radius-md);
      padding:.875rem 1rem; display:flex; flex-direction:column; gap:.75rem;
    }
    .reminder-card--default {
      border-color:var(--color-accent); background:var(--color-accent-light);
    }
    .reminder-card__header {
      display:flex; align-items:center; gap:.75rem; flex-wrap:wrap;
    }
    .default-badge {
      font-size:.75rem; font-weight:600; padding:.2rem .6rem;
      border-radius:100px; background:var(--color-accent);
      color:#fff; flex-shrink:0;
    }
    .reminders-section-label {
      font-size:.8125rem; font-weight:600; color:var(--color-text-2);
      text-transform:uppercase; letter-spacing:.04em;
      margin-top:.875rem; margin-bottom:.375rem;
    }
    .reminder-card__fields {
      display:grid; grid-template-columns:120px 1fr; gap:.625rem; align-items:end;
    }
    @media (max-width:500px) { .reminder-card__fields { grid-template-columns:1fr; } }
    .reminder-msg-group { }
    .time-input {
      width:100%; padding:.4rem .6rem; font-size:.875rem;
      border:1.5px solid var(--color-border); border-radius:var(--radius-md);
      background:var(--color-surface); color:var(--color-text);
      font-family:var(--font-sans); box-sizing:border-box;
      &:focus { outline:none; border-color:var(--color-accent); }
    }
    .reminder-card__actions {
      display:flex; align-items:center; gap:.625rem;
    }
    .optional { font-weight:400; color:var(--color-text-3); }

    /* Toggle switch */
    .toggle-switch { position:relative; display:inline-flex; align-items:center; cursor:pointer; }
    .toggle-switch input { opacity:0; width:0; height:0; position:absolute; }
    .toggle-track {
      width:40px; height:22px; background:var(--color-border);
      border-radius:100px; position:relative; transition:background .2s;
      flex-shrink:0;
    }
    .toggle-switch input:checked + .toggle-track { background:var(--color-accent); }
    .toggle-thumb {
      position:absolute; top:3px; left:3px;
      width:16px; height:16px; border-radius:50%;
      background:#fff; transition:transform .2s;
      box-shadow:0 1px 3px rgba(0,0,0,.2);
    }
    .toggle-switch input:checked + .toggle-track .toggle-thumb { transform:translateX(18px); }
    .toggle-switch input:disabled + .toggle-track { opacity:.5; cursor:not-allowed; }

    /* ── Make all body text black ────────────────────────────────── */
    .main-content, .signout-bar {
      ::ng-deep .text-muted, .text-muted { color: var(--color-text); }
    }
    .pause-usage__label { color: var(--color-text); }
    .reminder-time-label { color: var(--color-text); }
    .pref-label { color: var(--color-text); }

    /* Tags */
    .tag-count-badge {
      font-size:.8125rem; font-weight:600; padding:.2rem .6rem;
      border-radius:100px; background:var(--color-accent-light);
      color:var(--color-accent-dark); border:1px solid var(--color-accent);
    }
    .new-tag-form {
      display:flex; gap:.625rem; margin-bottom:1rem;
    }
    .new-tag-input {
      flex:1; border:1.5px solid var(--color-border); border-radius:var(--radius-md);
      padding:.4rem .75rem; font-size:.9375rem; font-family:var(--font-sans);
      outline:none; background:var(--color-surface); color:var(--color-text);
      transition:border-color .15s;
      &:focus { border-color:var(--color-accent); }
      &::placeholder { color:var(--color-text-3); }
    }
    .empty-tags-note {
      font-size:.875rem; color:var(--color-text-3);
      padding:.25rem 0 .75rem;
    }
    .tag-list { display:flex; flex-direction:column; gap:0; }
    .tag-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: .75rem; padding: .625rem 0;
      border-bottom: 1px solid var(--color-border-light);
      &:last-child { border-bottom: none; }
    }
    .tag-row__info {
      display: flex; align-items: baseline; gap: .5rem;
      flex: 1; min-width: 0;
    }
    .tag-row__chip {
      font-size: .9375rem; font-weight: 600; color: var(--color-accent-dark);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tag-row__count {
      font-size: .8125rem; color: var(--color-text-3); white-space: nowrap; flex-shrink: 0;
    }
    .tag-row__actions { display: flex; gap: .375rem; flex-shrink: 0; }

    /* Compact text-button actions */
    .tag-action-btn {
      background: none; border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font-size: .8125rem; font-weight: 500; font-family: var(--font-sans);
      padding: .25rem .6rem; cursor: pointer;
      color: var(--color-text-2);
      transition: background .12s, color .12s, border-color .12s;
      &:hover { background: var(--color-surface-2); color: var(--color-text); }
      &:disabled { opacity: .4; cursor: default; }
    }
    .tag-action-btn--edit {
      color: var(--color-accent-dark); border-color: var(--color-accent);
      &:hover { background: var(--color-accent-light); }
    }
    .tag-action-btn--delete {
      color: #dc2626; border-color: #fca5a5;
      &:hover { background: #fee2e2; border-color: #dc2626; }
    }
    .tag-action-btn--save {
      color: #fff; background: var(--color-accent); border-color: var(--color-accent);
      &:hover { background: var(--color-accent-dark); border-color: var(--color-accent-dark); }
    }

    .tag-rename-input {
      flex: 1; border: 1.5px solid var(--color-accent); border-radius: var(--radius-md);
      padding: .375rem .625rem; font-size: .9375rem; font-family: var(--font-sans);
      outline: none; background: var(--color-surface); color: var(--color-text);
    }

    /* Danger zone */
    .card--danger {
      border-color: var(--color-danger, #dc2626);
      background: #fff5f5;
    }
    .delete-confirm { display:flex; flex-direction:column; }
  `]
})

export class AccountComponent implements OnInit {
  private api      = inject(ApiService);
  private auth     = inject(AuthService);
  private exporter = inject(ExportService);
  private push     = inject(PushService);

  readonly defaultReminderMessage = DEFAULT_REMINDER_MESSAGE;

  user      = this.auth.user;
  caps      = signal<Capabilities | null>(null);
  streak    = signal<StreakStats | null>(null);
  exporting = signal(false);
  upgrading    = signal<'monthly' | 'annual' | null>(null);
  upgradeError = signal('');
  portalLoading = signal(false);
  portalError   = signal('');

  // Password change
  currentPassword  = '';
  newPassword      = '';
  confirmPassword  = '';
  changingPassword = signal(false);
  passwordError    = signal('');
  passwordSuccess  = signal('');

  // Tag management
  tags         = signal<Tag[]>([]);
  tagsLoading  = signal(true);
  tagError     = signal('');
  editingTagId = signal<string | null>(null);
  renameValue  = '';
  newTagValue  = '';
  creatingTag  = signal(false);

  // Reminders
  reminders       = signal<Reminder[]>([]);
  remindersLoading = signal(true);
  reminderWorking = signal(false);
  reminderError   = signal('');
  drafts: Record<string, { time: string; message: string }> = {};

  defaultReminder = computed(() => this.reminders().find(r => r.isDefault) ?? null);
  customReminders = computed(() => this.reminders().filter(r => !r.isDefault));

  // Motivation preference
  showMotivation       = signal(true);
  motivationPrefWorking = signal(false);

  // Action items preference
  showActionItems       = signal(true);
  actionItemsPrefWorking = signal(false);

  // Push
  pushSupported = signal(false);
  pushEnabled   = signal(false);
  pushWorking   = signal(false);
  pushDenied    = signal(false);

  // Account deletion
  deleteStep    = signal<null | 'confirm'>(null);
  deletePassword = '';
  deleting      = signal(false);
  deleteError   = signal('');

  ngOnInit(): void {
    this.auth.loadCapabilities().subscribe(c => this.caps.set(c));
    this.api.getStreak().subscribe({ next: s => this.streak.set(s), error: () => {} });
    this.api.getMe().subscribe(u => {
      this.auth.setUser(u);
      this.showMotivation.set(u.showMotivation ?? true);
      this.showActionItems.set(u.showActionItems ?? true);
    });
    this.loadTags();
    this.loadReminders();
    this.initPushState();
  }

  upgrade(plan: 'monthly' | 'annual'): void {
    this.upgrading.set(plan);
    this.upgradeError.set('');
    this.api.getStripeConfig().subscribe({
      next: cfg => {
        const priceId = plan === 'monthly' ? cfg.monthlyPriceId : cfg.annualPriceId;
        this.api.createCheckoutSession(priceId).subscribe({
          next: res => { window.location.href = res.url; },
          error: err => {
            this.upgradeError.set(err?.error?.error ?? 'Could not start checkout. Please try again.');
            this.upgrading.set(null);
          }
        });
      },
      error: () => {
        this.upgradeError.set('Could not load billing config. Please try again.');
        this.upgrading.set(null);
      }
    });
  }

  openBillingPortal(): void {
    this.portalLoading.set(true);
    this.portalError.set('');
    this.api.createPortalSession().subscribe({
      next: res => { window.location.href = res.url; },
      error: err => {
        this.portalLoading.set(false);
        this.portalError.set('Could not open billing portal. If you subscribed recently, please try again in a moment or contact support.');
      }
    });
  }

  toggleMotivation(): void {
    this.motivationPrefWorking.set(true);
    const newVal = !this.showMotivation();
    this.api.updateMotivationPreference(newVal).subscribe({
      next: res => {
        this.showMotivation.set(res.showMotivation);
        this.motivationPrefWorking.set(false);
      },
      error: () => this.motivationPrefWorking.set(false)
    });
  }

  toggleActionItems(): void {
    this.actionItemsPrefWorking.set(true);
    const newVal = !this.showActionItems();
    this.api.updateActionItemsPreference(newVal).subscribe({
      next: res => {
        this.showActionItems.set(res.showActionItems);
        this.actionItemsPrefWorking.set(false);
      },
      error: () => this.actionItemsPrefWorking.set(false)
    });
  }

  private async initPushState(): Promise<void> {
    this.pushSupported.set(this.push.isSupported);
    if (this.push.isSupported) {
      const subscribed = await this.push.isSubscribed();
      this.pushEnabled.set(subscribed);
      if (subscribed) {
        // Re-sync to server on every load — keeps the server in sync if the
        // subscription was ever saved to the browser but not the server.
        this.push.syncToServer();
      }
    }
  }

  async enablePush(): Promise<void> {
    this.pushWorking.set(true);
    this.pushDenied.set(false);
    const granted = await this.push.subscribe();
    if (!granted && Notification.permission === 'denied') {
      this.pushDenied.set(true);
    }
    this.pushEnabled.set(await this.push.isSubscribed());
    this.pushWorking.set(false);
  }

  async disablePush(): Promise<void> {
    this.pushWorking.set(true);
    await this.push.unsubscribe();
    this.pushEnabled.set(false);
    this.pushWorking.set(false);
  }

  private loadReminders(): void {
    this.remindersLoading.set(true);
    this.api.getReminders().subscribe({
      next: list => {
        this.reminders.set(list);
        this.drafts = {};
        this.remindersLoading.set(false);
      },
      error: () => this.remindersLoading.set(false)
    });
  }

  draftChange(id: string, field: 'time' | 'message', value: string): void {
    const r = this.reminders().find(x => x.id === id)!;
    if (!this.drafts[id]) {
      // r.message is null when the default message is in use
      this.drafts[id] = { time: r.time, message: r.message ?? '' };
    }
    this.drafts[id][field] = value;
  }

  hasDraftChanges(r: Reminder): boolean {
    const d = this.drafts[r.id];
    if (!d) return false;
    // r.message is null when using the default text; compare against empty string for display
    const currentMsg = r.message ?? '';
    return d.time !== r.time || d.message !== currentMsg;
  }

  saveReminder(r: Reminder): void {
    const d = this.drafts[r.id];
    if (!d) return;
    this.reminderError.set('');
    this.reminderWorking.set(true);
    // Send null/undefined if message matches the default so backend stores null
    const msg = (d.message && d.message.trim() !== DEFAULT_REMINDER_MESSAGE) ? d.message.trim() : undefined;
    this.api.updateReminder(r.id, d.time, msg, r.isEnabled).subscribe({
      next: updated => {
        this.reminders.update(list => list.map(x => x.id === r.id ? updated : x));
        delete this.drafts[r.id];
        this.reminderWorking.set(false);
      },
      error: err => {
        this.reminderError.set(err?.error?.error ?? 'Could not save reminder.');
        this.reminderWorking.set(false);
      }
    });
  }

  toggleReminder(r: Reminder): void {
    this.reminderWorking.set(true);
    this.api.updateReminder(r.id, r.time, r.message ?? undefined, !r.isEnabled).subscribe({
      next: () => {
        // Reload all reminders — toggling a custom reminder may auto-sync the default
        this.loadReminders();
        this.reminderWorking.set(false);
      },
      error: () => this.reminderWorking.set(false)
    });
  }

  addReminder(): void {
    this.reminderWorking.set(true);
    this.reminderError.set('');
    const isFirst = this.customReminders().length === 0;
    this.api.createReminder('12:00').subscribe({
      next: () => {
        // Reload all reminders so the auto-disabled default is reflected
        this.loadReminders();
        this.reminderWorking.set(false);
      },
      error: err => {
        this.reminderError.set(err?.error?.error ?? 'Could not add reminder.');
        this.reminderWorking.set(false);
      }
    });
  }

  deleteReminder(r: Reminder): void {
    if (!confirm('Delete this reminder?')) return;
    this.reminderWorking.set(true);
    this.api.deleteReminder(r.id).subscribe({
      next: () => {
        delete this.drafts[r.id];
        // Reload so the default reminder re-enables itself if this was the last custom one
        this.loadReminders();
        this.reminderWorking.set(false);
      },
      error: err => {
        this.reminderError.set(err?.error?.error ?? 'Could not delete reminder.');
        this.reminderWorking.set(false);
      }
    });
  }

  private loadTags(): void {
    this.tagsLoading.set(true);
    this.api.getTags().subscribe({
      next: tags => { this.tags.set(tags); this.tagsLoading.set(false); },
      error: () => this.tagsLoading.set(false)
    });
  }

  submitNewTag(): void {
    const name = this.newTagValue.trim();
    if (!name) return;
    this.creatingTag.set(true);
    this.tagError.set('');
    this.api.createTag(name).subscribe({
      next: tag => {
        // Insert alphabetically
        const updated = [...this.tags(), tag].sort((a, b) => a.name.localeCompare(b.name));
        this.tags.set(updated);
        this.newTagValue = '';
        this.creatingTag.set(false);
      },
      error: err => {
        this.tagError.set(err?.error?.error ?? 'Could not create tag.');
        this.creatingTag.set(false);
      }
    });
  }

  startRename(tag: Tag): void {
    this.editingTagId.set(tag.id);
    this.renameValue = tag.name;
    this.tagError.set('');
  }

  cancelRename(): void {
    this.editingTagId.set(null);
    this.renameValue = '';
  }

  submitRename(tag: Tag): void {
    if (!this.renameValue.trim()) return;
    this.api.renameTag(tag.id, this.renameValue).subscribe({
      next: updated => {
        this.tags.update(list => list.map(t => t.id === tag.id ? { ...t, name: updated.name } : t));
        this.cancelRename();
      },
      error: err => {
        this.tagError.set(err?.error?.error ?? 'Could not rename tag.');
      }
    });
  }

  confirmDeleteTag(tag: Tag): void {
    if (!confirm(`Delete tag "#${tag.name}"? It will be removed from all ${tag.usageCount} entr${tag.usageCount === 1 ? 'y' : 'ies'}.`)) return;
    this.api.deleteTag(tag.id).subscribe({
      next: () => this.tags.update(list => list.filter(t => t.id !== tag.id)),
      error: err => this.tagError.set(err?.error?.error ?? 'Could not delete tag.')
    });
  }

  changePassword(): void {
    this.passwordError.set('');
    this.passwordSuccess.set('');

    if (this.newPassword.length < 8) {
      this.passwordError.set('New password must be at least 8 characters.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError.set('Passwords do not match.');
      return;
    }

    this.changingPassword.set(true);
    this.api.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.changingPassword.set(false);
        this.passwordSuccess.set('Password updated successfully.');
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
      },
      error: err => {
        this.changingPassword.set(false);
        this.passwordError.set(err?.error?.error ?? 'Could not update password. Please try again.');
      }
    });
  }

  exportJson(): void {
    this.exporting.set(true);
    this.exporter.exportJson();
    setTimeout(() => this.exporting.set(false), 2000);
  }

  exportText(): void {
    this.exporting.set(true);
    this.exporter.exportText();
    setTimeout(() => this.exporting.set(false), 2000);
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-US', { dateStyle: 'medium' });
  }

  logout(): void {
    this.auth.logout();
  }

  startDelete(): void {
    this.deleteStep.set('confirm');
    this.deletePassword = '';
    this.deleteError.set('');
  }

  cancelDelete(): void {
    this.deleteStep.set(null);
    this.deletePassword = '';
    this.deleteError.set('');
  }

  confirmDelete(): void {
    if (!this.deletePassword) return;
    this.deleting.set(true);
    this.deleteError.set('');
    this.api.deleteAccount(this.deletePassword).subscribe({
      next: () => {
        // Auth service clears state and navigates to login
        this.auth.logout();
      },
      error: err => {
        this.deleting.set(false);
        this.deleteError.set(err?.error?.error ?? 'Could not delete account. Please try again.');
      }
    });
  }
}
