export const CATALOG_AUTOMATION_DISABLED = true;

export const CATALOG_AUTOMATION_MESSAGE =
  "El catálogo solo se administra desde el panel. La sincronización automática (planilla, Drive y cron) está desactivada.";

export const CATALOG_AUTOMATION_STATUS = 409;

export function catalogAutomationDisabledBody() {
  return {
    ok: false,
    success: false,
    disabled: true,
    error: CATALOG_AUTOMATION_MESSAGE,
    message: CATALOG_AUTOMATION_MESSAGE,
  };
}
