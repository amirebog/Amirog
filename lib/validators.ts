import validator from "validator";

export function validateEmail(email: string): boolean {
  return validator.isEmail(email, {
    allow_display_name: false,
    require_tld: true,
    allow_underscores: true,
  });
}

export function sanitizeEmail(email: string): string {
  return (
    validator.normalizeEmail(email, {
      all_lowercase: true,
      gmail_remove_dots: true,
      gmail_remove_subaddress: true,
      outlookdotcom_remove_subaddress: true,
      yahoo_remove_subaddress: true,
      icloud_remove_subaddress: true,
    }) || email
  );
}