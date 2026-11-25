/** Extracts a human message from the NestPG error envelope `{ errors: [{code,message}] }`. */
export function apiErrorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const body = (e as { error?: unknown })?.error as
    | { errors?: { message?: string }[]; message?: string | string[] }
    | undefined;
  if (body?.errors?.length && body.errors[0]?.message) return humanize(body.errors[0].message!);
  if (Array.isArray(body?.message)) return body!.message[0];
  if (typeof body?.message === 'string') return body.message;
  return fallback;
}

function humanize(code: string): string {
  const map: Record<string, string> = {
    INVALID_CREDENTIALS: 'Incorrect phone or password.',
    INVALID_OTP: 'That code is incorrect or has expired.',
    OTP_EXPIRED: 'That code has expired. Request a new one.',
    OTP_RATE_LIMIT_EXCEEDED: 'Too many attempts. Try again in a few minutes.',
    USER_ALREADY_EXISTS: 'An account with this phone already exists.',
    PHONE_ALREADY_REGISTERED: 'An account with this phone already exists.',
    Unauthorized: 'Incorrect phone or password.',
    KYC_NOT_REVIEWABLE: 'This KYC is already decided or not yet submitted.',
    KYC_RECORD_NOT_FOUND: 'No KYC record found for this resident.',
    REJECTION_REASON_REQUIRED: 'A rejection reason is required.',
    TARGET_BED_NOT_AVAILABLE: 'That bed is no longer available.',
    BED_NUMBER_EXISTS_IN_ROOM: 'A bed with that number already exists in the room.',
    RECONCILIATION_ALREADY_RESOLVED: 'Someone has already resolved this case.',
    PAYMENT_ALREADY_SETTLED: 'Another capture has already settled this payment. Refund this one in Razorpay, then close the case.',
    GATEWAY_PAYMENT_NOT_CAPTURED: 'Razorpay no longer shows this money as captured, so it can’t be accepted.',
    GATEWAY_AMOUNT_CHANGED: 'Razorpay now reports a different amount from this case, so it can’t be accepted. Check the payment in Razorpay.',
    GATEWAY_RECORD_MISMATCH: 'Razorpay’s record doesn’t belong to this order, so it can’t be accepted. Check the payment in Razorpay.',
    CURRENCY_NOT_ACCEPTABLE: 'The money was captured in another currency. Refund it in Razorpay, then close the case.',
    GATEWAY_REFUND_NOT_COMPLETE: 'Razorpay doesn’t show this money as fully refunded yet, so the case can’t be closed.',
    REFUND_EXCEEDS_UNAPPLIED: 'That’s more than is still unapplied. Refresh the list: it may already have been refunded.',
    BED_DAILY_RATE_NOT_SET: 'This bed has no daily rate yet, so it can’t take a new booking. Ask the owner to set it.',
    BED_WITHOUT_DAILY_PRICE: 'Every bed needs a daily rate before this listing can be approved. Ask the owner to set the missing daily rates.',
  };
  return map[code] ?? code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
