export const MICROSOFT_ORGANIZATIONS_AUTHORITY = "https://login.microsoftonline.com/organizations";

export function microsoftAuthority(value: string | undefined) {
  const authority = (value || MICROSOFT_ORGANIZATIONS_AUTHORITY).replace(/\/+$/, "");
  if (authority !== MICROSOFT_ORGANIZATIONS_AUTHORITY) {
    throw new Error(`MICROSOFT_AUTHORITY must be ${MICROSOFT_ORGANIZATIONS_AUTHORITY}`);
  }
  return authority;
}
