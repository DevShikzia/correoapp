import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { staffErrorMessage } from '../../core/staff-errors';
import { StaffSessionService } from '../../core/staff-session.service';
import type { StaffUser } from '../../core/staff.models';

@Component({
  selector: 'app-staff-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './staff-login.html',
  styleUrls: ['../staff-ui.css'],
})
export class StaffLogin {
  private readonly session = inject(StaffSessionService);
  private readonly formBuilder = inject(FormBuilder);

  readonly loggedIn = output<StaffUser>();
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(32)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { username, password } = this.form.getRawValue();
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const user = await this.session.login(username, password);
      this.form.reset({ username: '', password: '' });
      this.loggedIn.emit(user);
    } catch (error) {
      this.errorMessage.set(staffErrorMessage(error, 'login'));
    } finally {
      this.loading.set(false);
    }
  }
}
