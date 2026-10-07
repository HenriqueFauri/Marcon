// TLS do banco com verificação do certificado. A senha do postgres trafega nessa conexão,
// então aceitar qualquer certificado (rejectUnauthorized: false) deixaria um intermediário capturá-la.
// O Supabase usa uma CA própria: baixe o certificado em Project Settings > Database > SSL Configuration
// ("Download certificate") e salve em supabase/prod-ca.crt, ou aponte SUPABASE_CA_CERT no .env.local.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function sslDoBanco(raiz, env) {
  const caminho = env.SUPABASE_CA_CERT || path.join(raiz, "..", "supabase", "prod-ca.crt");
  if (!existsSync(caminho)) {
    console.error(
      `Falta o certificado do banco em ${caminho}.\n` +
        "Baixe em Project Settings > Database > SSL Configuration (Supabase) e salve nesse caminho,\n" +
        "ou aponte SUPABASE_CA_CERT no .env.local. A conexão não é feita sem verificar o certificado.",
    );
    process.exit(1);
  }
  return { rejectUnauthorized: true, ca: readFileSync(caminho, "utf8") };
}
