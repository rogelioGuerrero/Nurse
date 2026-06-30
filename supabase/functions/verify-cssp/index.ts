import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CSSP_SEARCH_URL = "https://cssp.gob.sv/profesionales/faces/consulta/buscar.xhtml";

interface VerifyRequest {
  nurse_id: string;
  cssp_registration: string;
  nurse_name?: string;
  nurse_level?: string;
}

interface CSSPResult {
  found: boolean;
  name?: string;
  profession?: string;
  board?: string;
  error?: string;
  name_match?: boolean;
  profession_match?: boolean;
}

/**
 * Verifica un número de registro CSSP haciendo scraping del portal oficial.
 * Usa fetch con POST y parsea el HTML de respuesta (JSF form submission).
 * Si el sitio cambia o falla, retorna error y el sistema marca como 'pending'
 * para revisión manual, sin bloquear a la enfermera.
 */
async function verifyCSSPRegistration(registration: string): Promise<CSSPResult> {
  try {
    // Paso 1: GET para obtener el ViewState de JSF
    const getResponse = await fetch(CSSP_SEARCH_URL, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!getResponse.ok) {
      return { found: false, error: "No se pudo acceder al portal CSSP" };
    }

    const html = await getResponse.text();
    
    // Extraer cookies — Deno puede no exponer set-cookie correctamente
    const setCookie = getResponse.headers.get("set-cookie") || "";
    // Fallback: extraer JSESSIONID del HTML (JSF lo embebe en las URLs)
    const jsessionMatch = html.match(/jsessionid=([a-zA-Z0-9]+)/);
    const jsessionId = jsessionMatch ? jsessionMatch[1] : "";
    const cookies = setCookie || (jsessionId ? `JSESSIONID=${jsessionId}` : "");

    // Extraer javax.faces.ViewState del HTML
    const viewStateMatch = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/i);
    const viewState = viewStateMatch ? viewStateMatch[1] : "";

    if (!viewState) {
      return { found: false, error: "No se pudo obtener el token de sesión del CSSP" };
    }

    // Extraer el form ID — buscar frm1 específicamente
    const formIdMatch = html.match(/<form[^>]+id="(frm1)"/i);
    const formId = formIdMatch ? formIdMatch[1] : "frm1";

    // Extraer el ID del botón de búsqueda desde el onclick (PrimeFaces AJAX)
    const btnMatch = html.match(/s:&quot;(frm1:j_idt\d+)&quot;/);
    const btnId = btnMatch ? btnMatch[1] : "frm1:j_idt45";

    const formData = new URLSearchParams();
    const scrollState = "0,0";
    const emptyValue = "";
    const rppValue = "5";
    const gridValue = "grid";
    formData.append(btnId, btnId);
    formData.append(`${formId}`, `${formId}`);
    formData.append(`${formId}:nombre`, emptyValue);
    formData.append(`${formId}:apellidos`, emptyValue);
    formData.append(`${formId}:junta_focus`, emptyValue);
    formData.append(`${formId}:junta_input`, emptyValue);
    formData.append(`${formId}:profesion_focus`, emptyValue);
    formData.append(`${formId}:profesion_input`, emptyValue);
    formData.append(`${formId}:idProfesional`, registration);
    formData.append(`${formId}:profesionales_rppDD`, rppValue);
    formData.append(`${formId}:profesionales_scrollState`, scrollState);
    formData.append(`${formId}:j_idt59`, gridValue);
    formData.append("javax.faces.ViewState", viewState);
    formData.append("javax.faces.partial.ajax", "true");
    formData.append("javax.faces.source", btnId);
    formData.append("javax.faces.partial.execute", "@all");
    formData.append("javax.faces.partial.render", `${formId}:profesionales ${formId}:panelDatos`);

    // Usar URL con jsessionid para mantener la sesión JSF
    const postUrl = jsessionId 
      ? `${CSSP_SEARCH_URL};jsessionid=${jsessionId}`
      : CSSP_SEARCH_URL;

    const postResponse = await fetch(postUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cookie": cookies,
        "Accept": "application/xml, text/xml, */*; q=0.01",
        "Faces-Request": "partial/ajax",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: formData.toString(),
    });

    if (!postResponse.ok) {
      return { found: false, error: "Error al consultar el portal CSSP" };
    }

    const resultHtml = await postResponse.text();

    // PrimeFaces AJAX returns XML partial responses
    if (resultHtml.includes("No se encontraron registros") || resultHtml.includes("No se encontraron resultados")) {
      return { found: false };
    }

    // Extraer datos del profesional del XML partial response
    const cells = resultHtml.match(/role="gridcell"[^>]*>([^<]*)<\/td>/gi) || [];
    const cellValues = cells.map(c => c.replace(/role="gridcell"[^>]*>/i, "").replace(/<\/td>/i, "").trim()).filter(v => v.length > 0);
    const name = cellValues[0] || undefined;
    const lastName = cellValues[1] || undefined;
    const board = cellValues[2] || undefined;
    const profession = cellValues[4] || undefined;

    const hasResults = resultHtml.includes("Pagina 1 (1-") || 
                       (resultHtml.includes("Profesionales") && !resultHtml.includes("No se encontraron") && !resultHtml.includes("de 0 Profesionales"));

    if (hasResults || name) {
      const fullName = [name, lastName].filter(Boolean).join(" ");
      return {
        found: true,
        name: fullName || undefined,
        profession: profession,
        board: board,
      };
    }

    return { found: false, error: `Debug: len=${resultHtml.length} full=${resultHtml.replace(/\n/g, " ")}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { found: false, error: `Error de conexión con CSSP: ${message}` };
  }
}

/**
 * Genera variantes de un número CSSP para intentar búsquedas alternativas.
 * Útil cuando el usuario ingresa el número con prefijos o formatos incorrectos.
 */
function generateCsspVariants(registration: string): string[] {
  const variants: string[] = [];
  const original = registration.trim().toUpperCase();

  // 1. Original
  variants.push(original);

  // 2. Remover prefijos comunes (JVPE, CSSP, etc.)
  const withoutPrefix = original.replace(/^(JVPE|CSSP|ENF|LIC|TEC|AUX)-?/i, "");
  if (withoutPrefix !== original) {
    variants.push(withoutPrefix);
  }

  // 3. Extraer solo números (4+ dígitos)
  const numbersOnly = original.replace(/[^0-9]/g, "");
  if (numbersOnly.length >= 4 && numbersOnly !== original) {
    variants.push(numbersOnly);
  }

  // 4. Si tiene formato tipo "JVPE-TE-22811", intentar "TE-22811"
  const parts = original.split("-");
  if (parts.length >= 3) {
    // Remover primer prefijo, mantener el resto
    const withoutFirstPrefix = parts.slice(1).join("-");
    if (withoutFirstPrefix !== original) {
      variants.push(withoutFirstPrefix);
    }
  }

  // 5. Reemplazar guiones con espacios
  const withSpaces = original.replace(/-/g, " ");
  if (withSpaces !== original) {
    variants.push(withSpaces);
  }

  // 6. Remover espacios y guiones (compacto)
  const compact = original.replace(/[-\s]/g, "");
  if (compact !== original && compact.length >= 4) {
    variants.push(compact);
  }

  // Eliminar duplicados manteniendo orden
  return [...new Set(variants)];
}

/**
 * Normaliza un nombre para comparación: mayúsculas, sin acentos, sin conectores.
 */
function normalizeName(s: string): string {
  return s.toUpperCase().trim()
    .replace(/[ÁÀ]/g, "A").replace(/[ÉÈ]/g, "E").replace(/[ÍÌ]/g, "I")
    .replace(/[ÓÒ]/g, "O").replace(/[ÚÙ]/g, "U")
    .replace(/\s+(DE|DEL|LA|LAS|LOS|Y)\s+/g, " ")
    .replace(/\s+/g, " ").trim();
}

/**
 * Calcula similitud entre dos nombres (0-1).
 * Compara partes (palabras) y devuelve el porcentaje de coincidencia.
 */
function nameSimilarity(name1: string, name2: string): number {
  const parts1 = normalizeName(name1).split(" ").filter(p => p.length > 2);
  const parts2 = normalizeName(name2).split(" ").filter(p => p.length > 2);
  if (parts1.length === 0 || parts2.length === 0) return 0;
  const matched = parts1.filter(p => parts2.includes(p));
  return matched.length / Math.max(parts1.length, parts2.length);
}

/**
 * Verifica si el número CSSP ya existe en otra cuenta activa.
 * Retorna los datos de la cuenta existente si hay duplicado, o null si no.
 */
async function checkDuplicateCssp(
  supabase: ReturnType<typeof createClient>,
  csspRegistration: string,
  currentNurseId: string
): Promise<{ nurse_id: string; full_name: string; email: string } | null> {
  const { data: existing } = await supabase
    .from("nurses")
    .select("id, user_id, cssp_registration")
    .eq("cssp_registration", csspRegistration)
    .neq("id", currentNurseId);

  if (!existing || existing.length === 0) return null;

  const existingNurse = existing[0];
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", existingNurse.user_id)
    .single();

  if (!profile) return null;

  return {
    nurse_id: existingNurse.id,
    full_name: profile.full_name || "",
    email: profile.email || "",
  };
}

/**
 * Notifica al admin sobre un posible CSSP duplicado.
 */
async function notifyAdminDuplicate(
  supabase: ReturnType<typeof createClient>,
  csspRegistration: string,
  currentName: string,
  currentEmail: string,
  existingName: string,
  existingEmail: string,
  similarity: number,
  isLikelySamePerson: boolean
): Promise<void> {
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (!admins || admins.length === 0) return;

  const title = isLikelySamePerson
    ? "Cuenta duplicada detectada"
    : "Posible uso de CSSP ajeno";

  const body = isLikelySamePerson
    ? `CSSP ${csspRegistration} registrado por dos cuentas con nombres similares (${Math.round(similarity * 100)}%). Cuenta 1: ${currentName} (${currentEmail}). Cuenta 2: ${existingName} (${existingEmail}). Probablemente es la misma persona.`
    : `CSSP ${csspRegistration} registrado por dos cuentas con nombres diferentes (${Math.round(similarity * 100)}%). Cuenta 1: ${currentName} (${currentEmail}). Cuenta 2: ${existingName} (${existingEmail}). Posible fraude o suplantación.`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  for (const admin of admins) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: admin.id,
          title,
          body,
          tag: `cssp-duplicate-${csspRegistration}`,
        }),
      });
    } catch {
      // best-effort
    }
  }

  console.log(`[verify-cssp] Duplicate CSSP ${csspRegistration} | similarity: ${Math.round(similarity * 100)}% | samePerson: ${isLikelySamePerson}`);
}

/**
 * Ejecuta verifyCSSPRegistration con reintentos y variantes.
 * Si el número original no se encuentra, prueba variantes automáticamente.
 * Si hay un mismatch, reintenta hasta 3 veces para descartar falsos positivos
 * causados por errores transitorios del scraping (sesión JSF, parseo, etc).
 * Solo retorna un mismatch si todas las tentativas concuerdan en que hay discrepancia.
 */
async function verifyWithRetries(
  registration: string,
  nurseName?: string,
  nurseLevel?: string
): Promise<{ result: CSSPResult; mismatches: string[]; attempts: number; usedVariant?: string }> {
  const MAX_ATTEMPTS = 3;
  let lastResult: CSSPResult = { found: false };
  let lastMismatches: string[] = [];
  let usedVariant: string | undefined = undefined;

  // Generar variantes del número CSSP
  const variants = generateCsspVariants(registration);

  // Intentar cada variante hasta encontrar una que funcione
  for (const variant of variants) {
    let variantAttempts = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      variantAttempts++;
      const result = await verifyCSSPRegistration(variant);
      lastResult = result;

      // Si hay error de conexión, reintentar misma variante
      if (result.error) {
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 1500 * attempt));
          continue;
        }
        // Error persistente con esta variante, probar siguiente
        break;
      }

      // Si se encontró, verificar mismatches
      if (result.found) {
        if (variant !== registration) {
          usedVariant = variant;
        }

        const mismatches: string[] = [];

        if (nurseName && result.name) {
          const normalize = (s: string) => s.toUpperCase().trim()
            .replace(/[ÁÀ]/g, "A").replace(/[ÉÈ]/g, "E").replace(/[ÍÌ]/g, "I")
            .replace(/[ÓÒ]/g, "O").replace(/[ÚÙ]/g, "U")
            .replace(/\s+(DE|DEL|LA|LAS|LOS|Y)\s+/g, " ")
            .replace(/\s+/g, " ").trim();
          const csspName = normalize(result.name);
          const givenName = normalize(nurseName);
          const csspParts = csspName.split(" ").filter(p => p.length > 2);
          const givenParts = givenName.split(" ").filter(p => p.length > 2);
          const matchedParts = givenParts.filter(p => csspParts.includes(p));
          result.name_match = matchedParts.length >= Math.ceil(givenParts.length * 0.5);
          if (!result.name_match) {
            mismatches.push(`Nombre no coincide (registrado: "${nurseName}", CSSP: "${result.name}")`);
          }
        }

        if (nurseLevel && result.profession) {
          const profMap: Record<string, string[]> = {
            "Licenciada": ["LIC. EN ENFERMERIA", "LICENCIADA"],
            "Tecnóloga": ["TECNOLOGO", "TECNOLOGA"],
            "Técnica": ["TECNICO", "TECNICA"],
            "Auxiliar": ["AUXILIAR"],
          };
          const expected = profMap[nurseLevel] || [];
          const csspProfUpper = result.profession.toUpperCase();
          result.profession_match = expected.some(e => csspProfUpper.includes(e));
          if (!result.profession_match) {
            mismatches.push(`Profesión no coincide (registrada como: "${nurseLevel}", CSSP: "${result.profession}")`);
          }
        }

        // Si no hay mismatches, retornar inmediatamente (verificado)
        if (mismatches.length === 0) {
          return { result, mismatches: [], attempts: variantAttempts, usedVariant };
        }

        // Hay mismatches — si no es el último intento, reintentar misma variante
        lastMismatches = mismatches;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 1500 * attempt));
          continue;
        }

        // Todos los intentos de esta variante tienen mismatches
        return { result, mismatches: lastMismatches, attempts: variantAttempts, usedVariant };
      }

      // No se encontró con esta variante, reintentar (puede ser sesión expirada)
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }

      // Esta variante no funcionó, probar siguiente
      break;
    }
  }

  // Ninguna variante funcionó
  return { result: lastResult, mismatches: lastMismatches, attempts: MAX_ATTEMPTS, usedVariant };
}

/**
 * Envía un correo electrónico a la enfermera notificando problemas con su CSSP.
 * Llama a la Edge Function send-nurse-email.
 */
async function sendCsspEmail(
  supabase: ReturnType<typeof createClient>,
  nurseId: string,
  problemType: string,
  problemDetail: string
): Promise<void> {
  try {
    // Obtener email y nombre de la enfermera desde profiles
    const { data: nurse } = await supabase
      .from("nurses")
      .select("cssp_registration, cssp_level, user_id")
      .eq("id", nurseId)
      .single();

    if (!nurse) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", nurse.user_id)
      .single();

    if (!profile?.email) return;

    // Llamar a send-nurse-email edge function
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const response = await fetch(`${supabaseUrl}/functions/v1/send-nurse-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        nurse_name: profile.full_name,
        nurse_email: profile.email,
        cssp_registration: nurse.cssp_registration,
        cssp_level: nurse.cssp_level || "",
        problem_type: problemType,
        problem_detail: problemDetail,
      }),
    });

    if (response.ok) {
      // Registrar que se envió el primer correo
      await supabase
        .from("nurses")
        .update({
          cssp_email_count: 1,
          cssp_email_sent_at: new Date().toISOString(),
        })
        .eq("id", nurseId);
      console.log(`Correo enviado a ${profile.email} por: ${problemType}`);
    } else {
      console.error(`Error enviando correo: ${await response.text()}`);
    }
  } catch (err) {
    console.error("Error en sendCsspEmail:", err);
  }
}

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { nurse_id, cssp_registration, nurse_name, nurse_level }: VerifyRequest = await req.json();

    if (!nurse_id || !cssp_registration) {
      return new Response(
        JSON.stringify({ error: "nurse_id y cssp_registration son requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Inicializar cliente Supabase con service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Verificación de CSSP duplicado ---
    const duplicate = await checkDuplicateCssp(supabase, cssp_registration, nurse_id);
    if (duplicate) {
      const similarity = nurse_name ? nameSimilarity(nurse_name, duplicate.full_name) : 0;
      const isLikelySamePerson = similarity >= 0.6;

      // Obtener email de la cuenta actual
      const { data: currentProfile } = await supabase
        .from("profiles").select("email").eq("id", nurse_id).single();
      const currentEmail = currentProfile?.email || "";

      await notifyAdminDuplicate(
        supabase, cssp_registration,
        nurse_name || "", currentEmail,
        duplicate.full_name, duplicate.email,
        similarity, isLikelySamePerson
      );

      const now = new Date().toISOString();
      const notes = isLikelySamePerson
        ? `CSSP duplicado detectado. Cuenta existente: ${duplicate.full_name} (${duplicate.email}). Similitud ${Math.round(similarity * 100)}%. Probablemente misma persona. Requiere acción del admin.`
        : `CSSP duplicado detectado. Cuenta existente: ${duplicate.full_name} (${duplicate.email}). Similitud ${Math.round(similarity * 100)}%. Posible fraude. Requiere acción del admin.`;

      await supabase.from("nurses").update({
        cssp_verification_status: "pending",
        cssp_verified: false,
        cssp_verification_date: now,
        cssp_verification_notes: notes,
      }).eq("id", nurse_id);

      return new Response(
        JSON.stringify({
          status: "pending",
          message: isLikelySamePerson
            ? "Este CSSP ya está registrado con otra cuenta tuya. Un administrador revisará tu caso."
            : "Este CSSP ya está registrado por otra persona. Un administrador revisará el caso.",
          duplicate: { name: duplicate.full_name, email: duplicate.email, similarity: Math.round(similarity * 100) },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    // --- Fin verificación duplicado ---

    // Ejecutar verificación con reintentos y variantes
    const { result, mismatches, attempts, usedVariant } = await verifyWithRetries(cssp_registration, nurse_name, nurse_level);

    const now = new Date().toISOString();

    if (result.error) {
      // El sitio falló o cambió — marcar como pending para revisión manual
      await supabase
        .from("nurses")
        .update({
          cssp_verification_status: "pending",
          cssp_verified: false,
          cssp_verification_date: now,
          cssp_verification_notes: `Verificación automática falló (${attempts} intentos): ${result.error}. Requiere revisión manual.`,
        })
        .eq("id", nurse_id);

      return new Response(
        JSON.stringify({
          status: "pending",
          message: "No se pudo verificar automáticamente. Se requiere revisión manual.",
          error: result.error,
          attempts,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (result.found) {
      if (mismatches.length > 0) {
        const notes = `Verificación CSSP con discrepancias (${attempts} intentos)${usedVariant ? ` (variante usada: ${usedVariant})` : ""}: ${mismatches.join("; ")}`;
        await supabase
          .from("nurses")
          .update({
            cssp_verification_status: "pending",
            cssp_verified: false,
            cssp_verification_date: now,
            cssp_verification_notes: notes,
          })
          .eq("id", nurse_id);

        // Enviar correo inmediato a la enfermera
        await sendCsspEmail(
          supabase,
          nurse_id,
          "discrepancias en la verificación CSSP",
          `Tu número de registro CSSP fue encontrado pero hay discrepancias: ${mismatches.join("; ")}. Por favor corrige tus datos en https://biencuidar.agtisa.com`
        );

        return new Response(
          JSON.stringify({
            status: "pending",
            message: "Registro encontrado pero con discrepancias. Se envió correo a la enfermera.",
            data: result,
            mismatches,
            attempts,
            usedVariant,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const notes = `Verificado automáticamente (${attempts} intento${attempts > 1 ? "s" : ""})${usedVariant ? ` (variante usada: ${usedVariant})` : ""}. Nombre: ${result.name || "N/A"}, Profesión: ${result.profession || "N/A"}`;
      await supabase
        .from("nurses")
        .update({
          cssp_verification_status: "auto_verified",
          cssp_verified: true,
          cssp_verification_date: now,
          cssp_verification_notes: notes,
        })
        .eq("id", nurse_id);

      // Si se usó una variante diferente, enviar correo para que actualice su número
      if (usedVariant && usedVariant !== cssp_registration) {
        await sendCsspEmail(
          supabase,
          nurse_id,
          "actualización de número CSSP recomendada",
          `Tu registro CSSP fue verificado exitosamente usando el formato "${usedVariant}". Por favor actualiza tu número de registro en tu perfil a este formato correcto: ${usedVariant}. Ingresa a https://biencuidar.agtisa.com, ve a "Mi Perfil" y corrige tu número CSSP.`
        );
      }

      return new Response(
        JSON.stringify({
          status: "auto_verified",
          message: usedVariant && usedVariant !== cssp_registration
            ? `Registro CSSP verificado automáticamente usando la variante "${usedVariant}". Se envió correo para que actualices tu número.`
            : "Registro CSSP verificado automáticamente",
          data: result,
          attempts,
          usedVariant,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // No se encontró el número — marcar como unverified, NO bloquear
    await supabase
      .from("nurses")
      .update({
        cssp_verification_status: "unverified",
        cssp_verified: false,
        cssp_verification_date: now,
        cssp_verification_notes: `Número no encontrado en portal CSSP (${attempts} intentos). Requiere revisión manual.`,
      })
      .eq("id", nurse_id);

    // Enviar correo inmediato a la enfermera
    await sendCsspEmail(
      supabase,
      nurse_id,
      "número CSSP no encontrado en el portal",
      `El número ${cssp_registration} no fue encontrado en el portal del CSSP. Verifica que el número sea correcto y actualízalo en https://biencuidar.agtisa.com`
    );

    return new Response(
      JSON.stringify({
        status: "unverified",
        message: "No se encontró el número en el portal CSSP. Se envió correo a la enfermera.",
        attempts,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(
      JSON.stringify({ error: `Error interno: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
