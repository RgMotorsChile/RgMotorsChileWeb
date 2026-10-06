/**
 * Validador y formateador de RUT chileno.
 */
export function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatRut(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return clean;

  const dv = clean.slice(-1);
  const body = clean.slice(0, -1);

  let formattedBody = "";
  for (let i = body.length - 1, j = 1; i >= 0; i--, j++) {
    formattedBody = body[i] + formattedBody;
    if (j % 3 === 0 && i !== 0) {
      formattedBody = "." + formattedBody;
    }
  }

  return `${formattedBody}-${dv}`;
}

export function validateRut(rut: string): boolean {
  const clean = cleanRut(rut);
  if (clean.length < 7 || clean.length > 9) return false;

  const dv = clean.slice(-1);
  const body = clean.slice(0, -1);

  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const expectedDvNumber = 11 - (sum % 11);
  let expectedDv = "0";
  if (expectedDvNumber === 11) expectedDv = "0";
  else if (expectedDvNumber === 10) expectedDv = "K";
  else expectedDv = expectedDvNumber.toString();

  return dv === expectedDv;
}
