#!/bin/bash
# build-env.sh
# Vercel ejecuta este script en build time.
# Lee las variables de entorno de Vercel y genera env.js con los valores reales.
# Las variables se configuran en: Vercel Dashboard → Settings → Environment Variables

cat > env.js <<EOF
// Generado automáticamente por Vercel — NO editar manualmente
window.__ENV__ = {
  FIREBASE_API_KEY:             "${FIREBASE_API_KEY}",
  FIREBASE_AUTH_DOMAIN:         "${FIREBASE_AUTH_DOMAIN}",
  FIREBASE_PROJECT_ID:          "${FIREBASE_PROJECT_ID}",
  FIREBASE_STORAGE_BUCKET:      "${FIREBASE_STORAGE_BUCKET}",
  FIREBASE_MESSAGING_SENDER_ID: "${FIREBASE_MESSAGING_SENDER_ID}",
  FIREBASE_APP_ID:              "${FIREBASE_APP_ID}",
  FIREBASE_MEASUREMENT_ID:      "${FIREBASE_MEASUREMENT_ID}",
};
EOF

echo "✅ env.js generado correctamente"
