const specialCharacterPattern = /[^A-Za-z0-9]/;

export const passwordRuleText = "비밀번호는 6자리 이상, 특수기호를 1개 이상 포함해야 합니다.";

export const isValidErpPassword = (password: string) =>
  password.length >= 6 && specialCharacterPattern.test(password);

export const initialPasswordFromPhone = (phoneNumber: string) =>
  `${phoneNumber.replace(/\D/g, "").slice(-4)}!!`;
