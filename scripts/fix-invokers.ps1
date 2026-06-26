# Habilita invocación pública en Cloud Functions v2 (Cloud Run).
# Sin esto, el preflight OPTIONS falla y el navegador muestra error de CORS.
# Requiere: gcloud CLI logueado con permisos run.services.setIamPolicy o Owner.

$PROJECT = "gruasbacar"
$REGION = "us-central1"

$FUNCTIONS = @(
  "obtenerDatosIniciales",
  "iniciarEnganche",
  "registrarEventoEnganche",
  "iniciarTraslado",
  "registrarLlegadaCorralon",
  "confirmarDesenganche",
  "liberarServicioActivoSiHuerfano",
  "anularServicio",
  "crearUsuario",
  "actualizarUsuario",
  "desactivarUsuario",
  "listarUsuarios"
)

Write-Host "Proyecto: $PROJECT | Región: $REGION`n"

foreach ($fn in $FUNCTIONS) {
  Write-Host "==> $fn"

  gcloud functions add-iam-policy-binding $fn `
    --gen2 `
    --region=$REGION `
    --project=$PROJECT `
    --member="allUsers" `
    --role="roles/cloudfunctions.invoker" 2>$null

  $runName = $fn.ToLower()
  gcloud run services add-iam-policy-binding $runName `
    --region=$REGION `
    --project=$PROJECT `
    --member="allUsers" `
    --role="roles/run.invoker" 2>$null
}

Write-Host "`nListo. Probá de nuevo desde https://gruasbacar.web.app (Ctrl+Shift+R)."
Write-Host "Si algún comando falló por permisos, pedile al Owner que ejecute este script."
