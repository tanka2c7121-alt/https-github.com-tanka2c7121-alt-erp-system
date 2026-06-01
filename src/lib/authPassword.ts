export const supabaseAuthPassword = (password: string) =>
  password.length >= 6 ? password : password.padEnd(6, "0");
