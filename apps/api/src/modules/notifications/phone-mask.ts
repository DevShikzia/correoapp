const VISIBLE_PREFIX_LENGTH = 4;
const VISIBLE_SUFFIX_LENGTH = 4;
const MASK = '••••';
const FULLY_HIDDEN = '••••••';

/**
 * Oculta el centro del teléfono para que el listado de avisos sirva para
 * diagnosticar sin exponer el contacto completo.
 */
export function maskPhone(phone: string): string {
  if (phone.length <= VISIBLE_PREFIX_LENGTH + VISIBLE_SUFFIX_LENGTH) {
    return FULLY_HIDDEN;
  }

  return `${phone.slice(0, VISIBLE_PREFIX_LENGTH)}${MASK}${phone.slice(-VISIBLE_SUFFIX_LENGTH)}`;
}
