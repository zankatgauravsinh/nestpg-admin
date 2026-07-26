import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function phoneValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const raw: string = control.value.toString().replace(/\D/g, '');
  const valid = raw.length === 10 || (raw.startsWith('91') && raw.length === 12);
  return valid ? null : { phone: 'Enter a valid 10-digit Indian mobile number' };
}

export function pinCodeValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const valid = /^\d{6}$/.test(control.value.toString());
  return valid ? null : { pinCode: 'Enter a valid 6-digit PIN code' };
}

export function gstinValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const valid = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[Z]{1}[A-Z\d]{1}$/.test(
    control.value.toString().toUpperCase(),
  );
  return valid ? null : { gstin: 'Enter a valid GSTIN' };
}

export function futureDateValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const selected = new Date(control.value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return selected >= today ? null : { futureDate: 'Date must be today or in the future' };
}

export function dateRangeValidator(startKey: string, endKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const start = group.get(startKey)?.value;
    const end = group.get(endKey)?.value;
    if (!start || !end) return null;
    return new Date(start) < new Date(end) ? null : { dateRange: 'End date must be after start date' };
  };
}
